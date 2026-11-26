import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SDASHAPI_SUBJECTS, SDASHAPI_QUESTION_LIMIT, type SdashApiExamination } from "@/lib/sdashapi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BookOpen, CalendarDays, Clock, GraduationCap, Hash, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";

const QUESTION_PRESETS = [10, 20, 30, 50];
const CURRENT_YEAR = new Date().getFullYear();

const PastQuestions = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [examination, setExamination] = useState<SdashApiExamination>("WAEC");
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState(String(CURRENT_YEAR - 1));
  const [questionCount, setQuestionCount] = useState(20);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    const selectedSubject = SDASHAPI_SUBJECTS.find((item) => item.id === subject);
    const parsedYear = Number(year);

    if (!selectedSubject) {
      toast({ title: "Select a subject", description: "Choose the subject you want to practise.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > CURRENT_YEAR) {
      toast({ title: "Choose a valid year", description: `Enter a year between 1900 and ${CURRENT_YEAR}.`, variant: "destructive" });
      return;
    }
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > SDASHAPI_QUESTION_LIMIT) {
      toast({ title: "Invalid question count", description: "Choose between 1 and 50 questions.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440) {
      toast({ title: "Invalid duration", description: "Enter 0 for no timer, or a duration up to 1,440 minutes.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sdashapi-start", {
        body: {
          examination,
          subject: selectedSubject.providerSlug,
          year: parsedYear,
          limit: questionCount,
          durationSeconds: durationMinutes * 60,
        },
      });

      if (error || !data?.ok || !data?.sessionId || !Array.isArray(data?.questions)) {
        toast({
          title: "Unable to start exam",
          description: data?.message || data?.error || error?.message || "We could not start this past-question session.",
          variant: "destructive",
        });
        return;
      }

      const sessionId = String(data.sessionId);
      const sessionState = {
        questions: data.questions,
        examination,
        subject: selectedSubject.name,
        year: parsedYear,
        durationSeconds: durationMinutes * 60,
      };

      try {
        sessionStorage.setItem(`sdashapi-session-${sessionId}`, JSON.stringify(sessionState));
      } catch {
        // Route state still carries the questions if session storage is unavailable.
      }

      navigate(`/past-questions/exam/${sessionId}`, { state: sessionState });
    } catch (error) {
      toast({
        title: "Connection error",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" showText={false} />
          <div>
            <p className="text-sm font-bold">Past Questions</p>
            <p className="text-[10px] text-muted-foreground">WAEC and JAMB practice</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <p className="text-xs text-muted-foreground">
          Choose an examination, subject and year to practise questions from the SdashAPI question bank.
        </p>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            <Label className="text-sm font-semibold">Choose Examination</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["WAEC", "JAMB"] as const).map((exam) => (
              <motion.div key={exam} whileTap={{ scale: 0.98 }}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-pressed={examination === exam}
                  onClick={() => { setExamination(exam); setSubject(""); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setExamination(exam);
                      setSubject("");
                    }
                  }}
                  className={cn(
                    "cursor-pointer border-2 transition-all",
                    examination === exam ? "border-primary bg-primary/5 shadow-sm" : "border-border/50 hover:border-primary/30"
                  )}
                >
                  <CardContent className="p-5 text-center">
                    <GraduationCap className="mx-auto mb-2 h-6 w-6 text-primary" />
                    <p className="text-sm font-semibold">{exam}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {examination === exam ? "Selected" : "Select examination"}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Select Subject</Label>
            </div>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Choose a subject" /></SelectTrigger>
              <SelectContent>
                {SDASHAPI_SUBJECTS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <Label htmlFor="past-question-year" className="text-sm font-semibold">Examination Year</Label>
            </div>
            <Input
              id="past-question-year"
              type="number"
              inputMode="numeric"
              min={1900}
              max={CURRENT_YEAR}
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="h-11"
            />
            <p className="text-[10px] text-muted-foreground">Enter the specific WAEC or JAMB year you want to practise.</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Number of Questions</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUESTION_PRESETS.map((count) => (
                <Button
                  key={count}
                  type="button"
                  size="sm"
                  variant={questionCount === count ? "default" : "outline"}
                  onClick={() => setQuestionCount(count)}
                >
                  {count}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Input
                aria-label="Question count"
                type="number"
                min={1}
                max={SDASHAPI_QUESTION_LIMIT}
                value={questionCount || ""}
                onChange={(event) => setQuestionCount(event.target.value === "" ? 0 : Number(event.target.value))}
                className="h-10 w-28"
              />
              <span className="text-xs text-muted-foreground">Maximum 50 questions</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <Label htmlFor="past-question-duration" className="text-sm font-semibold">Exam Duration</Label>
            </div>
            <div className="flex items-center gap-3">
              <Input
                id="past-question-duration"
                type="number"
                min={0}
                max={1440}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value === "" ? 0 : Number(event.target.value))}
                className="h-10 w-28"
              />
              <span className="text-xs text-muted-foreground">Minutes (0 = no timer)</span>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleStart} disabled={loading || !subject} className="h-11 w-full shadow-sm">
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing questions...</>
          ) : "Start Past Questions"}
        </Button>
      </main>
    </div>
  );
};

export default PastQuestions;
