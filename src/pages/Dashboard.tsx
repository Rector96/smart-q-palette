import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUBJECTS, EXAM_MODES, type ExamMode } from "@/lib/subjects";
import {
  Trophy, Target, Clock, ChevronRight,
  Sparkles, Flame, Brain, Shield, Crown, Lock, Rocket, BookOpen, Users
} from "lucide-react";
import { motion } from "framer-motion";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import SubscriptionModal from "@/components/SubscriptionModal";
import { Badge } from "@/components/ui/badge";
import DesktopHeader from "@/components/DesktopHeader";
import OnboardingTour, { useOnboardingTour } from "@/components/OnboardingTour";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import SEOHead from "@/components/SEOHead";

const EXAM_MODE_ICONS: Record<string, any> = {
  practice: Brain,
  cbt: Clock,
  mock: BookOpen,
  revision: Flame,
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState({ sessions: 0, avgScore: 0, totalQuestions: 0 });
  const [profile, setProfile] = useState<{ full_name: string | null; trial_count: number; is_subscribed: boolean }>({ full_name: null, trial_count: 0, is_subscribed: false });
  const [streak, setStreak] = useState(0);
  const [progression, setProgression] = useState({ xp: 0, todayQuestions: 0, bestScore: 0 });
  const [focusTopics, setFocusTopics] = useState<Array<{ subject: string; topic: string; correct: number; total: number; accuracy: number }>>([]);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [showSubscription, setShowSubscription] = useState(false);
  const tour = useOnboardingTour();
  useOnlinePresence("dashboard");

  useEffect(() => {
    const verifyPayment = async () => {
      const ref = searchParams.get("reference") || searchParams.get("trxref");
      if (!ref || !user) return;
      try {
        const res = await supabase.functions.invoke("paystack-verify", { body: { reference: ref } });
        if (res.data?.status === "success") {
          toast({ title: "🎉 Payment successful!", description: "Your account has been upgraded to Pro." });
          const { data: prof } = await supabase.from("profiles").select("full_name, trial_count, is_subscribed").eq("user_id", user.id).single();
          if (prof) setProfile(prof);
        }
      } catch {}
    };
    verifyPayment();
  }, [searchParams, user]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: prof } = await supabase.from("profiles").select("full_name, trial_count, is_subscribed").eq("user_id", user.id).single();
      if (prof) setProfile(prof);
      const [{ data: sessions }, { data: masteryRows }, { count: dueCount }] = await Promise.all([
        supabase.from("exam_sessions").select("*").eq("user_id", user.id).eq("completed", true).order("completed_at", { ascending: false }),
        supabase.from("student_topic_mastery").select("subject, topic, attempts, correct_answers, last_attempt_at").eq("user_id", user.id).order("last_attempt_at", { ascending: false }),
        supabase.from("student_question_reviews").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due_at", new Date().toISOString()),
      ]);
      setDueReviewCount(dueCount || 0);
      setFocusTopics((masteryRows || [])
        .filter((item: any) => item.attempts >= 3)
        .map((item: any) => ({
          subject: item.subject,
          topic: item.topic,
          correct: item.correct_answers,
          total: item.attempts,
          accuracy: Math.round(item.correct_answers / item.attempts * 100),
        }))
        .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
        .slice(0, 1));
      if (sessions && sessions.length > 0) {
        const avg = sessions.reduce((sum, s) => sum + (Number(s.score_percentage) || 0), 0) / sessions.length;
        const total = sessions.reduce((sum, s) => sum + s.total_questions, 0);
        setStats({ sessions: sessions.length, avgScore: Math.round(avg), totalQuestions: total });
        const correctAnswers = sessions.reduce((sum, session) => sum + (Number(session.correct_answers) || 0), 0);
        const xp = correctAnswers * 10 + sessions.length * 25;
        const todayKey = new Date().toLocaleDateString("en-CA");
        const todayQuestions = sessions.reduce((sum, session) => {
          const sessionDay = session.completed_at ? new Date(session.completed_at).toLocaleDateString("en-CA") : "";
          return sum + (sessionDay === todayKey ? Number(session.total_questions) || 0 : 0);
        }, 0);
        setProgression({
          xp,
          todayQuestions,
          bestScore: Math.round(Math.max(...sessions.map((session) => Number(session.score_percentage) || 0))),
        });
        let s = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (let i = 0; i < 30; i++) {
          const day = new Date(today); day.setDate(day.getDate() - i);
          const dayStr = day.toISOString().split("T")[0];
          const hasSession = sessions.some((sess) => sess.completed_at && sess.completed_at.startsWith(dayStr));
          if (hasSession) s++; else if (i > 0) break;
        }
        setStreak(s);
      }
    };
    fetchData();
  }, [user]);

  const attemptsLeft = Math.max(0, 10 - profile.trial_count);
  const isPro = profile.is_subscribed;

  const handleStartTest = () => {
    if (!isPro && attemptsLeft <= 0) {
      setShowSubscription(true);
      return;
    }
    navigate("/select-subjects?mode=practice");
  };

  const statCards = [
    { icon: Trophy, label: "Sessions", value: stats.sessions, color: "text-primary" },
    { icon: Target, label: "Avg Score", value: `${stats.avgScore}%`, color: "text-[hsl(var(--success))]" },
    { icon: Clock, label: "Questions", value: stats.totalQuestions, color: "text-primary" },
    { icon: Flame, label: "Streak", value: `${streak} days`, color: "text-warning" },
  ];

  const allModeCards = [
    ...EXAM_MODES.map(m => ({ id: m.id, name: m.name, description: m.description, icon: EXAM_MODE_ICONS[m.id] || Brain, action: () => navigate(`/select-subjects?mode=${m.id}`) })),
    { id: "library", name: "Library", description: "Study materials & books", icon: BookOpen, action: () => navigate("/library") },
    { id: "live-quiz", name: "Live Quiz", description: "Real-time quiz battles", icon: Users, action: () => navigate("/live-quiz") },
  ];

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background">
      <SEOHead title="Dashboard – Weblines CBT" description="Your personalized exam dashboard. Track progress, start practice sessions, and access all features." path="/dashboard" />
      <DesktopHeader profileName={profile.full_name} isPro={isPro} />
      <main className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-4 lg:px-6 lg:py-6">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">
                Welcome back{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋
              </h1>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                {isPro ? "You have unlimited access. Keep crushing it!" : `You have ${attemptsLeft} free attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`}
              </p>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              {isPro ? (
                <Badge variant="default" className="text-[10px] h-5 gap-1 bg-primary/10 text-primary border-primary/20">
                  <Crown className="h-3 w-3" /> Pro
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  Free · {attemptsLeft}/10
                </Badge>
              )}
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => navigate("/admin")}>
                  <Shield className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Start Practice Test CTA */}
        <motion.div whileTap={{ scale: 0.98 }} data-tour="start-test">
          <Button className="w-full h-12 lg:h-14 text-sm lg:text-base gap-2 rounded-xl shadow-md bg-primary hover:bg-primary/90 justify-between px-5" onClick={handleStartTest}>
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              <span className="font-semibold">Start Practice Test</span>
            </div>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </motion.div>

        {/* Spaced revision: one clear action, with transparent repeat intervals */}
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Flame className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Revision due</p>
              <p className="text-xs text-muted-foreground">{dueReviewCount > 0 ? `${dueReviewCount} question${dueReviewCount === 1 ? "" : "s"} ready to repeat` : "You are up to date. Keep practising to build your revision list."}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Repeat intervals: 1 → 3 → 7 → 14 → 30 days</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 rounded-lg" onClick={() => navigate("/select-subjects?mode=revision")}>
              Revise <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* AI Tutor Card */}
        <Card data-tour="ai-tutor" className="border-border/50 bg-card shadow-sm cursor-pointer hover:shadow-md transition-shadow rounded-2xl" onClick={() => navigate("/ai-tutor")}>
          <CardContent className="p-3 lg:p-4 flex items-center gap-3 lg:gap-4">
            <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 lg:h-6 lg:w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">AI Tutor</p>
              <p className="text-[11px] lg:text-xs text-muted-foreground leading-relaxed">Get instant help with any topic. Your personal AI study companion is ready!</p>
            </div>
            <span className="text-[10px] text-[hsl(var(--success))] font-semibold whitespace-nowrap">● Online</span>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <Card className="border-border/50 shadow-sm rounded-2xl">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
              {statCards.map((stat) => (
                <div key={stat.label} className="px-2 py-2 text-center sm:py-0">
                  <stat.icon className={`h-4 w-4 lg:h-5 lg:w-5 mx-auto mb-1 ${stat.color}`} />
                  <p className="text-base lg:text-lg font-bold leading-tight">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Student progression: earned from completed exam activity */}
        <Card className="overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Your learning journey</p>
                <h2 className="mt-1 text-lg font-extrabold">Level {Math.floor(progression.xp / 500) + 1} learner</h2>
                <p className="text-xs text-muted-foreground">{progression.xp.toLocaleString()} XP earned · {Math.max(0, 500 - (progression.xp % 500))} XP to next level</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progression.xp % 500 / 5}%` }} />
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold"><Target className="h-4 w-4 text-primary" /> Daily mission</div>
                <Badge variant="secondary">{Math.min(20, progression.todayQuestions)}/20 questions</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Complete 20 questions today to build your learning consistency.</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-[hsl(var(--success))] transition-all" style={{ width: `${Math.min(100, progression.todayQuestions / 20 * 100)}%` }} />
              </div>
              {progression.todayQuestions >= 20 && <p className="mt-2 text-xs font-semibold text-[hsl(var(--success))]">Mission complete — excellent work!</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "First session", earned: stats.sessions >= 1, icon: "🎯" },
                { label: "100 questions", earned: stats.totalQuestions >= 100, icon: "📚" },
                { label: "80% best score", earned: progression.bestScore >= 80, icon: "⭐" },
                { label: "3-day streak", earned: streak >= 3, icon: "🔥" },
              ].filter((badge) => badge.earned).map((badge) => (
                <Badge key={badge.label} variant="outline" className="gap-1 rounded-full border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px]">
                  <span>{badge.icon}</span>{badge.label}
                </Badge>
              ))}
              {stats.sessions === 0 && <span className="text-[11px] text-muted-foreground">Complete your first practice session to unlock your first badge.</span>}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations from the student's real answer history */}
        {focusTopics.length > 0 && (
          <Card className="rounded-2xl border-amber-500/20 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10"><Brain className="h-5 w-5 text-amber-600" /></div>
                <div><h2 className="text-sm font-bold">Your focus areas</h2><p className="text-[11px] text-muted-foreground">Based on your recent answers · up to 1,000 attempts</p></div>
              </div>
              {focusTopics.map((item) => (
                <div key={`${item.subject}::${item.topic}`} className="rounded-xl border border-border/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-sm font-semibold">{item.topic}</p><p className="text-[11px] text-muted-foreground">{item.subject} · {item.correct}/{item.total} correct</p></div>
                    <Badge variant={item.accuracy < 40 ? "destructive" : "secondary"}>{item.accuracy}%</Badge>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-amber-500" style={{ width: `${item.accuracy}%` }} /></div>
                  <Button size="sm" variant="outline" className="mt-3 h-9 w-full rounded-lg text-xs" onClick={() => navigate(`/select-subjects?mode=practice&subject=${encodeURIComponent(item.subject)}`)}>Practise {item.subject}</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {focusTopics.length === 0 && stats.sessions > 0 && (
          <Card className="rounded-2xl border-border/60 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><Target className="h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Keep building your learning profile</p><p className="text-xs text-muted-foreground">Answer at least three questions in a topic to unlock a targeted practice recommendation.</p></div></CardContent></Card>
        )}

        {/* Upgrade Banner */}
        {!isPro && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-primary/20 bg-primary/5 shadow-sm cursor-pointer hover:shadow-md transition-shadow rounded-2xl" onClick={() => setShowSubscription(true)}>
              <CardContent className="p-3 flex items-center gap-3">
                <Crown className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold">Upgrade to Pro — ₦2,000</p>
                  <p className="text-[10px] text-muted-foreground">Unlock unlimited exams, AI tutor & more</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Exam Modes */}
        <div data-tour="exam-modes">
          <h2 className="text-base lg:text-lg font-bold mb-3">Exam Modes</h2>
          <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
            {allModeCards.map((mode) => {
              const Icon = mode.icon;
              const locked = !isPro && attemptsLeft <= 0 && mode.id !== "revision" && mode.id !== "library" && mode.id !== "live-quiz";
              return (
                <motion.div key={mode.id} whileTap={{ scale: 0.98 }} data-tour={mode.id === "library" ? "library" : mode.id === "set-quiz" ? "set-quiz" : mode.id === "live-quiz" ? "live-quiz" : undefined}>
                  <Card
                    className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-xl h-full"
                    onClick={() => {
                      if (locked) { setShowSubscription(true); return; }
                      mode.action();
                    }}
                  >
                    <CardContent className="p-3 lg:p-4 flex items-center gap-3">
                      <div className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 lg:h-5 lg:w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs lg:text-sm">{mode.name}</p>
                        <p className="text-[10px] lg:text-[11px] text-muted-foreground truncate">{mode.description}</p>
                      </div>
                      {locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Subjects */}
        <div data-tour="subjects">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base lg:text-lg font-bold">Subjects</h2>
          </div>
          <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
            {SUBJECTS.map((subject) => (
              <motion.div key={subject.id} whileTap={{ scale: 0.96 }}>
                <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-xl" onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}>
                  <CardContent className="p-2.5 lg:p-3 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <subject.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] lg:text-xs font-semibold truncate">{subject.name}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{subject.name} ›</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />
      <OnboardingTour active={tour.active} onDismiss={tour.dismiss} />
    </div>
  );
};

export default Dashboard;
