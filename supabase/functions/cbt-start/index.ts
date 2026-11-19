import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return respond({ error: "Sign in to start an exam." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !secretKeysRaw) return respond({ error: "Server configuration is incomplete." }, 500);
    const secretKey = JSON.parse(secretKeysRaw).default;
    if (!secretKey) return respond({ error: "Server secret key is unavailable." }, 500);

    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);
    const user = authData.user;

    const body = await req.json();
    const subjects = Array.isArray(body.subjects)
      ? [...new Set(body.subjects.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()))]
      : [];
    const mode = body.mode;
    const count = Math.max(1, Math.min(Number(body.count) || 60, 60));
    if (!subjects.length || subjects.length > 12) return respond({ error: "Select between 1 and 12 subjects." }, 400);
    if (!["practice", "cbt", "mock", "revision"].includes(mode)) return respond({ error: "Invalid examination mode." }, 400);

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("trial_count, is_subscribed").eq("user_id", user.id).single();
    if (profileError || !profile) return respond({ error: "Your student profile could not be loaded." }, 404);
    if (!profile.is_subscribed && profile.trial_count >= 3) return respond({ error: "TRIAL_LIMIT_REACHED" }, 403);

    const { data: seenRows, error: seenError } = await admin.from("user_seen_questions")
      .select("question_id").eq("user_id", user.id);
    if (seenError) return respond({ error: "Could not load your question history." }, 500);
    const seen = new Set((seenRows ?? []).map((row) => row.question_id));

    const allQuestions: any[] = [];
    for (const subject of subjects) {
      const { data, error } = await admin.from("questions")
        .select("id,subject,topic,year,difficulty,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,passage,question_type,exam_hint")
        .eq("subject", subject).eq("is_published", true).limit(1000);
      if (error) return respond({ error: "Could not load the question bank." }, 500);
      const shuffled = shuffle(data ?? []);
      let unseen = shuffled.filter((q) => !seen.has(q.id));
      const previouslySeen = shuffled.filter((q) => seen.has(q.id));
      if (unseen.length < count && previouslySeen.length && seen.size >= Math.ceil(shuffled.length * 0.8)) {
        const ids = shuffled.map((q) => q.id);
        await admin.from("user_seen_questions").delete().eq("user_id", user.id).in("question_id", ids);
        unseen = shuffled;
      }
      const pool = mode === "revision" ? [...shuffle(previouslySeen), ...shuffle(unseen)] : [...shuffle(unseen), ...shuffle(previouslySeen)];
      const chosen = pool.slice(0, count);
      const easy = shuffle(chosen.filter((q) => q.difficulty === "easy"));
      const medium = shuffle(chosen.filter((q) => q.difficulty === "medium"));
      const hard = shuffle(chosen.filter((q) => q.difficulty === "hard"));
      const targetEasy = Math.round(chosen.length * 0.3);
      const targetHard = Math.round(chosen.length * 0.2);
      const balanced = [
        ...easy.slice(0, targetEasy),
        ...medium.slice(0, Math.max(0, chosen.length - targetEasy - targetHard)),
        ...hard.slice(0, targetHard),
      ];
      const fill = chosen.filter((q) => !balanced.some((b) => b.id === q.id));
      allQuestions.push(...shuffle([...balanced, ...fill]).slice(0, count));
    }
    if (!allQuestions.length) return respond({ error: "No questions are available for the selected subjects." }, 404);

    const prepared = allQuestions.map((q, index) => {
      const options = shuffle([
        { originalLabel: "A", text: q.option_a },
        { originalLabel: "B", text: q.option_b },
        { originalLabel: "C", text: q.option_c },
        { originalLabel: "D", text: q.option_d },
      ]);
      const optionOrder = options.map((option) => option.originalLabel);
      const displayOptions = options.map((option, optionIndex) => ({
        label: String.fromCharCode(65 + optionIndex), text: option.text,
      }));
      const correct = options.findIndex((option) => option.originalLabel === q.correct_answer);
      return {
        question: q,
        position: index + 1,
        optionOrder,
        displayOptions,
        displayedCorrect: String.fromCharCode(65 + correct),
      };
    });

    const { data: session, error: sessionError } = await admin.from("exam_sessions")
      .insert({ user_id: user.id, mode, subjects, total_questions: prepared.length })
      .select("id,started_at,total_questions").single();
    if (sessionError || !session) return respond({ error: "Could not create your exam session." }, 500);

    const { error: mappingError } = await admin.from("exam_session_questions").insert(prepared.map((item) => ({
      session_id: session.id, question_id: item.question.id,
      option_order: item.optionOrder, position: item.position,
    })));
    if (mappingError) {
      await admin.from("exam_sessions").delete().eq("id", session.id);
      return respond({ error: "Could not prepare your exam questions. Please try again." }, 500);
    }

    const { data: trialResult, error: trialError } = await admin.rpc("consume_cbt_trial", {
      p_user_id: user.id,
    });
    if (trialError || !trialResult?.allowed) {
      await admin.from("exam_sessions").delete().eq("id", session.id);
      if (trialError) return respond({ error: "Could not update your exam allowance. Please try again." }, 500);
      return respond({ error: "TRIAL_LIMIT_REACHED" }, 403);
    }

    const questions = prepared.map((item) => ({
      id: item.question.id, subject: item.question.subject, topic: item.question.topic,
      year: item.question.year, difficulty: item.question.difficulty,
      question_text: item.question.question_text, options: item.displayOptions,
      ...(mode === "practice" ? { correct_answer: item.displayedCorrect, explanation: item.question.explanation } : {}),
      passage: item.question.passage, question_type: item.question.question_type,
      exam_hint: item.question.exam_hint,
    }));
    return respond({ session, questions });
  } catch (error) {
    console.error("cbt-start failed", error);
    return respond({ error: "Unable to start the exam right now." }, 500);
  }
});
