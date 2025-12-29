import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Group from "../models/Group.js";

const JWT_SECRET = process.env.JWT_SECRET;

// Store online users
const onlineUsers = new Map();

// Get online users
// export const getOnlineUsers = () => {
//   return Array.from(onlineUsers.keys());
// };
export const getOnlineUsers = () => {
  return Array.from(onlineUsers.keys());
};
// Socket authentication middleware
export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error"));
    }
    // console.log("token ", token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error("User not Found"));
    }

    socket.userId = user._id.toString();
    socket.username = user.username;
    next();
  } catch (error) {
    next(new Error("Authorization error"));
  }
};

// Socket event handlers
export const setupSocketHandlers = (io) => {
  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Add user to online users
    onlineUsers.set(socket.userId, socket.id);
    try {
      const groups = await Group.find({ members: socket.userId });

      groups.forEach((group) => {
        socket.join(group._id.toString());
      });
    } catch (error) {
      console.error("Error joining group rooms:", error);
    }

    // Update user online status
    User.findByIdAndUpdate(socket.userId, { isOnline: true }).exec();

    // Emit online users to all clients
    io.emit("online-users", Array.from(onlineUsers.keys()));

    // Join user's personal room
    socket.join(socket.userId);

    // Handle sending messages
    socket.on("send-message", async (data) => {
      try {
        const { receiverId, content, messageType } = data;

        // Save message to database
        const message = new Message({
          sender: socket.userId,
          receiver: receiverId,
          content,
          messageType: messageType || "text",
        });

        await message.save();
        await message.populate("sender", "username avatar");
        await message.populate("receiver", "username avatar");

        // Send to receiver if online
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receive-message", message);
        }

        // Send back to sender for confirmation
        socket.emit("sent-message", message);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // socket.on("send-location", async (data, callback) => {
    //   try {
    //     const { receiverId, latitude, longitude } = data;

    //     const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    //     const message = new Message({
    //       sender: socket.userId,
    //       receiver: receiverId,
    //       content: locationUrl,
    //       messageType: "location",
    //     });

    //     await message.save();
    //     await message.populate("sender", "username avatar");
    //     await message.populate("receiver", "username avatar");

    //     const receiverSocketId = onlineUsers.get(receiverId);
    //     if (receiverSocketId) {
    //       io.to(receiverSocketId).emit("receive-message", message);
    //     }

    //     socket.emit("message-sent", message);

    //     if (callback) callback({ success: true });
    //   } catch (error) {
    //     console.error("Error sending location:", error);
    //     if (callback) callback({ success: false });
    //   }
    // });

    // Handle typing indicator
    socket.on("typing", (data) => {
      const receiverSocketId = onlineUsers.get(data.receiverId);
      if (receiverSocketId) {
        // io.to(receiverSocketId).emit("user-typing", {
        //   userId: socket.userId,
        //   username: socket.username,
        // });

        io.to(receiverSocketId).emit("user-typing", {
          userId: socket.userId,
          username: socket.username,
        });
      }
    });

    // Handle stop typing;

    socket.on("stop-typing", (data) => {
      const receiverSocketId = onlineUsers.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("user stop typing ", {
          userId: socket.userId,
        });
      }
    });

    // Handle message read
    socket.on("mark-read", async (data) => {
      try {
        await Message.updateMany(
          {
            sender: data.senderId,
            receiver: socket.userId,
            isRead: false,
          },
          {
            isRead: true,
            readAt: new Date(),
          }
        );

        // Notify sender that messages were read
        const senderSocketId = onlineUsers.get(data.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("messages-read", {
            readBy: socket.userId,
          });
        }
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    // Handle user status request
    socket.on("get-user-status", (data) => {
      const { userId } = data;
      const isOnline = onlineUsers.has(userId);
      socket.emit("user-status", { userId, isOnline });
    });

    socket.on("create-group", async ({ name, members }) => {
      try {
        // Validate inputs
        if (!name || !members || !Array.isArray(members)) {
          socket.emit("error", { message: "Invalid group data" });
          return;
        }

        // Create the group with current user as admin
        const group = await Group.create({
          name,
          members: [...members, socket.userId], // Add creator to members
          admins: [socket.userId], // Make creator an admin
        });

        // Populate members data
        await group.populate("members", "username avatar");
        await group.populate("admins", "username avatar");

        // Join the creator to the group room
        socket.join(group._id.toString());

        // Notify all members to join the group room
        members.forEach((memberId) => {
          const memberSocketId = onlineUsers.get(memberId);
          if (memberSocketId) {
            const memberSocket = io.sockets.sockets.get(memberSocketId);
            if (memberSocket) {
              memberSocket.join(group._id.toString());
            }
          }
        });

        // Emit to all members in the group room
        io.to(group._id.toString()).emit("group-created", group);

        // Also emit back to creator for confirmation
        socket.emit("group-created", group);

        console.log(`Group created: ${group.name} by ${socket.username}`);
      } catch (error) {
        console.error("Error creating group:", error);
        socket.emit("error", { message: "Failed to create group" });
      }
    });

    socket.on("send-group-message", async (data) => {
      try {
        const { groupId, content, messageType } = data;

        // Validate the group exists and user is a member
        const group = await Group.findById(groupId);
        if (!group) {
          socket.emit("error", { message: "Group not found" });
          return;
        }

        if (!group.members.includes(socket.userId)) {
          socket.emit("error", {
            message: "You are not a member of this group",
          });
          return;
        }

        // Create message - FIX: Use Message (capital M) not message
        const message = new Message({
          sender: socket.userId,
          group: groupId,
          content,
          messageType: messageType || "text",
        });

        await message.save();
        await message.populate("sender", "username avatar");

        // Emit to all group members
        io.to(groupId).emit("receive-group-messsage", message);

        console.log(
          `Group message sent in ${group.name} by ${socket.username}`
        );
      } catch (error) {
        console.error("Error sending group message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("group-typing", ({ groupId }) => {
      socket.to(groupId).emit("group-user-typing", {
        userId: socket.userId,
        username: socket.username,
      });
    });

    socket.on("group-stop-typing", ({ groupId }) => {
      socket.to(groupId).emit("group-user-stop-typing", {
        userId: socket.userId,
      });
    });

    socket.on("leave-group", async ({ groupId }) => {
      await Group.findByIdAndUpdate(groupId, {
        $pull: { members: socket.userId },
      });

      socket.leave(groupId);
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.username}`);

      onlineUsers.delete(socket.userId);

      // Update user offline status
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      // Emit updated online users list
      io.emit("online-users", Array.from(onlineUsers.keys()));
    });

    io.emit("connection-success", {
      message: "Successfully connected to the socket server",
      userId: socket.userId,
      username: socket.username,
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  });

  // Handle connection errors
  io.on("connection_error", (error) => {
    console.error("Socket connection error:", error);
  });
};
