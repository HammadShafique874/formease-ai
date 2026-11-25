// Thin re-export layer so pages import parsing from services, not shared directly.
export { parseFieldLines, parseFormFields, guessFieldType, detectDocumentHints, slugify, newId, buildGuideFromText, buildGuideFromLabels, explainParsedField, lookupPhrasebook, sourceLabel, AI_UNAVAILABLE_NOTE } from "@formease/shared";
