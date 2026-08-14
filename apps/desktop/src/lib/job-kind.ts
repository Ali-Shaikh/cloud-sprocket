// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { JobStatus } from "@/types/backend";

export const JOB_KIND_DISCOVERY_REFRESH = "discovery.refresh";
export const JOB_KIND_EC2_ACTION = "aws.ec2.action";
export const JOB_KIND_S3_PRESIGN = "aws.s3.presign";

type JobRef = Pick<JobStatus, "kind" | "label" | "jobId">;

/** True when this job is a discovery refresh (kind first, then label/id fallback). */
export function isDiscoveryRefreshJob(job: JobRef, trackedJobId?: string): boolean {
  if (job.kind) return job.kind === JOB_KIND_DISCOVERY_REFRESH;
  if (trackedJobId && job.jobId === trackedJobId) return true;
  return job.label === "Refresh Discovery";
}

/** True when this job drives the EC2 action chrome. */
export function isEC2ActionJob(job: Pick<JobStatus, "kind" | "label">): boolean {
  if (job.kind) return job.kind === JOB_KIND_EC2_ACTION;
  return job.label.toLowerCase().includes("ec2");
}

/** True when this job drives the S3 signed-URL status line. */
export function isS3PresignJob(job: Pick<JobStatus, "kind" | "label">): boolean {
  if (job.kind) return job.kind === JOB_KIND_S3_PRESIGN;
  return job.label.toLowerCase().includes("signed url");
}
