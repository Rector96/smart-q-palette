import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, BookOpen, BarChart3, Settings, LogOut, Shield, Library, Mail, Wifi } from "lucide-react";
import Logo from "@/components/Logo";

interface OnlineUser {
  user_id: string;
  display_name: string;
  current_page: string;
  current_subject: string | null;
  last_seen: string;
}

const AdminDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalUsers: 0, paidUsers: 0, revenue: 0, totalSessions: 0, totalQuestions: 0 });
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [{ count: totalUsers }, { count: paidUsers }, { data: payments }, { count: totalSessions }, { count: totalQuestions }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_subscribed", true),
        supabase.from("payments").select("amount").eq("status", "success"),
        supabase.from("exam_sessions").select("*", { count: "exact", head: true }),
        supabase.from("questions").select("*", { count: "exact", head: true }),
      ]);
      const revenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      setStats({ totalUsers: totalUsers || 0, paidUsers: paidUsers || 0, revenue, totalSessions: totalSessions || 0, totalQuestions: totalQuestions || 0 });
    };
    fetchStats();
  }, []);

  // Real-time online users
  useEffect(() => {
    const loadOnline = async () => {
      const cutoff = new Date(Date.now() - 90000).toISOString(); // 90s ago
      const { data } = await supabase
        .from("online_presence")
        .select("user_id, display_name, current_page, current_subject, last_seen")
        .gte("last_seen", cutoff);
      setOnlineUsers((data as OnlineUser[]) || []);
    };
    loadOnline();

    const channel = supabase
      .channel("online-presence-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "online_presence" }, () => loadOnline())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const cards = [
    { icon: Wifi, label: "Online Now", value: onlineUsers.length, link: "#online", color: "text-[hsl(142,70%,45%)]" },
    { icon: Users, label: "Total Users", value: stats.totalUsers, link: "/admin/users", color: "text-primary" },
    { icon: CreditCard, label: "Paid Users", value: stats.paidUsers, link: "/admin/users", color: "text-[hsl(142,70%,45%)]" },
    { icon: BarChart3, label: "Revenue", value: `₦${stats.revenue.toLocaleString()}`, link: "/admin/payments", color: "text-[hsl(38,92%,50%)]" },
    { icon: BookOpen, label: "Questions", value: stats.totalQuestions, link: "/admin/content", color: "text-primary" },
  ];

  const navItems = [
    { icon: Users, label: "User Management", path: "/admin/users" },
    { icon: CreditCard, label: "Payments", path: "/admin/payments" },
    { icon: BookOpen, label: "Content", path: "/admin/content" },
    { icon: Library, label: "Library", path: "/admin/library" },
    { icon: Mail, label: "Send Email", path: "/admin/email" },
    { icon: Settings, label: "Settings", path: "/admin/settings" },
  ];

  const getPageLabel = (page: string) => {
    const map: Record<string, string> = { exam: "Taking Exam", dashboard: "Dashboard", browsing: "Browsing", "ai-tutor": "AI Tutor", library: "Library", "live-quiz": "Live Quiz" };
    return map[page] || page;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Admin Panel</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate("/dashboard")}>Dashboard</Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={signOut}><LogOut className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-lg font-bold">Admin Overview</h1>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {cards.map((c) => (
            <Link key={c.label} to={c.link}>
              <Card className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4 text-center">
                  <c.icon className={`h-5 w-5 mx-auto mb-1 ${c.color}`} />
                  <p className="text-xl font-bold">{c.value}</p>
                  <p className="text-[10px] text-muted-foreground">{c.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Live Online Users */}
        <div id="online">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="h-4 w-4 text-[hsl(142,70%,45%)]" />
            <h2 className="text-sm font-bold">Online Users ({onlineUsers.length})</h2>
            <span className="h-2 w-2 rounded-full bg-[hsl(142,70%,45%)] animate-pulse" />
          </div>
          {onlineUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users currently online</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {onlineUsers.map((u) => (
                <Card key={u.user_id} className="border-border/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">{u.display_name}</p>
                      <p className="text-[10px] text-muted-foreground">{getPageLabel(u.current_page)}</p>
                    </div>
                    {u.current_subject && (
                      <Badge variant="secondary" className="text-[10px]">{u.current_subject}</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}>
              <Card className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{item.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
