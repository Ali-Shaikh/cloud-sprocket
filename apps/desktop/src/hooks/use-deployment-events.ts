// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useState } from "react";

import {
  appendDeploymentLogLine,
  clearDeploymentLogs,
  type DeploymentLogMap,
} from "@/lib/deploy-log-state";
import { subscribeToBackendEvent } from "@/lib/backend";
import type { Deployment } from "@/types/backend";

export function useDeploymentEvents() {
  const [active, setActive] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<DeploymentLogMap>({});

  useEffect(() => {
    const unsubChanged = subscribeToBackendEvent("deployment.changed", (deployment) => {
      setActive((current) => (current && current.id === deployment.id ? deployment : current));
    });
    const unsubLog = subscribeToBackendEvent("deployment.log", (event) => {
      setLogs((current) => appendDeploymentLogLine(current, event.deploymentId, event.line));
    });
    return () => {
      void unsubChanged.then((fn) => fn());
      void unsubLog.then((fn) => fn());
    };
  }, []);

  function resetLogsForDeployment(deploymentId: string): void {
    setLogs((current) => clearDeploymentLogs(current, deploymentId));
  }

  return {
    active,
    setActive,
    logs,
    setLogs,
    resetLogsForDeployment,
  };
}