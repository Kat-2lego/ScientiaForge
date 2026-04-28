from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import fitz
import google.generativeai as genai
import os
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from dotenv import load_dotenv
import json
import re

load_dotenv()

app = Flask(__name__)
CORS(app)

if os.getenv("GOOGLE_API_KEY"):
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
    model = genai.GenerativeModel("gemini-1.5-flash")
else:
    model = None

state = {
    "prev_score": 65
}

SOFTWARE_DEV_KEYWORDS = [
    "javascript", "typescript", "python", "java", "c#", "go", "golang",
    "react", "vue", "angular", "next.js", "node.js", "express", "django",
    "flask", "spring boot", "rest api", "rest apis", "graphql", "microservices",
    "postgresql", "mysql", "mongodb", "redis", "sql", "git", "github",
    "docker", "kubernetes", "ci/cd", "ci cd", "agile", "scrum", "testing",
    "jest", "cypress", "unit testing", "system design", "scalability",
    "authentication", "authorization", "api development", "debugging",
    "performance optimization", "aws", "azure", "gcp"
]

ACTION_VERBS = [
    "developed", "designed", "built", "implemented", "optimized", "improved",
    "created", "led", "launched", "managed", "architected", "engineered",
    "automated", "delivered", "reduced", "increased", "streamlined"
]

def normalize_text(text):
    return re.sub(r"\s+", " ", text.lower()).strip()

def extract_pdf_text(file_bytes):
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    return "".join(page.get_text() for page in doc)

def has_metrics(text):
    lower = text.lower()
    return bool(re.search(r"\b\d+%|\b\d+\+|\b\d+\s?(users|clients|projects|years|teams|requests|downloads|tickets|apps?)\b", lower))

def detect_sections(text):
    lower = text.lower()
    return {
        "education": any(k in lower for k in ["education", "degree", "diploma", "certificate"]),
        "experience": any(k in lower for k in ["experience", "work experience", "employment", "professional experience"]),
        "skills": any(k in lower for k in ["skills", "technical skills", "core competencies"]),
        "summary": any(k in lower for k in ["summary", "professional summary", "profile", "objective"])
    }

def keyword_match(text, keywords):
    lower = normalize_text(text)
    matched = [k for k in keywords if k in lower]
    missing = [k for k in keywords if k not in lower]
    return matched, missing

def build_feedback(text, sections, matched, missing):
    lower = normalize_text(text)
    feedback = []

    if sections["education"]:
        feedback.append("Strong education section")
    else:
        feedback.append("Add a clear education section")

    if any(v in lower for v in ACTION_VERBS):
        feedback.append("Good use of action verbs")
    else:
        feedback.append("Use stronger action verbs")

    if has_metrics(text):
        feedback.append("Good use of measurable impact")
    else:
        feedback.append("No measurable achievements")

    if sections["skills"] and len(matched) >= 6:
        feedback.append("Skills section is keyword-aligned")
    else:
        feedback.append("Skills section too generic")

    if sections["summary"]:
        feedback.append("Clear professional summary")
    else:
        feedback.append("Add a concise professional summary")

    if missing:
        feedback.append(f"Missing key software skills: {', '.join(missing[:4])}")

    return list(dict.fromkeys(feedback))

def build_quick_fixes(text, sections, matched, missing):
    lower = normalize_text(text)
    quick_fixes = []

    if not has_metrics(text):
        quick_fixes.append("Add measurable achievements to experience bullets")

    if len(matched) < 6:
        quick_fixes.append("Add missing job keywords for better ATS match")

    if not sections["summary"]:
        quick_fixes.append("Add a short professional summary")

    if not sections["skills"]:
        quick_fixes.append("Create a clearer technical skills section")

    if not any(v in lower for v in ACTION_VERBS):
        quick_fixes.append("Rewrite bullets with stronger action verbs")

    if len(text.split()) < 250:
        quick_fixes.append("Expand experience detail to show impact")

    if missing:
        quick_fixes.append(f"Prioritize these missing skills: {', '.join(missing[:3])}")

    return list(dict.fromkeys(quick_fixes))

def improve_cv(text, matched, missing):
    improved = text.strip()
    improved += "\n\n--- IMPROVEMENT NOTES ---\n"
    improved += "- Rewrite weak bullets using stronger action verbs.\n"
    improved += "- Add measurable outcomes to experience sections.\n"
    improved += "- Add relevant software developer keywords naturally.\n"
    if missing:
        improved += f"- Missing target skills to consider: {', '.join(missing[:6])}\n"
    return improved

def fallback_analysis(text, job_desc=""):
    sections = detect_sections(text)
    matched, missing = keyword_match(text, SOFTWARE_DEV_KEYWORDS[:12])
    ats = 45
    if sections["skills"]:
        ats += 10
    if sections["experience"]:
        ats += 8
    if sections["education"]:
        ats += 5
    if len(matched) >= 4:
        ats += 12
    if has_metrics(text):
        ats += 7
    ats = min(100, ats)

    content = 40
    if sections["summary"]:
        content += 10
    if sections["experience"]:
        content += 12
    if has_metrics(text):
        content += 15
    if any(v in normalize_text(text) for v in ACTION_VERBS):
        content += 10
    content = min(100, content)

    formatting = 50
    if "\n" in text:
        formatting += 8
    if sections["education"] and sections["experience"] and sections["skills"]:
        formatting += 15
    formatting = min(100, formatting)

    skills = min(100, int((len(matched) / 12) * 100))

    overall = round((ats * 0.3) + (content * 0.3) + (formatting * 0.2) + (skills * 0.2))
    match = min(100, int((len(matched) / 12) * 100))
    prev_score = state["prev_score"]

    feedback = build_feedback(text, sections, matched, missing)
    quick_fixes = build_quick_fixes(text, sections, matched, missing)
    improved_cv = improve_cv(text, matched, missing)

    return {
        "overall": overall,
        "match": match,
        "target_role": "Software Developer",
        "ats": ats,
        "content": content,
        "formatting": formatting,
        "skills": skills,
        "missing_skills": missing[:6],
        "feedback": feedback,
        "quick_fixes": quick_fixes,
        "prev_score": prev_score,
        "improved_cv": improved_cv
    }

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/analyze_cv", methods=["POST"])
def analyze_cv():
    file = request.files.get("cv_file")
    job_desc = request.form.get("job_desc", "")

    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        file_bytes = file.read()
        text = extract_pdf_text(file_bytes)
        if not text.strip():
            return jsonify({"error": "Could not extract text from PDF"}), 400
    except Exception:
        return jsonify({"error": "Invalid PDF file"}), 400

    previous_score = state["prev_score"]

    if model:
        prompt = f"""
You are a CV analyst for a Software Developer role.

Analyze the CV against the job description and return ONLY valid JSON.

Rules:
- Do not invent experience.
- Base scores on the uploaded CV text.
- Make feedback and quick fixes dynamic based on the analysis.
- Return realistic scores from 0 to 100.
- Return missing_skills as an array of short keywords.
- Return improved_cv as a rewritten version of the same CV, preserving facts and improving wording.

CV TEXT:
{text[:4000]}

JOB DESCRIPTION:
{job_desc}

Return JSON with this exact structure:
{{
  "overall": 80,
  "match": 75,
  "target_role": "Software Developer",
  "ats": 78,
  "content": 74,
  "formatting": 82,
  "skills": 69,
  "missing_skills": ["Docker", "PostgreSQL"],
  "feedback": ["..."],
  "quick_fixes": ["..."],
  "improved_cv": "..."
}}
"""
        try:
            response = model.generate_content(prompt)
            cleaned = response.text.strip().replace("```json", "").replace("```", "")
            data = json.loads(cleaned)

            result = {
                "overall": int(data.get("overall", 78)),
                "match": int(data.get("match", 72)),
                "target_role": data.get("target_role", "Software Developer"),
                "ats": int(data.get("ats", 75)),
                "content": int(data.get("content", 70)),
                "formatting": int(data.get("formatting", 80)),
                "skills": int(data.get("skills", 65)),
                "missing_skills": data.get("missing_skills", []),
                "feedback": data.get("feedback", []),
                "quick_fixes": data.get("quick_fixes", []),
                "prev_score": previous_score,
                "improved_cv": data.get("improved_cv", text)
            }
        except Exception:
            result = fallback_analysis(text, job_desc)
    else:
        result = fallback_analysis(text, job_desc)

    state["prev_score"] = result["overall"]
    return jsonify(result)

@app.route("/download_cv", methods=["POST"])
def download_cv():
    data = request.get_json(silent=True) or {}
    improved = data.get("improved", "AI Enhanced CV - Score: 78%")

    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    p.setFont("Helvetica-Bold", 16)
    p.drawString(72, height - 72, "IMPROVED CV")

    p.setFont("Helvetica", 11)
    y = height - 100
    for line in improved.split("\n"):
        if y < 72:
            p.showPage()
            p.setFont("Helvetica", 11)
            y = height - 72
        p.drawString(72, y, line[:110])
        y -= 16

    p.save()
    buffer.seek(0)

    return send_file(buffer, as_attachment=True, download_name="improved_cv.pdf", mimetype="application/pdf")

if __name__ == "__main__":
    print("CV Analyzer API running on http://127.0.0.1:5000")
    app.run(debug=True, port=5000)





















    