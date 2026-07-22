import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import cvRoutes from "./routes/cvRoutes.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve files from SkillForge/client
const clientPath = path.join(__dirname, "..", "client");
app.use(express.static(clientPath));

// API routes
app.use("/api/cv", cvRoutes);

// Open the login page by default
app.get("/", (req, res) => {
  res.sendFile(path.join(clientPath, "pages", "LogIn.html"));
});

// PORT
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Login page: http://localhost:${PORT}/pages/LogIn.html`);
});