import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import { Admin } from "../models/Admin.js";
import mongoose from "mongoose";

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect("mongodb+srv://zyntratech:zyntratech2025@cluster0.4zgwknv.mongodb.net/idcard");

    const email = "upendra@gmail.com";
    const password = "Upendra@22";
    const name = "Upendra";

    let admin = await Admin.findOne({ email });

    if (!admin) {
      admin = await Admin.create({ name, email, password });
      console.log(`Admin created: ${email}`);
    } else {
      admin.name = name;
      admin.password = password;
      await admin.save();
      console.log(`Admin updated: ${email}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("Failed to seed admin:", error.message);
    process.exit(1);
  }
};

seedAdmin();
