import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface DialogContentProps extends DialogPrimitive.Popup.Props {
  children: ReactNode;
  className?: string;
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({ children, className, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="mp-dialog-backdrop" />
      <DialogPrimitive.Viewport className="mp-dialog-viewport">
        <DialogPrimitive.Popup className={cn("mp-dialog", className)} {...props}>
          {children}
          <DialogPrimitive.Close aria-label="Close" className="mp-dialog-close" render={<Button size="icon" variant="ghost" />}>
            <XIcon aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mp-dialog-header", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mp-dialog-body", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mp-dialog-footer", className)} {...props} />;
}
