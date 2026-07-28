/**
 * Nightly reconciliation — pure work planning.
 *
 * Kept out of the handler so it can be unit tested without initializing the
 * Admin SDK (test/catering-recap.test.mjs).
 */

import { needsNotification, notificationTypeFor } from "./cateringNotify.mjs";
import { buildRevenueDoc } from "./cateringRevenue.mjs";

/**
 * Decide what an event still needs.
 *
 * The console fires notifications, rollups, and recaps optimistically and never
 * blocks a status change on them, so this is the backstop that picks up
 * anything that failed in the moment.
 *
 * @param event               the catering_events document
 * @param revenueDocExists    whether its event_revenue row is already present
 */
export function planWorkFor(event, revenueDocExists) {
  const work = [];

  if (needsNotification(event)) {
    work.push({ kind: "notify", type: notificationTypeFor(event) });
  }

  // Only plan a rollup for an event that would actually produce one — a
  // confirmed event with no amount yet is not a failure to retry.
  const built = buildRevenueDoc(event);
  if (built.ok && !revenueDocExists) work.push({ kind: "revenue" });

  if (event?.lifecycleStatus === "closed" && !event?.recapUrl) work.push({ kind: "recap" });

  return work;
}
