// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useEffect, useState } from "react";

import {
  getLabSession,
  resetLabSession,
  runLabAction,
  startLabSession,
  subscribeToBackendEvent,
  verifyLabStep,
} from "@/lib/backend";
import type { LabSession, LabSpec, LabStepAction } from "@/types/backend";

export function useLabSession(deploymentId: string, labSpec?: LabSpec) {
  const [session, setSession] = useState<LabSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(labSpec?.steps[0]?.id ?? null);

  const refresh = useCallback(async () => {
    try {
      const next = await getLabSession(deploymentId);
      setSession(next);
      setActiveStepId((current) => {
        if (current) {
          return current;
        }
        const inProgress = next.steps.find((step) => step.status === "in_progress");
        const pending = next.steps.find((step) => step.status === "pending");
        return inProgress?.stepId ?? pending?.stepId ?? next.steps[0]?.stepId ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [deploymentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = subscribeToBackendEvent("lab.changed", (payload) => {
      if (payload.deploymentId === deploymentId) {
        setSession(payload);
      }
    });
    return () => {
      void unsub.then((fn) => fn());
    };
  }, [deploymentId]);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const next = await startLabSession(deploymentId);
      setSession(next);
      setActiveStepId(next.steps.find((step) => step.status === "in_progress")?.stepId ?? next.steps[0]?.stepId ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  const verifyStep = useCallback(
    async (stepId: string) => {
      setLoading(true);
      try {
        const next = await verifyLabStep(deploymentId, stepId);
        setSession(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [deploymentId],
  );

  const runAction = useCallback(
    async (stepId: string, action: LabStepAction, actionIndex?: number) => {
      setLoading(true);
      try {
        const result = await runLabAction(deploymentId, stepId, action, actionIndex);
        setSession(result.session);
        setError(null);
        return result.action;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [deploymentId],
  );

  const reset = useCallback(async () => {
    setLoading(true);
    try {
      const next = await resetLabSession(deploymentId);
      setSession(next);
      setActiveStepId(next.steps[0]?.stepId ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  return {
    session,
    loading,
    error,
    activeStepId,
    setActiveStepId,
    start,
    verifyStep,
    runAction,
    reset,
    refresh,
  };
}