export interface CSVQuestion {
  subject: string;
  examination: string;
  year: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string | null;
  correct_answer: string;
  topic: string;
  explanation: string | null;
  exam_hint: string | null;
  diagram_file: string | null;
  diagram_url: string | null;
}

export interface QuestionCsvDefaults {
  subject: string;
  examination: string;
  year: string;
}

export interface QuestionCsvParseResult {
  questions: CSVQuestion[];
  errors: string[];
}

const parseCsvRows = (text: string): { rows: string[][]; error?: string } => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.trim() === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) return { rows, error: "CSV contains an unclosed quoted field" };
  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return { rows };
};

const normalizeHeader = (header: string) =>
  header.replace(/^\uFEFF/, "").toLowerCase().replace(/[_\s-]/g, "");

export function parseQuestionCsv(
  text: string,
  defaults: QuestionCsvDefaults,
  currentYear = new Date().getFullYear(),
): QuestionCsvParseResult {
  const { rows, error } = parseCsvRows(text);
  if (error) return { questions: [], errors: [error] };
  if (rows.length < 2) {
    return { questions: [], errors: ["File must have a header row and at least one data row"] };
  }

  const headers = rows[0].map(normalizeHeader);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const columns = {
    subject: column("subject"),
    examination: column("examination", "exam"),
    year: column("year"),
    question: column("question", "questiontext"),
    optionA: column("optiona"),
    optionB: column("optionb"),
    optionC: column("optionc"),
    optionD: column("optiond"),
    optionE: column("optione"),
    correct: column("correctanswer", "answer"),
    topic: column("topic"),
    explanation: column("explanation"),
    examHint: column("examhint", "hint"),
    diagramFile: column("diagramfile", "figurefile", "imagefile"),
    diagramUrl: column("diagramurl", "imageurl"),
  };

  const required = [
    ["Question", columns.question],
    ["Option_A", columns.optionA],
    ["Option_B", columns.optionB],
    ["Option_C", columns.optionC],
    ["Option_D", columns.optionD],
    ["Correct_Answer", columns.correct],
  ] as const;
  const missing = required.filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length > 0) {
    return {
      questions: [],
      errors: [`Missing columns: ${missing.join(", ")}`],
    };
  }

  const questions: CSVQuestion[] = [];
  const errors: string[] = [];
  const value = (values: string[], index: number) => index < 0 ? "" : (values[index] || "").trim();


  rows.slice(1).forEach((values, index) => {
    const rowNumber = index + 2;

    // Reject rows that do not match the CSV header column count.
    if (values.length !== headers.length) {
      errors.push(
        `Row ${rowNumber}: Expected ${headers.length} columns but found ${values.length}`,
      );
      return;
    }

    const subject = value(values, columns.subject) || defaults.subject.trim();
    const examination = (
      value(values, columns.examination) || defaults.examination
    ).trim().toUpperCase();
    const yearText = value(values, columns.year) || defaults.year.trim();
    const year = Number(yearText);

    const questionText = value(values, columns.question);
    const optionA = value(values, columns.optionA);
    const optionB = value(values, columns.optionB);
    const optionC = value(values, columns.optionC);
    const optionD = value(values, columns.optionD);
    const optionE = value(values, columns.optionE);
    const correctAnswer = value(values, columns.correct).toUpperCase();
    const diagramUrl = value(values, columns.diagramUrl);
    const explicitDiagramFile = value(values, columns.diagramFile);

    const figureReference = questionText.match(
      /\bfig(?:ure)?\.?\s*(\d+[a-z]?)\b/i,
    );

    const diagramFile =
      explicitDiagramFile ||
      (figureReference ? `${year}_Fig_${figureReference[1]}.png` : "");

    const rowErrors: string[] = [];

    if (!subject) rowErrors.push("Select or provide a subject");

    if (!questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
      rowErrors.push("Question, options A-D, and correct answer are required");
    }

    if (!["JAMB", "WAEC", "NECO"].includes(examination)) {
      rowErrors.push("Examination must be JAMB, WAEC, or NECO");
    }

    if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
      rowErrors.push(`Enter a valid examination year (1900-${currentYear})`);
    }

    if (!["A", "B", "C", "D", "E"].includes(correctAnswer)) {
      rowErrors.push(`Correct answer must be A, B, C, D, or E (got "${correctAnswer}")`);
    }

    if (correctAnswer === "E" && !optionE) {
      rowErrors.push("Option_E is required when the correct answer is E");
    }

    if (diagramUrl) {
      try {
        const url = new URL(diagramUrl);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
          rowErrors.push("Diagram_URL must use HTTP or HTTPS");
        }
      } catch {
        rowErrors.push("Diagram_URL must be a valid HTTP or HTTPS URL");
      }
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join("; ")}`);
      return;
    }

    questions.push({
      subject: subject.toLowerCase(),
      examination,
      year,
      question_text: questionText,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      option_e: optionE || null,
      correct_answer: correctAnswer,
      topic: value(values, columns.topic) || "General",
      explanation: value(values, columns.explanation) || null,
      exam_hint: value(values, columns.examHint) || null,
      diagram_file: diagramFile || null,
      diagram_url: diagramUrl || null,
    });
  });

  return { questions, errors };
}
