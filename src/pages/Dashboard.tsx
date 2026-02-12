import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SUBJECTS, EXAM_MODES, type ExamMode } from "@/lib/subjects";
import { BookOpen, LogOut, Trophy, Target, Clock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ sessions: 0, avgScore: 0, totalQuestions: 0 });
  const [profile, setProfile] = useState<{ full_name: string | null }>({ full_name: null });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();
      if (prof) setProfile(prof);

      const { data: sessions } = await supabase
        .from("exam_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("completed", true);

      if (sessions && sessions.length > 0) {
        const avg = sessions.reduce((sum, s) => sum + (Number(s.score_percentage) || 0), 0) / sessions.length;
        const total = sessions.reduce((sum, s) => sum + s.total_questions, 0);
        setStats({ sessions: sessions.length, avgScore: Math.round(avg), totalQuestions: total });
      }
    };
    fetchData();
  }, [user]);

  const handleStartExam = (mode: ExamMode) => {
    navigate(`/select-subjects?mode=${mode}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>SmartCBT</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {profile.full_name || user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="h-8 text-xs">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Welcome back{profile.full_name ? `, ${profile.full_name}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Ready to ace your next exam?</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Trophy, label: "Sessions", value: stats.sessions, color: "text-primary" },
            { icon: Target, label: "Avg Score", value: `${stats.avgScore}%`, color: "text-primary" },
            { icon: Clock, label: "Questions", value: stats.totalQuestions, color: "text-primary" },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-3 text-center">
                <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Exam Modes */}
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Choose Exam Mode
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAM_MODES.map((mode) => (
              <motion.div key={mode.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Card
                  className="cursor-pointer border-border/50 hover:border-primary/30 transition-colors"
                  onClick={() => handleStartExam(mode.id)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{mode.name}</p>
                      <p className="text-[11px] text-muted-foreground">{mode.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Quick Subject Access */}
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Subjects
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {SUBJECTS.map((subject) => (
              <motion.div key={subject.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Card
                  className="cursor-pointer border-border/50 hover:border-primary/30 transition-colors"
                  onClick={() => navigate(`/select-subjects?mode=practice&subject=${subject.id}`)}
                >
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
    </div>
  );
};

export default Dashboard;
