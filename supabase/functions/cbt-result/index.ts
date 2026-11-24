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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) {
      return respond({ error: "Sign in to view this exam result." }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !secretKeysRaw) {
      return respond({ error: "Server configuration is incomplete." }, 500);
    }

    const secretKey = JSON.parse(secretKeysRaw).default;
    if (!secretKey) return respond({ error: "Server secret key is unavailable." }, 500);

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return respond({ error: "Your session is invalid. Please sign in again." }, 401);
    }

    const body = await req.json();
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return respond({ error: "Invalid exam result reference." }, 400);
    }

    const { data: session, error: sessionError } = await admin
      .from("exam_sessions")
      .select("id,user_id,mode,subjects,examination,exam_year,total_questions,correct_answers,score_percentage,duration_seconds,started_at,completed_at,completed")
      .eq("id", sessionId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (sessionError) {
      console.error("cbt-result session lookup failed", sessionError);
      return respond({ error: "We couldn't load this exam result." }, 500);
    }
    if (!session) return respond({ error: "We couldn't find this exam result in your account." }, 404);
    if (!session.completed) {
      return respond({ error: "This exam has not been submitted yet." }, 409);
    }

    const [{ data: history, error: historyError }, { data: profile }] = await Promise.all([
      admin
        .from("user_history")
        .select("id,question_id,selected_answer,is_correct,session_question_position,answered_at,questions(id,question_text,option_a,option_b,option_c,option_d,correct_answer,topic,diagram_url,explanation)")
        .eq("session_id", sessionId)
        .eq("user_id", authData.user.id)
        .order("session_question_position", { ascending: true, nullsFirst: false })
        .order("answered_at", { ascending: true }),
      admin
        .from("profiles")
        .select("full_name")
        .eq("user_id", authData.user.id)
        .maybeSingle(),
    ]);

    if (historyError) {
      console.error("cbt-result history lookup failed", historyError);
      return respond({ error: "Your score is saved, but the answer review could not be loaded." }, 500);
    }

    const reviewRows = history ?? [];
    const correctFromHistory = reviewRows.filter((row: any) => row.is_correct === true).length;
    const positions = reviewRows.map((row: any) => row.session_question_position).filter((value: unknown) => Number.isInteger(value));
    const positionsAreComplete = positions.length === Number(session.total_questions)
      && new Set(positions).size === positions.length
      && positions.every((position: number) => position >= 1 && position <= Number(session.total_questions));
    const reviewIntegrity = {
      answer_count_matches: reviewRows.length === Number(session.total_questions),
      correct_count_matches: correctFromHistory === Number(session.correct_answers),
      question_order_complete: positionsAreComplete,
    };

    return respond({
      result: {
        session,
        history: reviewRows,
        profile_name: profile?.full_name ?? "",
        review_integrity: reviewIntegrity,
      },
    });
  } catch (error) {
    console.error("cbt-result failed", error);
    return respond({ error: "Unable to load this exam result right now." }, 500);
  }
});
