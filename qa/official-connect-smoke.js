const fs = require("node:fs");
const path = require("node:path");
const { CodexServer, BASE_PROVIDERS, CODEX_HOME } = require("../src/codex-server");

function countJsonl(root) {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) count += 1;
    }
  };
  visit(root);
  return count;
}

function recordCounts() {
  return {
    active: countJsonl(path.join(CODEX_HOME, "sessions")),
    archived: countJsonl(path.join(CODEX_HOME, "archived_sessions")),
  };
}

async function main() {
  const before = recordCounts();
  const server = new CodexServer(BASE_PROVIDERS.official);
  const diagnostics = [];
  server.on("diagnostic", (message) => diagnostics.push(message));
  try {
    await server.start();
    const account = await server.request("account/read", { refreshToken: false });
    let limits = null;
    let rateLimitError = null;
    if (account?.account?.type === "chatgpt") {
      try {
        limits = await server.request("account/rateLimits/read", {});
      } catch (error) {
        rateLimitError = error.message;
      }
    }
    const threads = await server.listThreads();
    const after = recordCounts();
    if (before.active !== after.active || before.archived !== after.archived) {
      throw new Error("Official connection test changed the conversation file count.");
    }
    console.log(JSON.stringify({
      ok: true,
      loggedIn: Boolean(account?.account),
      accountType: account?.account?.type || null,
      planType: account?.account?.planType || null,
      usedPercent: limits?.rateLimits?.primary?.usedPercent ?? null,
      rateLimitsAvailable: Boolean(limits),
      rateLimitError,
      visibleThreads: threads.data.length,
      activeRecords: after.active,
      archivedRecords: after.archived,
      diagnostics: diagnostics.length,
    }));
  } finally {
    server.stop();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
