// Mirrors cv-analyzer/services/quotaService.js exactly (same cache, same
// South African month window, same error shape) but against a different
// counter: how many jobs a user has had AI-analysed this month via the
// Application Command Centre's "Add Job" call, rather than CV analyses.
// Kept as its own file rather than importing quotaService.js, matching how
// this project already prefers small self-contained services (see
// services/featureEvents.js's own comment on the same choice) over a shared
// one that both plan page would need to agree on first.
import { supabaseAdmin } from "../cv-analyzer/services/supabaseClient.js";

// ------------------------------------------------------------
// Settings - match these to your database
// ------------------------------------------------------------
const PLANS_TABLE = "subscription_plans";
const PLAN_NAME_COLUMN = "name";
const PLAN_LIMIT_COLUMN = "application_monthly_limit"; // -1 = unlimited

// Used when a user has no active subscription and no freemium row/limit is set.
const FREEMIUM_MONTHLY_LIMIT = 5;
const FREEMIUM_PLAN_NAME = "Freemium";

const PLAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const PLAN_COLUMNS = `subscription_id, ${PLAN_NAME_COLUMN}, ${PLAN_LIMIT_COLUMN}`;

const planCache = new Map();

const getCached = async (key, loader) => {
  const hit = planCache.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const value = await loader();

  if (value) {
    planCache.set(key, { value, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
  }

  return value;
};

export const clearApplicationPlanCache = () => planCache.clear();

const getMonthWindow = () => {
  const SA_OFFSET_HOURS = 2;
  const nowSa = new Date(Date.now() + SA_OFFSET_HOURS * 60 * 60 * 1000);

  const year = nowSa.getUTCFullYear();
  const month = nowSa.getUTCMonth();

  const monthStart = new Date(Date.UTC(year, month, 1, -SA_OFFSET_HOURS));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, -SA_OFFSET_HOURS));

  return {
    monthStart: monthStart.toISOString(),
    resetsAt: nextMonthStart.toISOString(),
  };
};

const readPlan = (plan) => {
  const configured = Number(plan[PLAN_LIMIT_COLUMN]);

  return {
    planName: plan[PLAN_NAME_COLUMN] || FREEMIUM_PLAN_NAME,
    // A plan row that predates this feature (no application_monthly_limit
    // set yet) falls back to the freemium default rather than silently
    // granting unlimited use.
    limit: Number.isFinite(configured) ? configured : FREEMIUM_MONTHLY_LIMIT,
    subscriptionId: plan.subscription_id,
  };
};

const getFreemiumPlan = () =>
  getCached("freemium", async () => {
    const { data, error } = await supabaseAdmin
      .from(PLANS_TABLE)
      .select(PLAN_COLUMNS)
      .or(`${PLAN_NAME_COLUMN}.ilike.freemium,${PLAN_NAME_COLUMN}.ilike.free`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Freemium plan lookup error:", error.message);
      return null;
    }

    return data;
  });

const getPlanById = (subscriptionId) =>
  getCached(`plan:${subscriptionId}`, async () => {
    const { data, error } = await supabaseAdmin
      .from(PLANS_TABLE)
      .select(PLAN_COLUMNS)
      .eq("subscription_id", subscriptionId)
      .maybeSingle();

    if (error) {
      console.error("Plan query error:", error.message);
      throw new Error("Could not retrieve the subscription plan.");
    }

    return data;
  });

/**
 * Get the user's plan and job-analysis usage for the current month.
 */
export const getApplicationPlanAndUsage = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  const { monthStart, resetsAt } = getMonthWindow();

  const [subResult, countResult] = await Promise.all([
    supabaseAdmin
      .from("user_subscriptions")
      .select("user_subscription_id, subscription_id, status, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Every "Add Job" row is AI-analysed exactly once on creation, so a
    // simple row count for this month is also the AI-call count.
    supabaseAdmin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart),
  ]);

  if (subResult.error) {
    console.error("Subscription query error:", subResult.error.message);
    throw new Error("Could not check the user's subscription.");
  }

  if (countResult.error) {
    console.error("Application usage query error:", countResult.error.message);
    throw new Error("Could not check job-analysis usage.");
  }

  let plan = null;

  if (subResult.data) {
    plan = await getPlanById(subResult.data.subscription_id);
  }

  if (!plan) {
    plan = await getFreemiumPlan();
  }

  const { planName, limit, subscriptionId } = plan
    ? readPlan(plan)
    : {
        planName: FREEMIUM_PLAN_NAME,
        limit: FREEMIUM_MONTHLY_LIMIT,
        subscriptionId: null,
      };

  return {
    planName,
    limit,
    used: countResult.count ?? 0,
    unlimited: limit === -1,
    period: "month",
    resetsAt,
    subscriptionId,
  };
};

/**
 * Enforce the user's monthly job-analysis quota.
 */
export const enforceApplicationQuota = async (userId) => {
  const usage = await getApplicationPlanAndUsage(userId);

  if (usage.unlimited) {
    return usage;
  }

  if (usage.used >= usage.limit) {
    const resetDate = new Date(usage.resetsAt).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      timeZone: "Africa/Johannesburg",
    });

    const err = new Error(
      `You've used ${usage.used}/${usage.limit} job analyses this month on the ${usage.planName} plan. ` +
        `Upgrade to Premium for more, or add another job from ${resetDate}.`
    );

    err.status = 403;
    err.code = "APPLICATION_LIMIT_REACHED";

    throw err;
  }

  return usage;
};
