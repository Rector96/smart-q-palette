import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
  BookOpen, Send, Loader2, Share2, X, Shuffle, MoreHorizontal, ChevronDown
} from "lucide-react";
import ScientificCalculator from "@/components/ScientificCalculator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import OnboardingTour, { CBT_TOUR_STEPS, CBT_TOUR_STORAGE_KEY, useOnboardingTour } from "@/components/OnboardingTour";
import SubscriptionModal from "@/components/SubscriptionModal";
import Logo from "@/components/Logo";
import ExamSubmitOverlay from "@/components/ExamSubmitOverlay";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import "./Exam.css";

const cleanQuestionExplanation = (value?: string | null) =>
  (value || "")
    .replace(/^\s*(?:(?:matches\s+pdf\s+answer\s+key|independently\s+verified)[^:]*):\s*/i, "")
    .trim();

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
  const cbtTour = useOnboardingTour(CBT_TOUR_STORAGE_KEY);

  const questionCountParam = searchParams.get("count");
  const countsParam = searchParams.get("counts");
  const customDuration = timerParam ? Number(timerParam) * 60 : 60 * 60;
  const requestedCount = questionCountParam ? Number(questionCountParam) : 60;
  let subjectQuestionCounts: Record<string, number> = {};
  try {
    const parsedCounts: unknown = countsParam ? JSON.parse(countsParam) : null;
    if (parsedCounts && typeof parsedCounts === "object" && !Array.isArray(parsedCounts)) {
      subjectQuestionCounts = Object.fromEntries(Object.entries(parsedCounts).map(([subject, count]) => [subject, Number(count)]));
    }
  } catch {
    subjectQuestionCounts = {};
  }
  if (!Object.keys(subjectQuestionCounts).length && subjects.length === 1) {
    subjectQuestionCounts[subjects[0]] = requestedCount;
  }

  const [questions, setQuestions] = useState<QuestionWithShuffledOptions[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(customDuration);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false);
  const handleCBTTourStepChange = useCallback((step: number) => setShowNav(step === 4), []);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [trialBlocked, setTrialBlocked] = useState(false);
  const [activeSubject, setActiveSubject] = useState(subjects[0] || "");
  const [profileName, setProfileName] = useState("");
  const timerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const submittingRef = useRef(false);
  const startTimeRef = useState<number>(Date.now());
  const questionStartRef = useState<number>(Date.now());
  const feedbackRef = useRef<HTMLParagraphElement | null>(null);
  const explanationRef = useRef<HTMLDivElement | null>(null);
  const questionCardRef = useRef<HTMLDivElement | null>(null);
  const oneMinuteWarningShownRef = useRef(false);
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
      // The exam session is created only after the student accepts the instructions.
    };
    checkTrial();
  }, [user]);

  const loadQuestions = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("cbt-start", {
      body: { subjects, mode, count: requestedCount, counts: subjectQuestionCounts, duration_seconds: customDuration, examination, year: selectedYear, adaptive: adaptivePractice },
    });
    let responseData = data;
    if (error && !responseData && error.context instanceof Response) {
      try {
        responseData = await error.context.clone().json();
      } catch {
        // Use the SDK error message when the response body is not valid JSON.
      }
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
    const savedDurationSeconds = Number(data.session.allowed_duration_seconds) || customDuration;
    deadlineRef.current = serverStartedAt + savedDurationSeconds * 1000;
    oneMinuteWarningShownRef.current = false;
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
      if (remaining <= 60 && remaining > 0 && !oneMinuteWarningShownRef.current) {
        oneMinuteWarningShownRef.current = true;
        toast({ title: "⏰ 1 minute remaining!", description: "Your exam will be submitted automatically when the timer ends.", variant: "destructive" });
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
  const navigatorQuestions = hasMultipleSubjects ? displayedQuestions : questions;
  const totalQuestions = navigatorQuestions.length;
  const answeredCount = navigatorQuestions.filter((question) => answers[question.id]).length;

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
      (explanationRef.current || feedbackRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  useEffect(() => {
    if (!currentQuestion || showConfirmSubmit || showSubscription || submitting) return;

    const handleExamKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) return;

      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        goToQuestion(currentIndex - 1);
        return;
      }

      if (event.key === "ArrowRight" && currentIndex < totalQuestions - 1) {
        event.preventDefault();
        goToQuestion(currentIndex + 1);
        return;
      }

      const answerIndex = "abcde".indexOf(event.key.toLowerCase());
      const option = answerIndex >= 0 ? currentQuestion.options[answerIndex] : undefined;
      if (option) {
        event.preventDefault();
        selectAnswer(currentQuestion.id, option.label);
      }
    };

    window.addEventListener("keydown", handleExamKeyDown);
    return () => window.removeEventListener("keydown", handleExamKeyDown);
  }, [currentQuestion, currentIndex, totalQuestions, answers, isPractice, showResult, showConfirmSubmit, showSubscription, submitting]);

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
    setSubmissionComplete(false);
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
    setSubmissionComplete(true);

    // Send the first-exam email in the background so it cannot block results.
    void (async () => {
      try {
        const { count, error: countError } = await supabase
          .from("exam_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("completed", true);

        if (countError || count !== 1) return;

        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .single();

        await supabase.functions.invoke("send-email", {
          body: {
            type: "first_cbt",
            email: user.email,
            name: prof?.full_name || "Student",
          },
        });
      } catch (error) {
        console.error("Could not send first-exam email:", error);
      }
    })();
    await new Promise(r => setTimeout(r, 2000));
    navigate(`/results/${sessionId}`);
  };
  submitRef.current = handleSubmit;

  const formatTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const getSubjectName = (id: string) => SUBJECTS.find(s => s.id === id)?.name || id;

  if (!instructionsAccepted && !sessionId && !trialBlocked) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-xl overflow-hidden border-border/60 shadow-xl">
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-2">
              <Logo size="lg" showText />
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Official Computer-Based Examination</p>
              <h1 className="text-xl sm:text-2xl font-bold">Welcome to your ROCKCBT {mode === "practice" ? "Practice" : mode === "mock" ? "Mock Examination" : "CBT Examination"}</h1>
              <p className="text-sm text-muted-foreground">You are about to begin. Take a moment to read these instructions.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold">Before you proceed</h2>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                <li>Read every question carefully and select the best answer.</li>
                <li>Use the question navigator to move between questions.</li>
                {hasMultipleSubjects && <li>Use the subject tabs to switch between your selected subjects.</li>}
                {isTimed ? <li>Your examination time begins only after you press Proceed to Examination. The timer covers the entire exam.</li> : <li>Practice has no countdown. Work through the questions at your own pace.</li>}
                <li>Review your answers before submitting your examination.</li>
              </ol>
            </div>
            <div className="rounded-2xl bg-primary/5 border border-primary/15 p-4 text-center">
              <p className="text-sm font-semibold text-primary">Your preparation starts here.</p>
              <p className="mt-1 text-sm font-medium">If you can beat it here, you can beat it on examination day.</p>
            </div>
            <Button className="h-12 w-full text-sm font-semibold" onClick={() => { setInstructionsAccepted(true); void loadQuestions(); }}>
              Proceed to Examination
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>Return to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      {submitting && <ExamSubmitOverlay isComplete={submissionComplete} />}
    <div className="exam-page min-h-[100dvh] overflow-x-clip bg-background flex flex-col">
      {/* Header */}
      <header data-tour="exam-tools" className="exam-mobile-header border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20 lg:hidden">
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 py-2 flex items-center justify-between safe-area-top">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")} aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Logo size="sm" showText />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div data-tour="exam-calculator" className="shrink-0">
              <ScientificCalculator compact />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label="More exam actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6}>
                {!isTimed && (
                  <DropdownMenuItem onSelect={shuffleQuestionSet}>
                    <Shuffle className="mr-2 h-4 w-4" /> Shuffle questions
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={handleShare}>
                  <Share2 className="mr-2 h-4 w-4" /> Share exam
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate capitalize">{mode} · {examination}{selectedYear ? ` ${selectedYear}` : " · All years"}</span>
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {isTimed && (
                <span role="timer" aria-live={timeLeft <= 60 ? "assertive" : "off"} className={cn("flex h-8 items-center gap-1 rounded-full bg-secondary px-2.5 font-mono text-[10px] font-bold", timeLeft <= 60 && "text-destructive")}>
                  <Clock className="h-3.5 w-3.5" />{formatTime(timeLeft)}
                </span>
              )}
              <button
                type="button"
                data-tour="exam-question-picker"
                aria-expanded={showNav}
                aria-controls="exam-mobile-nav"
                aria-label={`Question ${currentIndex + 1} of ${totalQuestions}. Toggle question navigator`}
                className="flex h-8 items-center gap-1 rounded-full bg-secondary px-2.5 text-[10px] font-semibold"
                onClick={() => setShowNav(!showNav)}
              >
                {currentIndex + 1}/{totalQuestions}<ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{answeredCount} answered</span>
            <span>{Math.max(0, totalQuestions - answeredCount)} remaining</span>
          </div>
          <Progress value={((currentIndex + 1) / totalQuestions) * 100} className="mt-1 h-1" />
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

      </header>

      <header className="exam-desktop-header sticky top-0 z-30 hidden border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl lg:block">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-5 py-3">
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => navigate("/dashboard")} aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Logo size="sm" showText />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="max-w-[300px] truncate rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
              {subjects.map(getSubjectName).join(" · ") || "All subjects"}{examination ? ` · ${examination}` : ""}{selectedYear ? ` ${selectedYear}` : ""}
            </span>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold capitalize text-slate-700">{mode} Mode</span>
            {!isTimed && (
              <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-xl gap-1.5" onClick={shuffleQuestionSet} title="Shuffle question order">
                <Shuffle className="h-3.5 w-3.5" /><span className="text-xs">Shuffle</span>
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={handleShare} title="Share exam" aria-label="Share exam">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ScientificCalculator />
            {isTimed && (
              <span className={cn("flex h-9 items-center gap-1.5 rounded-xl border px-3 font-mono text-sm font-bold tabular-nums", timeLeft < 300 ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-slate-50 text-slate-700")} aria-live="polite">
                <Clock className="h-4 w-4" />{formatTime(timeLeft)}
              </span>
            )}
            <Button className="h-9 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700" onClick={confirmAndSubmit} disabled={submitting}>
              <Send className="mr-2 h-4 w-4" /> Submit Exam
            </Button>
          </div>
        </div>
        {hasMultipleSubjects && (
          <div className="mx-auto flex max-w-[1440px] gap-2 overflow-x-auto px-5 pb-2 scrollbar-hide">
            {subjects.map((subj) => {
              const SubjIcon = SUBJECTS.find((subject) => subject.id === subj)?.icon || BookOpen;
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => { setActiveSubject(subj); setCurrentIndex(0); setShowResult(false); }}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", activeSubject === subj ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                >
                  <SubjIcon className="h-3.5 w-3.5" />{getSubjectName(subj)}
                </button>
              );
            })}
          </div>
        )}
        <div className="mx-auto max-w-[1440px] px-5 pb-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>{answeredCount} of {totalQuestions} answered</span>
            <span>Question {currentIndex + 1} of {totalQuestions}</span>
          </div>
          <Progress value={totalQuestions ? (answeredCount / totalQuestions) * 100 : 0} className="h-1.5" />
        </div>
      </header>

      {/* Question Nav Grid */}
      <AnimatePresence>
        {showNav && (
          <motion.div id="exam-mobile-nav" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="exam-mobile-nav overflow-hidden border-b border-border bg-card lg:hidden">
            <div data-tour="exam-question-grid" className="max-h-[35dvh] max-w-4xl mx-auto w-full overflow-y-auto px-3 py-3 sm:px-4">
              <div className="flex flex-wrap gap-1.5">
                {navigatorQuestions.map((q, idx) => (
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
      <div className="exam-workspace flex-1">
        <main className="exam-question-main w-full px-3 py-4 sm:px-4 sm:py-6">
          {currentQuestion && (
            <AnimatePresence mode="wait">
              <motion.div ref={questionCardRef} data-tour="exam-question" className="exam-question-card scroll-mt-24" key={`${activeSubject}-${currentIndex}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} onAnimationComplete={() => questionCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {currentQuestion.passage && (
                <Card className="mb-3 border-border/50">
                  <CardContent className="p-4 max-h-[40vh] overflow-y-auto">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">📖 Comprehension Passage</p>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{currentQuestion.passage}</p>
                  </CardContent>
                </Card>
              )}
              {currentQuestion.diagram_url && (
                <figure className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card p-2 sm:p-3">
                  <img
                    src={currentQuestion.diagram_url}
                    alt={`Diagram for ${currentQuestion.topic || "this question"}`}
                    className="mx-auto max-h-[50vh] w-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              )}
              <div className="mb-5 rounded-2xl border border-border/60 bg-card p-4 sm:mb-4 sm:border-0 sm:bg-transparent sm:p-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">Q{currentIndex + 1} · {currentQuestion.topic} · {currentQuestion.difficulty}</span>
                  <button type="button" aria-label={flagged.has(currentQuestion.id) ? "Remove question flag" : "Flag question for review"} onClick={toggleFlag} className="shrink-0 rounded-lg p-2 hover:bg-secondary">
                    <Flag className={cn("h-3.5 w-3.5", flagged.has(currentQuestion.id) ? "text-warning fill-warning" : "text-muted-foreground")} />
                  </button>
                </div>
                <p className="text-[15px] sm:text-base font-semibold leading-7">{currentQuestion.question_text}</p>
              </div>
              <div className="exam-answer-list space-y-2">
                {currentQuestion.options.map((option) => {
                  const isSelected = answers[currentQuestion.id] === option.label;
                  const isCorrect = option.label === currentQuestion.correct_answer;
                  const showFeedback = isPractice && showResult;
                  return (
                    <div key={option.label}>
                      <motion.button whileTap={{ scale: 0.99 }} onClick={() => selectAnswer(currentQuestion.id, option.label)}
                        className={cn("exam-answer-option w-full min-h-[58px] text-left p-3.5 sm:p-4 rounded-2xl border-2 transition-all text-sm leading-relaxed flex items-center gap-3 active:scale-[0.995]",
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
              {isPractice && showResult && (
                <motion.div ref={explanationRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 p-3 bg-secondary/50 rounded-lg scroll-mt-24">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Explanation</p>
                  <p className="text-xs leading-relaxed">{cleanQuestionExplanation(currentQuestion.explanation) || "An explanation is not available for this question yet."}</p>
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
        <aside className="exam-desktop-navigator" aria-label="Question navigator">
          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Question Navigator</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Jump to any question</p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-800">{answeredCount}/{totalQuestions} Answered</span>
              </div>
              <Progress value={totalQuestions ? (answeredCount / totalQuestions) * 100 : 0} className="mb-4 h-1.5" />
              <div className="exam-question-grid">
                {navigatorQuestions.map((question, index) => {
                  const isCurrent = index === currentIndex;
                  const isFlagged = flagged.has(question.id);
                  const isAnswered = Boolean(answers[question.id]);
                  return (
                    <button
                      type="button"
                      key={question.id}
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={`Question ${index + 1}${isCurrent ? ", current" : ""}${isAnswered ? ", answered" : ", unanswered"}${isFlagged ? ", flagged for review" : ""}`}
                      onClick={() => goToQuestion(index)}
                      className={cn("exam-question-number", isCurrent ? "is-current" : isFlagged ? "is-flagged" : isAnswered ? "is-answered" : "is-unanswered")}
                    >
                      {index + 1}
                      {isFlagged && <Flag className="absolute right-1 top-1 h-2.5 w-2.5 fill-current" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-slate-600">
                <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-600" />Current</span>
                <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Answered</span>
                <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />Flagged</span>
                <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />Unanswered</span>
              </div>
            </CardContent>
            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-center text-[10px] text-slate-500">
              A–D to answer <span className="mx-1 text-slate-300">·</span> ← → to navigate
            </div>
          </Card>
        </aside>
      </div>

      <div className="exam-desktop-controls">
        <div className="exam-desktop-controls-inner">
          <div className="exam-desktop-controls-actions">
            <Button variant="outline" className="h-10 rounded-xl" disabled={currentIndex === 0} onClick={() => goToQuestion(currentIndex - 1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" className={cn("h-10 rounded-xl", flagged.has(currentQuestion.id) && "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100")} onClick={toggleFlag}>
              <Flag className={cn("mr-2 h-4 w-4", flagged.has(currentQuestion.id) && "fill-current")} />{flagged.has(currentQuestion.id) ? "Flagged" : "Flag for Review"}
            </Button>
            <span className="flex-1" />
            {currentIndex === totalQuestions - 1 ? (
              <Button className="h-10 rounded-xl bg-primary px-5" onClick={confirmAndSubmit} disabled={submitting}>
                Submit Exam <Send className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button className="h-10 rounded-xl px-5" onClick={() => goToQuestion(currentIndex + 1)}>
                Next Question <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
          <div aria-hidden="true" />
        </div>
      </div>

      {/* Footer */}
      <footer data-tour="exam-bottom-nav" className="exam-mobile-footer border-t border-border bg-card/95 backdrop-blur-xl sticky bottom-0 z-20 safe-area-bottom shadow-[0_-8px_24px_rgba(15,23,42,0.06)] lg:hidden">
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
      <OnboardingTour
        active={cbtTour.active && Boolean(currentQuestion)}
        onDismiss={() => { setShowNav(false); cbtTour.dismiss(); }}
        onStepChange={handleCBTTourStepChange}
        steps={CBT_TOUR_STEPS}
      />
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
