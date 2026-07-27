const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");
const { CODEX_HOME } = require("../src/codex-server");

const root = path.resolve(__dirname, "..");
const profile = path.join(__dirname, ".thread-actions-profile");
const store = path.join(__dirname, ".thread-actions-store");
const screenshot = path.join(__dirname, "multi-window-artifacts", "thread-actions.png");

function jsonlRecords(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(target);
    }
  };
  visit(directory);
  return files.sort().map((file) => ({
    file,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  }));
}

const before = {
  active: jsonlRecords(path.join(CODEX_HOME, "sessions")),
  archived: jsonlRecords(path.join(CODEX_HOME, "archived_sessions")),
};

fs.rmSync(store, { recursive: true, force: true });
const result = spawnSync(electron, [`--user-data-dir=${profile}`, root], {
  cwd: root,
  encoding: "utf8",
  timeout: 45000,
  windowsHide: true,
  env: {
    ...process.env,
    SHARE_MASTER_STORE_ROOT: store,
    CODEX_DECK_QA_PROVIDER: "official",
    CODEX_DECK_QA_SCENARIO: "thread-actions",
    CODEX_DECK_QA_SCREENSHOT: screenshot,
    CODEX_DECK_QA_DELAY: "16000",
    CODEX_DECK_QA_WIDTH: "1000",
    CODEX_DECK_QA_HEIGHT: "720",
  },
});

try {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Electron exited with ${result.status}.`);
  const line = result.stdout.split(/\r?\n/).find((value) => value.startsWith('{"title":'));
  if (!line) throw new Error(`Thread actions QA result was not found.\n${result.stdout}\n${result.stderr}`);
  const summary = JSON.parse(line);
  assert.ok(summary.threadActions);
  assert.equal(summary.threadActions.fatal, undefined);
  assert.equal(summary.threadActions.restored, true);
  assert.equal(summary.threadActions.immediateDeleted, true);
  assert.deepEqual(summary.threadActions.after, {
    active: summary.threadActions.before.active - 1,
    removed: summary.threadActions.before.removed,
  });
  assert.equal(summary.view.selected, "removed");
  assert.equal(fs.existsSync(screenshot), true);
  const after = {
    active: jsonlRecords(path.join(CODEX_HOME, "sessions")),
    archived: jsonlRecords(path.join(CODEX_HOME, "archived_sessions")),
  };
  assert.deepEqual(
    {
      active: after.active.map((item) => item.file),
      archived: after.archived.map((item) => item.file),
    },
    {
      active: before.active.map((item) => item.file),
      archived: before.archived.map((item) => item.file),
    },
    "Thread actions QA changed the official conversation file set.",
  );
  const beforeTarget = [...before.active, ...before.archived]
    .find((item) => item.file.includes(summary.threadActions.threadId));
  const afterTarget = [...after.active, ...after.archived]
    .find((item) => item.file.includes(summary.threadActions.threadId));
  assert.ok(beforeTarget && afterTarget, "The tested official conversation file was not found.");
  assert.equal(afterTarget.sha256, beforeTarget.sha256, "Remove/restore changed the tested official conversation content.");
  console.log(JSON.stringify({
    ok: true,
    ...summary.threadActions,
    activeRecords: after.active.length,
    archivedRecords: after.archived.length,
    screenshot,
  }));
} finally {
  fs.rmSync(store, { recursive: true, force: true });
}
