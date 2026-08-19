import { createClient } from "@supabase/supabase-js";
import ws from "ws";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws;
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      params: { eventsPerSecond: 1 },
    },
  }
);