export type Language = "en" | "roman-ur" | "simple-en";
/** "mixed" = a multi-field run where some fields ran on-device and some in the cloud. Never hide a mixed run behind a single route. */
export type InferenceRoute = "local" | "cloud" | "mixed" | "unavailable";
export type InferenceModePreference = "prefer_on_device" | "only_on_device" | "prefer_in_cloud" | "only_in_cloud";

export interface FieldExplanation {
  fieldLabel: string;
  simpleExplanation: string;
  requiredInformation: string[];
  possibleDocuments: string[];
  commonMistakes: string[];
  exampleAnswer?: string;
  confidence?: number;
  /** Where this explanation came from. Never "ai" unless a real AI call produced it. */
  source?: "phrasebook" | "parser" | "ai";
  /** Per-language explanations (phrasebook entries carry all three). */
  explanations?: Partial<Record<Language, string>>;
  /** Phrasebook key, when source is "phrasebook". */
  phrasebookKey?: string;
  /** When source is "ai": the route that actually produced this explanation. */
  route?: InferenceRoute;
  /** When source is "ai": how long that call took. */
  latencyMs?: number;
  /** When source is "ai": how many attempts the call took (1 = no retry). */
  attempts?: number;
  /** When an AI call was attempted for this field but failed: the error, while a phrasebook/parser explanation is kept. */
  aiError?: string;
}

export type ParsedFieldType = "text" | "email" | "date" | "file" | "select" | "number" | "tel";

export interface ParsedField {
  label: string;
  required: boolean;
  type: ParsedFieldType;
  documentHints: string[];
  originalLine: string;
}

/** A scan produced by the Chrome extension, transferred to the dashboard. */
export interface ExtensionScan {
  id: string;
  url: string;
  title: string;
  scannedAt: string;
  language: Language;
  fields: DetectedField[];
}

export interface FormGuide {
  id: string;
  title: string;
  source: "paste" | "url" | "upload" | "extension";
  sourceLabel: string;
  language: Language;
  createdAt: string;
  updatedAt: string;
  fields: FieldExplanation[];
  /** Fields detected locally before any AI call; explanations may be absent. */
  detectedLabels: string[];
  inferenceRoute: InferenceRoute;
  inferenceNote?: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  /** True only when the original form text explicitly required it. Keyword hints are false. */
  confirmedByForm: boolean;
  collected: boolean;
}

export interface ChecklistItem {
  id: string;
  guideId: string;
  document: DocumentItem;
}

export interface SavedGuide {
  id: string;
  title: string;
  guide: FormGuide;
  savedAt: string;
}

export interface HybridResult<T> {
  route: InferenceRoute;
  latencyMs: number;
  modelInfo: string;
  data?: T;
  error?: string;
  confidence?: number;
  /** Total attempts across the run (1 per field = no retries). */
  attempts?: number;
  /** Per-field breakdown for multi-field runs (explainForm). */
  results?: PerFieldAIResult[];
  /**
   * True when the run stopped because on-device AI failed and the cloud
   * fallback needs the user's consent. The UI asks for consent only then
   * (just in time) — never before a run, and never for a mode the user
   * chose as on-device only. Once granted, consent is remembered in
   * Settings → Privacy and later runs fall back automatically.
   */
  needsCloudConsent?: boolean;
}

/** One field's outcome inside a multi-field AI run. */
export interface PerFieldAIResult {
  fieldLabel: string;
  route: InferenceRoute;
  latencyMs: number;
  attempts: number;
  /** Present only when this field's AI call failed; the guide keeps its phrasebook/parser explanation. */
  error?: string;
  explanation?: FieldExplanation;
}

export interface DetectedField {
  id: string;
  label: string;
  type: string;
  name?: string;
  required: boolean;
  placeholder?: string;
  isUpload: boolean;
}
