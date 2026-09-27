import { supabaseAdmin } from "./supabaseClient.js";

// ------------------------------------------------------------
// Settings - match these to your database
// ------------------------------------------------------------
const PLANS_TABLE = "subscription_plans";   // table holding the plans
const PLAN_NAME_COLUMN = "name";            // column with "freemium" / "premium"
const PLAN_LIMIT_COLUMN = "cv_monthly_limit"; // -1 = unlimited

// Used when a user has no active subscription and no freemium row/limit is set.
const FREEMIUM_MONTHLY_LIMIT = 3;
const FREEMIUM_PLAN_NAME = "Freemium";

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

const PLAN_COLUMNS = `subscription_id, ${PLAN_NAME_COLUMN}, ${PLAN_LIMIT_COLUMN}`;

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
 * Look up the Freemium plan row (also accepts a plan named "free").
 */
const getFreemiumPlan = async () => {
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
};

/**
 * Get the user's plan and CV usage for the current month.
 * Users without an active subscription are on Freemium.
 */
export const getUserPlanAndUsage = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  // 1. The user's active subscription (newest if several)
  const { data: userSubscription, error: subError } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_subscription_id, subscription_id, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.error("Subscription query error:", subError.message);
    throw new Error("Could not check the user's subscription.");
  }

  // 2. Which plan applies
  let plan = null;

  if (userSubscription) {
    const { data, error: planError } = await supabaseAdmin
      .from(PLANS_TABLE)
      .select(PLAN_COLUMNS)
      .eq("subscription_id", userSubscription.subscription_id)
      .maybeSingle();

    if (planError) {
      console.error("Plan query error:", planError.message);
      throw new Error("Could not retrieve the subscription plan.");
    }

    plan = data;
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

  // 3. This month's CV analyses
  const { monthStart, resetsAt } = getMonthWindow();

  const { count, error: countError } = await supabaseAdmin
    .from("cv_documents")
    .select("cv_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("uploaded_at", monthStart);

  if (countError) {
    console.error("CV usage query error:", countError.message);
    throw new Error("Could not check CV analysis usage.");
  }

  return {
    planName,
    limit,
    used: count ?? 0,
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