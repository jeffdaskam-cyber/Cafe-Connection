/**
 * test-gmail-send.mjs — one-time test: can cafe-connection@ucar.edu grant
 * gmail.send to our OAuth client, and can we send mail with it?
 *
 * Prerequisites (Google Cloud Console, project cafe-connection-ed6c7):
 *   1. APIs & Services → Library → enable "Gmail API"
 *   2. APIs & Services → OAuth consent screen:
 *        - User type: External, Publishing status: Testing
 *        - Add cafe-connection@ucar.edu as a Test user
 *   3. APIs & Services → Credentials → Create credentials → OAuth client ID
 *        - Application type: Desktop app  (allows localhost redirect)
 *        - Copy the client ID and secret
 *
 * Run (PowerShell):
 *   $env:GMAIL_CLIENT_ID="...apps.googleusercontent.com"
 *   $env:GMAIL_CLIENT_SECRET="..."
 *   node scripts/test-gmail-send.mjs
 *
 * A browser window opens — sign in as cafe-connection@ucar.edu and approve.
 * The script then sends a test email from that mailbox to itself and prints
 * the refresh token (store it in Vercel as GMAIL_SEND_REFRESH_TOKEN if the
 * test succeeds).
 */

import http from "node:http";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TEST_RECIPIENT = "cafe-connection@ucar.edu"; // sends to self

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars first (see header comment).");
  process.exit(1);
}

function base64url(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();

console.log("\nOpening browser for consent. Sign in as cafe-connection@ucar.edu.\n");
console.log("If the browser does not open, visit:\n" + authUrl + "\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") { res.writeHead(404); res.end(); return; }

  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (err || !code) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>Consent failed — you can close this tab.</h2>");
    console.error("\n❌ CONSENT BLOCKED OR DENIED:", err || "no code returned");
    console.error("If the error mentions admin policy / app not verified, UCAR Workspace is blocking the grant — that is the answer to our test.");
    server.close();
    process.exit(2);
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>Consent received — you can close this tab and return to the terminal.</h2>");
  server.close();

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error("Token exchange failed: " + JSON.stringify(tokens));

    console.log("✅ Consent granted and tokens issued.");

    // Send a test message from the mailbox to itself
    const rfc822 = [
      `From: Cafe Connection <${TEST_RECIPIENT}>`,
      `To: ${TEST_RECIPIENT}`,
      "Subject: Cafe Connection — programmatic send test",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "This is a test email sent via the Gmail API from the Cafe Connection app.",
      "If you are reading this in the cafe-connection inbox, the test PASSED.",
    ].join("\r\n");

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64url(rfc822) }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) throw new Error("Send failed: " + JSON.stringify(sendData));

    console.log(`✅ Test email sent (message id ${sendData.id}). Check the ${TEST_RECIPIENT} inbox.`);
    console.log("\n──────────────────────────────────────────────");
    console.log("REFRESH TOKEN (store in Vercel as GMAIL_SEND_REFRESH_TOKEN):\n");
    console.log(tokens.refresh_token || "(none returned — re-run; prompt=consent should force one)");
    console.log("──────────────────────────────────────────────");
    console.log("\nNOTE: while the OAuth app is in 'Testing' status, refresh tokens expire after 7 days.");
    process.exit(0);
  } catch (e) {
    console.error("\n❌ TEST FAILED:", e.message);
    process.exit(3);
  }
});

server.listen(PORT, () => {
  exec(`start "" "${authUrl.replace(/&/g, "^&")}"`); // Windows default browser
});
