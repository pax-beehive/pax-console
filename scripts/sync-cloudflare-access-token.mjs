#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultAccessAppUrl = "https://api.lakeward.net";
const appUrl = resolveAccessAppUrl(process.env);

const envPath = resolve(process.cwd(), ".env.local");
const exampleEnvPath = resolve(process.cwd(), ".env.example");

const defaultEnv = `NEXT_PUBLIC_PAX_API_BASE_URL=/api/pax
NEXT_PUBLIC_PAX_USER_SCOPE=self
PAX_MANAGER_URL=https://api.lakeward.net
`;

export function resolveAccessAppUrl(env) {
  return env.PAX_ACCESS_APP_URL ?? env.PAX_MANAGER_URL ?? defaultAccessAppUrl;
}

export function buildLocalEnvValues(resolvedAppUrl, token) {
  return {
    NEXT_PUBLIC_PAX_API_BASE_URL: "/api/pax",
    NEXT_PUBLIC_PAX_USER_SCOPE: "self",
    PAX_MANAGER_URL: resolvedAppUrl,
    PAX_CF_AUTHORIZATION: token,
  };
}

function main() {
  if (process.env.PAX_SKIP_AUTH_LOCAL === "1") {
    console.log("Skipping local Cloudflare Access token sync.");
    return;
  }

  ensureCloudflared();

  const token = getAccessToken();
  const env = loadEnv();
  const nextEnv = upsertEnv(env, buildLocalEnvValues(appUrl, token));

  writeFileSync(envPath, nextEnv);

  const expiry = getJwtExpiry(token);
  const expiryText = expiry ? ` Expires ${expiry}.` : "";
  console.log(
    `Updated .env.local with a Cloudflare Access token.${expiryText}`,
  );
  console.log("Restart pnpm dev if it is already running.");
}

function ensureCloudflared() {
  try {
    execFileSync("cloudflared", ["--version"], { stdio: "ignore" });
  } catch {
    fail(
      "cloudflared is required. Install it first, then rerun `pnpm auth:local`.",
    );
  }
}

function getAccessToken() {
  const existingToken = tryReadToken();
  if (existingToken) {
    return existingToken;
  }

  console.log(`No cached Cloudflare Access token found for ${appUrl}.`);
  console.log("Opening Cloudflare Access login...");

  try {
    execFileSync("cloudflared", ["access", "login", "--auto-close", appUrl], {
      stdio: "inherit",
    });
  } catch {
    fail("Cloudflare Access login failed.");
  }

  const token = tryReadToken();
  if (!token) {
    fail("Cloudflare Access login completed, but no JWT token was returned.");
  }

  return token;
}

function tryReadToken() {
  try {
    const output = execFileSync("cloudflared", ["access", "token", appUrl], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return extractJwt(output);
  } catch {
    return null;
  }
}

function extractJwt(output) {
  const matches = output.match(
    /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  );
  return matches?.at(-1) ?? null;
}

function loadEnv() {
  if (existsSync(envPath)) {
    return readFileSync(envPath, "utf8");
  }
  if (existsSync(exampleEnvPath)) {
    return readFileSync(exampleEnvPath, "utf8");
  }
  return defaultEnv;
}

export function upsertEnv(env, values) {
  let next = env.trimEnd();

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");

    if (pattern.test(next)) {
      next = next.replace(pattern, line);
    } else {
      next = `${next}\n${line}`;
    }
  }

  return `${next}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getJwtExpiry(token) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(normalized, "base64").toString());
    if (typeof decoded.exp !== "number") {
      return null;
    }
    return new Date(decoded.exp * 1000).toLocaleString();
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  main();
}
