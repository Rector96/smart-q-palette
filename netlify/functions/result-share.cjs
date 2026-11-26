const htmlResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": statusCode === 200 ? "public, max-age=300" : "no-store",
    "x-content-type-options": "nosniff",
  },
  body,
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const token = String(params.token || "");
  const referralCode = String(params.ref || "").trim().toUpperCase();
  const app = ["whatsapp", "instagram", "tiktok", "share"].includes(params.utm_source)
    ? params.utm_source
    : "share";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ||
      !/^[A-Z0-9]{4,20}$/.test(referralCode)) {
    return htmlResponse(400, "<!doctype html><title>ROCKCBT</title><p>This result link is invalid.</p>");
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE;
  if (!supabaseUrl || !publicKey) {
    return htmlResponse(503, "<!doctype html><title>ROCKCBT</title><p>Result sharing is temporarily unavailable.</p>");
  }

  let card;
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/get_result_share_card`, {
      method: "POST",
      headers: {
        apikey: publicKey,
        authorization: `Bearer ${publicKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!response.ok) {
      console.error("Could not retrieve shared quiz result:", response.status);
      return htmlResponse(502, "<!doctype html><title>ROCKCBT</title><p>Could not load this result. Please try again.</p>");
    }
    card = await response.json();
  } catch (error) {
    console.error("Could not retrieve shared quiz result:", error);
    return htmlResponse(502, "<!doctype html><title>ROCKCBT</title><p>Could not load this result. Please try again.</p>");
  }

  if (!card || typeof card !== "object" || typeof card.first_name !== "string") {
    return htmlResponse(404, "<!doctype html><title>ROCKCBT</title><p>This result link could not be found.</p>");
  }

  const forwardedHost = event.headers["x-forwarded-host"] || event.headers.host || "www.weblines.org";
  const configuredOrigin = process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${forwardedHost}`;
  let origin;
  try {
    const parsedOrigin = new URL(configuredOrigin);
    if (parsedOrigin.protocol !== "https:") throw new Error("HTTPS is required.");
    origin = parsedOrigin.origin;
  } catch {
    return htmlResponse(400, "<!doctype html><title>ROCKCBT</title><p>This result link is invalid.</p>");
  }

  const landingUrl = new URL("/", origin);
  landingUrl.searchParams.set("ref", referralCode);
  landingUrl.searchParams.set("utm_source", app);
  landingUrl.searchParams.set("utm_medium", "share_card");
  const shareUrl = new URL(`/share/${encodeURIComponent(token)}`, origin);
  shareUrl.searchParams.set("ref", referralCode);
  shareUrl.searchParams.set("utm_source", app);
  shareUrl.searchParams.set("utm_medium", "share_card");
  const imageUrl = new URL("/rockcbt-share-card.png", origin);
  const title = `${card.first_name} scored ${card.score}/${card.total_questions} on RockCBT`;
  const description = `Beat my score in ${card.subject}. Free past questions from 1999 to 2025.`;
  const placement = Number.isInteger(card.rank_position) && Number.isInteger(card.participant_count)
    ? `Rank ${card.rank_position} of ${card.participant_count}`
    : Number.isInteger(card.best_score_this_week)
      ? `Best this week: ${card.best_score_this_week}%`
      : "Practice challenge";
  const safeLandingUrl = escapeHtml(landingUrl.toString());
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedSubject = escapeHtml(card.subject);
  const escapedName = escapeHtml(card.first_name);
  const escapedPlacement = escapeHtml(placement);
  const escapedCode = escapeHtml(referralCode);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapedTitle}</title>
<meta name="description" content="${escapedDescription}">
<meta property="og:type" content="website"><meta property="og:site_name" content="RockCBT">
<meta property="og:title" content="${escapedTitle}">
<meta property="og:description" content="${escapedDescription}">
<meta property="og:url" content="${escapeHtml(shareUrl.toString())}">
<meta property="og:image" content="${escapeHtml(imageUrl.toString())}">
<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="RockCBT quiz challenge result">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapedTitle}">
<meta name="twitter:description" content="${escapedDescription}"><meta name="twitter:image" content="${escapeHtml(imageUrl.toString())}">
<meta http-equiv="refresh" content="4;url=${safeLandingUrl}"></head>
<body style="margin:0;background:#f4f7fb;color:#17233c;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;text-align:center">
<main style="width:min(92vw,480px);padding:24px;box-sizing:border-box;background:#fff;border-radius:20px;box-shadow:0 12px 40px #173f9f18">
<img src="${escapeHtml(imageUrl.toString())}" alt="RockCBT quiz challenge" style="width:100%;border-radius:14px">
<p style="margin:18px 0 6px;color:#2457c5;font-weight:700">ROCKCBT QUIZ CHALLENGE</p>
<h1 style="margin:0;font-size:26px">${escapedName} scored ${escapeHtml(`${card.score}/${card.total_questions}`)}</h1>
<p style="margin:8px 0;color:#58657d">${escapedSubject} · ${escapedPlacement}</p>
<p style="margin:18px 0 6px">Beat this score and practise for free.</p>
<p style="margin:0 0 18px;font-weight:800;color:#2457c5">Referral code: ${escapedCode}</p>
<a href="${safeLandingUrl}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#2457c5;color:#fff;text-decoration:none;font-weight:700">Join RockCBT</a>
</main><script>setTimeout(function(){window.location.replace(${JSON.stringify(landingUrl.toString()).replace(/</g, "\\u003c")});},4000);</script>
</body></html>`;

  return htmlResponse(200, html);
};
