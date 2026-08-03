import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
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
    const data = await pdfParse(buffer);
    console.log("📄 PDF TEXT LENGTH:", data.text?.length);
    console.log("📄 PDF TEXT PREVIEW:", data.text?.slice(0, 300));
    return data.text || "";

  } catch (err) {
    console.error("File parse error:", err.message);
    return "";
  }
};