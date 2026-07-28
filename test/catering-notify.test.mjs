import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL_NOTIFICATION_TYPES, buildRawMessage, needsNotification, notificationStateOf,
  notificationTypeFor, recipientsFor, renderNotification,
} from "../api/_lib/cateringNotify.mjs";

function evt(overrides = {}) {
  return {
    id: "evt1",
    eventName: "CESM Workshop",
    requestStatus: "submitted",
    lifecycleStatus: "open",
    startDate: "2026-09-14",
    endDate: "2026-09-15",
    primaryRoomId: "CG1-2122",
    expectedAttendance: 40,
    plannerName: "Ada Lovelace",
    plannerEmail: "ada@ucar.edu",
    ...overrides,
  };
}

// ── Transition detection ─────────────────────────────────────────────────────

test("each status combination maps to the right notification", () => {
  assert.equal(notificationTypeFor(evt({ requestStatus: "submitted" })), "created");
  assert.equal(notificationTypeFor(evt({ requestStatus: "confirmed" })), "confirmed");
  assert.equal(
    notificationTypeFor(evt({ requestStatus: "confirmed", lifecycleStatus: "closed" })),
    "closed",
    "a closed event gets the closing message, not a second confirmation"
  );
});

test("draft and cancelled events are not notified", () => {
  assert.equal(notificationTypeFor(evt({ requestStatus: "draft" })), null);
  assert.equal(notificationTypeFor(evt({ requestStatus: "cancelled" })), null);
  assert.equal(needsNotification(evt({ requestStatus: "cancelled" })), false);
});

test("all four plan notification types are covered", () => {
  assert.deepEqual(ALL_NOTIFICATION_TYPES, ["created", "updated", "confirmed", "closed"]);
});

test("notification state spans both status axes", () => {
  assert.equal(notificationStateOf(evt()), "submitted:open");
  assert.equal(
    notificationStateOf(evt({ requestStatus: "confirmed", lifecycleStatus: "closed" })),
    "confirmed:closed"
  );
});

test("an event is due a notification until its current state has been sent", () => {
  const event = evt({ requestStatus: "confirmed" });
  assert.equal(needsNotification(event), true);
  assert.equal(needsNotification({ ...event, lastNotifiedStatus: "confirmed:open" }), false);
});

test("confirming an already-notified submitted event makes it due again", () => {
  // This is exactly the drift the nightly sweep exists to catch.
  const submittedAndNotified = evt({ lastNotifiedStatus: "submitted:open" });
  assert.equal(needsNotification(submittedAndNotified), false);

  const nowConfirmed = { ...submittedAndNotified, requestStatus: "confirmed" };
  assert.equal(needsNotification(nowConfirmed), true);
});

// ── Recipients ───────────────────────────────────────────────────────────────

test("the planner is always the primary recipient", () => {
  for (const type of ALL_NOTIFICATION_TYPES) {
    assert.deepEqual(recipientsFor(type, evt()).to, ["ada@ucar.edu"]);
  }
});

test("ops are cc'd only on newly created requests", () => {
  const ops = "catering-ops@ucar.edu";
  assert.deepEqual(recipientsFor("created", evt(), ops).cc, [ops]);
  for (const type of ["updated", "confirmed", "closed"]) {
    assert.deepEqual(recipientsFor(type, evt(), ops).cc, [], `${type} must not cc ops`);
  }
});

test("a missing ops inbox does not stop the planner's copy", () => {
  const result = recipientsFor("created", evt(), null);
  assert.deepEqual(result.to, ["ada@ucar.edu"]);
  assert.deepEqual(result.cc, []);
});

test("the on-site contact is added for confirmed and closed only", () => {
  const event = evt({ onsiteContactEmail: "grace@ucar.edu" });
  assert.deepEqual(recipientsFor("confirmed", event).to, ["ada@ucar.edu", "grace@ucar.edu"]);
  assert.deepEqual(recipientsFor("closed", event).to, ["ada@ucar.edu", "grace@ucar.edu"]);
  assert.deepEqual(recipientsFor("created", event).to, ["ada@ucar.edu"]);
});

test("an on-site contact who is the planner is not duplicated", () => {
  const event = evt({ onsiteContactEmail: "ada@ucar.edu" });
  assert.deepEqual(recipientsFor("confirmed", event).to, ["ada@ucar.edu"]);
});

test("an event with no planner email yields no recipients", () => {
  assert.deepEqual(recipientsFor("created", evt({ plannerEmail: "" })).to, []);
});

// ── Templates ────────────────────────────────────────────────────────────────

test("every type renders a subject and body naming the event", () => {
  for (const type of ALL_NOTIFICATION_TYPES) {
    const { subject, body } = renderNotification(type, evt());
    assert.ok(subject.includes("CESM Workshop"), `${type} subject`);
    assert.ok(body.includes("CESM Workshop"), `${type} body`);
    assert.ok(body.includes("2026-09-14 – 2026-09-15"), `${type} dates`);
    assert.ok(body.includes("CG1-2122"), `${type} location`);
  }
});

test("an unknown type is rejected rather than silently rendered", () => {
  assert.throws(() => renderNotification("exploded", evt()), /Unknown notification type/);
});

test("a single-day event does not render a date range", () => {
  const { body } = renderNotification("created", evt({ endDate: "2026-09-14" }));
  assert.ok(body.includes("Dates: 2026-09-14"));
  assert.ok(!body.includes("–"));
});

test("the created message makes clear nothing is confirmed yet", () => {
  const { body } = renderNotification("created", evt());
  assert.match(body, /Nothing is confirmed yet/);
});

test("the confirmed message explains the edit lock", () => {
  const { body } = renderNotification("confirmed", evt({ requestStatus: "confirmed" }));
  assert.match(body, /no longer be edited/);
});

test("the closing message links the recap when there is one", () => {
  const closed = evt({ requestStatus: "confirmed", lifecycleStatus: "closed" });
  const withRecap = renderNotification("closed", closed, { recapUrl: "https://example.com/r.pdf" });
  assert.ok(withRecap.body.includes("https://example.com/r.pdf"));

  const without = renderNotification("closed", closed);
  assert.match(without.body, /recap will follow separately/);
});

test("a request link is included only when an app URL is configured", () => {
  assert.ok(renderNotification("created", evt(), { appUrl: "https://app.example" })
    .body.includes("https://app.example"));
  assert.ok(!renderNotification("created", evt()).body.includes("View your request"));
});

test("missing dates degrade to a readable phrase rather than blank", () => {
  const { body } = renderNotification("created", evt({ startDate: "", endDate: "" }));
  assert.match(body, /dates to be confirmed/);
});

// ── Raw message ──────────────────────────────────────────────────────────────

function decode(raw) {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

test("the raw message carries the expected headers", () => {
  const decoded = decode(buildRawMessage({
    from: "UCAR Event Services <noreply@ucar.edu>",
    to: ["ada@ucar.edu"], cc: ["ops@ucar.edu"],
    subject: "Catering confirmed — CESM Workshop",
    body: "Body text.",
  }));
  assert.match(decoded, /^From: UCAR Event Services <noreply@ucar\.edu>/m);
  assert.match(decoded, /^To: ada@ucar\.edu/m);
  assert.match(decoded, /^Cc: ops@ucar\.edu/m);
  assert.match(decoded, /^Subject: Catering confirmed — CESM Workshop/m);
  assert.match(decoded, /charset="UTF-8"/);
  assert.ok(decoded.endsWith("Body text."));
});

test("the Cc header is omitted when there is no cc", () => {
  const decoded = decode(buildRawMessage({
    from: "a@b.c", to: ["d@e.f"], subject: "s", body: "b",
  }));
  assert.ok(!decoded.includes("Cc:"));
});

test("the encoding is base64url, as the Gmail API requires", () => {
  const raw = buildRawMessage({ from: "a@b.c", to: ["d@e.f"], subject: "s", body: "b".repeat(200) });
  assert.ok(!/[+/=]/.test(raw), "must not contain +, / or = padding");
});

test("sending with no recipients is refused", () => {
  assert.throws(
    () => buildRawMessage({ from: "a@b.c", to: [], subject: "s", body: "b" }),
    /at least one recipient/
  );
});
