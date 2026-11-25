export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "form";
}
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${String(Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

import type { ParsedField, ParsedFieldType } from "./types.js";

const VERB_PREFIX = /^(please\s+)?(provide|enter|fill in|fill out|write|type|select|choose|upload|attach|specify|mention|state|give)\s*:?\s*(your\s+)?/i;
const LABEL_PREFIX = /^(field|question|item|q\.?)\s*[:.)-]?\s*\d*\s*[:.)-]?\s*/i;

function cleanLabel(raw: string): { label: string; required: boolean } {
  let line = raw.trim();
  line = line.replace(/^\s*(?:\d{1,2}[.)]\s*|[-*•–—]\s*)/, "").trim();
  line = line.replace(LABEL_PREFIX, "").trim();
  const required = /(\*|\(required\)|\brequired\b)\s*$/i.test(line) || line.includes("*");
  line = line.replace(/\s*\(\s*required\s*\)\s*$/i, "").replace(/\*+$/, "").trim();
  line = line.replace(VERB_PREFIX, "").trim();
  line = line.replace(/[?:]+$/, "").trim();
  return { label: line, required };
}

export function guessFieldType(label: string): ParsedFieldType {
  const l = label.toLowerCase();
  if (/e-?mail/.test(l)) return "email";
  if (/date of birth|dob|birth date|expiry|deadline|\bdate\b/.test(l)) return "date";
  if (/phone|mobile|contact number|cell/.test(l)) return "tel";
  if (/upload|attach|photo|photograph|signature|file|document|marksheet|certificate/.test(l)) return "file";
  if (/gender|marital|nationality|province|religion|\bstatus\b|select|choose/.test(l)) return "select";
  if (/number|marks|cgpa|gpa|percentage|income|salary|age|\byear\b|amount|fee/.test(l)) return "number";
  return "text";
}

/** Split pasted/extracted form text into likely field labels. Deterministic — not AI. */
export function parseFieldLines(text: string): string[] {
  return parseFormFields(text).map((f) => f.label);
}

/** Full parse: label, required flag, guessed type, document hints per field. */
export function parseFormFields(text: string): ParsedField[] {
  const seen = new Set<string>();
  const out: ParsedField[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > 120 && !trimmed.endsWith("?")) continue;
    const { label, required } = cleanLabel(trimmed);
    if (label.length < 3 || label.length > 120) continue;
    if (/^(please\s+note|note:|instructions?|section|part\s+\d|important)/i.test(label) && !required) continue;
    if (/^(submit|cancel|next|back|continue|login|register)$/i.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, required, type: guessFieldType(label), documentHints: detectDocumentHints(label), originalLine: trimmed });
    if (out.length >= 60) break;
  }
  return out;
}

const DOCUMENT_HINTS: Array<{ pattern: RegExp; doc: string }> = [
  { pattern: /matric|intermediate|transcript|marksheet|marks sheet|degree|certificate/i, doc: "Academic transcript / certificate" },
  { pattern: /cnic|national id|identity card|passport/i, doc: "CNIC / identity document" },
  { pattern: /photo|photograph|picture/i, doc: "Passport-size photograph" },
  { pattern: /domicile/i, doc: "Domicile certificate" },
  { pattern: /income|salary slip|bank statement/i, doc: "Income proof / bank statement" },
  { pattern: /experience|employment|job letter/i, doc: "Experience / employment letter" },
  { pattern: /fee|challan|payment receipt/i, doc: "Fee challan / payment receipt" },
];

/** Keyword hints only. Never present these as officially mandatory. */
export function detectDocumentHints(text: string): string[] {
  const out: string[] = [];
  for (const h of DOCUMENT_HINTS) {
    if (h.pattern.test(text) && !out.includes(h.doc)) out.push(h.doc);
  }
  return out;
}
