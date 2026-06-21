// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * A reusable inline banner for persistent, at-a-glance state (read-only mode,
 * Docker engine down, write-enabled warnings). Tone tints the border, surface,
 * and icon via CVA variants, mirroring the pattern OverviewView used inline.
 */
const inlineBannerVariants = cva(
  "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      tone: {
        info: "border-primary/20 bg-primary/5",
        warning: "border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10",
        success: "border-[color:var(--success)]/30 bg-[color:var(--success)]/10",
        destructive: "border-destructive/30 bg-destructive/10",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  },
);

const ICON_TONE: Record<NonNullable<InlineBannerTone>, string> = {
  info: "text-primary",
  warning: "text-[color:var(--warning)]",
  success: "text-[color:var(--success)]",
  destructive: "text-destructive",
};

const DEFAULT_ICON: Record<NonNullable<InlineBannerTone>, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  destructive: AlertCircle,
};

type InlineBannerTone = VariantProps<typeof inlineBannerVariants>["tone"];

export interface InlineBannerProps {
  tone?: NonNullable<InlineBannerTone>;
  /** Lucide icon component; falls back to a sensible per-tone default. */
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
}

function InlineBanner({
  tone = "info",
  icon,
  title,
  description,
  action,
  onDismiss,
  className,
}: InlineBannerProps) {
  const Icon = icon ?? DEFAULT_ICON[tone];

  return (
    <div data-slot="inline-banner" className={cn(inlineBannerVariants({ tone }), className)}>
      <Icon className={cn("size-5 shrink-0", ICON_TONE[tone])} />
      {description ? (
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-muted-foreground">{description}</div>
        </div>
      ) : (
        <span className="min-w-0 flex-1 text-foreground">{title}</span>
      )}
      {action ? (
        <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
      {onDismiss ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7 shrink-0", action ? "" : "ml-auto")}
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export { InlineBanner, inlineBannerVariants };
