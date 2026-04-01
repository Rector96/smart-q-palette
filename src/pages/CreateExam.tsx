import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import SubscriptionModal from "@/components/SubscriptionModal";

interface Question {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
}

const EXPIRY_OPTIONS = [
  { value: "1", label: "1 hour" },
  { value: "6", label: "6 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
  { value: "168", label: "7 days" },
];

const CreateExam = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Step 1
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [duration, setDuration] = useState(60);
  const [expiryHours, setExpiryHours] = useState("12");

  // Step 2
  const [mode, setMode] = useState<"manual" | "ai" | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [aiUsage, setAiUsage] = useState(0);
  const [isPro, setIsPro] = useState(false);

  const MAX_FREE_AI = 2;

  useEffect(() => {
    if (!user) return;
    const checkUsage = async () => {
      const { data } = await supabase.from("profiles").select("ai_builder_usage, is_subscribed").eq("user_id", user.id).single();
      if (data) {
        setAiUsage(data.ai_builder_usage || 0);
        setIsPro(data.is_subscribed);
      }
    };
    checkUsage();
  }, [user]);

  const addEmptyQuestion = () => {
    setQuestions([...questions, { question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A" }]);
  };

  const updateQuestion = (idx: number, field: keyof Question, value: string) => {
    setQuestions(questions.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const generateAI = async () => {
    if (!aiTopic.trim()) { toast({ title: "Enter a topic", variant: "destructive" }); return; }
    if (!isPro && aiUsage >= MAX_FREE_AI) { setShowSub(true); return; }
    setGenerating(true);
    try {
      const resp = await supabase.functions.invoke("ai-tutor", {
        body: {
          stream: false,
          messages: [{
            role: "user",
            content: `Generate exactly ${aiCount} multiple choice questions about "${aiTopic}" for a JAMB-style exam. Return ONLY a valid JSON array (no markdown, no code blocks) where each object has: question_text, option_a, option_b, option_c, option_d, correct_answer (A/B/C/D). Ensure questions are diverse and well-structured.`
          }]
        }
      });

      if (resp.error) throw new Error(resp.error.message);
      const text = resp.data?.content || (typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data));
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Question[];
        setQuestions(parsed.map(q => ({
          question_text: q.question_text || "",
          option_a: q.option_a || "",
          option_b: q.option_b || "",
          option_c: q.option_c || "",
          option_d: q.option_d || "",
          correct_answer: q.correct_answer || "A",
        })));
        toast({ title: `${parsed.length} questions generated!` });
        // Increment AI usage
        if (user && !isPro) {
          const newUsage = aiUsage + 1;
          setAiUsage(newUsage);
          await supabase.from("profiles").update({ ai_builder_usage: newUsage } as any).eq("user_id", user.id);
        }
      } else {
        throw new Error("Could not parse AI response");
      }
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (questions.length === 0) { toast({ title: "Add at least one question", variant: "destructive" }); return; }
    if (!title.trim()) { toast({ title: "Enter exam title", variant: "destructive" }); return; }

    setSaving(true);
    const shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + Number(expiryHours) * 3600000).toISOString();

    const { error } = await supabase.from("custom_exams").insert({
      creator_id: user.id,
      title: title.trim(),
      instructions: instructions.trim() || null,
      duration_minutes: duration,
      questions: questions as any,
      share_code: shareCode,
      expires_at: expiresAt,
    });

    if (error) {
      toast({ title: "Error saving exam", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const url = `${window.location.origin}/exam/${shareCode}`;
    setShareLink(url);
    toast({ title: "Exam created! 🎉" });
    setSaving(false);
  };

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Share link", description: shareLink });
    }
  };

  // Success view
  if (shareLink) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md w-full text-center space-y-5">
          <div className="h-16 w-16 bg-[hsl(var(--success))]/10 rounded-full flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-[hsl(var(--success))]" />
          </div>
          <h2 className="text-xl font-bold">Exam Created!</h2>
          <p className="text-sm text-muted-foreground">Share this link with your students:</p>
          <Card className="border-border/50">
            <CardContent className="p-3 flex items-center gap-2">
              <Input value={shareLink} readOnly className="text-xs flex-1" />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </CardContent>
          </Card>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Dashboard</Button>
            <Button onClick={() => { setShareLink(null); setStep(1); setQuestions([]); setTitle(""); }}>Create Another</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step === 1 ? navigate("/dashboard") : setStep(1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-bold text-sm">Create Quiz</h1>
          <span className="ml-auto text-xs text-muted-foreground">Step {step}/2</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Exam Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Biology Mid-Term Test" className="h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Instructions (optional)</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Any special instructions for students..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Duration (minutes)</Label>
                <Input type="number" min={5} max={180} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Link Expiry</Label>
                <Select value={expiryHours} onValueChange={setExpiryHours}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full h-11" onClick={() => setStep(2)} disabled={!title.trim()}>
              Continue — Add Questions
            </Button>
          </motion.div>
        )}

        {step === 2 && !mode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-base font-bold">How do you want to add questions?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all" onClick={() => { setMode("manual"); addEmptyQuestion(); }}>
                <CardContent className="p-5 text-center space-y-2">
                  <Plus className="h-8 w-8 mx-auto text-primary" />
                  <p className="font-bold text-sm">Manual Entry</p>
                  <p className="text-xs text-muted-foreground">Type questions and options yourself</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all" onClick={() => setMode("ai")}>
                <CardContent className="p-5 text-center space-y-2">
                  <Sparkles className="h-8 w-8 mx-auto text-primary" />
                  <p className="font-bold text-sm">AI Generate</p>
                  <p className="text-xs text-muted-foreground">Auto-generate from a topic</p>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {step === 2 && mode === "ai" && questions.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Topic</Label>
              <Input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. Cell Biology, Quadratic Equations" className="h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Number of Questions</Label>
              <Input type="number" min={5} max={50} value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))} className="h-10" />
            </div>
            <Button className="w-full h-11 gap-2" onClick={generateAI} disabled={generating}>
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate Questions</>}
            </Button>
          </motion.div>
        )}

        {step === 2 && (mode === "manual" || questions.length > 0) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">{questions.length} Question{questions.length !== 1 ? "s" : ""}</h2>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addEmptyQuestion}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>

            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {questions.map((q, idx) => (
                <Card key={idx} className="border-border/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">Q{idx + 1}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeQuestion(idx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <Textarea value={q.question_text} onChange={(e) => updateQuestion(idx, "question_text", e.target.value)} placeholder="Question text" rows={2} className="text-xs" />
                    <div className="grid grid-cols-2 gap-2">
                      {(["A", "B", "C", "D"] as const).map(l => (
                        <Input key={l} value={q[`option_${l.toLowerCase()}` as keyof Question]} onChange={(e) => updateQuestion(idx, `option_${l.toLowerCase()}` as keyof Question, e.target.value)} placeholder={`Option ${l}`} className="h-8 text-xs" />
                      ))}
                    </div>
                    <Select value={q.correct_answer} onValueChange={(v) => updateQuestion(idx, "correct_answer", v)}>
                      <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Correct" /></SelectTrigger>
                      <SelectContent>
                        {["A", "B", "C", "D"].map(l => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button className="w-full h-11" onClick={handleSubmit} disabled={saving || questions.length === 0}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : `Create Exam — ${questions.length} Questions`}
            </Button>
          </motion.div>
        )}
      </main>
      <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
    </div>
  );
};

export default CreateExam;
