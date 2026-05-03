import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Sheet({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <aside className={cn("mp-sheet", className)} {...props} />;
}

export function SheetContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-sheet-content", className)} {...props} />;
}
