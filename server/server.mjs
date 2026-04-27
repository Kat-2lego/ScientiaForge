import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY);
console.log("PORT:", process.env.PORT);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5001;

// --- Resolve path to client folder (ESM-safe)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_PATH = path.join(__dirname, "..", "client");

console.log("Serving static files from:", CLIENT_PATH);

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// --- Gemini LLM ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Middleware ---
app.use(cors());
app.use(express.json());

// ✅ Serve static files (HTML, CSS, images from client/)
app.use(express.static(CLIENT_PATH));

// ✅ Redirect / to login page
app.get("/", (req, res) => {
  res.redirect("/pages/LogIn.html");
});

// ✅ AUTH LOGIN (Supabase)
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// ✅ AUTH SIGNUP (Updated for Reliability)
app.post("/api/auth/signup", async (req, res) => {
  const { email, password, firstNames } = req.body;

  if (!email || !password || !firstNames) {
    return res.status(400).json({ error: "All fields required." });
  }

  try {
    // 1. Sign up user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstNames.split(" ")[0],
          last_name: firstNames.split(" ").slice(1).join(" ") || " ",
        },
      },
    });

    if (error) throw error;

    // 2. SUCCESS - return user
    res.json({ success: true, user: { id: data.user?.id } });
  } catch (err) {
    console.error("❌ Signup Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// --- CAREER DISCOVERY ---

const questionBank = {
  tech: [
    {
      question: "How do you approach solving technical problems?",
      options: [
        { text: "Break it into logical steps", traits: { tech: 3 } },
        { text: "Experiment until it works", traits: { tech: 2, design: 1 } },
        { text: "Look for existing solutions online", traits: { tech: 1, data: 1 } }
      ]
    },
    // ... your full tech questions
  ],
  data: [
    // ... your data questions
  ],
  design: [
    // ... your design questions
  ]
};

const careers = [
  {
    type: "tech",
    title: "Software Developer",
    salary: "R30,000 – R75,000",
    desc: "Build applications and scalable systems.",
    skills: ["JavaScript", "React", "Node.js"],
    demand: "High Demand",
    matchScore: 0,
  },
  {
    type: "data",
    title: "Data Analyst",
    salary: "R25,000 – R60,000",
    desc: "Analyze data to drive business decisions.",
    skills: ["SQL", "Excel", "Power BI"],
    demand: "Very High Demand",
    matchScore: 0,
  },
  {
    type: "design",
    title: "UX Designer",
    salary: "R25,000 – R65,000",
    desc: "Design user-friendly digital experiences.",
    skills: ["Figma", "User Research", "Prototyping"],
    demand: "High Demand",
    matchScore: 0,
  }
];

app.get("/api/career-discovery/questions", (req, res) => {
  res.json({
    questions: questionBank,
    careers: careers,
  });
});

// Optional: store user scores if you want
app.post("/api/career-discovery/scores", async (req, res) => {
  const { user_id, scores } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: "user_id required" });
  }

  // You can insert into a `user_career_scores` table here, for example
  /* const { data, error } = await supabase
    .from("user_career_scores")
    .upsert({ user_id, scores }) */

  res.json({ success: true });
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});