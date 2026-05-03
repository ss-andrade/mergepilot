import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={cn("mp-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-card__header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("mp-card__title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mp-card__description", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-card__content", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-card__footer", className)} {...props} />;
}

export function CardAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mp-card__action", className)} {...props} />;
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("mp-panel", className)} {...props} />;
}
