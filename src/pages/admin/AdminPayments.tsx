import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ArrowLeft, Search, CheckCircle2, CreditCard, Loader2, UserRound, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Payment {
  id: string; user_id: string; amount: number; status: string;
  reference: string | null; payment_method: string | null; created_at: string;
}
interface Customer { user_id: string; full_name: string | null; email: string | null; is_subscribed: boolean; }

const AdminPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [planId, setPlanId] = useState("manual");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerLabels, setCustomerLabels] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const fetchPayments = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) {
      toast({ title: "Could not load payments", description: error.message, variant: "destructive" });
      setPayments([]);
    } else {
      const rows = (data || []) as Payment[];
      setPayments(rows);
      const ids = Array.from(new Set(rows.map((p) => p.user_id)));
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
        const labels: Record<string, string> = {};
        (profiles || []).forEach((p) => { labels[p.user_id] = p.full_name || p.email || "Customer"; });
        setCustomerLabels(labels);
      }
    }
    setLoading(false);
  };

  useEffect(() => { void fetchPayments(); }, []);

  useEffect(() => {
    let active = true;
    const runSearch = async () => {
      const term = customerSearch.trim();
      if (term.length < 3) { setCustomers([]); return; }
      setSearching(true);
      const [byEmail, byName] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email, is_subscribed").ilike("email", "%" + term + "%").limit(6),
        supabase.from("profiles").select("user_id, full_name, email, is_subscribed").ilike("full_name", "%" + term + "%").limit(6),
      ]);
      if (active) {
        const unique = new Map<string, Customer>();
        [...(byEmail.data || []), ...(byName.data || [])].forEach((p) => unique.set(p.user_id, p as Customer));
        setCustomers(Array.from(unique.values()).slice(0, 8));
        setSearching(false);
      }
    };
    const handle = window.setTimeout(() => { void runSearch(); }, 250);
    return () => { active = false; window.clearTimeout(handle); };
  }, [customerSearch]);

  const submitManualPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      toast({ title: "Choose a customer", description: "Search by the customer's email or name first.", variant: "destructive" });
      return;
    }
    if (!amount || Number(amount) <= 0 || !reference.trim() || !note.trim()) {
      toast({ title: "Complete the payment details", description: "Amount, transfer reference and verification note are required.", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm("Confirm that you have checked the customer's bank transfer and want to activate their paid access?");
    if (!confirmed) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_record_manual_payment", {
      _target_user_id: selected.user_id,
      _amount: Number(amount),
      _reference: reference.trim(),
      _note: note.trim(),
      _plan_id: planId || "manual",
    });
    setSaving(false);
    if (error) {
      toast({ title: "Payment was not recorded", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment verified", description: "The customer's paid access is now active." });
    setSelected(null); setCustomerSearch(""); setCustomers([]); setAmount(""); setReference(""); setNote(""); setPlanId("manual");
    await fetchPayments();
  };

  const successfulTotal = useMemo(() => payments.filter((p) => p.status === "success").reduce((sum, p) => sum + Number(p.amount), 0), [payments]);
  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const statusVariant = (status: string) => status === "success" ? "default" : status === "pending" ? "secondary" : "destructive";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="rounded-lg p-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><CreditCard className="h-4 w-4" /></div>
          <div className="min-w-0"><h1 className="text-sm font-bold">Payments & access</h1><p className="text-[11px] text-muted-foreground">Verify transfers and manage customer access</p></div>
          <div className="ml-auto"><Button variant="outline" size="sm" onClick={() => void fetchPayments()} disabled={loading}><RefreshCw className={"mr-2 h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} /> Refresh</Button></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        <section className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payments shown</p><p className="mt-1 text-2xl font-bold">{payments.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Successful payment value</p><p className="mt-1 text-2xl font-bold">₦{successfulTotal.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Awaiting verification</p><p className="mt-1 text-2xl font-bold">{pendingCount}</p></CardContent></Card>
        </section>

        <Card className="overflow-hidden border-primary/20">
          <div className="border-b bg-primary/[0.04] px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><CheckCircle2 className="h-5 w-5" /></div><div><h2 className="text-sm font-bold">Record a manual payment</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Use this after confirming a bank transfer or other offline payment. Paid access is activated after the record is saved.</p></div></div>
          </div>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={submitManualPayment} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Find customer</label>
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setSelected(null); }} placeholder="Search by email or full name" className="pl-9" /></div>
                  {searching && <p className="text-xs text-muted-foreground">Searching customers…</p>}
                  {customers.length > 0 && !selected && (
                    <div className="max-h-48 overflow-y-auto rounded-xl border bg-background">
                      {customers.map((customer) => <button type="button" key={customer.user_id} onClick={() => { setSelected(customer); setCustomerSearch(customer.email || customer.full_name || "Customer"); setCustomers([]); }} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/60">
                        <span className="min-w-0"><span className="block truncate text-xs font-semibold">{customer.full_name || "Unnamed customer"}</span><span className="block truncate text-[11px] text-muted-foreground">{customer.email || customer.user_id}</span></span>
                        <Badge variant={customer.is_subscribed ? "default" : "secondary"}>{customer.is_subscribed ? "Paid" : "Free"}</Badge>
                      </button>)}
                    </div>
                  )}
                  {selected && <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><UserRound className="h-4 w-4 text-emerald-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{selected.full_name || "Selected customer"}</p><p className="truncate text-[11px] text-muted-foreground">{selected.email || selected.user_id}</p></div><Badge variant={selected.is_subscribed ? "default" : "secondary"}>{selected.is_subscribed ? "Already paid" : "Free account"}</Badge></div>}
                  {!searching && customerSearch.trim().length >= 3 && customers.length === 0 && !selected && <p className="text-xs text-muted-foreground">No matching customer found. Check the spelling and try again.</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><label className="text-xs font-semibold">Amount paid (₦)</label><Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 2500" /></div>
                  <div className="space-y-2"><label className="text-xs font-semibold">Plan / access type</label><Input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="e.g. premium" /></div>
                  <div className="space-y-2 sm:col-span-2"><label className="text-xs font-semibold">Transfer reference / receipt number</label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter the bank narration or receipt reference" /></div>
                  <div className="space-y-2 sm:col-span-2"><label className="text-xs font-semibold">Verification note</label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Transfer confirmed in bank statement" /></div>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-3 rounded-xl bg-muted/50 p-3 sm:flex-row sm:items-center">
                <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">Only confirm after checking that the money has actually entered the business account. The system records the agent, time, reference and note in the audit log.</p>
                <Button type="submit" disabled={saving || !selected} className="shrink-0">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm payment & activate</>}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div><h2 className="text-base font-bold">Payment history</h2><p className="text-xs text-muted-foreground">Latest 100 payment records.</p></div>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Reference</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {payments.map((p) => <TableRow key={p.id}>
                      <TableCell className="min-w-[140px] text-xs font-medium">{customerLabels[p.user_id] || "Customer"}</TableCell>
                      <TableCell className="max-w-[180px] truncate font-mono text-[11px]">{p.reference || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-semibold">₦{Number(p.amount).toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{p.payment_method === "manual_bank_transfer" ? "Manual transfer" : p.payment_method || "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(p.status)} className="text-[10px] capitalize">{p.status}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>)}
                    {!loading && payments.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">No payment records yet.</TableCell></TableRow>}
                    {loading && <TableRow><TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">Loading payment history…</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default AdminPayments;
