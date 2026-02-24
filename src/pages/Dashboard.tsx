import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUBJECTS, EXAM_MODES, type ExamMode } from "@/lib/subjects";
import {
  Trophy, Target, Clock, ChevronRight,
  Sparkles, Flame, Brain, Shield, Crown, Lock, Rocket, BookOpen
} from "lucide-react";
import { motion } from "framer-motion";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import SubscriptionModal from "@/components/SubscriptionModal";
import { Badge } from "@/components/ui/badge";

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
  const [showSubscription, setShowSubscription] = useState(false);

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

  const attemptsLeft = Math.max(0, 3 - profile.trial_count);
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

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Welcome back{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPro ? "You have unlimited access. Keep crushing it!" : `You have ${attemptsLeft} free attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPro ? (
                <Badge variant="default" className="text-[10px] h-5 gap-1 bg-primary/10 text-primary border-primary/20">
                  <Crown className="h-3 w-3" /> Pro
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-5 gap-1">
                  Free · {attemptsLeft}/3
                </Badge>
              )}
              {isAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/admin")}>
                  <Shield className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Primary Actions */}
        <div className="flex gap-3">
          <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
            <Button className="w-full h-12 text-sm gap-2 rounded-xl shadow-md bg-primary hover:bg-primary/90" onClick={handleStartTest}>
              <Rocket className="h-4 w-4" />
              Start Practice Test
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button variant="outline" className="h-12 px-4 text-sm gap-2 rounded-xl shadow-sm border-border/50" onClick={() => navigate("/ai-tutor")}>
              <Sparkles className="h-4 w-4 text-primary" />
              Ask AI Tutor
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        </div>

        {/* AI Tutor Card */}
        <Card className="border-border/50 bg-card shadow-sm cursor-pointer hover:shadow-md transition-shadow rounded-2xl" onClick={() => navigate("/ai-tutor")}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">AI Tutor</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">Get instant help with any topic. Your personal AI study companion is ready!</p>
            </div>
            <span className="text-[10px] text-[hsl(var(--success))] font-semibold whitespace-nowrap">● Online</span>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <Card className="border-border/50 shadow-sm rounded-2xl">
          <CardContent className="p-3">
            <div className="grid grid-cols-4 divide-x divide-border">
              {statCards.map((stat) => (
                <div key={stat.label} className="text-center px-2">
                  <stat.icon className={`h-5 w-5 mx-auto mb-1 ${stat.color}`} />
                  <p className="text-lg font-bold leading-tight">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upgrade Banner */}
        {!isPro && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-primary/20 bg-primary/5 shadow-sm cursor-pointer hover:shadow-md transition-shadow rounded-2xl" onClick={() => setShowSubscription(true)}>
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

        {/* Exam Modes */}
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Choose Exam Mode</h2>
          <div className="grid grid-cols-2 gap-3">
            {EXAM_MODES.map((mode) => {
              const Icon = EXAM_MODE_ICONS[mode.id] || Brain;
              const locked = !isPro && attemptsLeft <= 0 && mode.id !== "revision";
              return (
                <motion.div key={mode.id} whileTap={{ scale: 0.98 }}>
                  <Card
                    className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-2xl"
                    onClick={() => {
                      if (locked) { setShowSubscription(true); return; }
                      navigate(`/select-subjects?mode=${mode.id}`);
                    }}
                  >
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{mode.name}</p>
                        <p className="text-[10px] text-muted-foreground">{mode.description}</p>
                      </div>
                      {locked ? <Lock className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Subjects */}
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Subjects</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
            {SUBJECTS.map((subject) => (
              <motion.div key={subject.id} whileTap={{ scale: 0.96 }}>
                <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-2xl" onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}>
                  <CardContent className="p-3 text-center">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
                      <subject.icon className="h-5 w-5 text-primary" />
                    </div>
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
