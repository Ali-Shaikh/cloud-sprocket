import { toast } from "sonner";

import type { JobStatus } from "@/types/backend";

export type NotificationTone = "success" | "error" | "warning" | "info" | "in-progress";

/**
 * Fires a toast for a one-off notification. Success and info toasts
 * auto-dismiss; errors and warnings stay longer so they are not missed.
 * (The fuller notification model - dedupe, history, persistent banners -
 * lands in M9.)
 */
export function notify(tone: NotificationTone, title: string, description?: string): void {
  switch (tone) {
    case "success":
      toast.success(title, { description });
      break;
    case "error":
      toast.error(title, { description, duration: 10000 });
      break;
    case "warning":
      toast.warning(title, { description, duration: 8000 });
      break;
    case "in-progress":
      toast.loading(title, { description });
      break;
    default:
      toast.info(title, { description });
  }
}

/**
 * Mirrors a backend job into a single toast keyed by the job id: it shows a
 * spinner while queued or running, then resolves to success or error in
 * place instead of stacking a new toast per update.
 */
export function notifyJob(job: JobStatus): void {
  const options = { id: job.jobId, description: job.message };
  if (job.status === "failed") {
    toast.error(job.label, { ...options, duration: 10000 });
  } else if (job.status === "completed") {
    toast.success(job.label, options);
  } else {
    toast.loading(job.label, options);
  }
}
