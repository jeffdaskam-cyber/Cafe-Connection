/**
 * emailLauncher — opens Gmail compose with pre-filled report email.
 * Purely client-side, no backend required.
 */

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

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(gmailUrl, '_blank');
}

/**
 * Opens Gmail compose with a pre-filled UCAR Cafe Connection invite email.
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

  const gmailUrl =
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(toEmail)}` +
    `&subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  window.open(gmailUrl, '_blank');
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

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.open(gmailUrl, '_blank');
}
