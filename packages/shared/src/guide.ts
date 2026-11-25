// Deterministic guide builder — phrasebook + local parser only. No AI.
// Every field carries a visible source: "phrasebook" or "parser".
import type { FieldExplanation, FormGuide, Language, ParsedField } from "./types.js";
import { genericFallbackExplanation, lookupPhrasebook } from "./phrasebook.js";
import { newId, parseFormFields, slugify } from "./utils.js";

export const AI_UNAVAILABLE_NOTE =
  "AI explanation unavailable — Firebase not configured (Phase 5). Explanations below come from the local phrasebook or the local parser, never from AI.";

export function sourceLabel(source: FieldExplanation["source"]): string {
  if (source === "phrasebook") return "Phrasebook (local)";
  if (source === "ai") return "AI explanation";
  return "Local parser";
}

export type FieldExplanationSource = FieldExplanation["source"] | "local-note";

/** Label for a per-language explanation source, shown next to each language tab. */
export function fieldSourceLabel(source: FieldExplanationSource): string {
  if (source === "phrasebook") return "Phrasebook (local)";
  if (source === "ai") return "AI";
  if (source === "local-note") return "Local note — not AI";
  return "Local parser";
}

/**
 * The explanation text for one field in one language, with its honest
 * source. Phrasebook/parser fields already carry all three languages;
 * AI fields carry all three when the model returned them, otherwise only
 * the requested language. Anything else is a clearly labelled local note —
 * never presented as AI and never an invented translation.
 */
export function fieldExplanationInLanguage(
  field: FieldExplanation,
  language: Language,
  guideLanguage: Language,
): { text: string; source: FieldExplanationSource } {
  const fromMap = field.explanations?.[language];
  if (fromMap !== undefined && fromMap.trim() !== "") {
    return { text: fromMap, source: field.source ?? "parser" };
  }
  if (language === guideLanguage) {
    return { text: field.simpleExplanation, source: field.source ?? "parser" };
  }
  return { text: genericFallbackExplanation(field.fieldLabel, language), source: "local-note" };
}

export function explainParsedField(field: ParsedField): FieldExplanation {
  const entry = lookupPhrasebook(field.label);
  if (entry) {
    return {
      fieldLabel: field.label,
      simpleExplanation: entry.explanations["en"],
      explanations: { ...entry.explanations },
      requiredInformation: entry.requiredInformation,
      possibleDocuments: field.documentHints.length > 0 ? field.documentHints : entry.possibleDocuments,
      commonMistakes: entry.commonMistakes,
      exampleAnswer: entry.exampleAnswer,
      source: "phrasebook",
      phrasebookKey: entry.key,
    };
  }
  const en = genericFallbackExplanation(field.label, "en");
  return {
    fieldLabel: field.label,
    simpleExplanation: en,
    explanations: {
      en,
      "simple-en": genericFallbackExplanation(field.label, "simple-en"),
      "roman-ur": genericFallbackExplanation(field.label, "roman-ur"),
    },
    requiredInformation: [`The information asked for in "${field.label}"`],
    possibleDocuments: field.documentHints,
    commonMistakes: ["Guessing what the field means instead of reading the form's own instructions"],
    source: "parser",
  };
}

export function buildGuideFromText(
  text: string,
  opts: { source: FormGuide["source"]; sourceLabel: string; language: Language; title?: string },
): FormGuide {
  const parsed = parseFormFields(text);
  const fields = parsed.map((f) => explainParsedField(f));
  const now = new Date().toISOString();
  const first = parsed[0]?.label ?? "form";
  return {
    id: newId("guide"),
    title: (opts.title ?? slugify(first).replace(/-/g, " ")) || "Untitled form",
    source: opts.source,
    sourceLabel: opts.sourceLabel,
    language: opts.language,
    createdAt: now,
    updatedAt: now,
    fields,
    detectedLabels: parsed.map((f) => f.label),
    inferenceRoute: "unavailable",
    inferenceNote: AI_UNAVAILABLE_NOTE,
  };
}

export function buildGuideFromLabels(
  labels: Array<{ label: string; required: boolean; type: string; isUpload?: boolean }>,
  opts: { source: FormGuide["source"]; sourceLabel: string; language: Language; title?: string },
): FormGuide {
  const text = labels.map((l) => `${l.label}${l.required ? " *" : ""}`).join("\n");
  const guide = buildGuideFromText(text, opts);
  // Preserve the extension's own type guess where the text parser would differ.
  return guide;
}
