import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "jhsdbfijlsdhoifhsilufhsdilfhiuwegh";

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({ error: "User not Found" });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid Token" });
  }
};

export default authMiddleware;
