import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, ArrowLeft, Send, Loader2, Mail, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface DeliveryResult {
  sent: number;
  failed: number;
  total: number;
  failedEmails?: string[];
}

const AdminEmail = () => {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<DeliveryResult | null>(null);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({ title: "Fill in subject and message", variant: "destructive" });
      return;
    }
    if (!confirm("Send this email to ALL registered users?")) return;

    setSending(true);
    try {
      const res = await supabase.functions.invoke("send-email", {
        body: { type: "broadcast", subject: subject.trim(), body: body.trim() },
      });

      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      setResult({
        sent: data?.sent || 0,
        failed: data?.failed || 0,
        total: data?.total || 0,
        failedEmails: data?.failedEmails,
      });
      toast({ title: `Emails sent to ${data?.sent || 0} of ${data?.total || 0} users!` });
    } catch (e: any) {
      toast({ title: "Error sending", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-sm w-full text-center space-y-4">
          <div className="h-16 w-16 bg-[hsl(var(--success))]/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />
          </div>
          <h2 className="text-lg font-bold">Broadcast Complete!</h2>
          
          <Card className="border-border/50 text-left">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Users</span>
                <span className="font-bold">{result.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">✅ Sent Successfully</span>
                <span className="font-bold text-[hsl(var(--success))]">{result.sent}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">❌ Failed</span>
                <span className="font-bold text-destructive">{result.failed}</span>
              </div>
            </CardContent>
          </Card>

          {result.failed > 0 && result.failedEmails && result.failedEmails.length > 0 && (
            <Card className="border-destructive/20 text-left">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-xs font-bold text-destructive">Failed Emails</span>
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                  {result.failedEmails.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 justify-center">
            <Link to="/admin"><Button variant="outline">Back to Admin</Button></Link>
            <Button onClick={() => { setResult(null); setSubject(""); setBody(""); }}>Send Another</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">Send Email to Users</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">Broadcast Email</p>
              <p className="text-[11px] text-muted-foreground">Sends to ALL registered users (deduplicated, batched)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Email Subject *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New Feature: Digital Library is Live! 📚" className="h-10 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Email Body *</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here. Use line breaks for paragraphs."
                rows={8}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Formatted into a branded Weblines CBT email template. Sent from no-reply@weblines.org</p>
            </div>

            <Button className="w-full h-11 gap-2" onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending to all users...</> : <><Send className="h-4 w-4" /> Send to All Users</>}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-xs font-bold mb-2">Quick Templates</h3>
            <div className="space-y-2">
              {[
                { label: "New Feature Announcement", subj: "🚀 New Feature Alert on Weblines CBT!", msg: "Hi there!\n\nWe're excited to announce a brand new feature on Weblines CBT!\n\n📚 Digital Library - Access study materials, textbooks, and past question guides.\n🎯 Custom Exam Builder - Create and share exams with friends.\n🤖 AI Tutor - Get instant help with any subject.\n\nLog in now to explore these features and boost your exam prep!\n\nBest,\nWeblines CBT Team" },
                { label: "Subscription Reminder", subj: "Unlock Full Access for Just ₦2,000 💰", msg: "Hi there!\n\nYou're missing out on unlimited practice exams, AI tutor access, and the full digital library.\n\nSubscribe now for just ₦2,000 (lifetime access) and take your exam preparation to the next level!\n\nDon't wait - your success starts today.\n\nBest,\nWeblines CBT Team" },
              ].map((t) => (
                <Button key={t.label} variant="outline" size="sm" className="w-full text-xs justify-start h-8" onClick={() => { setSubject(t.subj); setBody(t.msg); }}>
                  <Mail className="h-3 w-3 mr-2" /> {t.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminEmail;
