import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
export function Input(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className="input" {...props} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea className="textarea" {...props} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className="select" {...props} />;
}
