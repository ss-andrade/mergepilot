import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Checkbox({ className, type = "checkbox", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("mp-checkbox", className)} type={type} {...props} />;
}
