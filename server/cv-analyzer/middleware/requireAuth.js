import { supabaseAdmin } from "../services/supabaseClient.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Authentication failed." });
  }
};