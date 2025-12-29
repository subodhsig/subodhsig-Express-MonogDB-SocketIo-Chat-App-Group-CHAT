import express from "express";
import Message from "../models/Message.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Get conversation between two users
router.get("/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    })
      .populate("sender", "username avatar")
      .populate("receiver", "username avatar")
      .sort({ createdAt: 1 });

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message (REST endpoint, but Socket.IO is preferred for real-time)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { receiver, content, messageType } = req.body;

    if (!receiver || !content) {
      return res
        .status(400)
        .json({ error: "Receiver and content are required" });
    }

    const message = new Message({
      sender: req.userId,
      receiver,
      content,
      messageType: messageType || "text",
    });

    await message.save();
    await message.populate("sender", "username avatar");
    await message.populate("receiver", "username avatar");

    res.status(201).json({ message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as read
router.put("/read/:userId", authMiddleware, async (req, res) => {
  try {
    await Message.updateMany(
      {
        sender: req.params.userId,
        receiver: req.userId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread message count
router.get("/unread/count", authMiddleware, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.userId,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all conversations (unique users you've chatted with)
router.get("/conversations/list", authMiddleware, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: req.userId }, { receiver: req.userId }],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$sender", req.userId] }, "$receiver", "$sender"],
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", req.userId] },
                    { $eq: ["$isRead", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          "user.password": 0,
        },
      },
      {
        $sort: { "lastMessage.createdAt": -1 },
      },
    ]);

    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
