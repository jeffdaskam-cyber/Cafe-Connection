# Cafe Connection

Cafe Connection is a React + Vite web application with Vercel serverless APIs and Firebase (Auth, Firestore, Storage).

## Public Repository Notes

This repository intentionally excludes internal business documentation and private operational data.

## Tech Stack

- React 18 + Vite
- Firebase (Auth, Firestore, Storage)
- Vercel Serverless Functions

## Local Development

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in required environment variables in `.env.local`.
4. Start dev server:
   ```bash
   npm run dev
   ```

## Quality Checks

```bash
npm run lint
npm test
```

## Ownership Migration

To move this repository to UCAR-owned GitHub, see
[GITHUB_TRANSFER.md](./GITHUB_TRANSFER.md).

To move the Firebase project between Google accounts (e.g. personal → work), see
[MIGRATION.md](./MIGRATION.md).

## Security

- Do not commit real secrets (`.env`, service-account keys, OAuth tokens).
- Configure production secrets in your deployment platform.
- Review Firestore and Storage rules before each release.

## License

See [LICENSE](./LICENSE).
