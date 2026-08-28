#!/usr/bin/env node
/**
 * Point a friendly vercel.app domain at the newest build of the current branch.
 *
 * Vercel keeps a branch URL (split-git-<branch>-<team>.vercel.app) up to date on
 * its own, but a domain assigned with `vercel alias set` sticks to one specific
 * deployment. This re-points it, waiting for the build to finish first, so the
 * pretty link is never left on a stale bundle.
 *
 *   npm run alias                       # current branch -> ALIAS_DOMAIN
 *   ALIAS_DOMAIN=other.vercel.app npm run alias
 *
 * Fork-specific convenience: the default domain below is not part of the app.
 */
import { execFileSync } from "node:child_process";

const DOMAIN = process.env.ALIAS_DOMAIN ?? "welcometothefuture.vercel.app";
const PROJECT = process.env.VERCEL_PROJECT ?? "split";
const TIMEOUT_MS = 3 * 60 * 1000;
const POLL_MS = 5000;

const run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

function currentBranch() {
  return run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
}

function latestForBranch(branch) {
  const { deployments } = JSON.parse(run("vercel", ["ls", PROJECT, "--json"]));
  return deployments
    .filter((d) => d.meta?.githubCommitRef === branch)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

const branch = currentBranch();
const localSha = run("git", ["rev-parse", "HEAD"]).trim();
const deadline = Date.now() + TIMEOUT_MS;

let deployment = latestForBranch(branch);
if (!deployment) {
  console.error(
    `No deployment found for branch "${branch}". Push it first — Vercel builds on push.`,
  );
  process.exit(1);
}

// Warn rather than fail: aliasing an older build is a valid thing to want.
if (deployment.meta?.githubCommitSha !== localSha) {
  console.warn(
    `Note: newest deployment is commit ${deployment.meta?.githubCommitSha?.slice(0, 7)}, ` +
      `local HEAD is ${localSha.slice(0, 7)}. Push if you meant to alias newer work.`,
  );
}

while (deployment.state === "BUILDING" || deployment.state === "QUEUED") {
  if (Date.now() > deadline) {
    console.error(
      `Timed out waiting for ${deployment.url} to finish building.`,
    );
    process.exit(1);
  }
  console.log(
    `Waiting for ${deployment.url} (${deployment.state.toLowerCase()})...`,
  );
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
  deployment = latestForBranch(branch);
}

if (deployment.state !== "READY") {
  console.error(
    `Deployment ${deployment.url} is ${deployment.state}, not READY.`,
  );
  process.exit(1);
}

run("vercel", ["alias", "set", deployment.url, DOMAIN]);
console.log(`https://${DOMAIN} -> ${deployment.url} (${branch})`);
