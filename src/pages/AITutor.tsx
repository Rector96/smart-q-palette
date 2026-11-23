import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User, Loader2, Sparkles, Lock, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import SubscriptionModal from "@/components/SubscriptionModal";
import { TutorMessage, type TutorStructured } from "@/components/tutor/TutorMessage";

type Message = { role: "user" | "assistant"; content: string; structured?: TutorStructured };
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;
const MAX_FREE_USES = 2;

function parseTutorResponse(raw: string): TutorStructured {
  const cleaned = raw.trim().replace(/^\uFEFF/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  if (parsed?.type === "chat" && typeof parsed.message === "string") {
    return { type: "chat", message: parsed.message };
  }
  if (parsed?.type === "lesson" && typeof parsed.title === "string" && typeof parsed.summary === "string"
    && Array.isArray(parsed.cards) && parsed.cards.length >= 2 && parsed.cards.length <= 5
    && parsed.cards.every((card: any) => typeof card.heading === "string" && typeof card.explanation === "string")
    && parsed.callout && typeof parsed.callout.text === "string"
    && parsed.practice && typeof parsed.practice.question === "string" && typeof parsed.practice.hint === "string") {
    return {
      type: "lesson",
      title: parsed.title,
      summary: parsed.summary,
      cards: parsed.cards.map((card: any) => ({
        badge: String(card.badge || ""),
        heading: String(card.heading),
        explanation: String(card.explanation),
        formula: typeof card.formula === "string" ? card.formula : null,
        is_final_answer: Boolean(card.is_final_answer),
      })),
      callout: { label: String(parsed.callout.label || "Exam tip"), text: parsed.callout.text },
      practice: { question: parsed.practice.question, hint: parsed.practice.hint },
    };
  }
  throw new Error("The tutor returned an incomplete lesson. Please try asking once more.");
}

const AITutor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const studentName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "").trim();
  const firstName = studentName.split(/\s+/)[0] || "there";
  const welcomeMessage = `Hello ${firstName}! 👋 I'm your ROCKCBT study coach. Tell me what you're learning or send me a question. I'll explain it clearly, then we'll practise together.`;
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: welcomeMessage, structured: { type: "chat", message: welcomeMessage } }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages([{ role: "assistant", content: welcomeMessage, structured: { type: "chat", message: welcomeMessage } }]);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const checkUsage = async () => {
      const { data } = await supabase.from("profiles").select("ai_tutor_usage, is_subscribed").eq("user_id", user.id).single();
      if (!active || !data) return;
      setIsPro(Boolean(data.is_subscribed));
      setUsageCount(data.ai_tutor_usage || 0);
      setBlocked(!data.is_subscribed && (data.ai_tutor_usage || 0) >= MAX_FREE_USES);
    };
    void checkUsage();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: isLoading ? "auto" : "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [input]);

  const sendMessage = async (messageText = input) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) return;
    if (!isPro && usageCount >= MAX_FREE_USES) {
      setBlocked(true);
      setShowSub(true);
      return;
    }
    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    let assistantSoFar = "";
    let responseSucceeded = false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE;
      if (!publishableKey) throw new Error("The app connection is not configured. Please contact support.");

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: publishableKey,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          studentName,
          structured: true,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamFinished = false;
      while (!streamFinished) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamFinished = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (typeof chunk === "string") assistantSoFar += chunk;
          } catch {
            // Ignore incomplete or malformed SSE frames; the final JSON is validated below.
          }
        }
      }
      if (!assistantSoFar.trim()) throw new Error("The AI service returned an empty response. Please try again.");
      const structured = parseTutorResponse(assistantSoFar);
      setMessages(prev => [...prev, { role: "assistant", content: assistantSoFar, structured }]);
      responseSucceeded = true;
    } catch (e: any) {
      toast({ title: "AI Tutor couldn't finish", description: e?.message || "Please try again.", variant: "destructive" });
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I couldn't complete that explanation just now. Your question is still here — please tap send again and I'll try once more.",
        structured: { type: "chat", message: "I couldn't complete that explanation just now. Your question is still here — please tap send again and I'll try once more." },
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      if (user && !isPro && responseSucceeded) {
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        const { error } = await supabase.from("profiles").update({ ai_tutor_usage: newCount } as any).eq("user_id", user.id);
        if (error) console.error("Could not update AI Tutor usage:", error.message);
        if (newCount >= MAX_FREE_USES) setBlocked(true);
      }
    }
  };

  const quickPrompts = [
    "Explain quadratic equations step by step",
    "Help me understand English comprehension",
    "Teach me Newton's laws with examples",
    "Quiz me on Biology",
  ];

  if (blocked) {
    return (
      <div className="flex min-h-[calc(100dvh-5.25rem)] flex-col items-center justify-center bg-background px-4 py-8 lg:min-h-[100dvh]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-sm w-full space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"><Lock className="h-8 w-8 text-primary" /></div>
          <h2 className="text-lg font-bold">AI Tutor Limit Reached</h2>
          <p className="text-sm text-muted-foreground">You've used your {MAX_FREE_USES} free AI Tutor sessions. Subscribe for just <span className="font-bold text-foreground">₦2,500</span> to get unlimited access!</p>
          <Button className="h-11 w-full" onClick={() => setShowSub(true)}>Subscribe Now — ₦2,500</Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </motion.div>
        <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
      </div>
    );
  }

  return (
    <section className="flex h-[calc(100dvh_-_5.25rem_-_env(safe-area-inset-bottom,0px))] min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background lg:h-dvh">
      <header className="z-10 shrink-0 bg-gradient-to-br from-[#1E40AF] via-[#1D4ED8] to-[#2563EB] text-white shadow-md shadow-blue-950/10">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4 safe-area-top">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-md"><Sparkles className="h-5 w-5 text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white sm:text-base">ROCKCBT AI Tutor</p>
            <p className="truncate text-[11px] text-blue-100 sm:text-xs">Your personal Nigerian exam study coach</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-white sm:text-xs"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Ready to learn</span>
        </div>
      </header>

      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Tutor conversation" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-4xl space-y-5 px-3 py-5 sm:space-y-6 sm:px-5 sm:py-7">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex w-full min-w-0 gap-2 sm:gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-9 sm:w-9"><Bot className="h-4 w-4 sm:h-[18px] sm:w-[18px]" /></div>}
              <div className={`min-w-0 max-w-[calc(100%-2.5rem)] rounded-2xl px-3.5 py-3 text-[14px] leading-7 shadow-sm [overflow-wrap:anywhere] sm:max-w-[88%] sm:px-5 sm:py-4 sm:text-[15px] ${msg.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/70 bg-card text-card-foreground"}`}>
                {msg.role === "assistant"
                  ? msg.structured
                    ? <TutorMessage response={msg.structured} onPracticeAnswer={(answer) => sendMessage(`My answer to the practice question is: ${answer}. Please check my answer, explain gently if I made a mistake, and help me try again if needed.`)} />
                    : <p>{msg.content}</p>
                  : <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
              </div>
              {msg.role === "user" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground sm:h-9 sm:w-9"><User className="h-4 w-4" /></div>}
            </motion.div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-9 sm:w-9"><Bot className="h-4 w-4" /></div>
              <div className="rounded-2xl rounded-bl-md border border-border/70 bg-card px-4 py-3 shadow-sm"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> ROCKCBT is preparing your explanation…</span></div>
            </div>
          )}

          {messages.length === 1 && !isLoading && (
            <div className="ml-10 space-y-3 sm:ml-12">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><GraduationCap className="h-4 w-4 text-primary" /> Start with one of these</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {quickPrompts.map(prompt => <button key={prompt} type="button" onClick={() => sendMessage(prompt)} className="min-h-12 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left text-xs leading-relaxed text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99] sm:text-sm">{prompt}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="z-10 shrink-0 border-t border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-4xl px-3 pb-2 pt-3 sm:px-5 sm:pb-3 safe-area-bottom">
          <form onSubmit={e => { e.preventDefault(); void sendMessage(); }} className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
            <Textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendMessage(); } }} placeholder="Ask a question or paste an exam question…" aria-label="Write your message to ROCKCBT AI" rows={1} className="max-h-32 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0" disabled={isLoading} />
            <Button type="submit" size="icon" aria-label="Send message" className="mb-0.5 h-10 w-10 shrink-0 rounded-xl shadow-sm" disabled={isLoading || !input.trim()}>{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </form>
          <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground sm:text-[11px]">Enter to send · Shift + Enter for a new line · Learn at your own pace.</p>
        </div>
      </footer>
      <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
    </section>
  );
};
export default AITutor;
