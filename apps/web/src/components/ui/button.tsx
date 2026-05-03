import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva("mp-button", {
  defaultVariants: {
    size: "default",
    variant: "default"
  },
  variants: {
    size: {
      default: "mp-button--default-size",
      icon: "mp-button--icon",
      sm: "mp-button--sm"
    },
    variant: {
      default: "mp-button--primary",
      destructive: "mp-button--destructive",
      ghost: "mp-button--ghost",
      outline: "mp-button--outline",
      secondary: "mp-button--secondary"
    }
  }
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, size, variant, type = "button", ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ className, size, variant }))} type={type} {...props} />;
}

export { buttonVariants };
