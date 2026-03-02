import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! 👋 I'm your AI study companion. I can help you with any JAMB subject — ask me questions, request explanations, or let me quiz you. What would you like to study today?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const checkUsage = async () => {
      const { data } = await supabase.from("profiles").select("ai_tutor_usage, is_subscribed").eq("user_id", user.id).single();
      if (data) {
        setIsPro(data.is_subscribed);
        setUsageCount(data.ai_tutor_usage || 0);
        if (!data.is_subscribed && (data.ai_tutor_usage || 0) >= MAX_FREE_USES) {
          setBlocked(true);
        }
      }
    };
    checkUsage();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    // Check usage limit
    if (!isPro && usageCount >= MAX_FREE_USES) {
      setBlocked(true);
      setShowSub(true);
      return;
    }
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
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
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
      if (!assistantSoFar) {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
      }
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      // Increment usage
      if (user && !isPro) {
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        await supabase.from("profiles").update({ ai_tutor_usage: newCount } as any).eq("user_id", user.id);
        if (newCount >= MAX_FREE_USES) {
          setBlocked(true);
        }
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
      <div className="flex flex-col items-center justify-center h-[calc(100vh-5rem)] lg:h-screen bg-background px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-sm w-full text-center space-y-4">
          <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold">AI Tutor Limit Reached</h2>
          <p className="text-sm text-muted-foreground">You've used your {MAX_FREE_USES} free AI Tutor sessions. Subscribe for just <span className="font-bold text-foreground">₦1,500</span> to get unlimited access!</p>
          <Button className="w-full h-11" onClick={() => setShowSub(true)}>Subscribe Now — ₦1,500</Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </motion.div>
        <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] lg:h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">AI Tutor</p>
            <p className="text-[10px] text-muted-foreground">Your personal JAMB study companion</p>
          </div>
          <span className="text-[10px] text-[hsl(var(--success))] font-semibold">● Online</span>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 max-w-3xl mx-auto w-full" ref={scrollRef}>
        <div className="px-4 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-secondary-foreground rounded-bl-md"}`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>p]:text-sm [&>li]:text-sm">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <User className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2.5">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {messages.length === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {quickPrompts.map((prompt) => (
                <button key={prompt} onClick={() => { setInput(prompt); }} className="text-left p-3 rounded-xl border border-border/50 hover:border-primary/30 transition-colors text-xs text-muted-foreground hover:text-foreground">
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <footer className="border-t border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask me anything about JAMB..." className="h-10 text-sm flex-1" disabled={isLoading} />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </footer>
      <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
    </div>
  );
};

export default AITutor;
