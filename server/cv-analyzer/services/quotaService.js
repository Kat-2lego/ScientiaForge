import { supabaseAdmin } from "./supabaseClient.js";

export const getUserPlanAndUsage = async (userId) => {
  const { data: sub, error: subError } = await supabaseAdmin
    .from("user_subscriptions")
    .select("status, subscriptions(plan_name, features)")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (subError || !sub) {
    throw new Error("No active subscription found for this user.");
  }

  const planName = sub.subscriptions.plan_name;
  const limit = sub.subscriptions.features?.cv_analyses ?? 0;

  const { count, error: countError } = await supabaseAdmin
    .from("cv_documents")
    .select("cv_id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) {
    throw new Error("Could not check upload usage.");
  }

  const used = count || 0;
  const unlimited = limit === -1;

  return { planName, limit, used, unlimited };
};

export const enforceQuota = async (userId) => {
  const usage = await getUserPlanAndUsage(userId);

  if (!usage.unlimited && usage.used >= usage.limit) {
    const err = new Error(
      `You've used ${usage.used}/${usage.limit} CV analyses on the ${usage.planName} plan. Upgrade for more.`
    );
    err.status = 403;
    err.code = "UPLOAD_LIMIT_REACHED";
    throw err;
  }

  return usage;
};