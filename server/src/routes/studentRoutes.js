import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { protect } from "../middleware/auth.js";
import { Student } from "../models/Student.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.use(protect);

const toStudentDoc = (row, createdBy) => {
  const normalized = Object.fromEntries(
    Object.entries(row || {})
      .map(([key, value]) => {
        // Normalize key: lowercase, remove spaces, trim
        const normalizedKey = String(key)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        return [normalizedKey, String(value || "").trim()];
      })
  );

  return {
    fullName: 
      normalized.fullname || 
      normalized.name || 
      normalized.studentname || 
      normalized.fullname ||
      "",
    rollNumber: 
      normalized.rollnumber || 
      normalized.roll || 
      normalized.registrationnumber ||
      "",
    department: 
      normalized.department || 
      normalized.branch ||
      "",
    course: 
      normalized.course || 
      normalized.program ||
      "",
    year: 
      normalized.year || 
      normalized.semester ||
      normalized.yearofpass ||
      "",
    email: 
      normalized.email || 
      normalized.personalemail ||
      "",
    phone: 
      normalized.phone || 
      normalized.mobile ||
      "",
    photoUrl: 
      normalized.photourl || 
      normalized.photo ||
      "",
    data: normalized,
    createdBy,
  };
};

router.get("/", async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = { createdBy: req.admin._id };

    if (q) {
      filter.$or = [
        { fullName: new RegExp(q, "i") },
        { rollNumber: new RegExp(q, "i") },
        { department: new RegExp(q, "i") },
      ];
    }

    const students = await Student.find(filter).sort({ createdAt: -1 });
    return res.json({ students });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { fullName, rollNumber } = req.body;
    if (!fullName || !rollNumber) {
      return res.status(400).json({ message: "fullName and rollNumber are required" });
    }

    const existing = await Student.findOne({ rollNumber, createdBy: req.admin._id });
    if (existing) {
      return res.status(409).json({ message: "Roll number already exists" });
    }

    const student = await Student.create({
      ...req.body,
      createdBy: req.admin._id,
    });

    return res.status(201).json({ student });
  } catch (error) {
    return next(error);
  }
});

router.post("/bulk-csv", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    const rows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Allow variable column counts
    });

    const stats = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      // Skip if row is empty or all values are empty
      if (!row || Object.values(row).every(v => !v)) {
        stats.skipped += 1;
        continue;
      }

      const payload = toStudentDoc(row, req.admin._id);

      if (!payload.fullName || !payload.rollNumber) {
        stats.skipped += 1;
        stats.errors.push({
          rollNumber: payload.rollNumber || "(missing)",
          message: "Missing fullName or rollNumber",
        });
        continue;
      }

      const exists = await Student.findOne({
        rollNumber: payload.rollNumber,
        createdBy: req.admin._id,
      });

      if (exists) {
        stats.skipped += 1;
        continue;
      }

      await Student.create(payload);
      stats.created += 1;
    }

    return res.json({
      message: "CSV import completed",
      ...stats,
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.admin._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!student) return res.status(404).json({ message: "Student not found" });
    return res.json({ student });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const student = await Student.findOneAndDelete({ _id: req.params.id, createdBy: req.admin._id });
    if (!student) return res.status(404).json({ message: "Student not found" });
    return res.json({ message: "Student deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
