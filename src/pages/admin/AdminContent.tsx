import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowLeft, Plus, BookOpen, Upload, CheckCircle2, XCircle, ImagePlus, FileArchive, ClipboardPaste, Loader2 } from "lucide-react";
import { SUBJECTS } from "@/lib/subjects";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

type ImportQuestion = {
  subject: string;
  examination: string;
  year: number;
  topic: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  correct_answer: string;
  difficulty: string;
  explanation: string | null;
  passage?: string | null;
  exam_hint?: string | null;
  question_type?: string | null;
  diagram_file?: string | null;
  question_number?: number | null;
  source_pdf?: string | null;
  source_page?: number | null;
  imageName?: string | null;
  rowNumber: number;
};

type ImportFailure = { row: number; question: string; reason: string };
type ImportSummary = { total: number; imported: number; duplicates: number; failed: number; failures: ImportFailure[] };

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim()); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length)) rows.push(row);
  return rows;
}

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeQuestion(raw: any, rowNumber: number, defaults: { subject: string; examination: string; year: string }): ImportQuestion {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  };
  const rawSubject = String(get("subject") || defaults.subject).trim().toLowerCase();
  const subjectAliases: Record<string, string> = { "english language": "english", "financial accounting": "accounting", "agricultural science": "agricultural_science", "agric science": "agricultural_science", "christian religious studies": "crs", "christian religious knowledge": "crs", "c.r.s": "crs", "islamic religious studies": "irs", "islamic religious knowledge": "irs", "i.r.s": "irs" };
  const subject = subjectAliases[rawSubject] || SUBJECTS.find((item) => item.id === rawSubject || item.name.toLowerCase() === rawSubject)?.id || rawSubject;
  const examination = String(get("examination", "exam") || defaults.examination).trim().toUpperCase();
  const year = Number(get("year") || defaults.year);
  const correct = String(get("correct_answer", "correctAnswer", "answer", "correct")).trim().toUpperCase().replace(/^OPTION\s+/, "").replace(/[.)\s]+$/, "");
  const question = String(get("question_text", "question", "questionText", "text")).trim();
  const image = String(get("imageName", "image_file", "image", "diagram_file", "diagram", "image_url") || "").trim();
  return {
    subject,
    examination,
    year,
    topic: String(get("topic") || "General").trim(),
    question_text: question,
    option_a: String(get("option_a", "optionA", "A")).trim(),
    option_b: String(get("option_b", "optionB", "B")).trim(),
    option_c: String(get("option_c", "optionC", "C")).trim(),
    option_d: String(get("option_d", "optionD", "D")).trim(),
    option_e: String(get("option_e", "optionE", "E")).trim(),
    correct_answer: correct,
    difficulty: String(get("difficulty") || "medium").trim().toLowerCase(),
    explanation: String(get("explanation") || "").trim() || null,
    passage: String(get("passage") || "").trim() || null,
    exam_hint: String(get("exam_hint", "examHint") || "").trim() || null,
    question_type: String(get("question_type", "questionType") || "standard").trim(),
    diagram_file: String(get("diagram_file", "diagramFile", "image_url", "imageUrl") || "").trim() || (/^https?:\/\//i.test(String(get("image") || "")) ? String(get("image")) : null),
    question_number: Number(get("question_number", "questionNumber", "number")) > 0 ? Number(get("question_number", "questionNumber", "number")) : null,
    source_pdf: String(get("source_pdf", "sourcePdf") || "").trim() || null,
    source_page: Number(get("source_page", "sourcePage")) > 0 ? Number(get("source_page", "sourcePage")) : null,
    imageName: image && !/^https?:\/\//i.test(image) ? image.split(/[\\/]/).pop() || image : null,
    rowNumber,
  };
}

function validateQuestion(q: ImportQuestion): string | null {
  if (!q.subject) return "Subject is required";
  if (!SUBJECTS.some((item) => item.id === q.subject)) return "Unknown subject. Use a supported subject name such as Biology, English Language or Financial Accounting.";
  if (!["JAMB", "WAEC", "NECO"].includes(q.examination)) return "Exam must be JAMB, WAEC or NECO";
  if (!Number.isInteger(q.year) || q.year < 1983 || q.year > new Date().getFullYear()) return "Year must be between 1983 and " + new Date().getFullYear();
  if (!q.question_text) return "Question text is required";
  if (!q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.option_e) return "All five options are required";
  if (!["A", "B", "C", "D", "E"].includes(q.correct_answer)) return "Correct answer must be A, B, C, D or E";
  if (!["easy", "medium", "hard"].includes(q.difficulty)) return "Difficulty must be easy, medium or hard";
  return null;
}

async function readZip(file: File): Promise<{ dataFile: File; images: File[] }> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This ZIP file is not valid.");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  let dataFile: File | null = null;
  const images: File[] = [];
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The ZIP archive could not be read.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/") || name.startsWith("__MACOSX/")) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    let content: ArrayBuffer;
    const compressedBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
    if (method === 0) content = compressedBuffer;
    else if (method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("Your browser cannot extract ZIP files. Please upload the CSV/JSON and images separately.");
      const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
      content = await new Response(stream).arrayBuffer();
    } else throw new Error("ZIP compression method is not supported.");
    const lower = name.toLowerCase();
    if (lower.endsWith(".json") || lower.endsWith(".csv")) {
      if (dataFile) throw new Error("Keep only one .json or .csv question file inside the ZIP.");
      dataFile = new File([content], name.split("/").pop() || name, { type: lower.endsWith(".json") ? "application/json" : "text/csv" });
    } else if (/\.(png|jpe?g|webp|gif)$/i.test(name)) {
      const imageName = name.split("/").pop() || name;
      const imageType = /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.webp$/i.test(name) ? "image/webp" : "image/gif";
      images.push(new File([content], imageName, { type: imageType }));
    }
  }
  if (!dataFile) throw new Error("ZIP must contain one .json or .csv question file.");
  return { dataFile, images };
}

const AdminContent = () => {
  const [subjectCounts, setSubjectCounts] = useState<Record<string, { total: number; byYear: Record<string, number> }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [form, setForm] = useState({ subject: "", examination: "JAMB", year: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", option_e: "", correct_answer: "A", explanation: "", difficulty: "medium" });
  const [manualImage, setManualImage] = useState<File | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const manualImageRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<ImportQuestion[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importImages, setImportImages] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [defaultSubject, setDefaultSubject] = useState("");
  const [defaultExam, setDefaultExam] = useState("JAMB");
  const [defaultYear, setDefaultYear] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const fetchCounts = async () => {
    const counts: Record<string, { total: number; byYear: Record<string, number> }> = {};
    SUBJECTS.forEach((subject) => { counts[subject.id] = { total: 0, byYear: {} }; });
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("questions").select("subject,year,examination").order("subject").range(offset, offset + pageSize - 1);
      if (error) { toast({ title: "Could not load question counts", description: error.message, variant: "destructive" }); break; }
      (data || []).forEach((question) => {
        const subject = String(question.subject || "").toLowerCase();
        if (!counts[subject]) counts[subject] = { total: 0, byYear: {} };
        counts[subject].total += 1;
        const yearKey = question.year ? (question.examination || "Other") + " · " + question.year : "Year not set";
        counts[subject].byYear[yearKey] = (counts[subject].byYear[yearKey] || 0) + 1;
      });
      if (!data || data.length < pageSize) break;
    }
    setSubjectCounts(counts);
  };

  useEffect(() => { void fetchCounts(); }, []);

  const handleAdd = async () => {
    const questionYear = Number(form.year);
    if (!form.subject || !form.examination || !Number.isInteger(questionYear) || questionYear < 1990 || questionYear > new Date().getFullYear() || !form.question_text.trim() || !form.option_a.trim()) {
      toast({ title: "Fill required fields", variant: "destructive" }); return;
    }
    let diagramFile: string | null = null;
    if (manualImage && (!IMAGE_TYPES.includes(manualImage.type) || manualImage.size > MAX_IMAGE_SIZE)) {
      toast({ title: "Unsupported image", description: "Use PNG, JPG, WEBP or GIF up to 8 MB.", variant: "destructive" }); return;
    }
    if (manualImage) {
      const path = form.examination + "/" + questionYear + "/" + form.subject + "/" + crypto.randomUUID() + "-" + manualImage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { error: imageError } = await supabase.storage.from("question-diagrams").upload(path, manualImage, { contentType: manualImage.type, upsert: false, cacheControl: "31536000" });
      if (imageError) { toast({ title: "Image upload failed", description: imageError.message, variant: "destructive" }); return; }
      diagramFile = path;
    }
    const { error } = await supabase.from("questions").insert({ ...form, year: questionYear, examination: form.examination, diagram_file: diagramFile } as any);
    if (error) {
      if (diagramFile) await supabase.storage.from("question-diagrams").remove([diagramFile]);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Question added!" });
      setForm({ subject: "", examination: "JAMB", year: "", topic: "", question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_answer: "A", explanation: "", difficulty: "medium" });
      setManualImage(null); if (manualImageRef.current) manualImageRef.current.value = "";
      setShowAdd(false); void fetchCounts();
    }
  };

  const parseDataFile = async (file: File, extraImages: File[] = []) => {
    if (file.size > MAX_FILE_SIZE) throw new Error("The question file is larger than 30 MB.");
    const text = (await file.text()).replace(/^\uFEFF/, "");
    let rawItems: any[];
    if (file.name.toLowerCase().endsWith(".json") || file.type.includes("json")) {
      const parsed = JSON.parse(text);
      rawItems = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];
      if (!rawItems.length) throw new Error("JSON must be an array of questions or an object with a questions array.");
    } else {
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("CSV needs a header row and at least one question.");
      const headers = rows[0].map(headerKey);
      rawItems = rows.slice(1).map((cells) => {
        const item: Record<string, string> = {};
        headers.forEach((header, index) => { item[header] = cells[index] || ""; });
        return item;
      });
      rawItems = rawItems.map((item) => ({
        subject: item.subject,
        exam: item.exam || item.examination,
        year: item.year,
        topic: item.topic,
        question: item.question || item.questiontext,
        option_a: item.optiona || item.option_a,
        option_b: item.optionb || item.option_b,
        option_c: item.optionc || item.option_c,
        option_d: item.optiond || item.option_d,
        correct_answer: item.correctanswer || item.correct_answer || item.answer,
        difficulty: item.difficulty,
        explanation: item.explanation,
        passage: item.passage,
        exam_hint: item.examhint || item.exam_hint,
        image: item.image || item.imagefile || item.imageurl || item.diagramfile || item.diagram_file,
        question_number: item.questionnumber || item.number,
        source_pdf: item.sourcepdf,
        source_page: item.sourcepage,
      }));
    }
    const normalized = rawItems.map((item, index) => normalizeQuestion(item, index + 2, { subject: defaultSubject, examination: defaultExam, year: defaultYear }));
    const errors: string[] = [];
    const valid: ImportQuestion[] = [];
    normalized.forEach((q) => {
      const error = validateQuestion(q);
      if (error) errors.push("Row " + q.rowNumber + ": " + error);
      else valid.push(q);
    });
    setImportImages(extraImages);
    setImportData(valid);
    setImportErrors(errors);
    setSummary(null);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_SIZE) throw new Error("The selected file is larger than 30 MB.");
      let dataFile = file;
      let images: File[] = [];
      if (file.name.toLowerCase().endsWith(".zip")) {
        const extracted = await readZip(file);
        dataFile = extracted.dataFile; images = extracted.images;
      } else if (!/\.(json|csv)$/i.test(file.name)) throw new Error("Choose a .json, .csv or .zip file.");
      await parseDataFile(dataFile, images);
      toast({ title: "Import file ready", description: "Review the questions and image matches before importing." });
    } catch (error: any) {
      setImportData([]); setImportErrors([error.message || "Could not read this file."]);
      toast({ title: "Could not read import file", description: error.message, variant: "destructive" });
    }
  };

  const handlePaste = async () => {
    try {
      const parsed = JSON.parse(pasteText);
      const items = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(items) || !items.length) throw new Error("Paste a JSON array or an object containing a questions array.");
      const file = new File([JSON.stringify(items)], "pasted-questions.json", { type: "application/json" });
      await parseDataFile(file, importImages);
    } catch (error: any) {
      setImportErrors([error.message || "Invalid JSON."]); setImportData([]);
    }
  };

  const chooseImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    const invalid = selected.filter((file) => !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE);
    if (invalid.length) {
      setImportErrors((prev) => [...prev, invalid.map((file) => file.name + " is not a supported image or exceeds 8 MB.").join("\n")]);
    }
    setImportImages((prev) => [...prev, ...selected.filter((file) => IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_SIZE)]);
  };

  const importQuestions = async () => {
    if (!importData.length || importing) return;
    setImporting(true); setProgress(0); setSummary(null);
    const failures: ImportFailure[] = importErrors.map((message, index) => ({ row: Number(message.match(/Row (\d+)/)?.[1] || index + 1), question: "", reason: message.replace(/^Row \d+:\s*/, "") }));
    let imported = 0; let duplicates = 0; let failed = failures.length;
    const duplicateKeys = new Set<string>();
    const groups = new Map<string, ImportQuestion[]>();
    importData.forEach((q) => {
      const key = [q.examination, q.subject, q.year].join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
    });
    const candidates: ImportQuestion[] = [];
    for (const [groupKey, questions] of groups) {
      const parts = groupKey.split("|");
      const existing = new Set<string>();
      let duplicateCheckFailed = false;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("questions").select("question_text")
          .eq("examination", parts[0]).eq("subject", parts[1]).eq("year", Number(parts[2]))
          .range(offset, offset + 999);
        if (error) {
          questions.forEach((q) => failures.push({ row: q.rowNumber, question: q.question_text, reason: "Could not check duplicates: " + error.message }));
          failed += questions.length; duplicateCheckFailed = true; break;
        }
        (data || []).forEach((row) => existing.add(String(row.question_text || "").trim().toLowerCase().replace(/\s+/g, " ")));
        if (!data || data.length < 1000) break;
      }
      if (duplicateCheckFailed) continue;
      questions.forEach((q) => {
        const key = q.question_text.trim().toLowerCase().replace(/\s+/g, " ");
        if (existing.has(key) || duplicateKeys.has(groupKey + "|" + key)) duplicates++;
        else { duplicateKeys.add(groupKey + "|" + key); candidates.push(q); }
      });
    }
    const imageLookup = new Map<string, File>();
    importImages.forEach((file) => imageLookup.set(file.name.toLowerCase(), file));
    const imagePaths = new Map<string, string>();
    for (const q of candidates) {
      if (!q.imageName || /^https?:\/\//i.test(q.diagram_file || "")) continue;
      const imageFile = imageLookup.get(q.imageName.toLowerCase());
      if (!imageFile) {
        failures.push({ row: q.rowNumber, question: q.question_text, reason: "Image file not found: " + q.imageName });
        failed++; continue;
      }
      if (!imagePaths.has(imageFile.name.toLowerCase())) {
        const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = q.examination + "/" + q.year + "/" + q.subject + "/" + crypto.randomUUID() + "-" + safeName;
        const { error } = await supabase.storage.from("question-diagrams").upload(path, imageFile, { contentType: imageFile.type, upsert: false, cacheControl: "31536000" });
        if (error) {
          failures.push({ row: q.rowNumber, question: q.question_text, reason: "Image upload failed: " + error.message });
          failed++; continue;
        }
        imagePaths.set(imageFile.name.toLowerCase(), path);
      }
    }
    const ready = candidates.filter((q) => {
      if (q.imageName && !/^https?:\/\//i.test(q.diagram_file || "") && !imagePaths.has(q.imageName.toLowerCase())) return false;
      return true;
    });
    let processed = duplicates + failures.length;
    const batchSize = 25;
    for (let i = 0; i < ready.length; i += batchSize) {
      const batch = ready.slice(i, i + batchSize).map((q) => {
        let diagram = q.diagram_file || null;
        if (q.imageName && imagePaths.has(q.imageName.toLowerCase())) diagram = imagePaths.get(q.imageName.toLowerCase())!;
        return {
          subject: q.subject, examination: q.examination, year: q.year, topic: q.topic || "General",
          question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, option_e: q.option_e,
          correct_answer: q.correct_answer, difficulty: q.difficulty || "medium", explanation: q.explanation,
          passage: q.passage || null, exam_hint: q.exam_hint || null, question_type: q.question_type || "standard",
          diagram_file: diagram, question_number: q.question_number ?? null, source_pdf: q.source_pdf || null, source_page: q.source_page ?? null,
          answer_status: "UNVERIFIED", is_published: true,
        };
      });
      const { error } = await supabase.from("questions").insert(batch as any);
      if (error) {
        for (let j = 0; j < batch.length; j++) {
          const { error: rowError } = await supabase.from("questions").insert(batch[j] as any);
          if (rowError) {
            failures.push({ row: ready[i + j].rowNumber, question: ready[i + j].question_text, reason: rowError.message });
            failed++;
          } else imported++;
        }
      } else imported += batch.length;
      processed += batch.length;
      setProgress(Math.min(100, Math.round((processed / (importData.length + importErrors.length)) * 100)));
      setProgressText(processed + " of " + (importData.length + importErrors.length) + " questions processed");
    }
    const result = { total: importData.length + importErrors.length, imported, duplicates, failed, failures };
    setSummary(result); setImporting(false); setProgress(100);
    toast({ title: "Question import finished", description: imported + " imported · " + duplicates + " duplicates skipped · " + failed + " failed", variant: failed ? "destructive" : "default" });
    void fetchCounts();
  };

  const imagePreviews = useMemo(() => importImages.map((file) => ({ name: file.name.toLowerCase(), url: URL.createObjectURL(file) })), [importImages]);
  useEffect(() => () => imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [imagePreviews]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Content Management</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant={showImporter ? "default" : "outline"} className="h-8 text-xs" onClick={() => { setShowImporter(!showImporter); setShowAdd(false); }}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Bulk Import
            </Button>
            <Button size="sm" variant={showAdd ? "secondary" : "default"} className="h-8 text-xs" onClick={() => { setShowAdd(!showAdd); setShowImporter(false); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Question
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {showImporter && (
          <Card className="border-primary/20">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2"><FileArchive className="h-5 w-5 text-primary" /><div><h3 className="text-sm font-bold">Historical Question Bank Importer</h3><p className="text-[11px] text-muted-foreground">Import JAMB, WAEC or NECO questions from 1983 onwards, including five-option questions and diagrams.</p></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Default subject</Label><Select value={defaultSubject} onValueChange={setDefaultSubject}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Used when subject is missing" /></SelectTrigger><SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">Default exam</Label><Select value={defaultExam} onValueChange={setDefaultExam}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["JAMB", "WAEC", "NECO"].map((exam) => <SelectItem key={exam} value={exam}>{exam}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs">Default year</Label><Input type="number" min="1983" max={new Date().getFullYear()} value={defaultYear} onChange={(e) => setDefaultYear(e.target.value)} placeholder="e.g. 2015" className="h-9 text-xs" /></div>
              </div>
              <div className="rounded-xl border border-dashed border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Upload a question file</p><p className="text-[10px] text-muted-foreground">JSON, CSV or ZIP (one JSON/CSV plus an images folder). Max 30 MB.</p></div><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Choose file</Button></div>
                <input ref={fileRef} type="file" accept=".json,.csv,.zip,application/json,text/csv,application/zip" className="hidden" onChange={handleFile} />
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{importData.length} valid questions</Badge><Badge variant="outline">{importImages.length} images attached</Badge><Badge variant="outline">{importErrors.length} validation errors</Badge></div>
              </div>
              <p className="rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">Imported questions become available to students after saving. Their answer status remains UNVERIFIED so your team can keep track of answer-key review.</p>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { const rows = [["subject","exam","year","question_number","topic","question","option_a","option_b","option_c","option_d","correct_answer","difficulty","explanation","image","source_pdf","source_page"],["biology","JAMB","2015","1","Cells","Which structure controls cell activities?","Nucleus","Cell wall","Cytoplasm","Vacuole","A","medium","The nucleus controls cell activities.","q1.png","JAMB_2015_Biology.pdf","2"]]; const csv = rows.map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "smart-q-palette-question-template.csv"; a.click(); URL.revokeObjectURL(url); }}>Download CSV template</Button><Button size="sm" variant="outline" onClick={() => { const sample = [{ subject: "biology", exam: "JAMB", year: 2015, question_number: 1, topic: "Cells", question: "Which structure controls cell activities?", option_a: "Nucleus", option_b: "Cell wall", option_c: "Cytoplasm", option_d: "Vacuole", correct_answer: "A", difficulty: "medium", explanation: "The nucleus controls cell activities.", image: "q1.png", source_pdf: "JAMB_2015_Biology.pdf", source_page: 2 }]; const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "smart-q-palette-question-template.json"; a.click(); URL.revokeObjectURL(url); }}>Download JSON template</Button></div>
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2"><ClipboardPaste className="h-4 w-4 text-primary" /><p className="text-xs font-semibold">Or paste a JSON array</p></div>
                <Textarea rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder='[{"subject":"biology","exam":"JAMB","year":2015,"topic":"Cells","question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_answer":"A"}]' className="text-xs font-mono" />
                <Button size="sm" variant="outline" onClick={handlePaste} disabled={!pasteText.trim()}>Preview pasted questions</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={chooseImages} />
                <Button size="sm" variant="outline" onClick={() => imageRef.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Add image files separately</Button>
                <p className="text-[10px] text-muted-foreground">For CSV/JSON, set the image field to the exact image filename. Images up to 8 MB each.</p>
              </div>
              {importErrors.length > 0 && <div className="rounded-lg bg-destructive/10 p-3 space-y-1"><p className="text-xs font-semibold text-destructive">{importErrors.length} rows need attention</p>{importErrors.slice(0, 12).map((error, i) => <p key={i} className="text-[10px] text-destructive flex gap-1"><XCircle className="h-3 w-3 shrink-0" />{error}</p>)}{importErrors.length > 12 && <p className="text-[10px] text-destructive">And {importErrors.length - 12} more.</p>}</div>}
              {importData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><p className="text-xs font-semibold">{importData.length} questions ready for review</p></div>
                  <div className="max-h-72 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Exam / Year</th><th className="p-2 text-left">Subject</th><th className="p-2 text-left">Question</th><th className="p-2 text-left">Answer</th><th className="p-2 text-left">Image</th></tr></thead>
                      <tbody>{importData.slice(0, 100).map((q) => <tr key={q.rowNumber} className="border-t border-border/60"><td className="p-2">{q.rowNumber}</td><td className="p-2 whitespace-nowrap">{q.examination} {q.year}</td><td className="p-2">{q.subject}</td><td className="p-2 max-w-[260px]"><span className="line-clamp-2">{q.question_text}</span></td><td className="p-2">{q.correct_answer}</td><td className="p-2">{q.imageName ? <div className="flex items-center gap-2"><img src={imagePreviews.find((item) => item.name === q.imageName?.toLowerCase())?.url} alt="" className="h-10 w-12 rounded object-contain bg-muted" /> <span className="max-w-[100px] truncate">{q.imageName}</span></div> : q.diagram_file ? <Badge variant="secondary">Image URL</Badge> : "—"}</td></tr>)}</tbody>
                    </table>
                    {importData.length > 100 && <p className="p-2 text-[10px] text-muted-foreground">Showing first 100 of {importData.length} questions.</p>}
                  </div>
                  {importing && <div className="space-y-1"><Progress value={progress} className="h-2" /><p className="text-[10px] text-muted-foreground">{progressText}</p></div>}
                  <Button size="sm" onClick={importQuestions} disabled={importing}>{importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing {progress}%</> : "Import " + importData.length + " questions"}</Button>
                </div>
              )}
              {summary && <div className="rounded-xl border border-border p-3 space-y-2"><p className="text-sm font-semibold">Import summary</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><div><p className="text-lg font-bold text-emerald-600">{summary.imported}</p><p className="text-[10px] text-muted-foreground">Imported</p></div><div><p className="text-lg font-bold">{summary.duplicates}</p><p className="text-[10px] text-muted-foreground">Duplicates skipped</p></div><div><p className="text-lg font-bold text-destructive">{summary.failed}</p><p className="text-[10px] text-muted-foreground">Failed</p></div><div><p className="text-lg font-bold">{summary.total}</p><p className="text-[10px] text-muted-foreground">Total rows</p></div></div>{summary.failures.length > 0 && <div className="max-h-40 overflow-auto space-y-1 border-t pt-2">{summary.failures.map((failure, i) => <p key={i} className="text-[10px] text-destructive">Row {failure.row}: {failure.reason} — {failure.question.slice(0, 100)}</p>)}</div>}</div>}
            </CardContent>
          </Card>
        )}

        {showAdd && (
          <Card className="border-primary/20"><CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Subject</Label><Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select subject" /></SelectTrigger><SelectContent>{SUBJECTS.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Examination</Label><Select value={form.examination} onValueChange={(v) => setForm({ ...form, examination: v })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["JAMB", "WAEC", "NECO"].map((exam) => <SelectItem key={exam} value={exam}>{exam}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Year</Label><Input type="number" min="1990" max={new Date().getFullYear()} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="e.g. 2024" className="h-9 text-xs" /></div>
              <div><Label className="text-xs">Topic</Label><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="h-9 text-xs" /></div>
            </div>
            <div><Label className="text-xs">Question</Label><Textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} className="text-xs" rows={2} /></div>
            <div className="space-y-2"><Label className="text-xs">Question image / diagram (optional)</Label><Input ref={manualImageRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="h-9 text-xs" onChange={(e) => setManualImage(e.target.files?.[0] || null)} />{manualImage && <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><ImagePlus className="h-4 w-4" />{manualImage.name}</div>}</div>
            <div className="grid grid-cols-2 gap-3">{["A", "B", "C", "D", "E"].map((l) => <div key={l}><Label className="text-xs">Option {l}</Label><Input value={(form as any)["option_" + l.toLowerCase()]} onChange={(e) => setForm({ ...form, ["option_" + l.toLowerCase()]: e.target.value })} className="h-9 text-xs" /></div>)}</div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Correct Answer</Label><Select value={form.correct_answer} onValueChange={(v) => setForm({ ...form, correct_answer: v })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["A", "B", "C", "D", "E"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Difficulty</Label><Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["easy", "medium", "hard"].map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label className="text-xs">Explanation (optional)</Label><Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} className="text-xs" rows={2} /></div>
            <Button size="sm" className="h-8 text-xs" onClick={handleAdd}>Save Question</Button>
          </CardContent></Card>
        )}

        <section className="space-y-3">
          <div><h2 className="text-sm font-bold">Question Bank by Subject and Year</h2><p className="text-[11px] text-muted-foreground">Track how many questions are available for each examination year. Counts include all questions in the admin bank.</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{SUBJECTS.map((s) => {
            const summary = subjectCounts[s.id] || { total: 0, byYear: {} };
            const yearEntries = Object.entries(summary.byYear).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
            return <Card key={s.id} className="border-border/50"><CardContent className="p-4 space-y-2"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0"><BookOpen className="h-4 w-4 shrink-0 text-primary" /><p className="text-xs font-semibold truncate">{s.name}</p></div><Badge variant="secondary" className="text-[10px] shrink-0">{summary.total} total</Badge></div>{yearEntries.length ? <div className="space-y-1 border-t border-border/60 pt-2">{yearEntries.map(([year, count]) => <div key={year} className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">{year}</span><span className="font-semibold tabular-nums">{count} questions</span></div>)}</div> : <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">No questions added yet.</p>}</CardContent></Card>;
          })}</div>
        </section>
      </main>
    </div>
  );
};

export default AdminContent;
