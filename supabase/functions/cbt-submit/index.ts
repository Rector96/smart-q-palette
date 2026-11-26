import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return respond({ error: "Sign in to submit your exam." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !secretKeysRaw) return respond({ error: "Server configuration is incomplete." }, 500);
    const secretKey = JSON.parse(secretKeysRaw).default;
    if (!secretKey) return respond({ error: "Server secret key is unavailable." }, 500);

    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);

    const body = await req.json();
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const answers = body.answers;
    if (!sessionId || !Array.isArray(answers) || answers.length < 1 || answers.length > 720) {
      return respond({ error: "Invalid exam submission." }, 400);
    }

    const normalized = answers.map((answer: unknown) => {
  if (!answer || typeof answer !== "object") {
    throw new Error("Invalid answer format.");
  }

    const item = answer as Record<string, unknown>;

    return {
      question_id: item.question_id,
      selected_answer: item.selected_answer,
      time_spent_seconds: item.time_spent_seconds,
    };
  });
    const { data, error } = await admin.rpc("submit_cbt_session", {
      p_session_id: sessionId,
      p_user_id: authData.user.id,
      p_answers: normalized,
    });
    if (error) {
      const message = error.message.includes("already been submitted")
        ? "This exam has already been submitted."
        : error.message.includes("not found")
          ? "Exam session not found."
          : error.message.includes("Invalid") || error.message.includes("outside this exam") || error.message.includes("exactly once")
            ? "The submitted answers do not match this exam."
            : "We could not submit your exam. Please try again.";
      const status = error.code === "P0002" ? 404 : error.code === "23505" ? 409 : 400;
      return respond({ error: message }, status);
    }
    return respond({ result: data });
  } catch (error) {
    console.error("cbt-submit failed", error);
    return respond({ error: "Unable to submit the exam right now." }, 500);
  }
});
