import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RotateCcw, Share2, Trophy, CheckCircle2, XCircle, Clock, Target, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import ShareResultHighlight from "@/components/ShareResultHighlight";
import ResultShareModal from "@/components/ResultShareModal";

const Results = () => {
  const { toast } = useToast();
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [profileName, setProfileName] = useState("");
  const [topicBreakdown, setTopicBreakdown] = useState<Record<string, { correct: number; total: number }>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    if (!user || !sessionId) return;
    const fetchResults = async () => {
      const [{ data: sess }, { data: prof }, { data: hist }] = await Promise.all([
        supabase.from("exam_sessions").select("*").eq("id", sessionId).single(),
        supabase.from("profiles").select("full_name").eq("user_id", user.id).single(),
        supabase.from("user_history").select("*, questions(*)").eq("session_id", sessionId),
      ]);
      if (sess) setSession(sess);
      if (prof?.full_name) setProfileName(prof.full_name);
      if (hist) {
        setHistory(hist);
        const breakdown: Record<string, { correct: number; total: number }> = {};
        hist.forEach((h: any) => {
          const topic = h.questions?.topic || "Unknown";
          if (!breakdown[topic]) breakdown[topic] = { correct: 0, total: 0 };
          breakdown[topic].total++;
          if (h.is_correct) breakdown[topic].correct++;
        });
        setTopicBreakdown(breakdown);
      }
    };
    fetchResults();
  }, [user, sessionId]);

  const handleShare = () => {
    setShowShareModal(true);
  };

  const handleWhatsAppShare = () => {
    if (!session) return;
    const score = Math.round(Number(session.score_percentage) || 0);
    const grade = getGrade(score);
    const text = `🎓 *ROCKCBT Result*\n\nName: ${profileName || "Student"}\nScore: ${score}%\nGrade: ${grade}\n${session.correct_answers}/${session.total_questions} correct\n\nCan you beat me? 🚀\n👉 https://weblines.org`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleFacebookShare = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://weblines.org")}&quote=${encodeURIComponent(`I scored ${Math.round(Number(session?.score_percentage) || 0)}% on ROCKCBT! Can you beat me? 🚀`)}`, "_blank");
  };

  const handleCopyLink = async () => {
    if (!session || !user) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase.from("shared_exams").insert({
      share_code: code,
      creator_id: user.id,
      session_id: sessionId!,
      mode: session.mode,
      subjects: session.subjects,
      examination: session.examination,
      exam_year: session.exam_year,
    } as any);
    const score = Math.round(Number(session.score_percentage) || 0);
    const grade = getGrade(score);
    const shareText = `🎓 ROCKCBT Result\nName: ${profileName || "Student"}\nScore: ${score}%\nGrade: ${grade}\n${session.correct_answers}/${session.total_questions} correct\nCan you beat me? 🚀\n👉 ${window.location.origin}/s/${code}`;
    try {
      await navigator.clipboard.writeText(shareText);
      toast({ title: "Copied! 🔗", description: "Share text copied to clipboard" });
    } catch {
      toast({ title: "Share link", description: `${window.location.origin}/s/${code}` });
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const score = Number(session.score_percentage) || 0;
  const roundedScore = Math.round(score);
  const duration = session.duration_seconds || 0;
  const mins = Math.floor(duration / 60);

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-gradient-to-br from-[#123b73] via-[#1767a5] to-[#10a987] safe-area-top">
      {/* Gradient Header */}
      <div className="mx-auto max-w-2xl px-4 pt-8 pb-5 text-center text-white sm:pt-10">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
          <h1 className="text-2xl font-extrabold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {getHeadline(roundedScore)}
          </h1>
          <p className="text-sm opacity-90">{getSubHeadline(roundedScore)}</p>
        </motion.div>
      </div>

      {/* Session milestone celebration */}
      {session.total_questions >= 10 && (
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="mx-auto max-w-2xl px-3 pb-3 sm:px-4">
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-3 text-center text-white">
            <div className="text-2xl mb-1">{session.total_questions >= 50 ? "🏆" : session.total_questions >= 25 ? "🚀" : "✨"}</div>
            <p className="font-bold">{session.total_questions >= 50 ? "Big practice session!" : session.total_questions >= 25 ? "Great momentum!" : "Practice milestone reached!"}</p>
            <p className="text-sm text-white/85">You completed {session.total_questions} questions this session. Keep building your skills!</p>
          </div>
        </motion.div>
      )}

      {/* Learning XP earned from this completed session */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mx-auto max-w-2xl px-3 pb-3 sm:px-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white backdrop-blur-md">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Learning rewards</p>
            <p className="mt-0.5 text-lg font-extrabold">+{(Number(session.correct_answers) || 0) * 10 + 25} XP</p>
            <p className="text-xs text-white/80">10 XP per correct answer + 25 XP for completing the session</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl">⚡</div>
        </div>
      </motion.div>

      {/* Main Content Card */}
      <div className="mx-auto max-w-2xl px-3 pb-8 sm:px-4">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card className="overflow-hidden rounded-[28px] border-0 shadow-2xl">
            <CardContent className="p-4 pt-6 sm:p-7 sm:pt-8">
              {/* Score Circle */}
              <div className="flex justify-center mb-4">
                <div className="relative inline-flex items-center justify-center w-32 h-32">
                  <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
                    <motion.circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={getScoreColor(roundedScore)}
                      strokeWidth="8" strokeLinecap="round"
                      initial={{ strokeDasharray: "0 264" }}
                      animate={{ strokeDasharray: `${roundedScore * 2.64} 264` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  </svg>
                  <span className="absolute text-3xl font-extrabold">{roundedScore}%</span>
                </div>
              </div>

              <div className="text-center mb-4">
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
                  {session.examination || "Practice"}{session.exam_year ? ` · ${session.exam_year}` : ""}
                </span>
                <p className="text-xs text-muted-foreground mt-1">{(session.subjects || []).join(" · ")}</p>
              </div>

              {/* Weak Topics Message */}
              {Object.keys(topicBreakdown).length > 0 && (
                <WeakTopicsMessage topicBreakdown={topicBreakdown} score={roundedScore} />
              )}

              {/* Action Buttons */}
              <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-center">
                <Button size="sm" className="h-11 w-full gap-2 rounded-xl px-5 text-xs font-semibold sm:h-10 sm:w-auto sm:rounded-full" onClick={() => navigate("/select-subjects?mode=practice")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry Test
                </Button>
                <Button size="sm" className="h-11 w-full gap-2 rounded-xl bg-green-600 px-5 text-xs font-semibold text-white hover:bg-green-700 sm:h-10 sm:w-auto sm:rounded-full" onClick={handleShare}>
                  <Share2 className="h-3.5 w-3.5" /> Share Result
                </Button>
                <Button variant="outline" size="sm" className="h-11 w-full gap-2 rounded-xl px-5 text-xs font-semibold sm:h-10 sm:w-auto sm:rounded-full" onClick={() => navigate("/dashboard")}>
                  <Trophy className="h-3.5 w-3.5" /> Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Row */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }} className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          <Card className="rounded-2xl shadow-lg border-0">
            <CardContent className="p-2.5 text-center sm:p-4">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
              <p className="text-xs text-muted-foreground">Correct</p>
              <p className="text-lg font-bold sm:text-xl">{session.correct_answers}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-lg border-0">
            <CardContent className="p-4 text-center">
              <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
              <p className="text-xs text-muted-foreground">Wrong</p>
              <p className="text-xl font-bold">{session.total_questions - session.correct_answers}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-lg border-0">
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-blue-500" />
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="text-xl font-bold">{mins} min</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Topic Breakdown */}
        {Object.keys(topicBreakdown).length > 0 && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}>
            <Card className="rounded-2xl shadow-lg border-0 mt-4">
              <CardHeader className="pb-2 px-5 pt-5">
                <CardTitle className="text-base font-bold">Topic Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4">
                {Object.entries(topicBreakdown).map(([topic, data]) => {
                  const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                  const status = pct >= 70 ? "Strong" : pct >= 40 ? "Average" : pct === 0 ? "Weak Area" : "Needs Improvement";
                  const statusColor = pct >= 70 ? "text-green-600" : pct >= 40 ? "text-orange-500" : "text-red-500";
                  const barColor = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-orange-400" : "bg-red-500";
                  const icon = pct >= 70 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-red-500" />;

                  return (
                    <div key={topic}>
                      <div className="flex items-center gap-2 mb-0.5">
                        {icon}
                        <span className="text-sm font-semibold flex-1">{topic}</span>
                        <span className="text-xs text-muted-foreground font-medium">{data.correct}/{data.total}</span>
                      </div>
                      <p className={`text-[11px] ${statusColor} font-medium ml-6 mb-1`}>{status}</p>
                      <div className="ml-6 h-2 rounded-full bg-secondary overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${barColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Answer Review */}
        {history.length > 0 && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }}>
            <Card className="rounded-2xl shadow-lg border-0 mt-4">
              <CardHeader className="pb-2 px-5 pt-5">
                <CardTitle className="text-base font-bold">Your Answers {score < 50 ? "😣" : "🎉"}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                {history.map((h: any, idx: number) => {
                  const q = h.questions;
                  const userAnswer = h.selected_answer;
                  const correctAnswer = q?.correct_answer;
                  const userOptionText = q ? q[`option_${userAnswer?.toLowerCase()}`] : null;
                  const correctOptionText = q ? q[`option_${correctAnswer?.toLowerCase()}`] : null;

                  return (
                    <div key={h.id} className="rounded-xl border border-border/50 p-3.5">
                      <div className="flex items-start gap-2 mb-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${h.is_correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {idx + 1}
                        </span>
                        <p className="text-sm font-semibold leading-snug">{q?.question_text || "Question"}</p>
                      </div>

                      {q?.diagram_url && (
                        <img
                          src={q.diagram_url}
                          alt="Question diagram"
                          className="ml-8 mb-2 max-h-64 max-w-[calc(100%-2rem)] rounded-lg border border-border/50 object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      )}

                      {/* User's wrong answer */}
                      {!h.is_correct && userOptionText && (
                        <div className="ml-8 mb-1.5 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2">
                          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <span className="text-xs text-red-700 dark:text-red-400">{userOptionText}</span>
                        </div>
                      )}

                      {/* Correct answer */}
                      <div className="ml-8 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/20 px-3 py-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <span className="text-xs text-green-700 dark:text-green-400">{correctOptionText || correctAnswer}</span>
                        {!h.is_correct && <span className="ml-auto text-[10px] font-semibold text-green-600 bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded-full">Correct Answer</span>}
                      </div>

                      {/* Explanation */}
                      {q?.explanation && (
                        <p className="ml-8 mt-2 text-[11px] text-muted-foreground leading-relaxed italic">💡 {q.explanation}</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="h-4 sm:h-8" />
      </div>

      <ShareResultHighlight onShare={handleShare} />
      <ResultShareModal
        open={showShareModal}
        onOpenChange={setShowShareModal}
        profileName={profileName}
        score={roundedScore}
        grade={getGrade(roundedScore)}
        correct={session.correct_answers}
        total={session.total_questions}
        onWhatsApp={handleWhatsAppShare}
        onFacebook={handleFacebookShare}
        onCopyLink={handleCopyLink}
      />
    </div>
  );
};

function getGrade(score: number) {
  return score >= 70 ? "A" : score >= 60 ? "B" : score >= 50 ? "C" : score >= 40 ? "D" : "F";
}

function getScoreColor(score: number) {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function getHeadline(score: number) {
  if (score >= 70) return "Excellent! 🔥";
  if (score >= 40) return "Keep Going! 👍";
  return "Don't Give Up! 😤";
}

function getSubHeadline(score: number) {
  if (score >= 70) return "Outstanding performance!";
  if (score >= 40) return "You're getting there!";
  return "You Can Do Better!";
}

function WeakTopicsMessage({ topicBreakdown, score }: { topicBreakdown: Record<string, { correct: number; total: number }>; score: number }) {
  if (score >= 70) return null;
  const weakTopics = Object.entries(topicBreakdown)
    .filter(([, d]) => d.total > 0 && (d.correct / d.total) < 0.5)
    .map(([t]) => t)
    .slice(0, 3);
  if (weakTopics.length === 0) return null;
  return (
    <p className="text-center text-sm text-muted-foreground mt-2">
      You need more practice in{" "}
      {weakTopics.map((t, i) => (
        <span key={t}>
          {i > 0 && (i === weakTopics.length - 1 ? " and " : ", ")}
          <strong>{t}</strong>
        </span>
      ))}.
    </p>
  );
}

export default Results;
