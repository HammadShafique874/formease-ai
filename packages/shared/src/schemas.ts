import type { DetectedField, ExtensionScan, FieldExplanation, FormGuide } from "./types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateFieldExplanation(v: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(v)) return { ok: false, errors: ["FieldExplanation must be an object"] };
  if (typeof v.fieldLabel !== "string" || v.fieldLabel.trim() === "") errors.push("fieldLabel must be a non-empty string");
  if (typeof v.simpleExplanation !== "string" || v.simpleExplanation.trim() === "") errors.push("simpleExplanation must be a non-empty string");
  if (!isStringArray(v.requiredInformation)) errors.push("requiredInformation must be a string array");
  if (!isStringArray(v.possibleDocuments)) errors.push("possibleDocuments must be a string array");
  if (!isStringArray(v.commonMistakes)) errors.push("commonMistakes must be a string array");
  if (v.exampleAnswer !== undefined && typeof v.exampleAnswer !== "string") errors.push("exampleAnswer must be a string");
  if (v.confidence !== undefined && (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1)) errors.push("confidence must be a number 0–1");
  if (v.source !== undefined && v.source !== "phrasebook" && v.source !== "parser" && v.source !== "ai") errors.push("source must be phrasebook, parser or ai");
  if (v.route !== undefined && v.route !== "local" && v.route !== "cloud" && v.route !== "mixed" && v.route !== "unavailable") errors.push("route must be local, cloud, mixed or unavailable");
  if (v.latencyMs !== undefined && (typeof v.latencyMs !== "number" || v.latencyMs < 0)) errors.push("latencyMs must be a non-negative number");
  if (v.attempts !== undefined && (typeof v.attempts !== "number" || !Number.isInteger(v.attempts) || v.attempts < 1)) errors.push("attempts must be a positive integer");
  if (v.aiError !== undefined && typeof v.aiError !== "string") errors.push("aiError must be a string");
  if (v.phrasebookKey !== undefined && typeof v.phrasebookKey !== "string") errors.push("phrasebookKey must be a string");
  if (v.explanations !== undefined) {
    if (!isRecord(v.explanations)) errors.push("explanations must be an object");
    else {
      for (const lang of ["en", "simple-en", "roman-ur"]) {
        const text = (v.explanations as Record<string, unknown>)[lang];
        if (text !== undefined && (typeof text !== "string" || text.trim() === "")) errors.push(`explanations.${lang} must be a non-empty string`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateDetectedField(v: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(v)) return { ok: false, errors: ["DetectedField must be an object"] };
  if (typeof v.id !== "string" || v.id === "") errors.push("id must be a non-empty string");
  if (typeof v.label !== "string" || v.label.trim() === "") errors.push("label must be a non-empty string");
  if (typeof v.type !== "string" || v.type === "") errors.push("type must be a non-empty string");
  if (typeof v.required !== "boolean") errors.push("required must be a boolean");
  if (typeof v.isUpload !== "boolean") errors.push("isUpload must be a boolean");
  return { ok: errors.length === 0, errors };
}

export function validateExtensionScan(v: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(v)) return { ok: false, errors: ["ExtensionScan must be an object"] };
  if (typeof v.id !== "string" || v.id === "") errors.push("id must be a non-empty string");
  if (typeof v.url !== "string" || v.url === "") errors.push("url must be a non-empty string");
  if (typeof v.title !== "string") errors.push("title must be a string");
  if (typeof v.scannedAt !== "string" || Number.isNaN(Date.parse(v.scannedAt))) errors.push("scannedAt must be an ISO date string");
  if (v.language !== "en" && v.language !== "simple-en" && v.language !== "roman-ur") errors.push("language must be en, simple-en or roman-ur");
  if (!Array.isArray(v.fields)) errors.push("fields must be an array");
  else {
    if (v.fields.length > 200) errors.push("fields must have at most 200 entries");
    v.fields.forEach((f, i) => {
      const r = validateDetectedField(f);
      if (!r.ok) errors.push(`fields[${String(i)}]: ${r.errors.join("; ")}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function isValidExtensionScan(v: unknown): v is ExtensionScan {
  return validateExtensionScan(v).ok;
}

export type { DetectedField, ExtensionScan };

export function parseFieldExplanationJson(text: string): { ok: true; value: FieldExplanation } | { ok: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ["AI output was not valid JSON"] };
  }
  const r = validateFieldExplanation(parsed);
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, value: parsed as FieldExplanation };
}

export function validateFormGuide(v: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(v)) return { ok: false, errors: ["FormGuide must be an object"] };
  if (typeof v.id !== "string" || v.id === "") errors.push("id must be a non-empty string");
  if (typeof v.title !== "string" || v.title === "") errors.push("title must be a non-empty string");
  if (!Array.isArray(v.fields)) errors.push("fields must be an array");
  else {
    v.fields.forEach((f, i) => {
      const r = validateFieldExplanation(f);
      if (!r.ok) errors.push(`fields[${String(i)}]: ${r.errors.join("; ")}`);
    });
  }
  if (!Array.isArray(v.detectedLabels) || !v.detectedLabels.every((x) => typeof x === "string")) errors.push("detectedLabels must be a string array");
  return { ok: errors.length === 0, errors };
}
export type { FormGuide };
