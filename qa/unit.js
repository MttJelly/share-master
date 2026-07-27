const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CodexServer,
  BASE_PROVIDERS,
  approvalSettings,
  normalizeDiagnostic,
} = require("../src/codex-server");
const providerStoreTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-store-unit-"));
process.env.SHARE_MASTER_STORE_ROOT = providerStoreTestRoot;
const {
  ProviderStore,
  DEFAULT_CONVERSATION_HOME,
  reasoningProfile,
  seedOfficialCredentials,
} = require("../src/provider-store");
const { ClaudeServer, claudePermissionArgs } = require("../src/claude-server");
const { explicitBoolean, fetchRelayBalance } = require("../src/relay-balance");
const { fetchClaudeModels, fetchClaudeModelsSafely } = require("../src/claude-models");
const { fetchOpenAIModels, modelsEndpoint } = require("../src/openai-models");
const { executeScheduledTask, finalizeScheduledTask } = require("../src/scheduled-task-runner");
const { syncConversationMirror } = require("../src/conversation-mirror");
const { syncSkillRoots } = require("../src/skill-mirror");

function testOfficialCliArguments() {
  assert.equal(BASE_PROVIDERS.official.args.includes("--ignore-user-config"), false);
  assert.deepEqual(BASE_PROVIDERS.official.args, [
    "-c", "model_provider=\"openai\"",
    "-c", "cli_auth_credentials_store=\"file\"",
    "-c", "features.apps=false",
    "-c", "features.remote_plugin=false",
    "app-server",
  ]);
}

function testDiagnosticNormalization() {
  const diagnostic = "\u001b[2m2026-07-26T09:42:17Z\u001b[0m \u001b[31mERROR\u001b[0m\r\nfailed to refresh models\u0007";
  assert.equal(normalizeDiagnostic(diagnostic), "2026-07-26T09:42:17Z ERROR\nfailed to refresh models");
}

function testOfficialCredentialSeeding() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-deck-unit-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  try {
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "auth.json"), "source-auth", "utf8");
    assert.equal(seedOfficialCredentials(source, target), true);
    assert.equal(fs.readFileSync(path.join(target, "auth.json"), "utf8"), "source-auth");
    fs.writeFileSync(path.join(source, "auth.json"), "new-source-auth", "utf8");
    assert.equal(seedOfficialCredentials(source, target), false);
    assert.equal(fs.readFileSync(path.join(target, "auth.json"), "utf8"), "source-auth");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testIsolatedStoreDefaults() {
  const store = new ProviderStore();
  assert.equal(DEFAULT_CONVERSATION_HOME, path.join(providerStoreTestRoot, "conversations"));
  assert.equal(store.conversationHome(), DEFAULT_CONVERSATION_HOME);
  assert.equal(fs.existsSync(DEFAULT_CONVERSATION_HOME), true);
  const claude = new ClaudeServer({
    claudeConfigDir: path.join(DEFAULT_CONVERSATION_HOME, "claude"),
    model: "fable",
  });
  assert.equal(claude.globalProjectsRoot, null);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-outside-store-"));
  try {
    assert.throws(() => store.setConversationHome(outside), /隔离模式/);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
}

async function testConversationMirror() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-mirror-unit-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const activeSource = path.join(source, "sessions", "2026", "07", "thread-a.jsonl");
  const archivedSource = path.join(source, "archived_sessions", "thread-b.jsonl");
  try {
    fs.mkdirSync(path.dirname(activeSource), { recursive: true });
    fs.mkdirSync(path.dirname(archivedSource), { recursive: true });
    fs.writeFileSync(activeSource, '{"id":"a","value":1}\n', "utf8");
    fs.writeFileSync(archivedSource, '{"id":"b"}\n', "utf8");
    fs.writeFileSync(path.join(source, "auth.json"), "must-not-copy", "utf8");
    const first = await syncConversationMirror(source, target);
    assert.deepEqual({ copied: first.copied, updated: first.updated }, { copied: 2, updated: 0 });
    assert.equal(fs.readFileSync(path.join(target, "sessions", "2026", "07", "thread-a.jsonl"), "utf8"), '{"id":"a","value":1}\n');
    assert.equal(fs.existsSync(path.join(target, "auth.json")), false);
    const second = await syncConversationMirror(source, target);
    assert.equal(second.skipped, 2);

    const activeTarget = path.join(target, "sessions", "2026", "07", "thread-a.jsonl");
    fs.writeFileSync(activeTarget, '{"id":"a","local":true}\n', "utf8");
    fs.writeFileSync(activeSource, '{"id":"a","value":2}\n', "utf8");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(activeSource, future, future);
    const updated = await syncConversationMirror(source, target);
    assert.equal(updated.updated, 1);
    assert.equal(updated.backedUp, 1);
    assert.equal(fs.readFileSync(activeTarget, "utf8"), '{"id":"a","value":2}\n');
    assert.equal(fs.existsSync(path.join(target, ".share-master-sync-backups")), true);

    fs.unlinkSync(archivedSource);
    await syncConversationMirror(source, target);
    assert.equal(fs.existsSync(path.join(target, "archived_sessions", "thread-b.jsonl")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testSkillMirror() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-skill-unit-"));
  const firstSource = path.join(root, "first");
  const secondSource = path.join(root, "second");
  const target = path.join(root, "private", "skills");
  try {
    fs.mkdirSync(path.join(firstSource, "alpha", ".git"), { recursive: true });
    fs.mkdirSync(path.join(firstSource, ".system", "internal"), { recursive: true });
    fs.mkdirSync(path.join(firstSource, "not-a-skill"), { recursive: true });
    fs.mkdirSync(path.join(secondSource, "alpha"), { recursive: true });
    fs.mkdirSync(path.join(secondSource, "beta"), { recursive: true });
    fs.writeFileSync(path.join(firstSource, "alpha", "SKILL.md"), "first alpha", "utf8");
    fs.writeFileSync(path.join(firstSource, "alpha", ".git", "config"), "excluded", "utf8");
    fs.writeFileSync(path.join(firstSource, ".system", "internal", "SKILL.md"), "internal", "utf8");
    fs.writeFileSync(path.join(secondSource, "alpha", "SKILL.md"), "second alpha", "utf8");
    fs.writeFileSync(path.join(secondSource, "beta", "SKILL.md"), "beta", "utf8");

    const result = await syncSkillRoots([firstSource, secondSource], target);
    assert.deepEqual(result.names, ["alpha", "beta"]);
    assert.equal(result.copied, 2);
    assert.equal(fs.readFileSync(path.join(target, "alpha", "SKILL.md"), "utf8"), "second alpha");
    assert.equal(fs.readFileSync(path.join(target, "beta", "SKILL.md"), "utf8"), "beta");
    assert.equal(fs.existsSync(path.join(target, ".system")), false);
    assert.equal(fs.existsSync(path.join(target, "not-a-skill")), false);
    assert.equal(fs.existsSync(path.join(target, "alpha", ".git")), false);

    fs.writeFileSync(path.join(target, "alpha", "SKILL.md"), "private edit", "utf8");
    assert.equal(fs.readFileSync(path.join(secondSource, "alpha", "SKILL.md"), "utf8"), "second alpha");
    const repaired = await syncSkillRoots([firstSource, secondSource], target);
    assert.equal(repaired.copied, 1);
    assert.equal(repaired.skipped, 1);
    assert.equal(fs.readFileSync(path.join(target, "alpha", "SKILL.md"), "utf8"), "second alpha");
    const unchanged = await syncSkillRoots([firstSource, secondSource], target);
    assert.equal(unchanged.copied, 0);
    assert.equal(unchanged.skipped, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testThreadPagination() {
  const server = Object.create(CodexServer.prototype);
  const cursors = [];
  server.request = async (method, params) => {
    assert.equal(method, "thread/list");
    cursors.push(params.cursor);
    if (params.cursor === null) return { data: [{ id: "a" }], nextCursor: "page-2", backwardsCursor: "back" };
    if (params.cursor === "page-2") return { data: [{ id: "b" }], nextCursor: "page-3", backwardsCursor: null };
    return { data: [{ id: "c" }], nextCursor: null, backwardsCursor: null };
  };
  const result = await server.listThreads("needle", true);
  assert.deepEqual(cursors, [null, "page-2", "page-3"]);
  assert.deepEqual(result.data.map((thread) => thread.id), ["a", "b", "c"]);
  assert.equal(result.nextCursor, null);
  assert.equal(result.backwardsCursor, "back");
}

async function testRepeatedPaginationCursor() {
  const server = Object.create(CodexServer.prototype);
  server.request = async () => ({ data: [], nextCursor: "repeat", backwardsCursor: null });
  await assert.rejects(() => server.listThreads(), /repeated pagination cursor/);
}

async function testClientUserMessageId() {
  const server = Object.create(CodexServer.prototype);
  const captured = [];
  server.request = async (method, params) => {
    captured.push({ method, params });
    return { turn: { id: "turn" } };
  };
  await server.startTurn("thread", "hello", "F:\\codepro", "client-message");
  assert.equal(captured[0].method, "turn/start");
  assert.equal(captured[0].params.clientUserMessageId, "client-message");
  assert.deepEqual(captured[0].params.input, [{ type: "text", text: "hello" }]);
  await server.startTurn("thread", "draft this", "F:\\codepro", null, {
    skillInputs: [{ name: "nature-writing", path: "F:\\skills\\nature-writing\\SKILL.md" }],
  });
  assert.deepEqual(captured[1].params.input, [
    { type: "skill", name: "nature-writing", path: "F:\\skills\\nature-writing\\SKILL.md" },
    { type: "text", text: "draft this" },
  ]);
}

async function testModelAndEffortOverrides() {
  const server = Object.create(CodexServer.prototype);
  const captured = [];
  server.request = async (method, params) => {
    captured.push({ method, params });
    return method === "thread/start" ? { thread: { id: "thread" } } : { turn: { id: "turn" } };
  };
  await server.startThread("F:\\codepro", "gpt-5.6-terra");
  await server.startTurn("thread", "hello", "F:\\codepro", null, {
    model: "gpt-5.6-terra",
    effort: "xhigh",
  });
  assert.equal(captured[0].params.model, "gpt-5.6-terra");
  assert.equal(captured[1].params.model, "gpt-5.6-terra");
  assert.equal(captured[1].params.effort, "xhigh");
}

async function testReasoningProfiles() {
  assert.deepEqual(reasoningProfile("gpt-5.6-sol"), {
    defaultEffort: "low",
    efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
  });
  assert.equal(reasoningProfile("gpt-5.6-luna").efforts.includes("ultra"), false);
  assert.deepEqual(reasoningProfile("gpt-5.4").efforts, ["low", "medium", "high", "xhigh"]);
  assert.equal(reasoningProfile("unknown-relay-model"), null);
}

async function testApprovalModes() {
  assert.deepEqual(approvalSettings("ask"), {
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
  });
  assert.deepEqual(approvalSettings("auto"), {
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
    sandbox: "workspace-write",
  });
  assert.deepEqual(approvalSettings("full"), {
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "danger-full-access",
  });
  assert.deepEqual(claudePermissionArgs("ask"), ["--permission-mode", "manual"]);
  assert.deepEqual(claudePermissionArgs("auto"), ["--permission-mode", "auto"]);
  assert.deepEqual(claudePermissionArgs("full"), [
    "--permission-mode",
    "bypassPermissions",
    "--dangerously-skip-permissions",
  ]);

  const server = Object.create(CodexServer.prototype);
  const captured = [];
  server.request = async (method, params) => {
    captured.push({ method, params });
    return method === "turn/start" ? { turn: { id: "turn" } } : { thread: { id: "thread" } };
  };
  await server.startThread("F:\\codepro", "gpt-test", { approvalMode: "auto" });
  await server.resumeThread("thread", "F:\\codepro", "openai", "gpt-test", { approvalMode: "full" });
  await server.startTurn("thread", "hello", "F:\\codepro", null, { approvalMode: "ask" });
  assert.equal(captured[0].params.approvalsReviewer, "auto_review");
  assert.equal(captured[0].params.sandbox, "workspace-write");
  assert.equal(captured[1].params.approvalPolicy, "never");
  assert.equal(captured[1].params.sandbox, "danger-full-access");
  assert.equal(captured[2].params.approvalsReviewer, "user");
  assert.equal(captured[2].params.approvalPolicy, "on-request");
}

async function testOpenAIModelDiscovery() {
  assert.equal(modelsEndpoint("https://relay.example/v1/"), "https://relay.example/v1/models");
  const calls = [];
  const models = await fetchOpenAIModels("https://relay.example/v1", "secret", async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [{ id: "gpt-real-a" }, { id: "gpt-real-b" }, { id: "gpt-real-a" }],
      }),
    };
  });
  assert.deepEqual(models, ["gpt-real-a", "gpt-real-b"]);
  assert.equal(calls[0].url, "https://relay.example/v1/models");
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret");
  await assert.rejects(
    () => fetchOpenAIModels("https://relay.example/v1", "secret", async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => JSON.stringify({ error: { message: "denied" } }),
    })),
    /403.*denied/,
  );

  const prepared = new ProviderStore().withModelCatalog(
    BASE_PROVIDERS.niubi,
    ["gpt-real-a", "gpt-real-b"],
  );
  assert.equal(prepared.model, "gpt-real-a");
  assert.deepEqual(prepared.discoveredModels, ["gpt-real-a", "gpt-real-b"]);
  assert.equal(prepared.args.includes('model="gpt-real-a"'), true);
  const catalogSetting = prepared.args.find((item) => item.startsWith("model_catalog_json="));
  const catalogFile = JSON.parse(catalogSetting.slice("model_catalog_json=".length));
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  assert.deepEqual(catalog.models.map((model) => model.slug), ["gpt-real-a", "gpt-real-b"]);
}

async function testModelPagination() {
  const server = Object.create(CodexServer.prototype);
  server.request = async (_method, params) => params.cursor
    ? { data: [{ id: "b" }], nextCursor: null }
    : { data: [{ id: "a" }], nextCursor: "next" };
  const result = await server.listModels();
  assert.deepEqual(result.data.map((item) => item.id), ["a", "b"]);
}

async function testRenameThread() {
  const server = Object.create(CodexServer.prototype);
  let captured;
  server.request = async (method, params, timeout) => {
    captured = { method, params, timeout };
    return {};
  };
  await server.renameThread("thread-id", "  New name  ");
  assert.deepEqual(captured, {
    method: "thread/name/set",
    params: { threadId: "thread-id", name: "New name" },
    timeout: 30000,
  });
  await assert.rejects(() => server.renameThread("thread-id", "  "), /不能为空/);

  await server.deleteThread("thread-id");
  assert.deepEqual(captured, {
    method: "thread/delete",
    params: { threadId: "thread-id" },
    timeout: 30000,
  });
}

function testDeferredThreadDeletion() {
  const store = new ProviderStore();
  const entry = store.scheduleThreadDeletion("scheduled-thread", "codex", "official", 1000, 3600000);
  assert.equal(entry.expiresAt, 3601000);
  assert.equal(store.metadata().hiddenThreads.includes("scheduled-thread"), true);
  assert.equal(store.dueThreadDeletions(3600999).length, 0);
  assert.equal(store.dueThreadDeletions(3601000).length, 1);
  store.restoreThread("scheduled-thread");
  assert.equal(store.pendingDeletions().length, 0);
  assert.equal(store.metadata().hiddenThreads.includes("scheduled-thread"), false);
}

function testLegacyDeletionMigration() {
  const metadataFile = path.join(providerStoreTestRoot, "providers.json");
  fs.writeFileSync(metadataFile, JSON.stringify({
    hiddenThreads: ["legacy-pending-thread"],
    pendingDeletions: [{
      threadId: "legacy-pending-thread",
      scheduledAt: 1000,
      expiresAt: 2000,
    }],
  }), "utf8");
  const store = new ProviderStore();
  assert.equal(store.pendingDeletions().length, 0);
  assert.equal(store.metadata().hiddenThreads.includes("legacy-pending-thread"), true);
  assert.equal(store.deletedThreads().includes("legacy-pending-thread"), false);
}

function testLocalThreadManagement() {
  const store = new ProviderStore();
  const aliases = store.renameThreadLocal("local-thread", "  Local   title  ");
  assert.equal(aliases["local-thread"], "Local title");
  assert.equal(store.archiveThreadLocal("local-thread").includes("local-thread"), true);
  assert.equal(store.unarchiveThreadLocal("local-thread").includes("local-thread"), false);
  store.hideThread("local-thread");
  const deleted = store.deleteThreadNow("local-thread");
  assert.equal(deleted.includes("local-thread"), true);
  assert.equal(store.metadata().hiddenThreads.includes("local-thread"), false);
  assert.equal(store.threadAliases()["local-thread"], undefined);
  assert.throws(() => store.hideThread("local-thread"), /永久移出/);
}

function testScheduledTasks() {
  const store = new ProviderStore();
  assert.throws(() => store.saveScheduledTask({
    title: "Missing connection",
    prompt: "No provider",
    scheduledAt: 5000,
    providerId: "missing-provider",
  }), /连接不存在/);
  const once = store.saveScheduledTask({
    title: "One time task",
    prompt: "Run once",
    scheduledAt: 5000,
    repeat: "once",
    workspace: "F:\\codepro",
  });
  assert.equal(store.dueScheduledTasks(4999).some((task) => task.id === once.id), false);
  assert.equal(store.dueScheduledTasks(5000).some((task) => task.id === once.id), true);
  const completed = store.completeScheduledTask(once.id, "created-thread", 6000);
  assert.equal(completed.enabled, false);
  assert.equal(completed.lastThreadId, "created-thread");

  const daily = store.saveScheduledTask({
    title: "Daily task",
    prompt: "Run daily",
    scheduledAt: 1000,
    repeat: "daily",
  });
  const advanced = store.completeScheduledTask(daily.id, "daily-thread", 1000);
  assert.equal(advanced.scheduledAt, 1000 + 86400000);
  const failed = store.failScheduledTask(daily.id, new Error("temporary"), 2000);
  assert.equal(failed.retryAt, 302000);
  assert.match(failed.lastError, /temporary/);
  assert.equal(store.setScheduledTaskEnabled(daily.id, false).enabled, false);
  assert.equal(store.removeScheduledTask(daily.id).id, daily.id);
  assert.throws(() => store.removeScheduledTask(daily.id), /不存在/);
}

async function testScheduledTaskExecution() {
  const store = new ProviderStore();
  const project = store.addProject({ label: "Scheduled runner project", root: "" });
  const task = store.saveScheduledTask({
    title: "Runner task",
    prompt: "Execute this prompt",
    scheduledAt: 9000,
    repeat: "once",
    projectId: project.id,
    workspace: "F:\\codepro",
  });
  const calls = [];
  const server = {
    provider: { id: "fixture", model: "fixture-model" },
    startThread: async (...args) => {
      calls.push({ method: "startThread", args });
      return { thread: { id: "scheduled-created-thread" } };
    },
    startTurn: async (...args) => {
      calls.push({ method: "startTurn", args });
      return { turn: { id: "scheduled-turn" } };
    },
  };
  let createdThreadId = null;
  const result = await executeScheduledTask(
    task,
    server,
    store,
    "client-task-id",
    (threadId) => { createdThreadId = threadId; },
  );
  assert.deepEqual(result, { threadId: "scheduled-created-thread", workspace: "F:\\codepro" });
  assert.equal(createdThreadId, "scheduled-created-thread");
  assert.deepEqual(calls[0], {
    method: "startThread",
    args: ["F:\\codepro", "fixture-model", { approvalMode: "auto" }],
  });
  assert.equal(calls[1].args[0], "scheduled-created-thread");
  assert.equal(calls[1].args[1], "Execute this prompt");
  assert.equal(calls[1].args[3], "client-task-id");
  assert.deepEqual(calls[1].args[4], {
    model: "fixture-model",
    effort: "high",
    approvalMode: "auto",
  });
  assert.equal(store.projectThreads()["scheduled-created-thread"], project.id);
  assert.equal(store.threadAliases()["scheduled-created-thread"], "Runner task");
  const running = store.scheduledTasks().find((item) => item.id === task.id);
  assert.equal(running.enabled, true);
  assert.equal(running.lastThreadId, null);
  const completed = finalizeScheduledTask(
    task.id,
    result.threadId,
    { status: "completed" },
    store,
  );
  assert.equal(completed.enabled, false);
  assert.equal(completed.lastThreadId, "scheduled-created-thread");

  const failingTask = store.saveScheduledTask({
    title: "Failing runner task",
    prompt: "Fail this prompt",
    scheduledAt: 11000,
    repeat: "once",
  });
  const failed = finalizeScheduledTask(
    failingTask.id,
    "failed-thread",
    { status: "failed", error: { message: "model failed" } },
    store,
  );
  assert.equal(failed.enabled, true);
  assert.match(failed.lastError, /model failed/);
  assert.equal(failed.lastThreadId, null);

  const interruptedTask = store.saveScheduledTask({
    title: "Interrupted runner task",
    prompt: "Interrupt this prompt",
    scheduledAt: 12000,
    repeat: "once",
  });
  const interrupted = finalizeScheduledTask(
    interruptedTask.id,
    "interrupted-thread",
    { status: "interrupted" },
    store,
  );
  assert.equal(interrupted.enabled, true);
  assert.match(interrupted.lastError, /interrupted/);
  assert.equal(interrupted.lastThreadId, null);
}

async function testClaudeThreadDeletion() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-claude-delete-unit-"));
  const project = path.join(root, "projects", "qa");
  const file = path.join(project, "delete-me.jsonl");
  try {
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(file, '{"type":"user","message":{"content":"temporary"}}\n', "utf8");
    const server = new ClaudeServer({ claudeConfigDir: root, model: "fable" });
    await server.deleteThread("delete-me");
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testNewApiBalance() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization || null });
    if (url.endsWith("/api/status")) {
      return new Response(JSON.stringify({ data: { quota_per_unit: 500000, quota_display_type: "USD" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      data: {
        name: "Research key",
        total_granted: 5000000,
        total_used: 1250000,
        total_available: 3750000,
        unlimited_quota: "false",
        expires_at: 0,
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await fetchRelayBalance({ baseUrl: "https://relay.example/v1", label: "Relay" }, "secret", fetchImpl);
  assert.equal(result.supported, true);
  assert.equal(result.balance, 7.5);
  assert.equal(result.used, 2.5);
  assert.equal(result.granted, 10);
  assert.equal(result.unlimited, false);
  assert.equal(explicitBoolean("false"), false);
  assert.equal(explicitBoolean("0"), false);
  assert.equal(explicitBoolean("true"), true);
  assert.equal(explicitBoolean(1), true);

  const unlimitedKeyResult = await fetchRelayBalance(
    { baseUrl: "https://relay.example/v1", label: "Relay" },
    "secret",
    async (url) => new Response(JSON.stringify(url.endsWith("/api/status")
      ? { data: { quota_per_unit: 500000, quota_display_type: "USD" } }
      : {
          data: {
            total_granted: 185521544,
            total_used: 189118160,
            total_available: -3596616,
            unlimited_quota: true,
          },
        }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  assert.equal(unlimitedKeyResult.tokenUnlimited, true);
  assert.equal(unlimitedKeyResult.unlimited, false);
  assert.equal(unlimitedKeyResult.balance, -7.193232);
  assert.equal(calls[0].authorization, "Bearer secret");
  assert.equal(calls.some((call) => call.url === "https://relay.example/api/usage/token/"), true);
}

async function testUnsupportedBalance() {
  const fetchImpl = async (url) => new Response("not found", { status: url.endsWith("/api/usage/token/") ? 404 : 200 });
  const result = await fetchRelayBalance({ baseUrl: "https://relay.example/v1", label: "Relay" }, "secret", fetchImpl);
  assert.equal(result.supported, false);
  assert.match(result.message, /未提供兼容/);

  const forbidden = await fetchRelayBalance(
    { baseUrl: "https://relay.example/v1", label: "Relay" },
    "secret",
    async () => new Response("forbidden", { status: 403 }),
  );
  assert.equal(forbidden.supported, false);
  assert.match(forbidden.message, /稍后重试或检查 API Key/);
}

async function testClaudeModelList() {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://ai.hexuan.cc/v1/models");
    assert.equal(options.headers.Authorization, "Bearer secret");
    assert.equal(options.headers["x-api-key"], "secret");
    return new Response(JSON.stringify({
      data: [
        { id: "claude-fable-5", display_name: "Claude Fable 5" },
        { id: "claude-haiku-4-5", display_name: "Claude Haiku" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await fetchClaudeModels("https://ai.hexuan.cc/v1/", "secret", fetchImpl);
  assert.equal(result.models.length, 2);
  assert.equal(result.routes.find((route) => route.id === "fable").actualModel, "claude-fable-5");
  assert.equal(result.routes.find((route) => route.id === "sonnet").actualModel, "deepseek-v4-pro");
}

async function testClaudeModelError() {
  const fetchImpl = async () => new Response(JSON.stringify({
    error: { message: "Request not allowed" },
  }), { status: 403, headers: { "content-type": "application/json" } });
  await assert.rejects(async () => {
    try {
      await fetchClaudeModels("https://api.anthropic.com/v1", "secret", fetchImpl);
    } catch (error) {
      assert.equal(error.status, 403);
      throw error;
    }
  }, /Request not allowed/);
}

async function testClaudeModelFallback() {
  const fetchImpl = async () => new Response(JSON.stringify({
    error: { message: "API Key group was deleted" },
  }), { status: 403, headers: { "content-type": "application/json" } });
  const result = await fetchClaudeModelsSafely("https://ai.hexuan.cc/v1", "secret", fetchImpl);
  assert.equal(result.fallback, true);
  assert.equal(result.status, 403);
  assert.match(result.warning, /group was deleted/);
  assert.equal(result.models.length, 0);
  assert.equal(result.routes.some((route) => route.id === "fable"), true);
}

function testRootlessProjectMembership() {
  const store = new ProviderStore();
  const project = store.addProject({ label: "Named only", root: "" });
  assert.equal(project.label, "Named only");
  assert.equal(project.root, null);
  assert.equal(store.listProjects().some((item) => item.id === project.id && item.root === null), true);
  const membership = store.assignThreadToProject("thread-a", project.id);
  assert.equal(membership["thread-a"], project.id);
  assert.deepEqual(store.projectThreads(), membership);
  const settings = store.saveThreadSettings("thread-a", "official", { model: "gpt-5.6-sol", effort: "high" });
  assert.equal(settings["official:thread-a"].model, "gpt-5.6-sol");
  assert.equal(store.threadSettings()["official:thread-a"].effort, "high");
  assert.equal(store.threadSettings()["official:thread-a"].approvalMode, "ask");
  assert.throws(() => store.addProject({ label: "", root: "" }), /名称不能为空/);
  assert.throws(() => store.addProject({ label: "  NAMED   ONLY  ", root: "" }), /已存在/);
  assert.throws(() => store.addProject({ label: "x".repeat(101), root: "" }), /100/);
  const second = store.addProject({ label: "Second Project", root: "" });
  const renamed = store.renameProject(project.id, "  Renamed   Project  ");
  assert.equal(renamed.label, "Renamed Project");
  assert.equal(store.listProjects().find((item) => item.id === project.id).label, "Renamed Project");
  assert.throws(() => store.renameProject(second.id, "renamed project"), /已存在/);
  assert.throws(() => store.renameProject("missing-project", "Missing"), /不存在/);
}

function testProjectDeletion() {
  const store = new ProviderStore();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-project-delete-"));
  try {
    const conversation = path.join(root, "conversation.jsonl");
    fs.writeFileSync(conversation, '{"type":"fixture"}\n', "utf8");
    const project = store.addProject({ label: "Delete me", root });
    store.assignThreadToProject("delete-thread", project.id);
    store.assignThreadToProject("keep-thread", store.addProject({ label: "Keep me", root: "" }).id);
    const result = store.deleteProject(project.id);
    assert.equal(result.project.id, project.id);
    assert.equal(result.removedAssignments, 1);
    assert.equal(store.listProjects().some((item) => item.id === project.id), false);
    assert.equal(store.projectThreads()["delete-thread"], undefined);
    assert.equal(fs.existsSync(root), true);
    assert.equal(fs.readFileSync(conversation, "utf8"), '{"type":"fixture"}\n');
    assert.equal(store.hiddenProjectRoots().some((item) => item.toLowerCase() === root.toLowerCase()), true);
    assert.throws(() => store.deleteProject(project.id), /不存在/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testClaudeMergedHistoryAndImport() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-claude-unit-"));
  const configDir = path.join(root, "share-master-claude");
  const globalRoot = path.join(root, "global-projects");
  const localRoot = path.join(configDir, "projects");
  const localProject = path.join(localRoot, "local-project");
  const globalProject = path.join(globalRoot, "global-project");
  try {
    fs.mkdirSync(localProject, { recursive: true });
    fs.mkdirSync(globalProject, { recursive: true });
    fs.writeFileSync(path.join(localProject, "same.jsonl"), '{"source":"local"}\n', "utf8");
    fs.writeFileSync(path.join(globalProject, "same.jsonl"), '{"source":"global"}\n', "utf8");
    const globalOnly = path.join(globalProject, "global-only.jsonl");
    fs.writeFileSync(globalOnly, '{"source":"original"}\n', "utf8");
    const server = new ClaudeServer({
      claudeConfigDir: configDir,
      model: "fable",
      envKey: "ANTHROPIC_AUTH_TOKEN",
      env: { ANTHROPIC_AUTH_TOKEN: "test" },
    });
    server.globalProjectsRoot = globalRoot;
    const files = server.threadFiles();
    assert.equal(files.length, 2);
    assert.equal(server.findThreadFile("same"), path.join(localProject, "same.jsonl"));
    const imported = server.importThreadForResume("global-only");
    assert.equal(imported, path.join(localRoot, "global-project", "global-only.jsonl"));
    assert.equal(fs.readFileSync(imported, "utf8"), '{"source":"original"}\n');
    assert.equal(fs.readFileSync(globalOnly, "utf8"), '{"source":"original"}\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testClaudeStreamingThreadParse() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-master-claude-parse-unit-"));
  const file = path.join(root, "thread.jsonl");
  try {
    fs.writeFileSync(file, [
      JSON.stringify({
        type: "user",
        uuid: "user-1",
        cwd: "F:\\codepro",
        timestamp: "2026-07-26T10:00:00.000Z",
        message: { content: "hello" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "assistant-1",
        timestamp: "2026-07-26T10:00:01.000Z",
        message: { model: "claude-fable-5", content: [{ type: "text", text: "world" }] },
      }),
      "",
    ].join("\n"), "utf8");
    const server = new ClaudeServer({ claudeConfigDir: root, model: "fable" });
    const thread = await server.parseThread(file);
    assert.equal(thread.turns.length, 1);
    assert.equal(thread.turns[0].items.length, 2);
    assert.equal(thread.model, "claude-fable-5");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

Promise.resolve()
  .then(testOfficialCliArguments)
  .then(testDiagnosticNormalization)
  .then(testOfficialCredentialSeeding)
  .then(testIsolatedStoreDefaults)
  .then(testConversationMirror)
  .then(testSkillMirror)
  .then(testThreadPagination)
  .then(testRepeatedPaginationCursor)
  .then(testClientUserMessageId)
  .then(testModelAndEffortOverrides)
  .then(testReasoningProfiles)
  .then(testApprovalModes)
  .then(testOpenAIModelDiscovery)
  .then(testModelPagination)
  .then(testRenameThread)
  .then(testLegacyDeletionMigration)
  .then(testDeferredThreadDeletion)
  .then(testLocalThreadManagement)
  .then(testScheduledTasks)
  .then(testScheduledTaskExecution)
  .then(testNewApiBalance)
  .then(testUnsupportedBalance)
  .then(testClaudeModelList)
  .then(testClaudeModelError)
  .then(testClaudeModelFallback)
  .then(testRootlessProjectMembership)
  .then(testProjectDeletion)
  .then(testClaudeMergedHistoryAndImport)
  .then(testClaudeStreamingThreadParse)
  .then(testClaudeThreadDeletion)
  .then(() => console.log(JSON.stringify({ ok: true, tests: 30 })))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(providerStoreTestRoot, { recursive: true, force: true });
  });
