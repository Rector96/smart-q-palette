exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const referralCode = String(params.ref || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(referralCode)) {
    return { statusCode: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: "<!doctype html><title>ROCKCBT</title><p>This referral link is invalid. Ask the sender for a new link.</p>" };
  }
  const host = event.headers["x-forwarded-host"] || event.headers.host || "www.weblines.org";
  const origin = "https://" + host;
  const authUrl = origin + "/auth?ref=" + encodeURIComponent(referralCode);
  const shareUrl = origin + "/.netlify/functions/referral-share?ref=" + encodeURIComponent(referralCode);
  const imageUrl = origin + "/rockcbt-share-card.svg";
  const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Practise for exams and still earn | ROCKCBT</title>
<meta name="description" content="Prepare smarter with ROCKCBT. Practise for your exams and still earn referral rewards.">
<meta property="og:type" content="website"><meta property="og:site_name" content="ROCKCBT">
<meta property="og:title" content="Practise for exams and still earn">
<meta property="og:description" content="Join ROCKCBT for smart exam practice. Use this invitation and start preparing with confidence.">
<meta property="og:url" content="${esc(shareUrl)}"><meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Practise for exams and still earn">
<meta name="twitter:description" content="Prepare smarter with ROCKCBT and earn referral rewards.">
<meta name="twitter:image" content="${esc(imageUrl)}">
<meta http-equiv="refresh" content="2;url=${esc(authUrl)}"></head>
<body style="margin:0;background:#071a2d;color:#fff;font:16px Arial,sans-serif;display:grid;min-height:100vh;place-items:center;text-align:center">
<main style="padding:32px"><img src="${esc(imageUrl)}" alt="ROCKCBT" style="width:min(92vw,560px);border-radius:20px"><h1>Practise for exams and still earn.</h1><p>Opening your ROCKCBT invitation…</p><a href="${esc(authUrl)}" style="color:#b9f4d5">Continue to ROCKCBT</a></main>
<script>window.location.replace(${JSON.stringify(authUrl)});</script></body></html>`;
  return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }, body: html };
};
