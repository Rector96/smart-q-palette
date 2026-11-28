
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
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
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return respond({ ok: false, message: "Authentication required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");

    if (secretKeysRaw) {
      try {
        const secretKeys = JSON.parse(secretKeysRaw);
        if (typeof secretKeys.default === "string") {
          serviceKey = secretKeys.default;
        }
      } catch {
        console.error("Invalid SUPABASE_SECRET_KEYS configuration.");
      }
    }

    if (!supabaseUrl || !serviceKey) {
      return respond({
        ok: false,
        message: "Server configuration is incomplete.",
      }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: authError } =
      await admin.auth.getUser(token);

    if (authError || !userData.user) {
      return respond({
        ok: false,
        message: "Invalid or expired session.",
      }, 401);
    }

    const body = await req.json();

    const sessionId = String(body.sessionId ?? "");
    const answers = body.answers;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessionId,
      )
    ) {
      return respond({ ok: false, message: "Invalid exam session." }, 400);
    }

    if (!Array.isArray(answers) || answers.length > 240) {
      return respond({ ok: false, message: "Invalid submitted answers." }, 400);
    }

    const cleanAnswers = [];

    for (const item of answers) {
      if (!item || typeof item !== "object") {
        return respond({ ok: false, message: "Invalid answer entry." }, 400);
      }

      const position = Number(item.position);
      const selectedAnswer = item.selectedAnswer == null
        ? null
        : String(item.selectedAnswer).trim().toUpperCase();

      const timeSpent = Number(item.timeSpentSeconds ?? 0);

      if (!Number.isInteger(position) || position < 1 || position > 240) {
        return respond({ ok: false, message: "Invalid question position." }, 400);
      }

      if (
        selectedAnswer !== null &&
        !["A", "B", "C", "D", "E"].includes(selectedAnswer)
      ) {
        return respond({ ok: false, message: "Invalid selected answer." }, 400);
      }

      if (!Number.isInteger(timeSpent) || timeSpent < 0 || timeSpent > 86400) {
        return respond({ ok: false, message: "Invalid time spent value." }, 400);
      }

      cleanAnswers.push({
        position,
        selected_answer: selectedAnswer,
        time_spent_seconds: timeSpent,
      });
    }

    const positions = cleanAnswers.map((item) => item.position);

    if (new Set(positions).size !== positions.length) {
      return respond({ ok: false, message: "Duplicate answer positions." }, 400);
    }

    const { data, error } = await admin.rpc(
      "submit_sdashapi_exam_session",
      {
        p_session_id: sessionId,
        p_user_id: userData.user.id,
        p_answers: cleanAnswers,
      },
    );

    if (error) {
      console.error("SdashAPI submission failed:", error.message);

      const message = error.message.includes("already been submitted")
        ? "This exam has already been submitted."
        : error.message.includes("not found")
        ? "Exam session not found."
        : "Unable to submit this exam.";

      return respond({ ok: false, message }, 400);
    }

    return respond(data);
  } catch (error) {
    console.error("sdashapi-submit error:", error);

    return respond({
      ok: false,
      message: "An unexpected server error occurred.",
    }, 500);
  }
});
