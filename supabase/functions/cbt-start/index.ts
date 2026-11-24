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
    const subjects: string[] = Array.isArray(body.subjects)
      ? Array.from(new Set<string>(body.subjects.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0).map((s: string) => s.trim())))
      : [];
    const mode = body.mode;
    // Backward compatibility: older clients without the exam selector default to JAMB only.
    const requestedExamination = typeof body.examination === "string" ? body.examination.trim().toUpperCase() : "";
    const examination = requestedExamination || "JAMB";
    const examYear = body.year === null || body.year === undefined || body.year === "" ? null : Number(body.year);
    const count = Math.max(1, Math.min(Number(body.count) || 60, 60));
    const adaptive = body.adaptive === true && (mode === "practice" || mode === "revision");
    if (!subjects.length || subjects.length > 12) return respond({ error: "Select between 1 and 12 subjects." }, 400);
    if (!["JAMB", "WAEC", "NECO"].includes(examination)) return respond({ error: "Choose JAMB, WAEC or NECO." }, 400);
    if (examYear !== null && (!Number.isInteger(examYear) || examYear < 1990 || examYear > new Date().getFullYear())) return respond({ error: "Choose a valid examination year." }, 400);
    if (!["practice", "cbt", "mock", "revision"].includes(mode)) return respond({ error: "Invalid examination mode." }, 400);
    if (mode === "mock" && examination !== "JAMB") return respond({ error: "The full mock exam format is currently available for JAMB only." }, 400);

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("trial_count, is_subscribed").eq("user_id", user.id).single();
    if (profileError || !profile) return respond({ error: "Your student profile could not be loaded." }, 404);
    if (!profile.is_subscribed && profile.trial_count >= 3) return respond({ error: "TRIAL_LIMIT_REACHED" }, 403);

    const { data: seenRows, error: seenError } = await admin.from("user_seen_questions")
      .select("question_id").eq("user_id", user.id);
    if (seenError) return respond({ error: "Could not load your question history." }, 500);
    const seen = new Set((seenRows ?? []).map((row) => row.question_id));
    const dueReviewIds = new Set<string>();
    if (mode === "revision") {
      const { data: dueRows, error: dueError } = await admin.from("student_question_reviews")
        .select("question_id")
        .eq("user_id", user.id)
        .lte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(500);
      if (dueError) return respond({ error: "Could not load your scheduled revision questions." }, 500);
      for (const row of dueRows ?? []) dueReviewIds.add(row.question_id);
    }

    const allQuestions: any[] = [];
    for (const subject of subjects) {
      let questionQuery = admin.from("questions")
        .select("id,subject,topic,year,difficulty,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,passage,question_type,exam_hint")
        .ilike("subject", subject)
        .eq("examination", examination)
        .eq("is_published", true);
      if (examYear !== null) questionQuery = questionQuery.eq("year", examYear);
      const { data, error } = await questionQuery.limit(1000);
      if (error) return respond({ error: "Could not load the question bank." }, 500);
      const shuffled = shuffle(data ?? []);
      let unseen = shuffled.filter((q) => !seen.has(q.id));
      let previouslySeen = shuffled.filter((q) => seen.has(q.id));
      // Measure coverage within this subject only; seen also contains other subjects.
      const subjectSeenRatio = previouslySeen.length / Math.max(shuffled.length, 1);
      if (unseen.length < count && previouslySeen.length > 0 && subjectSeenRatio >= 0.8) {
        const ids = shuffled.map((q) => q.id);
        await admin.from("user_seen_questions").delete().eq("user_id", user.id).in("question_id", ids);
        unseen = shuffled;
        previouslySeen = [];
      }
      const dueQuestions = shuffled.filter((q) => dueReviewIds.has(q.id));
      const dueSet = new Set(dueQuestions.map((q) => q.id));
      const otherPreviouslySeen = previouslySeen.filter((q) => !dueSet.has(q.id));
      const pool = mode === "revision"
        ? [...shuffle(dueQuestions), ...shuffle(otherPreviouslySeen), ...shuffle(unseen.filter((q) => !dueSet.has(q.id)))]
        : [...shuffle(unseen), ...shuffle(previouslySeen)];

      if (adaptive) {
        const { data: masteryRows, error: masteryError } = await admin.from("student_topic_mastery")
          .select("topic, attempts, correct_answers")
          .eq("user_id", user.id)
          .ilike("subject", subject);
        if (masteryError) return respond({ error: "Could not load your learning profile. Please try standard practice or try again." }, 500);

        const masteryByTopic = new Map((masteryRows ?? []).map((row) => [
          String(row.topic ?? "").trim().toLowerCase(),
          { attempts: Number(row.attempts) || 0, accuracy: Number(row.attempts) > 0 ? Number(row.correct_answers) / Number(row.attempts) : 0 },
        ] as const));
        const topicGroups = new Map<string, any[]>();
        for (const question of pool) {
          const topicKey = String(question.topic ?? "").trim().toLowerCase() || "__general__";
          if (!topicGroups.has(topicKey)) topicGroups.set(topicKey, []);
          topicGroups.get(topicKey)!.push(question);
        }

        const groups = [...topicGroups.entries()].map(([topicKey, questions]) => {
          const mastery = masteryByTopic.get(topicKey);
          const attempts = mastery?.attempts ?? 0;
          const accuracy = mastery?.accuracy ?? 0.5;
          const targetDifficulty = attempts >= 3 && accuracy < 0.4
            ? "easy"
            : attempts >= 5 && accuracy >= 0.75
              ? "hard"
              : "medium";
          const preferredQuestions = questions.filter((q) => q.difficulty === targetDifficulty);
          const fallbackQuestions = questions.filter((q) => q.difficulty !== targetDifficulty);
          const preferred = mode === "revision"
            ? [...shuffle(preferredQuestions.filter((q) => dueReviewIds.has(q.id))), ...shuffle(preferredQuestions.filter((q) => !dueReviewIds.has(q.id)))]
            : shuffle(preferredQuestions);
          const fallback = mode === "revision"
            ? [...shuffle(fallbackQuestions.filter((q) => dueReviewIds.has(q.id))), ...shuffle(fallbackQuestions.filter((q) => !dueReviewIds.has(q.id)))]
            : shuffle(fallbackQuestions);
          return {
            questions: [...preferred, ...fallback],
            priority: attempts >= 3 ? accuracy : 0.5,
          };
        }).sort((a, b) => a.priority - b.priority);

        const chosen: any[] = [];
        let round = 0;
        while (chosen.length < count && groups.some((group) => group.questions.length > 0)) {
          for (const group of groups) {
            if (chosen.length >= count) break;
            const next = group.questions.shift();
            if (next) chosen.push(next);
          }
          round++;
          if (round > count) break;
        }
        allQuestions.push(...shuffle(chosen));
      } else {
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
      .insert({ user_id: user.id, mode, subjects, total_questions: prepared.length, examination, exam_year: examYear })
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
      ...((mode === "practice" || mode === "revision") ? { correct_answer: item.displayedCorrect, explanation: item.question.explanation } : {}),
      passage: item.question.passage, question_type: item.question.question_type,
      exam_hint: item.question.exam_hint,
    }));
    return respond({ session, questions });
  } catch (error) {
    console.error("cbt-start failed", error);
    return respond({ error: "Unable to start the exam right now." }, 500);
  }
});
