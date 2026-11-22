import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUBJECTS, EXAM_MODES } from "@/lib/subjects";
import {
  Trophy, Target, Clock, ChevronRight,
  Sparkles, Flame, Brain, Shield, Crown, Lock, Rocket, BookOpen, Users, Gift
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
      } catch (error: any) {
        verifiedReferences.current.delete(ref);
        toast({ title: "Could not verify payment", description: error?.message || "Please refresh this page or contact support with your payment reference.", variant: "destructive" });
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
    <div className="min-h-[100dvh] overflow-x-clip bg-[#F8FAFC]">
      <SEOHead title="Dashboard – ROCKCBT" description="Your personalized exam dashboard. Track progress, start practice sessions, and access all features." path="/dashboard" />
      <DesktopHeader profileName={profile.full_name} isPro={isPro} />
      <main className="mx-auto max-w-5xl px-3 pb-28 pt-4 sm:px-5 lg:px-7 lg:pb-10">
        <section className="relative isolate overflow-hidden rounded-[26px] bg-gradient-to-br from-[#1E40AF] via-[#1D4ED8] to-[#2563EB] px-5 pb-11 pt-6 text-white shadow-lg shadow-blue-900/10 sm:px-7 sm:pt-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/15 bg-white/[0.04]" />
          <div className="pointer-events-none absolute right-16 top-20 h-40 w-40 rounded-full border border-white/10 bg-white/[0.04]" />
          <div className="relative z-10">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-semibold text-blue-50 backdrop-blur-md">
              {isPro ? <><Crown className="h-3.5 w-3.5" /> Pro Member</> : <><Shield className="h-3.5 w-3.5" /> Free Plan · {attemptsLeft}/10 attempts</>}
            </div>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-3xl">Welcome back{getSurname(profile.full_name) ? `, ${getSurname(profile.full_name)}` : ""} 👋</h1>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-blue-100 sm:text-sm">
              {isPro ? "You have unlimited access. Keep crushing it!" : `You have ${attemptsLeft} free attempt${attemptsLeft !== 1 ? "s" : ""} remaining. Keep building your confidence!`}
            </p>
          </div>
        </section>

        <div className="relative z-10 -mt-5 rounded-t-[26px] bg-[#F8FAFC] px-1 pt-5 sm:px-2">
          <motion.div whileTap={{ scale: 0.99 }} data-tour="start-test">
            <Button className="h-[54px] w-full justify-between rounded-full bg-[#2563EB] px-5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-[#1D4ED8]" onClick={handleStartTest}>
              <span className="flex items-center gap-2.5"><Sparkles className="h-5 w-5" /> Start Practice Test</span><ChevronRight className="h-5 w-5" />
            </Button>
          </motion.div>

          <Card className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <CardContent className="grid grid-cols-2 p-1 sm:grid-cols-4">
              {statCards.map((stat, index) => <div key={stat.label} className={`flex items-center gap-3 px-3 py-3.5 ${index < 2 ? "border-b border-slate-100" : ""} ${index % 2 === 0 ? "border-r border-slate-100" : ""} sm:border-b-0 sm:px-4`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${index === 1 ? "bg-emerald-50" : index === 2 ? "bg-indigo-50" : index === 3 ? "bg-amber-50" : "bg-blue-50"}`}><stat.icon className={`h-5 w-5 ${stat.color}`} /></span>
                <span className="min-w-0"><span className="block text-lg font-extrabold leading-tight text-slate-900">{stat.value}</span><span className="mt-0.5 block text-[10px] font-medium text-slate-500">{stat.label}</span></span>
              </div>)}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3">
            <Card className="cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md" onClick={() => navigate("/referrals")}><CardContent className="flex items-center gap-3 p-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Gift className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">Refer &amp; Earn ₦500</span><span className="mt-1 block text-[11px] leading-relaxed text-slate-500">Invite friends and earn when they become paid members.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </CardContent></Card>
            <Card data-tour="ai-tutor" className="cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md" onClick={() => navigate("/ai-tutor")}><CardContent className="flex items-center gap-3 p-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Sparkles className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">AI Tutor</span><span className="mt-1 block text-[11px] leading-relaxed text-slate-500">Get instant help with any topic. Your personal AI study companion is ready!</span></span><Badge className="shrink-0 rounded-full border-0 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50">• Online</Badge>
            </CardContent></Card>
          </div>

          {!isPro && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3"><Card className="cursor-pointer rounded-2xl border border-blue-100 bg-blue-50/70 shadow-sm" onClick={() => setShowSubscription(true)}><CardContent className="flex items-center gap-3 p-3.5"><Crown className="h-5 w-5 shrink-0 text-blue-600" /><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900">Upgrade to Pro — ₦2,500</span><span className="mt-1 block text-[10px] text-slate-500">Unlock unlimited exams, AI tutor &amp; more</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></CardContent></Card></motion.div>}

          <section data-tour="exam-modes" className="mt-6">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-extrabold tracking-tight text-slate-900">Exam Modes</h2><span className="text-[11px] font-medium text-slate-400">Choose how to study</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
              {allModeCards.map((mode) => { const Icon = mode.icon; const locked = !isPro && attemptsLeft <= 0 && mode.id !== "revision" && mode.id !== "library" && mode.id !== "live-quiz"; return <motion.div key={mode.id} whileTap={{ scale: 0.98 }} data-tour={mode.id === "library" ? "library" : mode.id === "set-quiz" ? "set-quiz" : mode.id === "live-quiz" ? "live-quiz" : undefined}><Card className="h-full cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md" onClick={() => { if (locked) { setShowSubscription(true); return; } mode.action(); }}><CardContent className="p-3.5">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></span>
                <span className="flex items-center justify-between gap-1"><span className="text-[13px] font-bold text-slate-900">{mode.name}</span>{locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}</span>
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">{mode.description}</span>
              </CardContent></Card></motion.div>; })}
            </div>
          </section>

          <section data-tour="subjects" className="mt-6">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-extrabold tracking-tight text-slate-900">Subjects</h2><span className="text-[11px] font-medium text-slate-400">{SUBJECTS.length} subjects</span></div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {SUBJECTS.map((subject, index) => <motion.div key={subject.id} whileTap={{ scale: 0.97 }}><Card className="cursor-pointer rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-blue-200" onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}><CardContent className="flex items-center gap-2.5 p-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${["bg-blue-50 text-blue-600","bg-indigo-50 text-indigo-600","bg-cyan-50 text-cyan-700","bg-violet-50 text-violet-600","bg-emerald-50 text-emerald-600"][index % 5]}`}><subject.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{subject.name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">Explore questions</span></span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              </CardContent></Card></motion.div>)}
            </div>
          </section>
        </div>
      </main>
      <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />
      <OnboardingTour active={tour.active} onDismiss={tour.dismiss} />
    </div>
  );
};

export default Dashboard;
