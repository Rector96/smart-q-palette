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
    <div className="min-h-screen overflow-x-clip bg-[#F8FAFC]">
      <header className="relative isolate overflow-hidden bg-gradient-to-br from-[#1E40AF] via-[#1D4ED8] to-[#2563EB] pb-14 text-white">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/15 bg-white/[0.04]"/><div className="pointer-events-none absolute right-12 top-24 h-40 w-40 rounded-full border border-white/10"/>
        <div className="relative z-10 mx-auto max-w-lg px-4 pt-4"><div className="flex items-center justify-between"><Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/15 hover:text-white" onClick={()=>navigate(-1)}><ArrowLeft className="h-5 w-5"/></Button><h1 className="text-base font-bold">Profile</h1><span className="rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">👑 {profile?.is_subscribed?"Pro":"Member"}</span></div>
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="mt-6 flex flex-col items-center text-center"><div className="relative"><img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile?.full_name||user.email||"S")}&backgroundColor=eff6ff&textColor=1d4ed8`} alt="Profile avatar" className="h-20 w-20 rounded-full border-4 border-white/20 bg-white object-cover shadow-lg"/><button aria-label="Edit avatar" onClick={()=>{setEditName(profile?.full_name||"");setShowEditProfile(true);}} className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-blue-600"><Pencil className="h-3.5 w-3.5"/></button></div><h2 className="mt-3 text-xl font-extrabold">{profile?.full_name||user.email?.split("@")[0]||"Student"}</h2><p className="mt-1 text-sm text-blue-100">{user.email}</p><Button onClick={()=>{setEditName(profile?.full_name||"");setShowEditProfile(true);}} className="mt-4 h-9 rounded-full bg-white px-4 text-xs font-semibold text-[#1D4ED8] shadow-sm hover:bg-blue-50"><Pencil className="mr-2 h-3.5 w-3.5"/>Edit Profile</Button></motion.div></div>
      </header>
      <main className="relative z-10 mx-auto -mt-7 max-w-lg space-y-5 rounded-t-[28px] bg-[#F8FAFC] px-4 pt-5 pb-28">
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm"><CardContent className="grid grid-cols-4 divide-x divide-slate-100 p-3">{statCards.map((s,i)=><div key={i} className="min-w-0 px-1 text-center"><s.icon className={`mx-auto mb-1.5 h-5 w-5 ${s.color}`}/><p className="text-lg font-extrabold text-slate-900">{s.value}</p><p className="text-[10px] text-slate-500">{i===3?"Streak":s.label}</p></div>)}</CardContent></Card>
        <section><h2 className="mb-3 text-base font-bold text-slate-900">Performance Overview</h2><Card className="rounded-2xl border border-slate-100 bg-white shadow-sm"><CardContent className="p-3">{chartData.length>0?<ResponsiveContainer width="100%" height={180}><AreaChart data={chartData} margin={{top:8,right:8,left:0,bottom:0}}><defs><linearGradient id="profileScoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={.22}/><stop offset="100%" stopColor="#2563EB" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0"/><XAxis dataKey="name" tick={{fontSize:10}} stroke="#94A3B8"/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} tickFormatter={v=>`${v}%`} tick={{fontSize:10}} width={35} stroke="#94A3B8"/><Area type="monotone" dataKey="score" stroke="#2563EB" strokeWidth={2.5} fill="url(#profileScoreFill)" dot={{r:4,fill:"#2563EB"}}/></AreaChart></ResponsiveContainer>:<p className="py-8 text-center text-xs text-slate-500">Complete exams to see your performance chart.</p>}</CardContent></Card></section>
        {bestSubject&&<Card className="rounded-2xl border border-slate-100 bg-white shadow-sm"><CardContent className="flex items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-base font-extrabold text-[#2563EB]">A+</div><div><p className="text-xs text-slate-400">Best Subject</p><p className="text-base font-bold text-slate-900">{capitalize(bestSubject)}</p></div></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600">Top Strength</span></CardContent></Card>}
        <section><h2 className="mb-3 text-base font-bold text-slate-900">Study Goals</h2><div className="space-y-2.5"><div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Award className="h-5 w-5"/></span><span className="flex-1 text-xs font-semibold text-slate-700">Complete 3 practice tests this week</span>{stats.sessions>=3?<span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>:<span className="text-xs text-slate-500">{stats.sessions}/3</span>}</div><div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Flame className="h-5 w-5"/></span><span className="flex-1 text-xs font-semibold text-slate-700">Study for 5 hours this weekend</span><span className="h-6 w-6 rounded-full border-2 border-slate-200"/></div></div></section>
        <section><h2 className="mb-3 text-base font-bold text-slate-900">Settings</h2><Card className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><CardContent className="divide-y divide-slate-100 p-0">{settingsItems.map(item=><button key={item.label} onClick={item.action} className="flex w-full items-center justify-between p-3.5 text-left transition hover:bg-slate-50"><span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><item.icon className="h-4 w-4"/></span><span className="text-sm font-semibold text-slate-700">{item.label}</span></span><ChevronRight className="h-4 w-4 text-slate-400"/></button>)}</CardContent></Card></section>
        <Button variant="outline" className="w-full rounded-2xl border border-red-100 bg-red-50 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-100" onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4"/>Sign Out</Button>
      </main>
      {showEditProfile&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h3 className="mb-4 text-base font-bold">Edit Profile</h3><div className="space-y-3"><div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Enter your name" className="h-10 text-sm"/></div><div className="space-y-1.5"><Label className="text-xs">Email</Label><Input value={user.email||""} disabled className="h-10 bg-secondary text-sm"/></div></div><div className="mt-4 flex gap-3"><Button variant="outline" className="h-10 flex-1 rounded-xl text-sm" onClick={()=>setShowEditProfile(false)}>Cancel</Button><Button className="h-10 flex-1 rounded-xl text-sm" onClick={handleSaveProfile} disabled={saving||!editName.trim()}>{saving?"Saving...":"Save"}</Button></div></motion.div></div>}
    </div>
  );
};

export default Profile;
