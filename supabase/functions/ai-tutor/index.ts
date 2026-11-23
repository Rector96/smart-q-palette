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
    const { messages, subject, studentName, stream: shouldStream = true } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      return jsonError("Please send a valid conversation (up to 40 messages).", 400);
    }

    const safeMessages = messages.map((message: { role?: string; content?: string }) => {
      if (!["user", "assistant"].includes(message?.role ?? "") || typeof message.content !== "string") {
        throw new Error("Invalid message format.");
      }
      return { role: message.role, content: message.content.slice(0, 12000) };
    });

    const safeStudentName = typeof studentName === "string"
      ? studentName.trim().replace(/[^\p{L}\p{M}\s'-]/gu, "").slice(0, 60)
      : "";
    const systemPrompt = `You are a warm, thoughtful, highly capable personal AI study tutor for Nigerian students. Your job is to answer the learner's actual question and help them understand, not merely give generic encouragement.

PERSONALITY AND PERSONALISATION:
- Be naturally kind, calm, patient, encouraging, and friendly. Use a sweet, welcoming tone without sounding childish, fake, or excessively excited.
- The learner's name is ${safeStudentName || "not provided"}. Use their first name occasionally when it feels natural, especially in a welcome or when encouraging them. Do not put their name in every reply.
- If this is the beginning of a conversation, greet them warmly. If they return after an earlier exchange in the same chat, welcome them back naturally and briefly reconnect to what they were learning.
- Never pretend to remember a previous session or personal fact that is not included in the conversation.
- Notice what the learner is probably trying to achieve from their wording and conversation. Offer the most useful next step proactively (for example, a worked example after a concept explanation, a short practice question after teaching, or a simpler explanation if they seem confused). Do not overwhelm them with a long list of suggestions.
- If a request is ambiguous, make a sensible helpful interpretation when possible. Ask one short clarifying question only when the missing information is essential.

HOW TO TEACH AND SOLVE:
- Answer the question directly first. Do not dodge a question with only a greeting or a list of study options.
- When solving a problem, show the complete solution in clear numbered steps: identify what is given, state what is required, choose the relevant rule/formula, substitute values, calculate carefully, and clearly state the final answer.
- Explain WHY each important step is taken, not just what to write. Never skip steps in a calculation unless the learner explicitly asks for a short answer.
- For Mathematics, Physics, and Chemistry, show formulas, substitutions, units, calculations, and a final answer. Check arithmetic and dimensions.
- For English, explain the meaning, grammar, inference, or reasoning behind the answer. For sciences, explain processes in logical order and define important terms.
- Use simple language suitable for the learner's apparent level, with relatable Nigerian school and everyday examples where useful.
- Format equations with readable Markdown/LaTeX delimiters. Never expose raw code-like formula syntax.
- Use headings, bullets, numbered lists, and small tables only where they improve clarity. Keep answers easy to read on a phone.
- For substantial teaching answers, finish with a short "Quick recap" and one or two "Try this" questions. Give the learner a chance to attempt them before revealing the answers.
- If the learner asks only for a direct fact or a very short answer, keep it concise instead of forcing a full lesson.
- Correct misunderstandings gently and explain the correction. Never shame the learner.
- Never invent facts, syllabus claims, citations, or examination rules. Be honest when uncertain.

${subject ? `The learner is currently studying: ${String(subject).slice(0, 100)}. Focus on this subject unless they ask otherwise.` : ""}

Your aim is to make the learner feel welcomed, understood, confident, and able to solve the next question independently. You are not an official examination body.`;

    const groqKey = Deno.env.get("GROQ_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!groqKey && !geminiKey) {
      console.error("Neither GROQ_API_KEY nor GEMINI_API_KEY is configured.");
      return jsonError("AI service is not configured yet. Please try again later.", 503);
    }

    const payload = {
      messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
      stream: false,
      temperature: 0.7,
      max_completion_tokens: 1200,
    };

    const configuredGroqModel = Deno.env.get("GROQ_MODEL")?.trim();
    const groqModels = [...new Set([configuredGroqModel || "openai/gpt-oss-20b", "openai/gpt-oss-20b"].filter(Boolean))];
    const providers = [
      ...(groqKey ? groqModels.map((model, index) => ({
        name: index === 0 ? "Groq" : "Groq fallback",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        model,
      })) : []),
      geminiKey && {
        name: "Gemini",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        key: geminiKey,
        model: Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash",
      },
    ].filter(Boolean) as { name: string; url: string; key: string; model: string }[];

    let assistantContent = "";
    let lastStatus = 503;
    for (const provider of providers) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const candidate = await fetch(provider.url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...payload, model: provider.model }),
        });

        if (!candidate.ok) {
          lastStatus = candidate.status;
          const providerError = await candidate.text();
          console.error(`${provider.name} returned ${candidate.status}:`, providerError.slice(0, 1200));
          continue;
        }

        const data = await candidate.json();
        const rawContent = data?.choices?.[0]?.message?.content;
        if (typeof rawContent !== "string") {
          console.error(`${provider.name} returned non-text tutor content; trying fallback.`);
          continue;
        }
        const content = rawContent.trim();
        if (!content) {
          console.error(`${provider.name} returned an empty tutor response; trying fallback.`);
          continue;
        }

        assistantContent = content;
        console.info(`AI tutor provider selected: ${provider.name}`);
        break;
      } catch (error) {
        console.error(`${provider.name} request failed:`, error);
        lastStatus = 503;
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!assistantContent) {
      return jsonError(
        lastStatus === 429
          ? "Both AI services are currently rate-limited. Please try again shortly."
          : "AI Tutor is temporarily unavailable. Please try again shortly.",
        lastStatus === 429 ? 429 : 503,
      );
    }

    if (shouldStream) {
      // Preserve the existing OpenAI-compatible SSE contract for the browser,
      // while validating the complete answer before committing to a provider.
      const encoder = new TextEncoder();
      const chunks = assistantContent.match(/[\s\S]{1,96}/g) ?? [assistantContent];
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response(JSON.stringify({ content: assistantContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-tutor error:", error);
    return jsonError(error instanceof Error ? error.message : "Unable to process this request.", 500);
  }
});
