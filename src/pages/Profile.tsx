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
  User, Bell, HelpCircle, Pencil, Award, Check
} from "lucide-react";
import { motion } from "framer-motion";
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart } from "recharts";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";
import "./Profile.css";

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string | null; is_subscribed: boolean; trial_count: number } | null>(null);
  const [stats, setStats] = useState({ sessions: 0, avgScore: 0, totalQuestions: 0, streak: 0 });
  const [chartData, setChartData] = useState<{ name: string; score: number }[]>([]);
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
    { icon: Trophy, value: stats.sessions, label: "Sessions", color: "text-violet-600" },
    { icon: Target, value: `${stats.avgScore}%`, label: "Avg Score", color: "text-emerald-600" },
    { icon: Clock, value: stats.totalQuestions, label: "Questions", color: "text-violet-600" },
    { icon: Flame, value: stats.streak, label: "Days", color: "text-amber-500" },
  ];

  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Student";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "S";

  const handleSaveProfile = async () => {
    if (!user || !editName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: editName.trim() }).eq("user_id", user.id);
      if (error) {
        toast({ title: "Unable to update profile", description: error.message, variant: "destructive" });
        return;
      }
      setProfile(prev => prev ? { ...prev, full_name: editName.trim() } : prev);
      setShowEditProfile(false);
      toast({ title: "Profile updated!" });
    } catch (error) {
      toast({
        title: "Unable to update profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const settingsItems = [
    { icon: User, label: "Account Settings", action: () => { setEditName(profile?.full_name || ""); setShowEditProfile(true); } },
    { icon: Bell, label: "Notification Preferences", action: () => toast({ title: "Coming soon", description: "Notification settings will be available soon." }) },
    { icon: Clock, label: "Replay Dashboard Tour (Mobile)", action: () => { localStorage.removeItem("weblines_tour_completed"); navigate("/dashboard"); toast({ title: "Tour reset!", description: "The onboarding tour will play on your next mobile dashboard visit." }); } },
    { icon: HelpCircle, label: "Help & Support", action: () => navigate("/contact") },
  ];

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.replace(/_/g, " ").slice(1);

  return (
    <div className="min-h-[100dvh] bg-[#f4f7fb]">
      <header className="sticky top-0 z-20 border-b border-[#e6eaf0] bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-[1080px] grid-cols-[40px_1fr_40px] items-center px-4 py-3 sm:px-6">
          <Button variant="ghost" size="icon" aria-label="Go back" className="h-9 w-9 rounded-full" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-center text-lg font-bold text-[#171b2d]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile</h1>
          <span aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-3">
        <div className="profile-grid">
          <motion.section
            className="profile-grid-profile"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Card className="overflow-hidden rounded-[24px] border-white bg-white shadow-[0_8px_24px_rgba(27,39,61,0.06)]">
              <CardContent className="flex flex-col items-center p-5 text-center sm:p-6">
                <div className="flex w-full min-w-0 items-center gap-4 text-left">
                  <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8735ec] to-[#6424d7] text-2xl font-semibold text-white shadow-sm sm:h-[84px] sm:w-[84px] sm:text-3xl" aria-label={`${displayName} initials`}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold leading-tight text-[#141725] sm:text-[28px]">{displayName}</h2>
                    <p className="mt-1 truncate text-sm text-[#7b8494]">{user.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="mt-5 h-10 rounded-full border-[#d8dce4] px-5 text-sm font-medium hover:bg-[#f7f5fc]"
                  onClick={() => { setEditName(profile?.full_name || displayName); setShowEditProfile(true); }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                </Button>
              </CardContent>
            </Card>
          </motion.section>

          <Card className="profile-grid-stats rounded-[22px] border-white bg-white shadow-[0_5px_18px_rgba(27,39,61,0.06)]">
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-2 divide-x divide-y divide-[#e8ebf0] sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.7fr]">
                {statCards.map((stat) => (
                  <div key={stat.label} className="flex min-w-0 flex-col items-center justify-center px-2 py-2 text-center">
                    <stat.icon aria-hidden="true" className={`mb-1 h-5 w-5 ${stat.color}`} />
                    <p className="text-xl font-bold leading-6 text-[#171b2d]">{stat.value}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[#687386]">{stat.label}</p>
                  </div>
                ))}
                <div className="col-span-2 flex min-w-0 items-center justify-center gap-3 px-3 py-3 text-left sm:col-span-4 lg:col-span-1 lg:justify-start lg:pl-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7435df] text-sm font-bold text-white">
                    {bestSubject ? "A+" : "—"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-4 text-[#687386]">Best Subject</p>
                    <p className="truncate text-sm font-bold text-[#171b2d]">{bestSubject ? capitalize(bestSubject) : "Keep practicing"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <section className="profile-grid-performance">
            <h2 className="mb-3 text-lg font-bold text-[#171b2d]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Performance Overview</h2>
            <Card className="rounded-[22px] border-white bg-white shadow-[0_5px_18px_rgba(27,39,61,0.06)]">
              <CardContent className="p-3 sm:p-4">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="profileScoreFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7835e6" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#7835e6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e1e4e9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#171b2d" />
                      <YAxis width={38} tick={{ fontSize: 11 }} stroke="#171b2d" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Area type="monotone" dataKey="score" stroke="#7835e6" strokeWidth={2.5} fill="url(#profileScoreFill)" dot={{ r: 4, fill: "#a276f0", stroke: "#7835e6", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-12 text-center text-sm text-[#7b8494]">Complete exams to see your performance chart.</p>
                )}
              </CardContent>
            </Card>
            {weakSubject && (
              <p className="mt-2 text-xs text-[#687386]">
                Focus area: <span className="font-semibold text-[#171b2d]">{capitalize(weakSubject)}</span>
              </p>
            )}
          </section>

          <section className="profile-grid-goals">
            <h2 className="mb-3 text-lg font-bold text-[#171b2d]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Study Goals</h2>
            <Card className="rounded-[22px] border-white bg-white shadow-[0_5px_18px_rgba(27,39,61,0.06)]">
              <CardContent className="divide-y divide-[#e8ebf0] p-0">
                <div className="flex min-h-[62px] items-center gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                    <Award className="h-4 w-4 text-emerald-600" />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium text-[#252b3a]">Complete 3 practice tests this week</span>
                  {stats.sessions >= 3 ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <span className="text-xs font-medium text-[#7b8494]">{stats.sessions}/3</span>}
                </div>
                <div className="flex min-h-[62px] items-center gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50">
                    <Flame className="h-4 w-4 text-amber-500" />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium text-[#252b3a]">Study for 5 hours this weekend</span>
                  <span className="text-xs text-[#7b8494]">In progress</span>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="profile-grid-settings">
            <h2 className="mb-3 text-lg font-bold text-[#171b2d]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Settings</h2>
            <Card className="overflow-hidden rounded-[22px] border-white bg-white shadow-[0_5px_18px_rgba(27,39,61,0.06)]">
              <CardContent className="divide-y divide-[#e8ebf0] p-0">
                {settingsItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.action}
                    className="flex min-h-[54px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8f7fb]"
                  >
                    <item.icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-[#8a919e]" />
                    <span className="flex-1 text-sm font-medium text-[#252b3a]">{item.label}</span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8a919e]" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>

          <Button
            variant="outline"
            className="profile-grid-signout h-12 w-full rounded-xl border-[#d89a9a] text-base font-medium text-[#ad4545] hover:bg-red-50"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </main>

      {/* Edit Profile Dialog */}
      {showEditProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 id="edit-profile-title" className="mb-4 text-base font-bold">Edit Profile</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-profile-name" className="text-xs">Full Name</Label>
                <Input
                  id="edit-profile-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-profile-email" className="text-xs">Email</Label>
                <Input id="edit-profile-email" value={user.email || ""} disabled className="h-10 bg-secondary text-sm" />
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
