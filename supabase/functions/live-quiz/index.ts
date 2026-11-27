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

    const requestBody: unknown = await req.json();
    if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
      return respond({ error: "Invalid request body." }, 400);
    }
    const body = requestBody as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("full_name").eq("user_id", user.id).maybeSingle();
    if (profileError) throw profileError;
    const displayName = String(profile?.full_name ?? "").trim().split(/\s+/)[0] || "Player";

    if (action === "subjects") {
      const quizType = body.quiz_type === "examination" ? "examination" : "general";
      const examination = typeof body.examination === "string"
        ? body.examination.trim().toUpperCase()
        : "";
      const examYear = Number(body.exam_year);

      let query = admin.from("questions")
        .select("subject")
        .eq("is_published", true);

      if (quizType === "examination") {
        if (!["JAMB", "WAEC", "NECO"].includes(examination) ||
            !Number.isInteger(examYear) ||
            examYear < 2000 ||
            examYear > new Date().getFullYear()) {
          return respond({ error: "Select a valid examination board and year." }, 400);
        }

        query = query
          .eq("examination", examination)
          .eq("year", examYear);
      }

      const { data, error } = await query;
      if (error) throw error;

      const subjects = [...new Set(
        (data ?? [])
          .map((row) => String(row.subject ?? "").trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));

      return respond({ subjects });
    }

    if (action === "generate") {
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
      const count = Number(body.num_questions);
      const difficulty = typeof body.difficulty === "string" &&
        ["easy", "medium", "hard", "mixed"].includes(body.difficulty)
        ? body.difficulty
        : "mixed";
      if (!subject || !topic || !Number.isInteger(count) || count < 5 || count > 50) {
        return respond({ error: "Choose a subject, enter a topic and select 5Ã¢â‚¬â€œ50 questions." }, 400);
      }
      const groqKey = Deno.env.get("GROQ_API_KEY");
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      if (!groqKey && !geminiKey) {
        console.error("Live Quiz AI is missing both GROQ_API_KEY and GEMINI_API_KEY Edge Function secrets.");
        return respond({ error: "AI question generation is not configured on this server yet. Add GROQ_API_KEY or GEMINI_API_KEY to the Supabase project's Edge Function secrets, then redeploy this function." }, 503);
      }
      const quizType = body.quiz_type === "examination" ? "examination" : "general";
const examination = typeof body.examination === "string" ? body.examination.trim().toUpperCase() : "";
const examYear = Number(body.exam_year);

const examContext = quizType === "examination"
  ? `This is a ${examination} examination quiz for the year ${examYear}. Questions must reflect that examination board and year. Do not mix questions from other examination boards or years.`
  : "This is a general knowledge quiz. Do not restrict questions to JAMB, WAEC, NECO or any examination year.";

const prompt = `Create exactly ${count} original multiple-choice quiz questions for the subject "${subject}" on the topic "${topic}". ${examContext} Difficulty: ${difficulty}. Use clear Nigerian secondary-school level language. Return ONLY a JSON array. Every item must contain question_text, option_a, option_b, option_c, option_d, optional option_e, correct_answer (A, B, C, D or E), explanation, and exam_hint. Options must be plausible, and exactly one answer must be correct. If correct_answer is E, option_e must be provided. Do not include markdown or explanations outside JSON.`;
      const providers = [
        groqKey && { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: groqKey, model: "openai/gpt-oss-120b" },
        geminiKey && { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: geminiKey, model: "gemini-3.8-flash" },
      ].filter(Boolean) as { name: string; url: string; key: string; model: string }[];
      type GeneratedQuizQuestion = {
        question_text: string;
        option_a: string;
        option_b: string;
        option_c: string;
        option_d: string;
        correct_answer: string;
        explanation: string;
        exam_hint: string;
        topic: string;
      };

let questions: GeneratedQuizQuestion[] | null = null;
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

          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonText) as unknown;
          } catch {
            providerFailures.push(`${provider.name} returned malformed JSON`);
            console.error(`Live Quiz ${provider.name} returned malformed JSON.`);
            continue;
          }
          if (!Array.isArray(parsed)) {
            providerFailures.push(`${provider.name} response was not an array`);
            continue;
          }

          const parsedItems: unknown[] = parsed;
          const candidateQuestions = parsedItems
          .filter((q: unknown): q is Record<string, unknown> =>
            typeof q === "object" && q !== null && !Array.isArray(q)
          )
          .map((q) => ({
            question_text: String(q.question_text ?? "").trim(),
            option_a: String(q.option_a ?? "").trim(),
            option_b: String(q.option_b ?? "").trim(),
            option_c: String(q.option_c ?? "").trim(),
            option_d: String(q.option_d ?? "").trim(),
            option_e: String(q.option_e ?? "").trim(),
            correct_answer: String(q.correct_answer ?? "").trim().toUpperCase(),
            explanation: String(q.explanation ?? "").trim(),
            exam_hint: String(q.exam_hint ?? q.learning_tip ?? "").trim(),
            topic: topic,
          }))
          .filter((q) =>
            q.question_text && q.option_a && q.option_b && q.option_c && q.option_d &&
            q.explanation && q.exam_hint &&
            ["A", "B", "C", "D", "E"].includes(q.correct_answer) &&
          (q.correct_answer !== "E" || Boolean(q.option_e))
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
      const quizType = body.quiz_type === "examination" ? "examination" : "general";
      const examination = typeof body.examination === "string"
        ? body.examination.trim().toUpperCase()
        : "";
      const examYear = Number(body.exam_year);
      const requestedTopic = typeof body.topic === "string" ? body.topic.trim().slice(0, 300) : "";
      const timePerQuestion = Number(body.time_per_question);
      const requestedCount = Number(body.num_questions);

      if (!subject || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100 ||
          !Number.isInteger(timePerQuestion) || timePerQuestion < 5 || timePerQuestion > 300) {
        return respond({ error: "Choose a subject, 1Ã¢â‚¬â€œ100 questions and a timer between 5 and 300 seconds." }, 400);
      }

      if (quizType === "examination" &&
          (!["JAMB", "WAEC", "NECO"].includes(examination) ||
           !Number.isInteger(examYear) || examYear < 1980 || examYear > new Date().getFullYear())) {
        return respond({ error: "Choose a valid examination board and exam year." }, 400);
      }

      type LiveQuizQuestion = {
        id: string;
        question_text: string;
        option_a: string;
        option_b: string;
        option_c: string;
        option_d: string;
        option_e?: string | null;
        diagram_url?: string | null;
        topic?: string | null;
        correct_answer: string;
        explanation?: string | null;
        exam_hint?: string | null;
      };

      let selected: LiveQuizQuestion[] = [];

      if (Array.isArray(body.questions)) {
        if (body.questions.length !== requestedCount || body.questions.length > 50) {
          return respond({
            error: `The AI must provide exactly ${requestedCount} questions. Generate the set again.`,
          }, 400);
        }

        const aiQuestions = body.questions
          .filter((question: unknown): question is Record<string, unknown> =>
            typeof question === "object" && question !== null && !Array.isArray(question)
          )
          .map((question, index): LiveQuizQuestion => ({
            id: `ai-${index + 1}`,
            question_text: String(question.question_text ?? "").trim(),
            option_a: String(question.option_a ?? "").trim(),
            option_b: String(question.option_b ?? "").trim(),
            option_c: String(question.option_c ?? "").trim(),
            option_d: String(question.option_d ?? "").trim(),
            option_e: String(question.option_e ?? "").trim() || null,
            topic: String(question.topic ?? requestedTopic).trim() || null,
            correct_answer: String(question.correct_answer ?? "").trim().toUpperCase(),
            explanation: String(question.explanation ?? "").trim() || null,
            exam_hint: String(question.exam_hint ?? "").trim() || null,
          }));

        if (aiQuestions.length !== requestedCount) {
          return respond({ error: "Every question must be a valid question object. Generate the questions again." }, 400);
        }

        selected = aiQuestions;

        if (selected.some((question) =>
          !question.question_text || !question.option_a || !question.option_b ||
          !question.option_c || !question.option_d ||
          !["A", "B", "C", "D", "E"].includes(question.correct_answer) ||
          (question.correct_answer === "E" && !question.option_e)
        )) {
          return respond({
            error: "Every question must have valid options and a correct answer. Option E must exist when it is the answer.",
          }, 422);
        }
      } else {
        let bankQuery = admin.from("questions")
          .select("id,subject,topic,question_text,option_a,option_b,option_c,option_d,option_e,diagram_url:diagram_file,correct_answer,explanation,exam_hint")
          .ilike("subject", subject)
          .eq("is_published", true);

        if (quizType === "examination") {
          bankQuery = bankQuery
            .eq("examination", examination)
            .eq("year", examYear);
        }

        const { data: bank, error: bankError } = await bankQuery.limit(1000);
        if (bankError) throw bankError;

        selected = shuffle(bank ?? []).slice(0, requestedCount);

        if (selected.length !== requestedCount) {
          return respond({
            error: `Only ${selected.length} published questions are available. You requested ${requestedCount}. Choose another year, subject or question source.`,
          }, 422);
        }

        if (selected.some((question) =>
          !["A", "B", "C", "D", "E"].includes(String(question.correct_answer).toUpperCase()) ||
          (String(question.correct_answer).toUpperCase() === "E" && !question.option_e)
        )) {
          return respond({ error: "Some bank questions have invalid answer options. Please contact support." }, 422);
        }
      }

      const publicQuestions = selected.map((q) => ({
        id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        option_e: q.option_e || null,
        diagram_url: q.diagram_url || null,
        topic: q.topic || null,
      }));
      const answerKeys = selected.map((q, index) => ({
        question_index: index,
        correct_answer: String(q.correct_answer ?? "").toUpperCase(),
        explanation: q.explanation ?? null,
        exam_hint: q.exam_hint ?? null,
      }));
      if (answerKeys.some((key, index) =>
        !["A", "B", "C", "D", "E"].includes(key.correct_answer) ||
        (key.correct_answer === "E" && !selected[index].option_e)
      )) {
        return respond({ error: "Some questions have invalid answer keys. Please contact support." }, 422);
      }
      let data: unknown;
      let error: { message: string } | null = null;

      if (quizType === "examination") {
        const durationSeconds = Number(body.duration_seconds);

        if (!Number.isInteger(durationSeconds) ||
            durationSeconds < 60 ||
            durationSeconds > 86400) {
          return respond({
            error: "Set the total examination duration between 1 minute and 24 hours.",
          }, 400);
        }

        const result = await admin.rpc("live_quiz_create_exam_room_internal", {
          p_user_id: user.id,
          p_subject: subject,
          p_time_per_question: timePerQuestion,
          p_questions: publicQuestions,
          p_answer_keys: answerKeys,
          p_display_name: displayName,
          p_examination: examination,
          p_exam_year: examYear,
          p_host_participates: body.host_participates === true,
          p_duration_seconds: durationSeconds,
        });

        data = result.data;
        error = result.error;
      } else {
        const result = await admin.rpc("live_quiz_create_room_internal", {
          p_user_id: user.id,
          p_subject: subject,
          p_game_mode: gameMode,
          p_time_per_question: timePerQuestion,
          p_questions: publicQuestions,
          p_answer_keys: answerKeys,
          p_display_name: displayName,
          p_quiz_type: quizType,
          p_examination: null,
          p_exam_year: null,
          p_host_participates: body.host_participates === true,
        });

        data = result.data;
        error = result.error;
      }

      if (error) throw new Error(error.message);


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
        .select("id,host_id,subject,game_mode,num_questions,time_per_question,room_code,status,current_question_index,questions,question_started_at,reveal_until,expires_at,created_at,quiz_type,examination,exam_year,title,session_mode,answer_reveal_mode,duration_seconds,assignment_deadline,max_participants,min_participants,allow_late_join,is_locked,host_participates,shuffle_questions,shuffle_options,calculator_allowed,paused_at,paused_remaining_seconds,paused_duration_remaining_seconds,paused_reveal_remaining_seconds,started_at,ended_at,class_id")
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
      const isHost = room.host_id === user.id;
      const isParticipant = (participants ?? []).some((p) => p.user_id === user.id);

      if (!isHost && !isParticipant) {
        return respond({ error: "You must join this room before viewing it." }, 403);
      }

      let myAnswer = null;
      let myAttempt = null;

      if (isParticipant && room.quiz_type === "examination") {
        const { data, error: attemptError } = await admin.rpc(
          "live_quiz_get_my_exam_attempt_internal",
          {
            p_user_id: user.id,
            p_room_id: room.id,
          }
        );

        if (attemptError) throw attemptError;
        myAttempt = data ?? null;
      } else if (isParticipant) {
        const { data, error: answerError } = await admin.rpc(
          "live_quiz_get_my_answer_internal",
          {
            p_user_id: user.id,
            p_room_id: room.id,
            p_question_index: room.current_question_index,
          }
        );

        if (answerError) throw answerError;
        myAnswer = data ?? null;
      }

      return respond({
        room,
        participants: participants ?? [],
        my_answer: myAnswer,
        my_attempt: myAttempt,
        is_host: isHost,
        is_participant: isParticipant,
      });
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

    if (action === "results") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      if (!roomId) return respond({ error: "Room ID is required." }, 400);

      const { data: room, error: roomError } = await admin
        .from("quiz_rooms")
        .select("id,status,host_id,quiz_type")
        .eq("id", roomId)
        .maybeSingle();

      if (roomError) throw roomError;
      if (!room) return respond({ error: "ROOM_NOT_FOUND" }, 404);

      const { data: participant, error: participantError } = await admin
        .from("quiz_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (participantError) throw participantError;
      if (!participant) {
        return respond({ error: "You are not a participant in this quiz." }, 403);
      }

      if (room.quiz_type === "examination") {
        const { data: attempt, error: attemptError } = await admin
          .from("quiz_attempts")
          .select("id,status,score,total_questions,started_at,deadline_at,submitted_at,current_question_index")
          .eq("room_id", roomId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (attemptError) throw attemptError;
        if (!attempt) {
          return respond({ error: "Your examination attempt has not started." }, 404);
        }

        if (!["submitted", "expired"].includes(attempt.status)) {
          return respond({ error: "Your examination is still in progress." }, 403);
        }

        const { data: answers, error: answersError } = await admin
          .from("quiz_attempt_answers")
          .select("question_index,selected_option,is_correct,points_awarded,time_taken")
          .eq("attempt_id", attempt.id)
          .order("question_index", { ascending: true });

        if (answersError) throw answersError;

        return respond({
          attempt,
          answers: answers ?? [],
        });
      }

      if (room.status !== "ended") {
        return respond({ error: "Quiz results are not available yet." }, 403);
      }

      const { data: answers, error: answersError } = await admin
        .from("quiz_answers")
        .select("question_index,is_correct,time_taken")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .order("question_index", { ascending: true });

      if (answersError) throw answersError;

      return respond({ answers: answers ?? [] });
    }

    if (action === "submit") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      const questionIndex = Number(body.question_index);
      const selectedOption = body.selected_option == null
        ? null
        : String(body.selected_option).toUpperCase();

      if (!roomId || !Number.isInteger(questionIndex) ||
          (selectedOption !== null &&
           !["A", "B", "C", "D", "E"].includes(selectedOption))) {
        return respond({ error: "Invalid answer submission." }, 400);
      }

      const { data: room, error: roomError } = await admin
        .from("quiz_rooms")
        .select("quiz_type")
        .eq("id", roomId)
        .maybeSingle();

      if (roomError) throw roomError;
      if (!room) return respond({ error: "ROOM_NOT_FOUND" }, 404);

      const rpc = room.quiz_type === "examination"
        ? "live_quiz_submit_exam_answer_internal"
        : "live_quiz_submit_answer_internal";

      const { data, error } = await admin.rpc(rpc, {
        p_user_id: user.id,
        p_room_id: roomId,
        p_question_index: questionIndex,
        p_selected_option: selectedOption,
      });

      if (error) throw error;
      return respond({ result: data });
    }

    if (action === "pause" || action === "resume" || action === "end") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      if (!roomId) return respond({ error: "Room ID is required." }, 400);

      const rpcByAction: Record<string, string> = {
        pause: "live_quiz_pause_room_internal",
        resume: "live_quiz_resume_room_internal",
        end: "live_quiz_end_room_internal",
      };

      const { data, error } = await admin.rpc(rpcByAction[action], {
        p_user_id: user.id,
        p_room_id: roomId,
      });

      if (error) throw error;
      return respond({ result: data });
    }

    if (action === "lock" || action === "unlock" || action === "set_lock") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      if (!roomId) return respond({ error: "Room ID is required." }, 400);

      const locked = action === "lock"
        ? true
        : action === "unlock"
          ? false
          : body.locked;

      if (typeof locked !== "boolean") {
        return respond({ error: "A boolean locked value is required." }, 400);
      }

      const { data, error } = await admin.rpc("live_quiz_set_room_lock_internal", {
        p_user_id: user.id,
        p_room_id: roomId,
        p_locked: locked,
      });

      if (error) throw error;
      return respond({ result: data });
    }

    if (action === "start" || action === "advance") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      if (!roomId) return respond({ error: "Room ID is required." }, 400);

      const { data: room, error: roomError } = await admin
        .from("quiz_rooms")
        .select("quiz_type")
        .eq("id", roomId)
        .maybeSingle();

      if (roomError) throw roomError;
      if (!room) return respond({ error: "ROOM_NOT_FOUND" }, 404);

      if (room.quiz_type === "examination") {
        if (action === "advance") {
          return respond({
            error: "Examination participants control their own question progress.",
          }, 400);
        }

        const { data, error } = await admin.rpc(
          "live_quiz_start_exam_internal",
          {
            p_user_id: user.id,
            p_room_id: roomId,
          }
        );

        if (error) throw error;
        return respond({ result: data });
      }

      const rpc = action === "start"
        ? "live_quiz_start_room_internal"
        : "live_quiz_advance_room_internal";

      const { data, error } = await admin.rpc(rpc, {
        p_user_id: user.id,
        p_room_id: roomId,
      });

      if (error) throw error;
      return respond({ result: data });
    }

    if (action === "progress") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";
      const questionIndex = Number(body.question_index);

      if (!roomId || !Number.isInteger(questionIndex) || questionIndex < 0) {
        return respond({ error: "Invalid examination question position." }, 400);
      }

      const { data, error } = await admin.rpc(
        "live_quiz_set_exam_progress_internal",
        {
          p_user_id: user.id,
          p_room_id: roomId,
          p_question_index: questionIndex,
        }
      );

      if (error) throw error;
      return respond({ result: data });
    }

    if (action === "finish") {
      const roomId = typeof body.room_id === "string" ? body.room_id : "";

      if (!roomId) {
        return respond({ error: "Room ID is required." }, 400);
      }

      const { data, error } = await admin.rpc(
        "live_quiz_finish_exam_attempt_internal",
        {
          p_user_id: user.id,
          p_room_id: roomId,
        }
      );

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
