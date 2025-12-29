import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { socketAuthMiddleware, setupSocketHandlers } from "./config/socket.js";
import dbConfig from "./config/db.config.js";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    // origin: process.env.CLIENT_URL || "http://localhost:3000",
    origin: "*",
    credentials: true,
  },
});

const PORT = process.env.PORT;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Chat API is running" });
});

// Setup Socket.IO authentication
io.use(socketAuthMiddleware);

// Setup Socket.IO event handlers
setupSocketHandlers(io);

// Initialize and start server
async function startServer() {
  try {
    // Dynamic imports for routes
    const authModule = await import("./routes/auth.js");
    const userModule = await import("./routes/users.js");
    const messageModule = await import("./routes/messages.js");
    const groupModule = await import("./routes/group.js");

    // Setup routes
    app.use("/api/auth", authModule.default);
    app.use("/api/users", userModule.default);
    app.use("/api/messages", messageModule.default);
    app.use("/api/groups", groupModule.default);

    // Connect to MongoDB
    dbConfig();

    // Start server
    server.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
      console.log(` Socket.IO ready for connections`);
    });
  } catch (error) {
    console.error(" Error starting server:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Promise Rejection:", error);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing server gracefully");
  server.close(async () => {
    await mongoose.connection.close();
    console.log("Server and DB connections closed");
    process.exit(0);
  });
});

startServer();

export { app, server, io };
