// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeftRight,
  Braces,
  CheckCircle2,
  Clipboard,
  Clock3,
  Code2,
  Copy,
  Diff,
  Eraser,
  FileJson2,
  Fingerprint,
  KeyRound,
  Link2,
  Minimize2,
  ShieldAlert,
  Shuffle,
  TextCursorInput,
  Wand2,
} from "lucide-react";

import { CodeEditor, type CodeEditorLanguage } from "@/components/code-editor";
import { MergeEditor } from "@/components/merge-editor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  base64Decode,
  base64Encode,
  compactJson,
  decodeJwt,
  formatJson,
  formatYaml,
  isoToUnix,
  jsonToYaml,
  parseArn,
  parseAzureResourceId,
  parseConnectionString,
  prettierFormatJson,
  sha256Hex,
  unixToIso,
  urlDecode,
  urlEncode,
  validateJson,
  validateYaml,
  yamlToJson,
  type ToolResult,
} from "@/lib/developer-tools";
import { cn } from "@/lib/utils";
import { importRecipeFolder, scaffoldRecipe, validateRecipeFolder } from "@/lib/backend";
import { notify } from "@/lib/notify";
import { formatBackendError } from "@/lib/workspace-snapshot";

type TextLanguage = "plain" | "json" | "yaml" | "markdown" | "shell" | "env";
type DiffLanguage = "plain" | "json" | "yaml";
type DiagnosticTone = "neutral" | "success" | "error" | "warning";

const SAMPLE_JSON = `{
  "service": "api",
  "replicas": 2,
  "ports": [8080, 8443],
  "labels": {
    "env": "prod",
    "team": "platform"
  }
}
`;

const SAMPLE_YAML = `service: api
replicas: 2
ports:
  - 8080
  - 8443
labels:
  env: prod
  team: platform
`;

const SAMPLE_LEFT = `service: api
replicas: 2
image: app:v1
`;

const SAMPLE_RIGHT = `service: api
replicas: 3
image: app:v2
`;

function editorLanguageForText(language: TextLanguage | DiffLanguage): CodeEditorLanguage {
  if (language === "json" || language === "yaml") {
    return language;
  }
  return "plain";
}

function Diagnostic({
  tone = "neutral",
  children,
}: {
  tone?: DiagnosticTone;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "neutral" && "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function ToolSection({
  title,
  icon: Icon,
  children,
  actions,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function ResultBlock({
  label,
  value,
  emptyLabel = "No output yet.",
}: {
  label: string;
  value: string;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed">
        {value || emptyLabel}
      </pre>
    </div>
  );
}

function KeyValueTable({
  rows,
}: {
  rows: Array<{ key: string; value: string; sensitive?: boolean }>;
}) {
  if (rows.length === 0) {
    return <Diagnostic>No parsed fields.</Diagnostic>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.key}:${row.value}`} className="border-b border-border last:border-b-0">
              <th className="w-48 bg-muted/30 px-3 py-2 align-top text-xs font-medium text-muted-foreground">
                {row.key}
              </th>
              <td className="break-all px-3 py-2 font-mono text-xs">
                {row.value}
                {row.sensitive ? <span className="ml-2 text-muted-foreground">masked</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useClipboardStatus() {
  const [copyStatus, setCopyStatus] = useState("Clipboard idle.");
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy failed.");
    }
  };
  return { copyStatus, copyText };
}

function applyTextResult(
  result: ToolResult<string>,
  onValue: (value: string) => void,
  onDiagnostic: (message: string, tone: DiagnosticTone) => void,
) {
  if (result.ok) {
    onValue(result.value);
    onDiagnostic(result.message ?? "Updated.", "success");
    return;
  }
  onDiagnostic(result.error, "error");
}

function JsonWorkbench() {
  const [value, setValue] = useState(SAMPLE_JSON);
  const [diagnostic, setDiagnostic] = useState("JSON is ready.");
  const [tone, setTone] = useState<DiagnosticTone>("neutral");
  const { copyStatus, copyText } = useClipboardStatus();

  const setResult = (message: string, nextTone: DiagnosticTone) => {
    setDiagnostic(message);
    setTone(nextTone);
  };

  return (
    <ToolSection
      title="JSON Workbench"
      icon={FileJson2}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const result = validateJson(value);
              setResult(result.message, result.valid ? "success" : "error");
            }}
          >
            <CheckCircle2 aria-hidden />
            Validate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void prettierFormatJson(value).then((result) => applyTextResult(result, setValue, setResult));
            }}
          >
            <Wand2 aria-hidden />
            Format
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyTextResult(compactJson(value), setValue, setResult)}
          >
            <Minimize2 aria-hidden />
            Compact
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyTextResult(formatJson(value, { sortKeys: true }), setValue, setResult)}
          >
            <Shuffle aria-hidden />
            Sort keys
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(value)}>
            <Copy aria-hidden />
            Copy
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue("");
              setResult("Cleared.", "neutral");
            }}
          >
            <Eraser aria-hidden />
            Clear
          </Button>
        </>
      }
    >
      <CodeEditor value={value} onChange={setValue} language="json" aria-label="JSON input" minHeight="360px" />
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Diagnostic tone={tone}>{diagnostic}</Diagnostic>
        <Diagnostic>{copyStatus}</Diagnostic>
      </div>
    </ToolSection>
  );
}

function TextWorkbench() {
  const [language, setLanguage] = useState<TextLanguage>("yaml");
  const [value, setValue] = useState(SAMPLE_YAML);
  const [diagnostic, setDiagnostic] = useState("Text editor is ready.");
  const [tone, setTone] = useState<DiagnosticTone>("neutral");
  const { copyStatus, copyText } = useClipboardStatus();

  const setResult = (message: string, nextTone: DiagnosticTone) => {
    setDiagnostic(message);
    setTone(nextTone);
  };

  const formatCurrent = () => {
    if (language === "json") {
      void prettierFormatJson(value).then((result) => applyTextResult(result, setValue, setResult));
      return;
    }
    if (language === "yaml") {
      void formatYaml(value).then((result) => applyTextResult(result, setValue, setResult));
      return;
    }
    setResult("Formatter is available for JSON and YAML.", "warning");
  };

  const validateCurrent = () => {
    if (language === "json") {
      const result = validateJson(value);
      setResult(result.message, result.valid ? "success" : "error");
      return;
    }
    if (language === "yaml") {
      const result = validateYaml(value);
      setResult(result.message, result.valid ? "success" : "error");
      return;
    }
    setResult("Plain text mode has no parser validation.", "warning");
  };

  return (
    <ToolSection
      title="YAML and Text Editor"
      icon={TextCursorInput}
      actions={
        <>
          <Select
            value={language}
            onValueChange={(next) => {
              setLanguage(next as TextLanguage);
              setResult(`${next.toUpperCase()} mode selected.`, "neutral");
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yaml">YAML</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="plain">Plain text</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
              <SelectItem value="shell">Shell</SelectItem>
              <SelectItem value="env">Env</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={validateCurrent}>
            <CheckCircle2 aria-hidden />
            Validate
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={formatCurrent}>
            <Wand2 aria-hidden />
            Format
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              applyTextResult(jsonToYaml(value), (next) => {
                setLanguage("yaml");
                setValue(next);
              }, setResult);
            }}
          >
            <ArrowLeftRight aria-hidden />
            JSON to YAML
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              applyTextResult(yamlToJson(value), (next) => {
                setLanguage("json");
                setValue(next);
              }, setResult);
            }}
          >
            <ArrowLeftRight aria-hidden />
            YAML to JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(value)}>
            <Copy aria-hidden />
            Copy
          </Button>
        </>
      }
    >
      <CodeEditor
        value={value}
        onChange={setValue}
        language={editorLanguageForText(language)}
        aria-label="Text input"
        minHeight="360px"
      />
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Diagnostic tone={tone}>{diagnostic}</Diagnostic>
        <Diagnostic>{copyStatus}</Diagnostic>
      </div>
    </ToolSection>
  );
}

function normaliseForDiff(value: string, language: DiffLanguage): ToolResult<string> {
  if (language === "json") {
    return formatJson(value, { sortKeys: true });
  }
  if (language === "yaml") {
    const converted = yamlToJson(value);
    if (!converted.ok) {
      return converted;
    }
    return formatJson(converted.value, { sortKeys: true });
  }
  return { ok: true, value };
}

function DiffWorkbench() {
  const [language, setLanguage] = useState<DiffLanguage>("yaml");
  const [left, setLeft] = useState(SAMPLE_LEFT);
  const [right, setRight] = useState(SAMPLE_RIGHT);
  const [diagnostic, setDiagnostic] = useState("Diff editor is ready.");
  const [tone, setTone] = useState<DiagnosticTone>("neutral");
  const changeCount = useMemo(() => {
    const leftLines = left.split(/\r?\n/);
    const rightLines = right.split(/\r?\n/);
    const max = Math.max(leftLines.length, rightLines.length);
    let changed = 0;
    for (let index = 0; index < max; index += 1) {
      if ((leftLines[index] ?? "") !== (rightLines[index] ?? "")) {
        changed += 1;
      }
    }
    return changed;
  }, [left, right]);

  const normalise = () => {
    const nextLeft = normaliseForDiff(left, language);
    const nextRight = normaliseForDiff(right, language);
    if (!nextLeft.ok) {
      setDiagnostic(`Left: ${nextLeft.error}`);
      setTone("error");
      return;
    }
    if (!nextRight.ok) {
      setDiagnostic(`Right: ${nextRight.error}`);
      setTone("error");
      return;
    }
    setLeft(nextLeft.value);
    setRight(nextRight.value);
    setDiagnostic("Normalised both sides.");
    setTone("success");
  };

  return (
    <ToolSection
      title="Diff Checker"
      icon={Diff}
      actions={
        <>
          <Select value={language} onValueChange={(next) => setLanguage(next as DiffLanguage)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yaml">YAML</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="plain">Plain text</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={normalise}>
            <Shuffle aria-hidden />
            Normalise
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setLeft(right);
              setRight(left);
              setDiagnostic("Swapped sides.");
              setTone("neutral");
            }}
          >
            <ArrowLeftRight aria-hidden />
            Swap
          </Button>
        </>
      }
    >
      <MergeEditor
        left={left}
        right={right}
        onLeftChange={setLeft}
        onRightChange={setRight}
        language={editorLanguageForText(language)}
      />
      <Diagnostic tone={tone}>
        {diagnostic} Approximate changed lines: {changeCount}.
      </Diagnostic>
    </ToolSection>
  );
}

function EncoderWorkbench() {
  const [input, setInput] = useState("https://api.example.test/search?q=cloud sprocket");
  const [output, setOutput] = useState("");
  const [diagnostic, setDiagnostic] = useState("Encoders are ready.");
  const [tone, setTone] = useState<DiagnosticTone>("neutral");
  const { copyStatus, copyText } = useClipboardStatus();

  const apply = (result: ToolResult<string>) => {
    if (result.ok) {
      setOutput(result.value);
      setDiagnostic(result.message ?? "Updated output.");
      setTone("success");
      return;
    }
    setDiagnostic(result.error);
    setTone("error");
  };

  return (
    <ToolSection
      title="Encoding and Inspection"
      icon={Fingerprint}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => apply({ ok: true, value: base64Encode(input) })}>
            <Braces aria-hidden />
            Base64 encode
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => apply(base64Decode(input))}>
            <Braces aria-hidden />
            Base64 decode
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => apply({ ok: true, value: urlEncode(input) })}>
            <Link2 aria-hidden />
            URL encode
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => apply(urlDecode(input))}>
            <Link2 aria-hidden />
            URL decode
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const result = decodeJwt(input);
              if (result.ok) {
                setOutput(JSON.stringify(result.value, null, 2));
                setDiagnostic(result.message ?? "Decoded JWT.");
                setTone("warning");
                return;
              }
              setDiagnostic(result.error);
              setTone("error");
            }}
          >
            <ShieldAlert aria-hidden />
            JWT decode
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => apply(unixToIso(input))}>
            <Clock3 aria-hidden />
            UNIX to ISO
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => apply(isoToUnix(input))}>
            <Clock3 aria-hidden />
            ISO to UNIX
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void sha256Hex(input).then(apply);
            }}
          >
            <KeyRound aria-hidden />
            SHA-256
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(output)}>
            <Copy aria-hidden />
            Copy output
          </Button>
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <CodeEditor
          value={input}
          onChange={setInput}
          language="plain"
          aria-label="Encoder input"
          minHeight="260px"
        />
        <ResultBlock label="Output" value={output} />
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Diagnostic tone={tone}>{diagnostic}</Diagnostic>
        <Diagnostic>{copyStatus}</Diagnostic>
      </div>
    </ToolSection>
  );
}

function CloudIdWorkbench() {
  const [input, setInput] = useState(
    "arn:aws:lambda:eu-west-1:123456789012:function:orders-api",
  );
  const [rows, setRows] = useState<Array<{ key: string; value: string; sensitive?: boolean }>>([]);
  const [diagnostic, setDiagnostic] = useState("Cloud parsers are ready.");
  const [tone, setTone] = useState<DiagnosticTone>("neutral");

  const setError = (message: string) => {
    setRows([]);
    setDiagnostic(message);
    setTone("error");
  };

  return (
    <ToolSection
      title="Cloud ID Helpers"
      icon={Clipboard}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const result = parseArn(input);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setRows(Object.entries(result.value).map(([key, value]) => ({ key, value: String(value ?? "") })));
              setDiagnostic("Parsed AWS ARN.");
              setTone("success");
            }}
          >
            <Braces aria-hidden />
            Parse ARN
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const result = parseAzureResourceId(input);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setRows([
                { key: "subscriptionId", value: result.value.subscriptionId ?? "" },
                { key: "resourceGroup", value: result.value.resourceGroup ?? "" },
                { key: "providerNamespace", value: result.value.providerNamespace ?? "" },
                { key: "resourceTypes", value: result.value.resourceTypes.join("/") },
                { key: "resourceNames", value: result.value.resourceNames.join("/") },
              ]);
              setDiagnostic("Parsed Azure resource ID.");
              setTone("success");
            }}
          >
            <Braces aria-hidden />
            Parse Azure ID
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const result = parseConnectionString(input);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setRows(
                result.value.map((part) => ({
                  key: part.key,
                  value: part.displayValue,
                  sensitive: part.masked,
                })),
              );
              setDiagnostic("Parsed connection string.");
              setTone("success");
            }}
          >
            <KeyRound aria-hidden />
            Parse connection
          </Button>
        </>
      }
    >
      <CodeEditor value={input} onChange={setInput} language="plain" aria-label="Cloud ID input" minHeight="180px" />
      <Diagnostic tone={tone}>{diagnostic}</Diagnostic>
      <KeyValueTable rows={rows} />
    </ToolSection>
  );
}

function RecipeAuthoring() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
  const [pendingSourceType, setPendingSourceType] = useState<"folder" | "zip" | undefined>(undefined);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  async function runImportPreview(sourceType: "folder" | "zip") {
    try {
      const selected =
        sourceType === "zip"
          ? await openDialog({
              directory: false,
              multiple: false,
              filters: [{ name: "Recipe zip", extensions: ["zip"] }],
            })
          : await openDialog({ directory: true, multiple: false });
      if (!selected) return;
      setBusy(true);
      const path = String(selected);
      const res = (await importRecipeFolder(path, false, sourceType)) as Record<string, unknown>;
      setPreview(res);
      if (res.ok === false) {
        setPendingImportPath(null);
        setPendingSourceType(undefined);
        setStatus("Import blocked by validation: " + JSON.stringify(res.validation ?? res));
        notify("error", "Import blocked", "Fix validation errors before accepting the import.");
        return;
      }
      setPendingImportPath(path);
      setPendingSourceType(sourceType);
      setStatus("Import preview ready. Nothing has been copied yet.");
      notify("success", "Import preview ready", "Review providers and build commands, then accept to copy.");
    } catch (e) {
      setStatus("Import error: " + formatBackendError(e));
      setPendingImportPath(null);
      setPendingSourceType(undefined);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function doImportConfirm() {
    if (!pendingImportPath) return;
    try {
      setBusy(true);
      const res = await importRecipeFolder(pendingImportPath, true, pendingSourceType);
      setStatus("Import accepted and copied into the imported recipes directory.");
      setPreview(res as Record<string, unknown>);
      setPendingImportPath(null);
      setPendingSourceType(undefined);
      notify("success", "Import accepted", "Recipe copied into the imported recipes directory.");
    } catch (e) {
      setStatus("Import confirm error: " + formatBackendError(e));
    } finally {
      setBusy(false);
    }
  }

  function doImportReject() {
    setPendingImportPath(null);
    setPendingSourceType(undefined);
    setPreview(null);
    setStatus("Import rejected; nothing was copied.");
    notify("info", "Import rejected", "No files were written to the imported recipes directory.");
  }

  async function doValidate() {
    try {
      const folder = await openDialog({ directory: true, multiple: false });
      if (!folder) return;
      setBusy(true);
      const res = await validateRecipeFolder(String(folder));
      setStatus("Validation: " + JSON.stringify(res));
      if (res?.ok) {
        notify("success", "Recipe valid", "No blocking validation errors.");
      } else {
        notify("warning", "Validation findings", "See status for errors and warnings.");
      }
    } catch (e) {
      setStatus("Validate error: " + formatBackendError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doScaffold() {
    try {
      const folder = await openDialog({ directory: true, multiple: false });
      if (!folder) return;
      setBusy(true);
      const res = await scaffoldRecipe(String(folder), "aws");
      setStatus("Scaffolded at " + (res?.path || folder));
      notify("success", "Scaffold complete", "Starter recipe.yaml + tf files written. Open folder to edit.");
    } catch (e) {
      setStatus("Scaffold error: " + formatBackendError(e));
    } finally {
      setBusy(false);
    }
  }

  const buildCommands = Array.isArray(preview?.buildCommands)
    ? (preview?.buildCommands as string[])
    : [];
  const providers = Array.isArray(preview?.providers) ? (preview.providers as string[]) : [];
  const contentHash = typeof preview?.contentHash === "string" ? preview.contentHash : "";
  const labStepCount = typeof preview?.labStepCount === "number" ? preview.labStepCount : 0;

  function copyContentHash() {
    if (!contentHash) return;
    if (!navigator.clipboard?.writeText) {
      notify("error", "Could not copy content hash");
      return;
    }
    void navigator.clipboard.writeText(contentHash).then(
      () => notify("success", "Content hash copied"),
      () => notify("error", "Could not copy content hash"),
    );
  }

  return (
    <ToolSection title="Recipe Authoring (C1-C3)" icon={Wand2}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void runImportPreview("folder")} disabled={busy}>
          Import folder
        </Button>
        <Button onClick={() => void runImportPreview("zip")} disabled={busy}>
          Import zip
        </Button>
        <Button variant="outline" onClick={() => void doValidate()} disabled={busy}>
          Validate folder
        </Button>
        <Button variant="outline" onClick={() => void doScaffold()} disabled={busy}>
          Scaffold starter
        </Button>
      </div>
      {preview && (
        <div className="mt-3 space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Import trust review
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">
                {String(preview.name || preview.id || "Unnamed recipe")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {String(preview.id || "Unknown ID")} · v{String(preview.version || "?")} · {String(preview.kind || "Unknown kind")}
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {preview.confirmed ? "Copied" : "Preview only"}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Providers</dt>
              <dd className="font-medium text-foreground">{providers.join(", ") || "None declared"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lab steps</dt>
              <dd className="font-medium text-foreground">{labStepCount}</dd>
            </div>
          </dl>

          {buildCommands.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <ShieldAlert className="size-4" /> Runs on this machine
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground">
                {buildCommands.map((command) => (
                  <li key={command}><code className="break-all font-mono">{command}</code></li>
                ))}
              </ul>
            </div>
          ) : null}

          {contentHash ? (
            <div>
              <div className="text-xs text-muted-foreground">Content hash</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" title={contentHash}>
                  {contentHash.slice(0, 16)}…
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copyContentHash}>
                  <Copy aria-hidden /> Copy hash
                </Button>
              </div>
            </div>
          ) : null}

          {pendingImportPath ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={doImportConfirm} disabled={busy}>Accept import</Button>
              <Button variant="outline" onClick={doImportReject} disabled={busy}>Reject</Button>
            </div>
          ) : null}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Raw import payload</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </details>
        </div>
      )}
      {status && <p className="mt-2 text-xs text-muted-foreground break-all">{status}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        Validate checks manifest, lab semantics, and OpenTofu module coherence. Import supports folder or zip; accept
        writes under app data with a content-hash trust record. Git import is next.
      </p>
    </ToolSection>
  );
}

export default function DeveloperToolsView() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-normal">Developer Toolbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local scratch utilities for payloads, identifiers, and operational text.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Inputs stay in memory unless copied or exported.
        </div>
      </header>

      <Tabs defaultValue="json" className="space-y-3">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="json">
            <FileJson2 aria-hidden />
            JSON
          </TabsTrigger>
          <TabsTrigger value="text">
            <Code2 aria-hidden />
            Text
          </TabsTrigger>
          <TabsTrigger value="diff">
            <Diff aria-hidden />
            Diff
          </TabsTrigger>
          <TabsTrigger value="encoders">
            <Fingerprint aria-hidden />
            Encoders
          </TabsTrigger>
          <TabsTrigger value="cloud">
            <Clipboard aria-hidden />
            Cloud IDs
          </TabsTrigger>
          <TabsTrigger value="recipes">
            <Wand2 aria-hidden />
            Recipes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="json">
          <JsonWorkbench />
        </TabsContent>
        <TabsContent value="text">
          <TextWorkbench />
        </TabsContent>
        <TabsContent value="diff">
          <DiffWorkbench />
        </TabsContent>
        <TabsContent value="encoders">
          <EncoderWorkbench />
        </TabsContent>
        <TabsContent value="cloud">
          <CloudIdWorkbench />
        </TabsContent>
        <TabsContent value="recipes">
          <RecipeAuthoring />
        </TabsContent>
      </Tabs>
    </div>
  );
}
