// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useWideViewport } from "@/hooks/use-wide-viewport";

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export type ResourceInspectorHeaderProps = {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onClose?: () => void;
};

export function ResourceInspectorHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  onClose,
}: ResourceInspectorHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      {Icon ? (
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground">
          <Icon />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className={fieldLabel}>{eyebrow}</div> : null}
        <h2 className="break-words text-[15px] font-bold leading-tight" title={title}>
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 break-all font-mono text-xs leading-relaxed text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {onClose ? (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close resource detail"
          onClick={onClose}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export type ResourceInspectorPanelProps = {
  children: ReactNode;
  className?: string;
};

export function ResourceInspectorPanel({ children, className }: ResourceInspectorPanelProps) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

export type ResourceInventoryShellProps = {
  table: ReactNode;
  inspectorContent: ReactNode | null;
  inspectorOpen: boolean;
  onInspectorOpenChange: (open: boolean) => void;
  inspectorAriaLabel: string;
};

/**
 * Inventory layout: full-width table with the inspector stacked beneath on wide
 * viewports (matches pre-ResourceTable EC2/Lambda detail placement). Narrow
 * viewports use a Sheet so the table keeps the full width.
 */
export function ResourceInventoryShell({
  table,
  inspectorContent,
  inspectorOpen,
  onInspectorOpenChange,
  inspectorAriaLabel,
}: ResourceInventoryShellProps) {
  const isWideViewport = useWideViewport();
  const showStackedInspector = isWideViewport && inspectorContent && inspectorOpen;

  const stackedInspector = showStackedInspector ? (
    <aside
      aria-label={inspectorAriaLabel}
      className="rounded-lg border border-border bg-card p-[18px] shadow-sm"
    >
      {inspectorContent}
    </aside>
  ) : null;

  const sheetInspector =
    !isWideViewport && inspectorContent ? (
      <Sheet open={inspectorOpen} onOpenChange={onInspectorOpenChange}>
        <SheetContent
          aria-label={inspectorAriaLabel}
          className="w-full gap-0 overflow-y-auto p-[18px] sm:max-w-md [&>button]:hidden"
        >
          {inspectorContent}
        </SheetContent>
      </Sheet>
    ) : null;

  return (
    <>
      <div className="space-y-4">
        {table}
        {stackedInspector}
      </div>
      {sheetInspector}
    </>
  );
}