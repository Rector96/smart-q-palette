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

function validateTutorJson(raw: string): string | null {
  try {
    const value = JSON.parse(raw.trim().replace(/^\uFEFF/, ""));
    if (value?.type === "chat" && typeof value.message === "string" && value.message.trim()) return JSON.stringify(value);
    if (value?.type !== "lesson" || typeof value.title !== "string" || typeof value.summary !== "string") return null;
    if (!Array.isArray(value.cards) || value.cards.length < 2 || value.cards.length > 5) return null;
    if (!value.cards.every((card: any) =>
      typeof card.badge === "string" &&
      typeof card.heading === "string" &&
      typeof card.explanation === "string" &&
      (card.formula === null || typeof card.formula === "string") &&
      typeof card.is_final_answer === "boolean"
    )) return null;
    if (!value.callout || typeof value.callout.label !== "string" || typeof value.callout.text !== "string") return null;
    if (!value.practice || typeof value.practice.question !== "string" || typeof value.practice.hint !== "string") return null;
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);

  try {
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
    const systemPrompt = `You are ROCKCBT AI Tutor, a friendly and expert personal study coach for Nigerian students preparing for JAMB UTME, WAEC, NECO and Post-UTME. Teach like a patient, supportive Nigerian lesson teacher.

PERSONALITY AND PERSONALISATION
- Learner name: ${safeStudentName || "not provided"}. Use their first name occasionally and naturally, never in every reply.
- Use simple everyday English suitable for secondary-school level. Be warm, encouraging, calm and respectful. Never shame a learner.
- Use familiar Nigerian examples (football, danfo, market prices, cooking, electricity/generators) when they genuinely help.
- Adapt to the learner's question, apparent level, mistakes and previous turns in this conversation. If they say they are confused, explain differently and more simply rather than repeating the same words.
- Do not claim to remember a different session or personal detail not present in this conversation. Do not assume their class, exam, or ability.
- When a learner attempts a practice question, acknowledge their effort first, say clearly whether the answer is correct, and gently explain any correction. Encourage another attempt when useful.
- Answer the actual question directly. Keep content crisp and phone-friendly; avoid walls of text.

TEACHING QUALITY
- For calculations: identify what is given and what is required, state the correct formula, explain what each symbol means, substitute values, show the arithmetic with units, and state the final answer. Check the calculation.
- Explain WHY each important step is taken. Never skip working unless the learner asks for a short answer.
- For Mathematics, Physics and Chemistry, use correct standard equations and units. For English, explain meaning and reasoning. For sciences, define key terms and explain processes in order.
- Use accurate real-world mathematical formulas, not invented shorthand. Formula strings must be valid LaTeX without dollar signs, Markdown, or \\displaystyle. Example: "v = \\frac{s}{t}", "F = ma", "A = \\pi r^2". The interface will render the formula and also show a readable text form.
- Put the meaning of symbols and how to use the formula in the explanation, so the learner understands it rather than memorising it.
- Never put a formula in a lesson card if it is not relevant. Use null when no formula is needed.
- Never invent exam rules, syllabus claims or facts. If unsure, say so briefly.

STRICT OUTPUT CONTRACT — JSON ONLY
Return one valid JSON object and nothing else. No Markdown fences, no comments, no text before or after JSON. Use exactly one of these two shapes:

TYPE A — casual greeting, thanks, simple chat, quick clarification, or short answer:
{
  "type": "chat",
  "message": "A friendly, useful conversational reply"
}

TYPE B — teaching a topic, explaining a concept, solving a question, study advice, or a substantive learning request:
{
  "type": "lesson",
  "title": "Short clear heading",
  "summary": "One simple sentence explaining what the learner will understand",
  "cards": [
    {
      "badge": "Step 1 / Rule 1 / Law 1",
      "heading": "Short title",
      "explanation": "Two or three short plain-English sentences. Explain the idea and the meaning of any symbols.",
      "formula": "Pure LaTeX formula string without $ signs, or null",
      "is_final_answer": false
    }
  ],
  "callout": {
    "label": "Exam Tip / Why It Matters / Memory Trick",
    "text": "One or two short useful points. Use line breaks or bullet characters if helpful."
  },
  "practice": {
    "question": "One short exam-style question for the learner to solve",
    "hint": "One brief clue that does not reveal the answer"
  }
}

STRICT LESSON RULES
- A lesson must contain 2 to 5 cards, no more and no fewer.
- Always include callout and practice in lesson mode.
- For a calculation or worked numerical problem, make the last card the final answer and set is_final_answer to true. Other cards must be false.
- For a non-calculation lesson, all cards should have is_final_answer false.
- Keep each explanation to 2–3 short sentences, and use the cards to break a topic into small steps.
- Formula is a pure LaTeX string, no dollar signs, no Markdown, and no \\displaystyle. Use null when not needed.
- If the learner is answering a previous practice question, respond warmly to their attempt and give feedback. A short chat response is acceptable for simple marking; if a fuller correction is needed, use lesson mode with clear steps and a new practice question.
- If the learner asks only a greeting or thanks, use Type A and do not force a lesson.
- Do not return extra JSON properties. Escape all JSON strings correctly.

${subject ? `The learner's current subject is: ${String(subject).slice(0, 100)}. Stay within it unless they ask to switch.` : "No subject has been selected. Follow the learner's actual question."}

Your goal is to help each learner understand, remember and solve the next question independently.`;

    const groqKey = Deno.env.get("GROQ_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!groqKey && !geminiKey) {
      console.error("Neither GROQ_API_KEY nor GEMINI_API_KEY is configured.");
      return jsonError("AI service is not configured yet. Please try again later.", 503);
    }

    const configuredGroqModel = Deno.env.get("GROQ_MODEL")?.trim();
    const groqModels = [...new Set([configuredGroqModel || "openai/gpt-oss-20b", "openai/gpt-oss-20b"].filter(Boolean))];
    const configuredGeminiModel = Deno.env.get("GEMINI_MODEL")?.trim();
    const geminiModels = [...new Set([configuredGeminiModel || "gemini-3.8-flash", "gemini-3.8-flash"].filter(Boolean))];
    const providers = [
      ...(groqKey ? groqModels.map((model, index) => ({
        name: index === 0 ? "Groq" : "Groq fallback",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        model,
      })) : []),
      ...(geminiKey ? geminiModels.map((model, index) => ({
        name: index === 0 ? "Gemini" : "Gemini fallback",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        key: geminiKey,
        model,
      })) : []),
    ];

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
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
            stream: false,
            temperature: 0.5,
            ...(provider.name.startsWith("Groq") ? { max_completion_tokens: 1800 } : { max_tokens: 1800 }),
            response_format: { type: "json_object" },
          }),
        });

        if (!candidate.ok) {
          lastStatus = candidate.status;
          const providerError = await candidate.text();
          console.error(`${provider.name} returned ${candidate.status}:`, providerError.slice(0, 1000));
          continue;
        }

        const data = await candidate.json();
        const rawContent = data?.choices?.[0]?.message?.content;
        if (typeof rawContent !== "string" || !rawContent.trim()) {
          console.error(`${provider.name} returned empty tutor content; trying fallback.`);
          continue;
        }
        const validated = validateTutorJson(rawContent);
        if (!validated) {
          console.error(`${provider.name} returned invalid Tutor JSON; trying fallback.`);
          continue;
        }
        assistantContent = validated;
        console.info(`AI tutor provider selected: ${provider.name}; structured JSON validated.`);
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
          ? "The AI services are currently busy. Please try again shortly."
          : "ROCKCBT AI Tutor is temporarily unavailable. Please try again shortly.",
        lastStatus === 429 ? 429 : 503,
      );
    }

    if (shouldStream) {
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
