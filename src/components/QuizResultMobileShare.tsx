import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Clock, Copy, Image as ImageIcon, LayoutDashboard, RotateCcw, Share2, Star, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getFirstName } from "@/lib/referral";
import { buildResultShareUrl, drawResultShareCard, getOrdinal, type ShareApp } from "@/lib/resultShare";

interface Props {
  resultId: string;
  roomCode?: string;
  isSolo: boolean;
  subject: string;
  userId: string;
  profileName: string;
  referralCode: string;
  correct: number;
  total: number;
  rank: number | null;
  participantCount: number | null;
  bestScoreThisWeek: number | null;
  secondsUsed: number;
  weakestTopic: { topic: string; accuracy: number } | null;
  rematchAvailable: boolean;
  rematchLoading: boolean;
  onRematch: () => void;
  onCreateAnother: () => void;
  onDashboard: () => void;
}

const QuizResultMobileShare = ({
  resultId,
  roomCode,
  isSolo,
  subject,
  userId,
  profileName,
  referralCode,
  correct,
  total,
  rank,
  participantCount,
  bestScoreThisWeek,
  secondsUsed,
  weakestTopic,
  rematchAvailable,
  rematchLoading,
  onRematch,
  onCreateAnother,
  onDashboard,
}: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultsViewedRef = useRef(false);
  const [firstName, setFirstName] = useState(() => getFirstName(profileName));
  const [nameEdited, setNameEdited] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreRingCircumference = isSolo ? 2 * Math.PI * 39 : 270;
  const rankText = rank !== null && participantCount !== null
    ? `${getOrdinal(rank)} of ${participantCount}`
    : null;
  const minutesUsed = Math.floor(secondsUsed / 60);
  const secondsRemainder = secondsUsed % 60;
  const formattedTime = minutesUsed > 0
    ? `${minutesUsed} min${secondsRemainder ? ` ${secondsRemainder}s` : ""}`
    : `${secondsRemainder} sec`;

  useEffect(() => {
    if (!nameEdited) setFirstName(getFirstName(profileName));
  }, [nameEdited, profileName]);

  const recordEvent = useCallback(async (
    eventName: "results_viewed" | "share_clicked" | "link_copied" | "share_card_saved",
    app?: ShareApp,
  ) => {
    try {
      const { error } = await supabase.from("share_analytics_events").insert({
        user_id: userId,
        event_name: eventName,
        app: app || null,
        referral_code: referralCode || null,
      });
      if (error) throw error;
    } catch (error) {
      toast({
        title: "Sharing analytics unavailable",
        description: error instanceof Error
          ? `Your result can still be shared, but this activity was not recorded: ${error.message}`
          : "Your result can still be shared, but this activity was not recorded.",
        variant: "destructive",
      });
    }
  }, [referralCode, toast, userId]);

  useEffect(() => {
    if (resultsViewedRef.current) return;
    resultsViewedRef.current = true;
    void recordEvent("results_viewed");
  }, [recordEvent, resultId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !referralCode) return;
    try {
      drawResultShareCard(canvas, {
        firstName: getFirstName(firstName) || "Your name",
        score: correct,
        totalQuestions: total,
        subject,
        rankPosition: rank,
        participantCount,
        bestScoreThisWeek,
        referralCode,
        siteHost: window.location.host,
        layout: isSolo ? "landscape" : "portrait",
      });
    } catch (error) {
      toast({
        title: "Could not prepare your share card",
        description: error instanceof Error ? error.message : "Try refreshing the page.",
        variant: "destructive",
      });
    }
  }, [bestScoreThisWeek, correct, firstName, isSolo, participantCount, rank, referralCode, subject, toast, total]);

  const validateName = () => {
    const safeName = getFirstName(firstName);
    if (!safeName || !/^[A-Za-zÀ-ÖØ-öø-ÿ'-]{1,32}$/.test(firstName.trim())) {
      toast({
        title: "Check your first name",
        description: "Enter only your first name using letters, an apostrophe or a hyphen.",
        variant: "destructive",
      });
      return "";
    }
    if (!referralCode) {
      toast({
        title: "Referral code unavailable",
        description: "We could not load your referral code. Refresh and try again.",
        variant: "destructive",
      });
      return "";
    }
    return safeName;
  };

  const makeShareLink = async (name: string, app: ShareApp) => {
    const { data: token, error } = await supabase.rpc("create_result_share_card", {
      p_first_name: name,
      p_score: correct,
      p_total_questions: total,
      p_subject: subject,
      p_rank_position: rank,
      p_participant_count: participantCount,
      p_best_score_this_week: bestScoreThisWeek,
    });
    if (error || !token) {
      toast({
        title: "Could not create your result link",
        description: error?.message || "Please try sharing again.",
        variant: "destructive",
      });
      return "";
    }
    return buildResultShareUrl(window.location.origin, token, referralCode, app);
  };

  const makeCardFile = async (name: string) => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Your share card is still loading. Please try again.");
    drawResultShareCard(canvas, {
      firstName: name,
      score: correct,
      totalQuestions: total,
      subject,
      rankPosition: rank,
      participantCount,
      bestScoreThisWeek,
      referralCode,
      siteHost: window.location.host,
      layout: isSolo ? "landscape" : "portrait",
    });
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Your browser could not save the share card."));
      }, "image/png");
    });
    return new File([blob], "rockcbt-quiz-result.png", { type: "image/png" });
  };

  const downloadCard = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = fileUrl;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  };

  const handleShare = async () => {
    const name = validateName();
    if (!name || shareBusy) return;
    setShareBusy(true);
    void recordEvent("share_clicked");
    try {
      const link = await makeShareLink(name, "share");
      if (!link) return;
      const placement = rankText ? ` and ranked ${rankText}` : "";
      const shareData: ShareData = {
        title: "Can you beat my RockCBT score?",
        text: `${name} scored ${correct}/${total} in ${subject}${placement}. Can you beat my score?`,
        url: link,
      };
      if (navigator.share) {
        const file = await makeCardFile(name);
        if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
        await navigator.share(shareData);
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        void recordEvent("link_copied");
        toast({ title: "Challenge link copied", description: "Share it with any app you like." });
      } catch {
        toast({
          title: "Copy your challenge link",
          description: link,
          variant: "destructive",
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast({
        title: "Could not share your result",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyLink = async () => {
    const name = validateName();
    if (!name || shareBusy) return;
    setShareBusy(true);
    try {
      const link = await makeShareLink(name, "share");
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        void recordEvent("link_copied");
        toast({ title: "Copied", description: "Your challenge link is ready to share." });
      } catch {
        toast({ title: "Copy your challenge link", description: link, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "Could not create your result link",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const handleSaveImage = async () => {
    const name = validateName();
    if (!name || shareBusy) return;
    setShareBusy(true);
    try {
      const file = await makeCardFile(name);
      downloadCard(file);
      void recordEvent("share_card_saved");
      toast({ title: "Share card saved", description: "Your result image is ready to post." });
    } catch (error) {
      toast({
        title: "Could not save your share card",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setShareBusy(false);
    }
  };

  const shareDisabled = shareBusy || !referralCode;

  return (
    <section className="quiz-results-mobile-shell" aria-label="Quiz results">
      <header className="quiz-results-mobile-header">
        <div className="quiz-results-mobile-title">
          {!isSolo && <p>LIVE QUIZ RESULTS</p>}
          <h1 title={roomCode ? `${subject} · Room ${roomCode}` : subject}>
            {isSolo ? subject : `${subject} · Quiz room`}
          </h1>
        </div>
        {!isSolo && <div className="quiz-results-mobile-quick-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Create another quiz"
            title="Create another quiz"
            onClick={onCreateAnother}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Go to dashboard"
            title="Go to dashboard"
            onClick={onDashboard}
          >
            <LayoutDashboard aria-hidden="true" />
          </Button>
        </div>}
      </header>

      <section className="quiz-results-mobile-score">
        <div className="quiz-results-mobile-score-ring" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <circle className="quiz-results-mobile-score-accent" cx="50" cy="50" r="47" />
            <circle className="quiz-results-mobile-score-track" cx="50" cy="50" r={isSolo ? 39 : 43} />
            <circle
              className="quiz-results-mobile-score-progress"
              cx="50"
              cy="50"
              r={isSolo ? 39 : 43}
              style={{ strokeDasharray: `${(accuracy * scoreRingCircumference) / 100} ${scoreRingCircumference}` }}
            />
          </svg>
          <div>
            <span>You scored</span>
            <strong>{correct}<small>/{total}</small></strong>
          </div>
        </div>
        <p className="quiz-results-mobile-encouragement">
          {accuracy >= 70
            ? "Excellent work. Keep building on this result!"
            : accuracy >= 40
              ? "Good effort. A little more practice will help."
              : "Every score is a starting point. Keep practising!"}
        </p>
      </section>

      <section className="quiz-results-mobile-stats" aria-label="Your quiz statistics">
        <div>
          {rankText
            ? <><Star aria-hidden="true" /><span>Rank</span><strong>{rankText}</strong></>
            : <><Star aria-hidden="true" /><span>Rank</span><strong>—</strong></>}
        </div>
        <div><Target aria-hidden="true" /><span>Accuracy</span><strong>{accuracy}%</strong></div>
        <div><Clock aria-hidden="true" /><span>Time used</span><strong>{formattedTime}</strong></div>
      </section>

      {weakestTopic && (
        <button
          type="button"
          className="quiz-results-mobile-weakspot"
          onClick={() => navigate("/select-subjects?mode=practice")}
          aria-label={`Practice ${weakestTopic.topic}, your lowest-scoring topic`}
        >
          <span className="quiz-results-mobile-weakspot-icon"><Zap aria-hidden="true" /></span>
          <span className="quiz-results-mobile-weakspot-copy">
            <small>Weak spot</small>
            <strong>{weakestTopic.topic}, {weakestTopic.accuracy}%</strong>
          </span>
          <span className="quiz-results-mobile-practice">Practice topic</span>
          <ArrowUpRight aria-hidden="true" className="quiz-results-mobile-practice-icon" />
        </button>
      )}

      <section className="quiz-results-mobile-share" aria-label="Share your score">
        <div className="quiz-results-mobile-card-preview">
          <canvas
            ref={canvasRef}
            className="quiz-results-mobile-card-canvas"
            aria-label={`${getFirstName(firstName)} scored ${correct} out of ${total} in ${subject}. Referral code ${referralCode}.`}
          />
        </div>
        <div className="quiz-results-mobile-share-details">
          <p className="quiz-results-mobile-referral-heading">
            Friends who join earn you <strong>₦500</strong> each
          </p>
          <div className="quiz-results-mobile-referral-field">
            <label htmlFor="quiz-share-first-name">Your name:</label>
            <Input
              id="quiz-share-first-name"
              value={firstName}
              maxLength={32}
              autoComplete="given-name"
              onChange={(event) => {
                setNameEdited(true);
                setFirstName(event.target.value);
              }}
              placeholder="Enter your first name"
              aria-label="First name shown on the share card"
            />
          </div>
          <div className="quiz-results-mobile-referral-field">
            <label htmlFor="quiz-share-referral-code">Referral code:</label>
            <Input id="quiz-share-referral-code" value={referralCode} readOnly aria-label="Your account referral code" />
          </div>
        </div>
      </section>

      <nav className="quiz-results-mobile-share-actions" aria-label="Share your score">
        <Button type="button" className="quiz-share-button" disabled={shareDisabled} onClick={() => void handleShare()}>
          <Share2 aria-hidden="true" /> {shareBusy ? "Preparing..." : "Share"}
        </Button>
        <Button type="button" variant="outline" className="quiz-share-copy" disabled={shareDisabled} onClick={() => void handleCopyLink()}>
          <Copy aria-hidden="true" /> Copy link
        </Button>
        <Button
          type="button"
          className="quiz-share-save"
          disabled={shareDisabled}
          onClick={() => void handleSaveImage()}
          aria-label="Save share image"
          title="Save share image"
        >
          <ImageIcon aria-hidden="true" />
        </Button>
        {rematchAvailable && (
          <Button
            type="button"
            variant="outline"
            className="quiz-share-rematch"
            disabled={shareBusy || rematchLoading}
            onClick={onRematch}
          >
            <Share2 aria-hidden="true" /> {rematchLoading ? "Preparing..." : "Rematch"}
          </Button>
        )}
      </nav>
    </section>
  );
};

export default QuizResultMobileShare;
