import Group from "../models/Group.js";

/**
 * Middleware to check if user is a member of the group
 */
export const isGroupMember = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is in members array
    const isMember = group.members.some(
      (memberId) => memberId.toString() === userId.toString()
    );

    if (!isMember) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    // Attach group to request for use in route handlers
    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to check if user is an admin of the group
 */
export const isGroupAdmin = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is in admins array
    const isAdmin = group.admins.some(
      (adminId) => adminId.toString() === userId.toString()
    );

    if (!isAdmin) {
      return res
        .status(403)
        .json({ error: "Only group admins can perform this action" });
    }

    // Attach group to request for use in route handlers
    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to check if group exists
 */
export const groupExists = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Attach group to request
    req.group = group;
    next();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid group ID format" });
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to validate group data
 */
export const validateGroupData = (req, res, next) => {
  const { name, members } = req.body;

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

  if (members && !Array.isArray(members)) {
    return res.status(400).json({ error: "Members must be an array" });
  }

  if (members && members.length === 0) {
    return res.status(400).json({ error: "At least one member is required" });
  }

  next();
};

/**
 * Middleware to check if user can be removed from group
 */
export const canRemoveMember = async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.userId;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if requester is admin
    const isAdmin = group.admins.some(
      (adminId) => adminId.toString() === userId.toString()
    );

    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can remove members" });
    }

    // Check if member exists in group
    const memberExists = group.members.some(
      (member) => member.toString() === memberId
    );

    if (!memberExists) {
      return res
        .status(400)
        .json({ error: "User is not a member of this group" });
    }

    // Cannot remove admins
    const isTargetAdmin = group.admins.some(
      (adminId) => adminId.toString() === memberId
    );

    if (isTargetAdmin) {
      return res.status(400).json({
        error: "Cannot remove admin. Remove admin role first.",
      });
    }

    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to check if last admin is being removed
 */
export const preventLastAdminRemoval = async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if this is the last admin
    if (group.admins.length === 1) {
      const isLastAdmin = group.admins[0].toString() === memberId;

      if (isLastAdmin) {
        return res.status(400).json({
          error:
            "Cannot remove the last admin. Promote another member to admin first.",
        });
      }
    }

    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to check if user can be promoted to admin
 */
export const canPromoteToAdmin = async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if member exists in group
    const memberExists = group.members.some(
      (member) => member.toString() === memberId
    );

    if (!memberExists) {
      return res
        .status(400)
        .json({ error: "User is not a member of this group" });
    }

    // Check if already an admin
    const isAlreadyAdmin = group.admins.some(
      (adminId) => adminId.toString() === memberId
    );

    if (isAlreadyAdmin) {
      return res.status(400).json({ error: "User is already an admin" });
    }

    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to validate members array
 */
export const validateMembers = async (req, res, next) => {
  try {
    const { members } = req.body;

    if (!members || !Array.isArray(members)) {
      return res.status(400).json({ error: "Members array is required" });
    }

    if (members.length === 0) {
      return res.status(400).json({ error: "At least one member is required" });
    }

    // Check for duplicate members
    const uniqueMembers = [...new Set(members)];
    if (uniqueMembers.length !== members.length) {
      return res.status(400).json({ error: "Duplicate members detected" });
    }

    // Validate ObjectId format (basic check)
    const validObjectIdPattern = /^[0-9a-fA-F]{24}$/;
    for (const memberId of members) {
      if (!validObjectIdPattern.test(memberId)) {
        return res
          .status(400)
          .json({ error: `Invalid member ID format: ${memberId}` });
      }
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to check group size limit
 */
export const checkGroupSizeLimit = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const MAX_GROUP_SIZE = 100; // Configure as needed

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const newTotalMembers = group.members.length + (members?.length || 0);

    if (newTotalMembers > MAX_GROUP_SIZE) {
      return res.status(400).json({
        error: `Group size limit exceeded. Maximum ${MAX_GROUP_SIZE} members allowed.`,
      });
    }

    req.group = group;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Middleware to populate group data
 */
export const populateGroup = async (req, res, next) => {
  try {
    if (req.group) {
      await req.group.populate("members", "username avatar email isOnline");
      await req.group.populate("admins", "username avatar");
    }
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Export all middleware
export default {
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
};
