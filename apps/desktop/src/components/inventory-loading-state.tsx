// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type InventoryLoadingStateProps = {
  label: string;
  className?: string;
  variant?: "panel" | "banner" | "inline";
};

function InventoryLoadingState({
  label,
  className,
  variant = "panel",
}: InventoryLoadingStateProps) {
  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-muted-foreground">{label}</span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/20 px-6 py-12 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

type InventorySelectLoadingHintProps = {
  loading: boolean;
  label: string;
  className?: string;
};

function InventorySelectLoadingHint({
  loading,
  label,
  className,
}: InventorySelectLoadingHintProps) {
  if (!loading) {
    return null;
  }
  return (
    <p
      className={cn(
        "mt-2 flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </p>
  );
}

export { InventoryLoadingState, InventorySelectLoadingHint };