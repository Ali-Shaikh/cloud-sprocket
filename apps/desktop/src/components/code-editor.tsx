// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

import { cn } from "@/lib/utils";

export type CodeEditorLanguage = "plain" | "json" | "yaml";

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language?: CodeEditorLanguage;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
  "aria-label"?: string;
};

export function codeEditorLanguageExtension(language: CodeEditorLanguage): Extension {
  switch (language) {
    case "json":
      return json();
    case "yaml":
      return yaml();
    default:
      return [];
  }
}

function CodeEditor({
  value,
  onChange,
  language = "plain",
  disabled = false,
  className,
  minHeight = "240px",
  "aria-label": ariaLabel = "Code editor",
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartmentRef = useRef(new Compartment());
  const languageCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        updateListener,
        languageCompartmentRef.current.of(codeEditorLanguageExtension(language)),
        editableCompartmentRef.current.of(EditorView.editable.of(!disabled)),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": {
            fontSize: "12px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          },
          ".cm-content": {
            minHeight,
          },
          ".cm-scroller": {
            overflow: "auto",
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(codeEditorLanguageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  return (
    <div
      ref={hostRef}
      aria-label={ariaLabel}
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-60",
        className,
      )}
    />
  );
}

export { CodeEditor };
