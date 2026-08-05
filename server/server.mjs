import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";

/* =========================================================
   LOAD ENVIRONMENT VARIABLES
========================================================= */

dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  GROQ_API_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in server/.env"
  );

  process.exit(1);
}

/*
  Do not print your real API keys in the terminal.
*/
console.log("✅ Environment variables loaded");
console.log("✅ Supabase URL loaded");
console.log(
  "✅ Supabase anonymous key loaded:",
  SUPABASE_ANON_KEY ? "Yes" : "No"
);
console.log(
  "✅ Supabase service-role key loaded:",
  SUPABASE_SERVICE_ROLE_KEY ? "Yes" : "No"
);
console.log(
  "✅ Groq API key loaded:",
  GROQ_API_KEY ? "Yes" : "No"
);

/* =========================================================
   EXPRESS APPLICATION
========================================================= */

const app = express();

/*
  Main SkillForge server: port 5000
  CV Analyzer server: port 5001
*/
const PORT = Number(process.env.PORT) || 5000;

const APP_URL =
  process.env.APP_URL ||
  `http://localhost:${PORT}`;

/* =========================================================
   RESOLVE CLIENT FOLDER
========================================================= */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const CLIENT_PATH =
  path.join(
    __dirname,
    "..",
    "client"
  );

console.log(
  "Serving static files from:",
  CLIENT_PATH
);

/* =========================================================
   SUPABASE CONFIGURATION
========================================================= */

/*
  Node.js 20 does not provide the WebSocket implementation
  expected by the installed Supabase Realtime package.

  The installed "ws" package is therefore supplied as the
  Realtime transport.
*/
const supabaseOptions = {
  realtime: {
    transport: WebSocket,
  },

  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

/*
  Normal Supabase client.

  This client uses the anonymous key for normal user actions:
  - login
  - signup
  - forgot password
  - checking the logged-in user
*/
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseOptions
);

/*
  Optional server administrator client.

  It is only created when SUPABASE_SERVICE_ROLE_KEY exists.
  Never place the service-role key inside frontend code.
*/
const supabaseAdmin =
  SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        supabaseOptions
      )
    : null;

/*
  Use the administrator client for server-side database writes
  when configured. Otherwise use the normal client.
*/
const databaseClient =
  supabaseAdmin || supabase;

/* =========================================================
   GROQ CONFIGURATION
========================================================= */

const groq = GROQ_API_KEY
  ? new Groq({
      apiKey: GROQ_API_KEY,
    })
  : null;

async function callGroq(
  prompt,
  retries = 3
) {
  if (!groq) {
    throw new Error(
      "GROQ_API_KEY is missing from server/.env."
    );
  }

  for (
    let attempt = 0;
    attempt < retries;
    attempt += 1
  ) {
    try {
      const response =
        await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.7,
          max_tokens: 1024,
        });

      const result =
        response.choices?.[0]
          ?.message?.content;

      if (!result) {
        throw new Error(
          "Groq returned an empty response."
        );
      }

      return result.trim();

    } catch (error) {
      const isLastAttempt =
        attempt === retries - 1;

      if (isLastAttempt) {
        throw error;
      }

      console.warn(
        `Groq attempt ${
          attempt + 1
        } failed. Retrying...`
      );

      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }
  }

  throw new Error(
    "Groq request failed."
  );
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(
  express.static(CLIENT_PATH)
);

/* =========================================================
   MAIN PAGE
========================================================= */

app.get("/", (req, res) => {
  res.redirect(
    "/pages/LogIn.html"
  );
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.status(200).json({
      success: true,
      message:
        "SkillForge server is running.",
      port: PORT,
    });
  }
);

/* =========================================================
   AUTH: LOGIN
========================================================= */

app.post(
  "/api/auth/login",
  async (req, res) => {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    if (!email || !password) {
      return res.status(400).json({
        error:
          "Email and password are required.",
      });
    }

    try {
      const {
        data,
        error,
      } =
        await supabase.auth
          .signInWithPassword({
            email,
            password,
          });

      if (error) {
        return res.status(401).json({
          error: error.message,
        });
      }

      if (
        !data.user ||
        !data.session
      ) {
        return res.status(401).json({
          error:
            "Login failed. No user session was created.",
        });
      }

      return res.status(200).json({
        success: true,

        user: {
          id: data.user.id,
          email: data.user.email,
        },

        access_token:
          data.session.access_token,

        refresh_token:
          data.session.refresh_token,
      });

    } catch (error) {
      console.error(
        "❌ Login error:",
        error.message
      );

      return res.status(500).json({
        error:
          "An internal server error occurred.",
      });
    }
  }
);

/* =========================================================
   AUTH: SIGNUP
========================================================= */

app.post("/api/auth/signup", async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim()
      : "";

  const password =
    typeof req.body.password === "string"
      ? req.body.password
      : "";

  const firstNames =
    typeof req.body.firstNames === "string"
      ? req.body.firstNames.trim()
      : "";

  if (!email || !password || !firstNames) {
    return res.status(400).json({
      error: "Email, password and name are required.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long.",
    });
  }

  const nameParts = firstNames.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");

  const industry =
    typeof req.body.industry === "string"
      ? req.body.industry.trim()
      : "";

  const experienceLevel =
    typeof req.body.experienceLevel === "string"
      ? req.body.experienceLevel.trim()
      : "";

  const rolesTargeted =
    Array.isArray(req.body.rolesTargeted)
      ? req.body.rolesTargeted
          .map((role) =>
            typeof role === "string" ? role.trim() : ""
          )
          .filter(Boolean)
      : [];

  const skillsInterests =
    Array.isArray(req.body.skillsInterests)
      ? req.body.skillsInterests
          .map((skill) =>
            typeof skill === "string" ? skill.trim() : ""
          )
          .filter(Boolean)
      : [];

  if (
    !industry ||
    !experienceLevel ||
    rolesTargeted.length === 0 ||
    skillsInterests.length === 0
  ) {
    return res.status(400).json({
      error:
        "Industry, experience level, at least one role, and at least one skill are required.",
    });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    if (!data.user) {
      return res.status(400).json({
        error: "Signup succeeded but no user object was returned.",
      });
    }

    const userId = data.user.id;

    // Table users upsert

    const { error: usersInsertError } =
      await databaseClient.from("users").upsert(
        {
          id: userId,
          email,
        },
        { onConflict: "id" }
      );

    if (usersInsertError) {
      console.error(
        "❌ Error inserting into public.users:",
        usersInsertError
      );
      return res.status(500).json({
        error: "Account created in auth, but failed to create user record.",
      });
    }

    let targetIndustry = industry;
    if (industry === "Other") {
      const customIndustry =
        typeof req.body.sfCustomIndustry === "string"
          ? req.body.sfCustomIndustry.trim()
          : "";
      if (customIndustry) {
        targetIndustry = customIndustry;
      }
    }

    const { error: profileInsertError } =
      await databaseClient.from("user_profiles").upsert(
        {
          user_id: userId,
          first_name: firstName || "User",
          last_name: lastName || null,
          target_industry: targetIndustry || null,
          career_experience_level: experienceLevel || null,
          target_roles: rolesTargeted,
        },
        { onConflict: "user_id" }
      );

    if (profileInsertError) {
      console.error(
        "❌ Error inserting into public.user_profiles:",
        profileInsertError
      );
      return res.status(500).json({
        error: "Account created, but failed to create profile.",
      });
    }

    for (const skillName of skillsInterests) {
      const cleaned = skillName.trim();
      const normalized = cleaned.toLowerCase();

      const category = [
        "communication",
        "stakeholder management",
        "leadership",
        "teamwork",
        "problem solving",
        "negotiation",
        "conflict resolution",
        "resource planning",
      ].includes(normalized)
        ? "Soft Skill"
        : "Technical";

      const { data: skillRows, error: skillUpsertError } =
        await databaseClient
          .from("skills")
          .upsert(
            {
              name: cleaned,
              normalized_name: normalized,
              category,
            },
            { onConflict: "normalized_name" }
          )
          .select();

      if (skillUpsertError) {
        console.error(
          "❌ Error upserting skill:",
          skillName,
          skillUpsertError
        );
        continue;
      }

      const skill = skillRows?.[0];
      if (!skill) continue;

      const { error: userSkillInsertError } =
        await databaseClient.from("user_skills").insert({
          user_id: userId,
          skill_id: skill.skill_id,
        });

      if (userSkillInsertError) {
        console.warn(
          "⚠️ Error inserting into public.user_skills:",
          userSkillInsertError.message
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: data.session
        ? "Account created successfully."
        : "Account created. Check your email to confirm your account.",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    console.error("❌ Signup error:", error.message);
    return res.status(500).json({
      error: "An internal server error occurred.",
    });
  }
});

/* =========================================================
   AUTH: CURRENT USER
========================================================= */

app.get(
  "/api/auth/me",
  async (req, res) => {
    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error:
          "No valid access token was provided.",
      });
    }

    const accessToken =
      authHeader
        .replace("Bearer ", "")
        .trim();

    if (!accessToken) {
      return res.status(401).json({
        error:
          "No valid access token was provided.",
      });
    }

    try {
      const {
        data: {
          user,
        },
        error,
      } =
        await supabase.auth
          .getUser(accessToken);

      if (
        error ||
        !user
      ) {
        return res.status(401).json({
          error:
            "The session is invalid or has expired.",
        });
      }

      const firstName =
        user.user_metadata
          ?.first_name ||
        user.email
          ?.split("@")[0] ||
        "User";

      return res.status(200).json({
        id: user.id,
        firstName,
        email: user.email,
      });

    } catch (error) {
      console.error(
        "❌ /api/auth/me error:",
        error.message
      );

      return res.status(500).json({
        error:
          "An internal server error occurred.",
      });
    }
  }
);

/* =========================================================
   AUTH: FORGOT PASSWORD
========================================================= */

app.post(
  "/api/auth/forgot-password",
  async (req, res) => {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim()
        : "";

    if (!email) {
      return res.status(400).json({
        error:
          "Email is required.",
      });
    }

    try {
      const {
        error,
      } =
        await supabase.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo:
                `${APP_URL}/pages/ResetPassword.html`,
            }
          );

      if (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      /*
        Avoid confirming whether an email address exists.
      */
      return res.status(200).json({
        message:
          "If an account exists for that email address, a password-reset link has been sent.",
      });

    } catch (error) {
      console.error(
        "❌ Forgot-password error:",
        error.message
      );

      return res.status(500).json({
        error:
          "An internal server error occurred.",
      });
    }
  }
);

/* =========================================================
   AUTH: RESET PASSWORD
========================================================= */

app.patch(
  "/api/auth/reset-password",
  async (req, res) => {
    const accessToken =
      typeof req.body.access_token ===
      "string"
        ? req.body.access_token.trim()
        : "";

    const newPassword =
      typeof req.body.new_password ===
      "string"
        ? req.body.new_password
        : "";

    if (
      !accessToken ||
      !newPassword
    ) {
      return res.status(400).json({
        error:
          "Access token and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters long.",
      });
    }

    try {
      /*
        Create a temporary Supabase client that performs
        requests as the user represented by the reset token.
      */
      const userSupabase =
        createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          {
            ...supabaseOptions,

            global: {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },
            },
          }
        );

      const {
        data: {
          user,
        },
        error: userError,
      } =
        await userSupabase.auth
          .getUser(accessToken);

      if (
        userError ||
        !user
      ) {
        return res.status(401).json({
          error:
            "The password-reset link is invalid or has expired.",
        });
      }

      const {
        error: updateError,
      } =
        await userSupabase.auth
          .updateUser({
            password: newPassword,
          });

      if (updateError) {
        return res.status(400).json({
          error:
            updateError.message,
        });
      }

      return res.status(200).json({
        message:
          "Password reset successful. You can now log in.",
      });

    } catch (error) {
      console.error(
        "❌ Reset-password error:",
        error.message
      );

      return res.status(500).json({
        error:
          "An internal server error occurred.",
      });
    }
  }
);

/* =========================================================
   CAREER DISCOVERY
========================================================= */

const questionBank = {
  tech: [
    {
      question:
        "How do you approach solving technical problems?",

      options: [
        {
          text:
            "Break it into logical steps",

          traits: {
            tech: 3,
          },
        },

        {
          text:
            "Experiment until it works",

          traits: {
            tech: 2,
            design: 1,
          },
        },

        {
          text:
            "Look for existing solutions online",

          traits: {
            tech: 1,
            data: 1,
          },
        },
      ],
    },

    /*
      Add or keep your remaining technology questions here.
    */
  ],

  data: [
    /*
      Add or keep your data questions here.
    */
  ],

  design: [
    /*
      Add or keep your design questions here.
    */
  ],
};

const careers = [
  {
    type: "tech",
    title: "Software Developer",
    salary: "R30,000 – R75,000",

    desc:
      "Build applications and scalable systems.",

    skills: [
      "JavaScript",
      "React",
      "Node.js",
    ],

    demand: "High Demand",
    matchScore: 0,
  },

  {
    type: "data",
    title: "Data Analyst",
    salary: "R25,000 – R60,000",

    desc:
      "Analyze data to drive business decisions.",

    skills: [
      "SQL",
      "Excel",
      "Power BI",
    ],

    demand:
      "Very High Demand",

    matchScore: 0,
  },

  {
    type: "design",
    title: "UX Designer",
    salary: "R25,000 – R65,000",

    desc:
      "Design user-friendly digital experiences.",

    skills: [
      "Figma",
      "User Research",
      "Prototyping",
    ],

    demand: "High Demand",
    matchScore: 0,
  },
];

app.get(
  "/api/career-discovery/questions",
  (req, res) => {
    return res.status(200).json({
      questions:
        questionBank,

      careers,
    });
  }
);

app.post(
  "/api/career-discovery/scores",
  async (req, res) => {
    const {
      user_id,
      scores,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error:
          "user_id is required.",
      });
    }

    /*
      Scores can be saved to Supabase here later.
    */
    return res.status(200).json({
      success: true,
      user_id,
      scores:
        scores || {},
    });
  }
);

/* =========================================================
   INTERVIEW SIMULATOR
========================================================= */

const sessions = new Map();

function buildPersonaPrompt(
  persona,
  role,
  type
) {
  const roleLabel =
    role && role !== "any"
      ? role.replace(/-/g, " ")
      : "a general professional role";

  const interviewTypes = {
    hr: "HR/Behavioral",
    technical: "Technical",
    consulting:
      "Consulting & Case",
  };

  const typeLabel =
    interviewTypes[type] ||
    type ||
    "General";

  return `
You are ${persona.name}, ${persona.title}.

Your interview style:
${persona.style}

You are conducting a ${typeLabel} interview for the role of ${roleLabel}.

Rules:

- Stay fully in character as ${persona.name}.
- Ask realistic and role-relevant interview questions.
- When evaluating answers, be honest, constructive and specific.
- Keep questions concise.
- Do not mention that you are an AI.
  `.trim();
}

/* =========================================================
   INTERVIEW: START SESSION
========================================================= */

app.post(
  "/api/interview/start",
  async (req, res) => {
    const {
      user_id,
      job_role_id,
      question_type,
      persona,
    } = req.body;

    if (
      !persona ||
      !persona.name
    ) {
      return res.status(400).json({
        error:
          "An interview persona is required.",
      });
    }

    try {
      const prompt = `
${buildPersonaPrompt(
  persona,
  job_role_id,
  question_type
)}

Generate exactly five interview questions.

Return only a valid JSON array.

Each item must use this structure:

{
  "id": "q1",
  "text": "Question text"
}
      `.trim();

      let questions = null;

      for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
      ) {
        const raw =
          await callGroq(prompt);

        const match =
          raw.match(/\[[\s\S]*\]/);

        if (!match) {
          console.warn(
            `No interview-question JSON array on attempt ${
              attempt + 1
            }.`
          );

          continue;
        }

        try {
          const parsed =
            JSON.parse(match[0]);

          if (
            Array.isArray(parsed) &&
            parsed.length > 0
          ) {
            questions = parsed;
            break;
          }

        } catch (error) {
          console.warn(
            `Question JSON parsing failed on attempt ${
              attempt + 1
            }.`
          );
        }
      }

      if (!questions) {
        throw new Error(
          "Interview questions could not be generated."
        );
      }

      const sessionId =
        `sess_${Date.now()}_${
          Math.random()
            .toString(36)
            .slice(2, 9)
        }`;

      sessions.set(
        sessionId,
        {
          session_id:
            sessionId,

          user_id:
            user_id || null,

          job_role_id:
            job_role_id || null,

          question_type:
            question_type || "hr",

          persona,

          questions,

          answers: [],

          started_at:
            new Date()
              .toISOString(),
        }
      );

      /*
        Save the session to Supabase.
        Failure does not stop the interview.
      */
      try {
        const {
          error: insertError,
        } =
          await databaseClient
            .from(
              "interview_sessions"
            )
            .insert({
              id: sessionId,

              user_id:
                user_id || null,

              job_role_id:
                job_role_id ||
                null,

              question_type:
                question_type ||
                "hr",

              persona_id:
                persona.id ||
                persona.name,

              started_at:
                new Date()
                  .toISOString(),
            });

        if (insertError) {
          console.warn(
            "Supabase interview-session insert skipped:",
            insertError.message
          );
        }

      } catch (error) {
        console.warn(
          "Supabase interview-session insert skipped:",
          error.message
        );
      }

      return res.status(200).json({
        session_id:
          sessionId,

        questions,
      });

    } catch (error) {
      console.error(
        "❌ Start interview error:",
        error.message
      );

      return res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/* =========================================================
   INTERVIEW: ANSWER QUESTION
========================================================= */

app.post(
  "/api/interview/answer",
  async (req, res) => {
    const {
      session_id,
      question_id,
      user_answer,
      persona,
    } = req.body;

    if (!session_id) {
      return res.status(400).json({
        error:
          "session_id is required.",
      });
    }

    if (!question_id) {
      return res.status(400).json({
        error:
          "question_id is required.",
      });
    }

    if (
      typeof user_answer !== "string" ||
      !user_answer.trim()
    ) {
      return res.status(400).json({
        error:
          "An interview answer is required.",
      });
    }

    const session =
      sessions.get(session_id);

    if (!session) {
      return res.status(404).json({
        error:
          "Interview session not found.",
      });
    }

    const question =
      session.questions.find(
        (item) =>
          item.id === question_id
      );

    if (!question) {
      return res.status(404).json({
        error:
          "Interview question not found.",
      });
    }

    try {
      const selectedPersona =
        session.persona ||
        persona;

      const prompt = `
${buildPersonaPrompt(
  selectedPersona,
  session.job_role_id,
  session.question_type
)}

Interview question:
"${question.text}"

Candidate answer:
"${user_answer}"

Evaluate the answer.

Return only a valid JSON object using this structure:

{
  "score": 1,
  "breakdown": {
    "confidence": 1,
    "clarity": 1,
    "structure": 1
  },
  "feedback": "Two or three sentences of specific feedback.",
  "tip": "One actionable improvement tip."
}

Every score must be a whole number from 1 to 10.
      `.trim();

      let evaluation = null;

      for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
      ) {
        const raw =
          await callGroq(prompt);

        const match =
          raw.match(/\{[\s\S]*\}/);

        if (!match) {
          console.warn(
            `No answer-evaluation JSON object on attempt ${
              attempt + 1
            }.`
          );

          continue;
        }

        try {
          evaluation =
            JSON.parse(match[0]);

          break;

        } catch (error) {
          console.warn(
            `Answer JSON parsing failed on attempt ${
              attempt + 1
            }.`
          );
        }
      }

      if (!evaluation) {
        throw new Error(
          "The interview answer could not be evaluated."
        );
      }

      session.answers.push({
        question_id,

        question_text:
          question.text,

        user_answer:
          user_answer.trim(),

        evaluation,
      });

      return res.status(200).json({
        overallScore:
          evaluation.score,

        breakdown:
          evaluation.breakdown,

        feedback:
          evaluation.feedback,

        tips: [
          evaluation.tip,
        ].filter(Boolean),
      });

    } catch (error) {
      console.error(
        "❌ Answer evaluation error:",
        error.message
      );

      return res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/* =========================================================
   INTERVIEW: END SESSION
========================================================= */

app.post(
  "/api/interview/end",
  async (req, res) => {
    const {
      session_id,
    } = req.body;

    if (!session_id) {
      return res.status(400).json({
        error:
          "session_id is required.",
      });
    }

    const session =
      sessions.get(session_id);

    if (!session) {
      return res.status(404).json({
        error:
          "Interview session not found.",
      });
    }

    const answered =
      session.answers.filter(
        (answer) =>
          answer.evaluation
      );

    const calculateAverage =
      (key) => {
        const values =
          answered.map(
            (answer) =>
              Number(
                answer.evaluation
                  ?.breakdown?.[key]
              ) || 0
          );

        if (!values.length) {
          return 0;
        }

        const total =
          values.reduce(
            (sum, value) =>
              sum + value,
            0
          );

        return Math.round(
          total /
          values.length
        );
      };

    const overallScore =
      answered.length
        ? Math.round(
            answered.reduce(
              (
                total,
                answer
              ) =>
                total +
                (
                  Number(
                    answer
                      .evaluation
                      ?.score
                  ) || 0
                ),
              0
            ) /
            answered.length
          )
        : 0;

    let tips = [];

    try {
      const questionAndAnswerText =
        answered
          .map(
            (answer) => `
Question:
${answer.question_text}

Candidate answer:
${answer.user_answer}

Feedback:
${answer.evaluation?.feedback || ""}
            `.trim()
          )
          .join("\n\n");

      const prompt = `
${buildPersonaPrompt(
  session.persona,
  session.job_role_id,
  session.question_type
)}

Full interview transcript:

${questionAndAnswerText}

Give three to five overall improvement tips.

Return only a valid JSON array of strings.
      `.trim();

      for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
      ) {
        const raw =
          await callGroq(prompt);

        const match =
          raw.match(/\[[\s\S]*\]/);

        if (!match) {
          console.warn(
            `No interview-tips JSON array on attempt ${
              attempt + 1
            }.`
          );

          continue;
        }

        try {
          const parsed =
            JSON.parse(match[0]);

          if (Array.isArray(parsed)) {
            tips = parsed;
            break;
          }

        } catch (error) {
          console.warn(
            `Tips JSON parsing failed on attempt ${
              attempt + 1
            }.`
          );
        }
      }

    } catch (error) {
      console.warn(
        "Interview tips generation failed:",
        error.message
      );
    }

    if (!tips.length) {
      tips = [
        "Use specific and measurable examples in your answers.",
        "Follow the STAR method for behavioural questions.",
        "Speak at a measured pace and avoid unnecessary filler words.",
      ];
    }

    const perQuestion =
      session.answers.map(
        (answer) => ({
          question:
            answer.question_text,

          answer:
            answer.user_answer ||
            null,

          feedback:
            answer.evaluation
              ?.feedback ||
            null,
        })
      );

    /*
      Update the database session.
      Failure does not block the final result.
    */
    try {
      const {
        error: updateError,
      } =
        await databaseClient
          .from(
            "interview_sessions"
          )
          .update({
            ended_at:
              new Date()
                .toISOString(),

            overall_score:
              overallScore,
          })
          .eq(
            "id",
            session_id
          );

      if (updateError) {
        console.warn(
          "Supabase interview-session update skipped:",
          updateError.message
        );
      }

    } catch (error) {
      console.warn(
        "Supabase interview-session update skipped:",
        error.message
      );
    }

    sessions.delete(session_id);

    return res.status(200).json({
      overallScore,

      breakdown: {
        confidence:
          calculateAverage(
            "confidence"
          ),

        clarity:
          calculateAverage(
            "clarity"
          ),

        structure:
          calculateAverage(
            "structure"
          ),
      },

      tips,

      perQuestion,
    });
  }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "❌ Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      error:
        "An unexpected server error occurred.",
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      `✅ Main SkillForge server running on ${APP_URL}`
    );

    console.log(
      `🔐 Login page: ${APP_URL}/pages/LogIn.html`
    );
  }
);