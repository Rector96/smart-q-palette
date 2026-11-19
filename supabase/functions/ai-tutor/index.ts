import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);

  try {
    // Supabase's platform-level verify_jwt check is enabled for this function.
    // The browser must send the signed-in user's access token, never a publishable key as a bearer token.
    const { messages, subject, stream: shouldStream = true } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      return jsonError("Please send a valid conversation (up to 40 messages).", 400);
    }

    const safeMessages = messages.map((message: { role?: string; content?: string }) => {
      if (!["user", "assistant"].includes(message?.role ?? "") || typeof message.content !== "string") {
        throw new Error("Invalid message format.");
      }
      return { role: message.role, content: message.content.slice(0, 12000) };
    });

    const systemPrompt = `You are an expert AI study companion for Nigerian students preparing for secondary-school and entrance examinations.

Your behavior:
- Explain concepts in simple, clear language suitable for secondary school students
- Use examples relevant to Nigerian students
- When explaining mathematics or physics, show step-by-step solutions
- Be encouraging, patient, and supportive
- If the student asks about a specific subject, focus your answers on that subject
- Keep responses concise but thorough
- Use bullet points and numbered steps for clarity
${subject ? `- The student is currently studying: ${String(subject).slice(0, 100)}. Focus your help on this subject.` : ""}

Help students understand concepts and learn; do not claim to be an official examination body.`;

    const groqKey = Deno.env.get("GROQ_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!groqKey && !geminiKey) {
      console.error("Neither GROQ_API_KEY nor GEMINI_API_KEY is configured.");
      return jsonError("AI service is not configured yet. Please try again later.", 503);
    }

    const payload = {
      messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
      stream: Boolean(shouldStream),
      temperature: 0.7,
    };

    const providers = [
      groqKey && {
        name: "Groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile",
      },
      geminiKey && {
        name: "Gemini",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        key: geminiKey,
        model: Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash",
      },
    ].filter(Boolean) as { name: string; url: string; key: string; model: string }[];

    let upstream: Response | null = null;
    let lastStatus = 503;
    for (const provider of providers) {
      try {
        const candidate = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...payload, model: provider.model }),
        });

        if (candidate.ok) {
          upstream = candidate;
          console.info(`AI tutor provider selected: ${provider.name}`);
          break;
        }

        lastStatus = candidate.status;
        const providerError = await candidate.text();
        console.error(`${provider.name} returned ${candidate.status}:`, providerError.slice(0, 1200));
        // Try the fallback for rate limits, provider outages, and other upstream failures.
        if (candidate.status < 500 && candidate.status !== 408 && candidate.status !== 429) {
          continue;
        }
      } catch (error) {
        console.error(`${provider.name} request failed:`, error);
        lastStatus = 503;
      }
    }

    if (!upstream) {
      return jsonError(
        lastStatus === 429
          ? "Both AI services are currently rate-limited. Please try again shortly."
          : "AI service is temporarily unavailable. Please try again shortly.",
        lastStatus === 429 ? 429 : 503,
      );
    }

    if (shouldStream) {
      return new Response(upstream.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await upstream.json();
    return new Response(JSON.stringify({ content: data.choices?.[0]?.message?.content || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-tutor error:", error);
    return jsonError(error instanceof Error ? error.message : "Unable to process this request.", 500);
  }
});
