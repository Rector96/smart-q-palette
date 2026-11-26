import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Copy, Share2, Play, Trophy, Clock, AlertTriangle, Crown, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import ScientificCalculator from "@/components/ScientificCalculator";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import QuizResultMobileShare from "@/components/QuizResultMobileShare";
import "./QuizRoom.css";

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
  option_e?: string | null;
  diagram_url?: string | null;
  topic?: string | null;
  correct_answer?: string;
  explanation?: string;
  exam_hint?: string;
}

interface QuizRoomState {
  id: string;
  host_id: string;
  room_code: string;
  subject: string;
  quiz_type: "general" | "examination";
  examination: string | null;
  exam_year: number | null;
  status: string;
  current_question_index: number;
  question_started_at: string | null;
  time_per_question: number;
  questions: QuizQuestion[];
}

interface PrivateAnswer {
  selected_option?: string | null;
  correct_answer?: string;
  explanation?: string | null;
  exam_hint?: string | null;
}

interface QuizResultStats {
  correct: number;
  total: number;
  secondsUsed: number;
  weakestTopic: { topic: string; accuracy: number } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQuizQuestion = (value: unknown): value is QuizQuestion => {
  if (!isRecord(value)) return false;
  return ["id", "question_text", "option_a", "option_b", "option_c", "option_d"]
    .every((key) => typeof value[key] === "string") &&
    (value.topic === undefined || value.topic === null || typeof value.topic === "string");
};

const parseQuizRoom = (value: unknown): QuizRoomState | null => {
  if (!isRecord(value) || !Array.isArray(value.questions) || !value.questions.every(isQuizQuestion)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.host_id !== "string" ||
    typeof value.room_code !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.status !== "string" ||
    typeof value.current_question_index !== "number" ||
    typeof value.time_per_question !== "number"
  ) return null;
  return {
    id: value.id,
    host_id: value.host_id,
    room_code: value.room_code,
    subject: value.subject,
    quiz_type: value.quiz_type === "examination" ? "examination" : "general",
    examination: typeof value.examination === "string" ? value.examination : null,
    exam_year: typeof value.exam_year === "number" ? value.exam_year : null,
    status: value.status,
    current_question_index: value.current_question_index,
    question_started_at: typeof value.question_started_at === "string" ? value.question_started_at : null,
    time_per_question: value.time_per_question,
    questions: value.questions,
  };
};

const parsePrivateAnswer = (value: unknown): PrivateAnswer | null => {
  if (!isRecord(value)) return null;
  return {
    selected_option: typeof value.selected_option === "string" ? value.selected_option : null,
    correct_answer: typeof value.correct_answer === "string" ? value.correct_answer : undefined,
    explanation: typeof value.explanation === "string" ? value.explanation : null,
    exam_hint: typeof value.exam_hint === "string" ? value.exam_hint : null,
  };
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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

  const [room, setRoom] = useState<QuizRoomState | null>(null);
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
  const [privateAnswer, setPrivateAnswer] = useState<PrivateAnswer | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [quizEnded, setQuizEnded] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);
  const [quizResultStats, setQuizResultStats] = useState<QuizResultStats | null>(null);
  const [resultStatsLoading, setResultStatsLoading] = useState(true);
  const [resultStatsError, setResultStatsError] = useState("");
  const [resultProfileName, setResultProfileName] = useState("");
  const [resultReferralCode, setResultReferralCode] = useState("");
  const loadedResultsRoom = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const nextRoom = parseQuizRoom(data?.room);
    if (!nextRoom) throw new Error("Quiz room not found.");
    setRoom(nextRoom);
    setIsHost(nextRoom.host_id === user.id);
    setCurrentQ(nextRoom.current_question_index || 0);
    setParticipants(data.participants || []);
    const answer = parsePrivateAnswer(data.my_answer);
    setPrivateAnswer(answer);
    if (nextRoom.status === "ended") setQuizEnded(true);
    else setQuizEnded(false);
    if (nextRoom.status === "live") {
      const startedAt = nextRoom.question_started_at ? new Date(nextRoom.question_started_at).getTime() : Date.now();
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setTimeLeft(Math.max(0, nextRoom.time_per_question - elapsed));
      setSelectedOption(answer?.selected_option || null);
      setAnswered(Boolean(answer));
      setShowResult(Boolean(answer));
    }
    setLoading(false);
  }, [roomCode, user]);

  useEffect(() => {
    if (!roomCode || !user) return;
    refreshRoom().catch((err: unknown) => {
      toast({ title: "Unable to load quiz", description: errorMessage(err, "Please try again."), variant: "destructive" });
      navigate("/live-quiz");
    });
  }, [roomCode, user, refreshRoom]);
  // Load participants
  useEffect(() => {
    if (!room) return;
   const loadParticipants = async () => {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("*")
    .eq("room_id", room.id);

  if (error) {
    console.error("[Live Quiz] Participant refresh failed:", error);
    return;
  }

  if (data) setParticipants(data);
};
    loadParticipants();

    // Real-time participants
    const channel = supabase.channel(`room-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_participants", filter: `room_id=eq.${room.id}` }, (payload) => {
  console.info("[Live Quiz] Participant change received:", payload.eventType);
  void loadParticipants();
})
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quiz_rooms", filter: `id=eq.${room.id}` }, () => {
        refreshRoom().catch((error: unknown) => {
          console.error("Could not refresh live quiz room:", error);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_answers", filter: `room_id=eq.${room.id}` }, () => {
        // Reload scores
        loadScores();
      })
      .subscribe((status, error) => {
        console.info("[Live Quiz] Realtime channel status:", status, error ?? null);
        if (status === "SUBSCRIBED") {
          void loadParticipants();
        }
      });

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

  useEffect(() => {
    if (!quizEnded || !room || !user || loadedResultsRoom.current === room.id) return;
    let active = true;
    setResultStatsLoading(true);
    setResultStatsError("");

  const loadResultDetails = async () => {
  const [resultsResponse, profileResult, referralResult] = await Promise.all([
    supabase.functions.invoke("live-quiz", {
      body: {
        action: "results",
        room_id: room.id,
      },
    }),
    supabase.from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("referral_profiles")
      .select("referral_code")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!active) return;

  if (resultsResponse.error) {
    setResultStatsError(resultsResponse.error.message);
    setResultStatsLoading(false);
    toast({
      title: "Could not load your quiz details",
      description: resultsResponse.error.message,
      variant: "destructive",
    });
    return;
  }

  const answers = resultsResponse.data?.answers ?? [];

  const topicTotals = new Map<string, { correct: number; total: number }>();

  for (const answer of answers) {
    const topic = room.questions[answer.question_index]?.topic?.trim();
    if (!topic) continue;

    const current = topicTotals.get(topic) || { correct: 0, total: 0 };
    current.total += 1;
    if (answer.is_correct) current.correct += 1;
    topicTotals.set(topic, current);
  }

  const weakest = [...topicTotals.entries()]
    .map(([topic, result]) => ({
      topic,
      accuracy: result.total > 0
        ? Math.round((result.correct / result.total) * 100)
        : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)[0] || null;

  setQuizResultStats({
    correct: answers.filter((answer) => answer.is_correct).length,
    total: room.questions.length,
    secondsUsed: answers.reduce(
      (total, answer) => total + answer.time_taken,
      0,
    ),
    weakestTopic: weakest,
  });

  if (profileResult.error) {
    toast({
      title: "Could not load your profile name",
      description: profileResult.error.message,
      variant: "destructive",
    });
  }

  if (referralResult.error) {
    toast({
      title: "Could not load your referral code",
      description: referralResult.error.message,
      variant: "destructive",
    });
  }

  setResultProfileName(profileResult.data?.full_name || "");
  setResultReferralCode(referralResult.data?.referral_code || "");
  loadedResultsRoom.current = room.id;
  setResultStatsLoading(false);
};

    loadResultDetails().catch((error: unknown) => {
      if (active) {
        setResultStatsError(errorMessage(error, "Please refresh and try again."));
        setResultStatsLoading(false);
        toast({
          title: "Could not load your quiz details",
          description: errorMessage(error, "Please refresh and try again."),
          variant: "destructive",
        });
      }
    });

    return () => {
      active = false;
    };
  }, [quizEnded, room, user, toast]);

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
        ...(parsePrivateAnswer(data?.result) || {}),
        selected_option: option,
      });
      setShowResult(true);
      if (isHost) setRevealUntil(Date.now() + 3000);
    } catch (err: unknown) {
      setAnswered(false);
      setSelectedOption(null);
      toast({ title: "Answer not submitted", description: errorMessage(err, "Please try again."), variant: "destructive" });
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
      } catch (refreshError: unknown) {
        toast({
          title: "Question advanced; refresh needed",
          description: errorMessage(refreshError, "The next question is ready. Tap Refresh question to reload it."),
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      toast({ title: "Unable to advance", description: errorMessage(err, "Please try again."), variant: "destructive" });
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
        try {
          await navigator.share({ title: "Rematch challenge!", text: `Join our rematch with code ${nextCode}`, url: inviteUrl });
        } catch (error) {
          if (!(error instanceof Error && error.name === "AbortError")) {
            toast({ title: "Could not share rematch", description: errorMessage(error, "Please share the room code manually."), variant: "destructive" });
          }
        }
      }
      navigate(`/quiz-room/${nextCode}`);
    } catch (error: unknown) {
      toast({ title: "Could not start rematch", description: errorMessage(error, "Please try again."), variant: "destructive" });
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
      try {
        await navigator.share({ title: "Join my quiz!", url });
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          toast({ title: "Could not share quiz", description: errorMessage(error, "Please copy the room link manually."), variant: "destructive" });
        }
      }
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
    const myScore = sorted.find((p) => p.user_id === user?.id)?.score ?? 0;
    const isChampion = Boolean(winner && winner.user_id === user?.id);
    const resultSubject = room.quiz_type === "examination" && room.examination
      ? `${room.examination}${room.exam_year ? ` ${room.exam_year}` : ""} · ${room.subject}`
      : `General quiz · ${room.subject}`;
    return (
      <div className="quiz-results-page min-h-screen bg-[#f4f7fb] px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7">
        <div className="quiz-results-desktop">
        <main className="quiz-results-layout mx-auto max-w-6xl">
          <section className={cn("quiz-results-hero", isChampion && "quiz-results-hero-champion")}>
            <div className="quiz-results-glow quiz-results-glow-one" />
            <div className="quiz-results-glow quiz-results-glow-two" />
            <div className="quiz-results-hero-content">
              <div className="quiz-results-trophy" aria-hidden="true">
                {isChampion ? <Trophy className="h-9 w-9" /> : <CheckCircle2 className="h-8 w-8" />}
              </div>
              <p className="quiz-results-eyebrow">{isChampion ? "Victory secured" : "Battle finished"}</p>
              <h1>{isChampion ? "You’re the champion!" : "Quiz complete!"}</h1>
              <p className="quiz-results-subtitle">{isChampion ? "Excellent work — you came out on top." : "Great effort. Here’s how everyone performed."}</p>
              <p className="mt-2 text-sm font-semibold text-primary-foreground/90">{resultSubject}</p>
            </div>

            {winner && (
              <div className="quiz-results-champion-card">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="quiz-results-crown"><Crown className="h-5 w-5" /></div>
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Quiz champion</p>
                    <p className="truncate text-lg font-extrabold">{winner.display_name}{isChampion ? " · You" : ""}</p>
                  </div>
                </div>
                <p className="shrink-0 text-xl font-extrabold text-primary">{winner.score}<span className="ml-1 text-xs font-semibold">pts</span></p>
              </div>
            )}

            <div className="quiz-results-stats">
              <div><span>Your score</span><strong>{myScore} <small>pts</small></strong></div>
              <div><span>Your place</span><strong>{myRank > 0 ? `#${myRank}` : "—"} <small>{participants.length ? `/ ${participants.length}` : ""}</small></strong></div>
              <div><span>Questions</span><strong>{questions.length}</strong></div>
            </div>
          </section>

          <section className="quiz-results-leaderboard">
            <div className="quiz-results-section-heading">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Final standings</p><h2 className="text-lg font-extrabold">Leaderboard</h2></div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{participants.length} players</span>
            </div>
            <div className="quiz-results-player-list space-y-2">
              {sorted.map((p, i) => (
                <Card key={p.id} className={cn("quiz-results-player overflow-hidden rounded-2xl border-border/60 shadow-none", i === 0 && "quiz-results-player-winner", p.user_id === user?.id && "quiz-results-player-self")}>
                  <CardContent className="flex min-w-0 items-center gap-3 p-3 sm:p-4">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold", i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
                      {i === 0 ? <Crown className="h-5 w-5" /> : i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{p.display_name} {p.user_id === user?.id && "(You)"}</p>
                      {i === 0 && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary"><Crown className="h-3 w-3" /> Champion</span>}
                      {p.user_id === user?.id && <span className="mt-0.5 block text-[10px] font-semibold text-primary">Your result</span>}
                    </div>
                    <p className="shrink-0 text-sm font-extrabold tabular-nums text-primary">{p.score} pts</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <div className="quiz-results-actions">
            {isHost && <Button className="quiz-results-rematch h-12 w-full rounded-xl text-base font-bold shadow-md" onClick={handleRematch} disabled={rematchLoading || participants.length === 0}>
              {rematchLoading ? "Preparing rematch..." : "Rematch with same players"}
            </Button>}
            <Button variant="outline" className="h-12 w-full rounded-xl text-base font-bold" onClick={() => navigate("/live-quiz")}>Create another quiz</Button>
            <Button variant="outline" className="h-12 w-full rounded-xl text-base font-bold" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
          </div>
        </main>
        </div>
        <div className="quiz-results-mobile">
          {quizResultStats && (
            <QuizResultMobileShare
              resultId={room.id}
              roomCode={room.room_code}
              isSolo={false}
              subject={resultSubject}
              userId={user?.id || ""}
              profileName={resultProfileName || participants.find((p) => p.user_id === user?.id)?.display_name || ""}
              referralCode={resultReferralCode}
              correct={quizResultStats.correct}
              total={quizResultStats.total}
              rank={myRank || 1}
              participantCount={participants.length}
              bestScoreThisWeek={null}
              secondsUsed={quizResultStats.secondsUsed}
              weakestTopic={quizResultStats.weakestTopic}
              rematchAvailable={isHost && participants.length > 0}
              rematchLoading={rematchLoading}
              onRematch={() => void handleRematch()}
              onCreateAnother={() => navigate("/live-quiz")}
              onDashboard={() => navigate("/dashboard")}
            />
          )}
          {!quizResultStats && (
            <div className="quiz-results-mobile-load-state" role={resultStatsError ? "alert" : "status"}>
              <p>{resultStatsError ? "Your quiz results could not be loaded." : "Loading your quiz results…"}</p>
              {resultStatsError && <p className="quiz-results-mobile-load-error">{resultStatsError}</p>}
              {resultStatsLoading && <div className="animate-spin h-7 w-7 rounded-full border-4 border-primary border-t-transparent" aria-label="Loading" />}
              {resultStatsError && <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // WAITING ROOM
  if (room.status === "waiting") {
    return (
      <div className="quiz-waiting-room min-h-screen bg-[#f4f7fb] px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7">
        <main className="quiz-waiting-layout mx-auto max-w-6xl">
          <header className="quiz-waiting-header">
            <Button variant="ghost" size="icon" aria-label="Back to live quiz" className="h-10 w-10 shrink-0 rounded-full bg-white shadow-sm" onClick={() => navigate("/live-quiz")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Room is open</div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Waiting Room</h1>
              <div className="quiz-waiting-meta mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{room.subject}</span><span aria-hidden="true">·</span>
                <span>{room.room_code?.startsWith("D") ? "1-vs-1 Friend Battle" : "Group Quiz"}</span><span aria-hidden="true">·</span>
                <span>{questions.length} questions</span><span aria-hidden="true">·</span>
                <span>{room.time_per_question}s per question</span>
              </div>
            </div>
          </header>

          <div className="quiz-waiting-grid">
            <Card className="quiz-waiting-code overflow-hidden rounded-3xl border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
              <CardContent className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center sm:p-8 lg:p-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Room code</p>
                  <p className="mt-2 break-all text-5xl font-black tracking-[0.22em] text-primary sm:text-6xl">{roomCode}</p>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Invite friends to join this room and compete in real time.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" className="h-11 gap-2 rounded-xl px-5" onClick={copyRoomCode}>
                    <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy Code"}
                  </Button>
                  <Button variant="outline" className="h-11 gap-2 rounded-xl px-5" onClick={shareLink}>
                    <Share2 className="h-4 w-4" /> Share Link
                  </Button>
                </div>
              </CardContent>
            </Card>

            <section className="quiz-waiting-players rounded-3xl border border-white bg-white p-4 shadow-[0_8px_24px_rgba(27,39,61,0.06)] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="text-base font-bold">Players in the room</h2><p className="mt-0.5 text-xs text-muted-foreground">Your competition is gathering</p></div>
                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{participants.length} joined</span>
              </div>
              <div className="quiz-waiting-player-list space-y-2">
                {participants.map((p, index) => (
                  <Card key={p.id} className="rounded-2xl border-border/60 shadow-none">
                    <CardContent className="flex min-w-0 items-center gap-3 p-3">
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold", p.user_id === room.host_id ? "bg-primary/10 text-primary" : "bg-secondary text-foreground")}>
                        {p.display_name[0]?.toUpperCase() || "?"}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{p.display_name}</p>
                      {p.user_id === room.host_id ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">HOST</span> : <span className="text-xs text-muted-foreground">Player {index + 1}</span>}
                    </CardContent>
                  </Card>
                ))}
                {participants.length === 0 && <p className="rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">Waiting for players to join…</p>}
              </div>
            </section>

            <section className="quiz-waiting-action space-y-3">
              {isHost ? (
                <Button className="h-14 w-full gap-2 rounded-2xl text-base font-bold shadow-md" onClick={handleStart} disabled={room.room_code?.startsWith("D") ? participants.length !== 2 : participants.length < 1}>
                  <Play className="h-5 w-5" /> {room.room_code?.startsWith("D") ? "Start Friend Battle" : "Start Quiz"}
                </Button>
              ) : <div className="rounded-2xl border bg-white px-4 py-4 text-center text-sm font-semibold text-muted-foreground">Waiting for host to start…</div>}
              {room.room_code?.startsWith("D") && participants.length < 2 && <p className="text-center text-xs text-muted-foreground">Share your challenge code. The battle starts when your friend joins.</p>}
              {isHost && !room.room_code?.startsWith("D") && <p className="text-center text-xs text-muted-foreground">You can start the quiz when you’re ready.</p>}
            </section>
          </div>
        </main>
      </div>
    );
  }

  // LIVE QUIZ
  if (!currentQuestion) return null;
  const progress = ((currentQ + 1) / questions.length) * 100;
  const timerPercent = room.time_per_question > 0 ? (timeLeft / room.time_per_question) * 100 : 0;
  const sorted = [...participants].sort((a, b) => b.score - a.score);

  return (
    <>
    <div className={cn("quiz-live-shell min-h-screen bg-gradient-to-b from-background via-background to-primary/[0.045] flex flex-col pb-[env(safe-area-inset-bottom)]", showResult && "quiz-live-has-actions")}>
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
      <div className="quiz-live-header sticky top-0 z-30 border-b border-border/70 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-xl">
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
            <ScientificCalculator />
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
      <main className="quiz-live-main mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-5 px-4 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_280px]"><section className="quiz-live-question-column min-w-0 space-y-5">
        <motion.div className="quiz-live-question-motion" key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="quiz-live-question-card relative overflow-hidden rounded-[28px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.07] p-6 shadow-lg shadow-primary/5 sm:p-9"><div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/[0.07] blur-2xl" /><div className="relative"><div className="quiz-live-question-meta mb-4 flex items-center justify-between gap-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Your question</p><span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-bold text-muted-foreground">Question {currentQ + 1} of {questions.length}</span></div><p className="quiz-live-question-text text-lg font-semibold leading-relaxed sm:text-xl">{currentQuestion.question_text}</p>{currentQuestion.diagram_url && <img src={currentQuestion.diagram_url} alt="Question diagram" className="mt-4 max-h-80 w-full rounded-xl object-contain" loading="lazy" decoding="async" />}</div></div>
        </motion.div>

        <div className="quiz-live-answer-section space-y-2">
          <p className="quiz-live-answer-label px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Choose your answer</p>
          <div className="quiz-live-answer-grid">
          {["A", "B", "C", "D", ...(currentQuestion.option_e?.trim() ? ["E"] : [])].map(opt => {
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
              <Card key={opt} role="button" tabIndex={answered ? -1 : 0} aria-disabled={answered} className={cn("quiz-live-answer cursor-pointer rounded-2xl border-2 transition-all duration-200 active:scale-[0.99] sm:rounded-2xl", optionClass, answered && "pointer-events-none", !answered && "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5")} onClick={() => handleAnswer(opt)}>
                <CardContent className="quiz-live-answer-content flex min-h-[64px] items-center gap-4 p-4 sm:p-5">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold", showResult && isCorrect ? "bg-[hsl(var(--success))] text-white" : showResult && isSelected ? "bg-destructive text-white" : "bg-secondary")}>
                    {showResult && isCorrect ? <CheckCircle2 className="h-4 w-4" /> : showResult && isSelected ? <XCircle className="h-4 w-4" /> : opt}
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{text}</p>
                </CardContent>
              </Card>
            );
          })}
          </div>
        </div>

        {/* Result feedback */}
        <AnimatePresence>
          {showResult && (
            <motion.div className="quiz-live-result space-y-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {selectedOption === currentQuestion.correct_answer ? (
                <div className="rounded-2xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/10 p-4">
                  <p className="text-xs font-semibold text-[hsl(var(--success))]">✅ Correct! {currentQuestion.exam_hint || MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)]}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
                  <p className="text-xs font-semibold text-destructive">❌ Not quite. {currentQuestion.exam_hint || `The correct answer is ${currentQuestion.correct_answer}.`}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="quiz-live-sidebar space-y-3 lg:sticky lg:top-28 lg:self-start">
        <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm backdrop-blur">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">Live leaderboard</p>
                <p className="text-[11px] text-muted-foreground">Scores update as players answer</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{participants.length}</span>
            </div>
            <div className="quiz-live-leaderboard-list space-y-2">
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
    {showResult && typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        <motion.div
          key={currentQ}
          className="quiz-live-advance-bar"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
        >
          <div className="quiz-live-advance-inner">
            <div className="quiz-live-advance-actions">
              {isHost ? (
                <Button className="quiz-live-advance-button rounded-xl" onClick={advanceQuestion} disabled={isAdvancing || revealRemaining > 0}>
                  {isAdvancing
                    ? (advanceCommitted ? "Refreshing question..." : "Loading next question...")
                    : revealRemaining > 0
                      ? `Please wait ${revealRemaining}s to continue`
                      : advanceCommitted
                        ? "Refresh question"
                        : currentQ === questions.length - 1 ? "Finish Quiz" : "Next Question"}
                </Button>
              ) : (
                <p className="quiz-live-advance-waiting">Waiting for the host to continue...</p>
              )}
            </div>
            <div aria-hidden="true" />
          </div>
        </motion.div>
      </AnimatePresence>,
      document.body
    )}
    </>
  );
};

export default QuizRoom;
