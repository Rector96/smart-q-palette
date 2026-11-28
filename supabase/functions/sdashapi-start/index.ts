import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProviderQuestion = {
  id: number | string;
  question: string;
  options?: unknown;
  option?: unknown;
  answer?: unknown;
  solution?: unknown;
  image?: unknown;
  metadata?: unknown;
  topic?: unknown;
};

type NormalizedQuestion = {
  id: string;
  subject: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  solution: string | null;
  image: string | null;
  topic: string | null;
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSourceQuestions(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  const value = result as Record<string, unknown>;
  if (Array.isArray(value.data)) return value.data;
  if (value.question && typeof value.question === "object") return [value.question];
  if (value.data && typeof value.data === "object") return [value.data];
  return [];
}

function normalizeQuestions(source: unknown[], subject: string): NormalizedQuestion[] {
  const seen = new Set<string>();
  return source
    .filter((q): q is ProviderQuestion =>
      !!q && typeof q === "object" && "id" in q && "question" in q &&
      (typeof q.id === "number" || typeof q.id === "string") &&
      /^\d+$/.test(String(q.id)) && typeof q.question === "string"
    )
    .map((q) => {
      const raw = q.options ?? q.option ?? {};
      const sourceOptions = raw && typeof raw === "object"
        ? raw as Record<string, unknown>
        : {};
      const options: Record<string, string> = {};
      for (const letter of ["a", "b", "c", "d", "e"]) {
        const value = sourceOptions[letter] ?? sourceOptions[letter.toUpperCase()];
        if (typeof value === "string" && value.trim()) {
          options[letter.toUpperCase()] = value.trim();
        }
      }
      return {
        id: String(q.id),
        subject,
        question: q.question.trim(),
        options,
        answer: String(q.answer ?? "").trim().toUpperCase(),
        solution: typeof q.solution === "string" ? q.solution : null,
        image: typeof q.image === "string" ? q.image : null,
        topic: typeof q.topic === "string"
          ? q.topic.trim() || null
          : q.metadata && typeof q.metadata === "object" &&
              typeof (q.metadata as Record<string, unknown>).topic === "string"
            ? String((q.metadata as Record<string, unknown>).topic).trim() || null
            : null,
      };
    })
    .filter((q) => {
      if (!q.question || Object.keys(q.options).length < 2 ||
          !["A", "B", "C", "D", "E"].includes(q.answer) ||
          !q.options[q.answer] || seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, message: "Method not allowed." }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return respond({ ok: false, message: "Authentication required." }, 401);

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
    const accessToken = Deno.env.get("SDASHAPI_ACCESS_TOKEN");
    if (!supabaseUrl || !serviceKey) {
      return respond({ ok: false, message: "Server configuration is incomplete." }, 500);
    }
    if (!accessToken) {
      return respond({
        ok: false, code: "PROVIDER_TOKEN_MISSING",
        message: "The question provider is temporarily unavailable.",
      }, 503);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    if (authError || !userData.user) {
      return respond({ ok: false, message: "Invalid or expired session." }, 401);
    }

    const body = await req.json();
    const mode = String(body.mode ?? "cbt").toLowerCase();
    const examination = String(body.examination ?? "").toUpperCase();
    const year = Number(body.year);
    const subjects = Array.isArray(body.subjects)
      ? body.subjects.map((value: unknown) => String(value).trim().toLowerCase())
      : [String(body.subject ?? "").trim().toLowerCase()];
    const suppliedCounts = body.subjectQuestionCounts ?? body.questionCounts ?? {};
    const countsInput = subjects.length === 1 &&
      Object.keys(suppliedCounts).length === 0 && body.limit != null
      ? { [subjects[0]]: body.limit }
      : suppliedCounts;
    const durationSeconds = Number(body.durationSeconds ?? 0);

    if (!["practice", "cbt", "mock"].includes(mode)) {
      return respond({ ok: false, message: "Choose Practice, CBT Exam or Mock." }, 400);
    }
    if (!["WAEC", "JAMB", "NECO"].includes(examination)) {
      return respond({ ok: false, message: "Choose JAMB, WAEC or NECO." }, 400);
    }
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return respond({ ok: false, message: "Enter a valid examination year." }, 400);
    }
    if (subjects.length !== (mode === "mock" ? 4 : 1) ||
        subjects.some((subject: string) => !/^[a-z][a-z\s-]{1,49}$/.test(subject)) ||
        new Set(subjects).size !== subjects.length) {
      return respond({
        ok: false,
        message: mode === "mock" ? "Mock exams require four different subjects." : "Choose one valid subject.",
      }, 400);
    }
    if (!countsInput || typeof countsInput !== "object" || Array.isArray(countsInput)) {
      return respond({ ok: false, message: "Set a question count for each subject." }, 400);
    }

    const allocations: Record<string, number> = {};
    for (const subject of subjects) {
      const count = Number(countsInput[subject] ?? (subjects.length === 1 ? body.limit : NaN));
      if (!Number.isInteger(count) || count < 1 || count > 50) {
        return respond({
          ok: false,
          code: "INVALID_SUBJECT_ALLOCATION",
          message: "Choose between 1 and 50 questions for each subject.",
        }, 400);
      }
      allocations[subject] = count;
    }
    if (Object.keys(countsInput).length !== subjects.length ||
        Object.keys(countsInput).some((subject) => !subjects.includes(subject))) {
      return respond({ ok: false, message: "Question counts must match the selected subjects." }, 400);
    }

    if (mode === "practice" ? durationSeconds !== 0 :
        (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86400)) {
      return respond({
        ok: false,
        message: mode === "practice" ? "Practice mode is untimed." : "Timed exams require a valid duration.",
      }, 400);
    }

    const providerType = examination === "JAMB" ? "utme" : examination === "NECO" ? "neco" : "wassce";
    const questions: NormalizedQuestion[] = [];

    for (const subject of subjects) {
      const url = new URL("https://www.sdashapi.com/api/v2/q");
      url.searchParams.set("subject", subject);
      url.searchParams.set("type", providerType);
      url.searchParams.set("year", String(year));
      url.searchParams.set("limit", String(allocations[subject]));

      let upstream: Response;
      try {
        upstream = await fetch(url, {
          method: "GET",
          headers: { AccessToken: accessToken, Accept: "application/json" },
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        return respond({
          ok: false, code: "PROVIDER_UNAVAILABLE",
          message: "The question provider could not be reached. Please try again.",
        }, 503);
      }

      const raw = await upstream.text();
      let result: unknown;
      try {
        result = JSON.parse(raw);
      } catch {
        return respond({ ok: false, message: "The question provider returned an invalid response." }, 502);
      }

      if (!upstream.ok) {
        if (upstream.status === 401) {
          return respond({ ok: false, code: "PROVIDER_TOKEN_INVALID", message: "The provider token is invalid." }, 503);
        }
        if (upstream.status === 403) {
          return respond({ ok: false, code: "PROVIDER_ACCESS_RESTRICTED", message: "This exam selection is not available on the active provider plan." }, 403);
        }
        if (upstream.status === 404) {
          return respond({ ok: false, code: "NO_QUESTIONS_FOUND", message: "No questions were found for " + subject + " in " + year + "." }, 404);
        }
        if (upstream.status === 429) {
          return respond({ ok: false, code: "PROVIDER_QUOTA_EXCEEDED", message: "The provider request limit has been reached. Try again later." }, 429);
        }
        console.error("SdashAPI upstream status:", upstream.status);
        return respond({ ok: false, message: "Unable to fetch questions right now." }, 502);
      }

      const normalized = normalizeQuestions(getSourceQuestions(result), subject);
      if (normalized.length !== allocations[subject]) {
        return respond({
          ok: false,
          code: "INSUFFICIENT_QUESTIONS",
          message: "The provider returned " + normalized.length + " valid questions for " +
            subject + ", but " + allocations[subject] + " were requested. Reduce the count or choose another year.",
        }, 422);
      }
      questions.push(...normalized);
    }

    const { data: sessionData, error: sessionError } = await admin.rpc(
      "create_sdashapi_multi_subject_exam_session",
      {
        p_user_id: userData.user.id,
        p_mode: mode,
        p_examination: examination,
        p_exam_year: year,
        p_subjects: subjects,
        p_subject_question_counts: allocations,
        p_questions: questions,
        p_duration_seconds: durationSeconds,
      },
    );

    if (sessionError || !sessionData?.session_id) {
      console.error("SdashAPI session creation failed:", sessionError);
      return respond({
        ok: false,
        message: "Questions were fetched, but the exam session could not be saved.",
      }, 500);
    }

    return respond({
      ok: true,
      sessionId: sessionData.session_id,
      mode,
      examination,
      subjects,
      subjectQuestionCounts: allocations,
      year,
      total: questions.length,
      durationSeconds,
      questions: questions.map((q, index) => ({
        position: index + 1,
        subject: q.subject,
        question: q.question,
        options: q.options,
        image: q.image,
        topic: q.topic,
      })),
    });
  } catch (error) {
    console.error("sdashapi-start error:", error);
    return respond({ ok: false, message: "An unexpected server error occurred." }, 500);
  }
});
