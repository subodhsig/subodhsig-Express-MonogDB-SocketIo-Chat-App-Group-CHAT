import express from "express";
import Group from "../models/Group.js";
import Message from "../models/Message.js";
import authMiddleware from "../middleware/auth.js";
import {
  isGroupMember,
  isGroupAdmin,
  groupExists,
  validateGroupData,
  canRemoveMember,
  preventLastAdminRemoval,
  canPromoteToAdmin,
  validateMembers,
  checkGroupSizeLimit,
  populateGroup,
} from "../middleware/group.js";

const router = express.Router();

// Get all groups where user is a member
router.get("/", authMiddleware, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.userId })
      .populate("members", "username  email")
      .populate("admins", "username avatar")
      .sort({ createdAt: -1 });

    res.json({ groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single group by ID
router.get(
  "/:groupId",
  authMiddleware,
  groupExists,
  isGroupMember,
  populateGroup,
  async (req, res) => {
    try {
      res.json({ group: req.group });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Create a new group
router.post(
  "/",
  authMiddleware,
  validateGroupData,
  validateMembers,
  async (req, res) => {
    try {
      const { name, members } = req.body;

      // Create group with current user as admin
      const group = await Group.create({
        name: name.trim(),
        members: [...members, req.userId],
        admins: [req.userId],
      });

      await group.populate("members", "username avatar email");
      await group.populate("admins", "username avatar");

      res.status(201).json({ group, message: "Group created successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update group details
router.put(
  "/:groupId",
  authMiddleware,
  groupExists,
  isGroupAdmin,
  async (req, res) => {
    try {
      const { name } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: "Group name is required" });
      }

      if (name.trim().length < 3) {
        return res
          .status(400)
          .json({ error: "Group name must be at least 3 characters" });
      }

      if (name.trim().length > 50) {
        return res
          .status(400)
          .json({ error: "Group name must not exceed 50 characters" });
      }

      req.group.name = name.trim();
      await req.group.save();
      await req.group.populate("members", "username avatar email");
      await req.group.populate("admins", "username avatar");

      res.json({ group: req.group, message: "Group updated successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Add members to group
router.post(
  "/:groupId/members",
  authMiddleware,
  groupExists,
  isGroupAdmin,
  validateMembers,
  checkGroupSizeLimit,
  async (req, res) => {
    try {
      const { members } = req.body;

      // Add new members (avoid duplicates)
      members.forEach((memberId) => {
        if (
          !req.group.members.some((id) => id.toString() === memberId.toString())
        ) {
          req.group.members.push(memberId);
        }
      });

      await req.group.save();
      await req.group.populate("members", "username avatar email");
      await req.group.populate("admins", "username avatar");

      res.json({ group: req.group, message: "Members added successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Remove member from group
router.delete(
  "/:groupId/members/:memberId",
  authMiddleware,
  canRemoveMember,
  async (req, res) => {
    try {
      const { memberId } = req.params;

      req.group.members = req.group.members.filter(
        (id) => id.toString() !== memberId
      );
      await req.group.save();
      await req.group.populate("members", "username avatar email");
      await req.group.populate("admins", "username avatar");

      res.json({ group: req.group, message: "Member removed successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Leave group
router.post(
  "/:groupId/leave",
  authMiddleware,
  groupExists,
  isGroupMember,
  async (req, res) => {
    try {
      const userId = req.userId;

      // Remove user from members and admins
      req.group.members = req.group.members.filter(
        (id) => id.toString() !== userId.toString()
      );
      req.group.admins = req.group.admins.filter(
        (id) => id.toString() !== userId.toString()
      );

      // If no admins left and group has members, make first member admin
      if (req.group.admins.length === 0 && req.group.members.length > 0) {
        req.group.admins.push(req.group.members[0]);
      }

      // If no members left, delete the group
      if (req.group.members.length === 0) {
        await Message.deleteMany({ group: req.params.groupId });
        await Group.findByIdAndDelete(req.params.groupId);
        return res.json({ message: "Group deleted as no members remain" });
      }

      await req.group.save();
      res.json({ message: "You have left the group" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get group messages
router.get(
  "/:groupId/messages",
  authMiddleware,
  groupExists,
  isGroupMember,
  async (req, res) => {
    try {
      const messages = await Message.find({ group: req.params.groupId })
        .populate("sender", "username avatar")
        .sort({ createdAt: 1 });

      res.json({ messages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Send group message
router.post(
  "/:groupId/messages",
  authMiddleware,
  groupExists,
  isGroupMember,
  async (req, res) => {
    try {
      const { content, messageType } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const message = new Message({
        sender: req.userId,
        group: req.params.groupId,
        content: content.trim(),
        messageType: messageType || "text",
      });

      await message.save();
      await message.populate("sender", "username avatar");

      res.status(201).json({ message });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Make user admin
router.post(
  "/:groupId/admins/:memberId",
  authMiddleware,
  groupExists,
  isGroupAdmin,
  canPromoteToAdmin,
  async (req, res) => {
    try {
      const { memberId } = req.params;

      req.group.admins.push(memberId);
      await req.group.save();
      await req.group.populate("members", "username avatar email");
      await req.group.populate("admins", "username avatar");

      res.json({ group: req.group, message: "User promoted to admin" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Remove admin role
router.delete(
  "/:groupId/admins/:memberId",
  authMiddleware,
  groupExists,
  isGroupAdmin,
  preventLastAdminRemoval,
  async (req, res) => {
    try {
      const { memberId } = req.params;

      req.group.admins = req.group.admins.filter(
        (id) => id.toString() !== memberId
      );
      await req.group.save();
      await req.group.populate("members", "username avatar email");
      await req.group.populate("admins", "username avatar");

      res.json({ group: req.group, message: "Admin role removed" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete group
router.delete(
  "/:groupId",
  authMiddleware,
  groupExists,
  isGroupAdmin,
  async (req, res) => {
    try {
      // Delete all group messages
      await Message.deleteMany({ group: req.params.groupId });

      // Delete the group
      await Group.findByIdAndDelete(req.params.groupId);

      res.json({ message: "Group deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
