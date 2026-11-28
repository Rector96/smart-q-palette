import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUBJECTS, EXAM_MODES, type ExamMode } from "@/lib/subjects";
import {
  Trophy, Target, Clock, ChevronRight, Share2,
  Sparkles, Flame, Brain, Shield, Crown, Lock, BookOpen, Users, Gift, Search
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
import "./Dashboard.css";
import type { LucideIcon } from "lucide-react";

const EXAM_MODE_ICONS: Record<ExamMode, LucideIcon> = {
  practice: Brain,
  cbt: Clock,
  mock: BookOpen,
  revision: Flame,
};

const getSurname = (fullName: string | null) => {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState({ sessions: 0, avgScore: 0, totalQuestions: 0 });
  const [subjectSearch, setSubjectSearch] = useState("");
  const [profile, setProfile] = useState<{ full_name: string | null; trial_count: number; is_subscribed: boolean }>({ full_name: null, trial_count: 0, is_subscribed: false });
  const [streak, setStreak] = useState(0);
  const [showSubscription, setShowSubscription] = useState(false);
  const verifiedReferences = useRef(new Set<string>());
  const tour = useOnboardingTour();
  useOnlinePresence("dashboard");

  useEffect(() => {
    const verifyPayment = async () => {
      const ref = searchParams.get("reference") || searchParams.get("trxref");
      if (!ref || !user || verifiedReferences.current.has(ref)) return;
      verifiedReferences.current.add(ref);
      try {
        const { data, error } = await supabase.functions.invoke("paystack-verify", { body: { reference: ref } });
        if (error) throw error;
        if (data?.status === "success") {
          const { data: prof, error: profileError } = await supabase.from("profiles")
            .select("full_name, trial_count, is_subscribed").eq("user_id", user.id).single();
          if (profileError) throw profileError;
          if (prof) setProfile(prof);
          toast({ title: "Payment successful", description: "Your Pro access is now active." });
        } else {
          toast({ title: "Payment not confirmed", description: data?.message || "We could not confirm this payment. If money was deducted, contact support with your payment reference.", variant: "destructive" });
        }
      } catch (error: unknown) {
        verifiedReferences.current.delete(ref);
        toast({
          title: "Could not verify payment",
          description: error instanceof Error ? error.message : "Please refresh this page or contact support with your payment reference.",
          variant: "destructive",
        });
      }
    };
    void verifyPayment();
  }, [searchParams, user, toast]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const fetchData = async () => {
      const { data: prof } = await supabase.from("profiles").select("full_name, trial_count, is_subscribed").eq("user_id", user.id).single();
      if (active && prof) setProfile(prof);
      const { data: sessions } = await supabase.from("exam_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("completed", true)
        .order("completed_at", { ascending: false });
      if (!active) return;
      if (sessions && sessions.length > 0) {
        const avg = sessions.reduce((sum, s) => sum + (Number(s.score_percentage) || 0), 0) / sessions.length;
        const total = sessions.reduce((sum, s) => sum + s.total_questions, 0);
        setStats({ sessions: sessions.length, avgScore: Math.round(avg), totalQuestions: total });
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
    void fetchData();
    return () => { active = false; };
  }, [user]);

  const attemptsLeft = Math.max(0, 10 - profile.trial_count);
  const isPro = profile.is_subscribed;

  const handleStartTest = () => {
    if (!isPro && attemptsLeft <= 0) { setShowSubscription(true); return; }
    navigate("/select-subjects?mode=practice");
  };

  const shareRockcbt = async () => {
    const shareData = {
      title: "ROCKCBT — the hottest CBT platform",
      text: "Hey, I'm using ROCKCBT — the hottest CBT platform! Join me for smarter JAMB, WAEC and NECO practice.",
      url: `${window.location.origin}/`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        toast({ title: "ROCKCBT invite copied", description: "Share it with friends to spread the word." });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast({
        title: "Could not share ROCKCBT",
        description: "Please try again or copy the website link.",
        variant: "destructive",
      });
    }
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
  const filteredSubjects = SUBJECTS.filter((subject) =>
    subject.name.toLowerCase().includes(subjectSearch.trim().toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#F8FAFC]">
      <SEOHead title="Dashboard - ROCKCBT" description="Your personalized exam dashboard. Track progress, start practice sessions, and access all features." path="/dashboard" />
      <DesktopHeader profileName={profile.full_name} isPro={isPro} />
      <main className="mx-auto w-full max-w-[1320px] px-3 pb-8 pt-4 sm:px-5 lg:px-6 lg:pb-8 xl:px-7">
        <div className="dashboard-overview">
          <section className="dashboard-welcome relative isolate overflow-hidden rounded-[26px] bg-gradient-to-br from-[#1E40AF] via-[#1D4ED8] to-[#2563EB] p-5 text-white shadow-lg shadow-blue-900/10 sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/15 bg-white/[0.04]" />
            <div className="pointer-events-none absolute right-16 top-20 h-40 w-40 rounded-full border border-white/10 bg-white/[0.04]" />
            <div className="relative z-10 flex h-full flex-col items-start">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-semibold text-blue-50 backdrop-blur-md">
                {isPro ? <><Crown className="h-3.5 w-3.5" /> Pro Member</> : <><Shield className="h-3.5 w-3.5" /> Free Plan · {attemptsLeft}/10 attempts</>}
              </div>
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-3xl">Welcome back{getSurname(profile.full_name) ? `, ${getSurname(profile.full_name)}` : ""} 👋</h1>
              <p className="mt-2 max-w-lg text-xs leading-relaxed text-blue-100 sm:text-sm">
                {isPro ? "You have unlimited access. Keep crushing it!" : `You have ${attemptsLeft} free attempt${attemptsLeft !== 1 ? "s" : ""} remaining. Keep building your confidence!`}
              </p>
              <motion.div whileTap={{ scale: 0.98 }} data-tour="start-test" className="mt-5 flex flex-wrap gap-2">
                <Button className="h-10 rounded-xl bg-white px-4 text-sm font-bold text-blue-800 shadow-sm hover:bg-blue-50" onClick={handleStartTest}>
                  <Sparkles className="mr-2 h-4 w-4" /> Start Practice Test <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-10 rounded-xl border-white/40 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 hover:text-white" onClick={() => void shareRockcbt()}>
                  <Share2 className="mr-2 h-4 w-4" /> Share ROCKCBT
                </Button>
              </motion.div>
            </div>
          </section>

          <Card className="dashboard-performance overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Performance overview</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">Your learning at a glance</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">All time</span>
              </div>
              <div className="dashboard-stat-grid">
                {statCards.map((stat, index) => (
                  <div key={stat.label} className="dashboard-stat-item flex min-w-0 items-center gap-2.5 px-2.5 py-3">
                    {index === 1 ? (
                      <span className="dashboard-score-ring relative flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
                        <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                          <circle cx="20" cy="20" r="16" fill="none" stroke="#E2E8F0" strokeWidth="4" pathLength="100" />
                          <circle cx="20" cy="20" r="16" fill="none" stroke="#22A06B" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.min(100, Math.max(0, stats.avgScore))} 100`} />
                        </svg>
                      </span>
                    ) : (
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index === 2 ? "bg-indigo-50" : index === 3 ? "bg-amber-50" : "bg-blue-50"}`}>
                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-base font-extrabold leading-tight text-slate-900">{stat.value}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">{stat.label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="dashboard-content-grid">
          <div className="dashboard-primary">
            <section data-tour="exam-modes" className="mt-6">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-extrabold tracking-tight text-slate-900">Exam Modes</h2><span className="text-[11px] font-medium text-slate-400">Choose how to study</span></div>
              <div className="dashboard-mode-grid">
                {allModeCards.map((mode, index) => {
                  const Icon = mode.icon;
                  const locked = !isPro && attemptsLeft <= 0 && mode.id !== "revision" && mode.id !== "library" && mode.id !== "live-quiz";
                  const iconColors = ["bg-blue-50 text-blue-600", "bg-cyan-50 text-cyan-700", "bg-violet-50 text-violet-600", "bg-amber-50 text-amber-600", "bg-emerald-50 text-emerald-600", "bg-indigo-50 text-indigo-600"];
                  return (
                    <motion.div key={mode.id} whileTap={{ scale: 0.98 }} data-tour={mode.id === "library" ? "library" : mode.id === "live-quiz" ? "live-quiz" : undefined}>
                      <Card className="h-full cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md" onClick={() => { if (locked) { setShowSubscription(true); return; } mode.action(); }}>
                        <CardContent className="flex h-full items-center gap-3 p-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconColors[index % iconColors.length]}`}><Icon className="h-5 w-5" /></span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1 text-[13px] font-bold text-slate-900">{mode.name}{locked ? <Lock className="h-3 w-3 text-slate-400" /> : null}</span>
                            <span className="mt-1 block text-[11px] leading-4 text-slate-500">{mode.description}</span>
                          </span>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            <section data-tour="subjects" className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-extrabold tracking-tight text-slate-900">Subjects</h2>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{filteredSubjects.length} of {SUBJECTS.length}</span>
                </div>
                <label className="dashboard-subject-search relative block w-full sm:max-w-[260px]">
                  <span className="sr-only">Search subjects</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="Search subjects" className="h-9 rounded-xl border-slate-200 bg-white pl-9 text-xs" />
                </label>
              </div>
              {filteredSubjects.length > 0 ? (
                <div className="dashboard-subject-grid">
                  {filteredSubjects.map((subject, index) => (
                    <motion.div key={subject.id} whileTap={{ scale: 0.97 }}>
                      <Card className="h-full cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-sm" onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}>
                        <CardContent className="dashboard-subject-content flex h-full items-center gap-2.5 p-3">
                          <span className={`dashboard-subject-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${["bg-blue-50 text-blue-600","bg-indigo-50 text-indigo-600","bg-cyan-50 text-cyan-700","bg-violet-50 text-violet-600","bg-emerald-50 text-emerald-600"][index % 5]}`}><subject.icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="dashboard-subject-name block truncate text-xs font-bold text-slate-800">{subject.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-slate-400">Explore questions</span>
                          </span>
                          <ChevronRight className="dashboard-subject-arrow h-3.5 w-3.5 shrink-0 text-slate-300" />
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">No subjects match "{subjectSearch}".</p>
              )}
            </section>
          </div>

          <aside className="dashboard-quick-links" aria-label="Quick actions">
            {!isPro && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="cursor-pointer rounded-2xl border border-blue-100 bg-blue-50/70 shadow-sm transition hover:shadow-md" onClick={() => setShowSubscription(true)}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600"><Crown className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900">Upgrade to Pro — ₦2,500</span><span className="mt-1 block text-[10px] text-slate-500">Unlock unlimited exams, AI tutor &amp; more</span></span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </CardContent>
                </Card>
              </motion.div>
            )}
            <Card data-tour="ai-tutor" className="dashboard-ai-card cursor-pointer overflow-hidden rounded-2xl border border-indigo-100 shadow-sm transition hover:shadow-md" onClick={() => navigate("/ai-tutor")}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600 text-white shadow-sm"><Sparkles className="h-5 w-5" /></span>
                  <Badge className="rounded-full border-0 bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">• Online</Badge>
                </div>
                <h2 className="text-sm font-bold text-slate-900">AI Tutor</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">Get instant help with any topic. Your personal AI study companion is ready!</p>
                <Button variant="outline" className="mt-3 h-9 w-full rounded-xl border-blue-200 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-50" onClick={(event) => { event.stopPropagation(); navigate("/ai-tutor"); }}>
                  Ask AI Tutor <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
            <Card className="cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md" onClick={() => navigate("/referrals")}>
              <CardContent className="p-4">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Gift className="h-5 w-5" /></span>
                <h2 className="text-sm font-bold text-slate-900">Refer &amp; Earn ₦500</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Invite friends and earn when they become paid members.</p>
                <span className="mt-3 inline-flex items-center text-xs font-semibold text-blue-700">Invite Friends <ChevronRight className="ml-1 h-3.5 w-3.5" /></span>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
      <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />
      <OnboardingTour active={tour.active} onDismiss={tour.dismiss} />
    </div>
  );
};

export default Dashboard;
