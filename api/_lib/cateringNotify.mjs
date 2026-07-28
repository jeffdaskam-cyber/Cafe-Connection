/**
 * Catering notifications — pure logic.
 *
 * Templates, recipient resolution, and transition detection, with no transport
 * and no Firestore, so all of it is unit tested (test/catering-notify.test.mjs).
 *
 * Sending is gated on the service mailbox holding the `gmail.send` OAuth scope
 * (see docs/catering/PHASES.md). Until that re-consent lands, the handler runs
 * the same code against a logging transport — so the templates, recipients, and
 * bookkeeping are all exercised and only the final hand-off is stubbed.
 */

export const NOTIFICATION_TYPES = {
  CREATED:   "created",
  UPDATED:   "updated",
  CONFIRMED: "confirmed",
  CLOSED:    "closed",
};

export const ALL_NOTIFICATION_TYPES = Object.values(NOTIFICATION_TYPES);

/**
 * The notification state an event is currently "at", used to detect drift.
 * Both status axes matter: confirming and later closing are separate events.
 */
export function notificationStateOf(event) {
  return `${event?.requestStatus ?? "unknown"}:${event?.lifecycleStatus ?? "unknown"}`;
}

/**
 * Which notification an event's current state warrants, or null when its state
 * needs no message (draft, cancelled).
 *
 * `closed` wins over `confirmed`: an event that was confirmed and then closed
 * should get the closing message, not a second confirmation.
 */
export function notificationTypeFor(event) {
  const request = event?.requestStatus;
  const lifecycle = event?.lifecycleStatus;

  if (request === "cancelled" || request === "draft") return null;
  if (request === "confirmed" && lifecycle === "closed") return NOTIFICATION_TYPES.CLOSED;
  if (request === "confirmed") return NOTIFICATION_TYPES.CONFIRMED;
  if (request === "submitted") return NOTIFICATION_TYPES.CREATED;
  return null;
}

/**
 * True when the event's current state has not yet been notified.
 * This is exactly the condition the nightly reconciliation sweeps for.
 */
export function needsNotification(event) {
  if (notificationTypeFor(event) === null) return false;
  return event?.lastNotifiedStatus !== notificationStateOf(event);
}

/**
 * Recipients for a notification type.
 *
 * @param opsInbox  the catering ops distribution address, or null when it has
 *                  not been configured yet — the planner still gets their copy.
 */
export function recipientsFor(type, event, opsInbox = null) {
  const planner = String(event?.plannerEmail ?? "").trim();
  const onsite = String(event?.onsiteContactEmail ?? "").trim();

  const to = [];
  if (planner) to.push(planner);
  // The on-site contact is who actually runs the day, so they get the
  // confirmation and closing messages too — but not the noisier edit pings.
  if (onsite && onsite !== planner &&
      [NOTIFICATION_TYPES.CONFIRMED, NOTIFICATION_TYPES.CLOSED].includes(type)) {
    to.push(onsite);
  }

  const cc = [];
  // Ops only need the inbound copy — they act on it in the console after that.
  if (type === NOTIFICATION_TYPES.CREATED && opsInbox) cc.push(opsInbox);

  return { to, cc };
}

function formatDateRange(event) {
  const start = event?.startDate || "";
  const end = event?.endDate || "";
  if (!start) return "dates to be confirmed";
  if (!end || end === start) return start;
  return `${start} – ${end}`;
}

function line(label, value) {
  return value ? `${label}: ${value}` : null;
}

/**
 * Render the subject and plain-text body for a notification.
 *
 * Plain text on purpose: it renders identically everywhere, cannot leak layout
 * bugs into someone's inbox, and keeps the Gmail payload trivial to inspect.
 */
export function renderNotification(type, event, { recapUrl = null, appUrl = null } = {}) {
  const name = event?.eventName || "Untitled event";
  const when = formatDateRange(event);
  const room = event?.primaryRoomId || event?.buildingId || "";
  const guests = event?.expectedAttendance ?? null;

  const facts = [
    line("Event", name),
    line("Dates", when),
    line("Location", room),
    line("Expected attendance", guests != null ? String(guests) : ""),
    line("Planner", event?.plannerName || ""),
  ].filter(Boolean).join("\n");

  const link = appUrl ? `\n\nView your request: ${appUrl}` : "";

  const templates = {
    [NOTIFICATION_TYPES.CREATED]: {
      subject: `Catering request received — ${name}`,
      body:
        `Thanks — UCAR Event Services have received your catering request.\n\n` +
        `${facts}\n\n` +
        `Nothing is confirmed yet. You can keep editing the request until our ` +
        `team confirms it, and we'll email you when they do.${link}`,
    },
    [NOTIFICATION_TYPES.UPDATED]: {
      subject: `Catering request updated — ${name}`,
      body:
        `UCAR Event Services have updated the details of your catering request.\n\n` +
        `${facts}\n\n` +
        `Please review the current details and reply to this message if anything ` +
        `looks wrong.${link}`,
    },
    [NOTIFICATION_TYPES.CONFIRMED]: {
      subject: `Catering confirmed — ${name}`,
      body:
        `Your catering request is confirmed.\n\n` +
        `${facts}\n\n` +
        `The request can no longer be edited directly. For changes from here, ` +
        `reply to this message and Event Services will take care of it.${link}`,
    },
    [NOTIFICATION_TYPES.CLOSED]: {
      subject: `Catering wrapped up — ${name}`,
      body:
        `Your event is closed out. Thanks for working with UCAR Event Services.\n\n` +
        `${facts}\n\n` +
        (recapUrl
          ? `Event recap (PDF): ${recapUrl}\n\n`
          : `An event recap will follow separately.\n\n`) +
        `If anything in the recap looks wrong, reply to this message.`,
    },
  };

  const template = templates[type];
  if (!template) throw new Error(`Unknown notification type: ${type}`);
  return template;
}

/** RFC 2822 message, base64url-encoded the way the Gmail API expects. */
export function buildRawMessage({ from, to, cc = [], subject, body }) {
  if (!to?.length) throw new Error("A notification needs at least one recipient.");

  const headers = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ].filter(Boolean);

  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
