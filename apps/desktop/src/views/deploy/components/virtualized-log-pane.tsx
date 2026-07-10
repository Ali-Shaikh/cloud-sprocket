// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import { DEPLOY_LOG_LINE_CAP, deploymentLogTruncated } from "@/lib/deploy-log-state";

const ROW_HEIGHT_PX = 18;
const VIRTUALIZE_THRESHOLD = 80;

export function VirtualizedLogPane({
  lines,
  scrollRef,
  className = "h-72",
}: {
  lines: string[];
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const parentRef = scrollRef ?? internalRef;
  const shouldVirtualize = lines.length > VIRTUALIZE_THRESHOLD;
  const truncated = deploymentLogTruncated(lines.length);

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? lines.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 20,
  });

  useEffect(() => {
    if (!parentRef.current || lines.length === 0) return;
    parentRef.current.scrollTop = parentRef.current.scrollHeight;
  }, [lines, parentRef]);

  return (
    <div className="flex flex-col gap-1.5">
      {truncated ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Showing the latest {DEPLOY_LOG_LINE_CAP.toLocaleString()} log lines. Earlier output was trimmed to
          keep the UI responsive.
        </p>
      ) : null}
      <div
        ref={parentRef}
        className={`overflow-auto rounded-lg border bg-[#0d1117] p-3 font-mono text-xs leading-relaxed text-[#c9d1d9] ${className}`}
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">Waiting for output…</span>
        ) : shouldVirtualize ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full whitespace-pre-wrap"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {lines[virtualRow.index]}
              </div>
            ))}
          </div>
        ) : (
          lines.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}