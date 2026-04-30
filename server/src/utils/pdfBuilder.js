import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const hexToRgb = (hex) => {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) {
    return rgb(1, 1, 1);
  }

  const normalized = hex.replace("#", "");
  const safeHex = normalized.length === 3
    ? normalized.split("").map((ch) => ch + ch).join("")
    : normalized;

  const r = parseInt(safeHex.substring(0, 2), 16) / 255;
  const g = parseInt(safeHex.substring(2, 4), 16) / 255;
  const b = parseInt(safeHex.substring(4, 6), 16) / 255;
  return rgb(Number.isNaN(r) ? 1 : r, Number.isNaN(g) ? 1 : g, Number.isNaN(b) ? 1 : b);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const buildCardsPdf = async (cards) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  cards.forEach((card) => {
    const page = pdfDoc.addPage([card.template.width, card.template.height]);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: hexToRgb(card.template.backgroundColor),
    });
    if ((card.template.overlayOpacity || 0) > 0) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: hexToRgb(card.template.overlayColor || "#000000"),
        opacity: clamp(Number(card.template.overlayOpacity || 0), 0, 1),
      });
    }

    card.template.elements.forEach((element) => {
      const y = height - element.y - element.height;
      const elementOpacity = clamp(Number(element.opacity ?? 1), 0, 1);
      if (element.type === "shape") {
        const shapeKind = element.shapeKind || "rect";
        const isCircleLike =
          shapeKind === "ellipse" ||
          (element.borderRadius || 0) >= Math.min(element.width, element.height) * 0.45;

        if (isCircleLike) {
          page.drawEllipse({
            x: element.x + element.width / 2,
            y: y + element.height / 2,
            xScale: element.width / 2,
            yScale: element.height / 2,
            color:
              element.backgroundColor && element.backgroundColor !== "transparent"
                ? hexToRgb(element.backgroundColor)
                : undefined,
            borderColor:
              (element.strokeWidth || 0) > 0 ? hexToRgb(element.stroke || "#9ca3af") : undefined,
            borderWidth: element.strokeWidth || 0,
            opacity: elementOpacity,
          });
        } else {
          page.drawRectangle({
            x: element.x,
            y,
            width: element.width,
            height: element.height,
            color:
              element.backgroundColor && element.backgroundColor !== "transparent"
                ? hexToRgb(element.backgroundColor)
                : undefined,
            borderColor:
              (element.strokeWidth || 0) > 0 ? hexToRgb(element.stroke || "#9ca3af") : undefined,
            borderWidth: element.strokeWidth || 0,
            opacity: elementOpacity,
          });
        }
        return;
      }

      if (element.type === "photo") {
        page.drawRectangle({
          x: element.x,
          y,
          width: element.width,
          height: element.height,
          borderColor: rgb(0.5, 0.5, 0.5),
          borderWidth: 1,
          color: rgb(0.94, 0.94, 0.94),
          opacity: elementOpacity,
        });
        page.drawText("Photo", {
          x: element.x + 8,
          y: y + element.height / 2 - 6,
          size: 12,
          font,
          color: rgb(0.2, 0.2, 0.2),
          opacity: elementOpacity,
        });
        return;
      }

      if (element.type === "qr") {
        page.drawRectangle({
          x: element.x,
          y,
          width: element.width,
          height: element.height,
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 1,
          opacity: elementOpacity,
        });
        page.drawText("QR", {
          x: element.x + 8,
          y: y + element.height / 2 - 6,
          size: 12,
          font: boldFont,
          color: rgb(0.2, 0.2, 0.2),
          opacity: elementOpacity,
        });
        return;
      }

      page.drawText(element.displayValue || "", {
        x: element.x,
        y: y + Math.max(4, element.height - element.fontSize),
        size: element.fontSize || 14,
        font: element.fontWeight === "bold" ? boldFont : font,
        color: hexToRgb(element.color || "#111827"),
        maxWidth: element.width,
        opacity: elementOpacity,
      });
    });
  });

  return pdfDoc.save();
};
