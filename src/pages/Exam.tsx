import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { type QuestionWithShuffledOptions, getMotivationalMessage, getLearningTip, shouldShowTip } from "@/lib/questionEngine";
import { SUBJECTS } from "@/lib/subjects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, Flag, Clock, CheckCircle2, XCircle,
  BookOpen, Send, Loader2, Share2, X, Shuffle
} from "lucide-react";
import ScientificCalculator from "@/components/ScientificCalculator";
import { motion, AnimatePresence } from "framer-motion";
import SubscriptionModal from "@/components/SubscriptionModal";
import Logo from "@/components/Logo";
import ExamSubmitOverlay from "@/components/ExamSubmitOverlay";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";

const Exam = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "practice";
  const adaptivePractice = searchParams.get("adaptive") === "true" && (mode === "practice" || mode === "revision");
  const examination = searchParams.get("examination") || "";
  const yearParam = searchParams.get("year") || "all";
  const selectedYear = yearParam === "all" ? null : Number(yearParam);
  const subjectsParam = searchParams.get("subjects") || "";
  const timerParam = searchParams.get("timer");
  const shareCode = searchParams.get("share");
  const subjects = subjectsParam.split(",").filter(Boolean);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const questionCountParam = searchParams.get("count");
  const customDuration = timerParam ? Number(timerParam) * 60 : 60 * 60;
  const requestedCount = questionCountParam ? Number(questionCountParam) : 60;

  const [questions, setQuestions] = useState<QuestionWithShuffledOptions[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(customDuration);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [trialBlocked, setTrialBlocked] = useState(false);
  const [activeSubject, setActiveSubject] = useState(subjects[0] || "");
  const [profileName, setProfileName] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const submittingRef = useRef(false);
  const startTimeRef = useState<number>(Date.now());
  const questionStartRef = useState<number>(Date.now());
  const feedbackRef = useRef<HTMLParagraphElement | null>(null);
  answersRef.current = answers;

  const isTimed = mode === "cbt" || mode === "mock";
  const isPractice = mode === "practice" || mode === "revision";
  const hasMultipleSubjects = subjects.length > 1;
  useOnlinePresence("exam", subjects.join(", "));

  // Group questions by subject
  const questionsBySubject = useMemo(() => {
    const grouped: Record<string, QuestionWithShuffledOptions[]> = {};
    subjects.forEach(s => { grouped[s] = []; });
    questions.forEach(q => {
      const subj = q.subject || subjects[0];
      if (grouped[subj]) grouped[subj].push(q);
      else if (subjects[0]) grouped[subjects[0]].push(q);
    });
    return grouped;
  }, [questions, subjects]);

  // Current filtered questions for active subject tab
  const displayedQuestions = hasMultipleSubjects ? (questionsBySubject[activeSubject] || []) : questions;
  const globalIndex = hasMultipleSubjects
    ? questions.indexOf(displayedQuestions[currentIndex])
    : currentIndex;

  useEffect(() => {
    if (!user) return;
    const checkTrial = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();
      if (profile?.full_name) setProfileName(profile.full_name);
      loadQuestions();
    };
    checkTrial();
  }, [user]);

  const loadQuestions = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("cbt-start", {
      body: { subjects, mode, count: requestedCount, examination, year: selectedYear, adaptive: adaptivePractice },
    });
    let responseData = data;
    if (error && !responseData && error.context instanceof Response) {
      try { responseData = await error.context.clone().json(); } catch {}
    }
    if (error || !responseData?.session?.id || !Array.isArray(responseData.questions)) {
      const message = responseData?.error || error?.message || "We could not prepare your exam. Please try again.";
      if (message === "TRIAL_LIMIT_REACHED") {
        setTrialBlocked(true);
        setShowSubscription(true);
      } else {
        toast({ title: "Unable to start exam", description: message, variant: "destructive" });
      }
      setQuestions([]);
      setLoading(false);
      return;
    }
    setQuestions(data.questions as QuestionWithShuffledOptions[]);
    setSessionId(data.session.id);
    const serverStartedAt = data.session.started_at ? new Date(data.session.started_at).getTime() : Date.now();
    deadlineRef.current = serverStartedAt + customDuration * 1000;
    setTimeLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    setLoading(false);
    startTimeRef[1](Date.now());
    questionStartRef[1](Date.now());
  };

  useEffect(() => {
    if (!isTimed || loading || trialBlocked || !sessionId || !deadlineRef.current) return;

    const updateCountdown = () => {
      const deadline = deadlineRef.current;
      if (!deadline) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 300) {
        toast({ title: "⏰ 5 minutes remaining!", variant: "destructive" });
      }
      if (remaining <= 0) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        void submitRef.current();
      }
    };

    updateCountdown();
    timerRef.current = window.setInterval(updateCountdown, 250);
    window.addEventListener("focus", updateCountdown);
    document.addEventListener("visibilitychange", updateCountdown);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      window.removeEventListener("focus", updateCountdown);
      document.removeEventListener("visibilitychange", updateCountdown);
    };
  }, [isTimed, loading, trialBlocked, sessionId]);

  const currentQuestion = hasMultipleSubjects ? displayedQuestions[currentIndex] : questions[currentIndex];

  const selectAnswer = (questionId: string, label: string) => {
    if (showResult && isPractice) return;
    // Allow deselection by clicking same option
    if (answers[questionId] === label) {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      return;
    }
    // Allow changing answer freely
    setAnswers((prev) => ({ ...prev, [questionId]: label }));
    if (isPractice) setShowResult(true);
  };

  useEffect(() => {
    if (!isPractice || !showResult || !currentQuestion) return;
    const frame = window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPractice, showResult, currentQuestion?.id]);

  const toggleFlag = () => {
    if (!currentQuestion) return;
    const newFlagged = new Set(flagged);
    if (newFlagged.has(currentQuestion.id)) newFlagged.delete(currentQuestion.id);
    else newFlagged.add(currentQuestion.id);
    setFlagged(newFlagged);
  };

  const shuffleQuestionSet = () => {
    if (questions.length < 2) return;
    const shuffled = [...questions];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    setQuestions(shuffled);
    setCurrentIndex(0);
    setShowResult(false);
    setShowNav(false);
    questionStartRef[1](Date.now());
    toast({ title: "Questions shuffled", description: "Your question order has been mixed. Your saved answers are kept." });
  };

  const goToQuestion = (index: number) => {
    questionStartRef[1](Date.now());
    setCurrentIndex(index);
    setShowResult(false);
    setShowNav(false);
  };

  const handleShare = async () => {
    if (!sessionId || !user) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase.from("shared_exams").insert({
      share_code: code,
      creator_id: user.id,
      session_id: sessionId,
      mode,
      subjects,
      timer_minutes: timerParam ? Number(timerParam) : null,
      examination,
      exam_year: selectedYear,
    });
    const url = `${window.location.origin}/s/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied! 🔗", description: `Short link: ${url}` });
    } catch {
      toast({ title: "Share link", description: url });
    }
  };

  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const confirmAndSubmit = () => {
    // Check if user has answered at least one question
    const answeredCount = Object.keys(answers).length;
    if (answeredCount === 0) {
      toast({ title: "No answers selected", description: "Please answer at least one question before submitting.", variant: "destructive" });
      return;
    }
    setShowConfirmSubmit(true);
  };

  const handleSubmit = async () => {
    if (!user || !sessionId || submittingRef.current) return;
    submittingRef.current = true;
    setShowConfirmSubmit(false);
    setSubmitting(true);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const submission = questions.map((q) => ({
      question_id: q.id,
      selected_answer: answersRef.current[q.id] || "X",
      time_spent_seconds: 0,
    }));
    const { data: submitData, error: submitError } = await supabase.functions.invoke("cbt-submit", {
      body: { session_id: sessionId, answers: submission },
    });
    if (submitError || !submitData?.result) {
      submittingRef.current = false;
      setSubmitting(false);
      toast({
        title: "Submission not completed",
        description: submitData?.error || submitError?.message || "Please try submitting again.",
        variant: "destructive",
      });
      return;
    }

    // Check if this is user's first completed CBT and send email
    const { count } = await supabase.from("exam_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("completed", true);
    if (count === 1) {
      try {
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).single();
        await supabase.functions.invoke("send-email", {
          body: { type: "first_cbt", email: user.email, name: prof?.full_name || "Student" },
        });
      } catch {}
    }
    
    await new Promise(r => setTimeout(r, 2000));
    navigate(`/results/${sessionId}`);
  };
  submitRef.current = handleSubmit;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const totalQuestions = hasMultipleSubjects ? displayedQuestions.length : questions.length;

  const getSubjectName = (id: string) => SUBJECTS.find(s => s.id === id)?.name || id;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-xs mx-auto px-4">
          <motion.div
            className="relative mx-auto w-20 h-20"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute inset-0 rounded-full border-4 border-secondary" />
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </motion.div>
          <div className="space-y-2">
            <motion.p
              className="text-sm font-semibold"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Preparing your questions...
            </motion.p>
            <div className="flex justify-center gap-1">
              {["📚", "✏️", "🧠", "🎯"].map((emoji, i) => (
                <motion.span
                  key={i}
                  className="text-lg"
                  initial={{ y: 0 }}
                  animate={{ y: [-4, 4, -4] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                >
                  {emoji}
                </motion.span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Shuffling & balancing difficulty levels</p>
          </div>
        </div>
      </div>
    );
  }

  if (trialBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">No questions available</p>
            <p className="text-xs text-muted-foreground mt-1">Questions haven't been added for this subject yet.</p>
            <Button className="mt-4 h-8 text-xs" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {submitting && <ExamSubmitOverlay />}
    <div className="min-h-[100dvh] overflow-x-clip bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-2.5 flex items-center justify-between safe-area-top">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Logo size="sm" showText />
          </div>
          <div className="flex items-center gap-2">
            {subjects.some((subject) => ["mathematics", "physics", "chemistry", "economics"].includes(subject.toLowerCase())) && <ScientificCalculator />}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/dashboard")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mode / Timer / Progress bar */}
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2">
          <div className="flex min-h-8 items-center gap-1.5 px-2.5 py-1 bg-secondary rounded-full">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold capitalize">{mode} Mode</span>
          </div>
          <div className="min-h-8 px-2.5 py-1 bg-primary/10 text-primary rounded-full">
            <span className="text-[10px] font-semibold">{examination}{selectedYear ? ` · ${selectedYear}` : " · All years"}</span>
          </div>
          {isTimed && (
            <div className={cn("flex min-h-8 items-center gap-1.5 px-2.5 py-1 bg-secondary rounded-full", timeLeft < 300 && "text-destructive")}>
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[10px] font-mono font-bold">{formatTime(timeLeft)}</span>
            </div>
          )}
          {!isTimed && (
            <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={shuffleQuestionSet} title="Shuffle question order">
              <Shuffle className="h-3.5 w-3.5" /><span className="text-[10px]">Shuffle</span>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleShare} title="Share exam">
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-secondary rounded-full cursor-pointer" onClick={() => setShowNav(!showNav)}>
            <span className="text-[10px] font-semibold">{currentIndex + 1}/{totalQuestions}</span>
          </div>
        </div>

        {/* Subject Tabs */}
        {hasMultipleSubjects && (
          <div className="max-w-4xl mx-auto px-4 py-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {subjects.map(subj => {
                const SubjIcon = SUBJECTS.find(s => s.id === subj)?.icon || BookOpen;
                return (
                  <button
                    key={subj}
                    onClick={() => { setActiveSubject(subj); setCurrentIndex(0); setShowResult(false); }}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                      activeSubject === subj
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    <SubjIcon className="h-3.5 w-3.5" />
                    {getSubjectName(subj)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 pb-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{displayedQuestions.filter((question) => answers[question.id]).length} answered</span><span>{Math.max(0, totalQuestions - displayedQuestions.filter((question) => answers[question.id]).length)} remaining</span></div><Progress value={((currentIndex + 1) / totalQuestions) * 100} className="h-1.5" />
      </header>

      {/* Question Nav Grid */}
      <AnimatePresence>
        {showNav && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-card border-b border-border overflow-hidden">
            <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {(hasMultipleSubjects ? displayedQuestions : questions).map((q, idx) => (
                  <button key={q.id} onClick={() => goToQuestion(idx)} className={cn("h-9 w-9 rounded-xl text-[11px] font-semibold transition-colors", idx === currentIndex && "ring-2 ring-primary", answers[q.id] ? "bg-primary text-primary-foreground" : flagged.has(q.id) ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground")}>
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 w-full">
        {currentQuestion && (
          <AnimatePresence mode="wait">
            <motion.div key={`${activeSubject}-${currentIndex}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {currentQuestion.passage && (
                <Card className="mb-3 border-border/50">
                  <CardContent className="p-4 max-h-[40vh] overflow-y-auto">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">📖 Comprehension Passage</p>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{currentQuestion.passage}</p>
                  </CardContent>
                </Card>
              )}
              <div className="mb-5 rounded-2xl border border-border/60 bg-card p-4 sm:mb-4 sm:border-0 sm:bg-transparent sm:p-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">Q{currentIndex + 1} · {currentQuestion.topic} · {currentQuestion.difficulty}</span>
                  <button onClick={toggleFlag} className="shrink-0">
                    <Flag className={cn("h-3.5 w-3.5", flagged.has(currentQuestion.id) ? "text-warning fill-warning" : "text-muted-foreground")} />
                  </button>
                </div>
                <p className="text-[15px] sm:text-base font-semibold leading-7">{currentQuestion.question_text}</p>
              </div>
              <div className="space-y-2">
                {currentQuestion.options.map((option) => {
                  const isSelected = answers[currentQuestion.id] === option.label;
                  const isCorrect = option.label === currentQuestion.correct_answer;
                  const showFeedback = isPractice && showResult;
                  return (
                    <div key={option.label}>
                      <motion.button whileTap={{ scale: 0.99 }} onClick={() => selectAnswer(currentQuestion.id, option.label)}
                        className={cn("w-full min-h-[58px] text-left p-3.5 sm:p-4 rounded-2xl border-2 transition-all text-sm leading-relaxed flex items-center gap-3 active:scale-[0.995]",
                          showFeedback && isCorrect ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10" : showFeedback && isSelected && !isCorrect ? "border-destructive bg-destructive/10" : isSelected ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/30")}>
                        <span className={cn("shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold", isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{option.label}</span>
                        <span className="flex-1">{option.text}</span>
                        {isSelected && !showFeedback && (
                          <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        {showFeedback && isCorrect && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />}
                        {showFeedback && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                      </motion.button>
                      {showFeedback && (
                        <motion.p ref={feedbackRef} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className={cn("text-[10px] mt-1 ml-9 leading-relaxed scroll-mt-24", isCorrect ? "text-[hsl(var(--success))]" : "text-muted-foreground")}>
                          {isCorrect
                            ? `✅ Correct! ${currentQuestion.exam_hint || "Well done!"}`
                            : `❌ Not quite. ${currentQuestion.exam_hint || "Review this concept."}`}
                        </motion.p>
                      )}
                    </div>
                  );
                })}
              </div>
              {isPractice && showResult && currentQuestion.explanation && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 p-3 bg-secondary/50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Explanation</p>
                  <p className="text-xs leading-relaxed">{currentQuestion.explanation}</p>
                </motion.div>
              )}
              {isPractice && showResult && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-2">
                  <p className="text-[11px] font-medium text-primary">{getMotivationalMessage()}</p>
                  {shouldShowTip() && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">{getLearningTip()}</p>
                  )}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/95 backdrop-blur-xl sticky bottom-0 z-20 safe-area-bottom shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={currentIndex === 0} onClick={() => goToQuestion(currentIndex - 1)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Prev
          </Button>
          {currentIndex === totalQuestions - 1 ? (
            <Button size="sm" className="h-11 min-w-28 rounded-xl text-xs" onClick={confirmAndSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />} Submit
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs" onClick={() => goToQuestion(currentIndex + 1)}>
              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </footer>
    </div>
      {/* Submit Confirmation Dialog */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border">
            <div className="text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-bold">Submit Exam?</h3>
              <p className="text-xs text-muted-foreground">
                {profileName || "Student"}, are you sure you want to submit? You've answered {Object.keys(answers).length} of {questions.length} questions.
              </p>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-10 text-sm rounded-xl" onClick={() => setShowConfirmSubmit(false)}>
                  No, Go Back
                </Button>
                <Button className="flex-1 h-10 text-sm rounded-xl" onClick={handleSubmit}>
                  Yes, Submit
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
};

export default Exam;
