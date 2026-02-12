import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SUBJECTS, type ExamMode } from "@/lib/subjects";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft, Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const SelectSubjects = () => {
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") || "practice") as ExamMode;
  const preselected = searchParams.get("subject");
  const navigate = useNavigate();

  const [selected, setSelected] = useState<string[]>(preselected ? [preselected] : []);

  const isMock = mode === "mock";
  const maxSubjects = isMock ? 4 : 1;

  const toggleSubject = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id));
    } else if (selected.length < maxSubjects) {
      setSelected([...selected, id]);
    }
  };

  const handleStart = () => {
    if (selected.length === 0) return;
    const subjects = selected.join(",");
    navigate(`/exam?mode=${mode}&subjects=${subjects}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Select {isMock ? "4 Subjects" : "Subject"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-xs text-muted-foreground mb-4">
          {isMock
            ? `Select exactly 4 subjects for your mock exam (${selected.length}/4 selected)`
            : `Select a subject for ${mode} mode`}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {SUBJECTS.map((subject) => {
            const isSelected = selected.includes(subject.id);
            return (
              <motion.div key={subject.id} whileTap={{ scale: 0.97 }}>
                <Card
                  className={cn(
                    "cursor-pointer transition-all border-2",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-primary/30"
                  )}
                  onClick={() => toggleSubject(subject.id)}
                >
                  <CardContent className="p-4 text-center relative">
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <subject.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-xs font-medium">{subject.name}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            onClick={handleStart}
            disabled={isMock ? selected.length !== 4 : selected.length === 0}
            className="h-9 px-8 text-sm"
          >
            Start {mode === "practice" ? "Practice" : mode === "cbt" ? "Exam" : mode === "mock" ? "Mock Exam" : "Revision"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default SelectSubjects;
