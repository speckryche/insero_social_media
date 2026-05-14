#!/usr/bin/env node
// One-off OAuth handshake to retrieve your LinkedIn person URN (and the
// access/refresh tokens you'll need to populate platform_tokens.linkedin).
//
// Run with:
//   node --env-file=.env.local scripts/get-linkedin-urn.mjs
//
// Prerequisites:
//   1. LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env.local
//   2. In your LinkedIn app's Auth tab, add this exact redirect URL:
//        http://localhost:5555/callback
//   3. The app must have the "Sign In with LinkedIn using OpenID Connect"
//      product enabled (gives you the `openid` and `profile` scopes).
//      For posting later, also enable "Share on LinkedIn" (w_member_social).

import http from "node:http";
import crypto from "node:crypto";

const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
// openid + profile are needed for /v2/userinfo (URN lookup). w_member_social
// is bundled so the same token can post on behalf of the member later.
const SCOPES = "openid profile w_member_social";

const clientId = process.env.LINKEDIN_CLIENT_ID;
const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET.");
  console.error("Run with: node --env-file=.env.local scripts/get-linkedin-urn.mjs");
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");

const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("state", state);
authUrl.searchParams.set("scope", SCOPES);

console.log("\nLinkedIn OAuth — retrieve your person URN + tokens");
console.log("");
console.log(`Make sure ${REDIRECT_URI} is in your LinkedIn app's allowed redirect URLs.`);
console.log("");
console.log("Open this URL in your browser to authorize:\n");
console.log(authUrl.toString());
console.log("\nWaiting for LinkedIn to redirect back...\n");

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDesc = url.searchParams.get("error_description");

  if (oauthError) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h2>Authorization failed</h2><p>${oauthError}: ${oauthErrorDesc || ""}</p>`);
    console.error(`\nAuthorization error: ${oauthError}`);
    if (oauthErrorDesc) console.error(`  ${oauthErrorDesc}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end("Missing code");
    return;
  }

  if (returnedState !== state) {
    res.writeHead(400);
    res.end("State mismatch");
    console.error("\nState mismatch — aborting (possible CSRF).");
    server.close();
    process.exit(1);
  }

  try {
    // 1. Exchange the auth code for an access token + refresh token.
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.writeHead(500);
      res.end("Token exchange failed (see terminal)");
      console.error(`\nToken exchange failed (${tokenRes.status}): ${text}`);
      server.close();
      process.exit(1);
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token; // may be undefined
    const expiresIn = tokens.expires_in; // seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 2. Use the access token to call /v2/userinfo. The `sub` field is the
    //    LinkedIn member ID — the bit you prepend with "urn:li:person:".
    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      const text = await userRes.text();
      res.writeHead(500);
      res.end("userinfo failed (see terminal)");
      console.error(`\nuserinfo failed (${userRes.status}): ${text}`);
      server.close();
      process.exit(1);
    }

    const user = await userRes.json();
    const personUrn = `urn:li:person:${user.sub}`;

    // Friendly browser page
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>LinkedIn URN</title>` +
      `<style>body{font:14px system-ui;max-width:560px;margin:60px auto;padding:0 20px;color:#111}` +
      `code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px}</style>` +
      `<h2>Got it.</h2>` +
      `<p>Person URN: <code>${personUrn}</code></p>` +
      `<p>You can close this tab and return to the terminal for the full output.</p>`
    );

    console.log("Success.\n");
    console.log(`Name:        ${user.name || "(name not in scope)"}`);
    console.log(`Email:       ${user.email || "(email not in scope)"}`);
    console.log("");
    console.log(`PERSON URN:  ${personUrn}`);
    console.log(`Member ID:   ${user.sub}  (this is what goes in LINKEDIN_PERSON_URN)`);
    console.log("");
    console.log("Tokens:");
    console.log(`  access_token:  ${accessToken}`);
    console.log(`  refresh_token: ${refreshToken || "(none returned — your app may not have rotating refresh tokens enabled)"}`);
    console.log(`  expires_at:    ${expiresAt.toISOString()}`);
    console.log("");
    console.log("Update .env.local:");
    console.log(`  LINKEDIN_PERSON_URN=${user.sub}`);
    console.log("");
    console.log("Persist tokens into Supabase (run in SQL editor):");
    console.log("");
    console.log("UPDATE platform_tokens SET");
    console.log(`  access_token  = '${accessToken}',`);
    console.log(`  refresh_token = ${refreshToken ? `'${refreshToken}'` : "NULL"},`);
    console.log(`  expires_at    = '${expiresAt.toISOString()}',`);
    console.log("  updated_at    = now()");
    console.log("WHERE platform = 'linkedin';");
    console.log("");

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end("Unexpected error (see terminal)");
    console.error("\nUnexpected error:", err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  // Listening — the prompt has already been printed above.
});
