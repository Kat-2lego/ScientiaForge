import { extractTextFromPDF } from "../services/pdfService.js";

export const uploadCV = async (req, res) => {
  try {
    console.log("🔥 ROUTE HIT CONFIRMED");

    if (!req.file) {
      return res.status(400).json({
        message: "No file received ❌",
        score: 0
      });
    }

    const text = await extractTextFromPDF(req.file.buffer);

    // 🔥 SIMPLE CV SCORING LOGIC
    let score = 40;

    if (text.includes("JavaScript")) score += 15;
    if (text.includes("React")) score += 15;
    if (text.includes("Node")) score += 10;
    if (text.includes("Python")) score += 10;
    if (text.includes("SQL")) score += 10;
    if (text.length > 1000) score += 10;

    if (score > 100) score = 100;

    return res.status(200).json({
      message: "CV processed successfully ✅",
      fileName: req.file.originalname,
      cvText: text,
      score: score
    });

  } catch (error) {
    console.log("❌ ERROR:", error);

    return res.status(500).json({
      message: "Error processing CV ❌",
      score: 0,
      error: error.message
    });
  }
};