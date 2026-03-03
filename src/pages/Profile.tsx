import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Trophy, Target, Clock, Flame, ChevronRight, LogOut,
  User, Bell, HelpCircle, Pencil, Award
} from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart } from "recharts";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; is_subscribed: boolean; trial_count: number } | null>(null);
  const [stats, setStats] = useState({ sessions: 0, avgScore: 0, totalQuestions: 0, streak: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [bestSubject, setBestSubject] = useState<string | null>(null);
  const [weakSubject, setWeakSubject] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("full_name, is_subscribed, trial_count").eq("user_id", user.id).single();
      if (prof) setProfile(prof);

      const { data: sessions } = await supabase.from("exam_sessions").select("*").eq("user_id", user.id).eq("completed", true).order("completed_at", { ascending: true });
      if (sessions && sessions.length > 0) {
        const avg = sessions.reduce((s, x) => s + (Number(x.score_percentage) || 0), 0) / sessions.length;
        const total = sessions.reduce((s, x) => s + x.total_questions, 0);
        // streak
        let streak = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (let i = 0; i < 30; i++) {
          const day = new Date(today); day.setDate(day.getDate() - i);
          const dayStr = day.toISOString().split("T")[0];
          if (sessions.some(s => s.completed_at?.startsWith(dayStr))) streak++;
          else if (i > 0) break;
        }
        setStats({ sessions: sessions.length, avgScore: Math.round(avg), totalQuestions: total, streak });

        // chart data - group by week
        const weekMap: Record<number, number[]> = {};
        sessions.forEach(s => {
          const d = new Date(s.completed_at || s.started_at);
          const weekNum = Math.floor((Date.now() - d.getTime()) / (7 * 86400000));
          if (weekNum < 4) {
            if (!weekMap[weekNum]) weekMap[weekNum] = [];
            weekMap[weekNum].push(Number(s.score_percentage) || 0);
          }
        });
        const chart = [3, 2, 1, 0].map(w => ({
          name: `Week ${4 - w}`,
          score: weekMap[w] ? Math.round(weekMap[w].reduce((a, b) => a + b, 0) / weekMap[w].length) : 0,
        }));
        setChartData(chart);

        // subject analysis
        const subjectScores: Record<string, number[]> = {};
        sessions.forEach(s => {
          (s.subjects || []).forEach((subj: string) => {
            if (!subjectScores[subj]) subjectScores[subj] = [];
            subjectScores[subj].push(Number(s.score_percentage) || 0);
          });
        });
        let best = "", worst = "", bestAvg = -1, worstAvg = 101;
        Object.entries(subjectScores).forEach(([subj, scores]) => {
          const a = scores.reduce((x, y) => x + y, 0) / scores.length;
          if (a > bestAvg) { bestAvg = a; best = subj; }
          if (a < worstAvg) { worstAvg = a; worst = subj; }
        });
        if (best) setBestSubject(best);
        if (worst && worst !== best) setWeakSubject(worst);
      }
    };
    load();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  // Not logged in view
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-xs">
          <Logo size="lg" />
          <p className="text-sm text-muted-foreground">Login to track your progress and access your dashboard.</p>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => navigate("/auth")}>Login</Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>Create Account</Button>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: Trophy, value: stats.sessions, label: "Sessions", color: "text-primary" },
    { icon: Target, value: `${stats.avgScore}%`, label: "Avg Score", color: "text-[hsl(var(--success))]" },
    { icon: Clock, value: stats.totalQuestions, label: "Questions", color: "text-primary" },
    { icon: Flame, value: `${stats.streak}`, label: "days", color: "text-warning" },
  ];

  const handleSaveProfile = async () => {
    if (!user || !editName.trim()) return;
    setSaving(true);
    await supabase.from("profiles").update({ full_name: editName.trim() } as any).eq("user_id", user.id);
    setProfile(prev => prev ? { ...prev, full_name: editName.trim() } : prev);
    setShowEditProfile(false);
    setSaving(false);
    toast({ title: "Profile updated!" });
  };

  const settingsItems = [
    { icon: User, label: "Account Settings", action: () => { setEditName(profile?.full_name || ""); setShowEditProfile(true); } },
    { icon: Bell, label: "Notification Preferences", action: () => toast({ title: "Coming soon", description: "Notification settings will be available soon." }) },
    { icon: Clock, label: "Replay Dashboard Tour", action: () => { localStorage.removeItem("weblines_tour_completed"); navigate("/dashboard"); toast({ title: "Tour reset!", description: "The onboarding tour will play on your next dashboard visit." }); } },
    { icon: HelpCircle, label: "Help & Support", action: () => navigate("/contact") },
  ];

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.replace(/_/g, " ").slice(1);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex-1 text-center font-bold text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile</h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Profile Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile?.full_name || user.email || "S")}&backgroundColor=3b82f6&textColor=ffffff`}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base truncate">{profile?.full_name || "Student"}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <Button variant="outline" size="sm" className="h-7 text-[10px] mt-1.5 gap-1 rounded-full px-3" onClick={() => { setEditName(profile?.full_name || ""); setShowEditProfile(true); }}>
              <Pencil className="h-3 w-3" /> Edit Profile
            </Button>
          </div>
        </motion.div>

        {/* Stats Row */}
        <Card className="border-border/50 shadow-sm rounded-2xl">
          <CardContent className="p-3">
            <div className="grid grid-cols-4 divide-x divide-border">
              {statCards.map((s) => (
                <div key={s.label} className="text-center px-2">
                  <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                  <p className="text-lg font-bold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance Chart */}
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Performance Overview</h2>
          <Card className="border-border/50 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(220, 9%, 46%)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(220, 9%, 46%)" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Area type="monotone" dataKey="score" stroke="hsl(217, 91%, 60%)" strokeWidth={2} fill="url(#colorScore)" dot={{ r: 4, fill: "hsl(217, 91%, 60%)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Complete exams to see your performance chart</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Best / Weak */}
        {(bestSubject || weakSubject) && (
          <div className="grid grid-cols-2 gap-3">
            {bestSubject && (
              <Card className="border-border/50 shadow-sm rounded-2xl">
                <CardContent className="p-3 flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">A+</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Best Subject</p>
                    <p className="text-xs font-bold">{capitalize(bestSubject)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {weakSubject && (
              <Card className="border-border/50 shadow-sm rounded-2xl">
                <CardContent className="p-3 flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-destructive">F</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Needs Improvement</p>
                    <p className="text-xs font-bold">{capitalize(weakSubject)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Study Goals */}
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Study Goals</h2>
          <Card className="border-border/50 shadow-sm rounded-2xl">
            <CardContent className="p-0 divide-y divide-border">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-6 w-6 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center">
                  <Award className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                </div>
                <span className="flex-1 text-xs font-medium">Complete 3 practice tests this week</span>
                {stats.sessions >= 3 ? (
                  <span className="text-[hsl(var(--success))]">✓</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{stats.sessions}/3</span>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Flame className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="flex-1 text-xs font-medium">Study for 5 hours this weekend</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Settings */}
        <div>
          <h2 className="text-sm font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Settings</h2>
          <Card className="border-border/50 shadow-sm rounded-2xl">
            <CardContent className="p-0 divide-y divide-border">
              {settingsItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="flex items-center gap-3 px-4 py-3 w-full hover:bg-secondary/50 transition-colors text-left"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-xs font-medium">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Logout */}
        <Button variant="outline" className="w-full h-10 text-sm text-destructive border-destructive/20 hover:bg-destructive/5" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </main>

      {/* Edit Profile Dialog */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border">
            <h3 className="text-base font-bold mb-4">Edit Profile</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={user.email || ""} disabled className="h-10 text-sm bg-secondary" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="outline" className="flex-1 h-10 text-sm rounded-xl" onClick={() => setShowEditProfile(false)}>
                Cancel
              </Button>
              <Button className="flex-1 h-10 text-sm rounded-xl" onClick={handleSaveProfile} disabled={saving || !editName.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Profile;
