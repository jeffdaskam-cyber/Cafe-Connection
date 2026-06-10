/**
 * emailLauncher — opens an email compose window with a pre-filled report email.
 * Purely client-side, no backend required.
 */

/**
 * EMAIL CLIENT CONFIGURATION
 *
 * Set VITE_EMAIL_CLIENT in your environment to control the compose URL format:
 *   'gmail'   — Gmail web compose (default; current behavior)
 *   'outlook' — Outlook Web compose (use after UCAR migration if org is on M365)
 *   'mailto'  — Native mail client fallback
 *
 * To switch post-migration: update VITE_EMAIL_CLIENT in the deployment env vars.
 * No code changes required.
 *
 * NOTE: All compose is client-side only. The user manually sends in their browser.
 * Programmatic send (e.g., Gmail API / SendGrid) is a separate future feature.
 */

const CLIENT_TYPE = import.meta.env.VITE_EMAIL_CLIENT || 'gmail';

function buildComposeUrl({ to, subject, body }, clientType = CLIENT_TYPE) {
  switch (clientType) {
    case 'outlook': {
      // Outlook Web compose deep link
      const params = new URLSearchParams();
      if (to) params.set('to', to);
      if (subject) params.set('subject', subject);
      if (body) params.set('body', body);
      return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
    }

    case 'mailto': {
      const params = new URLSearchParams();
      if (subject) params.set('subject', subject);
      if (body) params.set('body', body);
      const toPrefix = to ? encodeURIComponent(to) : '';
      return `mailto:${toPrefix}?${params.toString()}`;
    }

    case 'gmail':
    default: {
      // Gmail web compose URL — preserve exact pre-refactor behavior
      let url = `https://mail.google.com/mail/?view=cm&fs=1`;
      if (to) url += `&to=${encodeURIComponent(to)}`;
      if (subject) url += `&su=${encodeURIComponent(subject)}`;
      if (body) url += `&body=${encodeURIComponent(body)}`;
      return url;
    }
  }
}

/**
 * @param {string} monthName - e.g., "March"
 * @param {number} year      - e.g., 2026
 */
export function launchAccountingEmail(monthName, year) {
  const subject = `Cafe Month-End Sales Report — ${monthName} ${year}`;

  const body = [
    'Good afternoon,',
    '',
    `Please find attached the Cafe Month-End Sales report for ${monthName} ${year}.`,
    '',
    'Please let me know if you have any questions.',
    '',
    'Thanks,',
  ].join('\n');

  window.open(buildComposeUrl({ subject, body }), '_blank');
}

/**
 * Opens a compose window with a pre-filled UCAR Cafe Connection invite email.
 *
 * @param {string} toEmail - The invited user's email address
 * @param {string} link    - The Firebase magic-link sign-in URL
 */
export function launchInviteEmail(toEmail, link) {
  const subject = "You've been invited to UCAR Cafe Connection";

  const body = [
    'Hi,',
    '',
    "You've been invited to access UCAR Cafe Connection.",
    '',
    'Click the link below to sign in. This link expires in 24 hours.',
    '',
    link,
    '',
    'If you have any questions, contact your administrator.',
  ].join('\n');

  window.open(buildComposeUrl({ to: toEmail, subject, body }), '_blank');
}

/**
 * @param {string} reportType - e.g., "Staff Schedule", "Set Up Report", "Event Report"
 * @param {string} campus     - e.g., "Center Green", "Foothills", "Mesa Lab"
 * @param {string} weekLabel  - e.g., "Week of March 31, 2026"
 * @param {string} reportLink - URL to Google Drive file or app page
 */
export function launchEmailComposer(reportType, campus, weekLabel, reportLink) {
  const subject = `${reportType} — ${campus} — ${weekLabel}`;

  const body = [
    'Hello,',
    '',
    `Please find the ${reportType} for the ${weekLabel} below:`,
    '',
    reportLink,
    '',
    'Please let us know if you have any questions.',
    '',
    'Thank you,',
    'Event Services Team',
  ].join('\n');

  window.open(buildComposeUrl({ subject, body }), '_blank');
}
