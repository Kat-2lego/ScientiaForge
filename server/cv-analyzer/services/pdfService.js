import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
import mammoth from "mammoth";

export const extractTextFromFile = async (buffer, mimetype) => {
  try {

    // TXT
    if (mimetype === "text/plain") {
      return buffer.toString("utf-8");
    }

    // DOCX
    if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      console.log("📄 DOCX TEXT LENGTH:", result.value?.length);
      return result.value || "";
    }

    // PDF
    const parser = new PDFParse({ data: buffer });

    try {
      const textResult = await parser.getText();
      const text = textResult?.text || "";

      console.log("📄 PDF TEXT LENGTH:", text.length);
      console.log("📄 PDF TEXT PREVIEW:", text.slice(0, 300));

      return text;
    } finally {
      await parser.destroy();
    }

  } catch (err) {
    console.error("File parse error:", err.message);
    return "";
  }
};