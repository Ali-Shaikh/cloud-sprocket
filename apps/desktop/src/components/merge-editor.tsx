// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

import { codeEditorLanguageExtension, type CodeEditorLanguage } from "@/components/code-editor";
import { cn } from "@/lib/utils";

export type MergeEditorProps = {
  left: string;
  right: string;
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
  language?: CodeEditorLanguage;
  className?: string;
};

function editorExtensions(
  language: CodeEditorLanguage,
  onChange: (value: string) => void,
): Extension[] {
  return [
    lineNumbers(),
    history(),
    codeEditorLanguageExtension(language),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    EditorView.theme({
      "&": {
        fontSize: "12px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      ".cm-content": {
        minHeight: "320px",
      },
    }),
  ];
}

function syncEditorValue(view: EditorView | undefined, value: string) {
  if (!view) {
    return;
  }
  const current = view.state.doc.toString();
  if (current !== value) {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }
}

function MergeEditor({
  left,
  right,
  onLeftChange,
  onRightChange,
  language = "plain",
  className,
}: MergeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const onLeftChangeRef = useRef(onLeftChange);
  const onRightChangeRef = useRef(onRightChange);

  useEffect(() => {
    onLeftChangeRef.current = onLeftChange;
  }, [onLeftChange]);

  useEffect(() => {
    onRightChangeRef.current = onRightChange;
  }, [onRightChange]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const merge = new MergeView({
      a: {
        doc: left,
        extensions: editorExtensions(language, (value) => onLeftChangeRef.current(value)),
      },
      b: {
        doc: right,
        extensions: editorExtensions(language, (value) => onRightChangeRef.current(value)),
      },
      parent: hostRef.current,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 8 },
      diffConfig: { scanLimit: 5000, timeout: 500 },
    });
    mergeRef.current = merge;
    return () => {
      merge.destroy();
      mergeRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    syncEditorValue(mergeRef.current?.a, left);
  }, [left]);

  useEffect(() => {
    syncEditorValue(mergeRef.current?.b, right);
  }, [right]);

  return (
    <div
      ref={hostRef}
      aria-label="Diff editor"
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background",
        "[&_.cm-mergeView]:max-h-[520px] [&_.cm-mergeView]:overflow-auto",
        "[&_.cm-mergeViewEditors]:min-w-[720px]",
        className,
      )}
    />
  );
}

export { MergeEditor };
