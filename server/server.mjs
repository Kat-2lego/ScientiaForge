import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import ws from "ws";

dotenv.config();

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY);
console.log("PORT:", process.env.PORT);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 5001;

/* ========================= */
/* PATH SETUP */
/* ========================= */

const __filename = fileURLToPath(import.meta.url);
<<<<<<< Updated upstream
const __dirname  = path.dirname(__filename);
=======
const __dirname = path.dirname(__filename);

>>>>>>> Stashed changes
const CLIENT_PATH = path.join(__dirname, "..", "client");

console.log("Serving static files from:", CLIENT_PATH);

/* ========================= */
/* SUPABASE */
/* ========================= */

const supabase = createClient(
  process.env.SUPABASE_URL,
<<<<<<< Updated upstream
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Groq ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroq(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1024,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Groq attempt ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
=======
  process.env.SUPABASE_ANON_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

/* ========================= */
/* GEMINI AI */
/* ========================= */

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

/* ========================= */
/* MIDDLEWARE */
/* ========================= */
>>>>>>> Stashed changes

app.use(cors());

app.use(express.json());
<<<<<<< Updated upstream
app.use(express.static(CLIENT_PATH));

=======

app.use(express.urlencoded({ extended: true }));

app.use(express.static(CLIENT_PATH));

/* ========================= */
/* HOME */
/* ========================= */

>>>>>>> Stashed changes
app.get("/", (req, res) => {
  res.redirect("/pages/LogIn.html");
});

<<<<<<< Updated upstream
// ─────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────
=======
/* ========================= */
/* LOGIN */
/* ========================= */
>>>>>>> Stashed changes

app.post("/api/auth/login", async (req, res) => {

  const { email, password } = req.body;
<<<<<<< Updated upstream
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
=======

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  try {

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      return res.status(401).json({
        error: error.message,
      });
    }
>>>>>>> Stashed changes

    res.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
      access_token: data.session.access_token  // ← add this
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Server error",
    });

  }

});

<<<<<<< Updated upstream
=======
/* ========================= */
/* SIGNUP */
/* ========================= */

>>>>>>> Stashed changes
app.post("/api/auth/signup", async (req, res) => {

  const { email, password, firstNames } = req.body;
<<<<<<< Updated upstream
  if (!email || !password || !firstNames)
    return res.status(400).json({ error: "All fields required." });

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstNames.split(" ")[0],
          last_name:  firstNames.split(" ").slice(1).join(" ") || " ",
=======

  if (!email || !password || !firstNames) {
    return res.status(400).json({
      error: "All fields required.",
    });
  }

  try {

    const { data, error } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstNames.split(" ")[0],
            last_name:
              firstNames
                .split(" ")
                .slice(1)
                .join(" ") || "",
          },
>>>>>>> Stashed changes
        },
      });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      user: {
        id: data.user?.id,
      },
    });
<<<<<<< Updated upstream
    if (error) throw error;
    res.json({ success: true, user: { id: data.user?.id } });
=======

>>>>>>> Stashed changes
  } catch (err) {

    console.error("❌ Signup Error:", err.message);

    res.status(500).json({
      error: err.message,
    });

  }

});

<<<<<<< Updated upstream
// GET /api/auth/me
app.get("/api/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: "Invalid session" });

    const firstName = user.user_metadata?.first_name || user.email.split("@")[0];

    res.json({ firstName, email: user.email });
  } catch (err) {
    console.error("❌ /api/auth/me error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────
// CAREER DISCOVERY
// ─────────────────────────────────────────────────────────────────
=======
/* ========================= */
/* CAREER DISCOVERY */
/* ========================= */
>>>>>>> Stashed changes

const questionBank = {
  tech: [
    {
      question: "How do you approach solving technical problems?",
      options: [
<<<<<<< Updated upstream
        { text: "Break it into logical steps",        traits: { tech: 3 } },
        { text: "Experiment until it works",          traits: { tech: 2, design: 1 } },
        { text: "Look for existing solutions online", traits: { tech: 1, data: 1 } },
=======
        {
          text: "Break it into logical steps",
          traits: { tech: 3 },
        },
        {
          text: "Experiment until it works",
          traits: { tech: 2, design: 1 },
        },
        {
          text: "Look for existing solutions online",
          traits: { tech: 1, data: 1 },
        },
>>>>>>> Stashed changes
      ],
    },
  ],
<<<<<<< Updated upstream
  data: [
    // ... your data questions
  ],
  design: [
    // ... your design questions
  ],
=======

  data: [],

  design: [],
>>>>>>> Stashed changes
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
  },
];

app.get("/api/career-discovery/questions", (req, res) => {
<<<<<<< Updated upstream
  res.json({ questions: questionBank, careers });
});

=======

  res.json({
    questions: questionBank,
    careers,
  });

});

/* ========================= */
/* STORE USER SCORES */
/* ========================= */

>>>>>>> Stashed changes
app.post("/api/career-discovery/scores", async (req, res) => {

  const { user_id, scores } = req.body;
<<<<<<< Updated upstream
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────
// INTERVIEW SIMULATOR
// ─────────────────────────────────────────────────────────────────

const sessions = new Map();

function buildPersonaPrompt(persona, role, type) {
  const roleLabel = role && role !== "any" ? role.replace(/-/g, " ") : "a general professional role";
  const typeLabel = { hr: "HR/Behavioral", technical: "Technical", consulting: "Consulting & Case" }[type] || type;
  return `You are ${persona.name}, ${persona.title}.
Your interview style: ${persona.style}
You are conducting a ${typeLabel} interview for the role of ${roleLabel}.

Rules:
- Stay fully in character as ${persona.name} at all times.
- Ask realistic, role-relevant interview questions.
- When evaluating answers be honest, constructive, and specific.
- Keep questions concise (1–3 sentences).
- Do NOT break character or mention that you are an AI.`;
}

// POST /api/interview/start
app.post("/api/interview/start", async (req, res) => {
  const { user_id, job_role_id, question_type, persona } = req.body;

  if (!persona?.name)
    return res.status(400).json({ error: "persona is required" });

  try {
    const prompt = `${buildPersonaPrompt(persona, job_role_id, question_type)}

Generate exactly 5 interview questions as a JSON array.
Each item: { "id": "q1", "text": "..." }
Return ONLY the JSON array, no markdown, no explanation.`;

    // Retry loop — silently retries up to 3 times if JSON is malformed
    let questions = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw   = await callGroq(prompt);
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          questions = JSON.parse(match[0]);
          break; // success
        } catch (e) {
          console.warn(`JSON parse attempt ${attempt + 1} failed, retrying...`);
        }
      } else {
        console.warn(`No JSON array on attempt ${attempt + 1}, retrying...`);
      }
    }
    if (!questions) throw new Error("Failed to generate questions after 3 attempts");

    const session_id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    sessions.set(session_id, {
      session_id,
      user_id,
      job_role_id,
      question_type,
      persona,
      questions,
      answers: [],
      started_at: new Date().toISOString(),
    });

    // Save to Supabase (non-blocking)
    try {
      await supabase.from("interview_sessions").insert({
        id:           session_id,
        user_id:      user_id || "guest",
        job_role_id:  job_role_id || null,
        question_type,
        persona_id:   persona.id,
        started_at:   new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Supabase insert skipped:", e.message);
    }

    res.json({ session_id, questions });
  } catch (err) {
    console.error("❌ Start interview error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interview/answer
app.post("/api/interview/answer", async (req, res) => {
  const { session_id, question_id, user_answer, persona } = req.body;

  const session = sessions.get(session_id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const question = session.questions.find(q => q.id === question_id);
  if (!question)  return res.status(404).json({ error: "Question not found" });

  try {
    const p      = session.persona || persona;
    const prompt = `${buildPersonaPrompt(p, session.job_role_id, session.question_type)}

Interview question asked: "${question.text}"
Candidate's answer: "${user_answer}"

Evaluate this answer and respond ONLY with a JSON object (no markdown):
{
  "score": <number 1-10>,
  "breakdown": {
    "confidence": <number 1-10>,
    "clarity":    <number 1-10>,
    "structure":  <number 1-10>
  },
  "feedback": "<2-3 sentences of specific honest feedback in your persona voice>",
  "tip": "<one actionable improvement tip>"
}`;

    // Retry loop for answer evaluation
    let evaluation = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw   = await callGroq(prompt);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          evaluation = JSON.parse(match[0]);
          break; // success
        } catch (e) {
          console.warn(`Answer JSON parse attempt ${attempt + 1} failed, retrying...`);
        }
      } else {
        console.warn(`No JSON object on attempt ${attempt + 1}, retrying...`);
      }
    }
    if (!evaluation) throw new Error("Failed to evaluate answer after 3 attempts");

    session.answers.push({ question_id, question_text: question.text, user_answer, evaluation });

    res.json({
      overallScore: evaluation.score,
      breakdown:    evaluation.breakdown,
      feedback:     evaluation.feedback,
      tips:         [evaluation.tip],
    });
  } catch (err) {
    console.error("❌ Answer evaluation error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interview/end
app.post("/api/interview/end", async (req, res) => {
  const { session_id } = req.body;

  const session = sessions.get(session_id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const answered = session.answers.filter(a => a.evaluation);

  const avg = (key) => {
    const vals = answered.map(a => a.evaluation?.breakdown?.[key] ?? 0);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  };

  const overallScore = answered.length
    ? Math.round(answered.reduce((s, a) => s + (a.evaluation?.score ?? 0), 0) / answered.length)
    : 0;

  let tips = [];
  try {
    const qaText = answered.map(a =>
      `Q: ${a.question_text}\nA: ${a.user_answer}\nFeedback: ${a.evaluation?.feedback || ""}`
    ).join("\n\n");

    const prompt = `${buildPersonaPrompt(session.persona, session.job_role_id, session.question_type)}

Full interview transcript:
${qaText}

Give 3–5 overall improvement tips as a JSON array of strings.
Return ONLY the JSON array, no markdown.`;

    // Retry loop for tips
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw   = await callGroq(prompt);
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          tips = JSON.parse(match[0]);
          break; // success
        } catch (e) {
          console.warn(`Tips JSON parse attempt ${attempt + 1} failed, retrying...`);
        }
      } else {
        console.warn(`No tips JSON on attempt ${attempt + 1}, retrying...`);
      }
    }
  } catch (e) {
    console.warn("Tips generation failed:", e.message);
  }

  // Fallback tips if all retries failed
  if (!tips.length) {
    tips = [
      "Use specific, quantified examples in your answers.",
      "Follow the STAR method for behavioural questions.",
      "Speak at a measured pace and avoid filler words.",
    ];
  }

  const perQuestion = session.answers.map(a => ({
    question: a.question_text,
    answer:   a.user_answer || null,
    feedback: a.evaluation?.feedback || null,
  }));

  // Save to Supabase (non-blocking)
  try {
    await supabase.from("interview_sessions").update({
      ended_at:      new Date().toISOString(),
      overall_score: overallScore,
    }).eq("id", session_id);
  } catch (e) {
    console.warn("Supabase update skipped:", e.message);
  }

  sessions.delete(session_id);

  res.json({
    overallScore,
    breakdown: {
      confidence: avg("confidence"),
      clarity:    avg("clarity"),
      structure:  avg("structure"),
    },
    tips,
    perQuestion,
  });
});

//Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:5001/pages/ResetPassword.html', // change this to your reset page URL
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'A reset link has been sent to that email.' });

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

//Reset Password
app.patch("/api/auth/reset-password", async(req, res) => {
  const { access_token, new_password} = req.body;

  if(!access_token || !new_password){
    return res.status(400).json({error: "access_token and new_password are required"});
  }

  if(new_password.length < 8){
    return res.status(400).json({error: "Password must be at least 8 characters long"});
  }

  try{
    const { data: { user }, error: userError } = await supabase.auth.getUser(access_token);

    if(userError || !user){
      return res.status(401).json({ error: "Invalid or expired reset link."});
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    });

    if(updateError){
      return res.status(500).json({error: updateError.message});
    }

    return res.status(200).json({ message: "Password reset successful. You can now log in"});

  }catch(err){
    return res.status(500).json({error: "Internal server error"});
  }
});

// ─────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
=======

  if (!user_id) {
    return res.status(400).json({
      error: "user_id required",
    });
  }

  res.json({
    success: true,
  });

});

/* ========================= */
/* START SERVER */
/* ========================= */

app.listen(PORT, () => {

  console.log(`🚀 Server running on http://localhost:${PORT}`);

});
>>>>>>> Stashed changes
