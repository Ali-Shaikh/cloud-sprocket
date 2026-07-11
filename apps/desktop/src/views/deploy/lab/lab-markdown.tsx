// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { ReactNode } from "react";

import { openExternalUrl } from "@/lib/backend";

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; code: string; language?: string };

export function parseLabMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const fence = lines[index].match(/^```([^\s`]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: "code",
        code: code.join("\n"),
        language: fence[1] || undefined,
      });
      continue;
    }
    if (/^\s*[-*]\s+/.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g,
  );
  return tokens.filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          className="font-medium text-primary underline underline-offset-2"
          onClick={(event) => {
            event.preventDefault();
            void openExternalUrl(link[2]);
          }}
        >
          {link[1]}
        </a>
      );
    }
    return token;
  });
}

export function LabMarkdown({ children }: { children: string }) {
  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
      {parseLabMarkdown(children).map((block, index) => {
        if (block.type === "code") {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
            >
              <code data-language={block.language}>{block.code}</code>
            </pre>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>
                  {inlineMarkdown(item, `${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inlineMarkdown(block.text, String(index))}</p>;
      })}
    </div>
  );
}
