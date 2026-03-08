import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Clock, ArrowLeft, ArrowRight, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ExamQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
}

interface ExamData {
  id: string;
  title: string;
  instructions: string | null;
  duration_minutes: number | null;
  questions: ExamQuestion[];
  expires_at: string | null;
}

const TakeExam = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [started, setStarted] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!code) return;
      const { data } = await supabase.from("custom_exams").select("*").eq("share_code", code).single();
      if (!data) { setLoading(false); return; }
      
      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }
      
      setExam({
        id: data.id,
        title: data.title,
        instructions: data.instructions,
        duration_minutes: data.duration_minutes,
        questions: (data.questions as any) || [],
        expires_at: data.expires_at,
      });
      setTimeLeft((data.duration_minutes || 60) * 60);
      setLoading(false);
    };
    load();
  }, [code]);

  // Timer
  useEffect(() => {
    if (!started || submitted) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [started, submitted]);

  const handleSubmit = async () => {
    if (!exam || submitted) return;
    setSubmitted(true);
    let correct = 0;
    exam.questions.forEach((q, i) => {
      if (answers[i] === q.correct_answer) correct++;
    });
    setScore(correct);

    await supabase.from("custom_exam_results").insert({
      exam_id: exam.id,
      student_name: studentName || "Anonymous",
      score: correct,
      total_questions: exam.questions.length,
      answers: answers as any,
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-bold">Exam Link Expired</h2>
          <p className="text-sm text-muted-foreground">This exam link has expired and is no longer available.</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">Exam Not Found</h2>
          <p className="text-sm text-muted-foreground">This exam link is invalid.</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  // Results view
  if (submitted) {
    const pct = exam.questions.length > 0 ? Math.round((score / exam.questions.length) * 100) : 0;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md w-full text-center space-y-5">
          <div className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto ${pct >= 50 ? "bg-[hsl(var(--success))]/10" : "bg-destructive/10"}`}>
            {pct >= 50 ? <CheckCircle2 className="h-10 w-10 text-[hsl(var(--success))]" /> : <XCircle className="h-10 w-10 text-destructive" />}
          </div>
          <h2 className="text-2xl font-bold">{pct}%</h2>
          <p className="text-sm text-muted-foreground">{studentName}, you scored {score}/{exam.questions.length}</p>
          <p className="font-bold">{pct >= 70 ? "Excellent! 🎉" : pct >= 50 ? "Good job! 👍" : "Keep studying! 💪"}</p>
          
          {/* Review answers */}
          <div className="text-left space-y-2 max-h-60 overflow-y-auto">
            {exam.questions.map((q, i) => {
              const isCorrect = answers[i] === q.correct_answer;
              return (
                <div key={i} className={`p-2.5 rounded-lg border text-xs ${isCorrect ? "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/20" : "bg-destructive/5 border-destructive/20"}`}>
                  <p className="font-medium">{i + 1}. {q.question_text}</p>
                  <p className={isCorrect ? "text-[hsl(var(--success))]" : "text-destructive"}>
                    {isCorrect ? "✓ Correct" : `✗ Your answer: ${answers[i] || "—"} · Correct: ${q.correct_answer}`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Signup CTA for guests */}
          <Card className="border-primary/30 bg-primary/5 text-left">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">Enjoy more with Weblines CBT!</p>
                  <p className="text-[11px] text-muted-foreground">Create a free account to unlock powerful features</p>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-primary shrink-0" /> Practice 25,000+ real JAMB, WAEC & NECO questions</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-primary shrink-0" /> Get instant AI Tutor explanations 24/7</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-primary shrink-0" /> Track your progress & compete with friends</li>
              </ul>
              <Button className="w-full h-10 text-sm gap-1.5" onClick={() => navigate("/auth")}>
                Create Free Account <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Button variant="outline" size="sm" onClick={() => navigate("/")}>Back to Home</Button>
        </motion.div>
      </div>
    );
  }

  // Start screen
  if (!started) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full space-y-5">
          <h1 className="text-xl font-bold text-center">{exam.title}</h1>
          {exam.instructions && <p className="text-sm text-muted-foreground text-center">{exam.instructions}</p>}
          <Card className="border-border/50">
            <CardContent className="p-4 space-y-1 text-sm">
              <p>📝 {exam.questions.length} questions</p>
              <p>⏱ {exam.duration_minutes} minutes</p>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Enter your name" className="h-11 text-center" />
          </div>
          <Button className="w-full h-11" onClick={() => setStarted(true)} disabled={!studentName.trim()}>
            Start Exam
          </Button>
        </motion.div>
      </div>
    );
  }

  // Exam view
  const q = exam.questions[currentIdx];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold">{exam.title}</span>
          <div className={cn("flex items-center gap-1 text-xs font-mono", timeLeft < 300 && "text-destructive")}>
            <Clock className="h-3.5 w-3.5" />
            {formatTime(timeLeft)}
          </div>
        </div>
        <Progress value={((currentIdx + 1) / exam.questions.length) * 100} className="h-0.5" />
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 py-5 w-full">
        <p className="text-[10px] text-muted-foreground mb-2">Question {currentIdx + 1} of {exam.questions.length}</p>
        <p className="text-sm font-medium mb-4">{q.question_text}</p>

        <div className="space-y-2">
          {(["A", "B", "C", "D"] as const).map(label => {
            const optionText = q[`option_${label.toLowerCase()}` as keyof ExamQuestion];
            const selected = answers[currentIdx] === label;
            return (
              <button
                key={label}
                onClick={() => setAnswers({ ...answers, [currentIdx]: label })}
                className={cn(
                  "w-full text-left p-3 rounded-xl border text-sm transition-all flex items-center gap-3",
                  selected ? "border-primary bg-primary/5 font-medium" : "border-border/50 hover:border-primary/30"
                )}
              >
                <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0", selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                  {label}
                </span>
                {optionText}
              </button>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border bg-card/80 p-4">
        <div className="max-w-3xl mx-auto flex justify-between">
          <Button variant="outline" size="sm" disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          {currentIdx < exam.questions.length - 1 ? (
            <Button size="sm" onClick={() => setCurrentIdx(currentIdx + 1)}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} className="gap-1">
              <Send className="h-4 w-4" /> Submit
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default TakeExam;
