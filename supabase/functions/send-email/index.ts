import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRAND = {
  name: "ROCKCBT",
  url: "https://www.weblines.org",
  email: "weblinescbt@gmail.com",
  color: "#3b82f6",
  logo: "https://www.weblines.org/logo.png",
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
<tr><td style="background:linear-gradient(135deg,${BRAND.color},#6366f1);padding:28px 24px;text-align:center;">
<img src="${BRAND.logo}" alt="${BRAND.name}" width="60" height="60" style="display:block;margin:0 auto 10px;border-radius:12px;" />
<h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0;">${BRAND.name}</h1>
</td></tr>
<tr><td style="padding:32px 24px;">
<h2 style="color:#1a1a2e;font-size:18px;font-weight:700;margin:0 0 16px;">${title}</h2>
${body}
<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td align="center">
<a href="${buttonUrl}" style="display:inline-block;background:${BRAND.color};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:14px;">${buttonText}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #eee;text-align:center;">
<p style="color:#888;font-size:11px;margin:0 0 4px;">${BRAND.name} · <a href="${BRAND.url}" style="color:${BRAND.color};text-decoration:none;">${BRAND.url}</a></p>
<p style="color:#888;font-size:11px;margin:0;">Support: ${BRAND.email}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

const TEMPLATES: Record<string, (name: string) => { subject: string; html: string }> = {
  welcome: (name: string) => ({
    subject: "Welcome to ROCKCBT! 🎓 Your Exam Success Starts Here",
    html: emailTemplate(
      `Welcome, ${name}! 🎉`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">We're thrilled to have you join the ROCKCBT family!</p>
<ul style="color:#555;font-size:14px;line-height:2;">
<li>📝 Practice JAMB, WAEC & NECO with real CBT simulations</li>
<li>📊 Track your performance with detailed analytics</li>
<li>🤖 Get help from our AI Tutor anytime</li>
<li>🔗 Share exams with friends and compete</li>
</ul>`,
      "Start Practicing Now",
      `${BRAND.url}/dashboard`
    ),
  }),
  first_cbt: (name: string) => ({
    subject: "Great Job on Your First CBT Test! 🏆",
    html: emailTemplate(
      `Well done, ${name}!`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">You've just completed your first CBT practice exam — that's a huge step! 🎯</p>
<p style="color:#555;font-size:14px;line-height:1.7;">Keep practicing daily and watch your scores improve.</p>`,
      "Take Another Test",
      `${BRAND.url}/dashboard`
    ),
  }),
  trial_expired: (name: string) => ({
    subject: "Your Free Trial Has Ended – Unlock Full Access 🔓",
    html: emailTemplate(
      `${name}, your free trial has ended`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">Upgrade to Premium to unlock:</p>
<ul style="color:#555;font-size:14px;line-height:1.9;">
<li>✅ Unlimited CBT simulations</li>
<li>✅ All subjects and 25,000+ questions</li>
<li>✅ Full performance tracking</li>
<li>✅ 24/7 AI Tutor access</li>
</ul>`,
      "Subscribe Now",
      `${BRAND.url}/dashboard`
    ),
  }),
  subscription_success: (name: string) => ({
    subject: "Subscription Successful – Welcome to Premium! 🎉",
    html: emailTemplate(
      `Congratulations, ${name}!`,
      `<p style="color:#555;font-size:14px;line-height:1.7;">Your premium subscription has been activated. You now have full access to everything!</p>`,
      "Start Practicing",
      `${BRAND.url}/dashboard`
    ),
  }),
};

// Fetch ALL users with pagination
async function getAllUsers(supabase: any) {
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error("Failed to fetch users: " + error.message);
    if (!data.users || data.users.length === 0) break;
    allUsers.push(...data.users);
    if (data.users.length < perPage) break;
    page++;
  }
  return allUsers;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const payload = await req.json();
    const { type } = payload;

    if (type === "broadcast") {
      const { subject, body: messageBody } = payload;
      if (!subject || !messageBody) throw new Error("Missing subject or body");

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const users = await getAllUsers(supabase);
      
      // Deduplicate emails
      const emailSet = new Set<string>();
      for (const u of users) {
        if (u.email) emailSet.add(u.email.toLowerCase().trim());
      }
      const validEmails = Array.from(emailSet);

      console.log(`Broadcasting to ${validEmails.length} unique users (fetched ${users.length} total)`);

      const htmlBody = messageBody.split('\n').map((line: string) =>
        line.trim() ? `<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 8px;">${line}</p>` : '<br/>'
      ).join('');

      const html = emailTemplate(subject, htmlBody, "Visit ROCKCBT", BRAND.url + "/dashboard");

      let sentCount = 0;
      let failedCount = 0;
      const failedEmails: string[] = [];
      const batchSize = 50;

      for (let i = 0; i < validEmails.length; i += batchSize) {
        const batch = validEmails.slice(i, i + batchSize);
        const promises = batch.map(async (email) => {
          try {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: `ROCKCBT <no-reply@weblines.org>`,
                to: [email],
                subject,
                html,
              }),
            });
            if (res.ok) {
              sentCount++;
            } else {
              const errData = await res.text();
              console.error(`Failed to send to ${email}: ${res.status} ${errData}`);
              failedCount++;
              failedEmails.push(email);
            }
          } catch (err) {
            console.error(`Exception sending to ${email}:`, err);
            failedCount++;
            failedEmails.push(email);
          }
        });
        await Promise.all(promises);
        // Small delay between batches to respect rate limits
        if (i + batchSize < validEmails.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      console.log(`Broadcast complete: ${sentCount} sent, ${failedCount} failed out of ${validEmails.length}`);

      return new Response(JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failedCount,
        total: validEmails.length,
        failedEmails: failedEmails.slice(0, 20), // Return first 20 for debugging
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard template emails
    const { email, name } = payload;
    if (!type || !email) throw new Error("Missing type or email");

    const templateFn = TEMPLATES[type];
    if (!templateFn) throw new Error(`Unknown email type: ${type}`);

    const { subject, html } = templateFn(name || "Student");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `ROCKCBT <no-reply@weblines.org>`, to: [email], subject, html }),
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
