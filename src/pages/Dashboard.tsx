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
    <div className="min-h-[100dvh] overflow-x-clip bg-background">
      <SEOHead title="Dashboard – ROCKCBT" description="Your personalized exam dashboard. Track progress, start practice sessions, and access all features." path="/dashboard" />
      <DesktopHeader profileName={profile.full_name} isPro={isPro} />
      <main className="mx-auto max-w-4xl space-y-5 px-3 pt-5 pb-28 sm:px-4 lg:px-6 lg:py-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">Welcome back{getSurname(profile.full_name) ? `, ${getSurname(profile.full_name)}` : ""} 👋</h1>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                {isPro ? "You have unlimited access. Keep crushing it!" : `You have ${attemptsLeft} free attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`}
              </p>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              {isPro ? <Badge variant="default" className="text-[10px] h-5 gap-1 bg-primary/10 text-primary border-primary/20"><Crown className="h-3 w-3" /> Pro</Badge> : <Badge variant="outline" className="text-[10px] h-5 gap-1">Free · {attemptsLeft}/10</Badge>}
              {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => navigate("/admin")}><Shield className="h-4 w-4" /></Button>}
            </div>
          </div>
        </motion.div>

        <Card className="rounded-2xl border-primary/20 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/referrals")}><CardContent className="flex items-center gap-3 p-3.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Gift className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold">Refer & Earn ₦500</p><p className="text-xs text-muted-foreground">Invite friends and earn when they become paid members.</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></CardContent></Card>

        <motion.div whileTap={{ scale: 0.98 }} data-tour="start-test">
          <Button className="w-full h-12 lg:h-14 text-sm lg:text-base gap-2 rounded-xl shadow-md bg-primary hover:bg-primary/90 justify-between px-5" onClick={handleStartTest}>
            <div className="flex items-center gap-2"><Rocket className="h-5 w-5" /><span className="font-semibold">Start Practice Test</span></div><ChevronRight className="h-5 w-5" />
          </Button>
        </motion.div>

        <Card data-tour="ai-tutor" className="border-border/50 bg-card shadow-sm cursor-pointer hover:shadow-md transition-shadow rounded-2xl" onClick={() => navigate("/ai-tutor")}><CardContent className="p-3 lg:p-4 flex items-center gap-3 lg:gap-4">
          <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5 lg:h-6 lg:w-6 text-primary" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-bold">AI Tutor</p><p className="text-[11px] lg:text-xs text-muted-foreground leading-relaxed">Get instant help with any topic. Your personal AI study companion is ready!</p></div>
          <span className="text-[10px] text-[hsl(var(--success))] font-semibold whitespace-nowrap">● Online</span>
        </CardContent></Card>

        <Card className="border-border/50 shadow-sm rounded-2xl"><CardContent className="p-3"><div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          {statCards.map((stat) => <div key={stat.label} className="px-2 py-2 text-center sm:py-0"><stat.icon className={`h-4 w-4 lg:h-5 lg:w-5 mx-auto mb-1 ${stat.color}`} /><p className="text-base lg:text-lg font-bold leading-tight">{stat.value}</p><p className="text-[10px] text-muted-foreground">{stat.label}</p></div>)}
        </div></CardContent></Card>

        {!isPro && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Card className="border-primary/20 bg-primary/5 shadow-sm cursor-pointer hover:shadow-md transition-shadow rounded-2xl" onClick={() => setShowSubscription(true)}><CardContent className="p-3 flex items-center gap-3"><Crown className="h-5 w-5 text-primary shrink-0" /><div className="flex-1"><p className="text-xs font-semibold">Upgrade to Pro — ₦2,500</p><p className="text-[10px] text-muted-foreground">Unlock unlimited exams, AI tutor & more</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></CardContent></Card></motion.div>}

        <div data-tour="exam-modes"><h2 className="text-base lg:text-lg font-bold mb-3">Exam Modes</h2><div className="grid grid-cols-2 gap-2.5 lg:gap-3">
          {allModeCards.map((mode) => { const Icon = mode.icon; const locked = !isPro && attemptsLeft <= 0 && mode.id !== "revision" && mode.id !== "library" && mode.id !== "live-quiz"; return <motion.div key={mode.id} whileTap={{ scale: 0.98 }} data-tour={mode.id === "library" ? "library" : mode.id === "set-quiz" ? "set-quiz" : mode.id === "live-quiz" ? "live-quiz" : undefined}><Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-xl h-full" onClick={() => { if (locked) { setShowSubscription(true); return; } mode.action(); }}><CardContent className="p-3 lg:p-4 flex items-center gap-3"><div className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 lg:h-5 lg:w-5 text-primary" /></div><div className="flex-1 min-w-0"><p className="font-bold text-xs lg:text-sm">{mode.name}</p><p className="text-[10px] lg:text-[11px] text-muted-foreground truncate">{mode.description}</p></div>{locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}</CardContent></Card></motion.div>; })}
        </div></div>

        <div data-tour="subjects"><div className="flex items-center justify-between mb-3"><h2 className="text-base lg:text-lg font-bold">Subjects</h2></div><div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
          {SUBJECTS.map((subject) => <motion.div key={subject.id} whileTap={{ scale: 0.96 }}><Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-xl" onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}><CardContent className="p-2.5 lg:p-3 flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><subject.icon className="h-4 w-4 text-primary" /></div><div className="min-w-0"><p className="text-[11px] lg:text-xs font-semibold truncate">{subject.name}</p><p className="text-[9px] text-muted-foreground truncate">{subject.name} ›</p></div></CardContent></Card></motion.div>)}
        </div></div>
      </main>
      <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />
      <OnboardingTour active={tour.active} onDismiss={tour.dismiss} />
    </div>
  );
};

export default Dashboard;
