import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowLeft, Plus, BookOpen, Upload, FileText, CheckCircle2, XCircle } from "lucide-react";
import { SUBJECTS } from "@/lib/subjects";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface CSVQuestion {
  subject: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  topic?: string;
  explanation?: string;
  exam_hint?: string;
}

const AdminContent = () => {
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [form, setForm] = useState({ subject: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A", explanation: "", difficulty: "medium" });
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // CSV state
  const [csvData, setCsvData] = useState<CSVQuestion[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvSubject, setCsvSubject] = useState("");

  const fetchCounts = async () => {
    const counts: Record<string, number> = {};
    for (const s of SUBJECTS) {
      const { count } = await supabase.from("questions").select("*", { count: "exact", head: true }).eq("subject", s.id);
      counts[s.id] = count || 0;
    }
    setSubjectCounts(counts);
  };

  useEffect(() => { fetchCounts(); }, []);

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
      fetchCounts();
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { setCsvErrors(["File must have a header row and at least one data row"]); return; }

    const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
    const requiredCols = ["question", "optiona", "optionb", "optionc", "optiond", "correctanswer"];
    const headerNorm = header.map(h => h.replace(/[_\s-]/g, ""));
    const missing = requiredCols.filter(r => !headerNorm.some(h => h.includes(r.replace(/\s/g, ""))));

    if (missing.length > 0) {
      setCsvErrors([`Missing columns: ${missing.join(", ")}. Required: Subject, Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer`]);
      return;
    }

    // Map columns
    const colMap = {
      subject: headerNorm.findIndex(h => h === "subject"),
      question: headerNorm.findIndex(h => h.includes("question") && !h.includes("type")),
      optionA: headerNorm.findIndex(h => h === "optiona"),
      optionB: headerNorm.findIndex(h => h === "optionb"),
      optionC: headerNorm.findIndex(h => h === "optionc"),
      optionD: headerNorm.findIndex(h => h === "optiond"),
      correct: headerNorm.findIndex(h => h.includes("correct")),
      topic: headerNorm.findIndex(h => h === "topic"),
      explanation: headerNorm.findIndex(h => h === "explanation"),
      examHint: headerNorm.findIndex(h => h.includes("hint")),
    };

    const errors: string[] = [];
    const parsed: CSVQuestion[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parsing (handles quoted fields)
      const vals = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.trim().replace(/^"|"$/g, "")) || [];
      
      const subj = colMap.subject >= 0 ? vals[colMap.subject]?.trim() : csvSubject;
      const question = vals[colMap.question]?.trim();
      const optA = vals[colMap.optionA]?.trim();
      const optB = vals[colMap.optionB]?.trim();
      const optC = vals[colMap.optionC]?.trim();
      const optD = vals[colMap.optionD]?.trim();
      const correct = vals[colMap.correct]?.trim().toUpperCase();

      if (!question || !optA || !optB || !optC || !optD || !correct) {
        errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }
      if (!["A", "B", "C", "D"].includes(correct)) {
        errors.push(`Row ${i + 1}: CorrectAnswer must be A, B, C, or D (got "${correct}")`);
        continue;
      }

      parsed.push({
        subject: subj || csvSubject,
        question_text: question,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_answer: correct,
        topic: colMap.topic >= 0 ? vals[colMap.topic]?.trim() : "General",
        explanation: colMap.explanation >= 0 ? vals[colMap.explanation]?.trim() : undefined,
        exam_hint: colMap.examHint >= 0 ? vals[colMap.examHint]?.trim() : undefined,
      });
    }

    setCsvErrors(errors);
    setCsvData(parsed);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Please upload a .csv file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => parseCSV(ev.target?.result as string);
    reader.readAsText(file);
  };

  const uploadCSV = async () => {
    if (csvData.length === 0) return;
    setCsvUploading(true);
    setCsvProgress(0);

    const batchSize = 50;
    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < csvData.length; i += batchSize) {
      const batch = csvData.slice(i, i + batchSize).map(q => ({
        subject: q.subject,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        topic: q.topic || "General",
        difficulty: "medium",
        explanation: q.explanation || null,
        exam_hint: q.exam_hint || null,
      }));

      const { error } = await supabase.from("questions").insert(batch as any);
      if (error) {
        failed += batch.length;
      } else {
        uploaded += batch.length;
      }
      setCsvProgress(Math.round(((i + batchSize) / csvData.length) * 100));
    }

    setCsvUploading(false);
    setCsvProgress(100);
    toast({
      title: `Upload complete!`,
      description: `${uploaded} questions added${failed > 0 ? `, ${failed} failed` : ""}`,
      variant: failed > 0 ? "destructive" : "default",
    });
    setCsvData([]);
    setCsvErrors([]);
    if (fileRef.current) fileRef.current.value = "";
    fetchCounts();
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setShowCSV(!showCSV); setShowAdd(false); }}>
              <Upload className="h-3.5 w-3.5 mr-1" /> CSV Upload
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => { setShowAdd(!showAdd); setShowCSV(false); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* CSV Upload Section */}
        {showCSV && (
          <Card className="border-primary/20">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold">Bulk Upload via CSV</h3>
              </div>
              <p className="text-[10px] text-muted-foreground">
                CSV format: Subject, Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer (optional: Topic, Explanation, ExamHint)
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Default Subject (if not in CSV)</Label>
                  <Select value={csvSubject} onValueChange={setCsvSubject}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">CSV File</Label>
                  <Input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="h-9 text-xs" />
                </div>
              </div>

              {csvErrors.length > 0 && (
                <div className="bg-destructive/10 p-3 rounded-md space-y-1">
                  {csvErrors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-[10px] text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3 shrink-0" /> {e}
                    </p>
                  ))}
                  {csvErrors.length > 10 && <p className="text-[10px] text-destructive">...and {csvErrors.length - 10} more errors</p>}
                </div>
              )}

              {csvData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(142,70%,45%)]" />
                    <p className="text-xs font-medium">{csvData.length} questions ready to upload</p>
                  </div>

                  {/* Preview first 5 */}
                  <div className="max-h-48 overflow-y-auto border border-border rounded-md">
                    <table className="w-full text-[10px]">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Subject</th>
                          <th className="p-2 text-left">Question</th>
                          <th className="p-2 text-left">Answer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.slice(0, 20).map((q, i) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="p-2">{i + 1}</td>
                            <td className="p-2">{q.subject}</td>
                            <td className="p-2 max-w-[200px] truncate">{q.question_text}</td>
                            <td className="p-2">{q.correct_answer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvData.length > 20 && <p className="text-[10px] text-muted-foreground p-2">...and {csvData.length - 20} more</p>}
                  </div>

                  {csvUploading && <Progress value={csvProgress} className="h-2" />}

                  <Button size="sm" className="h-8 text-xs" onClick={uploadCSV} disabled={csvUploading}>
                    {csvUploading ? `Uploading... ${csvProgress}%` : `Upload ${csvData.length} Questions`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
