
import { describe, expect, it } from "vitest";
import { parseQuestionCsv } from "./questionCsv";

describe("parseQuestionCsv", () => {
  it("preserves five choices, quoted commas, explanations, years, and diagram filenames", () => {
    const csv = [
      "Year,Question_Number,Question,Option_A,Option_B,Option_C,Option_D,Option_E,Correct_Answer,Explanation,Diagram_File",
      '1983,1,"Which statement includes a comma, and a ""quoted phrase""?",First,Second,Third,Fourth,Fifth,E,"An explanation, with detail.",1983_Fig_1.png',
    ].join("\r\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "" },
      2026,
    );

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      year: 1983,
      question_text: 'Which statement includes a comma, and a "quoted phrase"?',
      option_e: "Fifth",
      correct_answer: "E",
      explanation: "An explanation, with detail.",
      diagram_file: "1983_Fig_1.png",
    });
  });

  it("rejects E as the answer when option E is missing", () => {
    const csv = [
      "Year,Question,Option_A,Option_B,Option_C,Option_D,Correct_Answer",
      "1983,Question text,A,B,C,D,E",
    ].join("\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "" },
      2026,
    );

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toContain(
      "Row 2: Option_E is required when the correct answer is E",
    );
  });

  it("derives the recommended diagram filename from a figure reference", () => {
    const csv = [
      "Year,Question,Option_A,Option_B,Option_C,Option_D,Correct_Answer",
      "1983,Use Fig. 2 to answer this question.,A,B,C,D,A",
    ].join("\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "" },
      2026,
    );

    expect(result.questions[0].diagram_file).toBe("1983_Fig_2.png");
  });

  it("rejects an unclosed quoted field", () => {
    const csv = [
      "Question,Option_A,Option_B,Option_C,Option_D,Correct_Answer",
      '"Question without a closing quote,A,B,C,D,A',
    ].join("\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "2024" },
      2026,
    );

    expect(result.questions).toHaveLength(0);
    expect(result.errors).toContain(
      "CSV contains an unclosed quoted field",
    );
  });

  it("rejects rows with extra columns", () => {
    const csv = [
      "Question,Option_A,Option_B,Option_C,Option_D,Correct_Answer",
      "Question text,A,B,C,D,A,Unexpected value",
    ].join("\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "2024" },
      2026,
    );

    expect(result.questions).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects rows with missing columns", () => {
    const csv = [
      "Question,Option_A,Option_B,Option_C,Option_D,Correct_Answer",
      "Question text,A,B,C",
    ].join("\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "2024" },
      2026,
    );

    expect(result.questions).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid diagram URL protocols", () => {
    const csv = [
      "Question,Option_A,Option_B,Option_C,Option_D,Correct_Answer,Diagram_URL",
      "Question text,A,B,C,D,A,javascript:alert(1)",
    ].join("\n");

    const result = parseQuestionCsv(
      csv,
      { subject: "biology", examination: "JAMB", year: "2024" },
      2026,
    );

    expect(result.questions).toHaveLength(0);
    expect(
      result.errors.some((error) => error.includes("Diagram_URL")),
    ).toBe(true);
  });
});
