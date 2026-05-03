import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Menu({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-menu", className)} role="menu" {...props} />;
}

export function MenuItem({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("mp-menu-item", className)} role="menuitem" type="button" {...props} />;
}

export function MenuSeparator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("mp-menu-separator", className)} role="separator" {...props} />;
}
