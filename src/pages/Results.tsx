import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Linkedin,
  RotateCcw,
  Share2,
  Twitter,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import QuizResultMobileShare from "@/components/QuizResultMobileShare";
import "./QuizRoom.css";
import "./Results.css";

type ExamSession = Database["public"]["Tables"]["exam_sessions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
type ResultQuestion = Pick<
  QuestionRow,
  | "id"
  | "topic"
  | "question_text"
  | "option_a"
  | "option_b"
  | "option_c"
  | "option_d"
  | "option_e"
  | "correct_answer"
  | "explanation"
  | "diagram_url"
>;
type HistoryRow = Pick<
  Database["public"]["Tables"]["user_history"]["Row"],
  "id" | "question_id" | "selected_answer" | "is_correct" | "session_id"
> & {
  questions: ResultQuestion | null;
};
type AnswerFilter = "all" | "wrong" | "correct";

const getSessionShareSubject = (
  session: Pick<ExamSession, "subjects" | "examination" | "exam_year">,
) => {
  const exam = [session.examination, session.exam_year ? String(session.exam_year) : null]
    .filter(Boolean)
    .join(" · ");
  const subjects = (session.subjects || []).join(" · ");
  return [exam, subjects].filter(Boolean).join(" — ") || "Practice";
};

const Results = () => {
  const { toast } = useToast();
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [profileName, setProfileName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [topicBreakdown, setTopicBreakdown] = useState<Record<string, { correct: number; total: number }>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoadError, setHistoryLoadError] = useState("");
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setSession(null);
    setHistory([]);
    setHistoryLoadError("");
    setTopicBreakdown({});
    setProfileName("");
    setReferralCode("");
    if (!user || !sessionId) {
      setLoading(false);
      setLoadError("This result could not be found.");
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError("");
    setAnswerFilter("all");

    const fetchResults = async () => {
      try {
        const [
          { data: sessionData, error: sessionError },
          { data: profile, error: profileError },
          { data: referralProfile, error: referralError },
        ] = await Promise.all([
          supabase.from("exam_sessions").select("id,user_id,mode,subjects,total_questions,correct_answers,score_percentage,duration_seconds,completed,started_at,completed_at,examination,exam_year").eq("id", sessionId).eq("user_id", user.id).single(),
          supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
          supabase.from("referral_profiles").select("referral_code").eq("user_id", user.id).maybeSingle(),
        ]);

        if (!active) return;
        if (sessionError) {
          setLoadError(sessionError.message);
          toast({ title: "Could not load quiz results", description: sessionError.message, variant: "destructive" });
          return;
        }

        setSession(sessionData);
        if (profileError) console.error("Could not load profile name for result:", profileError.message);
        if (profile?.full_name) setProfileName(profile.full_name);
        if (referralError) console.error("Could not load referral code for result:", referralError.message);
        if (referralProfile?.referral_code) setReferralCode(referralProfile.referral_code);

        // Fetch answer rows separately so question embedding cannot hide a saved result.
        const { data: answerRows, error: answersError } = await supabase.from("user_history")
          .select("id,question_id,selected_answer,is_correct,session_id,answered_at")
          .eq("session_id", sessionId)
          .eq("user_id", user.id)
          .order("answered_at", { ascending: true });

        if (!active) return;
        if (answersError) {
          setHistoryLoadError("Your score is saved, but the answer review could not be loaded. Please refresh or contact support.");
          console.error("Could not load CBT answer rows:", answersError.message);
          return;
        }

        const questionIds = [...new Set((answerRows || []).map((answer) => answer.question_id))];
        let questionsById = new Map<string, ResultQuestion>();
        if (questionIds.length > 0) {
          const { data: questionRows, error: questionsError } = await supabase.from("questions")
            .select("id,topic,question_text,option_a,option_b,option_c,option_d,option_e,correct_answer,explanation,diagram_url")
            .in("id", questionIds);
          if (!active) return;
          if (questionsError) {
            setHistoryLoadError("Your score is available, but some question details could not be loaded. Please refresh or contact support.");
            console.error("Could not load CBT question details:", questionsError.message);
          } else {
            questionsById = new Map((questionRows || []).map((question) => [question.id, question]));
          }
        }

        const resultHistory: HistoryRow[] = (answerRows || []).map((answer) => ({
          ...answer,
          questions: questionsById.get(answer.question_id) || null,
        }));
        setHistory(resultHistory);

        const breakdown: Record<string, { correct: number; total: number }> = {};
        resultHistory.forEach((answer) => {
          const topic = answer.questions?.topic || "Unknown";
          if (!breakdown[topic]) breakdown[topic] = { correct: 0, total: 0 };
          breakdown[topic].total += 1;
          if (answer.is_correct) breakdown[topic].correct += 1;
        });
        setTopicBreakdown(breakdown);
        if (resultHistory.length !== Number(sessionData.total_questions)) {
          setHistoryLoadError((current) => current || "Your score is saved, but the answer review is incomplete. Please refresh or contact support.");
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Please try again.";
        setLoadError(message);
        toast({ title: "Could not load quiz results", description: message, variant: "destructive" });
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchResults();
    return () => {
      active = false;
    };
  }, [sessionId, toast, user]);

  const createShareLink = async () => {
    if (!session || !sessionId || !user) return "";
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from("shared_exams").insert({
      share_code: code,
      creator_id: user.id,
      session_id: sessionId,
      mode: session.mode,
      subjects: session.subjects,
      examination: session.examination,
      exam_year: session.exam_year,
    });
    if (error) {
      toast({ title: "Could not create a share link", description: error.message, variant: "destructive" });
      return "";
    }
    return `${window.location.origin}/s/${code}`;
  };

  const handleCopyLink = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const link = await createShareLink();
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        toast({ title: "Link copied", description: "Your result link is ready to share." });
      } catch {
        toast({ title: "Copy your result link", description: link, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "Could not create a share link",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const handleSocialShare = async (platform: "twitter" | "linkedin") => {
    const shareSession = session;
    if (sharing || !shareSession) return;
    setSharing(true);
    const popup = window.open("about:blank", "_blank");
    try {
      const link = await createShareLink();
      if (!link) {
        popup?.close();
        return;
      }
      if (!popup) {
        toast({ title: "Allow pop-ups to share", description: link, variant: "destructive" });
        return;
      }

      const score = Math.round(Number(shareSession.score_percentage) || 0);
      const text = `${profileName || "A RockCBT student"} scored ${score}% in ${getSessionShareSubject(shareSession)}. Can you beat my score?`;
      const target = platform === "twitter"
        ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`
        : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
      popup.opener = null;
      popup.location.href = target;
    } catch (error) {
      popup?.close();
      toast({
        title: "Could not open the share window",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const handleNativeShare = async () => {
    const shareSession = session;
    if (sharing || !navigator.share || !shareSession) return;
    setSharing(true);
    try {
      const link = await createShareLink();
      if (!link) return;
      await navigator.share({
        title: "Can you beat my RockCBT score?",
        text: `${profileName || "A RockCBT student"} scored ${shareSession.correct_answers}/${shareSession.total_questions} in ${getSessionShareSubject(shareSession)}.`,
        url: link,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast({
        title: "Could not share your result",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const correctCount = history.filter((answer) => answer.is_correct).length;
  const wrongCount = history.length - correctCount;
  const filteredHistory = useMemo(
    () => history
      .map((answer, index) => ({ answer, index }))
      .filter(({ answer }) => answerFilter === "all" ||
        (answerFilter === "correct" ? answer.is_correct : !answer.is_correct)),
    [answerFilter, history],
  );
  const weakTopics = Object.entries(topicBreakdown)
    .filter(([topic, result]) => topic !== "Unknown" && result.total > 0 && result.correct / result.total < 0.5)
    .map(([topic]) => topic)
    .slice(0, 3);
  const weakestTopic = Object.entries(topicBreakdown)
    .filter(([topic, result]) => topic !== "Unknown" && result.total > 0 && result.correct / result.total <= 0.5)
    .map(([topic, result]) => ({
      topic,
      accuracy: Math.round((result.correct / result.total) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy)[0] || null;

  if (loading) {
    return <div className="cbt-results-state" role="status">Loading your result…</div>;
  }
  if (!session) {
    return <div className="cbt-results-state" role="alert">{loadError || "This result could not be found."}</div>;
  }

  const totalQuestions = Number(session.total_questions) || 0;
  const correctAnswers = Number(session.correct_answers) || 0;
  const wrongAnswers = Math.max(0, totalQuestions - correctAnswers);
  const durationMinutes = Math.floor((Number(session.duration_seconds) || 0) / 60);
  const roundedScore = Math.round(Number(session.score_percentage) || 0);

  return (
    <main className="cbt-results-page">
      <header className="cbt-results-header">
        <div className="cbt-results-heading">
          <h1><BookOpen aria-hidden="true" />{getSessionShareSubject(session)}</h1>
          <p>
            {roundedScore < 70 && weakTopics.length > 0
              ? <>You need more practice in {weakTopics.map((topic, index) => (
                <span key={topic}>
                  {index > 0 && (index === weakTopics.length - 1 ? " and " : ", ")}
                  <strong>{topic}</strong>
                </span>
              ))}.</>
              : roundedScore >= 70
                ? "Strong work. Keep building on what you know."
                : "Review the explanations below and try again."}
          </p>
        </div>
        <div className="cbt-results-actions">
          <Button type="button" className="cbt-results-retry" onClick={() => navigate("/select-subjects?mode=practice")}>
            <RotateCcw aria-hidden="true" /> Retry Test
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="cbt-results-share" disabled={sharing}>
                <Share2 aria-hidden="true" /> Share Result <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="cbt-results-share-menu">
              <DropdownMenuItem onSelect={() => void handleCopyLink()}>
                <Copy aria-hidden="true" /> Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSocialShare("twitter")}>
                <Twitter aria-hidden="true" /> Tweet
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSocialShare("linkedin")}>
                <Linkedin aria-hidden="true" /> Post to LinkedIn
              </DropdownMenuItem>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleNativeShare()}>
                    <ExternalLink aria-hidden="true" /> Share to another app
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" className="cbt-results-dashboard" onClick={() => navigate("/dashboard")}>
            Dashboard
          </Button>
        </div>
      </header>

      <div className="cbt-results-grid">
        <div className="cbt-results-left-column">
          <section className="cbt-results-stats" aria-label="Quiz summary">
            <div className="cbt-results-stat cbt-results-stat-correct">
              <CheckCircle2 aria-hidden="true" />
              <span>Correct: {correctAnswers}/{totalQuestions}</span>
            </div>
            <div className="cbt-results-stat cbt-results-stat-wrong">
              <XCircle aria-hidden="true" />
              <span>Wrong: {wrongAnswers}/{totalQuestions}</span>
            </div>
            <div className="cbt-results-stat cbt-results-stat-time">
              <Clock aria-hidden="true" />
              <span>Time: {durationMinutes} min</span>
            </div>
          </section>

          <section className="cbt-results-topic-panel" aria-labelledby="cbt-topic-title">
            <div className="cbt-results-panel-heading">
              <h2 id="cbt-topic-title">Topic Breakdown</h2>
              <div className="cbt-results-topic-legend" aria-label="Topic performance legend">
                <span className="is-weak">Weak Area</span>
                <span className="is-strong">Strong</span>
              </div>
            </div>
            {Object.entries(topicBreakdown).length > 0 ? (
              <div className="cbt-results-topic-list">
                {Object.entries(topicBreakdown).map(([topic, result]) => {
                  const percentage = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;
                  const performance = percentage < 50 ? "weak" : percentage >= 70 ? "strong" : "average";
                  return (
                    <div className="cbt-results-topic-row" key={topic}>
                      <div className="cbt-results-topic-title">
                        <span title={topic}>{topic}</span>
                        <strong>{result.correct}/{result.total}</strong>
                      </div>
                      <div
                        className="cbt-results-progress"
                        role="progressbar"
                        aria-label={`${topic} accuracy`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                      >
                        <span className={`is-${performance}`} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="cbt-results-empty">Topic analysis is not available for this result.</p>
            )}
          </section>
        </div>

        <section className="cbt-results-review-panel" aria-labelledby="cbt-review-title">
          <div className="cbt-results-review-heading">
            <h2 id="cbt-review-title">Question &amp; Answer Review</h2>
            <span>{history.length} questions</span>
          </div>
          <div className="cbt-results-filter-list" role="group" aria-label="Filter answers">
            {([
              ["all", `All (${history.length})`],
              ["wrong", `Wrong (${wrongCount})`],
              ["correct", `Correct (${correctCount})`],
            ] as const).map(([filter, label]) => (
              <button
                type="button"
                aria-pressed={answerFilter === filter}
                className={cn("cbt-results-filter", answerFilter === filter && "is-active")}
                key={filter}
                onClick={() => setAnswerFilter(filter)}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredHistory.length > 0 ? (
            <div className="cbt-results-answer-grid">
              {filteredHistory.map(({ answer, index }) => {
                const question = answer.questions;
                const selectedAnswer = answer.selected_answer?.toUpperCase() || "";
                const correctAnswer = question?.correct_answer?.toUpperCase() || "";
                const selectedText = question && selectedAnswer
                  ? question[`option_${selectedAnswer.toLowerCase()}`]
                  : null;
                const correctText = question && correctAnswer
                  ? question[`option_${correctAnswer.toLowerCase()}`]
                  : null;

                return (
                  <article className="cbt-results-answer-card" key={answer.id}>
                    <h3>Question {index + 1}</h3>
                    <p className="cbt-results-question-text">{question?.question_text || "Question text unavailable."}</p>
                    {question?.diagram_url && (
                      <img
                        className="cbt-results-question-diagram"
                        src={question.diagram_url}
                        alt={`Diagram for question ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {!answer.is_correct && (
                      <div className="cbt-results-answer-choice is-wrong">
                        <XCircle aria-hidden="true" />
                        <span>{selectedAnswer ? `${selectedAnswer}) ${selectedText || "Your answer"}` : "You did not answer this question."}</span>
                      </div>
                    )}
                    <div className="cbt-results-answer-choice is-correct">
                      <CheckCircle2 aria-hidden="true" />
                      <span>{correctAnswer ? `${correctAnswer}) ${correctText || correctAnswer}` : "Correct answer unavailable."}</span>
                      {!answer.is_correct && <strong>Correct Answer</strong>}
                    </div>
                    <div className="cbt-results-explanation">
                      <h4>Explanation</h4>
                      <p>{question?.explanation || "No explanation was provided for this question."}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="cbt-results-empty">No questions match this filter.</p>
          )}
        </section>
      </div>

      <div className="cbt-results-mobile-share">
        <div className="quiz-results-page--cbt">
          <div className="quiz-results-mobile">
            <QuizResultMobileShare
              resultId={session.id}
              isSolo
              subject={getSessionShareSubject(session)}
              userId={user?.id || ""}
              profileName={profileName}
              referralCode={referralCode}
              correct={correctAnswers}
              total={totalQuestions}
              rank={null}
              participantCount={null}
              bestScoreThisWeek={null}
              secondsUsed={Number(session.duration_seconds) || 0}
              weakestTopic={weakestTopic}
              rematchAvailable={false}
              rematchLoading={false}
              onRematch={() => undefined}
              onCreateAnother={() => navigate("/select-subjects?mode=practice")}
              onDashboard={() => navigate("/dashboard")}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export default Results;
