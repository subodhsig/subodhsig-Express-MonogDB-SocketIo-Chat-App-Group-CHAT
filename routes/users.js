import express from "express";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Get all users except current user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } })
      .select("-password")
      .sort({ isOnline: -1, username: 1 });

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
router.get("/:userId", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search users
router.get("/search/:query", authMiddleware, async (req, res) => {
  try {
    const { query } = req.params;
    const users = await User.find({
      _id: { $ne: req.userId },
      $or: [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    })
      .select("-password")
      .limit(10);

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
