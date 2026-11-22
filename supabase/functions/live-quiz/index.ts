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
  return 400;
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

    if (action === "create") {
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const gameMode = body.game_mode === "duel" ? "duel" : "group";
      const timePerQuestion = Number(body.time_per_question);
      const requestedCount = Number(body.num_questions);
      if (!subject || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100 ||
          !Number.isInteger(timePerQuestion) || timePerQuestion < 5 || timePerQuestion > 300) {
        return respond({ error: "Choose a subject, 1–100 questions and a timer between 5 and 300 seconds." }, 400);
      }

      const { data: bank, error: bankError } = await admin.from("questions")
        .select("id,subject,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,exam_hint")
        .ilike("subject", subject)
        .eq("is_published", true)
        .limit(1000);
      if (bankError) throw bankError;
      const selected = shuffle(bank ?? []).slice(0, requestedCount);
      if (!selected.length) return respond({ error: "No published questions are available for this subject yet." }, 404);

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
    console.error("live-quiz failed:", message);
    const status = statusFor(message);
    return respond({
      error: message.includes("LIVE_QUIZ_LIMIT_REACHED")
        ? "You have used your 2 free live quiz sessions. Subscribe for unlimited access."
        : message.includes("ROOM_FULL")
          ? "This 1-vs-1 battle already has two players."
          : message.includes("ROOM_NOT_FOUND")
            ? "Quiz room not found."
            : message.includes("REVEAL_PERIOD_ACTIVE") || message.includes("QUESTION_TIMER_ACTIVE")
              ? "The current question is still active."
              : "The Live Quiz request could not be completed. Please try again.",
    }, status);
  }
});
