# GitHub Repository Transfer — Personal Account → NCAR Organization

Moving `jeffdaskam-cyber/Cafe-Connection` to UCAR-owned GitHub.

This is the cheapest of the three moves this project faces and the one with the
fewest dependencies. It is a settings-page operation measured in minutes, it
moves no data, and it requires no code changes. Do it first.

---

## The destination — decided

**`NCAR`, the organization.** Not `jdaskam`, the work account. No lab- or
program-specific organization applies to this project, so the top-level NCAR org
is where it lands.

The rest of this section records why, because it is the one decision here that a
later step cannot correct cheaply.

The trap is assuming the organization and a member's account are close to the
same thing because the account belongs to the organization. They are not. Being
a member of NCAR grants you access to NCAR's repositories; it does not make your
repositories NCAR's. `github.com/jdaskam/Cafe-Connection` would be owned by you
as an individual, exactly as `jeffdaskam-cyber/Cafe-Connection` is today, with a
work-flavored username on it and nothing else changed.

| | `NCAR/Cafe-Connection` | `jdaskam/Cafe-Connection` |
|---|---|---|
| Owner of record | The institution | You, personally |
| If you leave UCAR | Stays, keeps running | Leaves with you |
| NCAR admin control | Org owners, teams, rulesets | None — they cannot see settings |
| Covered by org security policy | Yes | No |
| Access management | Teams and SSO | Hand-added collaborators |

The question underneath is not which GitHub page to click. It is whether this is
UCAR work product. It is: built for UCAR purposes, and the `noreply@ucar.edu`
sender, the `cafe-connection@ucar.edu` service mailbox, and the UCAR-branded
recap PDF all say so. Work product belonging to the institution goes to the
institution's GitHub presence, which is the organization.

The inverse would have held too. A genuinely personal side project should not go
into NCAR at all, because putting personal work in an institutional org muddies
ownership rather than clarifying it. That is not this project.

`LICENSE` currently reads `Copyright (c) 2026 Cafe Connection Contributors`,
which asserts neither. If UCAR owns the work, update that line as part of the
transfer rather than leaving it ambiguous in an institutional repository.

---

## Where this sits in the wider migration

Three ownership moves are in flight. They are far more independent than they
look:

| Move | Depends on | Blocks |
|---|---|---|
| **GitHub → NCAR** (this doc) | Nothing | Nothing |
| **Firebase → UCAR** ([MIGRATION.md](./MIGRATION.md)) | Nothing | `gmail.send` go-live |
| **Vercel → Azure** | Nothing structural | Nothing |

Nothing about the repository's location touches Firebase. There are no GitHub
Actions workflows in this project — deployment is Vercel-driven and every
Firebase credential is a host environment variable, not a repository secret. So
the transfer cannot break a deploy, because no deploy runs from GitHub.

Two consequences worth stating plainly, because both save work:

**Do not migrate the Vercel project to a UCAR-owned Vercel team.** Vercel is
being replaced by Azure. Moving it would be a migration performed on something
scheduled for decommissioning. Reconnect the existing Vercel project to the
transferred repository, let it carry production until the Azure cutover, then
retire it.

**The transfer does not unblock `gmail.send`.** That is gated on the Cloud
project landing inside the UCAR Google Workspace organization, which is what
makes the OAuth consent screen eligible for `Internal` and ends the 7-day
refresh-token expiry that `Testing` status imposes. It has nothing to do with
where the repository lives. See `scripts/test-gmail-send.mjs`.

---

## Before you start — questions for the NCAR GitHub admins

You will almost certainly need an org owner's involvement. GitHub requires that
you have permission to create repositories in the destination organization, and
an org with NCAR's repository count is unlikely to leave that open to all
members. Expect a ticket, and expect its turnaround to set your timeline.

Ask, in the same message:

1. Can I be granted repository-creation permission for the transfer, or should
   an owner receive the transfer instead?
2. Does NCAR enforce SAML SSO? (Determines whether tokens and OAuth apps need
   re-authorization afterward — see § Things that bite.)
3. Does the org restrict third-party GitHub App installation? The Vercel app
   must be installed on NCAR for the deployment connection to survive, and an
   Azure Static Web Apps deploy workflow will need Actions enabled under
   whatever org policy applies.
4. Any required repository conventions — visibility, license, `CODEOWNERS`,
   branch protection or org rulesets — that this repo should satisfy on arrival?

Destination is not among these questions: `NCAR` is settled, and no lab- or
program-specific org applies. Worth stating because it is the one answer that
has to be right the first time — see the name-retirement note below.

---

## What survives the transfer

Everything that makes the repository's history worth keeping:

- Issues and pull requests, with review history — this repo has ~178 merged PRs
- Commit history and contribution attribution
- Stars, watchers, wiki
- Webhooks, deploy keys, and repository secrets
- Redirects from the old URL, so existing clones and links keep working

That last one is a convenience, not a plan. Update remotes explicitly.

**Transfer; do not re-push.** Creating a fresh repository under NCAR and pushing
to it carries the commits and abandons everything else — every issue, every pull
request, every review thread. There is no way to recover them afterward.

## What needs re-establishing afterward

- **Vercel's Git connection.** The Vercel GitHub App is installed per account
  or organization. It is not installed on NCAR today, so the deployment link
  breaks at transfer and is restored by installing the app on the org (subject
  to question 3 above) and re-pointing the project at the new repository path.
- **Any other GitHub App**, on the same terms.
- **SSO authorization** for personal access tokens and OAuth apps, if NCAR
  enforces SAML.
- **Dependabot.** `.github/dependabot.yml` travels with the repository and keeps
  working, but alert and security-update behavior follows org configuration,
  which may differ from what you have now.
- **Branch protection and rulesets.** Repository rules transfer, but org-level
  rulesets layer on top and may add requirements — a required review, a signed
  commit, a status check that does not exist here. Verify what is actually
  enforced before assuming your merge flow is unchanged.

---

## Steps

1. **Get creation permission granted** on `NCAR`, or arrange for an owner to
   receive the transfer instead (§ questions above).
2. **Pick a quiet moment.** Open pull requests transfer intact, but a transfer
   mid-review is needless confusion. Nothing here requires a deploy freeze.
3. **Transfer** from `jeffdaskam-cyber` → Settings → General → Danger Zone →
   *Transfer ownership*. Destination `NCAR`. Go directly; do not route through
   `jdaskam` first — each hop repeats the integration cleanup below for no gain.
4. **Confirm your access on the far side.** You want Admin on the repository
   under NCAR, which is not automatic — org role and repository role are
   separate. Sort this immediately; it is awkward to discover later.
5. **Install and reconnect Vercel.** Install the Vercel GitHub App on NCAR,
   re-point the project at `NCAR/Cafe-Connection`, and confirm a push to `main`
   still produces a production deployment.
6. **Update local remotes** on every clone:
   ```bash
   git remote set-url origin https://github.com/NCAR/Cafe-Connection
   git remote -v
   ```
7. **Update references to the old path** — README badges, bookmarks, anything in
   UCAR documentation pointing at `jeffdaskam-cyber`.

---

## Post-transfer verification

- [ ] Repository loads at `github.com/NCAR/Cafe-Connection`
- [ ] Issue and pull request history is present, including review threads
- [ ] You hold Admin on the repository
- [ ] A push to a branch triggers a Vercel preview deployment
- [ ] A push to `main` produces a production deployment
- [ ] Production URL loads and login works — confirms nothing environmental
      moved with the repository
- [ ] Dependabot still opens pull requests (next weekly run, per
      `.github/dependabot.yml`)
- [ ] `git remote -v` updated on every working clone
- [ ] Old URL redirects to the new one

Note that `npm test` is irrelevant here. It covers pure helpers and would pass
identically before and after — a repository transfer cannot break it, and its
passing says nothing about whether the transfer succeeded.

---

## Things that bite

**Name retirement is permanent and undocumented until it happens.** If the
repository saw more than 100 clones or more than 100 GitHub Actions runs in the
week before the transfer, GitHub permanently retires the
`jeffdaskam-cyber/Cafe-Connection` owner-and-name combination. Nothing can be
created at that path afterward, by anyone. This is why the destination was
settled before the transfer rather than left to be corrected by a second one:
there is no undo, and a wrong first hop costs the original path permanently.

**Vercel silence is the likely failure mode.** Nothing errors when the GitHub
App is missing from the org. Pushes simply stop producing deployments, and
production continues serving the last successful build. Check for a deployment
after the first push rather than assuming green because the site is up.

**The transfer touches no secrets, which cuts both ways.** Repository secrets
travel, and the Vercel environment variables that actually run this application
were never in GitHub to begin with — so there is nothing to re-enter, and no
opportunity to discover a missing one. The environment-variable checklist in
[MIGRATION.md § B8](./MIGRATION.md) belongs to the Firebase move, not this one.

**Azure will introduce GitHub Actions to a repository that has none.** A Static
Web Apps deployment workflow means a deploy token in repository secrets and
Actions running under NCAR's org policy — permissions, allowed actions, possibly
required approvals. Worth confirming during question 3 rather than discovering
it while trying to ship a cutover.

---

## What this document does not cover

- **The Firebase / Google Cloud move** — see [MIGRATION.md](./MIGRATION.md),
  including the decision on whether the project must live inside UCAR's Cloud
  organization, which also gates `gmail.send`.
- **The Vercel → Azure migration.** Not written yet. Two constraints already
  known, both from `vercel.json`: functions proxied through Azure Static Web
  Apps time out at 45 seconds, which `api/catering.mjs` exceeds at
  `maxDuration: 300`; and SWA managed functions are HTTP-triggered only, so the
  nightly `reconcile` cron needs a real timer trigger in a separate Function
  App. Neither is a reason to delay this transfer.
