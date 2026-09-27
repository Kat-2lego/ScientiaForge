/* =========================================================
   FEATURE EVENTS
   Shared by server.mjs and cv-analyzer/routes/cvRoutes.js to log
   feature usage (what, when, how long) into public.feature_events —
   see database/feature_tracking_migration.sql. Self-contained
   Supabase client, mirroring the pattern already used by
   routes/admin.js, routes/careerPathfinder.js, and routes/studyHub.js
   rather than importing server.mjs's internals.

   Only logs for an authenticated user — there is no way to
   attribute usage to an anonymous visitor, so callers with no
   userId are a silent no-op rather than a guess.
========================================================= */

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;

const client = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * @param {string} userId
 * @param {string} feature - 'interview_simulator' | 'cv_analyzer' | 'skill_gap' | 'career_discovery'
 * @param {string} eventType - 'started' | 'completed'
 * @param {{durationSeconds?: number|null, metadata?: object|null}} [options]
 */
export async function logFeatureEvent(userId, feature, eventType, options = {}) {
  if (!userId) return;

  const { durationSeconds = null, metadata = null } = options;

  try {
    const { error } = await client.from("feature_events").insert({
      user_id: userId,
      feature,
      event_type: eventType,
      duration_seconds: durationSeconds,
      metadata,
    });

    if (error) {
      console.warn(`feature_events insert skipped (${feature}/${eventType}):`, error.message);
    }
  } catch (err) {
    console.warn(`feature_events insert skipped (${feature}/${eventType}):`, err.message);
  }
}