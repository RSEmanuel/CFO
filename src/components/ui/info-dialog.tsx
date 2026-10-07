"use client";

import { useLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Info, X, type LucideIcon } from "lucide-react";

export function InfoDialog({
  title,
  body,
  ariaLabel,
  icon: Icon = Info,
  triggerClassName,
}: {
  title: string;
  body: string;
  ariaLabel: string;
  icon?: LucideIcon;
  triggerClassName?: string;
}) {
  const { t } = useLocale();

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "rounded-full p-1 text-muted-foreground/70 transition hover:bg-card/80 hover:text-foreground",
            triggerClassName,
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-card p-8 shadow-[var(--shadow-card)] focus:outline-none">
          <DialogPrimitive.Close
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t("metrics.infoClose")}
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          <DialogPrimitive.Title className="pr-8 font-sans text-xl font-bold text-foreground">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-4 text-base leading-relaxed text-foreground">
            {body}
          </DialogPrimitive.Description>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
