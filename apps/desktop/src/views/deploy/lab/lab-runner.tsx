// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  CheckCircle2,
  Circle,
  CircleDashed,
  ExternalLink,
  FlaskConical,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLabSession } from "@/hooks/use-lab-session";
import { openTabActionToParams, type NavigateToResourceParams } from "@/lib/navigate-to-resource";
import { cn } from "@/lib/utils";
import type {
  Deployment,
  LabActionInvokeWrite,
  LabActionOpenTab,
  LabSpec,
  LabStepAction,
  LabStepSession,
  LabStepSpec,
} from "@/types/backend";

function stepStatusIcon(status: LabStepSession["status"]) {
  if (status === "passed") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="size-4 text-destructive" />;
  if (status === "in_progress") return <CircleDashed className="size-4 text-sky-500" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

function isOpenTabAction(action: LabStepAction): action is LabActionOpenTab {
  return action.type === "open-tab";
}

function isInvokeWriteAction(action: LabStepAction): action is LabActionInvokeWrite {
  return action.type === "invoke-write";
}

function actionLabel(action: LabStepAction): string {
  if (isOpenTabAction(action)) {
    return `Open ${action.tab.replace(/^aws-|^azure-/, "")} tab`;
  }
  if (isInvokeWriteAction(action)) {
    return action.op.replaceAll(".", " ");
  }
  return action.type;
}

export function LabRunner({
  deployment,
  labSpec,
  providerId,
  navigateToResource,
}: {
  deployment: Deployment;
  labSpec: LabSpec;
  providerId: "aws" | "azure";
  navigateToResource?: (params: NavigateToResourceParams) => void;
}) {
  const {
    session,
    loading,
    error,
    activeStepId,
    setActiveStepId,
    start,
    verifyStep,
    runAction,
    reset,
  } = useLabSession(deployment.id, labSpec);

  const activeStep =
    labSpec.steps.find((step) => step.id === activeStepId) ?? labSpec.steps[0] ?? null;
  const activeStepSession = session?.steps.find((step) => step.stepId === activeStep?.id);

  async function handleAction(step: LabStepSpec, action: LabStepAction, actionIndex: number) {
    const returned = await runAction(step.id, action, actionIndex);
    const openTab = returned && isOpenTabAction(returned) ? returned : isOpenTabAction(action) ? action : null;
    if (openTab && navigateToResource) {
      navigateToResource(openTabActionToParams(providerId, openTab.tab, openTab.focus));
    }
  }

  if (!session || session.status === "not_started") {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <SectionHeader
          title="Guided lab"
          description="Work through step-by-step instructions and verify your progress against the deployed resources."
          action={
            <Button onClick={() => void start()} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
              Start lab
            </Button>
          }
        />
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {labSpec.objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <SectionHeader
          title="Guided lab"
          description={
            session.status === "completed"
              ? "Lab complete — well done."
              : "Follow each step, run actions, then check your work."
          }
        />
        <Button variant="outline" size="sm" onClick={() => void reset()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          Reset lab
        </Button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <ol className="flex flex-col">
            {labSpec.steps.map((step, index) => {
              const stepSession = session.steps.find((entry) => entry.stepId === step.id);
              const isActive = step.id === activeStep?.id;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                      isActive && "bg-accent",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{stepStatusIcon(stepSession?.status ?? "pending")}</span>
                    <span>
                      <span className="block text-xs text-muted-foreground">Step {index + 1}</span>
                      <span className="text-sm font-medium text-foreground">{step.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex flex-col gap-4 p-5">
          {activeStep ? (
            <>
              <div>
                <h3 className="text-base font-semibold text-foreground">{activeStep.title}</h3>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
                  {activeStep.body}
                </pre>
              </div>

              {activeStep.hints && activeStep.hints.length > 0 && (
                <details className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium text-foreground">Hints</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {activeStep.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </details>
              )}

              {activeStep.actions && activeStep.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeStep.actions.map((action, index) => (
                    <Button
                      key={`${activeStep.id}-${action.type}-${index}`}
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => void handleAction(activeStep, action, index)}
                    >
                      {isOpenTabAction(action) ? <ExternalLink className="size-4" /> : null}
                      {actionLabel(action)}
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={() => void verifyStep(activeStep.id)} disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  { (activeStep.verify ?? []).length > 0 ? "Check my work" : "Mark complete" }
                </Button>
              </div>

              {activeStepSession && (activeStepSession.verifyResults ?? []).length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="mb-2 text-sm font-medium text-foreground">Verification results</p>
                  <ul className="space-y-2">
                    {(activeStepSession.verifyResults ?? []).map((result, index) => (
                      <li
                        key={`${result.type}-${index}`}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm",
                          result.passed
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        <span className="font-medium">{result.type}</span>
                        <span className="block text-xs opacity-90">{result.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a step to begin.</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </Card>
  );
}