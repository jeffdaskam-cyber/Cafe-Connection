#!/usr/bin/env node
/**
 * Grant a Firebase user a Cafe Connection role, by email.
 *
 * Standing up a dev/UAT project leaves you locked out of the staff side: the
 * Catering tab needs manager-or-above, requesters self-provision but staff do
 * not, and there is no administrator yet to invite you. The manual fix is to
 * hand-write a user_roles document — which must be keyed by the Firebase
 * **UID**, not the email, and silently does nothing if you key it wrong.
 *
 * Usage (after signing in to the target project at least once, so the Auth
 * user exists):
 *
 *   export FIREBASE_ADMIN_PROJECT_ID=<project-id>
 *   export FIREBASE_ADMIN_CLIENT_EMAIL=<service-account-email>
 *   export FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
 *   export CATERING_ALLOW_PRODUCTION_WRITE=true      # any live project
 *
 *   node scripts/grantCateringRole.mjs you@ucar.edu administrator
 *
 * Against the emulator instead, no credentials are needed:
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   node scripts/grantCateringRole.mjs you@ucar.edu administrator
 *
 * Writes the same document shape AuthContext writes, so the app cannot tell
 * the difference between a role granted here and one granted through an invite.
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { assertWriteAllowed, initAdmin } from "./lib/cateringAdmin.mjs";

// Mirrors ALL_ROLES in src/utils/permissions.js. `requester` is included
// deliberately: it is a sibling of the staff ladder, not a rung on it, and is
// occasionally useful to assign by hand when testing the requester side with a
// second account.
const VALID_ROLES = ["user", "manager", "senior_leader", "administrator", "requester"];

function usage(message) {
  console.error(
    `${message}\n\n` +
      "Usage: node scripts/grantCateringRole.mjs [--sandbox] <email> <role>\n" +
      `Roles: ${VALID_ROLES.join(", ")}\n\n` +
      "  --sandbox  Target the local emulators started by `npm run sandbox`.\n" +
      "             Equivalent to setting FIRESTORE_EMULATOR_HOST and\n" +
      "             FIREBASE_AUTH_EMULATOR_HOST yourself, without needing the\n" +
      "             right shell syntax for your platform.\n"
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  // Setting two env vars needs `set` on cmd.exe, `$env:` in PowerShell, and a
  // prefix assignment in bash — three ways to get it wrong before the useful
  // work starts. The emulator ports are fixed in firebase.json, so the script
  // can just point itself at them.
  const sandboxIndex = args.indexOf("--sandbox");
  if (sandboxIndex !== -1) {
    args.splice(sandboxIndex, 1);
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.GCLOUD_PROJECT ??= "demo-cafe-connection";
  }

  const [email, role] = args;

  if (!email) usage("An email address is required.");
  if (!role) usage("A role is required.");
  if (!VALID_ROLES.includes(role)) usage(`Unknown role '${role}'.`);

  const app = initAdmin();
  // Same guard the seed scripts use — refuses a live project unless the write
  // is deliberate, and names the project it is refusing.
  assertWriteAllowed();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || "emulator";

  let user;
  try {
    user = await getAuth(app).getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      console.error(
        `No Firebase Auth user for ${email} in project '${projectId}'.\n\n` +
          "Sign in to the app once with that account first — the Auth user is " +
          "created by the sign-in, and this script only assigns a role to a " +
          "user that already exists."
      );
      process.exit(1);
    }
    throw err;
  }

  const db = getFirestore(app);
  const now = FieldValue.serverTimestamp();

  const existing = await db.collection("user_roles").doc(user.uid).get();
  const previousRole = existing.exists ? existing.data()?.role : null;

  // Field-for-field what AuthContext writes on invite activation, so the two
  // paths cannot drift. createdAt is preserved on an existing document.
  await db.collection("user_roles").doc(user.uid).set(
    {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || "",
      role,
      assignedBy:  "script:grantCateringRole",
      assignedAt:  now,
      ...(existing.exists ? {} : { createdAt: now }),
    },
    { merge: true }
  );

  await db.collection("users").doc(user.uid).set(
    {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || "",
      ...(existing.exists ? {} : { createdAt: now }),
    },
    { merge: true }
  );

  const change = previousRole && previousRole !== role
    ? `${previousRole} -> ${role}`
    : role;
  console.log(`${email} (${user.uid}) in '${projectId}': ${change}`);

  // A role change only takes effect on the next token refresh in an open tab.
  if (previousRole && previousRole !== role) {
    console.log("Sign out and back in for the new role to take effect.");
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
