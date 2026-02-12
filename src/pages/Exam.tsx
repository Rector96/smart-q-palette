import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchSmartQuestions, type QuestionWithShuffledOptions } from "@/lib/questionEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, Flag, Clock, CheckCircle2, XCircle,
  BookOpen, Send, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Exam = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "practice";
  const subjectsParam = searchParams.get("subjects") || "";
  const timerParam = searchParams.get("timer");
  const subjects = subjectsParam.split(",").filter(Boolean);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const customDuration = timerParam ? Number(timerParam) * 60 : 60 * 60;

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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const questionStartRef = useRef<number>(Date.now());

  const isTimed = mode === "cbt" || mode === "mock";
  const isPractice = mode === "practice";

  useEffect(() => {
    if (!user) return;
    const loadQuestions = async () => {
      setLoading(true);
      let allQuestions: QuestionWithShuffledOptions[] = [];
      for (const subject of subjects) {
        const qs = await fetchSmartQuestions(subject, user.id, 60, mode);
        allQuestions = [...allQuestions, ...qs];
      }
      setQuestions(allQuestions);
      const { data: session } = await supabase
        .from("exam_sessions")
        .insert({ user_id: user.id, mode, subjects, total_questions: allQuestions.length })
        .select()
        .single();
      if (session) setSessionId(session.id);
      setLoading(false);
      startTimeRef.current = Date.now();
      questionStartRef.current = Date.now();
    };
    loadQuestions();
  }, [user]);

  useEffect(() => {
    if (!isTimed || loading) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0; }
        if (prev === 300) toast({ title: "⏰ 5 minutes remaining!", variant: "destructive" });
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimed, loading]);

  const currentQuestion = questions[currentIndex];

  const selectAnswer = (questionId: string, label: string) => {
    if (showResult && isPractice) return;
    setAnswers((prev) => ({ ...prev, [questionId]: label }));
    if (isPractice) setShowResult(true);
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    const newFlagged = new Set(flagged);
    if (newFlagged.has(currentQuestion.id)) newFlagged.delete(currentQuestion.id);
    else newFlagged.add(currentQuestion.id);
    setFlagged(newFlagged);
  };

  const goToQuestion = (index: number) => {
    questionStartRef.current = Date.now();
    setCurrentIndex(index);
    setShowResult(false);
    setShowNav(false);
  };

  const handleSubmit = useCallback(async () => {
    if (!user || !sessionId || submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    let correct = 0;
    const historyEntries = questions.map((q) => {
      const userAnswer = answers[q.id] || "";
      const isCorrect = userAnswer === q.correct_answer;
      if (isCorrect) correct++;
      return { user_id: user.id, question_id: q.id, selected_answer: userAnswer || "X", is_correct: isCorrect, session_id: sessionId, time_spent_seconds: 0 };
    });
    await supabase.from("user_history").insert(historyEntries);
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const scorePercentage = questions.length > 0 ? (correct / questions.length) * 100 : 0;
    await supabase.from("exam_sessions").update({ correct_answers: correct, score_percentage: scorePercentage, duration_seconds: duration, completed: true, completed_at: new Date().toISOString() }).eq("id", sessionId);
    navigate(`/results/${sessionId}`);
  }, [user, sessionId, submitting, questions, answers, navigate]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-xs text-muted-foreground">Loading questions...</p>
        </div>
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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold capitalize">{mode} Mode</span>
          </div>
          <div className="flex items-center gap-3">
            {isTimed && (
              <div className={cn("flex items-center gap-1 text-xs font-mono font-semibold", timeLeft < 300 ? "text-destructive" : "text-foreground")}>
                <Clock className="h-3.5 w-3.5" />
                {formatTime(timeLeft)}
              </div>
            )}
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowNav(!showNav)}>
              {currentIndex + 1}/{questions.length}
            </Button>
          </div>
        </div>
        <Progress value={((currentIndex + 1) / questions.length) * 100} className="h-0.5" />
      </header>

      <AnimatePresence>
        {showNav && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-card border-b border-border overflow-hidden">
            <div className="max-w-4xl mx-auto px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {questions.map((q, idx) => (
                  <button key={q.id} onClick={() => goToQuestion(idx)} className={cn("h-7 w-7 rounded text-[10px] font-medium transition-colors", idx === currentIndex && "ring-2 ring-primary", answers[q.id] ? "bg-primary text-primary-foreground" : flagged.has(q.id) ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground")}>
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-4 w-full">
        <AnimatePresence mode="wait">
          <motion.div key={currentIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            {currentQuestion.passage && (
              <Card className="mb-3 border-border/50">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Passage</p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{currentQuestion.passage}</p>
                </CardContent>
              </Card>
            )}
            <div className="mb-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground">Q{currentIndex + 1} · {currentQuestion.topic} · {currentQuestion.difficulty}</span>
                <button onClick={toggleFlag} className="shrink-0">
                  <Flag className={cn("h-3.5 w-3.5", flagged.has(currentQuestion.id) ? "text-warning fill-warning" : "text-muted-foreground")} />
                </button>
              </div>
              <p className="text-sm font-medium leading-relaxed">{currentQuestion.question_text}</p>
            </div>
            <div className="space-y-2">
              {currentQuestion.options.map((option) => {
                const isSelected = answers[currentQuestion.id] === option.label;
                const isCorrect = option.label === currentQuestion.correct_answer;
                const showFeedback = isPractice && showResult;
                return (
                  <motion.button key={option.label} whileTap={{ scale: 0.99 }} onClick={() => selectAnswer(currentQuestion.id, option.label)} disabled={showFeedback}
                    className={cn("w-full text-left p-3 rounded-lg border-2 transition-all text-xs flex items-start gap-2",
                      showFeedback && isCorrect ? "border-success bg-success/10" : showFeedback && isSelected && !isCorrect ? "border-destructive bg-destructive/10" : isSelected ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/30")}>
                    <span className={cn("shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold", isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{option.label}</span>
                    <span className="flex-1">{option.text}</span>
                    {showFeedback && isCorrect && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                    {showFeedback && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  </motion.button>
                );
              })}
            </div>
            {isPractice && showResult && currentQuestion.explanation && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 p-3 bg-secondary/50 rounded-lg">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Explanation</p>
                <p className="text-xs leading-relaxed">{currentQuestion.explanation}</p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-border bg-card/80 backdrop-blur-sm sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={currentIndex === 0} onClick={() => goToQuestion(currentIndex - 1)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Prev
          </Button>
          {currentIndex === questions.length - 1 ? (
            <Button size="sm" className="h-8 text-xs" onClick={handleSubmit} disabled={submitting}>
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
  );
};

export default Exam;
