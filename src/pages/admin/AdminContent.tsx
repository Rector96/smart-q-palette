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
import { parseQuestionCsv, type CSVQuestion } from "@/lib/questionCsv";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

const normalizeDiagramFileName = (name: string) =>
  name.split(/[\\/]/).pop()?.trim().toLowerCase() || "";

const AdminContent = () => {
  const [subjectCounts, setSubjectCounts] = useState<Record<string, { total: number; byYear: Record<string, number> }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [form, setForm] = useState({ subject: "", examination: "JAMB", year: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", option_e: "", correct_answer: "A", explanation: "", diagram_url: "", difficulty: "medium" });
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const diagramFilesRef = useRef<HTMLInputElement>(null);

  // CSV state
  const [csvData, setCsvData] = useState<CSVQuestion[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvSubject, setCsvSubject] = useState("");
  const [csvExamination, setCsvExamination] = useState("JAMB");
  const [csvYear, setCsvYear] = useState("");
  const [diagramFiles, setDiagramFiles] = useState<File[]>([]);
  const referencedDiagramFiles = Array.from(new Set(csvData.flatMap((question) =>
    question.diagram_file && !question.diagram_url ? [question.diagram_file] : [],
  )));
  const missingDiagramFiles = referencedDiagramFiles.filter((name) =>
    !diagramFiles.some((file) => normalizeDiagramFileName(file.name) === normalizeDiagramFileName(name)),
  );

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

  const handleAdd = async () => {
    const questionYear = Number(form.year);
    if (
      !form.subject ||
      !form.examination ||
      !Number.isInteger(questionYear) ||
      questionYear < 1900 ||
      questionYear > new Date().getFullYear() ||
      !form.question_text.trim() ||
      !form.option_a.trim() ||
      !form.option_b.trim() ||
      !form.option_c.trim() ||
      !form.option_d.trim() ||
      (form.correct_answer === "E" && !form.option_e.trim())
    ) {
      toast({ title: "Complete the required question fields", variant: "destructive" });
      return;
    }
    if (form.diagram_url.trim()) {
      try {
        const url = new URL(form.diagram_url.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Diagram URL must use HTTP or HTTPS");
      } catch {
        toast({ title: "Enter a valid diagram URL", variant: "destructive" });
        return;
      }
    }

    const { error } = await supabase.from("questions").insert({
      ...form,
      topic: form.topic.trim() || "General",
      option_e: form.option_e.trim() || null,
      diagram_url: form.diagram_url.trim() || null,
      year: questionYear,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Question added!" });
      setForm({ subject: "", examination: "JAMB", year: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", option_e: "", correct_answer: "A", explanation: "", diagram_url: "", difficulty: "medium" });
      setShowAdd(false);
      fetchCounts();
    }
  };

  const parseCSV = (text: string) => {
    const result = parseQuestionCsv(text, {
      subject: csvSubject,
      examination: csvExamination,
      year: csvYear,
    });
    setCsvErrors(result.errors);
    setCsvData(result.questions);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Please upload a .csv file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") parseCSV(ev.target.result);
      else setCsvErrors(["Could not read the selected CSV file"]);
    };
    reader.onerror = () => setCsvErrors(["Could not read the selected CSV file"]);
    reader.readAsText(file);
  };

  const handleDiagramFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const invalidFile = files.find((file) => !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      toast({
        title: "Unsupported diagram image",
        description: `${invalidFile.name} must be a PNG, JPEG, or WebP under 5 MB.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    setDiagramFiles(files);
  };

  const uploadCSV = async () => {
    if (csvData.length === 0) return;
    if (csvErrors.length > 0) {
      toast({ title: "Fix CSV errors before uploading", description: csvErrors[0], variant: "destructive" });
      return;
    }
    if (missingDiagramFiles.length > 0) {
      toast({
        title: "Diagram files are missing",
        description: `Select: ${missingDiagramFiles.slice(0, 3).join(", ")}${missingDiagramFiles.length > 3 ? ", ..." : ""}`,
        variant: "destructive",
      });
      return;
    }

    setCsvUploading(true);
    setCsvProgress(0);

    try {
      const diagramUrls = new Map<string, string>();
      for (const diagramName of referencedDiagramFiles) {
        const file = diagramFiles.find((candidate) =>
          normalizeDiagramFileName(candidate.name) === normalizeDiagramFileName(diagramName),
        );
        if (!file) continue;

        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `question-bank/${safeFileName}`;
        const { error } = await supabase.storage.from("question-diagrams").upload(storagePath, file, {
          upsert: true,
          contentType: file.type,
        });
        if (error) {
          toast({ title: "Diagram upload failed", description: error.message, variant: "destructive" });
          return;
        }
        const { data } = supabase.storage.from("question-diagrams").getPublicUrl(storagePath);
        diagramUrls.set(normalizeDiagramFileName(diagramName), data.publicUrl);
      }

      const batchSize = 50;
      const failedQuestions: CSVQuestion[] = [];
      const failureMessages: string[] = [];
      let uploaded = 0;

      for (let i = 0; i < csvData.length; i += batchSize) {
        const sourceBatch = csvData.slice(i, i + batchSize);
        const batch = sourceBatch.map((question) => ({
          subject: question.subject,
          examination: question.examination,
          year: question.year,
          question_text: question.question_text,
          option_a: question.option_a,
          option_b: question.option_b,
          option_c: question.option_c,
          option_d: question.option_d,
          option_e: question.option_e,
          correct_answer: question.correct_answer,
          topic: question.topic || "General",
          difficulty: "medium",
          explanation: question.explanation,
          exam_hint: question.exam_hint,
          diagram_url: question.diagram_url || (
            question.diagram_file
              ? diagramUrls.get(normalizeDiagramFileName(question.diagram_file)) || null
              : null
          ),
        }));

        const { error } = await supabase.from("questions").insert(batch);
        if (error) {
          failedQuestions.push(...sourceBatch);
          failureMessages.push(error.message);
        } else {
          uploaded += sourceBatch.length;
        }
        setCsvProgress(Math.round(((i + sourceBatch.length) / csvData.length) * 100));
      }

      setCsvProgress(100);
      if (failedQuestions.length > 0) {
        setCsvData(failedQuestions);
        setCsvErrors([]);
        toast({
          title: `${uploaded} questions added; ${failedQuestions.length} failed`,
          description: failureMessages[0],
          variant: "destructive",
        });
      } else {
        toast({ title: `${uploaded} questions added` });
        setCsvData([]);
        setCsvErrors([]);
        setDiagramFiles([]);
        if (fileRef.current) fileRef.current.value = "";
        if (diagramFilesRef.current) diagramFilesRef.current.value = "";
        fetchCounts();
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unexpected upload error";
      toast({ title: "Question upload failed", description, variant: "destructive" });
    } finally {
      setCsvUploading(false);
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
                Required columns: Question, Option_A–D, Correct_Answer. Option_E is supported and required when the answer is E. Optional: Subject, Examination, Year, Topic, Explanation, ExamHint, Diagram_File, or Diagram_URL. Questions can have different years in one file.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  <Input type="number" min="1900" max={new Date().getFullYear()} value={csvYear} onChange={(e) => setCsvYear(e.target.value)} placeholder="Use Year column" className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">CSV File</Label>
                  <Input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Diagram images</Label>
                  <Input ref={diagramFilesRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleDiagramFilesChange} className="h-9 text-xs" />
                  <p className="mt-1 text-[10px] text-muted-foreground">{diagramFiles.length} images selected; reference filenames in Diagram_File.</p>
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

              {missingDiagramFiles.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3">
                  <p className="text-[10px] font-semibold text-destructive">Select the referenced diagram files before uploading:</p>
                  <p className="mt-1 text-[10px] text-destructive">{missingDiagramFiles.slice(0, 10).join(", ")}</p>
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
                          <th className="p-2 text-left">Diagram</th>
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
                            <td className="p-2">{q.diagram_url ? "URL" : q.diagram_file ? "File" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvData.length > 20 && <p className="text-[10px] text-muted-foreground p-2">...and {csvData.length - 20} more</p>}
                  </div>

                  {csvUploading && <Progress value={csvProgress} className="h-2" />}

                  <Button size="sm" className="h-8 text-xs" onClick={uploadCSV} disabled={csvUploading || csvErrors.length > 0 || missingDiagramFiles.length > 0}>
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
                  <Input type="number" min="1900" max={new Date().getFullYear()} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 1983" className="h-9 text-xs" />
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
                {(["A", "B", "C", "D", "E"] as const).map((letter) => {
                  const field = `option_${letter.toLowerCase()}` as "option_a" | "option_b" | "option_c" | "option_d" | "option_e";
                  return (
                    <div key={letter}>
                      <Label className="text-xs">Option {letter}{letter === "E" ? " (optional)" : ""}</Label>
                      <Input value={form[field]} onChange={(e) => setForm((current) => ({ ...current, [field]: e.target.value }))} className="h-9 text-xs" />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Correct Answer</Label>
                  <Select value={form.correct_answer} onValueChange={(v) => setForm({ ...form, correct_answer: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["A", "B", "C", "D", "E"].map((l) => <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>)}</SelectContent>
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
              <div>
                <Label className="text-xs">Diagram URL (optional)</Label>
                <Input value={form.diagram_url} onChange={(e) => setForm({ ...form, diagram_url: e.target.value })} placeholder="https://..." className="h-9 text-xs" />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd}>Save Question</Button>
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
