import express from "express";
import { protect } from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { Template } from "../models/Template.js";
import { buildCardPayload } from "../utils/cardResolver.js";
import { buildCardsPdf } from "../utils/pdfBuilder.js";

const router = express.Router();

router.use(protect);

const fetchCards = async ({ adminId, templateId, studentIds }) => {
  const template = await Template.findOne({ _id: templateId, createdBy: adminId });
  if (!template) return { error: "Template not found", cards: [] };

  const query = { createdBy: adminId };
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    query._id = { $in: studentIds };
  }

  const students = await Student.find(query).sort({ fullName: 1 });
  const cards = students.map((student) => buildCardPayload(template, student));
  return { cards };
};

router.post("/render", async (req, res, next) => {
  try {
    const { templateId, studentIds } = req.body;
    if (!templateId) {
      return res.status(400).json({ message: "templateId is required" });
    }

    const { error, cards } = await fetchCards({
      adminId: req.admin._id,
      templateId,
      studentIds,
    });

    if (error) return res.status(404).json({ message: error });
    return res.json({ cards });
  } catch (error) {
    return next(error);
  }
});

router.post("/export-pdf", async (req, res, next) => {
  try {
    const { templateId, studentIds } = req.body;
    if (!templateId) {
      return res.status(400).json({ message: "templateId is required" });
    }

    const { error, cards } = await fetchCards({
      adminId: req.admin._id,
      templateId,
      studentIds,
    });

    if (error) return res.status(404).json({ message: error });
    if (!cards.length) return res.status(400).json({ message: "No students found" });

    const bytes = await buildCardsPdf(cards);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="id-cards.pdf"');
    return res.send(Buffer.from(bytes));
  } catch (error) {
    return next(error);
  }
});

export default router;
