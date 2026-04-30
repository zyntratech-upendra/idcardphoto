import mongoose from "mongoose";

const elementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "field", "photo", "qr", "shape"],
      required: true,
    },
    label: { type: String, default: "" },
    text: { type: String, default: "" },
    fieldKey: { type: String, default: "" },
    qrValueKey: { type: String, default: "rollNumber" },
    x: { type: Number, default: 20 },
    y: { type: Number, default: 20 },
    width: { type: Number, default: 120 },
    height: { type: Number, default: 40 },
    fontSize: { type: Number, default: 16 },
    fontFamily: { type: String, default: "Arial" },
    fontWeight: { type: String, default: "normal" },
    align: { type: String, default: "left" },
    color: { type: String, default: "#111827" },
    backgroundColor: { type: String, default: "transparent" },
    borderRadius: { type: Number, default: 0 },
    stroke: { type: String, default: "#9ca3af" },
    strokeWidth: { type: Number, default: 1 },
    opacity: { type: Number, default: 1 },
    shapeKind: {
      type: String,
      enum: ["rect", "ellipse", "curveTop", "curveBottom"],
      default: "rect",
    },
    photoShape: {
      type: String,
      enum: ["rect", "rounded", "circular", "oval"],
      default: "rect",
    },
    curveDepth: { type: Number, default: 16 },
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    width: {
      type: Number,
      default: 360,
    },
    height: {
      type: Number,
      default: 540,
    },
    backgroundColor: {
      type: String,
      default: "#ffffff",
    },
    backgroundImage: {
      type: String,
      default: "",
    },
    overlayColor: {
      type: String,
      default: "#000000",
    },
    overlayOpacity: {
      type: Number,
      default: 0,
    },
    elements: {
      type: [elementSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true }
);

export const Template = mongoose.model("Template", templateSchema);
