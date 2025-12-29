import mongoose, { mongo } from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isGroup: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Group", groupSchema);
