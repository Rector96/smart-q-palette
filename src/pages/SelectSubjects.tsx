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
type CatalogItem = { examination: ExamType; year: number; subject: string; name?: string };

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

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);\n  const [catalogProvider, setCatalogProvider] = useState<"local" | "sdashapi">("local");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [examination, setExamination] = useState<ExamType | "">("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customMinutes, setCustomMinutes] = useState("60");
  const [questionCounts, setQuestionCounts] = useState<Record<string, string>>({});
  const [adaptivePractice, setAdaptivePractice] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMock = mode === "mock";
  const maxSubjects = isMock ? 4 : 1;
  const totalQuestionCount = selected.reduce((total, subject) => total + (Number(questionCounts[subject]) || 0), 0);\n  const maxQuestionsPerSubject = catalogProvider === "sdashapi" ? 50 : 60;\n  const maxTotalQuestions = catalogProvider === "sdashapi" ? 200 : 720;\n  const getSubjectLabel = (subject: string) => catalog.find((item) => item.subject === subject)?.name || subject;

  useEffect(() => {
    let active = true;
    const applyCatalog = (availableCatalog: CatalogItem[]) => {
      setCatalog(availableCatalog);
      if (preselected) {
        const match = availableCatalog.find((item) =>
          item.subject.toLowerCase() === preselected.toLowerCase() ||
          item.name?.toLowerCase() === preselected.toLowerCase()
        );
        if (match) {
          setExamination(match.examination);
          setSelectedYear(String(match.year));
          setSelected([match.subject]);
        }
      } else if (mode === "revision" && availableCatalog.length > 0) {
        const firstAvailableExam = availableCatalog.find((item) => item.examination === "JAMB") || availableCatalog[0];
        setExamination(firstAvailableExam.examination);
      }
    };
    const loadCatalog = async () => {
      setCatalogLoading(true);
      const { data: providerData, error: providerError } = await supabase.functions.invoke("sdashapi-catalog", { body: {} });
      if (!active) return;
      if (providerError || providerData?.ok === false) {
        setCatalogError(providerData?.message || providerError?.message || "We could not load available examinations.");
      } else if (providerData?.active === true && Array.isArray(providerData.catalog)) {
        setCatalogProvider("sdashapi");
        applyCatalog(providerData.catalog as CatalogItem[]);
      } else {
        const { data, error } = await supabase.functions.invoke("cbt-catalog", { body: {} });
        if (!active) return;
        if (error || !Array.isArray(data?.catalog)) {
          setCatalogError(data?.error || error?.message || "We could not load available examinations.");
        } else {
          setCatalogProvider("local");
          applyCatalog(data.catalog as CatalogItem[]);
        }
      }
      setCatalogLoading(false);
    };
    void loadCatalog();
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

  useEffect(() => {
    setQuestionCounts((current) => {
      const next = { ...current };
      selected.forEach((subject) => { if (!next[subject]) next[subject] = "10"; });
      return next;
    });
  }, [selected]);

  const toggleSubject = (name: string) => {
    if (selected.includes(name)) {
      setSelected(selected.filter((item) => item !== name));
    } else if (selected.length < maxSubjects) {
      setSelected([...selected, name]);
      setQuestionCounts((current) => ({ ...current, [name]: current[name] || "10" }));
    }
  };

  useEffect(() => {
    if (selected.length > 0) {
      const timer = window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 150);
      return () => window.clearTimeout(timer);
    }
  }, [selected]);

  const handleExamChange = (value: ExamType) => {
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
    const isTimedMode = mode === "cbt" || mode === "mock";
    const parsedCustomMinutes = Number(customMinutes);
    const counts = Object.fromEntries(selected.map((subject) => [subject, Number(questionCounts[subject])]));
    const invalidSubject = selected.find((subject) => !Number.isInteger(counts[subject]) || counts[subject] < 1 || counts[subject] > maxQuestionsPerSubject);
    if (invalidSubject) {
      toast({ title: "Check the question count", description: `Enter between 1 and ${maxQuestionsPerSubject} questions for ${getSubjectLabel(invalidSubject)}.`, variant: "destructive" });
      return;
    }
    if (totalQuestionCount < 1 || totalQuestionCount > maxTotalQuestions) {
      toast({ title: "Invalid total question count", description: `The combined exam must contain no more than ${maxTotalQuestions} questions.`, variant: "destructive" });
      return;
    }
    if (isTimedMode && (!Number.isInteger(parsedCustomMinutes) || parsedCustomMinutes < 1 || parsedCustomMinutes > 1440)) {
      toast({ title: "Choose a valid duration", description: "Enter a duration between 1 and 1,440 minutes.", variant: "destructive" });
      return;
    }
    const params = new URLSearchParams({
      mode,
      examination,
      year: selectedYear,
      subjects: selected.join(","),
      counts: JSON.stringify(counts),
      count: String(totalQuestionCount),
      ...(isTimedMode ? { timer: String(parsedCustomMinutes) } : {}),
      adaptive: String(adaptivePractice && catalogProvider === "local" && (mode === "practice" || mode === "revision")),\n      provider: catalogProvider === "sdashapi" ? "sdashapi" : "local",
    });
    navigate(`/exam?${params.toString()}`);
  };

  const examOptions: ExamType[] = ["JAMB", "WAEC", "NECO"];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" showText={false} />
          <span className="font-bold text-sm">Select {isMock ? "4 Subjects" : "Subjects"}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-xs text-muted-foreground mb-4">
          {mode === "revision"
            ? "Choose a subject to review. Questions you have practised and are due to repeat will appear first."
            : isMock
              ? `Select exactly 4 subjects for your mock exam (${selected.length}/4 selected)`
              : "Choose your examination, year and one subject to begin."}
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
                        <p className="text-[10px] text-muted-foreground mt-1">{hasContent ? (catalogProvider === "sdashapi" ? "SdashAPI catalog" : "ROCKCBT bank ready") : "No questions yet"}</p>
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
                    <p className="text-[10px] text-muted-foreground">{catalogProvider === "sdashapi" ? "SdashAPI publishes global subject and year lists. Exact question availability is checked securely when you start." : "Choose a year to view the subjects available for that year."}</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {examination && selectedYear && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold">Select {isMock ? "4 Subjects" : "Subjects"}</h2>
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
                      const Icon = subjectIcon(getSubjectLabel(name));
                      const isSelected = selected.includes(name);
                      return (
                        <motion.div key={name} whileTap={{ scale: 0.97 }}>
                          <Card className={cn("cursor-pointer transition-all border-2 shadow-sm hover:shadow-md", isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border/50 hover:border-primary/30")} onClick={() => toggleSubject(name)}>
                            <CardContent className="p-4 text-center relative">
                              {isSelected && <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center"><Check className="h-3 w-3 text-primary-foreground" /></div>}
                              <Icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                              <p className="text-xs font-medium">{getSubjectLabel(name)}</p>
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
            {(mode === "practice" || mode === "revision") && catalogProvider === "local" && (
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
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><Hash className="h-4 w-4 text-primary" /><Label className="text-sm font-semibold">{isMock ? "Questions per Subject" : "Number of Questions"}</Label></div>
                  <span className="text-xs font-semibold text-primary">{totalQuestionCount} total</span>
                </div>
                {selected.map((subject) => (
                  <div key={subject} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                    <Label htmlFor={`question-count-${subject}`} className="text-sm font-medium">{getSubjectLabel(subject)}</Label>
                    <div className="flex items-center gap-2">
                      {[10, 20, 40, maxQuestionsPerSubject].map((preset) => (
                        <Button key={preset} type="button" size="sm" variant={Number(questionCounts[subject]) === preset ? "default" : "outline"} className="h-8 px-2 text-xs" onClick={() => setQuestionCounts((current) => ({ ...current, [subject]: String(preset) }))}>{preset}</Button>
                      ))}
                      <Input id={`question-count-${subject}`} type="text" inputMode="numeric" value={questionCounts[subject] ?? ""} onChange={(event) => setQuestionCounts((current) => ({ ...current, [subject]: event.target.value.replace(/\D/g, "").slice(0, 2) }))} className="h-9 w-16 text-sm" placeholder="10" />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Choose 1–{maxQuestionsPerSubject} questions for each subject. The total updates automatically.</p>
              </CardContent>
            </Card>

            {(mode === "cbt" || mode === "mock") && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-primary" /><Label className="text-sm font-semibold">Set Exam Duration</Label></div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[30, 45, 60, 90, 120].map((minutes) => (
                    <Button key={minutes} type="button" size="sm" variant={Number(customMinutes) === minutes ? "default" : "outline"} className="h-8 text-xs" onClick={() => setCustomMinutes(String(minutes))}>
                      {minutes} min
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Input type="text" inputMode="numeric" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value.replace(/\D/g, "").slice(0, 4))} className="h-9 w-28 text-sm" placeholder="60" />
                  <span className="text-xs text-muted-foreground">minutes — choose a preset or enter any duration</span>
                </div>
              </CardContent>
            </Card>
            )}

            <div className="flex justify-center">
              <Button onClick={handleStart} disabled={!examination || !selectedYear || selected.length === 0 || (isMock && selected.length !== 4) || selected.some((subject) => !Number.isInteger(Number(questionCounts[subject])) || Number(questionCounts[subject]) < 1 || Number(questionCounts[subject]) > maxQuestionsPerSubject) || ((mode === "cbt" || mode === "mock") && (!Number.isInteger(Number(customMinutes)) || Number(customMinutes) < 1 || Number(customMinutes) > 1440))} className="h-10 px-8 text-sm shadow-md">
                Start {mode === "practice" ? "Practice" : mode === "cbt" ? "Exam" : mode === "mock" ? "Mock Exam" : "Revision"} — {totalQuestionCount} Questions
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
