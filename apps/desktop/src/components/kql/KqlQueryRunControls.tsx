// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ExternalLink, Loader2, Play, Square } from "lucide-react";

import { KQL_PAGE_SIZE_OPTIONS } from "@/lib/log-query-execution";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type KqlQueryRunControlsProps = {
  running: boolean;
  canRun: boolean;
  pageSize: number;
  onRun: () => void;
  onCancel: () => void;
  onPageSizeChange: (size: number) => void;
  onEditInLogAnalytics?: () => void;
  editDisabled?: boolean;
  onOpenInPortal?: () => void;
  openInPortalDisabled?: boolean;
};

export function KqlQueryRunControls({
  running,
  canRun,
  pageSize,
  onRun,
  onCancel,
  onPageSizeChange,
  onEditInLogAnalytics,
  editDisabled = false,
  onOpenInPortal,
  openInPortalDisabled = false,
}: KqlQueryRunControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={onRun} disabled={!canRun}>
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        {running ? "Running…" : "Run query"}
      </Button>
      {running ? (
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Square />
          Cancel
        </Button>
      ) : null}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Rows</span>
        <Select
          value={String(pageSize)}
          disabled={running}
          onValueChange={(value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              onPageSizeChange(parsed);
            }
          }}
        >
          <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KQL_PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {onOpenInPortal ? (
        <Button
          variant="outline"
          size="sm"
          disabled={openInPortalDisabled}
          onClick={onOpenInPortal}
        >
          <ExternalLink />
          Open in Portal
        </Button>
      ) : null}
      {onEditInLogAnalytics ? (
        <Button
          variant="outline"
          size="sm"
          disabled={editDisabled}
          onClick={onEditInLogAnalytics}
        >
          <ExternalLink />
          Edit in Log Analytics
        </Button>
      ) : null}
    </div>
  );
}