import express from "express";
import { protect } from "../middleware/auth.js";
import { Template } from "../models/Template.js";

const router = express.Router();

router.use(protect);

router.get("/", async (req, res, next) => {
  try {
    const templates = await Template.find({ createdBy: req.admin._id }).sort({ updatedAt: -1 });
    return res.json({ templates });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, width, height, backgroundColor, backgroundImage, overlayColor, overlayOpacity, elements } = req.body;
    if (!name) return res.status(400).json({ message: "Template name is required" });

    const template = await Template.create({
      name,
      width,
      height,
      backgroundColor,
      backgroundImage,
      overlayColor,
      overlayOpacity,
      elements,
      createdBy: req.admin._id,
    });

    return res.status(201).json({ template });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const template = await Template.findOne({ _id: req.params.id, createdBy: req.admin._id });
    if (!template) return res.status(404).json({ message: "Template not found" });
    return res.json({ template });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.admin._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!template) return res.status(404).json({ message: "Template not found" });
    return res.json({ template });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const template = await Template.findOneAndDelete({ _id: req.params.id, createdBy: req.admin._id });
    if (!template) return res.status(404).json({ message: "Template not found" });
    return res.json({ message: "Template deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
