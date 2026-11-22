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
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceCommitted, setAdvanceCommitted] = useState(false);
  const [revealUntil, setRevealUntil] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());

  // Quiz state
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [privateAnswer, setPrivateAnswer] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [quizEnded, setQuizEnded] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const answerTimeRef = useRef(0);

  useEffect(() => {
    if (!revealUntil) return;
    const tick = () => setClockNow(Date.now());
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [revealUntil]);

  useEffect(() => {
    setRevealUntil(0);
    setAdvanceCommitted(false);
  }, [currentQ]);

  const revealRemaining = Math.max(0, Math.ceil((revealUntil - clockNow) / 1000));

  // Load the sanitized room state from the trusted Live Quiz backend.
  const refreshRoom = useCallback(async () => {
    if (!roomCode || !user) return;
    const { data, error } = await supabase.functions.invoke("live-quiz", {
      body: { action: "get", room_code: roomCode },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const nextRoom = data?.room;
    if (!nextRoom) throw new Error("Quiz room not found.");
    setRoom(nextRoom);
    setIsHost(nextRoom.host_id === user.id);
    setCurrentQ(nextRoom.current_question_index || 0);
    setParticipants(data.participants || []);
    setPrivateAnswer(data.my_answer || null);
    if (nextRoom.status === "ended") setQuizEnded(true);
    else setQuizEnded(false);
    if (nextRoom.status === "live") {
      const startedAt = nextRoom.question_started_at ? new Date(nextRoom.question_started_at).getTime() : Date.now();
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setTimeLeft(Math.max(0, nextRoom.time_per_question - elapsed));
      setSelectedOption(data.my_answer?.selected_option || null);
      setAnswered(Boolean(data.my_answer));
      setShowResult(Boolean(data.my_answer));
    }
    setLoading(false);
  }, [roomCode, user]);

  useEffect(() => {
    if (!roomCode || !user) return;
    refreshRoom().catch((err: any) => {
      toast({ title: "Unable to load quiz", description: err.message || "Please try again.", variant: "destructive" });
      navigate("/live-quiz");
    });
  }, [roomCode, user, refreshRoom]);
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quiz_rooms", filter: `id=eq.${room.id}` }, () => {
        refreshRoom().catch(() => {});
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_answers", filter: `room_id=eq.${room.id}` }, () => {
        // Reload scores
        loadScores();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id, refreshRoom]);

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
  const currentQuestionBase = questions[currentQ];
  const currentQuestion = currentQuestionBase ? {
    ...currentQuestionBase,
    correct_answer: privateAnswer?.correct_answer,
    exam_hint: privateAnswer?.exam_hint,
    explanation: privateAnswer?.explanation,
  } : undefined;

  const submitAnswer = async (option: string | null) => {
    if (!user || !room || answered) return;
    setAnswered(true);
    setSelectedOption(option);
    try {
      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: {
          action: "submit",
          room_id: room.id,
          question_index: currentQ,
          selected_option: option,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPrivateAnswer({
        ...(data?.result || {}),
        selected_option: option,
      });
      setShowResult(true);
      if (isHost) setRevealUntil(Date.now() + 3000);
    } catch (err: any) {
      setAnswered(false);
      setSelectedOption(null);
      toast({ title: "Answer not submitted", description: err.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleAutoSubmit = useCallback(async () => {
    if (answered) return;
    await submitAnswer(null);
  }, [answered, user, room, currentQ, isHost]);

  const handleAnswer = async (option: string) => {
    await submitAnswer(option);
  };

  const advanceQuestion = async () => {
    if (!room || !isHost || isAdvancing || !answered || revealRemaining > 0) return;
    setIsAdvancing(true);
    try {
      if (!advanceCommitted) {
        const { data, error } = await supabase.functions.invoke("live-quiz", {
          body: { action: "advance", room_id: room.id },
        });
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Please try again.");
        }
        // The server has advanced. Never issue a second advance if refreshing the
        // client state fails; subsequent clicks only retry the room refresh.
        setAdvanceCommitted(true);
      }

      try {
        await refreshRoom();
        setAdvanceCommitted(false);
      } catch (refreshError: any) {
        toast({
          title: "Question advanced; refresh needed",
          description: refreshError?.message || "The next question is ready. Tap Refresh question to reload it.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Unable to advance", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleStart = async () => {
    if (!room || !isHost) return;
    const { data, error } = await supabase.functions.invoke("live-quiz", {
      body: { action: "start", room_id: room.id },
    });
    if (error || data?.error) {
      toast({ title: "Unable to start quiz", description: data?.error || error?.message || "Please try again.", variant: "destructive" });
      return;
    }
    await refreshRoom();
  };

  const [rematchLoading, setRematchLoading] = useState(false);

  const handleRematch = async () => {
    if (!room || !user || !isHost || rematchLoading) return;
    setRematchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("live-quiz", {
        body: { action: "rematch", room_id: room.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const nextCode = data?.room?.room_code;
      if (!nextCode) throw new Error("The rematch room could not be created.");
      const inviteUrl = `${window.location.origin}/q/${nextCode}`;
      toast({ title: "Rematch room created", description: "Share the new room code with everyone from the last game." });
      if (navigator.share) {
        try { await navigator.share({ title: "Rematch challenge!", text: `Join our rematch with code ${nextCode}`, url: inviteUrl }); } catch {}
      }
      navigate(`/quiz-room/${nextCode}`);
    } catch (error: any) {
      toast({ title: "Could not start rematch", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setRematchLoading(false);
    }
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
    const winner = sorted[0];
    const myRank = sorted.findIndex((p) => p.user_id === user?.id) + 1;
    return (
      <div className="min-h-screen bg-background px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-7 text-center shadow-sm">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15"><Trophy className="h-9 w-9 text-primary" /></div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Battle finished</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Quiz Complete!</h1>
            <p className="mt-1 text-sm text-muted-foreground">Here is how everyone performed</p>
            {winner && (
              <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-primary/20 bg-background/70 p-4">
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10"><Crown className="h-5 w-5 text-primary" /></div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Quiz champion</p>
                <p className="mt-1 text-lg font-extrabold">{winner.display_name}{winner.user_id === user?.id ? " · You" : ""}</p>
                <p className="text-sm font-semibold text-muted-foreground">{winner.score} points</p>
                {myRank > 0 && <p className="mt-3 border-t border-border/60 pt-3 text-xs font-semibold text-foreground">Your finish: #{myRank} of {participants.length}</p>}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs">
              <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 font-semibold text-foreground">{participants.length} players</span>
              <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 font-semibold text-foreground">{questions.length} questions</span>
              <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 font-semibold text-foreground">Final leaderboard</span>
            </div>
          </div>
          <div className="space-y-2">
            {sorted.map((p, i) => (
              <Card key={p.id} className={cn("overflow-hidden rounded-2xl border-border/60 shadow-sm transition-transform", i === 0 && "border-primary/50 bg-primary/5 ring-1 ring-primary/20", p.user_id === user?.id && "ring-1 ring-primary/30")}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0", i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
                    {i === 0 ? <Crown className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.display_name} {p.user_id === user?.id && "(You)"}</p>
                    {i === 0 && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary"><Crown className="h-3 w-3" /> Champion</span>}
                    {p.user_id === user?.id && <span className="mt-0.5 block text-[10px] font-semibold text-primary">Your result</span>}
                  </div>
                  <p className="text-sm font-bold text-primary">{p.score} pts</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isHost && <Button className="h-12 w-full rounded-xl text-base font-bold shadow-md sm:col-span-2" onClick={handleRematch} disabled={rematchLoading || participants.length === 0}>
              {rematchLoading ? "Preparing rematch..." : "Rematch with same players"}
            </Button>}
            <Button variant="outline" className="h-12 w-full rounded-xl text-base font-bold" onClick={() => navigate("/live-quiz")}>Create another quiz</Button>
            <Button variant="outline" className="h-12 w-full rounded-xl text-base font-bold" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
          </div>
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
            <div className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Room is open</div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 shadow-inner">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">Waiting Room</h2>
            <p className="text-sm text-muted-foreground capitalize">{room.subject} <span className="mx-1">·</span> {room.room_code?.startsWith("D") ? "1-vs-1 Friend Battle" : "Group Quiz"} <span className="mx-1">·</span> {questions.length} questions <span className="mx-1">·</span> {room.time_per_question}s per question</p>
          </div>

          {/* Room Code */}
          <Card className="overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-primary/10 to-card shadow-sm">
            <CardContent className="space-y-3 p-6 text-center">
              <p className="text-xs text-muted-foreground font-medium">Room Code</p>
              <p className="text-4xl font-black tracking-[0.35em] text-primary sm:text-5xl">{roomCode}</p>
              <p className="text-xs text-muted-foreground">Invite friends to join this room and compete in real time.</p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
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
            <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-sm font-bold">Players in the room</p><p className="text-xs text-muted-foreground">Your competition is gathering</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{participants.length} joined</span></div>
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
            <Button className="h-12 w-full gap-2 rounded-xl text-base font-bold shadow-md" onClick={handleStart} disabled={room.room_code?.startsWith("D") ? participants.length !== 2 : participants.length < 1}>
              <Play className="h-4 w-4" /> {room.room_code?.startsWith("D") ? "Start Friend Battle" : "Start Quiz"}
            </Button>
          )}
          {room.room_code?.startsWith("D") && participants.length < 2 && <p className="text-center text-xs text-muted-foreground">Share your challenge code. The battle starts when your friend joins.</p>}
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/[0.045] flex flex-col pb-[env(safe-area-inset-bottom)]">
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{room.subject} · Live battle</span>
            <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold tracking-wide text-foreground">QUESTION {currentQ + 1}<span className="font-medium text-muted-foreground"> / {questions.length}</span></span>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary sm:w-32">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:inline-flex"><Users className="mr-1 h-3 w-3" />{participants.length} playing</span>
            <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5">
            <Clock className={cn("h-3.5 w-3.5", timeLeft <= 5 ? "text-destructive" : "text-muted-foreground")} />
            <span className={cn("text-sm font-extrabold tabular-nums", timeLeft <= 5 && "text-destructive")}>{timeLeft}s</span>
            </div>
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
      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-5 px-4 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_280px]"><section className="min-w-0 space-y-5">
        <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.07] p-6 shadow-lg shadow-primary/5 sm:p-9"><div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/[0.07] blur-2xl" /><div className="relative"><div className="mb-4 flex items-center justify-between gap-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Your question</p><span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-bold text-muted-foreground">Question {currentQ + 1} of {questions.length}</span></div><p className="text-lg font-semibold leading-relaxed sm:text-xl">{currentQuestion.question_text}</p></div></div>
        </motion.div>

        <div className="space-y-2">
          <p className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Choose your answer</p>
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
              <Card key={opt} role="button" tabIndex={answered ? -1 : 0} aria-disabled={answered} className={cn("cursor-pointer rounded-2xl border-2 transition-all duration-200 active:scale-[0.99] sm:rounded-2xl", optionClass, answered && "pointer-events-none", !answered && "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5")} onClick={() => handleAnswer(opt)}>
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

              {isHost ? (
                <Button className="w-full rounded-xl" onClick={advanceQuestion} disabled={isAdvancing || revealRemaining > 0}>
                  {isAdvancing
                    ? (advanceCommitted ? "Refreshing question..." : "Loading next question...")
                    : revealRemaining > 0
                      ? `Please wait ${revealRemaining}s to continue`
                      : advanceCommitted
                        ? "Refresh question"
                        : currentQ === questions.length - 1 ? "Finish Quiz" : "Next Question"}
                </Button>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center">Waiting for the host to continue...</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="space-y-3 lg:sticky lg:top-28 lg:self-start">
        <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm backdrop-blur">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">Live leaderboard</p>
                <p className="text-[11px] text-muted-foreground">Scores update as players answer</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{participants.length}</span>
            </div>
            <div className="space-y-2">
              {sorted.map((participant, index) => (
                <div key={participant.id} className={cn("flex items-center gap-2 rounded-xl px-2.5 py-2", participant.user_id === user?.id ? "bg-primary/10 ring-1 ring-primary/20" : "bg-secondary/50")}>
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold", index === 0 ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{participant.display_name}{participant.user_id === user?.id ? " · You" : ""}</span>
                  <span className="shrink-0 text-xs font-extrabold tabular-nums text-primary">{participant.score} pts</span>
                </div>
              ))}
              {participants.length === 0 && <p className="text-xs text-muted-foreground">Waiting for players…</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-card/90 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Room code</p>
              <p className="mt-1 text-2xl font-black tracking-[0.22em] text-primary">{roomCode}</p>
            </div>
            <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={copyRoomCode}>
              <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy room code"}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </main>
    </div>
  );
};

export default QuizRoom;
