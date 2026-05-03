import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "accent" | "danger" | "muted" | "success" | "warning";
}

export function Badge({ className, tone = "muted", ...props }: BadgeProps) {
  return <span className={cn("mp-badge", `mp-badge--${tone}`, className)} {...props} />;
}
