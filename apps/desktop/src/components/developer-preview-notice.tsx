// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { FlaskConical } from "lucide-react";

import { InlineBanner } from "@/components/inline-banner";
import {
  RELEASE_CHANNEL_DESCRIPTION,
  RELEASE_CHANNEL_LABEL,
  RELEASE_CHANNEL_TAGLINE,
} from "@/lib/release-channel";
import { cn } from "@/lib/utils";

type DeveloperPreviewNoticeProps = {
  variant?: "banner" | "strip";
  className?: string;
};

function DeveloperPreviewNotice({ variant = "banner", className }: DeveloperPreviewNoticeProps) {
  if (variant === "strip") {
    return (
      <div
        data-slot="developer-preview-strip"
        className={cn(
          "flex flex-none items-center gap-2 border-b border-warning/25 bg-warning/10 px-5 py-1.5 text-[11.5px] text-foreground",
          className,
        )}
      >
        <FlaskConical className="size-3.5 shrink-0 text-[color:var(--warning)]" aria-hidden />
        <p className="min-w-0 truncate">
          <span className="font-semibold">{RELEASE_CHANNEL_LABEL}</span>
          <span className="text-muted-foreground"> · {RELEASE_CHANNEL_TAGLINE}</span>
        </p>
      </div>
    );
  }

  return (
    <InlineBanner
      tone="warning"
      icon={FlaskConical}
      title={RELEASE_CHANNEL_LABEL}
      description={RELEASE_CHANNEL_DESCRIPTION}
      className={className}
    />
  );
}

export { DeveloperPreviewNotice };