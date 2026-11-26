import {
  BookOpen, Calculator, Atom, FlaskConical, Microscope,
  TrendingUp, Landmark, BookOpenCheck, Cross, Moon,
  Globe, ShoppingCart, Receipt, Tractor
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface Subject {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
}

export const SUBJECTS: Subject[] = [
  { id: "english", name: "English", icon: BookOpen, color: "217 91% 60%" },
  { id: "mathematics", name: "Mathematics", icon: Calculator, color: "262 83% 58%" },
  { id: "physics", name: "Physics", icon: Atom, color: "199 89% 48%" },
  { id: "chemistry", name: "Chemistry", icon: FlaskConical, color: "142 71% 45%" },
  { id: "biology", name: "Biology", icon: Microscope, color: "150 60% 42%" },
  { id: "economics", name: "Economics", icon: TrendingUp, color: "38 92% 50%" },
  { id: "government", name: "Government", icon: Landmark, color: "0 84% 60%" },
  { id: "literature", name: "Literature", icon: BookOpenCheck, color: "280 65% 60%" },
  { id: "crs", name: "CRS", icon: Cross, color: "24 95% 53%" },
  { id: "irs", name: "IRS", icon: Moon, color: "173 80% 40%" },
  { id: "geography", name: "Geography", icon: Globe, color: "47 96% 53%" },
  { id: "commerce", name: "Commerce", icon: ShoppingCart, color: "330 81% 60%" },
  { id: "accounting", name: "Accounting", icon: Receipt, color: "221 83% 53%" },
  { id: "agricultural_science", name: "Agric. Science", icon: Tractor, color: "85 78% 42%" },
];

export type ExamMode = "practice" | "cbt" | "mock" | "revision";

export const EXAM_MODES = [
  { id: "practice" as ExamMode, name: "Practice Mode", description: "Untimed, instant feedback", color: "150 60% 42%" },
  { id: "cbt" as ExamMode, name: "CBT Exam", description: "60 questions, 60 min timer", color: "217 91% 60%" },
  { id: "mock" as ExamMode, name: "Mock Exam", description: "Full JAMB simulation", color: "262 83% 58%" },
  { id: "revision" as ExamMode, name: "Revision", description: "Review wrong answers", color: "38 92% 50%" },
];
