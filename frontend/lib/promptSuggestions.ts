export interface PromptSuggestion {
  label: string;
  value: string;
}

export const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  {
    label: "[mask] unclear audio",
    value:
      "If any portion of the audio is unclear or inaudible, output [mask] in place of the unclear words.",
  },
  {
    label: "Verbatim transcription",
    value:
      "Transcribe the audio verbatim, including all filler words, false starts, and repetitions exactly as spoken.",
  },
  {
    label: "Audio event tags",
    value:
      "Include audio event tags such as [laughter], [applause], [music], [silence], and [noise] where appropriate.",
  },
  {
    label: "Labeling crosstalk",
    value:
      "When multiple speakers talk at the same time, label the overlapping speech as [crosstalk].",
  },
  {
    label: "Speaker attribution",
    value:
      "Attribute each spoken segment to the correct speaker using labels like Speaker 1, Speaker 2, etc.",
  },
  {
    label: "Native code switching",
    value:
      "Accurately transcribe code-switching between languages, preserving the original language of each segment.",
  },
];

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
];
