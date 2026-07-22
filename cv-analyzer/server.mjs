import "dotenv/config";
import express from "express";
import cors from "cors";

import cvRoutes from "./routes/cvRoutes.js";

const app = express();

const PORT =
  Number(process.env.PORT) || 5001;

app.use(
  cors({
    origin: [
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:5501",
      "http://127.0.0.1:5501"
    ]
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use("/api/cv", cvRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message:
      "SkillForge CV Analyzer API is running."
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "SkillForge CV Analyzer",
    uploadEndpoint: "/api/cv/upload",
    improveEndpoint: "/api/cv/improve"
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "CV Analyzer endpoint not found."
  });
});

app.listen(PORT, () => {
  console.log(
    `🚀 CV Analyzer API running on http://localhost:${PORT}`
  );

  console.log(
    `📄 Upload endpoint: http://localhost:${PORT}/api/cv/upload`
  );

  console.log(
    `✨ Improve endpoint: http://localhost:${PORT}/api/cv/improve`
  );
});