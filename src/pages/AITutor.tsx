import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User, Loader2, Sparkles, Lock, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import SubscriptionModal from "@/components/SubscriptionModal";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;
const MAX_FREE_USES = 2;

const AITutor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const studentName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "").trim();
  const firstName = studentName.split(/\\s+/)[0] || "there";
  const isReturningLearner = user?.created_at
    ? Date.now() - new Date(user.created_at).getTime() > 60_000
    : false;
  const welcomeMessage = isReturningLearner
    ? `Welcome back, ${firstName}! 😊 It's lovely to have you here. What would you like us to work through today? I can explain a topic, solve a question step by step, or give you a little practice.`
    : `Hello ${firstName}! 👋 I'm happy to be your study companion. Ask me anything you're learning, and we'll work through it together, one clear step at a time.`;
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: welcomeMessage },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [showTutorWelcome, setShowTutorWelcome] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    setShowTutorWelcome(window.localStorage.getItem("rockcbt-tutor-welcomed-" + user.id) !== "true");
    setMessages([{ role: "assistant", content: welcomeMessage }]);
  }, [user?.id]);

  const proceedToTutor = () => {
    if (user?.id) window.localStorage.setItem("rockcbt-tutor-welcomed-" + user.id, "true");
    setShowTutorWelcome(false);
  };

  useEffect(() => {
    if (!user) return;
    const checkUsage = async () => {
      const { data } = await supabase.from("profiles").select("ai_tutor_usage, is_subscribed").eq("user_id", user.id).single();
      if (data) {
        setIsPro(data.is_subscribed);
        setUsageCount(data.ai_tutor_usage || 0);
        if (!data.is_subscribed && (data.ai_tutor_usage || 0) >= MAX_FREE_USES) setBlocked(true);
      }
    };
    checkUsage();
  }, [user]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: isLoading ? "auto" : "smooth" });
  }, [messages, isLoading]);

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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ studentName, messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
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
        while ((newlineIndex = textBuffer.indexOf("\\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamFinished = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && prev.length > newMessages.length) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            // Keep incomplete SSE chunks until the next network read.
          }
        }
      }
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
      if (!assistantSoFar) setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      if (user && !isPro) {
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        await supabase.from("profiles").update({ ai_tutor_usage: newCount } as any).eq("user_id", user.id);
        if (newCount >= MAX_FREE_USES) setBlocked(true);
      }
    }
  };

  const quickPrompts = [
    "Explain quadratic equations step by step",
    "Help me with English comprehension tips",
    "What are Newton's laws of motion?",
    "Quiz me on Biology",
  ];

  if (blocked) {
    return (
      <div className="flex min-h-[calc(100dvh-5.25rem)] flex-col items-center justify-center bg-background px-4 py-8 lg:min-h-[100dvh]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-sm w-full text-center space-y-4">
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto"><Lock className="h-8 w-8 text-primary" /></div>
          <h2 className="text-lg font-bold">AI Tutor Limit Reached</h2>
          <p className="text-sm text-muted-foreground">You've used your {MAX_FREE_USES} free AI Tutor sessions. Subscribe for just <span className="font-bold text-foreground">₦2,500</span> to get unlimited access!</p>
          <Button className="w-full h-11" onClick={() => setShowSub(true)}>Subscribe Now — ₦2,500</Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </motion.div>
        <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
      </div>
    );
  }

  if (showTutorWelcome) {
    return (
      <div className="relative flex min-h-[calc(100dvh-5.25rem-env(safe-area-inset-bottom,0px))] items-center justify-center overflow-y-auto bg-gradient-to-br from-[#f8f5ff] via-background to-[#eef6ff] px-4 py-6 sm:py-8 lg:min-h-[100dvh]">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />
        <motion.section initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45 }} className="relative my-auto w-full max-w-lg rounded-[2rem] border border-white/70 bg-card/90 p-5 text-center shadow-[0_24px_80px_rgba(70,40,130,0.13)] backdrop-blur-xl sm:p-9">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/25 sm:h-20 sm:w-20"><Sparkles className="h-8 w-8 sm:h-9 sm:w-9" /></div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Your learning companion</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Welcome {firstName === "there" ? "" : firstName}!</h1>
          <p className="mt-4 text-base font-semibold leading-relaxed text-foreground">Hello! I am ROCKCBT AI, and I am here to help you learn, solve problems, and understand things with confidence.</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">No question is too small. Whether you need help with Mathematics, English, Science, or any topic at all, we will take it one step at a time. I will explain patiently, work through examples with you, and help you get better every day.</p>
          <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-3">
            {[{ title: "Learn clearly", detail: "Simple explanations" }, { title: "Solve together", detail: "Step-by-step help" }, { title: "Grow in confidence", detail: "Practice without fear" }].map((item) => <div key={item.title} className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"><p className="text-xs font-bold text-foreground">{item.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p></div>)}
          </div>
          <Button onClick={proceedToTutor} className="mt-7 h-12 w-full rounded-full text-sm font-bold shadow-lg shadow-primary/20">Proceed to Tutor <Send className="ml-2 h-4 w-4" /></Button>
          <p className="mt-3 text-[11px] text-muted-foreground">I am glad you are here. Let us make learning easier together. 💜</p>
        </motion.section>
      </div>
    );
  }

  return (
    <section className="flex h-[calc(100dvh-5.25rem-env(safe-area-inset-bottom,0px))] min-h-0 flex-col overflow-hidden bg-background lg:h-dvh">
      <header className="z-10 shrink-0 border-b border-border/80 bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-3 py-3 sm:px-5 sm:py-4 safe-area-top">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 shadow-md shadow-primary/15"><Sparkles className="h-5 w-5 text-primary-foreground" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold sm:text-base">ROCKCBT AI Tutor</p>
            <p className="truncate text-[11px] text-muted-foreground sm:text-xs">Your friendly, personal study companion</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 sm:text-xs"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ready to help</span>
        </div>
      </header>

      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Tutor conversation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
        <div className="mx-auto w-full max-w-4xl space-y-5 px-3 py-5 sm:space-y-6 sm:px-5 sm:py-7">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex min-w-0 gap-2.5 sm:gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-9 sm:w-9"><Bot className="h-4 w-4 sm:h-[18px] sm:w-[18px]" /></div>}
              <div className={`min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl px-3.5 py-3 text-[14px] leading-7 shadow-sm sm:max-w-[82%] sm:px-5 sm:py-4 sm:text-[15px] ${msg.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/70 bg-card text-card-foreground"}`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none break-words dark:prose-invert sm:prose-base [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_code]:break-words [&_li]:my-1 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
              </div>
              {msg.role === "user" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground sm:h-9 sm:w-9"><User className="h-4 w-4" /></div>}
            </motion.div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-9 sm:w-9"><Bot className="h-4 w-4" /></div>
              <div className="rounded-2xl rounded-bl-md border border-border/70 bg-card px-4 py-3 shadow-sm"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> ROCKCBT AI is thinking…</span></div>
            </div>
          )}

          {messages.length === 1 && !isLoading && (
            <div className="ml-10 space-y-3 sm:ml-12">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><GraduationCap className="h-4 w-4 text-primary" /> Try asking me</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => sendMessage(prompt)} className="min-h-12 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left text-xs leading-relaxed text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99] sm:text-sm">{prompt}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="z-10 shrink-0 border-t border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-4xl px-3 pb-3 pt-3 sm:px-5 sm:pb-4 safe-area-bottom">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Message ROCKCBT AI…"
              aria-label="Write your message to ROCKCBT AI"
              rows={1}
              className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0"
              disabled={isLoading}
            />
            <Button type="submit" size="icon" aria-label="Send message" className="mb-0.5 h-10 w-10 shrink-0 rounded-xl shadow-sm" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground sm:text-[11px]">Press Enter to send · Shift + Enter for a new line · Check important answers with your teacher.</p>
        </div>
      </footer>
      <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
    </section>
  );
};

export default AITutor;
