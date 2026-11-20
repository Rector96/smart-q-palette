import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ArrowLeft } from "lucide-react";

interface Payment {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  reference: string | null;
  payment_method: string | null;
  created_at: string;
}

const AdminPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    setLoading(true);
    const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
    setPayments((data as Payment[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, []);

    const statusColor = (s: string) => s === "success" ? "default" : s === "pending" ? "secondary" : "destructive";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">Payment Management</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-mono">{p.reference?.slice(0, 12) || "—"}</TableCell>
                    <TableCell className="text-xs font-medium">₦{Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-xs capitalize">{p.payment_method || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(p.status)} className="text-[10px] capitalize">{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {p.status === "pending" && (
                        <Badge variant="outline" className="text-[10px]">Awaiting secure verification</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">No payments yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminPayments;
