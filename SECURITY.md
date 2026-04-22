# Security Policy

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities.

Report security concerns privately to your project maintainers and include:
- affected component/path
- reproduction steps
- impact assessment
- suggested mitigation (if available)

## Secrets Handling

- Never commit credentials to this repository.
- Use environment variables and your deployment secret manager.
- Rotate any credential immediately if exposure is suspected.

## Hardening Expectations

- Enforce least-privilege Firestore/Storage rules.
- Require server-side authorization checks for privileged API routes.
- Keep dependencies updated and monitor alerts.
