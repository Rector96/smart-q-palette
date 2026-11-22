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
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Sign in to continue." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!url || !secretKeysRaw) return respond({ error: "Server configuration is incomplete." }, 500);
    const secretKey = JSON.parse(secretKeysRaw).default;
    if (!secretKey) return respond({ error: "Server secret key is unavailable." }, 500);

    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid. Please sign in again." }, 401);

    const body = await req.json();
    const bookId = typeof body.bookId === "string" ? body.bookId : "";
    if (!bookId) return respond({ error: "Book was not specified." }, 400);

    const { data: book, error: bookError } = await admin
      .from("digital_library")
      .select("id,is_free,full_file_url")
      .eq("id", bookId)
      .maybeSingle();
    if (bookError || !book) return respond({ error: "Book not found." }, 404);

    if (!book.is_free) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("is_subscribed")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (profileError || !profile?.is_subscribed) return respond({ error: "An active subscription is required." }, 403);
    }

    const objectPath = book.full_file_url;
    if (!objectPath || /^https?:\/\//i.test(objectPath)) {
      return respond({ error: "This book has an older external file link. Please re-upload its full PDF from Library Management." }, 409);
    }

    const { data: signed, error: signError } = await admin.storage
      .from("library")
      .createSignedUrl(objectPath, 600);
    if (signError || !signed?.signedUrl) return respond({ error: "The full PDF could not be opened. Please contact support." }, 500);

    return respond({ url: signed.signedUrl, expiresIn: 600 });
  } catch (error) {
    console.error("library-access failed", error);
    return respond({ error: "Unable to open this book right now." }, 500);
  }
});
