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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function statusFor(message: string): number {
  if (message.includes("LIVE_QUIZ_LIMIT_REACHED")) return 403;
  if (message.includes("ROOM_NOT_FOUND") || message.includes("PROFILE_NOT_FOUND")) return 404;
  if (message.includes("ROOM_FULL") || message.includes("already")) return 409;
  if (message.includes("HOST_ONLY") || message.includes("NOT_A_PARTICIPANT")) return 403;
  return 500;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return respond({ error: "Sign in to use Live Quiz." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !secretKeysRaw) return respond({ error: "Server configuration is incomplete." }, 500);
    const secretKey = JSON.parse(secretKeysRaw).default;
    if (!secretKey) return respond({ error: "Server secret key is unavailable." }, 500);

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);
    const user = authData.user;

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("full_name").eq("user_id", user.id).maybeSingle();
    if (profileError) throw profileError;
    const displayName = String(profile?.full_name ?? "").trim().split(/\s+/)[0] || "Player";

    if (action === "subjects") {
      const { data, error } = await admin.from("questions")
        .select("subject")
        .eq("is_published", true);
      if (error) throw error;
      const subjects = [...new Set((data ?? []).map((row: any) => String(row.subject ?? "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      return respond({ subjects });
    }

    if (action === "generate") {
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
      const count = Number(body.num_questions);
      const difficulty = ["easy", "medium", "hard", "mixed"].includes(body.difficulty) ? body.difficulty : "mixed";
      if (!subject || !topic || !Number.isInteger(count) || count < 5 || count > 50) {
        return respond({ error: "Choose a subject, enter a topic and select 5–50 questions." }, 400);
      }
      const groqKey = Deno.env.get("GROQ_API_KEY");
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      if (!groqKey && !geminiKey) {
        console.error("Live Quiz AI is missing both GROQ_API_KEY and GEMINI_API_KEY Edge Function secrets.");
        return respond({ error: "AI question generation is not configured on this server yet. Add GROQ_API_KEY or GEMINI_API_KEY to the Supabase project's Edge Function secrets, then redeploy this function." }, 503);
      }
      const prompt = `Create exactly ${count} original multiple-choice quiz questions for the subject "${subject}" on the topic "${topic}". Difficulty: ${difficulty}. Use clear Nigerian secondary-school level language. Return ONLY a JSON array. Every item must contain question_text, option_a, option_b, option_c, option_d, and correct_answer (exactly A, B, C, or D). Options must be plausible, and exactly one answer must be correct. Do not include markdown or explanations outside JSON.`;
      const providers = [
        groqKey && { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: groqKey, model: "openai/gpt-oss-120b" },
        geminiKey && { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: geminiKey, model: "gemini-3.8-flash" },
      ].filter(Boolean) as { name: string; url: string; key: string; model: string }[];
      let questions: any[] | null = null;
      let lastStatus = 503;
      const providerFailures: string[] = [];

      // A provider only counts as successful after it returns a complete, valid question set.
      // This means malformed JSON or incomplete questions also trigger the other provider.
      for (const provider of providers) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
          const candidate = await fetch(provider.url, {
            method: "POST",
            signal: controller.signal,
            headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: provider.model,
              temperature: 0.55,
              messages: [
                {
                  role: "system",
                  content: "You are an expert Nigerian secondary-school teacher and assessment writer. Produce accurate, age-appropriate, curriculum-aligned multiple-choice questions. Return only a valid JSON array, with no markdown fences or text outside the JSON.",
                },
                {
                  role: "user",
                  content: prompt + " Each question must also include a short, student-friendly explanation of why the correct answer is right, and a brief exam_hint or learning tip. Keep explanations accurate and useful for revision.",
                },
              ],
            }),
          });
          if (!candidate.ok) {
            lastStatus = candidate.status;
            const providerBody = await candidate.text();
            providerFailures.push(`${provider.name} HTTP ${candidate.status}`);
            console.error(`Live Quiz ${provider.name} generation failed:`, candidate.status, providerBody.slice(0, 1000));
            continue;
          }

          const completion = await candidate.json();
          const content = String(completion.choices?.[0]?.message?.content ?? "");
          const jsonText = content.match(/\[[\s\S]*\]/)?.[0];
          if (!jsonText) {
            providerFailures.push(`${provider.name} returned no JSON array`);
            console.error(`Live Quiz ${provider.name} returned an invalid question payload.`);
            continue;
          }

          let parsed: any[];
          try {
            parsed = JSON.parse(jsonText);
          } catch {
            providerFailures.push(`${provider.name} returned malformed JSON`);
            console.error(`Live Quiz ${provider.name} returned malformed JSON.`);
            continue;
          }
          if (!Array.isArray(parsed)) {
            providerFailures.push(`${provider.name} response was not an array`);
            continue;
          }

          const candidateQuestions = parsed.slice(0, count).map((q: any) => ({
            question_text: String(q.question_text ?? "").trim(),
            option_a: String(q.option_a ?? "").trim(),
            option_b: String(q.option_b ?? "").trim(),
            option_c: String(q.option_c ?? "").trim(),
            option_d: String(q.option_d ?? "").trim(),
            correct_answer: String(q.correct_answer ?? "").trim().toUpperCase(),
            explanation: String(q.explanation ?? "").trim(),
            exam_hint: String(q.exam_hint ?? q.learning_tip ?? "").trim(),
          })).filter((q: any) =>
            q.question_text && q.option_a && q.option_b && q.option_c && q.option_d &&
            q.explanation && q.exam_hint &&
            ["A", "B", "C", "D"].includes(q.correct_answer)
          );

          if (candidateQuestions.length !== count) {
            providerFailures.push(`${provider.name} returned ${candidateQuestions.length} valid questions; expected ${count}`);
            console.error(`Live Quiz ${provider.name} returned an incomplete question set.`);
            continue;
          }

          questions = candidateQuestions;
          console.info(`Live Quiz question provider selected: ${provider.name}`);
          break;
        } catch (providerError) {
          lastStatus = 503;
          providerFailures.push(`${provider.name} request failed`);
          console.error(`Live Quiz ${provider.name} request failed:`, providerError);
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!questions) {
        return respond({
          error: lastStatus === 429
            ? "Both AI services are currently busy or rate-limited. Please wait a moment and try again."
            : "Neither Groq nor Gemini could produce a complete question set. Please try again shortly.",
        }, lastStatus === 429 ? 429 : 503);
      }
      return respond({ questions });
    }

    if (action === "create") {
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const gameMode = body.game_mode === "duel" ? "duel" : "group";
      const timePerQuestion = Number(body.time_per_question);
      const requestedCount = Number(body.num_questions);
      if (!subject || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100 ||
          !Number.isInteger(timePerQuestion) || timePerQuestion < 5 || timePerQuestion > 300) {
        return respond({ error: "Choose a subject, 1–100 questions and a timer between 5 and 300 seconds." }, 400);
      }

      let selected: any[] = [];
      if (Array.isArray(body.questions)) {
        if (body.questions.length < 1 || body.questions.length > 50) {
          return respond({ error: "The AI question set is empty or too large. Generate the questions again." }, 400);
        }
        selected = body.questions.map((q: any, index: number) => ({
          id: `ai-${index + 1}`,
          question_text: String(q.question_text ?? "").trim(),
          option_a: String(q.option_a ?? "").trim(),
          option_b: String(q.option_b ?? "").trim(),
          option_c: String(q.option_c ?? "").trim(),
          option_d: String(q.option_d ?? "").trim(),
          correct_answer: String(q.correct_answer ?? "").trim().toUpperCase(),
          explanation: String(q.explanation ?? "").trim() || null,
          exam_hint: String(q.exam_hint ?? "").trim() || null,
        }));
        if (selected.some((q: any) => !q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !["A", "B", "C", "D"].includes(q.correct_answer))) {
          return respond({ error: "Every question must have four options and one valid correct answer." }, 400);
        }
      } else {
        const { data: bank, error: bankError } = await admin.from("questions")
          .select("id,subject,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,exam_hint")
          .ilike("subject", subject)
          .eq("is_published", true)
          .limit(1000);
        if (bankError) throw bankError;
        selected = shuffle(bank ?? []).slice(0, requestedCount);
        if (!selected.length) return respond({ error: "No published questions are available for this subject yet. Choose AI generation or another subject." }, 404);
      }

      const publicQuestions = selected.map((q: any) => ({
        id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
      }));
      const answerKeys = selected.map((q: any, index: number) => ({
        question_index: index,
        correct_answer: String(q.correct_answer ?? "").toUpperCase(),
        explanation: q.explanation ?? null,
        exam_hint: q.exam_hint ?? null,
      }));
      if (answerKeys.some((key: any) => !["A", "B", "C", "D"].includes(key.correct_answer))) {
        return respond({ error: "Some questions have invalid answer keys. Please contact support." }, 422);
      }

      const { data, error } = await admin.rpc("live_quiz_create_room_internal", {
        p_user_id: user.id,
        p_subject: subject,
        p_game_mode: gameMode,
        p_time_per_question: timePerQuestion,
        p_questions: publicQuestions,
        p_answer_keys: answerKeys,
        p_display_name: displayName,
      });
      if (error) throw error;
      return respond({ room: data });
    }

    if (action === "join") {
      const roomCode = typeof body.room_code === "string" ? body.room_code.trim().toUpperCase() : "";
      if (!roomCode) return respond({ error: "Enter a room code." }, 400);
      const { data, error } = await admin.rpc("live_quiz_join_room_internal", {
        p_user_id: user.id,
        p_room_code: roomCode,
        p_display_name: displayName,
      });
      if (error) throw error;
      return respond({ room: data });
    }

    if (action === "get") {
      const roomCode = typeof body.room_code === "string" ? body.room_code.trim().toUpperCase() : "";
      if (!roomCode) return respond({ error: "Room code is required." }, 400);
      const { data: room, error: roomError } = await admin.from("quiz_rooms")
        .select("id,host_id,subject,game_mode,num_questions,time_per_question,room_code,status,current_question_index,questions,question_started_at,reveal_until,expires_at,created_at")
        .eq("room_code", roomCode).maybeSingle();
      if (roomError) throw roomError;
      if (!room) return respond({ error: "ROOM_NOT_FOUND" }, 404);
      if (new Date(room.expires_at).getTime() <= Date.now() && room.status !== "ended") {
        return respond({ error: "This quiz session has expired." }, 410);
      }
      const { data: participants, error: participantsError } = await admin.from("quiz_participants")
        .select("id,user_id,display_name,score,is_connected,joined_at")
        .eq("room_id", room.id).order("joined_at", { ascending: true });
      if (participantsError) throw participantsError;
      if (!(participants ?? []).some((p: any) => p.user_id === user.id)) {
        return respond({ error: "You must join this room before viewing it." }, 403);
      }
      const { data: myAnswer, error: answerError } = await admin.rpc("live_quiz_get_my_answer_internal", {
        p_user_id: user.id,
        p_room_id: room.id,
        p_question_index: room.current_question_index,
      });
      if (answerError) throw answerError;
      return respond({ room, participants: participants ?? [], my_answer: myAnswer ?? null });
    }

    if (action === "rematch") {
      const oldRoomId = typeof body.room_id === "string" ? body.room_id : "";
      if (!oldRoomId) return respond({ error: "Room ID is required." }, 400);
      const { data, error } = await admin.rpc("live_quiz_rematch_room_internal", {
        p_user_id: user.id,
        p_old_room_id: oldRoomId,
        p_display_name: displayName,
      });
      if (error) throw error;
      return respond({ room: data });
    }

    if (action === "submit") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      const questionIndex = Number(body.question_index);
      const selectedOption = body.selected_option == null ? null : String(body.selected_option).toUpperCase();
      if (!roomId || !Number.isInteger(questionIndex) ||
          (selectedOption !== null && !["A", "B", "C", "D"].includes(selectedOption))) {
        return respond({ error: "Invalid answer submission." }, 400);
      }
      const { data, error } = await admin.rpc("live_quiz_submit_answer_internal", {
        p_user_id: user.id,
        p_room_id: roomId,
        p_question_index: questionIndex,
        p_selected_option: selectedOption,
      });
      if (error) throw error;
      return respond({ result: data });
    }

    if (action === "start" || action === "advance") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      if (!roomId) return respond({ error: "Room ID is required." }, 400);
      const rpc = action === "start" ? "live_quiz_start_room_internal" : "live_quiz_advance_room_internal";
      const { data, error } = await admin.rpc(rpc, { p_user_id: user.id, p_room_id: roomId });
      if (error) throw error;
      return respond({ result: data });
    }

    return respond({ error: "Unknown Live Quiz action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("live-quiz failed:", error);
    const status = statusFor(message);
    const safeMessage = message.includes("LIVE_QUIZ_LIMIT_REACHED")
      ? "You have used your 2 free live quiz sessions. Subscribe for unlimited access."
      : message.includes("ROOM_FULL")
        ? "This 1-vs-1 battle already has two players."
        : message.includes("ROOM_NOT_FOUND")
          ? "Quiz room not found."
          : message.includes("REVEAL_PERIOD_ACTIVE") || message.includes("QUESTION_TIMER_ACTIVE")
            ? "The current question is still active."
            : message.toLowerCase().includes("profile not found")
              ? "Your player profile could not be found. Please sign out and sign in again."
              : "Room creation failed on the server. Please try again; support diagnostics have been recorded.";
    return respond({ error: safeMessage, code: message.slice(0, 160) }, status);
  }
});
