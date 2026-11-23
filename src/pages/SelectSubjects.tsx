import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SUBJECTS, type ExamMode } from "@/lib/subjects";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Clock, Hash, GraduationCap, CalendarDays, BookOpen, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";

const QUESTION_PRESETS = [10, 20, 40, 60];
type ExamType = "JAMB" | "WAEC" | "NECO";
type CatalogItem = { examination: ExamType; year: number; subject: string };

const subjectIcon = (name: string) => {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    englishlanguage: "english", christianreligiousstudies: "crs",
    islamicreligiousstudies: "irs", financialaccounting: "accounting",
    agriculturalscience: "agricultural_science",
  };
  const id = aliases[key] || key;
  return SUBJECTS.find((subject) => subject.id.replace(/_/g, "") === id.replace(/_/g, ""))?.icon || BookOpen;
};

const SelectSubjects = () => {
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") || "practice") as ExamMode;
  const preselected = searchParams.get("subject");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [examination, setExamination] = useState<ExamType | "">("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customMinutes, setCustomMinutes] = useState(60);
  const [questionCount, setQuestionCount] = useState(60);
  const [adaptivePractice, setAdaptivePractice] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMock = mode === "mock";
  const maxSubjects = isMock ? 4 : 1;

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      setCatalogLoading(true);
      const { data, error } = await supabase.functions.invoke("cbt-catalog", { body: {} });
      if (!active) return;
      if (error || !Array.isArray(data?.catalog)) {
        setCatalogError(data?.error || error?.message || "We could not load available examinations.");
      } else {
        const availableCatalog = data.catalog as CatalogItem[];
        setCatalog(availableCatalog);
        if (preselected) {
          const match = availableCatalog.find((item) => item.subject.toLowerCase() === preselected.toLowerCase());
          if (match) {
            setExamination(match.examination);
            setSelectedYear(String(match.year));
            setSelected([match.subject]);
          }
        } else if (mode === "revision" && availableCatalog.length > 0) {
          // Preselect an available exam source so revision students can choose a subject immediately.
          const firstAvailableExam = availableCatalog.find((item) => item.examination === "JAMB") || availableCatalog[0];
          setExamination(firstAvailableExam.examination);
        }
      }
      setCatalogLoading(false);
    };
    loadCatalog();
    return () => { active = false; };
  }, []);

  // Only show years that have published questions for this examination.
  const availableYears = useMemo(
    () => [...new Set(catalog
      .filter((item) => item.examination === examination)
      .map((item) => Number(item.year))
      .filter((year) => Number.isInteger(year) && year > 0))]
      .sort((a, b) => b - a),
    [catalog, examination],
  );

  // Subjects are scoped to the selected examination AND year.
  const availableSubjects = useMemo(() => {
    if (!examination || !selectedYear) return [];
    const rows = catalog.filter((item) => item.examination === examination && String(item.year) === selectedYear);
    return [...new Map(rows.map((item) => [item.subject.toLowerCase(), item.subject])).values()]
      .sort((a, b) => a.localeCompare(b));
  }, [catalog, examination, selectedYear]);

  const toggleSubject = (name: string) => {
    if (selected.includes(name)) {
      setSelected(selected.filter((item) => item !== name));
    } else if (selected.length < maxSubjects) {
      setSelected([...selected, name]);
    }
  };

  useEffect(() => {
    if (selected.length > 0) {
      const timer = window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 150);
      return () => window.clearTimeout(timer);
    }
  }, [selected]);

  const handleExamChange = (value: ExamType) => {
    if (isMock && value !== "JAMB") {
      toast({ title: "JAMB mock format", description: "The full four-subject mock exam currently follows the JAMB format. Choose JAMB or select another exam mode." });
      return;
    }
    setExamination(value);
    setSelectedYear("");
    setSelected([]);
  };

  const handleYearChange = (value: string) => {
    setSelectedYear(value);
    setSelected([]);
  };

  const handleStart = () => {
    if (!examination || !selectedYear || selected.length === 0) return;
    if (!Number.isInteger(questionCount) || questionCount < 1) {
      toast({ title: "Choose a valid question count", description: "Enter a number between 1 and 60.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(customMinutes) || customMinutes < 1) {
      toast({ title: "Choose a valid duration", description: "Enter at least one minute.", variant: "destructive" });
      return;
    }
    const params = new URLSearchParams({
      mode,
      examination,
      year: selectedYear,
      subjects: selected.join(","),
      count: String(questionCount),
      timer: String(customMinutes),
      adaptive: String(adaptivePractice && (mode === "practice" || mode === "revision")),
    });
    navigate(`/exam?${params.toString()}`);
  };

  const examOptions: ExamType[] = isMock ? ["JAMB"] : ["JAMB", "WAEC", "NECO"];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" showText={false} />
          <span className="font-bold text-sm">Select {isMock ? "4 Subjects" : "Subject"}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-xs text-muted-foreground mb-4">
          {mode === "revision"
            ? "Choose a subject to review. Questions you have practised and are due to repeat will appear first."
            : isMock
              ? `Select exactly 4 subjects for your mock exam (${selected.length}/4 selected)`
              : "Choose your examination, year and subject to begin practice."}
        </p>

        {catalogLoading ? (
          <Card className="border-border/50"><CardContent className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading available examinations…</CardContent></Card>
        ) : catalogError ? (
          <Card className="border-destructive/30"><CardContent className="p-4 text-sm text-destructive">{catalogError}</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {examOptions.map((exam) => {
                const isSelected = examination === exam;
                const hasContent = catalog.some((item) => item.examination === exam);
                return (
                  <motion.div key={exam} whileTap={{ scale: 0.98 }}>
                    <Card
                      className={cn("h-full border-2 transition-all cursor-pointer shadow-sm", isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border/50 hover:border-primary/30", !hasContent && "opacity-60")}
                      onClick={() => handleExamChange(exam)}
                    >
                      <CardContent className="p-4 text-center">
                        <GraduationCap className="h-6 w-6 mx-auto mb-2 text-primary" />
                        <p className="text-xs font-medium">{exam}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{hasContent ? "Available" : "Coming soon"}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {examination && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-semibold">Select Year</Label>
                    </div>
                    {availableYears.length === 0 ? (
                      <p className="pt-2 text-xs text-muted-foreground">No years are available for {examination} yet.</p>
                    ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2">
                      {availableYears.map((year) => {
                        const isSelected = selectedYear === String(year);
                        const isHot = year >= 2021;
                        return (
                          <motion.div key={year} whileTap={{ scale: 0.97 }}>
                            <Card
                              role="button"
                              tabIndex={0}
                              aria-label={`Select ${year}`}
                              aria-pressed={isSelected}
                              onClick={() => handleYearChange(String(year))}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleYearChange(String(year)); } }}
                              className={cn("relative min-h-[112px] cursor-pointer rounded-2xl border transition-all hover:border-primary/50 hover:shadow-sm", isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/60")}
                            >
                              {isHot && <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">HOT</span>}
                              <CardContent className="flex min-h-[112px] flex-col items-center justify-center p-3 text-center">
                                <p className="text-2xl sm:text-3xl font-bold tracking-tight">{year}</p>
                                <p className="mt-1 text-sm text-muted-foreground">Questions</p>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">Choose a year to view the subjects available for that year.</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {examination && selectedYear && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold">Select {isMock ? "4 Subjects" : "Subject"}</h2>
                    <p className="text-[11px] text-muted-foreground">{examination} · {selectedYear} · {selected.length}/{maxSubjects} selected</p>
                  </div>
                </div>
                {availableSubjects.length === 0 ? (
                  <Card className="border-dashed border-border/70"><CardContent className="p-5 text-center">
                    <BookOpen className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-semibold">No subjects available for {selectedYear}</p>
                    <p className="text-xs text-muted-foreground mt-1">There are no published {examination} questions for this year yet. Choose another year to continue.</p>
                  </CardContent></Card>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {availableSubjects.map((name) => {
                      const Icon = subjectIcon(name);
                      const isSelected = selected.includes(name);
                      return (
                        <motion.div key={name} whileTap={{ scale: 0.97 }}>
                          <Card className={cn("cursor-pointer transition-all border-2 shadow-sm hover:shadow-md", isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border/50 hover:border-primary/30")} onClick={() => toggleSubject(name)}>
                            <CardContent className="p-4 text-center relative">
                              {isSelected && <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center"><Check className="h-3 w-3 text-primary-foreground" /></div>}
                              <Icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                              <p className="text-xs font-medium">{name}</p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {selected.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {(mode === "practice" || mode === "revision") && (
              <Card className={cn("border-2 shadow-sm transition-colors", adaptivePractice ? "border-primary/60 bg-primary/5" : "border-border/50")}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-semibold">Practice style</Label>
                      <p className="text-[11px] text-muted-foreground mt-1">Choose how ROCKCBT selects your questions.</p>
                    </div>
                    <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-1 font-semibold">Personalised</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" size="sm" variant={!adaptivePractice ? "default" : "outline"} onClick={() => setAdaptivePractice(false)} className="h-auto min-h-10 whitespace-normal text-xs">Standard practice</Button>
                    <Button type="button" size="sm" variant={adaptivePractice ? "default" : "outline"} onClick={() => setAdaptivePractice(true)} className="h-auto min-h-10 whitespace-normal text-xs">Adaptive practice</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {adaptivePractice
                      ? "Questions adjust to your topic performance: extra support for weaker topics and harder questions as your mastery improves."
                      : "Questions are selected using the normal balanced question mix."}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3"><Hash className="h-4 w-4 text-primary" /><Label className="text-sm font-semibold">Number of Questions</Label></div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {QUESTION_PRESETS.map((preset) => <Button key={preset} variant={questionCount === preset ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setQuestionCount(preset)}>{preset}</Button>)}
                </div>
                <div className="flex items-center gap-3">
                  <Input type="number" value={questionCount || ""} onChange={(e) => setQuestionCount(e.target.value === "" ? 0 : Math.min(Number(e.target.value), 60))} className="h-9 w-24 text-sm" min={1} max={60} />
                  <span className="text-xs text-muted-foreground">maximum 60 per selected subject</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-primary" /><Label className="text-sm font-semibold">Set Duration</Label></div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[30, 45, 60, 90, 120].map((minutes) => (
                    <Button key={minutes} type="button" size="sm" variant={customMinutes === minutes ? "default" : "outline"} className="h-8 text-xs" onClick={() => setCustomMinutes(minutes)}>
                      {minutes} min
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Input type="number" value={customMinutes || ""} onChange={(e) => setCustomMinutes(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))} className="h-9 w-28 text-sm" min={1} step={1} />
                  <span className="text-xs text-muted-foreground">minutes — choose a preset or enter any duration</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button onClick={handleStart} disabled={!examination || !selectedYear || selected.length === 0 || (isMock && selected.length !== 4) || !Number.isInteger(customMinutes) || customMinutes < 1 || !Number.isInteger(questionCount) || questionCount < 1} className="h-10 px-8 text-sm shadow-md">
                Start {mode === "practice" ? "Practice" : mode === "cbt" ? "Exam" : mode === "mock" ? "Mock Exam" : "Revision"} — {questionCount} Questions
              </Button>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} className="scroll-mb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]" />
      </main>
    </div>
  );
};

export default SelectSubjects;
