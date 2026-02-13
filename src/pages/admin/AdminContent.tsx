import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowLeft, Plus, BookOpen } from "lucide-react";
import { SUBJECTS } from "@/lib/subjects";
import { useToast } from "@/hooks/use-toast";

const AdminContent = () => {
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ subject: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A", explanation: "", difficulty: "medium" });
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const counts: Record<string, number> = {};
      for (const s of SUBJECTS) {
        const { count } = await supabase.from("questions").select("*", { count: "exact", head: true }).eq("subject", s.id);
        counts[s.id] = count || 0;
      }
      setSubjectCounts(counts);
    };
    fetch();
  }, []);

  const handleAdd = async () => {
    if (!form.subject || !form.question_text || !form.option_a) {
      toast({ title: "Fill required fields", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("questions").insert(form as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Question added!" });
      setForm({ subject: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A", explanation: "", difficulty: "medium" });
      setShowAdd(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Content Management</span>
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {showAdd && (
          <Card className="border-primary/20">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Topic</Label>
                  <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="h-9 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Question</Label>
                <Textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} className="text-xs" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {["A", "B", "C", "D"].map((l) => (
                  <div key={l}>
                    <Label className="text-xs">Option {l}</Label>
                    <Input value={(form as any)[`option_${l.toLowerCase()}`]} onChange={(e) => setForm({ ...form, [`option_${l.toLowerCase()}`]: e.target.value })} className="h-9 text-xs" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Correct Answer</Label>
                  <Select value={form.correct_answer} onValueChange={(v) => setForm({ ...form, correct_answer: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["A", "B", "C", "D"].map((l) => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Difficulty</Label>
                  <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["easy", "medium", "hard"].map((d) => <SelectItem key={d} value={d} className="text-xs capitalize">{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Explanation (optional)</Label>
                <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} className="text-xs" rows={2} />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd}>Save Question</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {SUBJECTS.map((s) => (
            <Card key={s.id} className="border-border/50">
              <CardContent className="p-4 text-center">
                <BookOpen className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-xs font-medium">{s.name}</p>
                <Badge variant="secondary" className="text-[10px] mt-1">{subjectCounts[s.id] || 0} questions</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default AdminContent;
