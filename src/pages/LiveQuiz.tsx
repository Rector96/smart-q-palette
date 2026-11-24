import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Users, Plus, LogIn, Loader2, Copy, Share2, Crown, CheckCircle2, CreditCard, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { SUBJECTS } from "@/lib/subjects";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import "./LiveQuiz.css";

interface LiveQuestionDraft {
  question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; option_e?: string; correct_answer: string;
  explanation?: string; exam_hint?: string;
}
import DesktopHeader from "@/components/DesktopHeader";

async function getFunctionErrorMessage(error: any, fallback: string): Promise<string> {
  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    } catch {
      // Fall back to the SDK error when the response body is unavailable.
    }
  }
  return error?.message || fallback;
}

const LiveQuiz = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [view, setView] = useState<"menu" | "create" | "join">("menu");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ is_subscribed: boolean; free_live_quiz_used: number; full_name: string | null }>({ is_subscribed: false, free_live_quiz_used: 0, full_name: null });
  const [showPaywall, setShowPaywall] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<string[] | null>(null);
  const [questionSource, setQuestionSource] = useState<"bank" | "ai">("bank");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [generatedQuestions, setGeneratedQuestions] = useState<LiveQuestionDraft[]>([]);
  const [generating, setGenerating] = useState(false);

  // Create form
  const [subject, setSubject] = useState("");
  const [numQuestions, setNumQuestions] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [gameMode, setGameMode] = useState<"group" | "duel">("group");

  // Join form
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("is_subscribed, free_live_quiz_used, full_name").eq("user_id", user.id).single();
      if (data) setProfile(data as any);
    };
    fetch();
    const fetchAvailableSubjects = async () => {
      const { data, error } = await supabase.functions.invoke("live-quiz", { body: { action: "subjects" } });
      if (error) {
        console.error("Unable to load Live Quiz subjects:", await getFunctionErrorMessage(error, "Subject list unavailable."));
        return;
      }
      if (Array.isArray(data?.subjects)) setAvailableSubjects(data.subjects);
    };
    fetchAvailableSubjects();
  }, [user]);

  const checkAccess = (): boolean => {
    if (profile.is_subscribed) return true;
    if ((profile.free_live_quiz_used || 0) < 2) return true;
    setShowPaywall(true);
    return false;
  };

  const handleGenerate = async () => {
    if (!subject || !topic.trim()) {
      toast({ title: "Choose a subject and enter a topic.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(numQuestions) || numQuestions < 5 || numQuestions > 50) {
      toast({ title: "Choose between 5 and 50 questions.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: { action: "generate", subject, topic: topic.trim(), num_questions: numQuestions, difficulty },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "AI question generation failed."));
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.questions) || data.questions.length < 1) throw new Error("The AI did not return usable questions. Please try again.");
      setGeneratedQuestions(data.questions);
      toast({ title: `${data.questions.length} questions generated`, description: "Review and edit them before creating your room." });
    } catch (err: any) {
      toast({ title: "Question generation failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const updateGeneratedQuestion = (index: number, field: keyof LiveQuestionDraft, value: string) => {
    setGeneratedQuestions(current => current.map((q, i) => i === index ? { ...q, [field]: value } : q));
  };

  const handleCreate = async () => {
    if (!user || !subject) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: {
          action: "create",
          subject,
          num_questions: numQuestions,
          time_per_question: timePerQuestion,
          game_mode: gameMode,
          questions: questionSource === "ai" ? generatedQuestions : undefined,
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "We could not create the quiz room. Please try again."));
      if (data?.error) {
        if (String(data.error).toLowerCase().includes("free live quiz")) setShowPaywall(true);
        throw new Error(data.error);
      }
      const roomCode = data?.room?.room_code;
      if (!roomCode) throw new Error("The room was created but no room code was returned.");
      navigate(`/quiz-room/${roomCode}`);
    } catch (err: any) {
      toast({ title: "Error creating room", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !roomCode.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: { action: "join", room_code: roomCode.trim().toUpperCase() },
      });
      if (error) throw error;
      if (data?.error) {
        if (String(data.error).toLowerCase().includes("free live quiz")) setShowPaywall(true);
        throw new Error(data.error);
      }
      const joinedCode = data?.room?.room_code || roomCode.trim().toUpperCase();
      navigate(`/quiz-room/${joinedCode}`);
    } catch (err: any) {
      toast({ title: "Error joining room", description: err.message || "Please check the code and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const paywallBenefits = [
    "Unlimited live quiz sessions",
    "Unlimited practice exams",
    "AI Tutor & detailed analytics",
  ];

  return (
    <div className="min-h-screen bg-background">
      <DesktopHeader profileName={profile.full_name} isPro={profile.is_subscribed} />
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10 lg:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => view === "menu" ? navigate("/dashboard") : setView("menu")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-bold text-sm">Live Quiz</h1>
        </div>
      </header>

      <main className="w-full max-w-6xl mx-auto px-3 pb-28 pt-5 sm:px-5 sm:py-8 md:px-6 space-y-5">
        {view === "menu" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-2xl space-y-4">
            <div className="text-center space-y-3 mb-6 px-2">
              <div className="h-16 w-16 bg-gradient-to-br from-primary/15 to-primary/5 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Play with friends</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">Challenge your friends, join a room and see who knows the most.</p>
            </div>

            <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-2xl active:scale-[0.99]" onClick={() => setView("create")}>
              <CardContent className="p-5 flex items-center gap-4 min-h-[104px]">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base">Create a quiz</p>
                  <p className="text-sm text-muted-foreground">Choose a subject and invite your friends to play.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-2xl active:scale-[0.99]" onClick={() => setView("join")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <LogIn className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base">Join with a code</p>
                  <p className="text-sm text-muted-foreground">Got an invite? Enter the quiz code to join.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {view === "create" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="live-quiz-create">
            <div className="live-quiz-create-heading">
              <h2 className="text-xl font-extrabold">Set up your quiz</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose your format, build your questions, and create a room.</p>
            </div>
            <section className="live-quiz-setup space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Battle type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={gameMode === "duel" ? "default" : "outline"} className="h-auto min-h-16 flex-col gap-1 rounded-xl" onClick={() => setGameMode("duel")}>
                    <span className="text-sm font-bold">1-vs-1 Battle</span><span className="text-[10px] opacity-80">Challenge one friend</span>
                  </Button>
                  <Button type="button" variant={gameMode === "group" ? "default" : "outline"} className="h-auto min-h-16 flex-col gap-1 rounded-xl" onClick={() => setGameMode("group")}>
                    <span className="text-sm font-bold">Group Quiz</span><span className="text-[10px] opacity-80">Compete with a group</span>
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Subject</Label>
                <Select value={subject} onValueChange={v => { setSubject(v); setGeneratedQuestions([]); }}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.filter(s => questionSource === "ai" || availableSubjects === null || availableSubjects.some(name => name.trim().toLowerCase() === s.name.trim().toLowerCase() || name.trim().toLowerCase() === s.id.replace(/_/g, " ").toLowerCase())).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {questionSource === "bank" && availableSubjects !== null && availableSubjects.length === 0 && <p className="text-xs text-destructive">No subjects currently have published questions for Live Quiz.</p>}
                {questionSource === "bank" && availableSubjects !== null && availableSubjects.length > 0 && <p className="text-xs text-muted-foreground">Only subjects with published questions are shown.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Question source</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={questionSource === "bank" ? "default" : "outline"} className="rounded-xl" onClick={() => { setQuestionSource("bank"); setGeneratedQuestions([]); }}>Question bank</Button>
                  <Button type="button" variant={questionSource === "ai" ? "default" : "outline"} className="rounded-xl" onClick={() => { setQuestionSource("ai"); setGeneratedQuestions([]); }}>Generate with AI</Button>
                </div>
              </div>
              {questionSource === "ai" && <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="space-y-2"><Label className="text-sm font-semibold">Topic</Label><Input value={topic} onChange={e => { setTopic(e.target.value); setGeneratedQuestions([]); }} placeholder="e.g. Photosynthesis, Cell structure" className="h-11 rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label className="text-sm font-semibold">Difficulty</Label><Select value={difficulty} onValueChange={(v: any) => { setDifficulty(v); setGeneratedQuestions([]); }}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-sm font-semibold">Questions</Label><Input type="number" min={5} max={50} value={numQuestions} onChange={e => { setNumQuestions(Number(e.target.value)); setGeneratedQuestions([]); }} className="h-11 rounded-xl" /></div>
                </div>
                <Button type="button" variant="outline" className="w-full rounded-xl" onClick={handleGenerate} disabled={generating || !subject || !topic.trim()}>{generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating questions...</> : "Generate questions"}</Button>
              </div>}
            </section>
            <section className="live-quiz-preview-column space-y-4">
              {questionSource === "ai" && generatedQuestions.length > 0 ? <div className="live-quiz-preview rounded-2xl border bg-card p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="text-base font-bold">Question preview</h3><p className="text-xs text-muted-foreground">{generatedQuestions.length} generated · review and edit before creating</p></div>
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={handleGenerate} disabled={generating}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Regenerate</Button>
                </div>
                <div className="live-quiz-preview-list space-y-3">
                  {generatedQuestions.map((q, i) => <Card key={i} className="rounded-xl border-border/60"><CardContent className="space-y-2 p-3 sm:p-4"><p className="text-xs font-bold text-muted-foreground">QUESTION {i + 1} OF {generatedQuestions.length}</p><Textarea value={q.question_text} onChange={e => updateGeneratedQuestion(i, "question_text", e.target.value)} rows={2} className="min-h-20 resize-y text-sm" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{(["A", "B", "C", "D", "E"] as const).map(letter => <div key={letter} className="flex min-w-0 items-center gap-2"><span className="w-5 shrink-0 text-xs font-bold">{letter}</span><Input value={q[`option_${letter.toLowerCase()}` as keyof LiveQuestionDraft]} onChange={e => updateGeneratedQuestion(i, `option_${letter.toLowerCase()}` as keyof LiveQuestionDraft, e.target.value)} className="h-9 min-w-0 text-xs" /></div>)}</div>
                    <Select value={q.correct_answer} onValueChange={v => updateGeneratedQuestion(i, "correct_answer", v)}><SelectTrigger className="h-9 w-full sm:max-w-xs"><SelectValue placeholder="Correct answer" /></SelectTrigger><SelectContent>{["A", "B", "C", "D", "E"].map(v => <SelectItem key={v} value={v}>Correct answer: {v}</SelectItem>)}</SelectContent></Select>
                    <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3 sm:grid-cols-2">
                      <div className="space-y-2"><p className="text-xs font-semibold text-primary">Study explanation</p><Textarea value={q.explanation || ""} onChange={e => updateGeneratedQuestion(i, "explanation", e.target.value)} rows={3} placeholder="Why is this answer correct?" className="min-h-20 resize-y bg-background text-sm" /></div>
                      <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">Revision tip</p><Textarea value={q.exam_hint || ""} onChange={e => updateGeneratedQuestion(i, "exam_hint", e.target.value)} rows={3} placeholder="A short tip to help remember this concept" className="min-h-20 resize-y bg-background text-sm" /></div>
                    </div>
                  </CardContent></Card>)}
                </div>
              </div> : <div className="live-quiz-preview-empty flex min-h-40 flex-col justify-center rounded-2xl border border-dashed bg-card p-5 text-center sm:min-h-52">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
                <h3 className="font-bold">{questionSource === "ai" ? "Your questions will appear here" : "Ready to create your room?"}</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{questionSource === "ai" ? "Choose a subject and topic, then generate questions to review and edit them here." : "Choose the subject and question count. Your room will be ready to share as soon as you create it."}</p>
              </div>}
              <div className="live-quiz-create-actions space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
                <div className={questionSource === "ai" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-2 gap-3"}>
                  {questionSource === "bank" && <div className="space-y-2">
                    <Label className="text-sm font-semibold">Questions</Label>
                    <Input type="number" min={5} max={50} value={numQuestions} onChange={e => setNumQuestions(Number(e.target.value))} className="h-11 rounded-xl" />
                  </div>}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Time/Question (s)</Label>
                    <Input type="number" min={10} max={120} value={timePerQuestion} onChange={e => setTimePerQuestion(Number(e.target.value))} className="h-11 rounded-xl" />
                  </div>
                  {questionSource === "ai" && <div className="flex items-end rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{generatedQuestions.length || numQuestions} questions · {timePerQuestion}s each</div>}
                </div>
                <Button className="h-12 w-full rounded-xl text-base font-semibold" onClick={handleCreate} disabled={loading || !subject || (questionSource === "ai" && (generatedQuestions.length !== numQuestions || generatedQuestions.some(q => !q.question_text.trim() || !q.option_a.trim() || !q.option_b.trim() || !q.option_c.trim() || !q.option_d.trim() || (q.correct_answer === "E" && !q.option_e?.trim()))))}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : gameMode === "duel" ? "Create 1-vs-1 Challenge" : "Create Group Room"}
                </Button>
              </div>
            </section>
          </motion.div>
        )}

        {view === "join" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-2xl space-y-4">
            <h2 className="text-xl font-extrabold">Join a quiz</h2>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Room Code</Label>
              <Input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="Enter room code" className="h-14 rounded-xl text-center text-2xl tracking-[0.3em] font-bold" maxLength={6} />
            </div>
            <Button className="w-full h-12 rounded-xl text-base font-semibold" onClick={handleJoin} disabled={loading || !roomCode.trim()}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Joining...</> : "Join Room"}
            </Button>
          </motion.div>
        )}
      </main>

      {/* Paywall Modal */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
          <div className="h-20 bg-gradient-to-r from-primary via-[hsl(262,83%,58%)] to-primary relative overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <Crown className="h-7 w-7 text-primary-foreground mx-auto mb-1" />
              <p className="text-primary-foreground font-bold text-sm">Free Sessions Used</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-muted-foreground text-center text-sm">You have used your 2 free live quiz sessions. Subscribe for unlimited access!</p>
            <div className="space-y-2">
              {paywallBenefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                  <span className="text-sm">{b}</span>
                </div>
              ))}
            </div>
            <Button className="w-full h-11" onClick={() => { setShowPaywall(false); navigate("/dashboard?payment=subscribe"); }}>
              <CreditCard className="h-4 w-4 mr-2" /> Subscribe Now — ₦2,500
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setShowPaywall(false)}>Maybe Later</Button>
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" /> Secure payment via Paystack
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveQuiz;
