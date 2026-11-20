import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowLeft, Search, UserCheck, UserX, Crown, Headset, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/hooks/useAdmin";

interface Profile {
  id: string; user_id: string; full_name: string | null; email: string | null;
  is_subscribed: boolean; trial_count: number; created_at: string;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAdmin, isSupportAgent } = useAdmin();

  const fetchUsers = async () => {
    setLoading(true);
    const term = search.trim();
    const [byName, byEmail] = term ? await Promise.all([
      supabase.from("profiles").select("*").ilike("full_name", "%" + term + "%").order("created_at", { ascending: false }).limit(60),
      supabase.from("profiles").select("*").ilike("email", "%" + term + "%").order("created_at", { ascending: false }).limit(60),
    ]) : [await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(60), { data: [], error: null }];
    const error = byName.error || byEmail.error;
    if (error) {
      setLoadError("Could not load customers. Please check your access and try again.");
      setUsers([]);
    } else {
      setLoadError(null);
      const unique = new Map<string, Profile>();
      [...(byName.data || []), ...(byEmail.data || [])].forEach((p) => unique.set(p.user_id, p as Profile));
      setUsers(Array.from(unique.values()).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }
    if (isAdmin) {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "moderator");
      setSupportIds((roles || []).map((r) => r.user_id));
    }
    setLoading(false);
  };

  useEffect(() => { void fetchUsers(); }, [search, isAdmin]);

  const toggleSubscription = async (userId: string, current: boolean) => {
    const next = !current;
    if (!window.confirm(next ? "Grant paid access to this customer?" : "Remove this customer's paid access?")) return;
    setBusyId(userId);
    const { error } = await supabase.rpc("admin_set_user_subscription", { _target_user_id: userId, _is_subscribed: next });
    setBusyId(null);
    if (error) { toast({ title: "Action failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: next ? "Paid access granted" : "Paid access removed" });
    await fetchUsers();
  };

  const toggleSupportRole = async (userId: string) => {
    const enabled = !supportIds.includes(userId);
    const message = enabled ? "Give this customer account customer-care access? They will be able to view customer accounts and verify manual payments, but not access platform settings or content management." : "Remove this customer's customer-care access?";
    if (!window.confirm(message)) return;
    setBusyId(userId);
    const { error } = await supabase.rpc("admin_set_support_agent_role", { _target_user_id: userId, _enabled: enabled });
    setBusyId(null);
    if (error) { toast({ title: "Could not update staff access", description: error.message, variant: "destructive" }); return; }
    toast({ title: enabled ? "Customer-care access enabled" : "Customer-care access removed" });
    await fetchUsers();
  };

  const resetTrials = async (userId: string) => {
    if (!window.confirm("Reset this customer's trial counter?")) return;
    setBusyId(userId);
    const { error } = await supabase.rpc("admin_reset_user_trials", { _target_user_id: userId });
    setBusyId(null);
    if (error) { toast({ title: "Action failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Trial counter reset" });
    await fetchUsers();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="rounded-lg p-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><UserCheck className="h-4 w-4" /></div>
          <div className="min-w-0"><h1 className="text-sm font-bold">Customer accounts</h1><p className="text-[11px] text-muted-foreground">Search customers and review account access</p></div>
          <Badge variant="secondary" className="ml-auto hidden sm:inline-flex">{users.length} shown</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-5 sm:px-6 sm:py-7">
        <Card><CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-sm font-semibold">Find a customer</h2><p className="mt-1 text-xs text-muted-foreground">Search using their registered email address or full name.</p></div>
            <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Name or email address" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
          </div>
        </CardContent></Card>

        {loadError && <p className="text-xs text-destructive" role="alert">{loadError}</p>}
        {isSupportAgent && !isAdmin && <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs text-muted-foreground">Customer-care access is active. To verify a bank transfer and activate paid access, open <Link to="/admin/payments" className="font-semibold text-primary underline">Payments & access</Link>.</div>}
        <div className="space-y-3">
          {loading && <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading customers…</div>}
          {!loading && users.map((u) => {
            const isSupport = supportIds.includes(u.user_id);
            return <Card key={u.user_id} className="border-border/70">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{u.full_name || "Unnamed customer"}</p><Badge variant={u.is_subscribed ? "default" : "secondary"}>{u.is_subscribed ? "Paid access" : "Free account"}</Badge>{isSupport && <Badge variant="outline" className="border-primary/30 text-primary"><Headset className="mr-1 h-3 w-3" /> Customer care</Badge>}</div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{u.email || "No email on profile"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()} · Trial uses: {u.trial_count}/2</p>
                </div>
                {isAdmin && <div className="flex flex-wrap gap-2">
                  <Button variant={u.is_subscribed ? "outline" : "default"} size="sm" onClick={() => void toggleSubscription(u.user_id, u.is_subscribed)} disabled={busyId === u.user_id}>
                    {u.is_subscribed ? <><UserX className="mr-1.5 h-3.5 w-3.5" /> Remove access</> : <><Crown className="mr-1.5 h-3.5 w-3.5" /> Grant access</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void resetTrials(u.user_id)} disabled={busyId === u.user_id}><UserCheck className="mr-1.5 h-3.5 w-3.5" /> Reset trials</Button>
                  <Button variant="outline" size="sm" onClick={() => void toggleSupportRole(u.user_id)} disabled={busyId === u.user_id}><Headset className="mr-1.5 h-3.5 w-3.5" /> {isSupport ? "Remove care role" : "Make care agent"}</Button>
                </div>}
              </CardContent>
            </Card>;
          })}
          {!loading && users.length === 0 && <Card><CardContent className="py-12 text-center text-xs text-muted-foreground">No matching customers found.</CardContent></Card>}
        </div>
      </main>
    </div>
  );
};

export default AdminUsers;
