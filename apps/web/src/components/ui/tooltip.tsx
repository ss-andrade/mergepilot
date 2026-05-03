import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Tooltip({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-tooltip", className)} role="tooltip" {...props} />;
}
