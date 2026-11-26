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

import "./LiveQuiz.css";

import DesktopHeader from "@/components/DesktopHeader";

type LiveQuizQuestionInput = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e?: string;
  correct_answer: string;
  explanation?: string;
  exam_hint?: string;
};

async function getFunctionErrorMessage(
  error: { message: string; context?: Response },
  fallback: string,
): Promise<string> {
  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    } catch {
      // Fall back to the SDK error when the response body is unavailable.
    }
  }
  return error.message || fallback;
}

const isQuizDifficulty = (value: string): value is QuizDifficulty =>
  value === "easy" || value === "medium" || value === "hard" || value === "mixed";

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

  // Simplified examination quiz settings.
  const [subject, setSubject] = useState("");
  const [examination, setExamination] = useState<"JAMB" | "WAEC" | "NECO">("JAMB");
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [examYears] = useState(
    Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) =>
      String(new Date().getFullYear() - i)
    )
  );
  const [numQuestions, setNumQuestions] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const gameMode = "group";

  // Join form
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("is_subscribed, free_live_quiz_used, full_name").eq("user_id", user.id).single();
      if (data) setProfile(data);
    };
    fetch();
    const fetchAvailableSubjects = async () => {
      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: {
          action: "subjects",
          quiz_type: "examination",
          examination,
          exam_year: Number(examYear),
        },
      });
      if (error) {
        console.error("Unable to load Live Quiz subjects:", await getFunctionErrorMessage(error, "Subject list unavailable."));
        return;
      }
      if (Array.isArray(data?.subjects)) setAvailableSubjects(data.subjects);
    };
    fetchAvailableSubjects();
    }, [user, examination, examYear]);

  const checkAccess = (): boolean => {
    if (profile.is_subscribed) return true;
    if ((profile.free_live_quiz_used || 0) < 2) return true;
    setShowPaywall(true);
    return false;
  };

  const handleCreate = async () => {
    if (!user || !subject) {
      toast({ title: "Please select a subject.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(numQuestions) || numQuestions < 5 || numQuestions > 50) {
      toast({ title: "Choose between 5 and 50 questions.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(timePerQuestion) || timePerQuestion < 10 || timePerQuestion > 120) {
      toast({ title: "Time per question must be between 10 and 120 seconds.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      let questions: LiveQuizQuestionInput[] | undefined;

      if (questionSource === "ai") {
        const generated = await supabase.functions.invoke("live-quiz", {
          body: {
            action: "generate",
            subject,
            topic: `Create original ${examination} ${examYear} examination-style ${subject} questions covering the key syllabus areas. Do not claim these are verbatim past-paper questions.`,
            num_questions: numQuestions,
            difficulty: "mixed",
            quiz_type: "examination",
            examination,
            exam_year: Number(examYear),
          },
        });
        if (generated.error) {
          throw new Error(await getFunctionErrorMessage(generated.error, "AI question generation failed."));
        }
        if (generated.data?.error) throw new Error(generated.data.error);
        if (!Array.isArray(generated.data?.questions) || generated.data.questions.length < numQuestions) {
          throw new Error("AI could not generate the requested questions. Please try again.");
        }
        questions = generated.data.questions;
      }

      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: {
          action: "create",
          subject,
          num_questions: numQuestions,
          time_per_question: timePerQuestion,
          game_mode: "group",
          quiz_type: "examination",
          examination,
          exam_year: Number(examYear),
          questions,
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error, "We could not create the quiz room."));
      if (data?.error) {
        if (String(data.error).toLowerCase().includes("free live quiz")) setShowPaywall(true);
        throw new Error(data.error);
      }
      const code = data?.room?.room_code;
      if (!code) throw new Error("No room code was returned.");
      navigate(`/quiz-room/${code}`);
    } catch (err: unknown) {
      toast({
        title: "Unable to create quiz",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
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
    } catch (err: unknown) {
      toast({
        title: "Error joining room",
        description: err instanceof Error ? err.message : "Please check the code and try again.",
        variant: "destructive",
      });
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-2xl space-y-5">
            <div>
              <h2 className="text-xl font-extrabold">Create a Group Quiz</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose your examination and questions, then create a room to share.</p>
            </div>

            <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
              <div className="space-y-2">
                <Label>Examination</Label>
                <Select value={examination} onValueChange={(v) => {
                  if (["JAMB", "WAEC", "NECO"].includes(v)) {
                    setExamination(v as "JAMB" | "WAEC" | "NECO");
                    setSubject("");
                  }
                }}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JAMB">JAMB</SelectItem>
                    <SelectItem value="WAEC">WAEC</SelectItem>
                    <SelectItem value="NECO">NECO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Exam year</Label>
                <Select value={examYear} onValueChange={(v) => {
                  setExamYear(v);
                  setSubject("");
                }}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {examYears.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.filter(s =>
                      questionSource === "ai" ||
                      availableSubjects === null ||
                      availableSubjects.some(name =>
                        name.trim().toLowerCase() === s.name.trim().toLowerCase() ||
                        name.trim().toLowerCase() === s.id.replace(/_/g, " ").toLowerCase()
                      )
                    ).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {questionSource === "bank" && availableSubjects !== null && availableSubjects.length === 0 && (
                  <p className="text-xs text-destructive">No published questions are available for this examination, year and subject. Choose AI generation instead.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Question source</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={questionSource === "bank" ? "default" : "outline"} className="h-11 rounded-xl" onClick={() => setQuestionSource("bank")}>Question Bank</Button>
                  <Button type="button" variant={questionSource === "ai" ? "default" : "outline"} className="h-11 rounded-xl" onClick={() => setQuestionSource("ai")}>Generate with AI</Button>
                </div>
                {questionSource === "ai" && <p className="text-xs text-muted-foreground">Questions will be generated automatically when you create the quiz.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Number of questions</Label>
                  <Input type="number" min={5} max={50} value={numQuestions} onChange={e => setNumQuestions(Number(e.target.value))} className="h-12 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Time per question (seconds)</Label>
                  <Input type="number" min={10} max={120} value={timePerQuestion} onChange={e => setTimePerQuestion(Number(e.target.value))} className="h-12 rounded-xl" />
                </div>
              </div>

              <Button className="h-12 w-full rounded-xl text-base font-semibold" onClick={handleCreate} disabled={
                loading || !subject ||
                (questionSource === "bank" && availableSubjects !== null && !availableSubjects.some(name =>
                  name.trim().toLowerCase() === subject.trim().toLowerCase()
                ))
              }>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {questionSource === "ai" ? "Generating questions and creating room..." : "Creating room..."}</> : "Create Quiz"}
              </Button>
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
              <CreditCard className="h-4 w-4 mr-2" /> Subscribe Now â€” â‚¦2,500
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
