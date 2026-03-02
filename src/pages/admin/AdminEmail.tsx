import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, ArrowLeft, Send, Loader2, Mail, Users, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const AdminEmail = () => {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCount, setSentCount] = useState(0);

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
      setSentCount(data?.sent || 0);
      setSent(true);
      toast({ title: `Emails sent to ${data?.sent || 0} users!` });
    } catch (e: any) {
      toast({ title: "Error sending", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-sm w-full text-center space-y-4">
          <div className="h-16 w-16 bg-[hsl(var(--success))]/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />
          </div>
          <h2 className="text-lg font-bold">Emails Sent!</h2>
          <p className="text-sm text-muted-foreground">Successfully sent to {sentCount} users.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/admin"><Button variant="outline">Back to Admin</Button></Link>
            <Button onClick={() => { setSent(false); setSubject(""); setBody(""); }}>Send Another</Button>
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
              <p className="text-[11px] text-muted-foreground">Send an email to all registered users at once</p>
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
                placeholder="Write your message here. You can use basic formatting:\n\n- Use line breaks for paragraphs\n- Mention new features, updates, or reminders"
                rows={8}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">This will be formatted into a branded Weblines CBT email template.</p>
            </div>

            <Button className="w-full h-11 gap-2" onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send to All Users</>}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="text-xs font-bold mb-2">Quick Templates</h3>
            <div className="space-y-2">
              {[
                { label: "New Feature Announcement", subj: "🚀 New Feature Alert on Weblines CBT!", msg: "Hi there!\n\nWe're excited to announce a brand new feature on Weblines CBT!\n\n📚 Digital Library - Access study materials, textbooks, and past question guides.\n🎯 Custom Exam Builder - Create and share exams with friends.\n🤖 AI Tutor - Get instant help with any subject.\n\nLog in now to explore these features and boost your exam prep!\n\nBest,\nWeblines CBT Team" },
                { label: "Subscription Reminder", subj: "Unlock Full Access for Just ₦1,500 💰", msg: "Hi there!\n\nYou're missing out on unlimited practice exams, AI tutor access, and the full digital library.\n\nSubscribe now for just ₦1,500 (lifetime access) and take your exam preparation to the next level!\n\nDon't wait - your success starts today.\n\nBest,\nWeblines CBT Team" },
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
