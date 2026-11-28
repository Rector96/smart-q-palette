import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return respond({ ok: false, message: "Method not allowed." }, 405);
  }

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return respond({ ok: false, message: "Authentication required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeysRaw) {
      try {
        const secretKeys = JSON.parse(secretKeysRaw);
        if (typeof secretKeys.default === "string") serviceKey = secretKeys.default;
      } catch {
        console.error("Invalid SUPABASE_SECRET_KEYS configuration.");
      }
    }
    if (!supabaseUrl || !serviceKey) {
      return respond({ ok: false, message: "Server configuration is incomplete." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return respond({ ok: false, message: "Invalid or expired session." }, 401);
    }

    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    const position = Number(body.position);
    const selectedAnswer = String(body.selectedAnswer ?? "").trim().toUpperCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
        !Number.isInteger(position) || position < 1 || position > 200 ||
        !["A", "B", "C", "D", "E"].includes(selectedAnswer)) {
      return respond({ ok: false, message: "Select an answer before requesting practice feedback." }, 400);
    }

    const { data, error } = await admin.rpc("get_sdashapi_practice_feedback", {
      p_session_id: sessionId,
      p_user_id: authData.user.id,
      p_position: position,
      p_selected_answer: selectedAnswer,
    });
    if (error) {
      const message = error.message.includes("not found")
        ? "Practice question not found."
        : "Practice feedback is unavailable for this question.";
      return respond({ ok: false, message }, 400);
    }
    return respond(data);
  } catch (error) {
    console.error("sdashapi-practice-feedback failed:", error);
    return respond({ ok: false, message: "Unable to load practice feedback." }, 500);
  }
});
