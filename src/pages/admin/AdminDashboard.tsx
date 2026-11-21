import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, BookOpen, BarChart3, Settings, LogOut, Shield, Library, Mail, Wifi, ArrowUpRight, Headset, Search, Sparkles, Banknote, PlugZap, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Logo from "@/components/Logo";
import { useAdmin } from "@/hooks/useAdmin";

interface OnlineUser { user_id: string; display_name: string; current_page: string; current_subject: string | null; last_seen: string; }

const AdminDashboard = () => {
  const { signOut } = useAuth();
  const { isAdmin, isSupportAgent } = useAdmin();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalUsers: 0, paidUsers: 0, revenue: 0, totalSessions: 0, totalQuestions: 0 });
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [alocTesting, setAlocTesting] = useState(false);
  const [alocResult, setAlocResult] = useState<any>(null);
  const [alocError, setAlocError] = useState<string | null>(null);

  const testAlocConnection = async () => {
    setAlocTesting(true);
    setAlocResult(null);
    setAlocError(null);
    try {
      const { data, error } = await supabase.functions.invoke("aloc-connection-test", { body: {} });
      if (error) {
        let message = error.message || "The connection test could not be completed.";
        try {
          const context = (error as any).context;
          if (context && typeof context.json === "function") {
            const details = await context.json();
            message = details?.error || details?.message || message;
          }
        } catch { /* Keep the safe fallback message. */ }
        throw new Error(message);
      }
      if (!data?.ok) throw new Error(data?.error || "ALOC did not confirm the connection.");
      setAlocResult(data);
    } catch (error) {
      setAlocError(error instanceof Error ? error.message : "Connection test failed. Please try again.");
    } finally {
      setAlocTesting(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      setLoading(true);
      const [{ count: totalUsers }, { count: paidUsers }, { data: payments }, { count: totalSessions }, { count: totalQuestions }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_subscribed", true),
        supabase.from("payments").select("amount").eq("status", "success"),
        supabase.from("exam_sessions").select("*", { count: "exact", head: true }),
        supabase.from("questions").select("*", { count: "exact", head: true }),
      ]);
      const revenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      if (active) {
        setStats({ totalUsers: totalUsers || 0, paidUsers: paidUsers || 0, revenue, totalSessions: totalSessions || 0, totalQuestions: totalQuestions || 0 });
        setLoading(false);
      }
    };
    void fetchStats();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadOnline = async () => {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      const { data } = await supabase.from("online_presence").select("user_id, display_name, current_page, current_subject, last_seen").gte("last_seen", cutoff);
      if (active) setOnlineUsers((data as OnlineUser[]) || []);
    };
    void loadOnline();
    const channel = supabase.channel("online-presence-admin").on("postgres_changes", { event: "*", schema: "public", table: "online_presence" }, () => void loadOnline()).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);

  const metrics = [
    { icon: Users, label: "Total customers", value: stats.totalUsers.toLocaleString(), hint: "Registered accounts", to: "/admin/users", tone: "text-primary bg-primary/10" },
    { icon: CreditCard, label: "Paid customers", value: stats.paidUsers.toLocaleString(), hint: "Active access", to: "/admin/users", tone: "text-emerald-600 bg-emerald-500/10" },
    { icon: BarChart3, label: "Payments received", value: "₦" + stats.revenue.toLocaleString(), hint: "Successful payments", to: "/admin/payments", tone: "text-amber-600 bg-amber-500/10" },
    { icon: BookOpen, label: "Question bank", value: stats.totalQuestions.toLocaleString(), hint: "Available questions", to: "/admin/content", tone: "text-violet-600 bg-violet-500/10" },
  ];
  const sections = [
    { icon: Users, title: "Customers", description: "Find accounts, check access and help students.", to: "/admin/users", action: "Manage customers" },
    { icon: CreditCard, title: "Payments & access", description: "Review payments and activate verified transfers.", to: "/admin/payments", action: "Open payments" },
    { icon: Banknote, title: "Referral payouts", description: "Approve Paystack transfer codes and track referral withdrawals.", to: "/admin/referrals", action: "Manage referral payouts" },
    { icon: BookOpen, title: "Question bank", description: "Manage subjects, questions and learning content.", to: "/admin/content", action: "Manage content" },
    { icon: Library, title: "Digital library", description: "Manage books and learning resources.", to: "/admin/library", action: "Open library" },
    { icon: Mail, title: "Communication", description: "Send important updates to your users.", to: "/admin/email", action: "Send message" },
    { icon: Settings, title: "Platform settings", description: "Review administrator and platform settings.", to: "/admin/settings", action: "Open settings" },
  ];
  const visibleSections = isAdmin ? sections : sections.filter((item) => ["/admin/users", "/admin/payments"].includes(item.to));
  const visibleMetrics = isAdmin ? metrics : metrics.filter((item) => ["/admin/users", "/admin/payments"].includes(item.to));
  const getPageLabel = (page: string) => {
    const map: Record<string, string> = { exam: "Taking an exam", dashboard: "Student dashboard", browsing: "Browsing", "ai-tutor": "AI Tutor", library: "Digital library", "live-quiz": "Live quiz" };
    return map[page] || page;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" showText={false} />
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><span className="truncate text-sm font-bold">ROCKCBT</span><Badge variant="secondary" className="hidden sm:inline-flex text-[10px]">{isSupportAgent && !isAdmin ? "Customer care" : "Admin centre"}</Badge></div>
              <p className="text-[11px] text-muted-foreground">{isSupportAgent && !isAdmin ? "Customer support workspace" : "Platform control centre"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/dashboard")}>Student view</Button>}
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-sm sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[32px] border-white/5" />
          <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-blue-100"><Sparkles className="h-3.5 w-3.5" /> Admin workspace</div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{isSupportAgent && !isAdmin ? "Welcome to customer care." : "Good to see you."}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/85">{isSupportAgent && !isAdmin ? "Find customers, confirm offline payments and resolve account access issues." : "Manage customers, resolve payment issues and keep the learning platform running smoothly from one place."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-white text-slate-950 hover:bg-blue-50"><Link to="/admin/users"><Search className="mr-2 h-4 w-4" /> Find a customer</Link></Button>
              <Button asChild variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"><Link to="/admin/payments"><CreditCard className="mr-2 h-4 w-4" /> Record payment</Link></Button>
            </div>
          </div>
        </section>

        {isAdmin && (
          <Card className="border-border/70">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><PlugZap className="h-5 w-5" /></div>
                  <div><h2 className="text-sm font-semibold">ALOC Station connection</h2><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Check the saved server-side API key and retrieve up to three sample JAMB Mathematics questions. This test does not save or import questions.</p></div>
                </div>
                <Button onClick={testAlocConnection} disabled={alocTesting} size="sm">
                  {alocTesting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</> : <><PlugZap className="mr-2 h-4 w-4" /> Test connection</>}
                </Button>
              </div>
              {alocError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{alocError}</span></div>}
              {alocResult && <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> ALOC API responded successfully</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div><p className="text-[11px] text-muted-foreground">Questions returned</p><p className="text-xl font-bold">{alocResult.returnedCount ?? 0}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Test subject</p><p className="text-sm font-semibold">JAMB Mathematics</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Question year</p><p className="text-sm font-semibold">2019</p></div>
                </div>
                {Array.isArray(alocResult.questions) && alocResult.questions.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold">Sample response from ALOC</p>{alocResult.questions.map((question: any, index: number) => <details key={question?.id ?? index} className="rounded-md border bg-background p-3"><summary className="cursor-pointer text-xs font-medium">Sample question {index + 1}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">{JSON.stringify(question, null, 2)}</pre></details>)}</div>}
                <p className="text-[11px] text-muted-foreground">Saved to question bank: No. API key remains on the server and is not displayed here.</p>
              </div>}
            </CardContent>
          </Card>
        )}

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map((item) => (
            <Link key={item.label} to={item.to} className="group min-w-0">
              <Card className="h-full border-border/70 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-sm">
                <CardContent className="flex items-start gap-3 p-4 sm:p-5">
                  <div className={"rounded-xl p-2.5 " + item.tone}><item.icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p><p className="mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl">{loading ? "—" : item.value}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{item.hint}</p></div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3"><div><h2 className="text-base font-bold">Workspace</h2><p className="text-xs text-muted-foreground">Choose what you need to manage.</p></div><Badge variant="outline" className="hidden sm:inline-flex">{visibleSections.length} work areas</Badge></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleSections.map((item) => (
                <Link key={item.to} to={item.to} className="group">
                  <Card className="h-full border-border/70 transition-all group-hover:border-primary/30 group-hover:shadow-sm">
                    <CardContent className="flex h-full items-start gap-3 p-4 sm:p-5">
                      <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><item.icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p><p className="mt-3 inline-flex items-center text-xs font-semibold text-primary">{item.action}<ArrowUpRight className="ml-1 h-3.5 w-3.5" /></p></div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
          <aside className="space-y-3">
            <Card className="border-border/70">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><Wifi className="h-4 w-4" /></div><div><h2 className="text-sm font-semibold">Live activity</h2><p className="text-[11px] text-muted-foreground">Active in the last 90 seconds</p></div></div>
                  <Badge variant="secondary">{onlineUsers.length} online</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {onlineUsers.slice(0, 5).map((u) => (
                    <div key={u.user_id} className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{u.display_name || "Student"}</p><p className="truncate text-[11px] text-muted-foreground">{getPageLabel(u.current_page)}</p></div>{u.current_subject && <Badge variant="outline" className="max-w-[110px] truncate text-[10px]">{u.current_subject}</Badge>}</div>
                  ))}
                  {onlineUsers.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No students online right now.</p>}
                </div>
              </CardContent>
            </Card>
            {isAdmin && <Card className="border-primary/15 bg-primary/[0.03]"><CardContent className="flex items-start gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Headset className="h-4 w-4" /></div><div className="min-w-0"><h3 className="text-sm font-semibold">Customer care shortcut</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Search a customer, check their access and resolve a payment issue.</p><Link to="/admin/users" className="mt-3 inline-flex items-center text-xs font-semibold text-primary">Open customer list <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link></div></CardContent></Card>}
          </aside>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[11px] text-muted-foreground"><span>ROCKCBT · Admin workspace</span><span>Administrative actions are logged</span></div>
      </main>
    </div>
  );
};

export default AdminDashboard;
