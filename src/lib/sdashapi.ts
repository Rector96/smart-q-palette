export type SdashApiExamination = "WAEC" | "JAMB" | "NECO";

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
  { id: "accounting", name: "Financial Accounting", providerSlug: "accounting" },
  { id: "agriculture", name: "Agricultural Science", providerSlug: "agriculture" },
  { id: "arabic", name: "Arabic Studies", providerSlug: "arabic" },
  { id: "biology", name: "Biology", providerSlug: "biology" },
  { id: "chemistry", name: "Chemistry", providerSlug: "chemistry" },
  { id: "civic_education", name: "Civic Education", providerSlug: "civiledu" },
  { id: "commerce", name: "Commerce", providerSlug: "commerce" },
  { id: "computer", name: "Computer Studies", providerSlug: "computer" },
  { id: "crk", name: "Christian Religious Studies", providerSlug: "crk" },
  { id: "current_affairs", name: "Current Affairs", providerSlug: "currentaffairs" },
  { id: "economics", name: "Economics", providerSlug: "economics" },
  { id: "english", name: "English Language", providerSlug: "english" },
  { id: "literature", name: "Literature in English", providerSlug: "englishlit" },
  { id: "fine_art", name: "Fine Art", providerSlug: "fineart" },
  { id: "general_science", name: "General Science", providerSlug: "gscience" },
  { id: "geography", name: "Geography", providerSlug: "geography" },
  { id: "government", name: "Government", providerSlug: "government" },
  { id: "hausa", name: "Hausa", providerSlug: "hausa" },
  { id: "history", name: "History", providerSlug: "history" },
  { id: "home_economics", name: "Home Economics", providerSlug: "homeeconomics" },
  { id: "igbo", name: "Igbo", providerSlug: "igbo" },
  { id: "insurance", name: "Insurance", providerSlug: "insurance" },
  { id: "irs", name: "Islamic Religious Studies", providerSlug: "irk" },
  { id: "mathematics", name: "Mathematics", providerSlug: "mathematics" },
  { id: "music", name: "Music", providerSlug: "music" },
  { id: "physics", name: "Physics", providerSlug: "physics" },
  { id: "yoruba", name: "Yoruba", providerSlug: "yoruba" },
];

export const SDASHAPI_QUESTION_LIMIT = 50;
