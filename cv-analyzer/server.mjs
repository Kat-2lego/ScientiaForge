import express from "express";
import cors from "cors";
import cvRoutes from "./routes/cvRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ PUT THIS HERE (VERY IMPORTANT)
app.use("/api/cv", cvRoutes);

app.get("/", (req, res) => {
  res.send("Server is working ✅");
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});