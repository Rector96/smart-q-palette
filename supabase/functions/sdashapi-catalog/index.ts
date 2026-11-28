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
  if (req.method !== "POST") return respond({ ok: false, message: "Method not allowed." }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return respond({ ok: false, message: "Sign in to continue." }, 401);

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
    if (!supabaseUrl || !serviceKey) {
      return respond({ ok: false, message: "Server configuration is incomplete." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return respond({ ok: false, message: "Your session is invalid. Please sign in again." }, 401);
    }

    const accessToken = Deno.env.get("SDASHAPI_ACCESS_TOKEN");
    // Until the paid provider plan is activated, retain the local test catalog.
    if (!accessToken) return respond({ ok: true, active: false });

    const headers = { AccessToken: accessToken, Accept: "application/json" };
    const endpoints = ["subjects", "exams", "years"];
    const responses = await Promise.all(endpoints.map(async (endpoint) => {
      const response = await fetch(`https://sdashapi.com/api/v1/${endpoint}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error("The provider returned an invalid catalogue response.");
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          throw new Error("SdashAPI access is not active. Check the paid plan and access token.");
        }
        throw new Error("SdashAPI catalogue is temporarily unavailable.");
      }
      return payload as { data?: unknown; status?: number };
    }));

    const subjectsRaw = responses[0].data;
    const examsRaw = responses[1].data;
    const yearsRaw = responses[2].data;
    if (!Array.isArray(subjectsRaw) || !Array.isArray(examsRaw) || !Array.isArray(yearsRaw)) {
      return respond({ ok: false, message: "SdashAPI returned an incomplete catalogue." }, 502);
    }

    const subjects = subjectsRaw.filter((item): item is { name: string; slug: string } =>
      !!item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).name === "string" &&
      typeof (item as Record<string, unknown>).slug === "string"
    ).map((item) => ({ name: item.name.trim(), slug: item.slug.trim().toLowerCase() }))
      .filter((item) => item.name && /^[a-z][a-z0-9-]{1,49}$/.test(item.slug));

    const examMap: Record<string, "JAMB" | "WAEC" | "NECO"> = {
      utme: "JAMB",
      jamb: "JAMB",
      wassce: "WAEC",
      waec: "WAEC",
      neco: "NECO",
    };
    const exams = [...new Set(examsRaw
      .filter((item) => !!item && typeof item === "object")
      .map((item) => examMap[String((item as Record<string, unknown>).slug ?? "").toLowerCase()])
      .filter((exam): exam is "JAMB" | "WAEC" | "NECO" => Boolean(exam)))];
    const years = [...new Set(yearsRaw
      .map(Number)
      .filter((year) => Number.isInteger(year) && year >= 1980 && year <= 2100))].sort((a, b) => b - a);

    if (!subjects.length || !exams.length || !years.length) {
      return respond({ ok: false, message: "SdashAPI returned no usable subjects, examinations or years." }, 502);
    }

    // Discovery endpoints expose global lists, not exact subject/exam/year
    // intersections. The start endpoint verifies actual question coverage.
    const catalog = exams.flatMap((examination) =>
      years.flatMap((year) =>
        subjects.map((subject) => ({
          examination,
          year,
          subject: subject.slug,
          name: subject.name,
        }))
      )
    );

    return respond({ ok: true, active: true, catalog });
  } catch (error) {
    console.error("sdashapi-catalog failed:", error);
    const message = error instanceof Error ? error.message : "SdashAPI catalogue is temporarily unavailable.";
    return respond({ ok: false, message }, 503);
  }
});
