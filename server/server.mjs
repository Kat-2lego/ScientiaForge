import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import cvRoutes from "./cv-analyzer/routes/cvRoutes.js";
import { dirname, join } from 'path';
import Stripe from 'stripe';
import careerPathfinderRoutes from "./routes/careerPathfinder.js";
import studyHubRoutes from "./routes/studyHub.js";

import { getOccupationSkills } from "./escoClient.mjs";
import { computeSkillGap } from "./skillMatcher.mjs";
import { searchEscoOccupations } from "./escoClient.mjs";
import { INDUSTRIES } from "./industries.mjs";
import { LEARNING_MODULES } from "./learningModules.mjs";





async function logAudit(userId, action, { entity = null, entityId = null, desc = null, req = null } = {}) {
  try {
    const ip = req?.ip || req?.headers?.["x-forwarded-for"] || null;
    const ua = req?.headers?.["user-agent"] || null;

    const { error } = await databaseClient.rpc("insert_audit_log", {
      p_user_id: userId,
      p_action: action,
      p_entity: entity,
      p_entity_id: entityId,
      p_desc: desc,
      p_ip: ip,
      p_ua: ua,
    });

    if (error) {
      console.warn("Audit log skipped:", error.message);
    }
  } catch (error) {
    console.warn("Audit log skipped:", error.message);
  }
}

/* =========================================================
   LOAD ENVIRONMENT VARIABLES
========================================================= */

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
});

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
          // Groq deprecated llama-3.1-8b-instant (shut down ~Aug 2026).
          // openai/gpt-oss-20b is Groq's own recommended replacement.
          model: "openai/gpt-oss-20b",

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
   STRIPE CONFIGURATION
   (must exist before the /webhook route below uses it)
========================================================= */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/*
  Stripe webhook — MUST be registered before express.json() and
  use express.raw(), because Stripe's signature check needs the
  untouched raw request body, not a parsed JSON object.
*/
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const intent = event.data.object;

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const userId = intent.metadata.userId;
      const productId = intent.metadata.productId;

      // 1. Look up the plan in subscription_plans so we know how long it lasts
      const { data: plan, error: planError } = await databaseClient
        .from('subscription_plans')
        .select('subscription_id, duration_days')
        .eq('name', productId)
        .single();

      if (planError || !plan) {
        console.error('Could not find subscription plan for productId:', productId, planError);
        break;
      }

      const endDate = plan.duration_days
        ? new Date(Date.now() + plan.duration_days * 86400000).toISOString()
        : null;

      const planType = productId === 'premium' ? 'premium' : 'standard';

      const { error: userError } = await databaseClient
        .from('users')
        .update({ plan_type: planType })
        .eq('id', userId);

        if (userError) {
          console.error('Failed to update user plan_type:', userError);
          break;
        }

      // 2. Create or reactivate the user's subscription
      const { data: subscription, error: subError } = await databaseClient
        .from('user_subscriptions')
        .upsert({
          user_id: userId,
          subscription_id: plan.subscription_id,
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: endDate,
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (subError) {
        console.error('Subscription upsert failed:', subError);
      }

      // 3. Log the payment, linked to that subscription
      const { error: paymentError } = await databaseClient.from('payments').upsert({
        provider_ref: intent.id,
        user_id: userId,
        user_subscription_id: subscription?.user_subscription_id ?? null,
        amount_zar: intent.amount,
        currency: intent.currency,
        status: 'succeeded',
        payment_method: intent.payment_method_types?.[0] ?? null,
        provider: 'stripe',
        paid_at: new Date().toISOString(),
      }, { onConflict: 'provider_ref' });

      if (paymentError) console.error('Supabase payment insert failed:', paymentError);
      break;
    }

    case 'payment_intent.payment_failed': {
      const { error } = await databaseClient.from('payments').upsert({
        provider_ref: intent.id,
        user_id: intent.metadata.userId,
        amount_zar: intent.amount,
        currency: intent.currency,
        status: 'failed',
        provider: 'stripe',
      }, { onConflict: 'provider_ref' });

      if (error) console.error('Supabase insert failed:', error);
      break;
    }
  }

  res.json({ received: true });
});

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(
  express.static(CLIENT_PATH)
);

app.use("/api/cv", cvRoutes);
app.use("/api/career-pathfinder", careerPathfinderRoutes);
app.use("/api/study-hub", studyHubRoutes);

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
   TEXT-TO-SPEECH (Edge TTS — free, human neural voices)
========================================================= */

const PERSONA_VOICES = {
  "senior-engineer": { voice: "en-US-GuyNeural", rate: 1.0, pitch: "+0Hz" },
  "hr-manager": { voice: "en-ZA-LeahNeural", rate: 0.97, pitch: "+10Hz" },
  "product-manager": { voice: "en-GB-RyanNeural", rate: 1.0, pitch: "-5Hz" },
  "consultant": { voice: "en-IN-NeerjaNeural", rate: 1.08, pitch: "+5Hz" },
};

const DEFAULT_VOICE = { voice: "en-US-AriaNeural", rate: 1.0, pitch: "+0Hz" };

// Any custom/unknown persona still gets a consistent, distinct voice for
// the whole session instead of always falling back to the same default.
const FALLBACK_VOICE_POOL = [
  "en-US-AriaNeural",
  "en-US-DavisNeural",
  "en-GB-SoniaNeural",
  "en-AU-NatashaNeural",
  "en-ZA-LukeNeural",
  "en-IE-ConnorNeural",
];

function pickFallbackVoice(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const voice = FALLBACK_VOICE_POOL[Math.abs(h) % FALLBACK_VOICE_POOL.length];
  return { voice, rate: 1.0, pitch: "+0Hz" };
}

app.post("/api/tts", async (req, res) => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  const personaId = typeof req.body.personaId === "string" ? req.body.personaId : "";

  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }

  const voiceConfig =
    PERSONA_VOICES[personaId] || (personaId ? pickFallbackVoice(personaId) : DEFAULT_VOICE);

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceConfig.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = await tts.toStream(text, {
      rate: voiceConfig.rate,
      pitch: voiceConfig.pitch,
    });

    res.setHeader("Content-Type", "audio/mpeg");

    audioStream.on("error", (err) => {
      console.error("❌ TTS stream error:", err.message);
      if (!res.headersSent) res.status(500).end();
    });

    audioStream.pipe(res);
  } catch (error) {
    console.error("❌ TTS generation error:", error.message);
    return res.status(500).json({ error: "TTS generation failed." });
  }
});

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

      logAudit(data.user.id, "sign_in", { desc: "User signed in", req });

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
        role: "job_seeker",
        auth_provider: "email",
        plan_type: "standard",
        is_active: true,
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

    logAudit(userId, "sign_up", { desc: "User account created", req });

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
   AUTH: LOGOUT
========================================================= */

app.post("/api/auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(400).json({ error: "No access token provided." });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();

  if (!accessToken) {
    return res.status(400).json({ error: "No access token provided." });
  }

  try {
    // Resolve which user this token belongs to before invalidating it, so
    // we can log the sign-out — once signOut() runs, the token is dead and
    // this lookup would no longer work.
    let loggingOutUserId = null;
    try {
      const { data: userData } = await supabase.auth.getUser(accessToken);
      loggingOutUserId = userData?.user?.id || null;
    } catch (_) {
      // Non-fatal — logout still proceeds even if we can't identify the user.
    }

    if (!supabaseAdmin) {
      // No service-role key configured — client-side token clearing is all we can do.
      if (loggingOutUserId) logAudit(loggingOutUserId, "sign_out", { desc: "User signed out (local only)", req });
      return res.status(200).json({
        success: true,
        message: "Logged out locally. Server-side session revocation unavailable.",
      });
    }

    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken);

    if (error) {
      console.warn("⚠️ Supabase signOut warning:", error.message);
      // Still tell the client to proceed with local logout even if this fails.
    }

    if (loggingOutUserId) logAudit(loggingOutUserId, "sign_out", { desc: "User signed out", req });

    return res.status(200).json({ success: true, message: "Logged out." });
  } catch (error) {
    console.error("❌ Logout error:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
});

/* =========================================================
   AUTH: DELETE ACCOUNT
   Fixed: the previous version called res.json({ ok: true, ... }) BEFORE
   the deletion actually ran, which meant it always reported success even
   when nothing was deleted, and would crash with "headers already sent"
   if the code below ever tried to send a second response. Now uses
   requireAuth (consistent with every other authenticated route) and
   sends exactly one response, only after the deletion actually completes
   or definitively fails.
========================================================= */

app.post("/api/delete-account", requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res
        .status(500)
        .json({ error: "Server not configured for account deletion." });
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(req.userId);

    if (deleteError) {
      console.error("❌ Supabase delete error:", deleteError.message);
      return res.status(500).json({ error: "Failed to delete account." });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("❌ Delete-account error:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
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
   AUTH HELPER — resolve user from Bearer token
========================================================= */

async function getUserFromToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  if (!accessToken) return null;

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

async function requireAuth(req, res, next) {
  const user = await getUserFromToken(req);

  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  req.userId = user.id;
  next();
}

/* =========================================================
   PREMIUM ACCESS CHECK
   Gate any premium-only route with: requireAuth, requirePremium
========================================================= */

async function requirePremium(req, res, next) {
  const { data, error } = await databaseClient
    .from('user_subscriptions')
    .select('status, end_date')
    .eq('user_id', req.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Premium check failed:', error);
    return res.status(500).json({ error: 'Could not verify subscription status.' });
  }

  if (!data) {
    return res.status(403).json({ error: 'This feature requires a premium subscription.' });
  }

  if (data.end_date && new Date(data.end_date) < new Date()) {
    return res.status(403).json({ error: 'Your subscription has expired.' });
  }

  next();
}

/* =========================================================
   STRIPE PAYMENT
========================================================= */

const PRODUCTS = {
  premium: {
    amount: Number(process.env.PREMIUM_AMOUNT),
    currency: 'zar',
    label: 'Premium Plan',
  },
};

app.post('/create-payment-intent', requireAuth, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'A valid productId is required' });
    }

    const product = PRODUCTS[productId];

    if (!product) {
      return res.status(400).json({ error: 'Unknown product' });
    }

    if (!product.amount || product.amount <= 0) {
      console.error(`Invalid amount configured for product "${productId}"`);
      return res.status(500).json({ error: 'Product is misconfigured, please contact support' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: product.currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        productId,
        userId: req.userId, // set by requireAuth above
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: product.amount,
      currency: product.currency,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the payment' });
  }
});

/* =========================================================
   BILLING: GET BILLING DATA
========================================================= */

// Maps the DB's account_plan enum values to the plan keys the billing
// UI already renders (Billing.html's data-plan="free" / data-plan="premium").
// Update this map — not the frontend — if the enum grows more tiers.
const PLAN_TYPE_MAP = {
  standard: 'free',
  premium: 'premium',
};

app.get('/api/billing/data', requireAuth, async (req, res) => {
  try {
    // 1. Current plan — plan_type lives on public.users
    const { data: userRow, error: userError } = await databaseClient
      .from('users')
      .select('plan_type')
      .eq('id', req.userId)
      .single();

    if (userError || !userRow) {
      console.error('❌ Error fetching user plan_type:', userError);
      return res.status(500).json({ error: 'Failed to load billing data.' });
    }

    const planType = PLAN_TYPE_MAP[userRow.plan_type] || 'free';

    // 2. Active subscription — used for the "next billing date" field
    const { data: subscription, error: subError } = await databaseClient
      .from('user_subscriptions')
      .select('status, end_date')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .maybeSingle();

    if (subError) {
      console.warn('⚠️ Could not load subscription:', subError.message);
    }

    // 3. Payment history
    const { data: payments, error: paymentsError } = await databaseClient
      .from('payments')
      .select('provider_ref, amount_zar, currency, status, paid_at')
      .eq('user_id', req.userId)
      .order('paid_at', { ascending: false });

    if (paymentsError) {
      console.warn('⚠️ Could not load payment history:', paymentsError.message);
    }

    const paymentHistory = (payments || [])
      .filter((payment) => payment.paid_at) // skip rows with no paid_at (e.g. failed attempts)
      .map((payment) => ({
        date: payment.paid_at,
        description: planType === 'premium' ? 'Premium Plan - Monthly' : 'Plan payment',
        // Stripe amounts are stored in the smallest currency unit (cents).
        amount: (payment.amount_zar || 0) / 100,
        status: payment.status === 'succeeded' ? 'paid' : payment.status,
        invoiceId: payment.provider_ref,
      }));

    // 4. Billing details — there's no billing_details table yet, so this
    // is populated from the authenticated Supabase user for now.
    const rawToken = req.headers.authorization.replace('Bearer ', '').trim();
    const { data: { user: authUser } } = await supabase.auth.getUser(rawToken);

    return res.status(200).json({
      currentPlan: {
        type: planType,
        nextBillingDate: subscription?.end_date || null,
      },
      paymentHistory,
      billingDetails: {
        email: authUser?.email || null,
        name: authUser?.user_metadata?.first_name
          ? `${authUser.user_metadata.first_name} ${authUser.user_metadata.last_name || ''}`.trim()
          : null,
        company: null,
        country: null,
        postalCode: null,
        // No card details are stored yet (no payment_methods table, and
        // the Stripe webhook doesn't persist a customer/payment-method
        // ID). Wire this up once that data exists — until then the
        // frontend correctly shows "Not added".
        paymentMethods: [],
      },
    });
  } catch (error) {
    console.error('❌ /api/billing/data error:', error.message);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

/* =========================================================
   SKILL CATEGORY HELPER (shared with signup logic)
========================================================= */

const SOFT_SKILLS = [
  "communication",
  "stakeholder management",
  "leadership",
  "teamwork",
  "problem solving",
  "negotiation",
  "conflict resolution",
  "resource planning",
];

function categorizeSkill(normalizedName) {
  return SOFT_SKILLS.includes(normalizedName) ? "Soft Skill" : "Technical";
}

/* =========================================================
   SKILLS: GET MY SKILLS
========================================================= */

app.get("/api/skills/me", requireAuth, async (req, res) => {
  try {
    const { data, error } = await databaseClient
      .from("user_skills")
      .select("user_skill_id, level, years_exp, skills(skill_id, name, category)")
      .eq("user_id", req.userId);

    if (error) {
      console.error("❌ Error fetching user_skills:", error);
      return res.status(500).json({ error: "Failed to load your skills." });
    }

    const skills = data.map((row) => ({
      user_skill_id: row.user_skill_id,
      skill_id: row.skills?.skill_id,
      name: row.skills?.name,
      category: row.skills?.category,
      level: row.level,
      years_exp: row.years_exp,
    }));

    return res.status(200).json({ skills });
  } catch (error) {
    console.error("❌ /api/skills/me GET error:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
});

/* =========================================================
   SKILLS: ADD A SKILL
========================================================= */

app.post("/api/skills/me", requireAuth, async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const level = typeof req.body.level === "string" ? req.body.level : "beginner";

  if (!name) {
    return res.status(400).json({ error: "A skill name is required." });
  }

  const normalized = name.toLowerCase();
  const category = categorizeSkill(normalized);

  try {
    const { data: skillRows, error: skillUpsertError } = await databaseClient
      .from("skills")
      .upsert(
        { name, normalized_name: normalized, category },
        { onConflict: "normalized_name" }
      )
      .select();

    if (skillUpsertError) {
      console.error("❌ Error upserting skill:", skillUpsertError);
      return res.status(500).json({ error: "Failed to save the skill." });
    }

    const skill = skillRows?.[0];
    if (!skill) {
      return res.status(500).json({ error: "Skill could not be created." });
    }

    const { error: userSkillError } = await databaseClient
      .from("user_skills")
      .upsert(
        { user_id: req.userId, skill_id: skill.skill_id, level },
        { onConflict: "user_id,skill_id" }
      );

    if (userSkillError) {
      console.error("❌ Error linking user_skills:", userSkillError);
      return res.status(500).json({ error: "Failed to add the skill to your profile." });
    }

    return res.status(201).json({
      success: true,
      skill: { skill_id: skill.skill_id, name: skill.name, category: skill.category, level },
    });
  } catch (error) {
    console.error("❌ /api/skills/me POST error:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
});

/* =========================================================
   SKILLS: REMOVE A SKILL
========================================================= */

app.delete("/api/skills/me/:skillId", requireAuth, async (req, res) => {
  const { skillId } = req.params;

  if (!skillId) {
    return res.status(400).json({ error: "skillId is required." });
  }

  try {
    const { error } = await databaseClient
      .from("user_skills")
      .delete()
      .eq("user_id", req.userId)
      .eq("skill_id", skillId);

    if (error) {
      console.error("❌ Error deleting user_skill:", error);
      return res.status(500).json({ error: "Failed to remove the skill." });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ /api/skills/me DELETE error:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
});

/* =========================================================
   JOBS (placeholder — swap for a real job_roles table later)
========================================================= */

const jobRoles = [
  { id: 1, title: "Software Engineer", requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Node.js", "Git", "APIs", "Databases", "Python", "SQL"] },
  { id: 2, title: "Frontend Developer", requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Figma", "Git", "APIs"] },
  { id: 3, title: "Full Stack Developer", requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Node.js", "SQL", "Git", "APIs", "Databases"] },
  { id: 4, title: "Data Analyst", requiredSkills: ["SQL", "Excel", "Python", "PowerBI", "Tableau", "Data Pipelines"] },
];

// ESCO-backed jobs endpoint
app.get("/api/jobs", async (req, res) => {
  try {
    const q =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : "software developer";

    const occupations = await searchEscoOccupations(q);

    // Map ESCO occupations to the shape your frontend expects
    const jobs = occupations.map((occ) => ({
      id: occ.escoUri,          // use ESCO URI as job id
      title: occ.title,
      escoOccupationUri: occ.escoUri,
    }));

    return res.json({ jobs });
  } catch (error) {
    console.error("❌ /api/jobs ESCO error:", error);
    return res.status(500).json({
      error: "Failed to load careers",
      details: error.message,
    });
  }
});
/* =========================================================
   JOB TITLE SEARCH (for Interview Simulator target-role field)
========================================================= */

const JOB_CATEGORIES = {
  "Technology": [
    "Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer",
    "Mobile Developer (iOS)", "Mobile Developer (Android)", "DevOps Engineer",
    "Site Reliability Engineer", "Cloud Engineer", "Data Engineer", "Data Analyst",
    "Data Scientist", "Machine Learning Engineer", "AI Engineer", "QA Engineer",
    "Test Automation Engineer", "Database Administrator", "Systems Administrator",
    "Network Engineer", "Cybersecurity Analyst", "Security Engineer", "IT Support Specialist",
    "Technical Support Engineer", "Solutions Architect", "Software Architect",
    "Engineering Manager", "Technical Lead", "Product Manager", "Product Owner",
    "Scrum Master", "Systems Analyst", "UX Designer", "UI Designer", "Product Designer",
    "UX Researcher", "Game Developer", "Embedded Systems Engineer", "Blockchain Developer",
    "Data Warehouse Engineer", "BI Analyst", "ERP Consultant", "IT Auditor", "Technical Writer",
    "Release Engineer", "Platform Engineer", "Integration Engineer",
  ],

  "Business & Finance": [
    "Accountant", "Bookkeeper", "Financial Analyst", "Financial Advisor", "Auditor",
    "Tax Consultant", "Investment Banker", "Actuary", "Credit Analyst", "Risk Analyst",
    "Compliance Officer", "Treasury Analyst", "Payroll Administrator", "Business Analyst",
    "Management Consultant", "Operations Manager", "Procurement Specialist",
    "Supply Chain Analyst", "Logistics Coordinator", "Insurance Underwriter",
  ],

  "Sales & Marketing": [
    "Sales Representative", "Sales Executive", "Account Manager", "Business Development Manager",
    "Marketing Coordinator", "Digital Marketing Specialist", "SEO Specialist",
    "Social Media Manager", "Content Marketer", "Brand Manager", "Market Research Analyst",
    "Public Relations Specialist", "Copywriter", "Retail Sales Associate", "Sales Engineer",
    "Customer Success Manager", "E-commerce Manager", "Event Coordinator",
  ],

  "Healthcare": [
    "Registered Nurse", "Doctor / General Practitioner", "Pharmacist", "Physiotherapist",
    "Occupational Therapist", "Dentist", "Dental Hygienist", "Radiographer",
    "Medical Laboratory Technician", "Paramedic", "Clinical Psychologist", "Dietitian",
    "Optometrist", "Veterinarian", "Healthcare Administrator", "Medical Sales Representative",
    "Caregiver / Home Health Aide", "Speech Therapist",
  ],

  "Education": [
    "Primary School Teacher", "High School Teacher", "Early Childhood Educator",
    "University Lecturer", "Teaching Assistant", "School Principal", "Curriculum Developer",
    "Special Education Teacher", "Tutor", "Education Consultant", "Librarian",
    "Training and Development Specialist",
  ],

  "Legal": [
    "Lawyer / Attorney", "Paralegal", "Legal Secretary", "Legal Advisor",
    "Compliance Manager", "Contract Manager", "Notary", "Court Clerk",
  ],

  "Creative & Media": [
    "Graphic Designer", "Video Editor", "Photographer", "Journalist", "Copywriter",
    "Content Creator", "Illustrator", "Animator", "Sound Engineer", "Film Director",
    "Fashion Designer", "Interior Designer", "Art Director",
  ],

  "Engineering & Skilled Trades": [
    "Civil Engineer", "Mechanical Engineer", "Electrical Engineer", "Chemical Engineer",
    "Industrial Engineer", "Structural Engineer", "Mining Engineer", "Environmental Engineer",
    "Electrician", "Plumber", "Welder", "Carpenter", "HVAC Technician", "Mechanic",
    "Construction Site Manager", "Quantity Surveyor", "Architect", "Draughtsman",
  ],

  "Hospitality, Retail & Service": [
    "Chef", "Restaurant Manager", "Hotel Manager", "Waiter / Waitress", "Barista",
    "Retail Store Manager", "Cashier", "Flight Attendant", "Travel Agent", "Tour Guide",
    "Housekeeping Supervisor", "Event Planner",
  ],

  "Public Sector, Science & Other": [
    "Police Officer", "Firefighter", "Social Worker", "Urban Planner",
    "Environmental Scientist", "Biologist", "Chemist", "Physicist", "Research Scientist",
    "Agricultural Specialist", "Human Resources Manager", "Recruiter", "Office Administrator",
    "Executive Assistant", "Translator / Interpreter", "Pilot", "Truck Driver",
  ],
};

const JOB_TITLES = [...new Set(Object.values(JOB_CATEGORIES).flat())];

// A small, cross-industry sample shown before the user types anything —
// picking one from most categories instead of always showing the same
// handful of tech titles.
const DEFAULT_JOB_SUGGESTIONS = [
  "Software Engineer", "Registered Nurse", "Accountant", "High School Teacher",
  "Marketing Coordinator", "Civil Engineer", "Lawyer / Attorney", "Graphic Designer",
];

app.get("/api/jobs/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

  if (!q) {
    return res.status(200).json({ results: DEFAULT_JOB_SUGGESTIONS });
  }

  const results = JOB_TITLES.filter((title) => title.toLowerCase().includes(q)).slice(0, 8);
  return res.status(200).json({ results });
});
// GET /api/industries
app.get("/api/industries", async (req, res) => {
  try {
    return res.json({
      industries: INDUSTRIES.map((ind) => ({
        id: ind.id,
        label: ind.label,
      })),
    });
  } catch (error) {
    console.error("❌ /api/industries error:", error);
    return res.status(500).json({
      error: "Failed to load industries",
      details: error.message,
    });
  }
});

// GET /api/industries/:id/careers

app.get("/api/industries/:id/careers", async (req, res) => {
  try {
    const industry = INDUSTRIES.find((i) => i.id === req.params.id);

    if (!industry) {
      return res.status(404).json({
        error: "Industry not found",
      });
    }

    return res.json({
      careers: industry.careers.map((c) => ({
        title: c.title,
        jobId: c.escoUri, // keep same shape as before
      })),
    });
  } catch (error) {
    console.error("❌ /api/industries/:id/careers error:", error);
    return res.status(500).json({
      error: "Failed to load careers",
      details: error.message,
    });
  }
});

// Test ESCO route
app.get("/api/esco/occupations", async (req, res) => {
  try {
    const q =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : "data analyst";

    console.log("ESCO occupations search for:", q);

    const occupations = await searchEscoOccupations(q);

    console.log("ESCO occupations result count:", occupations.length);

    return res.json({ occupations });
  } catch (error) {
    console.error("❌ ESCO occupation search error:", error);
    return res.status(500).json({
      error: "Could not search ESCO occupations",
      details: error.message,
    });
  }
});
/* =========================================================
   SKILL GAP (placeholder matching — swap once real data exists)
========================================================= */

app.post("/api/skillgap", async (req, res) => {
  try {
    const { userSkillNames, jobId } = req.body;

    console.log("🧠 /api/skillgap called");
    console.log("  userSkillNames:", userSkillNames);
    console.log("  jobId (ESCO URI):", jobId);

    if (!Array.isArray(userSkillNames)) {
      return res.status(400).json({
        error: "userSkillNames must be an array of strings",
      });
    }

    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({
        error: "jobId must be a non-empty string (ESCO occupation URI)",
      });
    }

    let requiredSkills = await getOccupationSkills(jobId, "en");

    if (!requiredSkills || requiredSkills.length === 0) {
      console.warn("No ESCO skills found for occupation:", jobId);
      requiredSkills = [
        "Communication",
        "Problem solving",
        "Teamwork",
        "Time management",
        "Adaptability",
      ];
    }

    const { have, missing } = computeSkillGap(userSkillNames, requiredSkills, 0.5);

    const matchScore = requiredSkills.length
      ? Math.round((have.length / requiredSkills.length) * 100)
      : 0;

    return res.json({
      have,
      missing,
      matchScore,
      meta: {
        source: requiredSkills.length > 0 && requiredSkills[0] !== "Communication"
          ? "ESCO"
          : "fallback",
        occupationUri: jobId,
      },
    });
  } catch (error) {
    console.error("❌ /api/skillgap error:", error);
    return res.status(500).json({
      error: "Failed to compute skill gap",
      details: error.message,
    });
  }
});;

// GET /api/roadmap?skills=skill1,skill2,skill3

app.get("/api/roadmap", async (req, res) => {
  try {
    const skillsParam = req.query.skills || "";

    const userSkills = skillsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (userSkills.length === 0) {
      return res.json({ roadmap: [] });
    }

    const userSkillsLower = userSkills.map((s) => s.toLowerCase());
    const userSet = new Set(userSkillsLower);

    // Score modules by how many missing skills they cover
    const scoredModules = LEARNING_MODULES.map((mod) => {
      const modSkillsLower = mod.skills.map((s) => s.toLowerCase());
      const overlap = modSkillsLower.filter((s) => userSet.has(s)).length;
      return { module: mod, overlap };
    });

    // Keep only modules that match at least one missing skill
    const relevant = scoredModules
      .filter((m) => m.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5); // top 5

    const roadmap = relevant.map((m) => ({
      id: m.module.id,
      title: m.module.title,
      description: m.module.description,
      steps: m.module.steps,
      resourceUrl: m.module.resourceUrl,
      matchedSkills: m.module.skills.filter((s) =>
        userSet.has(s.toLowerCase())
      ),
    }));

    return res.json({ roadmap });
  } catch (error) {
    console.error("❌ /api/roadmap error:", error);
    return res.status(500).json({
      error: "Failed to generate roadmap",
      details: error.message,
    });
  }
});
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
   INTERVIEW DURATION HELPERS
========================================================= */

const MIN_INTERVIEW_MINUTES = 5;
const MAX_INTERVIEW_MINUTES = 30;

function clampInterviewMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return 15; // sensible default
  return Math.min(MAX_INTERVIEW_MINUTES, Math.max(MIN_INTERVIEW_MINUTES, Math.round(n)));
}

// Question-count target: candidate can ask for a minimum of 5 questions
// with no upper bound ("no limit" = null, meaning purely time-driven as
// before). MAX_QUESTIONS_PER_SESSION below still applies as an internal
// safety ceiling regardless of what the candidate requests.
const MIN_TARGET_QUESTIONS = 5;

function clampTargetQuestionCount(count) {
  if (count === null || count === undefined || count === "") return null; // no limit
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(MIN_TARGET_QUESTIONS, Math.round(n));
}

/* =========================================================
   QUESTION GENERATION (shared by start + on-demand top-up)
========================================================= */

// Question objects now carry richer metadata so the frontend can:
//  - show a suggested time budget (quant/engineering questions get longer)
//  - render a plain-text diagram / given-data block for problems that need one
//  - show a "final numeric answer" field when a specific number is expected
function buildQuestionBatchPrompt(persona, job_role_id, question_type, { count, isOpening }) {
  const base = buildPersonaPrompt(persona, job_role_id, question_type);

  const structureInstructions = isOpening
    ? `
The FIRST question must be a warm opening question inviting the candidate to
introduce themselves ("type": "intro", "answerFormat": "text", "diagram": null).

The SECOND question must be a soft, human question about their interests or
motivations, not technical ("type": "soft", "answerFormat": "text", "diagram": null).

Any remaining questions in this batch of ${count} should be substantive
${question_type === "technical" ? "technical" : "role-relevant"} questions,
increasing gradually in depth.
`
    : `
Continue the interview naturally from where it left off with ${count} more
substantive ${question_type === "technical" ? "technical" : "role-relevant"}
question(s), increasing gradually in depth. Do not repeat an icebreaker or
soft/motivation question — the interview is already underway.
`;

  return `
${base}

Generate exactly ${count} interview question(s) as a JSON array.
${structureInstructions}

For technical, quantitative, or engineering-relevant roles, include
questions that require the candidate to actually work through numbers,
physics, or math to reach a concrete answer where appropriate — for example
estimation problems, statistics/probability questions, system-design
capacity math, or physics/statics/circuit problems for engineering roles.
Base this on the target role and interview type — a behavioral/HR interview
should stay mostly conversational, while a technical interview for an
engineering, data, or quantitative role should include at least one such
question when it fits naturally.

For EACH question object, include:
- "type": one of "intro", "soft", "conceptual", "quant", "engineering".
- "suggestedTimeMinutes": a realistic whole number of minutes to budget —
  1-2 for intro/soft questions, 2-3 for conceptual questions, 4-6 for
  quant/engineering questions that require real calculation.
- "answerFormat": "numeric" only when the expected answer is a specific
  number the candidate should state explicitly; otherwise "text".
- "diagram": when the question involves given data, measurements, forces,
  a dataset, or a scenario that benefits from a simple visual, provide a
  plain-text/ASCII diagram or a clearly labeled list of given values (e.g.
  "Beam length: 4m\\nLoad: 500N at midpoint\\nSupports: pinned at both ends").
  Otherwise set this to null. Never reference or describe an actual image
  file — plain text only.

Keep the tone natural and conversational, the way a real interviewer would.

Return only a valid JSON array. Each item must use this exact structure:

{
  "id": "q1",
  "text": "Question text",
  "type": "conceptual",
  "suggestedTimeMinutes": 3,
  "answerFormat": "text",
  "diagram": null
}
  `.trim();
}

async function generateQuestionBatch(persona, job_role_id, question_type, { count, isOpening }) {
  const prompt = buildQuestionBatchPrompt(persona, job_role_id, question_type, { count, isOpening });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raw = await callGroq(prompt);
    const match = raw.match(/\[[\s\S]*\]/);

    if (!match) {
      console.warn(`No interview-question JSON array on attempt ${attempt + 1}.`);
      continue;
    }

    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      console.warn(`Question JSON parsing failed on attempt ${attempt + 1}.`);
    }
  }

  return null;
}

// Internal safety cap — prevents runaway generation even for "no limit"
// sessions if a client keeps requesting new questions indefinitely.
const MAX_QUESTIONS_PER_SESSION = 200;

/* =========================================================
   INTERVIEW: START SESSION
========================================================= */

app.post(
  "/api/interview/start",
  requireAuth,
  async (req, res) => {
    const {
      job_role_id,
      question_type,
      persona,
      duration_minutes,
      question_count,
    } = req.body;

    // The authenticated user is the source of truth for user_id — not
    // whatever the client sends. Previously this came from a
    // localStorage key ("skillforge_user_id") that was never actually
    // set anywhere in the frontend, so every session was silently being
    // attributed to the literal string "guest_user", which isn't a
    // valid UUID and would fail the FK constraint on insert.
    const user_id = req.userId;

    if (
      !persona ||
      !persona.name
    ) {
      return res.status(400).json({
        error:
          "An interview persona is required.",
      });
    }

    const durationMinutes = clampInterviewMinutes(duration_minutes);
    const targetQuestionCount = clampTargetQuestionCount(question_count);
    const resolvedJobRoleId = await getOrCreateJobRoleId(job_role_id);

    try {
      const rawQuestions = await generateQuestionBatch(
        persona,
        job_role_id,
        question_type,
        { count: 3, isOpening: true }
      );

      if (!rawQuestions) {
        throw new Error(
          "Interview questions could not be generated."
        );
      }

      const questions = rawQuestions.map((q, i) => ({
        id: `q${i + 1}`,
        text: q.text,
        type: q.type || "conceptual",
        suggestedTimeMinutes: Number(q.suggestedTimeMinutes) || 2,
        answerFormat: q.answerFormat === "numeric" ? "numeric" : "text",
        diagram: typeof q.diagram === "string" && q.diagram.trim() ? q.diagram : null,
      }));

      // A real UUID now, not a human-readable "sess_..." string — the
      // interview_sessions.id column is typed uuid, and the mismatch
      // between the two was the exact cause of the
      // "invalid input syntax for type uuid" errors.
      const sessionId = crypto.randomUUID();

      sessions.set(
        sessionId,
        {
          session_id:
            sessionId,

          user_id,

          job_role_id:
            job_role_id || null,

          question_type:
            question_type || "hr",

          duration_seconds:
            durationMinutes * 60,

          target_question_count:
            targetQuestionCount,

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

              user_id,

              job_role_id: resolvedJobRoleId,

              interview_type:
                question_type ||
                "hr",

              persona_id:
                persona.id ||
                persona.name,

              total_questions: targetQuestionCount || 0,

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

      logAudit(user_id, "interview_started", {
        entity: "interview_sessions",
        entityId: sessionId,
        desc: `Started a ${question_type || "hr"} interview`,
        req,
      });

      return res.status(200).json({
        session_id:
          sessionId,

        questions,

        duration_seconds:
          durationMinutes * 60,

        target_question_count:
          targetQuestionCount,
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
   INTERVIEW: NEXT QUESTION (on-demand top-up — questions never run out)
========================================================= */

app.post(
  "/api/interview/next-question",
  async (req, res) => {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        error: "session_id is required.",
      });
    }

    const session = sessions.get(session_id);

    if (!session) {
      return res.status(404).json({
        error: "Interview session not found.",
      });
    }

    if (session.questions.length >= MAX_QUESTIONS_PER_SESSION) {
      // Extremely unlikely in practice at 5-30 min, but guards against a
      // stuck client hammering this endpoint indefinitely.
      return res.status(200).json({
        question: session.questions[session.questions.length - 1],
      });
    }

    try {
      const rawQuestions = await generateQuestionBatch(
        session.persona,
        session.job_role_id,
        session.question_type,
        { count: 1, isOpening: false }
      );

      if (!rawQuestions) {
        throw new Error("The next question could not be generated.");
      }

      const q = rawQuestions[0];
      const question = {
        id: `q${session.questions.length + 1}`,
        text: q.text,
        type: q.type || "conceptual",
        suggestedTimeMinutes: Number(q.suggestedTimeMinutes) || 2,
        answerFormat: q.answerFormat === "numeric" ? "numeric" : "text",
        diagram: typeof q.diagram === "string" && q.diagram.trim() ? q.diagram : null,
      };

      session.questions.push(question);

      return res.status(200).json({ question });
    } catch (error) {
      console.error(
        "❌ Next-question error:",
        error.message
      );

      return res.status(500).json({
        error: error.message,
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
      final_answer,
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

      const finalAnswerText =
        typeof final_answer === "string" && final_answer.trim()
          ? final_answer.trim()
          : null;

      const prompt = `
${buildPersonaPrompt(
  selectedPersona,
  session.job_role_id,
  session.question_type
)}

Interview question:
"${question.text}"
${question.diagram ? `\nGiven information / diagram:\n${question.diagram}\n` : ""}
Candidate's working / answer:
"${user_answer}"
${finalAnswerText ? `\nCandidate's stated final numeric answer: ${finalAnswerText}` : ""}

Evaluate the answer${
        question.answerFormat === "numeric"
          ? ", including whether the final numeric answer is correct and whether the reasoning that led to it makes sense"
          : ""
      }.

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

        final_answer:
          finalAnswerText,

        evaluation,
      });

      // Persist this Q&A to interview_responses — previously this data was
      // generated, shown to the candidate once, and then thrown away
      // entirely. Scores are stored on a 0-100 scale (score * 10) to match
      // every other score column in the schema.
      try {
        const { error: responseInsertError } = await databaseClient
          .from("interview_responses")
          .insert({
            session_id,
            question_ref: question.id,
            question_text: question.text,
            user_answer: user_answer.trim(),
            confidence_score: toHundredScale(evaluation.breakdown?.confidence),
            clarity_score: toHundredScale(evaluation.breakdown?.clarity),
            structure_score: toHundredScale(evaluation.breakdown?.structure),
            overall_score: toHundredScale(evaluation.score),
            ai_feedback: evaluation.feedback || null,
            ai_tip: evaluation.tip || null,
          });

        if (responseInsertError) {
          console.warn("Supabase interview-response insert skipped:", responseInsertError.message);
        }
      } catch (error) {
        console.warn("Supabase interview-response insert skipped:", error.message);
      }

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
            status: "completed",

            total_questions: answered.length,

            ended_at:
              new Date()
                .toISOString(),

            completed_at:
              new Date()
                .toISOString(),

            // Scaled to 0-100 — see toHundredScale. This UPDATE is what
            // fires trg_snapshot_on_interview, which copies avg_score into
            // progress_snapshots alongside cv_score/readiness_score, all
            // on the same 0-100 scale.
            avg_score: toHundredScale(overallScore),

            overall_score: toHundredScale(overallScore),
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
      } else {
        logAudit(session.user_id, "interview_completed", {
          entity: "interview_sessions",
          entityId: session_id,
          desc: `Completed interview, overall score ${overallScore}/10`,
          req,
        });
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
/* =========================================================
   AUTH: DELETE ACCOUNT
========================================================= */

app.post("/api/delete-account", async (req, res) => {
  console.log("DELETE ACCOUNT HIT");

  try {
    if (!supabaseAdmin) {
      return res.status(500).json({
        error: "Server not configured for account deletion",
      });
    }

    const authHeader = req.headers.authorization;

    if (
      typeof authHeader !== "string" ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error: "Authorization token missing",
      });
    }

    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
      return res.status(401).json({
        error: "Authorization token missing",
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Token verification failed:", userError);

      return res.status(401).json({
        error: "Invalid or expired token",
      });
    }

    const userId = user.id;
// Delete user via admin client
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Supabase delete error:", deleteError);

      return res.status(500).json({
        error: "Failed to delete account",
      });
    }

    return res.json({
      ok: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error("Delete account error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});


app.get("/api/esco/occupations", async (req, res) => {
  try {
    const q =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : "software developer";

    const occupations = await searchEscoOccupations(q);

    return res.json({ occupations });
  } catch (error) {
    console.error("❌ ESCO occupation search error:", error);
    return res.status(500).json({
      error: "Could not search ESCO occupations",
    });
  }
});