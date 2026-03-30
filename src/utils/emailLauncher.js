/**
 * emailLauncher — opens Gmail compose with pre-filled report email.
 * Purely client-side, no backend required.
 */

/**
 * @param {string} reportType - e.g., "Staff Schedule", "Set Up Report", "Event Report"
 * @param {string} campus     - e.g., "Center Green", "Foothills", "Mesa Lab"
 * @param {string} weekLabel  - e.g., "Week of March 31, 2026"
 * @param {string} reportLink - URL to Google Drive file or app page
 */
export function launchEmailComposer(reportType, campus, weekLabel, reportLink) {
  const subject = `${reportType} — ${campus} — ${weekLabel}`;

  const body = [
    'Hi,',
    '',
    `Please find the ${reportType} for ${campus} for the ${weekLabel} below:`,
    '',
    reportLink,
    '',
    'Thank you,',
    'Café Connection',
  ].join('\n');

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.open(gmailUrl, '_blank');
}
