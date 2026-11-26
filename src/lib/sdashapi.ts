export type SdashApiExamination = "WAEC" | "JAMB";

export interface SdashApiSubject {
  id: string;
  name: string;
  providerSlug: string;
}

export interface SdashApiQuestion {
  position: number;
  question: string;
  options: Record<string, string>;
  image?: string | null;
}

export const SDASHAPI_SUBJECTS: SdashApiSubject[] = [
  { id: "english", name: "English Language", providerSlug: "english" },
  { id: "mathematics", name: "Mathematics", providerSlug: "mathematics" },
  { id: "biology", name: "Biology", providerSlug: "biology" },
  { id: "chemistry", name: "Chemistry", providerSlug: "chemistry" },
  { id: "physics", name: "Physics", providerSlug: "physics" },
  { id: "economics", name: "Economics", providerSlug: "economics" },
  { id: "government", name: "Government", providerSlug: "government" },
  { id: "literature", name: "Literature in English", providerSlug: "englishlit" },
  { id: "geography", name: "Geography", providerSlug: "geography" },
  { id: "commerce", name: "Commerce", providerSlug: "commerce" },
  { id: "accounting", name: "Financial Accounting", providerSlug: "accounting" },
  { id: "agriculture", name: "Agricultural Science", providerSlug: "agriculture" },
];

export const SDASHAPI_QUESTION_LIMIT = 50;
