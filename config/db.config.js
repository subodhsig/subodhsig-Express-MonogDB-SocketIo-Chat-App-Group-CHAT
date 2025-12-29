import mongoose from "mongoose";

import dotenv from "dotenv";
dotenv.config();

const dbConfig = async () => {
  const mongoURI = process.env.MONGODB_URI;
  try {
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

export default dbConfig;
