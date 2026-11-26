import { supabase } from "@/integrations/supabase/client";

export interface QuestionWithShuffledOptions {
  id: string;
  subject: string;
  topic: string;
  year: number | null;
  difficulty: string;
  question_text: string;
  options: { label: string; text: string; originalLabel?: string }[];
  correct_answer?: string;
  explanation: string | null;
  passage: string | null;
  diagram_url: string | null;
  question_type: string | null;
  exam_hint: string | null;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MOTIVATIONAL_MESSAGES = [
  "🔥 You're improving!",
  "🎯 Keep going, you're close!",
  "💪 Great effort! Stay focused!",
  "🌟 You're doing amazing!",
  "🚀 Keep pushing forward!",
];

const LEARNING_TIPS = [
  "💡 Even if the question is reworded, the answer method stays the same",
  "📌 JAMB often changes numbers but keeps the same logic",
  "💡 Focus on understanding concepts, not memorizing answers",
  "📌 Always eliminate obviously wrong options first",
  "💡 Time management is key — don't spend too long on one question",
];

export function getMotivationalMessage(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

export function getLearningTip(): string {
  return LEARNING_TIPS[Math.floor(Math.random() * LEARNING_TIPS.length)];
}

export function shouldShowTip(): boolean {
  return Math.random() < 0.2;
}

export async function saveSeenQuestions(userId: string, questionIds: string[]) {
  if (questionIds.length === 0) return;
  const entries = questionIds.map(qid => ({ user_id: userId, question_id: qid }));
  // Insert in batches of 50
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await supabase.from("user_seen_questions").upsert(batch, {
      onConflict: "user_id,question_id",
    });
  }
}

export async function fetchSmartQuestions(
  subject: string,
  userId: string,
  count: number = 60,
  mode: string = "cbt"
): Promise<QuestionWithShuffledOptions[]> {
  const cappedCount = Math.min(count, 60);

  // Get seen question IDs from dedicated tracking table
  const { data: seenData } = await supabase
    .from("user_seen_questions")
    .select("question_id")
    .eq("user_id", userId);

const seenIds = new Set((seenData || []).map((s) => s.question_id));

  // Fetch questions for the subject
  const fetchLimit = Math.min(cappedCount * 3, 1000);
  const { data: questions, error } = await supabase
    .from("questions")
    .select("*")
    .eq("subject", subject)
    .limit(fetchLimit);

  if (error || !questions || questions.length === 0) return [];

  const randomized = shuffleArray(questions);

  let unseen = randomized.filter((q) => !seenIds.has(q.id));
  let seen = randomized.filter((q) => seenIds.has(q.id));

  // If user has seen 80%+ of questions, auto-reset their seen history for this subject
  const totalAvailable = questions.length;
  if (unseen.length < cappedCount && seen.length > 0 && (seenIds.size / Math.max(totalAvailable, 1)) >= 0.8) {
    // Reset seen questions for this subject
    const subjectQIds = questions.map(q => q.id);
    await supabase
      .from("user_seen_questions")
      .delete()
      .eq("user_id", userId)
      .in("question_id", subjectQIds);
    // Treat all as unseen now
    unseen = randomized;
    seen = [];
  }

  // In revision mode, prefer seen questions
  const filtered = mode === "revision"
    ? [...shuffleArray(seen), ...shuffleArray(unseen)]
    : [...shuffleArray(unseen), ...shuffleArray(seen)];

  const actualCount = Math.min(cappedCount, filtered.length);

  // Balance difficulty
  const easy = filtered.filter((q) => q.difficulty === "easy");
  const medium = filtered.filter((q) => q.difficulty === "medium");
  const hard = filtered.filter((q) => q.difficulty === "hard");

  const easyCount = Math.round(actualCount * 0.3);
  const hardCount = Math.round(actualCount * 0.2);
  const mediumCount = actualCount - easyCount - hardCount;

  const selected = [
    ...easy.slice(0, easyCount),
    ...medium.slice(0, mediumCount),
    ...hard.slice(0, hardCount),
  ];

  while (selected.length < actualCount && filtered.length > selected.length) {
    const remaining = filtered.filter((q) => !selected.includes(q));
    if (remaining.length === 0) break;
    selected.push(remaining[0]);
  }

  return shuffleArray(selected.slice(0, actualCount)).map((q) => {
    const sourceOptions = [
      { label: "A", text: q.option_a, originalLabel: "A" },
      { label: "B", text: q.option_b, originalLabel: "B" },
      { label: "C", text: q.option_c, originalLabel: "C" },
      { label: "D", text: q.option_d, originalLabel: "D" },
      ...(q.option_e?.trim() ? [{ label: "E", text: q.option_e, originalLabel: "E" }] : []),
    ];
    const options = shuffleArray(sourceOptions).map((opt, idx) => ({
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
      diagram_url: q.diagram_url,
      question_type: q.question_type,
      exam_hint: q.exam_hint,
    };
  });
}
