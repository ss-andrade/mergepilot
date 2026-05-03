import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Switch({ className, role = "switch", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("mp-switch", className)} role={role} type={type} {...props} />;
}
