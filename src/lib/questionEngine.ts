import { supabase } from "@/integrations/supabase/client";

export interface QuestionWithShuffledOptions {
  id: string;
  subject: string;
  topic: string;
  year: number | null;
  difficulty: string;
  question_text: string;
  options: { label: string; text: string; originalLabel: string }[];
  correct_answer: string; // shuffled label
  explanation: string | null;
  passage: string | null;
  question_type: string | null;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function fetchSmartQuestions(
  subject: string,
  userId: string,
  count: number = 60,
  mode: string = "cbt"
): Promise<QuestionWithShuffledOptions[]> {
  // Get previously answered question IDs (for no-repetition)
  const { data: history } = await supabase
    .from("user_history")
    .select("question_id")
    .eq("user_id", userId);

  const answeredIds = (history || []).map((h) => h.question_id);

  // Fetch questions for the subject, excluding answered ones
  let query = supabase
    .from("questions")
    .select("*")
    .eq("subject", subject);

  if (answeredIds.length > 0 && mode !== "revision") {
    // Supabase doesn't support NOT IN directly with large arrays well,
    // so we'll filter client-side
  }

  const { data: questions, error } = await query;
  if (error || !questions) return [];

  // Filter out answered questions (except revision mode)
  let filtered = mode === "revision"
    ? questions
    : questions.filter((q) => !answeredIds.includes(q.id));

  // If not enough unanswered questions, include some answered ones
  if (filtered.length < count) {
    filtered = questions;
  }

  // Shuffle and pick
  const shuffled = shuffleArray(filtered);

  // Balance difficulty: try to get ~30% easy, ~50% medium, ~20% hard
  const easy = shuffled.filter((q) => q.difficulty === "easy");
  const medium = shuffled.filter((q) => q.difficulty === "medium");
  const hard = shuffled.filter((q) => q.difficulty === "hard");

  const easyCount = Math.round(count * 0.3);
  const hardCount = Math.round(count * 0.2);
  const mediumCount = count - easyCount - hardCount;

  const selected = [
    ...easy.slice(0, easyCount),
    ...medium.slice(0, mediumCount),
    ...hard.slice(0, hardCount),
  ];

  // If we don't have enough by difficulty, fill from shuffled
  while (selected.length < count && shuffled.length > selected.length) {
    const remaining = shuffled.filter((q) => !selected.includes(q));
    if (remaining.length === 0) break;
    selected.push(remaining[0]);
  }

  // Shuffle final selection and options
  return shuffleArray(selected.slice(0, count)).map((q) => {
    const options = shuffleArray([
      { label: "A", text: q.option_a, originalLabel: "A" },
      { label: "B", text: q.option_b, originalLabel: "B" },
      { label: "C", text: q.option_c, originalLabel: "C" },
      { label: "D", text: q.option_d, originalLabel: "D" },
    ]).map((opt, idx) => ({
      ...opt,
      label: String.fromCharCode(65 + idx),
    }));

    const correctOption = options.find((o) => o.originalLabel === q.correct_answer);

    return {
      id: q.id,
      subject: q.subject,
      topic: q.topic,
      year: q.year,
      difficulty: q.difficulty,
      question_text: q.question_text,
      options,
      correct_answer: correctOption?.label || "A",
      explanation: q.explanation,
      passage: q.passage,
      question_type: q.question_type,
    };
  });
}
