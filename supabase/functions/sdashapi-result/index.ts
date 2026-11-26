
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

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessionId,
      )
    ) {
      return respond({ ok: false, message: "Invalid exam session." }, 400);
    }

    const { data, error } = await admin.rpc(
      "get_sdashapi_exam_result",
      {
        p_session_id: sessionId,
        p_user_id: userData.user.id,
      },
    );

    if (error) {
      console.error("SdashAPI result retrieval failed:", error.message);

      const message = error.message.includes("not available until submission")
        ? "Submit your exam before viewing the result."
        : error.message.includes("not found")
        ? "Exam session not found."
        : "Unable to retrieve this exam result.";

      return respond({ ok: false, message }, 400);
    }

    return respond(data);
  } catch (error) {
    console.error("sdashapi-result error:", error);

    return respond({
      ok: false,
      message: "An unexpected server error occurred.",
    }, 500);
  }
});
