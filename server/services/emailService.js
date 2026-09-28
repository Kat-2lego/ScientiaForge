/* =========================================================
   EMAIL SERVICE
   Sends a real "Welcome to SkillForge" email straight from this
   backend via SMTP — separate from Supabase Auth's built-in
   templates (those only cover verification/security flows: confirm
   signup, reset password, etc., not a free-standing welcome note).

   Needs 3 new values in server/.env — nothing else in your project
   changes:
     SMTP_HOST=smtp.resend.com
     SMTP_PORT=465
     SMTP_USER=resend
     SMTP_PASS=your_resend_api_key
     SMTP_FROM=SkillForge <onboarding@yourdomain.com>   (optional — falls back to SMTP_USER)

   If those aren't set yet, sendWelcomeEmail() just logs a warning
   and skips — it will never throw or block a signup.
========================================================= */

import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465, // 465 = implicit TLS, 587 = STARTTLS
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

function welcomeEmailHtml(firstName) {
  const name = firstName || "there";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #1e50ff; margin-bottom: 4px;">Welcome to SkillForge, ${name}! 🎉</h2>
      <p>We're glad you're here. SkillForge is built to take you from education to employment, whatever stage you're at.</p>
      <p>Here's what you can jump into right away:</p>
      <ul style="line-height: 1.7;">
        <li><strong>CV Analyzer</strong> — instant, AI-powered feedback on your CV</li>
        <li><strong>Interview Simulator</strong> — practice real questions with an AI interviewer</li>
        <li><strong>Skill-Gap Analysis</strong> — see exactly what to build toward the role you want</li>
        <li><strong>Career Pathfinder</strong> — subjects, courses, and bursaries for high school learners</li>
        <li><strong>Study Hub</strong> — video tutorials, past exam papers, and bursary listings</li>
      </ul>
      <p>Log back in any time to pick up where you left off.</p>
      <p style="margin-top: 24px;">— The SkillForge Team</p>
    </div>
  `;
}

/**
 * Fire-and-forget from the signup handler — never awaited, and never
 * throws, so a slow or failing send can't affect the signup response.
 */
export async function sendWelcomeEmail(toEmail, firstName) {
  if (!transporter) {
    console.warn(
      "Welcome email skipped: SMTP_HOST/SMTP_USER/SMTP_PASS are not set in server/.env."
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: toEmail,
      subject: "Welcome to SkillForge!",
      html: welcomeEmailHtml(firstName),
    });
  } catch (err) {
    console.warn("Welcome email failed to send:", err.message);
  }
}