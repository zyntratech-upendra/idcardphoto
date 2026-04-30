import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import api from "../api/apiClient";
import IdCardPreview from "./IdCardPreview";
import { getPredefinedTemplates } from "../utils/templateDefaults";

const toBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Failed to convert canvas"));
      else resolve(blob);
    }, "image/png");
  });

const CardGenerator = ({ refreshKey }) => {
  const [templates, setTemplates] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [renderedCards, setRenderedCards] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [galleryView, setGalleryView] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const cardRefs = useRef({});

  const currentCard = renderedCards[previewIndex];

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [templateRes, studentRes] = await Promise.all([api.get("/templates"), api.get("/students")]);
      let templateList = templateRes.data.templates || [];
      const studentList = studentRes.data.students || [];

      const existingNames = new Set(
        templateList.map((template) => String(template.name || "").trim().toLowerCase()).filter(Boolean)
      );
      const missingPresets = getPredefinedTemplates().filter((preset) => {
        const normalized = String(preset.name || "").trim().toLowerCase();
        return normalized && !existingNames.has(normalized);
      });

      if (missingPresets.length) {
        const created = await Promise.all(
          missingPresets.map((preset) =>
            api.post("/templates", {
              name: preset.name,
              width: preset.width,
              height: preset.height,
              backgroundColor: preset.backgroundColor,
              backgroundImage: preset.backgroundImage || "",
              overlayColor: preset.overlayColor || "#000000",
              overlayOpacity: preset.overlayOpacity || 0,
              elements: Array.isArray(preset.elements) ? preset.elements : [],
            })
          )
        );
        templateList = [...created.map((item) => item.data.template), ...templateList];
      }

      setTemplates(templateList);
      setStudents(studentList);

      if (!selectedTemplateId && templateList.length) {
        setSelectedTemplateId(templateList[0]._id);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const selectedCount = selectedStudentIds.length;
  const selectedTemplate = useMemo(
    () => templates.find((template) => template._id === selectedTemplateId),
    [selectedTemplateId, templates]
  );

  const toggleStudent = (id) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
      return;
    }
    setSelectedStudentIds(students.map((student) => student._id));
  };

  const renderCards = async () => {
    if (!selectedTemplateId) {
      setError("Please select a template");
      return;
    }

    setError("");
    try {
      const res = await api.post("/cards/render", {
        templateId: selectedTemplateId,
        studentIds: selectedStudentIds.length ? selectedStudentIds : undefined,
      });
      const cards = res.data.cards || [];
      setRenderedCards(cards);
      setPreviewIndex(0);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to render cards");
    }
  };

  const getCardNode = (card) => cardRefs.current[card.studentId];

  const downloadCurrentPng = async () => {
    if (!currentCard) return;
    setExporting(true);
    try {
      const node = getCardNode(currentCard);
      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: null });
      const blob = await toBlob(canvas);
      const name = currentCard.student.rollNumber || currentCard.student.fullName || "id-card";
      saveAs(blob, `${name}.png`);
    } catch (err) {
      setError(err.message || "Failed to export image");
    } finally {
      setExporting(false);
    }
  };

  const downloadBulkPdf = async () => {
    if (!renderedCards.length) return;
    setExporting(true);
    try {
      const template = renderedCards[0].template;
      const orientation = template.width > template.height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [template.width, template.height],
        compress: true,
      });

      for (let i = 0; i < renderedCards.length; i += 1) {
        const card = renderedCards[i];
        const node = getCardNode(card);
        const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: null });
        const image = canvas.toDataURL("image/png");

        if (i > 0) {
          pdf.addPage([template.width, template.height], orientation);
        }
        pdf.addImage(image, "PNG", 0, 0, template.width, template.height);
      }

      pdf.save(`${selectedTemplate?.name || "id-cards"}-bulk.pdf`);
    } catch (err) {
      setError(err.message || "Failed to export bulk PDF");
    } finally {
      setExporting(false);
    }
  };

  const downloadBulkImages = async () => {
    if (!renderedCards.length) return;
    setExporting(true);
    setZipProgress(0);
    try {
      const zip = new JSZip();

      for (let i = 0; i < renderedCards.length; i += 1) {
        const card = renderedCards[i];
        const node = getCardNode(card);
        const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: null });
        const blob = await toBlob(canvas);
        const fileName = `${card.student.rollNumber || card.student.fullName || card.studentId}.png`;
        zip.file(fileName, blob);
        
        // Update progress
        setZipProgress(Math.round(((i + 1) / renderedCards.length) * 90));
      }

      setZipProgress(95);
      const zipped = await zip.generateAsync({ type: "blob" });
      setZipProgress(100);
      saveAs(zipped, `${selectedTemplate?.name || "id-cards"}-images.zip`);
      
      setTimeout(() => setZipProgress(0), 1500);
    } catch (err) {
      setError(err.message || "Failed to export images");
    } finally {
      setExporting(false);
    }
  };

  const downloadServerPdf = async () => {
    if (!selectedTemplateId) return;
    setExporting(true);
    try {
      const res = await api.post(
        "/cards/export-pdf",
        { templateId: selectedTemplateId, studentIds: selectedStudentIds.length ? selectedStudentIds : undefined },
        { responseType: "blob" }
      );
      saveAs(res.data, `${selectedTemplate?.name || "id-cards"}-server.pdf`);
    } catch (err) {
      setError(err.response?.data?.message || "Server PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Card Generation Controls</h2>
        {loading && <p className="mt-3 text-sm text-slate-500">Loading templates and students...</p>}
        {!loading && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Template</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <p className="text-sm font-medium text-slate-700">Students ({selectedCount} selected)</p>
                <button
                  className="text-xs font-medium text-sky-600 hover:text-sky-500"
                  type="button"
                  onClick={toggleAll}
                >
                  {selectedStudentIds.length === students.length ? "Clear" : "Select All"}
                </button>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto p-2">
                {students.map((student) => (
                  <label
                    key={student._id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(student._id)}
                      onChange={() => toggleStudent(student._id)}
                    />
                    <span className="truncate">
                      {student.fullName} ({student.rollNumber})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              type="button"
              onClick={renderCards}
            >
              Render ID Cards
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                type="button"
                onClick={downloadCurrentPng}
                disabled={!currentCard || exporting}
              >
                Download PNG
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                type="button"
                onClick={downloadBulkPdf}
                disabled={!renderedCards.length || exporting}
              >
                Bulk PDF
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                type="button"
                onClick={downloadBulkImages}
                disabled={!renderedCards.length || exporting}
              >
                ZIP Images
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                type="button"
                onClick={downloadServerPdf}
                disabled={!selectedTemplateId || exporting}
              >
                Server PDF
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Preview</h2>
          <div className="flex items-center gap-3">
            {renderedCards.length > 0 && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    !galleryView ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  type="button"
                  onClick={() => setGalleryView(false)}
                >
                  Single
                </button>
                <button
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    galleryView ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  type="button"
                  onClick={() => setGalleryView(true)}
                >
                  Gallery
                </button>
              </div>
            )}
            {!galleryView && (
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                  type="button"
                  disabled={previewIndex <= 0}
                  onClick={() => setPreviewIndex((prev) => Math.max(0, prev - 1))}
                >
                  Prev
                </button>
                <span className="text-xs text-slate-600">
                  {renderedCards.length ? `${previewIndex + 1}/${renderedCards.length}` : "0/0"}
                </span>
                <button
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                  type="button"
                  disabled={previewIndex >= renderedCards.length - 1}
                  onClick={() => setPreviewIndex((prev) => Math.min(renderedCards.length - 1, prev + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {!galleryView && (
          <div className="min-h-[580px] rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            {!currentCard && (
              <p className="text-sm text-slate-500">
                Render cards to preview. If no students are selected, all students are included.
              </p>
            )}
            {currentCard && (
              <div className="inline-block rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <IdCardPreview card={currentCard} />
              </div>
            )}
          </div>
        )}

        {galleryView && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            {renderedCards.length === 0 ? (
              <p className="text-sm text-slate-500">Render cards to view gallery.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">Total Cards: {renderedCards.length}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {renderedCards.map((card, idx) => (
                    <button
                      key={card.studentId}
                      type="button"
                      onClick={() => {
                        setGalleryView(false);
                        setPreviewIndex(idx);
                      }}
                      className={`group relative overflow-hidden rounded-lg border-2 transition ${
                        previewIndex === idx
                          ? "border-blue-500 shadow-lg ring-2 ring-blue-200"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="aspect-video scale-75 origin-top-left">
                        <IdCardPreview card={card} />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition group-hover:bg-black/20">
                        <span className="text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                          {idx + 1}
                        </span>
                      </div>
                      <p className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-2 py-1 text-xs text-white">
                        {card.student.fullName}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {zipProgress > 0 && zipProgress < 100 && (
          <div className="mt-3 rounded-lg bg-blue-50 p-3">
            <p className="mb-2 text-xs font-medium text-blue-700">Creating ZIP file...</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${zipProgress}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <div className="pointer-events-none fixed -left-[10000px] top-0">
        {renderedCards.map((card) => (
          <div key={card.studentId} ref={(node) => (cardRefs.current[card.studentId] = node)}>
            <IdCardPreview card={card} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CardGenerator;
