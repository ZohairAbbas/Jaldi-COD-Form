import prisma from "../db.server.js";

/**
 * Cron job status values written to CronLog.
 *
 * PARTIAL is the one that was missing. Jobs iterate over many shops and a
 * failure in one does not throw — it is counted and the loop continues, so the
 * run reaches the end and used to be recorded as COMPLETED regardless. That
 * produced 78,322 "completed" rows carrying 3.5M errors between them, and not a
 * single FAILED row, while three separate jobs were broken for months.
 */
export const CRON_STATUS = {
  STARTED: "started",
  COMPLETED: "completed",
  PARTIAL: "completed_with_errors",
  FAILED: "failed",
};

/**
 * Every scheduled job, with how stale its last run may be before it counts as
 * overdue. Keep in step with the schedules in cron-worker.cjs — the grace is
 * roughly double the interval, so one missed tick does not raise noise.
 */
export const CRON_JOBS = [
  { key: "abandonedCartsDetection", jobName: "abandoned-carts-detection", label: "Abandoned carts", maxAgeMinutes: 15 },
  { key: "draftOrdersCreation", jobName: "draft-orders-creation", label: "Draft orders", maxAgeMinutes: 90 },
  { key: "fulfillmentSync", jobName: "fulfillment-sync", label: "Fulfillment sync", maxAgeMinutes: 240 },
  { key: "googleSheetsSync", jobName: "google-sheets-sync", label: "Google Sheets sync", maxAgeMinutes: 10 },
  { key: "courierifySync", jobName: "courierify-sync", label: "Courierify sync", maxAgeMinutes: 1800 },
];

/**
 * How many consecutive error-carrying runs before a job is called failing
 * rather than merely having had one bad run.
 */
export const CONSECUTIVE_ERROR_THRESHOLD = 3;

/**
 * Health of every scheduled job.
 *
 * Answers two separate questions, because a job can fail either way:
 *   1. Is it still running?         → recency against maxAgeMinutes
 *   2. Is it doing anything useful? → error counts on its recent runs
 *
 * Asking only the first is how this went unnoticed: a broken job that still
 * runs on schedule looks perfectly healthy by recency alone.
 */
export async function getCronHealth() {
  const now = Date.now();
  const jobs = {};
  const problems = [];

  for (const { key, jobName, label, maxAgeMinutes } of CRON_JOBS) {
    // Per-job query, so a job logging every 2 minutes cannot crowd a 3-hourly
    // one out of the window.
    const recent = await prisma.cronLog.findMany({
      where: { jobName, status: { not: CRON_STATUS.STARTED } },
      orderBy: { createdAt: "desc" },
      take: CONSECUTIVE_ERROR_THRESHOLD,
    });

    const last = recent[0] || null;
    const ageMinutes = last
      ? Math.round((now - new Date(last.createdAt).getTime()) / 60000)
      : null;

    const overdue = !last || ageMinutes > maxAgeMinutes;

    let consecutiveErrorRuns = 0;
    for (const run of recent) {
      if (run.status === CRON_STATUS.FAILED || run.errors > 0) consecutiveErrorRuns++;
      else break;
    }
    const failing = consecutiveErrorRuns >= CONSECUTIVE_ERROR_THRESHOLD;

    if (overdue) problems.push(`${jobName} is overdue (last run ${ageMinutes ?? "never"} min ago)`);
    if (failing) problems.push(`${jobName} has errored on its last ${consecutiveErrorRuns} runs`);

    jobs[key] = {
      jobName,
      label,
      healthy: !overdue && !failing,
      overdue,
      failing,
      lastRun: last?.createdAt || null,
      lastStatus: last?.status || "never_run",
      lastMessage: last?.message || null,
      lastProcessed: last?.processed || 0,
      lastErrors: last?.errors || 0,
      ageMinutes,
      maxAgeMinutes,
      consecutiveErrorRuns,
    };
  }

  const healthy = Object.values(jobs).every((j) => j.healthy);
  return { status: healthy ? "healthy" : "degraded", healthy, problems, jobs };
}
