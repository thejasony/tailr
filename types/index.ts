export interface ParsedProfile {
  fullName: string;
  currentTitle: string;
  currentCompany: string;
  currentLocation: string;
}

export type LocationOption = "exclude" | "include_disclaimer";

export interface GenerateResult {
  message: string;
  research: {
    glassdoorThemes: string[];
    companySize: string;
    companySizeCategory: "large" | "mid-large" | "mid" | "small";
    appliedIntuitionFacts: string[];
    ceoThemes: string[];
    youtubeVideos: { title: string; description: string }[];
  };
}
