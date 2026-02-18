import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRAND = {
  name: "Weblines CBT",
  url: "https://www.weblines.org",
  email: "weblinescbt@gmail.com",
  color: "#3b82f6",
};

function emailTemplate(title: string, body: string, buttonText: string, buttonUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
<!-- Header -->
<tr><td style="background:linear-gradient(135deg,${BRAND.color},#6366f1);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">${BRAND.name}</h1>
</td></tr>
<!-- Body -->
<tr><td style="padding:32px 24px;">
<h2 style="color:#1a1a2e;font-size:18px;font-weight:700;margin:0 0 16px;">${title}</h2>
${body}
<!-- CTA Button -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td align="center">
<a href="${buttonUrl}" style="display:inline-block;background:${BRAND.color};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:14px;">${buttonText}</a>
</td></tr></table>
</td></tr>
<!-- Footer -->
<tr><td style="padding:20px 24px;border-top:1px solid #eee;text-align:center;">
<p style="color:#888;font-size:11px;margin:0 0 4px;">${BRAND.name}</p>
<p style="color:#888;font-size:11px;margin:0 0 4px;"><a href="${BRAND.url}" style="color:${BRAND.color};text-decoration:none;">${BRAND.url}</a></p>
<p style="color:#888;font-size:11px;margin:0;">Support: ${BRAND.email}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

const TEMPLATES: Record<string, (name: string) => { subject: string; html: string }> = {
  welcome: (name: string) => ({
    subject: "Welcome to Weblines CBT – Let's Start Winning 🎓",
    html: emailTemplate(
      `Welcome, ${name}!`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">We're excited to have you on board! With Weblines CBT, you can practice for JAMB, WAEC, NECO and other exams with real CBT simulations.</p>
<p style="color:#555;font-size:14px;line-height:1.7;">Start your first practice test today and take a step closer to your dream score.</p>`,
      "Start Practicing",
      `${BRAND.url}/dashboard`
    ),
  }),
  first_cbt: (name: string) => ({
    subject: "Great Job on Your First CBT Test!",
    html: emailTemplate(
      `Well done, ${name}!`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">You've just completed your first CBT practice exam. That's a great start!</p>
<p style="color:#555;font-size:14px;line-height:1.7;">Consistency is key to success. Keep practicing daily, review your weak areas, and watch your scores improve.</p>`,
      "Take Another Test",
      `${BRAND.url}/dashboard`
    ),
  }),
  trial_expired: (name: string) => ({
    subject: "Your Free Trial Has Ended – Unlock Full Access",
    html: emailTemplate(
      `${name}, your free trial has ended`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">You've used all your free practice sessions. Upgrade to Premium to unlock:</p>
<ul style="color:#555;font-size:14px;line-height:1.9;">
<li>Unlimited CBT simulations</li>
<li>All subjects and 25,000+ questions</li>
<li>Full performance tracking and analytics</li>
<li>24/7 AI Tutor access</li>
</ul>`,
      "Subscribe Now",
      `${BRAND.url}/dashboard`
    ),
  }),
  subscription_success: (name: string) => ({
    subject: "Subscription Successful – Welcome to Premium 🎉",
    html: emailTemplate(
      `Congratulations, ${name}!`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">Your premium subscription has been activated. Thank you for choosing Weblines CBT!</p>
<p style="color:#555;font-size:14px;line-height:1.7;">You now have full access to unlimited exams, all subjects, performance analytics, and our AI Tutor.</p>`,
      "Start Practicing",
      `${BRAND.url}/dashboard`
    ),
  }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const { type, email, name } = await req.json();
    if (!type || !email) throw new Error("Missing type or email");

    const templateFn = TEMPLATES[type];
    if (!templateFn) throw new Error(`Unknown email type: ${type}`);

    const { subject, html } = templateFn(name || "Student");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Weblines CBT <onboarding@resend.dev>`,
        to: [email],
        subject,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Resend error:", data);
      throw new Error(data.message || "Failed to send email");
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
