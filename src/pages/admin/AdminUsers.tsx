import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ArrowLeft, Search, UserCheck, UserX, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  is_subscribed: boolean;
  trial_count: number;
  created_at: string;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (search) query = query.ilike("full_name", `%${search}%`);
    const { data, error } = await query;
    if (error) {
      setLoadError("Could not load users. Check administrator permissions and try again.");
      setUsers([]);
    } else {
      setLoadError(null);
      setUsers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [search]);

  const toggleSubscription = async (userId: string, current: boolean) => {
    const next = !current;
    if (!window.confirm(next ? "Grant Pro access to this user?" : "Revoke this user's Pro access?")) return;
    const { error } = await supabase.rpc("admin_set_user_subscription", {
      _target_user_id: userId,
      _is_subscribed: next,
    });
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "User upgraded" : "Access revoked" });
    await fetchUsers();
  };

  const resetTrials = async (userId: string) => {
    if (!window.confirm("Reset this user's trial counter?")) return;
    const { error } = await supabase.rpc("admin_reset_user_trials", {
      _target_user_id: userId,
    });
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Trials reset" });
    await fetchUsers();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">User Management</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
        </div>

        {loadError && <p className="text-xs text-destructive" role="alert">{loadError}</p>}
        {loading && <p className="text-xs text-muted-foreground">Loading users...</p>}
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Trials</TableHead>
                  <TableHead className="text-xs">Joined</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs font-medium">{u.full_name || "Unnamed"}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_subscribed ? "default" : "secondary"} className="text-[10px]">
                        {u.is_subscribed ? "Pro" : "Free"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{u.trial_count}/2</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleSubscription(u.user_id, u.is_subscribed)} title={u.is_subscribed ? "Revoke" : "Upgrade"}>
                          {u.is_subscribed ? <UserX className="h-3.5 w-3.5 text-destructive" /> : <Crown className="h-3.5 w-3.5 text-warning" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => resetTrials(u.user_id)} title="Reset trials">
                          <UserCheck className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">No users found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminUsers;
