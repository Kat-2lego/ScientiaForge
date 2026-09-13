
import { supabaseAdmin } from "./supabaseClient.js";

/**
 * Get the user's active subscription and CV usage.
 */
export const getUserPlanAndUsage = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  // --------------------------------------------------
  // 1. Find the user's active subscription
  // --------------------------------------------------

  const { data: userSubscription, error: subError } =
    await supabaseAdmin
      .from("user_subscriptions")
      .select("user_subscription_id, user_id, subscription_id, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

  if (subError) {
    console.error("Subscription query error:", subError);
    throw new Error("Could not check the user's subscription.");
  }

  if (!userSubscription) {
    throw new Error("No active subscription found for this user.");
  }

  // --------------------------------------------------
  // 2. Retrieve the plan from subscriptions
  // --------------------------------------------------

  const { data: plan, error: planError } = await supabaseAdmin
    .from("subscriptions")
    .select("subscription_id, plan_name, features")
    .eq("subscription_id", userSubscription.subscription_id)
    .maybeSingle();

  if (planError) {
    console.error("Plan query error:", planError);
    throw new Error("Could not retrieve the subscription plan.");
  }

  if (!plan) {
    throw new Error("Subscription plan details could not be found.");
  }

  // --------------------------------------------------
  // 3. Check the user's CV usage
  // --------------------------------------------------

  const { count, error: countError } = await supabaseAdmin
    .from("cv_documents")
    .select("cv_id", {
      count: "exact",
      head: true
    })
    .eq("user_id", userId);

  if (countError) {
    console.error("CV usage query error:", countError);
    throw new Error("Could not check CV analysis usage.");
  }

  // --------------------------------------------------
  // 4. Calculate usage and limit
  // --------------------------------------------------

  const planName = plan.plan_name;
  const limit = plan.features?.cv_analyses ?? 0;
  const used = count ?? 0;
  const unlimited = limit === -1;

  return {
    planName,
    limit,
    used,
    unlimited,
    subscriptionId: userSubscription.subscription_id
  };
};


/**
 * Enforce the user's CV analysis quota.
 */
export const enforceQuota = async (userId) => {
  const usage = await getUserPlanAndUsage(userId);

  // Unlimited plans bypass the quota check.
  if (usage.unlimited) {
    return usage;
  }

  // Block the user when the limit has been reached.
  if (usage.used >= usage.limit) {
    const err = new Error(
      `You've used ${usage.used}/${usage.limit} CV analyses on the ${usage.planName} plan. Upgrade for more.`
    );

    err.status = 403;
    err.code = "UPLOAD_LIMIT_REACHED";

    throw err;
  }

  return usage;
};