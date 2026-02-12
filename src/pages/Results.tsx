import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Trophy, Target, Clock, ArrowLeft, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

const Results = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [topicBreakdown, setTopicBreakdown] = useState<Record<string, { correct: number; total: number }>>({});

  useEffect(() => {
    if (!user || !sessionId) return;

    const fetchResults = async () => {
      const { data: sess } = await supabase
        .from("exam_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (sess) setSession(sess);

      const { data: history } = await supabase
        .from("user_history")
        .select("*, questions(*)")
        .eq("session_id", sessionId);

      if (history) {
        const breakdown: Record<string, { correct: number; total: number }> = {};
        history.forEach((h: any) => {
          const topic = h.questions?.topic || "Unknown";
          if (!breakdown[topic]) breakdown[topic] = { correct: 0, total: 0 };
          breakdown[topic].total++;
          if (h.is_correct) breakdown[topic].correct++;
        });
        setTopicBreakdown(breakdown);
      }
    };
    fetchResults();
  }, [user, sessionId]);

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  const score = Number(session.score_percentage) || 0;
  const grade = score >= 70 ? "A" : score >= 60 ? "B" : score >= 50 ? "C" : score >= 40 ? "D" : "F";
  const duration = session.duration_seconds || 0;
  const mins = Math.floor(duration / 60);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Results</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Score Card */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="border-border/50 overflow-hidden">
            <CardContent className="p-6 text-center">
              <div className="relative inline-flex items-center justify-center w-24 h-24 mb-4">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="hsl(var(--primary))" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${score * 2.64} 264`}
                  />
                </svg>
                <span className="absolute text-xl font-bold">{Math.round(score)}%</span>
              </div>
              <p className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Grade: {grade}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {session.correct_answers}/{session.total_questions} correct · {mins} min
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-3 text-center">
              <Trophy className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{session.correct_answers}</p>
              <p className="text-[10px] text-muted-foreground">Correct</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-3 text-center">
              <Target className="h-4 w-4 mx-auto mb-1 text-destructive" />
              <p className="text-sm font-bold">{session.total_questions - session.correct_answers}</p>
              <p className="text-[10px] text-muted-foreground">Wrong</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-3 text-center">
              <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm font-bold">{mins}m</p>
              <p className="text-[10px] text-muted-foreground">Duration</p>
            </CardContent>
          </Card>
        </div>

        {/* Topic Breakdown */}
        {Object.keys(topicBreakdown).length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Topic Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(topicBreakdown).map(([topic, data]) => {
                const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                return (
                  <div key={topic}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{topic}</span>
                      <span className="text-muted-foreground">{data.correct}/{data.total}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Dashboard
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/select-subjects?mode=practice")}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Try Again
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Results;
