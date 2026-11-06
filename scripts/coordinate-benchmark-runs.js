import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const currentRunId = Number(process.env.GITHUB_RUN_ID);
const root = process.cwd();
const apiBase = "https://api.github.com";
const activeStatuses = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);

if (!repository || !token || !Number.isSafeInteger(currentRunId)) {
  throw new Error("GITHUB_REPOSITORY, GITHUB_TOKEN and GITHUB_RUN_ID are required.");
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: \`Bearer \${token}\`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(\`GitHub API \${response.status} for \${url}: \${body}\`);
  }
  return response.status === 204 ? null : response.json();
}

async function listWorkflowRuns() {
  const runs = [];
  let url = \`\${apiBase}/repos/\${repository}/actions/workflows/strategy-sensitivity.yml/runs?per_page=100\`;
  while (url) {
    const page = await request(url);
    runs.push(...(page.workflow_runs ?? []));
    const link = pageLink(url, page);
    url = link;
  }
  return runs;
}

// GitHub's Link header is not exposed by the JSON helper, so request pages
// explicitly. The workflow normally has far fewer than 100 active runs.
function pageLink(url, page) {
  const total = page.total_count ?? 0;
  const current = Number(new URL(url).searchParams.get("page") ?? "1");
  return current * 100 < total
    ? \`\${apiBase}/repos/\${repository}/actions/workflows/strategy-sensitivity.yml/runs?per_page=100&page=\${current + 1}\`
    : null;
}

function git(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fingerprintAtCommit(sha, cache) {
  if (cache.has(sha)) return cache.get(sha);
  const remote = "benchmark-base";
  try {
    git(["remote", "get-url", remote]);
  } catch {
    git(["remote", "add", remote, \`https://github.com/\${repository}.git\`]);
  }
  git(["fetch", "--no-tags", remote, sha]);
  const worktree = mkdtempSync(join(tmpdir(), "fdcal-benchmark-"));
  try {
    git(["worktree", "add", "--detach", worktree, sha]);
    let output;
    try {
      output = execFileSync(process.execPath, ["scripts/benchmark-fingerprint.js", "--fingerprint"], {
        cwd: worktree,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      // Older active runs may predate the read-only --fingerprint mode.
      output = execFileSync(process.execPath, ["scripts/benchmark-fingerprint.js", "--write"], {
        cwd: worktree,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    }
    const fingerprint = output.trim().split(/\s+/).at(-1);
    if (!/^[a-f0-9]{64}$/i.test(fingerprint ?? "")) {
      throw new Error(\`Could not derive a SHA-256 benchmark fingerprint for \${sha}.\`);
    }
    cache.set(sha, fingerprint);
    return fingerprint;
  } finally {
    try {
      git(["worktree", "remove", "--force", worktree]);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  }
}

const currentFingerprint = execFileSync(process.execPath, ["scripts/benchmark-fingerprint.js", "--fingerprint"], {
  cwd: root,
  encoding: "utf8"
}).trim();
if (!/^[a-f0-9]{64}$/i.test(currentFingerprint)) {
  throw new Error("Current benchmark fingerprint is not a valid SHA-256 digest.");
}

const runs = await listWorkflowRuns();
const candidates = runs
  .filter(run =>
    Number(run.id) < currentRunId &&
    activeStatuses.has(run.status) &&
    run.path === ".github/workflows/strategy-sensitivity.yml" &&
    run.head_repository?.full_name === repository &&
    run.head_sha
  )
  .sort((a, b) => Number(a.id) - Number(b.id));

const fingerprintCache = new Map();
let matchingRun = null;

for (const run of candidates) {
  let existingFingerprint;
  try {
    existingFingerprint = fingerprintAtCommit(run.head_sha, fingerprintCache);
  } catch (error) {
    // Never cancel a run unless its fingerprint was positively established.
    console.warn(\`Preserving run #\${run.run_number} (\${run.id}); fingerprint unavailable: \${error.message}\`);
    continue;
  }

  if (existingFingerprint === currentFingerprint) {
    matchingRun ??= run;
    console.log(\`Run #\${run.run_number} has the same fingerprint; its benchmark work can be reused.\`);
    continue;
  }

  console.log(\`Cancelling obsolete run #\${run.run_number}: \${existingFingerprint} != \${currentFingerprint}\`);
  await request(\`\${apiBase}/repos/\${repository}/actions/runs/\${run.id}/cancel\`, { method: "POST" });
  console.log(\`Cancellation requested for obsolete run #\${run.run_number}.\`);
}

const decision = matchingRun ? "reuse" : "run";
const output = [
  \`decision=\${decision}\`,
  \`fingerprint=\${currentFingerprint}\`,
  \`reuse_run_id=\${matchingRun?.id ?? ""}\`
].join("\n") + "\n";

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, output);
}
console.log(matchingRun
  ? \`Decision: reuse active run #\${matchingRun.run_number}; skip duplicate simulation.\`
  : "Decision: no older matching run remains; proceed with this fingerprint.");
