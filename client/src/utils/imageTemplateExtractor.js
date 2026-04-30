import Tesseract from "tesseract.js";

const FIELD_PATTERNS = [
  { key: "fullName", patterns: ["student name", "full name", "name"] },
  { key: "rollNumber", patterns: ["roll no", "roll number", "roll", "reg no", "registration"] },
  { key: "department", patterns: ["department", "dept", "branch"] },
  { key: "course", patterns: ["course", "program"] },
  { key: "year", patterns: ["year", "semester", "sem"] },
  { key: "email", patterns: ["email", "mail"] },
  { key: "phone", patterns: ["phone", "mobile", "contact"] },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pixelOffset = (x, y, width) => (y * width + x) * 4;

const baseNameFromFile = (name = "") => {
  const withoutExtension = name.replace(/\.[^/.]+$/, "").trim();
  return withoutExtension || "Imported Card";
};

const imageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Invalid image file"));
    };
    image.src = objectUrl;
  });

const downscaleImage = async (file, maxWidth = 720, maxHeight = 1080) => {
  const image = await imageFromFile(file);

  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(220, Math.round(image.width * ratio));
  const height = Math.max(320, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser");

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) reject(new Error("Failed to process image"));
        else resolve(result);
      },
      "image/jpeg",
      0.9
    );
  });

  return { width, height, dataUrl, blob, imageData };
};

const findFieldKey = (text) => {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  for (const field of FIELD_PATTERNS) {
    if (field.patterns.some((pattern) => normalized.includes(pattern))) {
      return field.key;
    }
  }

  return "";
};

const defaultBase = (type, patch = {}) => ({
  id: `${type}_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
  type,
  label: patch.label || type,
  text: "",
  fieldKey: "",
  qrValueKey: "rollNumber",
  x: 20,
  y: 20,
  width: 120,
  height: 24,
  fontSize: 14,
  fontFamily: "Arial",
  fontWeight: "normal",
  align: "left",
  color: "#111827",
  backgroundColor: "transparent",
  borderRadius: 0,
  stroke: "#94a3b8",
  strokeWidth: 1,
  opacity: 1,
  shapeKind: "rect",
  curveDepth: 16,
  ...patch,
});

const toHex = (value) => value.toString(16).padStart(2, "0");
const rgbToHex = (r, g, b) => `#${toHex(clamp(Math.round(r), 0, 255))}${toHex(clamp(Math.round(g), 0, 255))}${toHex(clamp(Math.round(b), 0, 255))}`;
const colorDistance = (a, b) => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const detectDominantBorderColor = (imageData, width, height) => {
  const buckets = new Map();
  const sample = (x, y) => {
    const offset = pixelOffset(x, y, width);
    const r = imageData.data[offset];
    const g = imageData.data[offset + 1];
    const b = imageData.data[offset + 2];
    const alpha = imageData.data[offset + 3];
    if (alpha < 20) return;
    const key = `${Math.round(r / 16)}-${Math.round(g / 16)}-${Math.round(b / 16)}`;
    const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    buckets.set(key, entry);
  };

  for (let x = 0; x < width; x += 2) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 2) {
    sample(0, y);
    sample(width - 1, y);
  }

  let dominant = { count: 1, r: 255, g: 255, b: 255 };
  buckets.forEach((item) => {
    if (item.count > dominant.count) dominant = item;
  });

  return {
    r: dominant.r / dominant.count,
    g: dominant.g / dominant.count,
    b: dominant.b / dominant.count,
  };
};

const buildTextMask = (lines, width, height) => {
  const mask = new Uint8Array(width * height);
  lines.forEach((line) => {
    const bbox = line.bbox || {};
    const x0 = clamp(Math.floor(Number(bbox.x0 ?? 0)) - 2, 0, width - 1);
    const y0 = clamp(Math.floor(Number(bbox.y0 ?? 0)) - 2, 0, height - 1);
    const x1 = clamp(Math.ceil(Number(bbox.x1 ?? x0)) + 2, 0, width - 1);
    const y1 = clamp(Math.ceil(Number(bbox.y1 ?? y0)) + 2, 0, height - 1);

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        mask[y * width + x] = 1;
      }
    }
  });
  return mask;
};

const toShapeElement = ({ x, y, width, height, color, borderRadius, shapeKind = "rect", curveDepth = 16 }) =>
  defaultBase("shape", {
    label: "Design Shape",
    x,
    y,
    width,
    height,
    backgroundColor: color,
    stroke: color,
    strokeWidth: 0,
    opacity: 0.92,
    shapeKind,
    curveDepth,
    borderRadius,
  });

const detectShapeElements = ({ imageData, width, height, lines = [] }) => {
  if (!imageData?.data || !width || !height) return [];

  const totalPixels = width * height;
  const background = detectDominantBorderColor(imageData, width, height);
  const textMask = buildTextMask(lines, width, height);
  const graphicMask = new Uint8Array(totalPixels);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelOffset(x, y, width);
      const alpha = imageData.data[offset + 3];
      if (alpha < 20) continue;

      const r = imageData.data[offset];
      const g = imageData.data[offset + 1];
      const b = imageData.data[offset + 2];
      const dist = colorDistance({ r, g, b }, background);
      if (dist >= 24 && textMask[y * width + x] === 0) {
        graphicMask[y * width + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(totalPixels);
  const components = [];
  const queue = new Int32Array(totalPixels);

  for (let start = 0; start < totalPixels; start += 1) {
    if (!graphicMask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let perimeter = 0;
    let minX = width - 1;
    let minY = height - 1;
    let maxX = 0;
    let maxY = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index - x) / width;
      const offset = index * 4;

      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sumR += imageData.data[offset];
      sumG += imageData.data[offset + 1];
      sumB += imageData.data[offset + 2];

      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];

      neighbors.forEach(([nx, ny]) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          perimeter += 1;
          return;
        }
        const nextIndex = ny * width + nx;
        if (!graphicMask[nextIndex]) {
          perimeter += 1;
          return;
        }
        if (!visited[nextIndex]) {
          visited[nextIndex] = 1;
          queue[tail++] = nextIndex;
        }
      });
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const fillRatio = area / (boxWidth * boxHeight);
    const areaRatio = area / totalPixels;

    if (areaRatio < 0.004) continue;
    if (boxWidth < 20 || boxHeight < 20) continue;
    if (fillRatio < 0.2) continue;

    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
    const edgeTouch = minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2;

    let borderRadius = 8;
    const sizeMin = Math.min(boxWidth, boxHeight);
    if (circularity > 0.68) {
      borderRadius = Math.round(sizeMin / 2);
    } else if (edgeTouch && fillRatio < 0.85) {
      borderRadius = Math.round(sizeMin * 0.45);
    } else if (fillRatio < 0.58) {
      borderRadius = Math.round(sizeMin * 0.35);
    } else {
      borderRadius = Math.round(sizeMin * 0.15);
    }

    components.push({
      x: minX,
      y: minY,
      width: boxWidth,
      height: boxHeight,
      borderRadius: clamp(borderRadius, 0, 999),
      color: rgbToHex(sumR / area, sumG / area, sumB / area),
      shapeKind:
        circularity > 0.68
          ? "ellipse"
          : minY <= 1
            ? "curveTop"
            : maxY >= height - 2
              ? "curveBottom"
              : "rect",
      curveDepth: clamp(Math.round(sizeMin * 0.38), 8, 80),
      area,
    });
  }

  return components
    .sort((a, b) => b.area - a.area)
    .slice(0, 8)
    .map((shape) =>
      toShapeElement({
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        color: shape.color,
        borderRadius: shape.borderRadius,
        shapeKind: shape.shapeKind,
        curveDepth: shape.curveDepth,
      })
    );
};

const toTextElement = ({ text, x, y, width, height, fontSize, weight = "normal" }) =>
  defaultBase("text", {
    text,
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight: weight,
  });

const toFieldElement = ({ fieldKey, x, y, width, height, fontSize }) =>
  defaultBase("field", {
    fieldKey,
    x,
    y,
    width,
    height,
    fontSize,
    color: "#0f172a",
    fontWeight: "bold",
  });

const mapLineToElements = ({ line, templateWidth, templateHeight, sourceWidth, sourceHeight }) => {
  const text = String(line.text || "").replace(/\s+/g, " ").trim();
  if (!text) return [];

  const confidence = Number(line.confidence ?? line.conf ?? 0);
  if (confidence > 0 && confidence < 45) return [];

  const bbox = line.bbox || {};
  const x0 = Number(bbox.x0 ?? 0);
  const y0 = Number(bbox.y0 ?? 0);
  const x1 = Number(bbox.x1 ?? x0 + 160);
  const y1 = Number(bbox.y1 ?? y0 + 24);

  const x = clamp(Math.round((x0 / sourceWidth) * templateWidth), 8, templateWidth - 40);
  const y = clamp(Math.round((y0 / sourceHeight) * templateHeight), 8, templateHeight - 32);
  const width = clamp(Math.round(((x1 - x0) / sourceWidth) * templateWidth), 56, templateWidth - x - 8);
  const height = clamp(Math.round(((y1 - y0) / sourceHeight) * templateHeight), 18, 44);
  const fontSize = clamp(Math.round(height * 0.74), 10, 24);

  const matchedFieldKey = findFieldKey(text);
  if (!matchedFieldKey) {
    return [
      toTextElement({
        text,
        x,
        y,
        width,
        height,
        fontSize,
      }),
    ];
  }

  const labelText = text.endsWith(":") ? text : `${text.replace(/:+$/, "")}:`;
  const labelWidth = clamp(Math.round(width * 0.55), 58, 180);
  const fieldX = clamp(x + labelWidth + 6, 8, templateWidth - 92);
  const fieldWidth = clamp(Math.max(width - labelWidth - 8, 90), 90, templateWidth - fieldX - 8);

  return [
    toTextElement({
      text: labelText,
      x,
      y,
      width: labelWidth,
      height,
      fontSize,
      weight: "bold",
    }),
    toFieldElement({
      fieldKey: matchedFieldKey,
      x: fieldX,
      y,
      width: fieldWidth,
      height,
      fontSize,
    }),
  ];
};

export const buildTemplateFromImage = async ({ file, extractText = true, onProgress }) => {
  const processed = await downscaleImage(file);

  let elements = [];
  if (extractText) {
    const result = await Tesseract.recognize(processed.blob, "eng", {
      logger: (message) => {
        if (message.status === "recognizing text" && typeof onProgress === "function") {
          onProgress(Math.round((message.progress || 0) * 100));
        }
      },
    });

    const lines = Array.isArray(result?.data?.lines) ? result.data.lines : [];
    const shapes = detectShapeElements({
      imageData: processed.imageData,
      width: processed.width,
      height: processed.height,
      lines,
    });

    const textElements = lines
      .flatMap((line) =>
        mapLineToElements({
          line,
          templateWidth: processed.width,
          templateHeight: processed.height,
          sourceWidth: processed.width,
          sourceHeight: processed.height,
        })
      )
      .slice(0, 70);
    elements = [...shapes, ...textElements];
  }

  return {
    name: `${baseNameFromFile(file.name)} Template`,
    width: processed.width,
    height: processed.height,
    backgroundColor: "#ffffff",
    backgroundImage: processed.dataUrl,
    overlayColor: "#000000",
    overlayOpacity: 0,
    elements,
  };
};
