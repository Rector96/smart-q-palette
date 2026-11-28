
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
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
};

type NormalizedQuestion = {
  id: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  solution: string | null;
  image: string | null;
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

    const accessToken = Deno.env.get("SDASHAPI_ACCESS_TOKEN");

    if (!supabaseUrl || !serviceKey) {
      return respond({
        ok: false,
        message: "Server configuration is incomplete.",
      }, 500);
    }

    if (!accessToken) {
      return respond({
        ok: false,
        code: "PROVIDER_TOKEN_MISSING",
        message: "The question provider is temporarily unavailable.",
      }, 503);
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

    const examination = String(body.examination ?? "").toUpperCase();
    const subject = String(body.subject ?? "").trim().toLowerCase();
    const year = Number(body.year);
    const limit = Number(body.limit ?? 20);
    const durationSeconds = Number(body.durationSeconds ?? 0);

    if (!["WAEC", "JAMB", "NECO"].includes(examination)) {
      return respond({ ok: false, message: "Choose JAMB, WAEC or NECO." }, 400);
    }

    if (!/^[a-z][a-z\s-]{1,49}$/.test(subject)) {
      return respond({ ok: false, message: "Enter a valid subject." }, 400);
    }

    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return respond({ ok: false, message: "Enter a valid examination year." }, 400);
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return respond({
        ok: false,
        message: "Question count must be between 1 and 50.",
      }, 400);
    }

    if (
  !Number.isInteger(durationSeconds) ||
  durationSeconds < 0 ||
  durationSeconds > 86400
) {
  return respond({ ok: false, message: "Invalid exam duration." }, 400);
}

    const providerType = examination === "JAMB" ? "utme" : examination === "NECO" ? "neco" : "wassce";

    const url = new URL("https://www.sdashapi.com/api/v1/q");
    url.searchParams.set("subject", subject);
    url.searchParams.set("type", providerType);
    url.searchParams.set("year", String(year));
    url.searchParams.set("limit", String(limit));

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        AccessToken: accessToken,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });

    const raw = await upstream.text();

    let result: unknown;

    try {
      result = JSON.parse(raw);
    } catch {
      return respond({
        ok: false,
        message: "The question provider returned an invalid response.",
      }, 502);
    }

    if (!upstream.ok) {
      if (upstream.status === 401) {
        return respond({
          ok: false,
          code: "PROVIDER_TOKEN_INVALID",
          message: "The question provider token is invalid or unavailable.",
        }, 503);
      }

      if (upstream.status === 403) {
        return respond({
          ok: false,
          code: "PROVIDER_ACCESS_RESTRICTED",
          message: "This subject or year requires an active provider plan.",
        }, 403);
      }

      if (upstream.status === 404) {
        return respond({
          ok: false,
          code: "NO_QUESTIONS_FOUND",
          message: "No questions were found for those filters.",
        }, 404);
      }

      if (upstream.status === 429) {
        return respond({
          ok: false,
          code: "PROVIDER_QUOTA_EXCEEDED",
          message: "The question provider quota has been reached. Try again later.",
        }, 429);
      }

      console.error("SdashAPI upstream status:", upstream.status);

      return respond({
        ok: false,
        message: "Unable to fetch questions right now.",
      }, 502);
    }

    let sourceQuestions: unknown[] = [];
    const resultObject = result && typeof result === "object"
      ? result as Record<string, unknown>
      : null;

    if (Array.isArray(result)) {
      sourceQuestions = result;
    } else if (Array.isArray(resultObject?.data)) {
      sourceQuestions = resultObject.data;
    } else if (resultObject?.question) {
      sourceQuestions = [resultObject.question];
    } else if (resultObject?.data && typeof resultObject.data === "object") {
      sourceQuestions = [resultObject.data];
    }

    const seenIds = new Set<string>();

    const questions: NormalizedQuestion[] = sourceQuestions
      .filter((q): q is ProviderQuestion =>
        !!q &&
        typeof q === "object" &&
        "id" in q &&
        "question" in q &&
        q &&
        (typeof q.id === "number" || typeof q.id === "string") &&
        /^\d+$/.test(String(q.id)) &&
        typeof q.question === "string"
      )
      .map((q) => {
        const rawOptionsValue = q.options ?? q.option ?? {};
        const rawOptions = rawOptionsValue && typeof rawOptionsValue === "object"
          ? rawOptionsValue as Record<string, unknown>
          : {};
        const options: Record<string, string> = {};

        for (const letter of ["a", "b", "c", "d", "e"]) {
          const value = rawOptions[letter] ?? rawOptions[letter.toUpperCase()];

          if (typeof value === "string" && value.trim()) {
            options[letter.toUpperCase()] = value.trim();
          }
        }

        const answer = String(q.answer ?? "").trim().toUpperCase();

        return {
          id: String(q.id),
          question: q.question.trim(),
          options,
          answer,
          solution: typeof q.solution === "string" ? q.solution : null,
          image: typeof q.image === "string" ? q.image : null,
        };
      })
      .filter((q) => {
        if (
          q.question.length === 0 ||
          Object.keys(q.options).length < 2 ||
          !["A", "B", "C", "D", "E"].includes(q.answer) ||
          !q.options[q.answer] ||
          seenIds.has(q.id)
        ) {
          return false;
        }

        seenIds.add(q.id);
        return true;
      });

    if (questions.length === 0) {
      return respond({
        ok: false,
        code: "NO_VALID_QUESTIONS",
        message: "No usable questions with answer keys were returned.",
      }, 404);
    }

    const { data: sessionData, error: sessionError } = await admin.rpc(
      "create_sdashapi_exam_session",
      {
        p_user_id: userData.user.id,
        p_examination: examination,
        p_subject: subject,
        p_exam_year: year,
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

    // Never send answer keys or solutions to the student before submission.
    const studentQuestions = questions.map((q, index) => ({
      position: index + 1,
      question: q.question,
      options: q.options,
      image: q.image,
    }));

    return respond({
      ok: true,
      sessionId: sessionData.session_id,
      examination,
      subject,
      year,
      total: studentQuestions.length,
      durationSeconds,
      questions: studentQuestions,
    });
  } catch (error) {
    console.error("sdashapi-start error:", error);

    return respond({
      ok: false,
      message: "An unexpected server error occurred.",
    }, 500);
  }
});
