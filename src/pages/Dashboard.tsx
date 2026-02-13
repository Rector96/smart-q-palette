import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUBJECTS, EXAM_MODES, type ExamMode } from "@/lib/subjects";
import {
  LogOut, Trophy, Target, Clock, ChevronRight, ChevronLeft,
  Sparkles, Flame, Brain, Shield, Crown, Lock
} from "lucide-react";
import { motion } from "framer-motion";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import Logo from "@/components/Logo";
import SubscriptionModal from "@/components/SubscriptionModal";
import { Badge } from "@/components/ui/badge";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [stats, setStats] = useState({ sessions: 0, avgScore: 0, totalQuestions: 0 });
  const [profile, setProfile] = useState<{ full_name: string | null; trial_count: number; is_subscribed: boolean }>({ full_name: null, trial_count: 0, is_subscribed: false });
  const [streak, setStreak] = useState(0);
  const [showSubscription, setShowSubscription] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

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
      const { data: sessions } = await supabase.from("exam_sessions").select("*").eq("user_id", user.id).eq("completed", true).order("completed_at", { ascending: false });
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
    fetchData();
  }, [user]);

  const attemptsLeft = Math.max(0, 2 - profile.trial_count);
  const isPro = profile.is_subscribed;

  const handleStartTest = () => {
    if (!isPro && attemptsLeft <= 0) {
      setShowSubscription(true);
      return;
    }
    navigate("/select-subjects?mode=practice");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Link to="/"><Logo size="sm" /></Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isPro ? (
              <Badge variant="default" className="text-[10px] h-5 gap-1 bg-primary/10 text-primary border-primary/20">
                <Crown className="h-3 w-3" /> Pro
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5 gap-1">
                Free · {attemptsLeft}/2 left
              </Badge>
            )}
            <span className="text-xs text-muted-foreground hidden sm:block">{profile.full_name || user?.email}</span>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="h-8 text-xs">
                <Shield className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-8 text-xs"><LogOut className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-lg font-bold">Welcome back{profile.full_name ? `, ${profile.full_name}` : ""} 👋</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isPro ? "You have unlimited access. Keep crushing it!" : `You have ${attemptsLeft} free attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-3">
          <Button className="h-12 text-sm justify-start gap-2 shadow-md" onClick={handleStartTest}>
            {!isPro && attemptsLeft <= 0 ? <Lock className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
            Start Practice Test
          </Button>
          <Button variant="outline" className="h-12 text-sm justify-start gap-2 shadow-sm" onClick={() => navigate("/ai-tutor")}>
            <Sparkles className="h-4 w-4" /> Ask AI Tutor
          </Button>
        </div>

        {!isPro && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-primary/20 bg-primary/5 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowSubscription(true)}>
              <CardContent className="p-3 flex items-center gap-3">
                <Crown className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold">Upgrade to Pro — ₦1,500</p>
                  <p className="text-[10px] text-muted-foreground">Unlock unlimited exams, AI tutor & more</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Trophy, label: "Sessions", value: stats.sessions, color: "text-primary" },
            { icon: Target, label: "Avg Score", value: `${stats.avgScore}%`, color: "text-primary" },
            { icon: Clock, label: "Questions", value: stats.totalQuestions, color: "text-primary" },
            { icon: Flame, label: "Streak", value: `${streak} days`, color: "text-warning" },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50 shadow-sm">
              <CardContent className="p-3 text-center">
                <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border/50 bg-primary/5 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/ai-tutor")}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">AI Tutor</p>
              <p className="text-[11px] text-muted-foreground">Get instant help with any topic. Your personal AI study companion is ready!</p>
            </div>
            <span className="text-[10px] text-success font-medium">● Online</span>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-sm font-semibold mb-3">Choose Exam Mode</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAM_MODES.map((mode) => (
              <motion.div key={mode.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md" onClick={() => {
                  if (!isPro && attemptsLeft <= 0 && mode.id !== "revision") {
                    setShowSubscription(true);
                    return;
                  }
                  navigate(`/select-subjects?mode=${mode.id}`);
                }}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{mode.name}</p>
                      <p className="text-[11px] text-muted-foreground">{mode.description}</p>
                    </div>
                    {!isPro && attemptsLeft <= 0 && mode.id !== "revision" ? (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-3">Subjects</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {SUBJECTS.map((subject) => (
              <motion.div key={subject.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md" onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}>
                  <CardContent className="p-3 text-center">
                    <subject.icon className="h-5 w-5 mx-auto mb-1.5 text-primary" />
                    <p className="text-[10px] font-medium leading-tight">{subject.name}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />
    </div>
  );
};

export default Dashboard;
