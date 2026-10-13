import { supabaseAdmin } from "./supabaseClient.js";

// ------------------------------------------------------------
// Settings - match these to your database
// ------------------------------------------------------------
const PLANS_TABLE = "subscription_plans"; // table holding the plans
const PLAN_NAME_COLUMN = "name"; // column with "freemium" / "premium"
const PLAN_LIMIT_COLUMN = "cv_monthly_limit"; // -1 = unlimited

// Used when a user has no active subscription and no freemium row/limit is set.
const FREEMIUM_MONTHLY_LIMIT = 3;
const FREEMIUM_PLAN_NAME = "Freemium";

// Plans rarely change, so cache them in memory instead of querying every upload.
const PLAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const PLAN_COLUMNS = `subscription_id, ${PLAN_NAME_COLUMN}, ${PLAN_LIMIT_COLUMN}`;

// ------------------------------------------------------------
// Small in-memory cache for plan rows
// ------------------------------------------------------------
const planCache = new Map(); // key -> { value, expiresAt }

const getCached = async (key, loader) => {
  const hit = planCache.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const value = await loader();

  // Only cache real rows, so a failed lookup is retried next time
  if (value) {
    planCache.set(key, { value, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
  }

  return value;
};

/** Call this after editing plans in an admin screen, if you have one. */
export const clearPlanCache = () => planCache.clear();

/**
 * Start of the current calendar month in South African time (UTC+2),
 * plus the date the quota resets (1st of next month).
 */
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

/**
 * Turn a plan row into { planName, limit, subscriptionId }.
 */
const readPlan = (plan) => {
  const configured = Number(plan[PLAN_LIMIT_COLUMN]);

  return {
    planName: plan[PLAN_NAME_COLUMN] || FREEMIUM_PLAN_NAME,
    limit: Number.isFinite(configured) ? configured : FREEMIUM_MONTHLY_LIMIT,
    subscriptionId: plan.subscription_id,
  };
};

/**
 * Look up the Freemium plan row (also accepts a plan named "free"). Cached.
 */
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

/**
 * Look up a plan row by its subscription_id. Cached.
 */
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
 * Get the user's plan and CV usage for the current month.
 * Users without an active subscription are on Freemium.
 */
export const getUserPlanAndUsage = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  const { monthStart, resetsAt } = getMonthWindow();

  // 1. Subscription lookup and this month's usage count don't depend on
  //    each other, so run them at the same time.
  const [subResult, countResult] = await Promise.all([
    supabaseAdmin
      .from("user_subscriptions")
      .select("user_subscription_id, subscription_id, status, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabaseAdmin
      .from("cv_documents")
      .select("cv_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("uploaded_at", monthStart),
  ]);

  if (subResult.error) {
    console.error("Subscription query error:", subResult.error.message);
    throw new Error("Could not check the user's subscription.");
  }

  if (countResult.error) {
    console.error("CV usage query error:", countResult.error.message);
    throw new Error("Could not check CV analysis usage.");
  }

  // 2. Which plan applies (served from cache most of the time)
  let plan = null;

  if (subResult.data) {
    plan = await getPlanById(subResult.data.subscription_id);
  }

  // No active subscription (or its plan row is missing) -> Freemium
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
 * Enforce the user's monthly CV analysis quota.
 */
export const enforceQuota = async (userId) => {
  const usage = await getUserPlanAndUsage(userId);

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
      `You've used ${usage.used}/${usage.limit} CV analyses this month on the ${usage.planName} plan. ` +
        `Upgrade to Premium for more, or upload again from ${resetDate}.`
    );

    err.status = 403;
    err.code = "UPLOAD_LIMIT_REACHED";

    throw err;
  }

  return usage;
};