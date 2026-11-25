import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}
export function Button({ variant = "primary", children, ...rest }: ButtonProps): React.JSX.Element {
  const cls = variant === "primary" ? "btn" : `btn btn-${variant}`;
  return <button type="button" className={cls} {...rest}>{children}</button>;
}
