import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Command({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-command", className)} role="dialog" {...props} />;
}

export function CommandInput({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-command-input", className)} {...props} />;
}

export function CommandList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-command-list", className)} role="listbox" {...props} />;
}

export function CommandGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-command-group", className)} {...props} />;
}

export function CommandItem({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("mp-command-item", className)} role="option" type="button" {...props} />;
}

export function CommandFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-command-footer", className)} {...props} />;
}
