import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;

const supabase = createClient(supabaseUrl, serviceRoleKey);
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' });

Deno.serve(async (req) => {
  try {
    // 1. Find subscriptions due for renewal today (or overdue), with
    //    auto-renew on, that still have a saved payment method.
    const { data: dueSubscriptions, error: fetchError } = await supabase
      .from('user_subscriptions')
      .select(`
        user_subscription_id,
        user_id,
        subscription_id,
        stripe_payment_method_id,
        subscription_plans ( name, amount_zar )
      `)
      .eq('auto_renew', true)
      .eq('status', 'active')
      .lte('end_date', new Date().toISOString());

    if (fetchError) {
      console.error('Failed to fetch due subscriptions:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!dueSubscriptions || dueSubscriptions.length === 0) {
      return new Response(JSON.stringify({ attempted: 0, succeeded: 0, requiresAction: 0, failed: 0, skipped: 0 }));
    }

    // 2. Fetch the matching users separately (no cross-schema embed needed)
    const userIds = dueSubscriptions.map((s) => s.user_id);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, stripe_customer_id, email')
      .in('id', userIds);

    if (usersError) {
      console.error('Failed to fetch users:', usersError);
      return new Response(JSON.stringify({ error: usersError.message }), { status: 500 });
    }

    const usersById = Object.fromEntries((users ?? []).map((u) => [u.id, u]));

    const results = { attempted: 0, succeeded: 0, requiresAction: 0, failed: 0, skipped: 0 };

    for (const sub of dueSubscriptions) {
      const user = usersById[sub.user_id];
      const customerId = user?.stripe_customer_id;
      const paymentMethodId = sub.stripe_payment_method_id;
      const plan = sub.subscription_plans;

      if (!customerId || !paymentMethodId || !plan) {
        console.warn(`Skipping subscription ${sub.user_subscription_id} — missing customer, payment method, or plan data.`);
        results.skipped++;
        continue;
      }

      results.attempted++;

      try {
        await stripe.paymentIntents.create({
          amount: plan.amount_zar,
          currency: 'zar',
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            productId: plan.name,
            userId: sub.user_id,
            autoRenew: 'true',
          },
        });

        results.succeeded++;
      } catch (err) {
        if (err.code === 'authentication_required') {
          console.warn(`Renewal for ${sub.user_id} requires authentication.`);

          await supabase
            .from('user_subscriptions')
            .update({ status: 'past_due' })
            .eq('user_subscription_id', sub.user_subscription_id);

          results.requiresAction++;
        } else {
          console.error(`Renewal failed for ${sub.user_id}:`, err.message);
          results.failed++;
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Renewal job crashed:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});