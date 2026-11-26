import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { SdashApiQuestion } from "@/lib/sdashapi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Flag, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExamRouteState {
  questions?: SdashApiQuestion[];
  examination?: string;
  subject?: string;
  year?: number;
  durationSeconds?: number;
}

const OPTIONS = ["A", "B", "C", "D", "E"];

const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

const SdashApiExam = () => {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const routeState = (location.state || {}) as ExamRouteState;
  const storedState = useMemo<ExamRouteState>(() => {
    if (routeState.questions?.length) return routeState;
    try {
      const saved = sessionStorage.getItem(`sdashapi-session-${sessionId}`);
      return saved ? JSON.parse(saved) as ExamRouteState : {};
    } catch {
      return {};
    }
  }, [routeState, sessionId]);

  const questions = storedState.questions || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(storedState.durationSeconds || 0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submittedRef = useRef(false);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isTimed = (storedState.durationSeconds || 0) > 0;

  const submitExam = useCallback(async () => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);

    try {
      const payload = questions.map((question, index) => ({
        position: question.position || index + 1,
        selectedAnswer: answers[question.position || index + 1] || null,
        timeSpentSeconds: 0,
      }));

      const { data, error } = await supabase.functions.invoke("sdashapi-submit", {
        body: { sessionId, answers: payload },
      });

      if (error || !data?.ok) {
        submittedRef.current = false;
        setSubmitting(false);
        toast({
          title: "Submission failed",
          description: data?.message || error?.message || "Your answers could not be submitted. Please try again.",
          variant: "destructive",
        });
        return;
      }

      try {
        sessionStorage.removeItem(`sdashapi-session-${sessionId}`);
      } catch {
        // The result page does not depend on local question storage.
      }

      navigate(`/past-questions/result/${sessionId}`, { replace: true });
    } catch (error) {
      submittedRef.current = false;
      setSubmitting(false);
      toast({
        title: "Connection error",
        description: error instanceof Error ? error.message : "Please check your connection and try again.",
        variant: "destructive",
      });
    }
  }, [answers, navigate, questions, sessionId, submitting, toast]);

  useEffect(() => {
    if (!isTimed || submitting || submittedRef.current) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isTimed, submitting]);

  useEffect(() => {
    if (isTimed && remainingSeconds === 0 && !submitting && !submittedRef.current) {
      void submitExam();
    }
  }, [isTimed, remainingSeconds, submitting, submitExam]);

  if (!questions.length) {
    return (
      <main className="min-h-screen bg-background p-5">
        <div className="mx-auto max-w-lg pt-16 text-center">
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="font-semibold">Exam session unavailable</p>
              <p className="text-sm text-muted-foreground">
                The question list could not be restored. Please start a new past-question session.
              </p>
              <Button className="w-full" onClick={() => navigate("/past-questions")}>Back to Past Questions</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const selectedAnswer = answers[currentQuestion.position || currentIndex + 1];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {storedState.examination || "Past Questions"} · {storedState.subject || "Exam"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {storedState.year || ""} · Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          {isTimed && (
            <div className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold tabular-nums ${remainingSeconds <= 60 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              <Clock className="h-4 w-4" />
              {formatTime(remainingSeconds)}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{answeredCount} of {questions.length} answered</span>
          <span>{Math.round((answeredCount / questions.length) * 100)}% completed</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Question {currentIndex + 1}
              </span>
              {selectedAnswer && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Answer selected
                </span>
              )}
            </div>

            <div className="whitespace-pre-wrap text-sm font-medium leading-7 sm:text-base">
              {currentQuestion.question}
            </div>

            {currentQuestion.image && (
              <img
                src={currentQuestion.image}
                alt="Question illustration"
                className="max-h-72 max-w-full rounded-lg border border-border object-contain"
                loading="lazy"
              />
            )}

            <div className="space-y-3">
              {OPTIONS.map((option) => {
                const optionText =
                  currentQuestion.options?.[option] ??
                  currentQuestion.options?.[option.toLowerCase()];
                if (!optionText) return null;

                const isSelected = selectedAnswer === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers((previous) => ({
                      ...previous,
                      [currentQuestion.position || currentIndex + 1]: option,
                    }))}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}>
                      {option}
                    </span>
                    <span className="pt-1 text-sm leading-6">{optionText}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Question Navigator</p>
              <p className="text-[10px] text-muted-foreground">Tap a number to move</p>
            </div>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {questions.map((question, index) => {
                const position = question.position || index + 1;
                const isAnswered = Boolean(answers[position]);
                return (
                  <button
                    key={position}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    aria-label={`Go to question ${index + 1}`}
                    className={`h-9 rounded-lg border text-xs font-semibold transition-colors ${
                      currentIndex === index
                        ? "border-primary bg-primary text-primary-foreground"
                        : isAnswered
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2 pb-5">
          <Button
            variant="outline"
            disabled={currentIndex === 0 || submitting}
            onClick={() => setCurrentIndex((index) => index - 1)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Previous
          </Button>

          {currentIndex < questions.length - 1 ? (
            <Button onClick={() => setCurrentIndex((index) => index + 1)} disabled={submitting}>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setConfirmSubmit(true)} disabled={submitting}>
              <Send className="mr-2 h-4 w-4" /> Submit Exam
            </Button>
          )}
        </div>

        {confirmSubmit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-sm shadow-xl">
              <CardContent className="space-y-4 p-5">
                <h2 className="font-bold">Submit your exam?</h2>
                <p className="text-sm text-muted-foreground">
                  You have answered {answeredCount} out of {questions.length} questions.
                  {answeredCount < questions.length ? " Unanswered questions will be submitted as blank." : ""}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirmSubmit(false)} disabled={submitting}>
                    Continue Exam
                  </Button>
                  <Button className="flex-1" onClick={() => void submitExam()} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {isTimed && remainingSeconds <= 60 && remainingSeconds > 0 && (
          <p className="text-center text-xs font-medium text-destructive">
            <Flag className="mr-1 inline h-3.5 w-3.5" /> Time is almost up.
          </p>
        )}
      </main>
    </div>
  );
};

export default SdashApiExam;
