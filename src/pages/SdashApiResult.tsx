import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RotateCcw, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ResultQuestion = {
  position?: number;
  question?: string;
  question_text?: string;
  options?: Record<string, string>;
  selectedAnswer?: string | null;
  selected_answer?: string | null;
  correctAnswer?: string;
  correct_answer?: string;
  solution?: string | null;
  timeSpentSeconds?: number;
  time_spent_seconds?: number;
};

type ExamResult = {
  examination?: string;
  subject?: string;
  examYear?: number | string;
  exam_year?: number | string;
  totalQuestions?: number;
  total_questions?: number;
  correctCount?: number;
  correct_count?: number;
  score?: number;
  durationSeconds?: number;
  duration_seconds?: number;
  questions?: ResultQuestion[];
  result?: ExamResult;
  data?: ExamResult;
};

const SdashApiResult = () => {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadResult = async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("sdashapi-result", {
        body: { sessionId },
      });

      if (!active) return;

      if (error || !data?.ok) {
        toast({
          title: "Unable to load result",
          description: data?.message || error?.message || "Please try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const payload = (data.result || data.data || data) as ExamResult;
      setResult(payload);
      setLoading(false);
    };

    void loadResult();
    return () => { active = false; };
  }, [sessionId, toast]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your result...
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="min-h-screen bg-background p-5">
        <div className="mx-auto max-w-lg pt-16">
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <p className="font-semibold">Result unavailable</p>
              <p className="text-sm text-muted-foreground">
                We could not retrieve this exam result. Make sure the exam was submitted.
              </p>
              <Button className="w-full" onClick={() => navigate("/past-questions")}>Back to Past Questions</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const questions = result.questions || [];
  const total = Number(result.totalQuestions ?? result.total_questions ?? questions.length);
  const correct = Number(result.correctCount ?? result.correct_count ?? 0);
  const score = Number(result.score ?? (total > 0 ? (correct / total) * 100 : 0));
  const percentage = Math.max(0, Math.min(100, score));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm font-bold">Past Questions Result</p>
            <p className="text-[10px] text-muted-foreground">
              {[result.examination, result.subject, result.examYear ?? result.exam_year].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <Card className="overflow-hidden border-border/50 shadow-sm">
          <CardContent className="space-y-4 p-6 text-center">
            <Trophy className="mx-auto h-9 w-9 text-primary" />
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Your Score</p>
              <p className="mt-1 text-5xl font-bold tabular-nums">{Math.round(percentage)}%</p>
            </div>
            <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div>
                <p className="text-2xl font-bold">{correct}</p>
                <p className="text-[10px] text-muted-foreground">Correct</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.max(0, total - correct)}</p>
                <p className="text-[10px] text-muted-foreground">Incorrect / Blank</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Answer Review</h2>
          <span className="text-xs text-muted-foreground">{questions.length} questions</span>
        </div>

        {questions.map((question, index) => {
          const selected = String(question.selectedAnswer ?? question.selected_answer ?? "").toUpperCase();
          const answer = String(question.correctAnswer ?? question.correct_answer ?? "").toUpperCase();
          const isCorrect = question.is_correct ?? (selected !== "" && selected === answer);
          const options = question.options || {};
          const questionText = question.question || question.question_text || `Question ${index + 1}`;

          return (
            <Card key={question.position ?? index} className="border-border/50">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-6">
                    {index + 1}. {questionText}
                  </p>
                  {isCorrect
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    : <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                </div>

                <div className="space-y-2">
                  {["A", "B", "C", "D", "E"].map((letter) => {
                    const optionText = options[letter] ?? options[letter.toLowerCase()];
                    if (!optionText) return null;

                    const isAnswer = letter === answer;
                    const isSelected = letter === selected;

                    return (
                      <div
                        key={letter}
                        className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                          isAnswer
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : isSelected
                              ? "border-destructive/40 bg-destructive/5"
                              : "border-border/50"
                        }`}
                      >
                        <span className="font-bold">{letter}.</span>
                        <span className="flex-1">{optionText}</span>
                        {isAnswer && <span className="shrink-0 font-semibold text-emerald-600">Correct</span>}
                        {isSelected && !isAnswer && <span className="shrink-0 font-semibold text-destructive">Your answer</span>}
                      </div>
                    );
                  })}
                </div>

                {!selected && <p className="text-xs text-muted-foreground">You did not answer this question.</p>}

                {question.solution && (
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="mb-1 text-xs font-semibold">Explanation</p>
                    <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{question.solution}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex flex-col gap-2 pb-6 sm:flex-row">
          <Button className="flex-1" onClick={() => navigate("/past-questions")}>
            <RotateCcw className="mr-2 h-4 w-4" /> Practise Again
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
};

export default SdashApiResult;
