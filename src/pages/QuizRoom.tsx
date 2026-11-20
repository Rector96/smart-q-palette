import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Copy, Share2, Play, Trophy, Clock, AlertTriangle, Crown, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Participant {
  id: string;
  user_id: string;
  display_name: string;
  score: number;
  is_connected: boolean;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation?: string;
  exam_hint?: string;
}

const MOTIVATIONAL = [
  "🔥 You're on fire!",
  "🎯 Keep going!",
  "💪 Stay focused!",
  "⚡ Quick reflexes!",
  "🧠 Smart thinking!",
];

const QuizRoom = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [room, setRoom] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);

  // Quiz state
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [quizEnded, setQuizEnded] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const answerTimeRef = useRef(0);

  // Load room
  useEffect(() => {
    if (!roomCode || !user) return;
    const loadRoom = async () => {
      const { data, error } = await supabase
        .from("quiz_rooms")
        .select("*")
        .eq("room_code", roomCode)
        .single();

      if (error || !data) {
        toast({ title: "Room not found", variant: "destructive" });
        navigate("/live-quiz");
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast({ title: "This quiz session has expired", variant: "destructive" });
        navigate("/live-quiz");
        return;
      }

      setRoom(data);
      setIsHost(data.host_id === user.id);
      setCurrentQ(data.current_question_index || 0);
      if (data.status === "ended") setQuizEnded(true);
      if (data.status === "live") {
        setTimeLeft(data.time_per_question);
        answerTimeRef.current = 0;
      }
      setLoading(false);
    };
    loadRoom();
  }, [roomCode, user]);

  // Load participants
  useEffect(() => {
    if (!room) return;
    const loadParticipants = async () => {
      const { data } = await supabase.from("quiz_participants").select("*").eq("room_id", room.id);
      if (data) setParticipants(data);
    };
    loadParticipants();

    // Real-time participants
    const channel = supabase.channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_participants", filter: `room_id=eq.${room.id}` }, () => loadParticipants())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quiz_rooms", filter: `id=eq.${room.id}` }, (payload) => {
        const updated = payload.new as any;
        setRoom(updated);
        if (updated.status === "live" && !quizEnded) {
          setCurrentQ(updated.current_question_index || 0);
          setSelectedOption(null);
          setAnswered(false);
          setShowResult(false);
          setTimeLeft(updated.time_per_question);
          answerTimeRef.current = 0;
        }
        if (updated.status === "ended") setQuizEnded(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_answers", filter: `room_id=eq.${room.id}` }, () => {
        // Reload scores
        loadScores();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  const loadScores = async () => {
    if (!room) return;
    const { data } = await supabase.from("quiz_participants").select("user_id, score, display_name").eq("room_id", room.id);
    if (data) {
      const s: Record<string, number> = {};
      data.forEach(p => { s[p.user_id] = p.score; });
      setScores(s);
      setParticipants(prev => prev.map(p => ({ ...p, score: data.find(d => d.user_id === p.user_id)?.score || p.score })));
    }
  };

  // Timer
  useEffect(() => {
    if (room?.status !== "live" || quizEnded || answered) return;
    if (timeLeft <= 0) {
      handleAutoSubmit();
      return;
    }
    timerRef.current = setTimeout(() => {
      setTimeLeft(t => t - 1);
      answerTimeRef.current += 1;
    }, 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timeLeft, room?.status, quizEnded, answered]);

  // Anti-cheating: tab switch detection
  useEffect(() => {
    if (room?.status !== "live") return;
    const handleVisibility = () => {
      if (document.hidden) {
        setTabWarning(true);
        toast({ title: "⚠️ Warning", description: "Do not leave the quiz screen!", variant: "destructive" });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [room?.status]);

  const questions: QuizQuestion[] = room?.questions || [];
  const currentQuestion = questions[currentQ];

  const handleAutoSubmit = useCallback(async () => {
    if (!user || !room || answered) return;
    setAnswered(true);
    setShowResult(true);

    await supabase.from("quiz_answers").insert({
      room_id: room.id,
      user_id: user.id,
      question_index: currentQ,
      selected_option: null,
      time_taken: room.time_per_question,
      is_correct: false,
    });

    // Auto advance after showing result
    if (isHost) {
      setTimeout(() => advanceQuestion(), 3000);
    }
  }, [user, room, currentQ, answered, isHost]);

  const handleAnswer = async (option: string) => {
    if (!user || !room || answered) return;
    setSelectedOption(option);
    setAnswered(true);
    setShowResult(true);

    const isCorrect = option === currentQuestion.correct_answer;
    const timeTaken = answerTimeRef.current;
    const speedBonus = Math.max(0, Math.floor((room.time_per_question - timeTaken) / room.time_per_question * 5));
    const points = isCorrect ? 10 + speedBonus : 0;

    await supabase.from("quiz_answers").insert({
      room_id: room.id,
      user_id: user.id,
      question_index: currentQ,
      selected_option: option,
      time_taken: timeTaken,
      is_correct: isCorrect,
    });

    if (points > 0) {
      const currentScore = participants.find(p => p.user_id === user.id)?.score || 0;
      await supabase.from("quiz_participants").update({ score: currentScore + points }).eq("room_id", room.id).eq("user_id", user.id);
    }

    if (isHost) {
      setTimeout(() => advanceQuestion(), 3000);
    }
  };

  const advanceQuestion = async () => {
    if (!room) return;
    const nextQ = currentQ + 1;
    if (nextQ >= questions.length) {
      await supabase.from("quiz_rooms").update({ status: "ended" }).eq("id", room.id);
    } else {
      await supabase.from("quiz_rooms").update({ current_question_index: nextQ, status: "live" }).eq("id", room.id);
    }
  };

  const handleStart = async () => {
    if (!room) return;
    await supabase.from("quiz_rooms").update({ status: "live", current_question_index: 0 }).eq("id", room.id);
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode || "");
      setCopied(true);
      toast({ title: "Room code copied!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Room code", description: roomCode });
    }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}/q/${roomCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join my quiz!", url }); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!" });
      } catch {
        toast({ title: "Share link", description: url });
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  // ENDED
  if (quizEnded) {
    const sorted = [...participants].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen bg-background px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-7 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15"><Trophy className="h-9 w-9 text-primary" /></div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Battle finished</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Quiz Complete!</h1>
            <p className="mt-1 text-sm text-muted-foreground">Here is how everyone performed</p>
            <div className="mt-4 flex justify-center gap-5 text-xs text-muted-foreground"><span>{participants.length} players</span><span>{questions.length} questions</span></div>
          </div>
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <Card key={p.id} className={cn("overflow-hidden rounded-2xl border-border/60 shadow-sm transition-transform", i === 0 && "border-primary/50 bg-primary/5 ring-1 ring-primary/20")}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0", i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
                    {i === 0 ? <Crown className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.display_name} {p.user_id === user?.id && "(You)"}</p>
                  </div>
                  <p className="text-sm font-bold text-primary">{p.score} pts</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button className="h-12 w-full rounded-xl text-base font-bold shadow-md" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // WAITING ROOM
  if (room.status === "waiting") {
    return (
      <div className="min-h-screen bg-background px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl space-y-6">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/live-quiz")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="text-center space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 shadow-inner">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">Waiting Room</h2>
            <p className="text-sm text-muted-foreground capitalize">{room.subject} <span className="mx-1">·</span> {questions.length} questions <span className="mx-1">·</span> {room.time_per_question}s per question</p>
          </div>

          {/* Room Code */}
          <Card className="overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-primary/10 to-card shadow-sm">
            <CardContent className="space-y-3 p-6 text-center">
              <p className="text-xs text-muted-foreground font-medium">Room Code</p>
              <p className="text-4xl font-black tracking-[0.35em] text-primary sm:text-5xl">{roomCode}</p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="h-10 gap-2 rounded-xl px-4 text-xs" onClick={copyRoomCode}>
                  <Copy className="h-3 w-3" /> {copied ? "Copied!" : "Copy Code"}
                </Button>
                <Button variant="outline" size="sm" className="h-10 gap-2 rounded-xl px-4 text-xs" onClick={shareLink}>
                  <Share2 className="h-3 w-3" /> Share Link
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Participants */}
          <div>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Players in the room</p><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{participants.length} joined</span></div>
            <div className="space-y-1.5">
              {participants.map(p => (
                <Card key={p.id} className="rounded-xl border-border/60 shadow-sm">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">
                      {p.display_name[0]}
                    </div>
                    <p className="text-sm font-medium flex-1">{p.display_name}</p>
                    {p.user_id === room.host_id && <span className="text-[10px] text-primary font-semibold">HOST</span>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {isHost && (
            <Button className="h-12 w-full gap-2 rounded-xl text-base font-bold shadow-md" onClick={handleStart} disabled={participants.length < 1}>
              <Play className="h-4 w-4" /> Start Quiz
            </Button>
          )}
          {!isHost && <p className="text-center text-xs text-muted-foreground">Waiting for host to start...</p>}
        </div>
      </div>
    );
  }

  // LIVE QUIZ
  if (!currentQuestion) return null;
  const progress = ((currentQ + 1) / questions.length) * 100;
  const timerPercent = room.time_per_question > 0 ? (timeLeft / room.time_per_question) * 100 : 0;
  const sorted = [...participants].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Tab warning */}
      <AnimatePresence>
        {tabWarning && (
          <motion.div initial={{ y: -50 }} animate={{ y: 0 }} exit={{ y: -50 }} className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground p-2 text-center text-xs font-semibold flex items-center justify-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> Do not leave the quiz screen!
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive-foreground" onClick={() => setTabWarning(false)}>Dismiss</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-border/70 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold tracking-wide text-foreground">QUESTION {currentQ + 1}<span className="font-medium text-muted-foreground"> / {questions.length}</span></span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary sm:w-32">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className={cn("h-3.5 w-3.5", timeLeft <= 5 ? "text-destructive" : "text-muted-foreground")} />
            <span className={cn("text-sm font-bold tabular-nums", timeLeft <= 5 && "text-destructive")}>{timeLeft}s</span>
          </div>
        </div>
        {/* Timer bar */}
        <div className="mx-auto mt-2 max-w-2xl">
          <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
            <motion.div className={cn("h-full rounded-full", timeLeft <= 5 ? "bg-destructive" : "bg-primary")} animate={{ width: `${timerPercent}%` }} transition={{ duration: 0.5 }} />
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-5 px-4 py-6 sm:py-8">
        <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:rounded-3xl sm:p-7"><p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Your question</p><p className="text-base font-semibold leading-relaxed sm:text-lg">{currentQuestion.question_text}</p></div>
        </motion.div>

        <div className="space-y-2">
          {["A", "B", "C", "D"].map(opt => {
            const optKey = `option_${opt.toLowerCase()}` as keyof QuizQuestion;
            const text = currentQuestion[optKey] as string;
            const isSelected = selectedOption === opt;
            const isCorrect = opt === currentQuestion.correct_answer;
            let optionClass = "border-border/50 hover:border-primary/30";
            if (showResult) {
              if (isCorrect) optionClass = "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10";
              else if (isSelected && !isCorrect) optionClass = "border-destructive bg-destructive/10";
            } else if (isSelected) {
              optionClass = "border-primary bg-primary/5";
            }

            return (
              <Card key={opt} role="button" tabIndex={answered ? -1 : 0} aria-disabled={answered} className={cn("cursor-pointer rounded-2xl transition-all duration-200 active:scale-[0.99] sm:rounded-2xl", optionClass, answered && "pointer-events-none")} onClick={() => handleAnswer(opt)}>
                <CardContent className="flex min-h-[64px] items-center gap-4 p-4 sm:p-5">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold", showResult && isCorrect ? "bg-[hsl(var(--success))] text-white" : showResult && isSelected ? "bg-destructive text-white" : "bg-secondary")}>
                    {showResult && isCorrect ? <CheckCircle2 className="h-4 w-4" /> : showResult && isSelected ? <XCircle className="h-4 w-4" /> : opt}
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{text}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Result feedback */}
        <AnimatePresence>
          {showResult && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              {selectedOption === currentQuestion.correct_answer ? (
                <div className="rounded-2xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/10 p-4">
                  <p className="text-xs font-semibold text-[hsl(var(--success))]">✅ Correct! {currentQuestion.exam_hint || MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)]}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
                  <p className="text-xs font-semibold text-destructive">❌ Not quite. {currentQuestion.exam_hint || `The correct answer is ${currentQuestion.correct_answer}.`}</p>
                </div>
              )}

              {/* Mini leaderboard */}
              <Card className="border-border/50 rounded-xl">
                <CardContent className="p-2">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">Live Scores</p>
                  {sorted.slice(0, 5).map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between py-0.5">
                      <span className="text-[11px] font-medium">{i + 1}. {p.display_name}</span>
                      <span className="text-[11px] font-bold text-primary">{p.score}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {!isHost && <p className="text-[10px] text-muted-foreground text-center">Waiting for next question...</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default QuizRoom;
