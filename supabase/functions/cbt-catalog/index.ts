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
    if (!token || token === authHeader) return respond({ error: "Sign in to continue." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !secretKeysRaw) return respond({ error: "Server configuration is incomplete." }, 500);
    const secretKey = JSON.parse(secretKeysRaw).default;
    if (!secretKey) return respond({ error: "Server secret key is unavailable." }, 500);

    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);

    const { data, error } = await admin.from("questions")
      .select("examination,year,subject")
      .eq("is_published", true)
      .not("examination", "is", null)
      .not("year", "is", null)
      .order("examination")
      .order("year")
      .order("subject")
      .limit(10000);

    if (error) return respond({ error: "Could not load available examinations." }, 500);

    const unique = new Map<string, { examination: string; year: number; subject: string }>();
    for (const row of data ?? []) {
      if (!row.examination || !row.year || !row.subject) continue;
      const item = { examination: row.examination, year: row.year, subject: row.subject };
      unique.set(`${item.examination.toUpperCase()}|${item.year}|${item.subject.toLowerCase()}`, item);
    }

    return respond({ catalog: [...unique.values()] });
  } catch (error) {
    console.error("cbt-catalog failed", error);
    return respond({ error: "Unable to load examinations right now." }, 500);
  }
});
