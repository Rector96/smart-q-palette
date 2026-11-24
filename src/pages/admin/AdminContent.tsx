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
  examination: string;
  year: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  topic?: string;
  explanation?: string;
  exam_hint?: string;
  diagram_url?: string | null;
  diagram_file?: string | null;
}

const AdminContent = () => {
  const [subjectCounts, setSubjectCounts] = useState<Record<string, { total: number; byYear: Record<string, number> }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [form, setForm] = useState({ subject: "", examination: "JAMB", year: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A", explanation: "", difficulty: "medium", diagram_url: "" });
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const diagramInputRef = useRef<HTMLInputElement>(null);
  const [diagramUploading, setDiagramUploading] = useState(false);

  // CSV state
  const [csvData, setCsvData] = useState<CSVQuestion[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvSubject, setCsvSubject] = useState("");
  const [csvExamination, setCsvExamination] = useState("JAMB");
  const [csvYear, setCsvYear] = useState("");
  const [csvDiagramFiles, setCsvDiagramFiles] = useState<File[]>([]);

  const fetchCounts = async () => {
    const counts: Record<string, { total: number; byYear: Record<string, number> }> = {};
    SUBJECTS.forEach((subject) => { counts[subject.id] = { total: 0, byYear: {} }; });
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("questions")
        .select("subject,year,examination")
        .order("subject")
        .range(offset, offset + pageSize - 1);
      if (error) {
        toast({ title: "Could not load question counts", description: error.message, variant: "destructive" });
        break;
      }
      (data || []).forEach((question) => {
        const subject = String(question.subject || "").toLowerCase();
        if (!counts[subject]) counts[subject] = { total: 0, byYear: {} };
        counts[subject].total += 1;
        const yearKey = question.year ? `${question.examination || "Other"} · ${question.year}` : "Year not set";
        counts[subject].byYear[yearKey] = (counts[subject].byYear[yearKey] || 0) + 1;
      });
      if (!data || data.length < pageSize) break;
    }
    setSubjectCounts(counts);
  };

  useEffect(() => { fetchCounts(); }, []);

  const handleDiagramUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast({ title: "Unsupported diagram", description: "Use a JPG, PNG or WEBP image up to 10 MB.", variant: "destructive" });
      return;
    }
    setDiagramUploading(true);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const safeSubject = (form.subject || "general").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const objectPath = safeSubject + "/" + (form.year || "undated") + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + extension;
    const { error } = await supabase.storage.from("question-diagrams").upload(objectPath, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    setDiagramUploading(false);
    if (error) { toast({ title: "Diagram upload failed", description: error.message, variant: "destructive" }); return; }
    const publicUrl = supabase.storage.from("question-diagrams").getPublicUrl(objectPath).data.publicUrl;
    setForm((previous) => ({ ...previous, diagram_url: publicUrl }));
    toast({ title: "Diagram uploaded", description: "The diagram will be attached when you save this question." });
  };
  const handleAdd = async () => {
    const questionYear = Number(form.year);
    if (!form.subject || !form.examination || !Number.isInteger(questionYear) || questionYear < 1990 || questionYear > new Date().getFullYear() || !form.question_text || !form.option_a) {
      toast({ title: "Fill required fields", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("questions").insert({ ...form, diagram_url: form.diagram_url || null, year: questionYear, examination: form.examination } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Question added!" });
      setForm({ subject: "", examination: "JAMB", year: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A", explanation: "", difficulty: "medium", diagram_url: "" });
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
      examination: headerNorm.findIndex(h => h === "examination" || h === "exam"),
      year: headerNorm.findIndex(h => h === "year"),
      diagramUrl: headerNorm.findIndex(h => h === "diagramurl" || h === "imageurl"),
      diagramFile: headerNorm.findIndex(h => h === "diagramfile" || h === "imagefile"),
    };

    const errors: string[] = [];
    const parsed: CSVQuestion[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parsing (handles quoted fields)
      // Improved CSV parsing that handles empty fields and quoted values
      const vals: string[] = [];
      let current = '';
      let inQuotes = false;
      const line = lines[i];
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          vals.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      vals.push(current.trim());
      
      const subj = colMap.subject >= 0 ? vals[colMap.subject]?.trim() : csvSubject;
      const question = vals[colMap.question]?.trim();
      const optA = vals[colMap.optionA]?.trim();
      const optB = vals[colMap.optionB]?.trim();
      const optC = vals[colMap.optionC]?.trim();
      const optD = vals[colMap.optionD]?.trim();
      const correct = vals[colMap.correct]?.trim().toUpperCase();
      const examination = (colMap.examination >= 0 ? vals[colMap.examination]?.trim().toUpperCase() : csvExamination) || csvExamination;
      const year = Number((colMap.year >= 0 ? vals[colMap.year]?.trim() : csvYear) || 0);

      if (!(subj || csvSubject)) {
        errors.push(`Row ${i + 1}: Select or provide a subject`);
        continue;
      }
      if (!question || !optA || !optB || !optC || !optD || !correct) {
        errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }
      if (!["JAMB", "WAEC", "NECO"].includes(examination)) {
        errors.push(`Row ${i + 1}: Examination must be JAMB, WAEC or NECO`);
        continue;
      }
      if (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear()) {
        errors.push(`Row ${i + 1}: Enter a valid examination year (1990–${new Date().getFullYear()})`);
        continue;
      }
      if (!["A", "B", "C", "D"].includes(correct)) {
        errors.push(`Row ${i + 1}: CorrectAnswer must be A, B, C, or D (got "${correct}")`);
        continue;
      }

      parsed.push({
        subject: (subj || csvSubject).toLowerCase(),
        examination,
        year,
        question_text: question,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_answer: correct,
        topic: colMap.topic >= 0 ? vals[colMap.topic]?.trim() : "General",
        explanation: colMap.explanation >= 0 ? vals[colMap.explanation]?.trim() : undefined,
        exam_hint: colMap.examHint >= 0 ? vals[colMap.examHint]?.trim() : undefined,
        diagram_url: colMap.diagramUrl >= 0 ? vals[colMap.diagramUrl]?.trim() || null : null,
        diagram_file: colMap.diagramFile >= 0 ? vals[colMap.diagramFile]?.trim() || null : null,
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
    const missingDiagramFiles = csvData
      .map((question) => question.diagram_file)
      .filter((name): name is string => Boolean(name))
      .filter((name) => !csvDiagramFiles.some((file) => file.name.toLowerCase() === name.toLowerCase()));
    if (missingDiagramFiles.length > 0) {
      setCsvErrors(["Select these diagram files before importing: " + [...new Set(missingDiagramFiles)].join(", ")]);
      return;
    }
    setCsvUploading(true);
    setCsvProgress(0);

    const diagramUrls = new Map<string, string>();
    for (const file of csvDiagramFiles) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!["jpg", "jpeg", "png", "webp"].includes(extension) || file.size > 10 * 1024 * 1024) {
        setCsvUploading(false);
        toast({ title: "Invalid diagram file", description: file.name + " must be JPG, PNG or WEBP and no larger than 10 MB.", variant: "destructive" });
        return;
      }
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
      const objectPath = "csv-imports/" + Date.now() + "-" + safeName;
      const { error } = await supabase.storage.from("question-diagrams").upload(objectPath, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) {
        setCsvUploading(false);
        toast({ title: "Diagram upload failed", description: file.name + ": " + error.message, variant: "destructive" });
        return;
      }
      const publicUrl = supabase.storage.from("question-diagrams").getPublicUrl(objectPath).data.publicUrl;
      diagramUrls.set(file.name.toLowerCase(), publicUrl);
    }

    const batchSize = 50;
    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < csvData.length; i += batchSize) {
      const batch = csvData.slice(i, i + batchSize).map(q => ({
        subject: q.subject,
        examination: q.examination,
        year: q.year,
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
        diagram_url: q.diagram_url || (q.diagram_file ? diagramUrls.get(q.diagram_file.toLowerCase()) : null) || null,
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
    setCsvDiagramFiles([]);
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
                CSV format: Subject, Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer. Optional: Examination, Year, Topic, Explanation, ExamHint, DiagramURL or DiagramFile. For DiagramFile, select the matching image files below (filenames must match).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Default Subject (if not in CSV)</Label>
                  <Select value={csvSubject} onValueChange={setCsvSubject}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Examination (default)</Label>
                  <Select value={csvExamination} onValueChange={setCsvExamination}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["JAMB", "WAEC", "NECO"].map((exam) => <SelectItem key={exam} value={exam}>{exam}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Year (default)</Label>
                  <Input type="number" min="1990" max={new Date().getFullYear()} value={csvYear} onChange={(e) => setCsvYear(e.target.value)} placeholder="e.g. 2024" className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">CSV File</Label>
                  <Input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Question diagrams (optional)</Label>
                  <Input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    const invalid = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024);
                    if (invalid) {
                      toast({ title: "Invalid diagram file", description: invalid.name + " must be JPG, PNG or WEBP and no larger than 10 MB.", variant: "destructive" });
                      event.target.value = "";
                      return;
                    }
                    setCsvDiagramFiles(files);
                  }} className="h-9 text-xs" disabled={csvUploading} />
                  {csvDiagramFiles.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">{csvDiagramFiles.length} diagram image(s) selected</p>}
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
                          <th className="p-2 text-left">Exam / Year</th>
                          <th className="p-2 text-left">Subject</th>
                          <th className="p-2 text-left">Question</th>
                          <th className="p-2 text-left">Answer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.slice(0, 20).map((q, i) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="p-2">{i + 1}</td>
                            <td className="p-2">{q.examination} {q.year}</td>
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
                  <Label className="text-xs">Examination</Label>
                  <Select value={form.examination} onValueChange={(v) => setForm({ ...form, examination: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["JAMB", "WAEC", "NECO"].map((exam) => <SelectItem key={exam} value={exam}>{exam}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Year</Label>
                  <Input type="number" min="1990" max={new Date().getFullYear()} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2024" className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Topic</Label>
                  <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="h-9 text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Question Diagram (optional)</Label>
                <Input ref={diagramInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleDiagramUpload} disabled={diagramUploading} className="h-9 text-xs" />
                {diagramUploading && <p className="text-xs text-muted-foreground">Uploading diagram…</p>}
                {form.diagram_url && <div className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-2"><img src={form.diagram_url} alt="Question diagram preview" className="max-h-32 max-w-full rounded object-contain" /><Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, diagram_url: "" })}>Remove</Button></div>}
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
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={diagramUploading}>Save Question</Button>
            </CardContent>
          </Card>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold">Question Bank by Subject and Year</h2>
            <p className="text-[11px] text-muted-foreground">Track how many questions are available for each examination year. Counts include all questions in the admin bank.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SUBJECTS.map((s) => {
              const summary = subjectCounts[s.id] || { total: 0, byYear: {} };
              const yearEntries = Object.entries(summary.byYear).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
              return (
                <Card key={s.id} className="border-border/50">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                        <p className="text-xs font-semibold truncate">{s.name}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{summary.total} total</Badge>
                    </div>
                    {yearEntries.length ? (
                      <div className="space-y-1 border-t border-border/60 pt-2">
                        {yearEntries.map(([year, count]) => (
                          <div key={year} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">{year}</span>
                            <span className="font-semibold tabular-nums">{count} questions</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">No questions added yet.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminContent;
