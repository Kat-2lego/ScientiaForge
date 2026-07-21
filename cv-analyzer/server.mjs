

import express from "express";
import cors from "cors";

import cvRoutes from "./routes/cvRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// routes
app.use("/api/cv", cvRoutes);

// health check
app.get("/", (req, res) => {
  res.send("🚀 SkillForge AI Server Running");
});

// PORT (fallback included)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});