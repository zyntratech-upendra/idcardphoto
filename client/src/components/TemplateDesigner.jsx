import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipse, Group, Image as KonvaImage, Layer, Rect, Shape, Stage, Text, Transformer } from "react-konva";
import api from "../api/apiClient";
import { createElement, createEmptyTemplate, getPredefinedTemplates, AVAILABLE_FIELD_KEYS } from "../utils/templateDefaults";
import { buildTemplateFromImage } from "../utils/imageTemplateExtractor";

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const defaultOverlayColor = "#000000";

const getPhotoCornerRadius = (photoShape, borderRadius) => {
  if (photoShape === "circular") return 9999;
  if (photoShape === "oval") return 9999;
  if (photoShape === "rounded") return borderRadius || 8;
  return borderRadius || 0;
};

const normalizeTemplate = (template) => ({
  ...createEmptyTemplate(),
  ...template,
  overlayColor: template?.overlayColor || defaultOverlayColor,
  overlayOpacity: clamp(safeNumber(template?.overlayOpacity, 0), 0, 1),
  elements: Array.isArray(template?.elements)
    ? template.elements.map((element) => ({
        opacity: 1,
        shapeKind: "rect",
        curveDepth: 16,
        ...element,
      }))
    : [],
});

const TemplateDesigner = ({ onTemplateSaved }) => {
  const [templates, setTemplates] = useState([]);
  const [current, setCurrent] = useState(normalizeTemplate(createEmptyTemplate()));
  const [selectedElementId, setSelectedElementId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [stageBackgroundImage, setStageBackgroundImage] = useState(null);
  const [paintMode, setPaintMode] = useState(false);
  const [paintColor, setPaintColor] = useState("#1d4ed8");
  const [paintOpacity, setPaintOpacity] = useState(0.85);
  const [paintShapeKind, setPaintShapeKind] = useState("rect");
  const [paintWidth, setPaintWidth] = useState(140);
  const [paintHeight, setPaintHeight] = useState(80);
  const elementNodeRefs = useRef({});
  const transformerRef = useRef(null);
  const presetTemplates = useMemo(() => getPredefinedTemplates(), []);

  const selectedElement = useMemo(
    () => current.elements.find((element) => element.id === selectedElementId),
    [current.elements, selectedElementId]
  );

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get("/templates");
      const list = res.data.templates || [];
      setTemplates(list);
      if (list.length && !current._id) {
        setCurrent(normalizeTemplate(JSON.parse(JSON.stringify(list[0]))));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!current.backgroundImage) {
      setStageBackgroundImage(null);
      return;
    }

    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setStageBackgroundImage(image);
    image.onerror = () => setStageBackgroundImage(null);
    image.src = current.backgroundImage;
  }, [current.backgroundImage]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const node = elementNodeRefs.current[selectedElementId];
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementId, current.elements]);

  const updateTemplate = (patch) => setCurrent((prev) => ({ ...prev, ...patch }));

  const updateElement = (id, patch) => {
    setCurrent((prev) => ({
      ...prev,
      elements: prev.elements.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const applyNodeTransform = (node, element) => {
    if (!node || !element) return;

    const scaleX = safeNumber(node.scaleX(), 1);
    const scaleY = safeNumber(node.scaleY(), 1);
    const nextWidth = clamp(Math.round(Math.max(16, safeNumber(element.width, 80) * scaleX)), 16, 4000);
    const nextHeight = clamp(Math.round(Math.max(16, safeNumber(element.height, 40) * scaleY)), 16, 4000);

    node.scaleX(1);
    node.scaleY(1);

    const patch = {
      x: Math.round(safeNumber(node.x(), element.x)),
      y: Math.round(safeNumber(node.y(), element.y)),
      width: nextWidth,
      height: nextHeight,
    };

    if (element.type === "text" || element.type === "field") {
      patch.fontSize = clamp(Math.round(safeNumber(element.fontSize, 14) * Math.max(scaleX, scaleY)), 8, 180);
    }

    if (element.type === "shape" && (element.shapeKind === "curveTop" || element.shapeKind === "curveBottom")) {
      patch.curveDepth = clamp(
        Math.round(safeNumber(element.curveDepth, 16) * scaleY),
        0,
        Math.max(0, nextHeight)
      );
    }

    updateElement(element.id, patch);
  };

  const addElement = (type) => {
    const newElement = createElement(type);
    setCurrent((prev) => ({ ...prev, elements: [...prev.elements, newElement] }));
    setSelectedElementId(newElement.id);
  };

  const addPaintShapeAt = (x, y) => {
    const baseShape = createElement("shape");
    const width = clamp(Math.round(safeNumber(paintWidth, 140)), 16, Math.max(16, current.width));
    const height = clamp(Math.round(safeNumber(paintHeight, 80)), 16, Math.max(16, current.height));
    const nextShape = {
      ...baseShape,
      x: clamp(Math.round(x - width / 2), 0, Math.max(0, current.width - width)),
      y: clamp(Math.round(y - height / 2), 0, Math.max(0, current.height - height)),
      width,
      height,
      shapeKind: paintShapeKind,
      backgroundColor: paintColor,
      stroke: paintColor,
      strokeWidth: 0,
      opacity: clamp(safeNumber(paintOpacity, 0.85), 0, 1),
      borderRadius: paintShapeKind === "rect" ? 14 : 0,
    };
    setCurrent((prev) => ({ ...prev, elements: [...prev.elements, nextShape] }));
    setSelectedElementId(nextShape.id);
  };

  const applyPainterToSelected = () => {
    if (!selectedElement) return;

    const patch = {
      backgroundColor: paintColor,
      opacity: clamp(safeNumber(paintOpacity, 0.85), 0, 1),
    };
    if (selectedElement.type === "shape") {
      patch.shapeKind = paintShapeKind;
      patch.stroke = paintColor;
    }
    updateElement(selectedElement.id, patch);
  };

  const removeSelectedElement = () => {
    if (!selectedElementId) return;
    setCurrent((prev) => ({
      ...prev,
      elements: prev.elements.filter((element) => element.id !== selectedElementId),
    }));
    setSelectedElementId("");
  };

  const saveTemplate = async () => {
    if (!current.name.trim()) {
      setError("Template name is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (current._id) {
        const res = await api.put(`/templates/${current._id}`, current);
        setCurrent(normalizeTemplate(res.data.template));
      } else {
        const res = await api.post("/templates", current);
        setCurrent(normalizeTemplate(res.data.template));
      }
      await loadTemplates();
      onTemplateSaved?.();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!current._id) return;

    try {
      await api.delete(`/templates/${current._id}`);
      setCurrent(normalizeTemplate(createEmptyTemplate()));
      setSelectedElementId("");
      await loadTemplates();
      onTemplateSaved?.();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete template");
    }
  };

  const applyUploadedImageAsBackground = async () => {
    if (!imageFile) {
      setError("Please choose an image first.");
      return;
    }

    setProcessingImage(true);
    setError("");
    setExtractProgress(0);

    try {
      const template = await buildTemplateFromImage({ file: imageFile, extractText: false });
      setCurrent(normalizeTemplate({ ...template, _id: "", elements: [] }));
      setSelectedElementId("");
    } catch (err) {
      setError(err.message || "Failed to import image");
    } finally {
      setProcessingImage(false);
    }
  };

  const extractTemplateFromUploadedImage = async () => {
    if (!imageFile) {
      setError("Please choose an image first.");
      return;
    }

    setProcessingImage(true);
    setError("");
    setExtractProgress(0);

    try {
      const template = await buildTemplateFromImage({
        file: imageFile,
        extractText: true,
        onProgress: setExtractProgress,
      });
      setCurrent(normalizeTemplate({ ...template, _id: "" }));
      setSelectedElementId("");
    } catch (err) {
      setError(err.message || "Failed to extract template from image");
    } finally {
      setProcessingImage(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr_320px]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
          <button
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            type="button"
            onClick={() => {
              setCurrent(normalizeTemplate(createEmptyTemplate()));
              setSelectedElementId("");
            }}
          >
            New
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {loading && <p className="text-sm text-slate-500">Loading templates...</p>}
          {!loading && !templates.length && <p className="text-sm text-slate-500">No templates yet.</p>}
          {templates.map((template) => (
            <button
              key={template._id}
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                current._id === template._id
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => {
                setCurrent(normalizeTemplate(JSON.parse(JSON.stringify(template))));
                setSelectedElementId("");
              }}
            >
              <p className="font-medium">{template.name}</p>
              <p className="text-xs text-slate-500">
                {template.width} x {template.height}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Predefined Layouts
          </p>
          <div className="flex flex-wrap gap-2">
            {presetTemplates.map((preset) => (
              <button
                key={preset.name}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => {
                  const nextTemplate = JSON.parse(JSON.stringify(preset));
                  nextTemplate.name = `${preset.name} Copy`;
                  setCurrent(normalizeTemplate(nextTemplate));
                  setSelectedElementId("");
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Import From Image
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Upload an existing card image and auto-generate a starting template.
          </p>
          <input
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
            type="file"
            accept="image/*"
            onChange={(event) => {
              setImageFile(event.target.files?.[0] || null);
              setExtractProgress(0);
              setError("");
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50"
              type="button"
              onClick={applyUploadedImageAsBackground}
              disabled={!imageFile || processingImage}
            >
              Use Background
            </button>
            <button
              className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              type="button"
              onClick={extractTemplateFromUploadedImage}
              disabled={!imageFile || processingImage}
            >
              Extract Layout
            </button>
          </div>
          {processingImage && (
            <p className="mt-2 text-xs text-slate-600">
              Processing image{extractProgress > 0 ? ` (${extractProgress}%)` : ""}...
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-slate-600">Template Name</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={current.name}
            onChange={(e) => updateTemplate({ name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="number"
              placeholder="Width"
              value={current.width}
              onChange={(e) => updateTemplate({ width: safeNumber(e.target.value, 360) })}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="number"
              placeholder="Height"
              value={current.height}
              onChange={(e) => updateTemplate({ height: safeNumber(e.target.value, 540) })}
            />
          </div>
          <input
            className="h-9 w-full rounded-lg border border-slate-300"
            type="color"
            value={current.backgroundColor}
            onChange={(e) => updateTemplate({ backgroundColor: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Overlay Color</label>
              <input
                className="h-9 w-full rounded-lg border border-slate-300"
                type="color"
                value={current.overlayColor || defaultOverlayColor}
                onChange={(e) => updateTemplate({ overlayColor: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Overlay Opacity</label>
              <input
                className="w-full"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={safeNumber(current.overlayOpacity, 0)}
                onChange={(e) =>
                  updateTemplate({
                    overlayOpacity: clamp(safeNumber(e.target.value, 0), 0, 1),
                  })
                }
              />
              <p className="text-xs text-slate-500">{Math.round(safeNumber(current.overlayOpacity, 0) * 100)}%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            type="button"
            onClick={saveTemplate}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            type="button"
            onClick={deleteTemplate}
            disabled={!current._id}
          >
            Delete
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Interactive Fill</p>
            <button
              className={`rounded-md px-2 py-1 text-xs ${
                paintMode
                  ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
              type="button"
              onClick={() => setPaintMode((prev) => !prev)}
            >
              {paintMode ? "Stop Fill" : "Start Fill"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Turn on fill mode, then click card area to place color where you want.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Fill Color</label>
              <input
                className="h-9 w-full rounded-lg border border-slate-300"
                type="color"
                value={paintColor}
                onChange={(e) => setPaintColor(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Shape</label>
              <select
                className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                value={paintShapeKind}
                onChange={(e) => setPaintShapeKind(e.target.value)}
              >
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="curveTop">Curve Top</option>
                <option value="curveBottom">Curve Bottom</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Width</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                type="number"
                value={paintWidth}
                min={16}
                onChange={(e) => setPaintWidth(safeNumber(e.target.value, 140))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Height</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                type="number"
                value={paintHeight}
                min={16}
                onChange={(e) => setPaintHeight(safeNumber(e.target.value, 80))}
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-xs text-slate-600">Fill Opacity</label>
            <input
              className="w-full"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={paintOpacity}
              onChange={(e) => setPaintOpacity(clamp(safeNumber(e.target.value, 0.85), 0, 1))}
            />
            <p className="text-xs text-slate-500">{Math.round(paintOpacity * 100)}%</p>
          </div>
          <button
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50"
            type="button"
            disabled={!selectedElement}
            onClick={applyPainterToSelected}
          >
            Apply Fill To Selected
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
            type="button"
            onClick={() => addElement("text")}
          >
            Add Text
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
            type="button"
            onClick={() => addElement("field")}
          >
            Add Data Field
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
            type="button"
            onClick={() => addElement("photo")}
          >
            Add Photo
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
            type="button"
            onClick={() => addElement("qr")}
          >
            Add QR
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
            type="button"
            onClick={() => addElement("shape")}
          >
            Add Shape
          </button>
          <button
            className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            type="button"
            onClick={removeSelectedElement}
            disabled={!selectedElement}
          >
            Remove Selected
          </button>
        </div>

        <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4">
          <Stage
            width={current.width}
            height={current.height}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) {
                if (paintMode) {
                  const pointer = e.target.getStage()?.getPointerPosition();
                  if (pointer) addPaintShapeAt(pointer.x, pointer.y);
                  return;
                }
                setSelectedElementId("");
              }
            }}
          >
            <Layer>
              <Rect x={0} y={0} width={current.width} height={current.height} fill={current.backgroundColor} />
              {stageBackgroundImage && (
                <KonvaImage
                  image={stageBackgroundImage}
                  x={0}
                  y={0}
                  width={current.width}
                  height={current.height}
                  listening={false}
                />
              )}
              {safeNumber(current.overlayOpacity, 0) > 0 && (
                <Rect
                  x={0}
                  y={0}
                  width={current.width}
                  height={current.height}
                  fill={current.overlayColor || defaultOverlayColor}
                  opacity={clamp(safeNumber(current.overlayOpacity, 0), 0, 1)}
                  listening={false}
                />
              )}
              {current.elements.map((element) => {
                if (element.type === "text" || element.type === "field") {
                  const textValue = element.type === "text" ? element.text : `{${element.fieldKey || "field"}}`;
                  return (
                    <Text
                      key={element.id}
                      ref={(node) => {
                        if (node) elementNodeRefs.current[element.id] = node;
                        else delete elementNodeRefs.current[element.id];
                      }}
                      x={element.x}
                      y={element.y}
                      width={element.width}
                      height={element.height}
                      text={textValue}
                      fill={element.color}
                      fontSize={element.fontSize}
                      fontStyle={element.fontWeight === "bold" ? "bold" : "normal"}
                      fontFamily={element.fontFamily}
                      align={element.align}
                      opacity={clamp(safeNumber(element.opacity, 1), 0, 1)}
                      draggable
                      onClick={() => setSelectedElementId(element.id)}
                      onTap={() => setSelectedElementId(element.id)}
                      onDragEnd={(event) =>
                        updateElement(element.id, {
                          x: Math.round(event.target.x()),
                          y: Math.round(event.target.y()),
                        })
                      }
                      onTransformEnd={(event) => applyNodeTransform(event.target, element)}
                      stroke={selectedElementId === element.id ? "#0ea5e9" : "transparent"}
                      strokeWidth={selectedElementId === element.id ? 0.5 : 0}
                    />
                  );
                }

                if (element.type === "shape") {
                  const shapeKind = element.shapeKind || "rect";
                  const width = Math.max(8, safeNumber(element.width, 80));
                  const height = Math.max(8, safeNumber(element.height, 60));
                  const curveDepth = clamp(safeNumber(element.curveDepth, 16), 0, height);
                  const opacity = clamp(safeNumber(element.opacity, 1), 0, 1);

                  return (
                    <Group
                      key={element.id}
                      ref={(node) => {
                        if (node) elementNodeRefs.current[element.id] = node;
                        else delete elementNodeRefs.current[element.id];
                      }}
                      x={element.x}
                      y={element.y}
                      width={element.width}
                      height={element.height}
                      opacity={opacity}
                      draggable
                      onClick={() => setSelectedElementId(element.id)}
                      onTap={() => setSelectedElementId(element.id)}
                      onDragEnd={(event) =>
                        updateElement(element.id, {
                          x: Math.round(event.target.x()),
                          y: Math.round(event.target.y()),
                        })
                      }
                      onTransformEnd={(event) => applyNodeTransform(event.target, element)}
                    >
                      {shapeKind === "ellipse" ? (
                        <Ellipse
                          x={width / 2}
                          y={height / 2}
                          radiusX={width / 2}
                          radiusY={height / 2}
                          fill={element.backgroundColor || "#cbd5e1"}
                          stroke={selectedElementId === element.id ? "#0ea5e9" : element.stroke || "transparent"}
                          strokeWidth={selectedElementId === element.id ? 2 : element.strokeWidth || 0}
                        />
                      ) : shapeKind === "curveTop" || shapeKind === "curveBottom" ? (
                        <Shape
                          width={width}
                          height={height}
                          sceneFunc={(context, shape) => {
                            context.beginPath();
                            if (shapeKind === "curveBottom") {
                              context.moveTo(0, curveDepth);
                              context.quadraticCurveTo(width / 2, -curveDepth, width, curveDepth);
                              context.lineTo(width, height);
                              context.lineTo(0, height);
                            } else {
                              context.moveTo(0, 0);
                              context.lineTo(width, 0);
                              context.lineTo(width, height - curveDepth);
                              context.quadraticCurveTo(width / 2, height + curveDepth, 0, height - curveDepth);
                            }
                            context.closePath();
                            context.fillStyle = element.backgroundColor || "#cbd5e1";
                            context.strokeStyle =
                              selectedElementId === element.id ? "#0ea5e9" : element.stroke || "transparent";
                            context.lineWidth = selectedElementId === element.id ? 2 : element.strokeWidth || 0;
                            context.fillStrokeShape(shape);
                          }}
                        />
                      ) : (
                        <Rect
                          width={width}
                          height={height}
                          fill={element.backgroundColor || "#cbd5e1"}
                          stroke={selectedElementId === element.id ? "#0ea5e9" : element.stroke || "transparent"}
                          strokeWidth={selectedElementId === element.id ? 2 : element.strokeWidth || 0}
                          cornerRadius={element.borderRadius || 0}
                        />
                      )}
                    </Group>
                  );
                }

                return (
                  <Group
                    key={element.id}
                    ref={(node) => {
                      if (node) elementNodeRefs.current[element.id] = node;
                      else delete elementNodeRefs.current[element.id];
                    }}
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    opacity={clamp(safeNumber(element.opacity, 1), 0, 1)}
                    draggable
                    onClick={() => setSelectedElementId(element.id)}
                    onTap={() => setSelectedElementId(element.id)}
                    onDragEnd={(event) =>
                      updateElement(element.id, {
                        x: Math.round(event.target.x()),
                        y: Math.round(event.target.y()),
                      })
                    }
                    onTransformEnd={(event) => applyNodeTransform(event.target, element)}
                  >
                    <Rect
                      width={element.width}
                      height={element.height}
                      fill={element.backgroundColor || "#f8fafc"}
                      stroke={selectedElementId === element.id ? "#0ea5e9" : element.stroke}
                      strokeWidth={selectedElementId === element.id ? 2 : element.strokeWidth || 1}
                      cornerRadius={
                        element.type === "photo"
                          ? getPhotoCornerRadius(element.photoShape, element.borderRadius)
                          : element.borderRadius
                      }
                    />
                    <Text
                      width={element.width}
                      height={element.height}
                      text={element.type === "photo" ? "PHOTO" : "QR"}
                      fill={element.color}
                      fontSize={14}
                      align="center"
                      verticalAlign="middle"
                    />
                  </Group>
                );
              })}
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                anchorSize={8}
                padding={2}
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 16 || Math.abs(newBox.height) < 16) {
                    return oldBox;
                  }
                  return newBox;
                }}
              />
            </Layer>
          </Stage>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Properties</h2>
        {!selectedElement && <p className="mt-4 text-sm text-slate-500">Select an element to edit properties.</p>}

        {selectedElement && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600">X</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  type="number"
                  value={selectedElement.x}
                  onChange={(e) => updateElement(selectedElement.id, { x: safeNumber(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600">Y</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  type="number"
                  value={selectedElement.y}
                  onChange={(e) => updateElement(selectedElement.id, { y: safeNumber(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600">Width</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  type="number"
                  value={selectedElement.width}
                  onChange={(e) => updateElement(selectedElement.id, { width: safeNumber(e.target.value, 80) })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600">Height</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  type="number"
                  value={selectedElement.height}
                  onChange={(e) => updateElement(selectedElement.id, { height: safeNumber(e.target.value, 30) })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-600">Element Opacity</label>
              <input
                className="w-full"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={clamp(safeNumber(selectedElement.opacity, 1), 0, 1)}
                onChange={(e) =>
                  updateElement(selectedElement.id, {
                    opacity: clamp(safeNumber(e.target.value, 1), 0, 1),
                  })
                }
              />
              <p className="text-xs text-slate-500">
                {Math.round(clamp(safeNumber(selectedElement.opacity, 1), 0, 1) * 100)}%
              </p>
            </div>

            {(selectedElement.type === "text" || selectedElement.type === "field") && (
              <>
                <div>
                  <label className="block text-xs text-slate-600">Font Size</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    type="number"
                    value={selectedElement.fontSize}
                    onChange={(e) =>
                      updateElement(selectedElement.id, { fontSize: safeNumber(e.target.value, 16) })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={selectedElement.fontWeight}
                    onChange={(e) => updateElement(selectedElement.id, { fontWeight: e.target.value })}
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                  </select>
                  <select
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={selectedElement.align}
                    onChange={(e) => updateElement(selectedElement.id, { align: e.target.value })}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </>
            )}

            {selectedElement.type === "text" && (
              <div>
                <label className="block text-xs text-slate-600">Text</label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  rows={2}
                  value={selectedElement.text}
                  onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })}
                />
              </div>
            )}

            {(selectedElement.type === "field" || selectedElement.type === "photo") && (
              <div>
                <label className="block text-xs text-slate-600">
                  {selectedElement.type === "field" ? "Field Key" : "Photo Field Key"}
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={selectedElement.fieldKey || ""}
                  onChange={(e) => updateElement(selectedElement.id, { fieldKey: e.target.value })}
                >
                  <option value="">-- Select a field --</option>
                  {AVAILABLE_FIELD_KEYS.map((field) => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedElement.type === "field" ? "Choose which student data to display" : "Choose which student photo field to use"}
                </p>
              </div>
            )}

            {selectedElement.type === "photo" && (
              <div>
                <label className="block text-xs text-slate-600">Photo Shape</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={selectedElement.photoShape || "rect"}
                  onChange={(e) => updateElement(selectedElement.id, { photoShape: e.target.value })}
                >
                  <option value="rect">Rectangle</option>
                  <option value="rounded">Rounded Corners</option>
                  <option value="circular">Circular</option>
                  <option value="oval">Oval</option>
                </select>
              </div>
            )}

            {selectedElement.type === "shape" && (
              <>
                <div>
                  <label className="block text-xs text-slate-600">Shape Type</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    value={selectedElement.shapeKind || "rect"}
                    onChange={(e) => updateElement(selectedElement.id, { shapeKind: e.target.value })}
                  >
                    <option value="rect">Rectangle</option>
                    <option value="ellipse">Ellipse</option>
                    <option value="curveTop">Curve Top</option>
                    <option value="curveBottom">Curve Bottom</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600">Corner Radius</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      type="number"
                      value={selectedElement.borderRadius || 0}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          borderRadius: safeNumber(e.target.value, 0),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">Stroke Width</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      type="number"
                      value={selectedElement.strokeWidth || 0}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          strokeWidth: safeNumber(e.target.value, 0),
                        })
                      }
                    />
                  </div>
                </div>
                {(selectedElement.shapeKind === "curveTop" || selectedElement.shapeKind === "curveBottom") && (
                  <div>
                    <label className="block text-xs text-slate-600">Curve Depth</label>
                    <input
                      className="w-full"
                      type="range"
                      min="0"
                      max={Math.max(12, safeNumber(selectedElement.height, 30))}
                      step="1"
                      value={safeNumber(selectedElement.curveDepth, 16)}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          curveDepth: safeNumber(e.target.value, 16),
                        })
                      }
                    />
                    <p className="text-xs text-slate-500">{Math.round(safeNumber(selectedElement.curveDepth, 16))} px</p>
                  </div>
                )}
              </>
            )}

            {selectedElement.type === "qr" && (
              <div>
                <label className="block text-xs text-slate-600">QR Value Key</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={selectedElement.qrValueKey || ""}
                  onChange={(e) => updateElement(selectedElement.id, { qrValueKey: e.target.value })}
                  placeholder="rollNumber"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600">
                  {selectedElement.type === "shape" ? "Stroke Color" : "Text Color"}
                </label>
                <input
                  className="h-9 w-full rounded-lg border border-slate-300"
                  type="color"
                  value={
                    (selectedElement.type === "shape" ? selectedElement.stroke : selectedElement.color) || "#111827"
                  }
                  onChange={(e) =>
                    updateElement(
                      selectedElement.id,
                      selectedElement.type === "shape"
                        ? { stroke: e.target.value }
                        : { color: e.target.value }
                    )
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600">Fill Color</label>
                <input
                  className="h-9 w-full rounded-lg border border-slate-300"
                  type="color"
                  value={
                    selectedElement.backgroundColor && selectedElement.backgroundColor.startsWith("#")
                      ? selectedElement.backgroundColor
                      : "#ffffff"
                  }
                  onChange={(e) => updateElement(selectedElement.id, { backgroundColor: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default TemplateDesigner;
