import type { Language } from "@formease/shared";
import { useLocalStorage } from "../hooks/useLocalStorage.ts";
import { Select } from "./Input.tsx";

const OPTIONS: Array<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "simple-en", label: "Simple English" },
  { value: "roman-ur", label: "Roman Urdu" },
];
export function LanguageSelector(): React.JSX.Element {
  const [lang, setLang] = useLocalStorage<Language>("formease:v1:language", "en");
  return (
    <Select aria-label="Preferred explanation language" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
      {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}
export function languageLabel(lang: Language): string {
  return OPTIONS.find((o) => o.value === lang)?.label ?? "English";
}
