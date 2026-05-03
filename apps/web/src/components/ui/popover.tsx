import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Popover({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-popover", className)} {...props} />;
}

export function PopoverContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-popover-content", className)} {...props} />;
}
