const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { safeStorage } = require("electron");
const { CODEX_HOME, BASE_PROVIDERS } = require("./codex-server");

// Keep the legacy directory so existing providers, projects, and hidden-thread state remain available.
const STORE_ROOT = process.env.SHARE_MASTER_STORE_ROOT || path.join(CODEX_HOME, "codex-deck");
const METADATA_FILE = path.join(STORE_ROOT, "providers.json");
const SECRETS_FILE = path.join(STORE_ROOT, "credentials.json");
const ISOLATED_STORE = Boolean(process.env.SHARE_MASTER_STORE_ROOT);
const DEFAULT_CONVERSATION_HOME = ISOLATED_STORE
  ? path.join(STORE_ROOT, "conversations")
  : CODEX_HOME;

function seedOfficialCredentials(sourceHome = path.join(os.homedir(), ".codex"), targetHome = CODEX_HOME) {
  const source = path.join(sourceHome, "auth.json");
  const target = path.join(targetHome, "auth.json");
  if (fs.existsSync(target) || !fs.existsSync(source)) return false;
  fs.mkdirSync(targetHome, { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  return true;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`无法读取 Share Master 配置 ${file}：${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function cleanId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function cleanProjectLabel(value) {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  if (!label) throw new Error("Project 名称不能为空。");
  if (label.length > 100) throw new Error("Project 名称不能超过 100 个字符。");
  return label;
}

function projectLabelKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function claudeVendorLabel(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname === "ai.hexuan.cc") return "Hexuan";
    if (hostname === "api.anthropic.com") return "Anthropic 官方";
    return hostname;
  } catch {
    return "Claude 中转";
  }
}

function providerBrand(provider) {
  return provider.type === "claude" || provider.engine === "claude" ? "claude" : "openai";
}

function providerConnectionLabel(provider) {
  if (providerBrand(provider) === "claude") return provider.vendorLabel || claudeVendorLabel(provider.baseUrl);
  if (provider.id === "official") return "OpenAI 官方";
  if (provider.id === "niubi") return "Niubi";
  if (provider.id === "hexuan") return "Hexuan";
  return provider.label;
}

const OFFICIAL_REASONING_PROFILES = {
  "gpt-5.6-sol": { defaultEffort: "low", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  "gpt-5.6-terra": { defaultEffort: "medium", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] },
  "gpt-5.6-luna": { defaultEffort: "medium", efforts: ["low", "medium", "high", "xhigh", "max"] },
  "gpt-5.5": { defaultEffort: "medium", efforts: ["low", "medium", "high", "xhigh"] },
  "gpt-5.4": { defaultEffort: "medium", efforts: ["low", "medium", "high", "xhigh"] },
  "gpt-5.4-mini": { defaultEffort: "medium", efforts: ["low", "medium", "high", "xhigh"] },
};

function reasoningProfile(model) {
  const profile = OFFICIAL_REASONING_PROFILES[String(model || "").trim()] || null;
  return profile ? { defaultEffort: profile.defaultEffort, efforts: [...profile.efforts] } : null;
}

function providerModelCatalog(id, model, availableModels = [model]) {
  const source = readJson(path.join(__dirname, "model-catalog.json"), { models: [] });
  if (!source.models?.length) throw new Error("Share Master 模型目录不可用。");
  const catalog = structuredClone(source);
  const models = [...new Set([model, ...availableModels].map((item) => String(item || "").trim()).filter(Boolean))];
  catalog.models = models.map((slug, index) => {
    const profile = reasoningProfile(slug);
    const supported = profile
      ? catalog.models[0].supported_reasoning_levels.filter((item) => profile.efforts.includes(item.effort))
      : catalog.models[0].supported_reasoning_levels;
    return {
      ...catalog.models[0],
      slug,
      display_name: slug,
      description: `Model reported by ${id}.`,
      default_reasoning_level: profile?.defaultEffort || catalog.models[0].default_reasoning_level,
      supported_reasoning_levels: supported,
      priority: index + 1,
    };
  });
  const file = path.join(STORE_ROOT, "model-catalogs", `${id}.json`);
  writeJson(file, catalog);
  return file;
}

function ensureJunction(link, target) {
  fs.mkdirSync(target, { recursive: true });
  if (fs.existsSync(link)) {
    const existing = fs.lstatSync(link);
    if (!existing.isSymbolicLink()) return;
    if (fs.realpathSync(link).toLowerCase() === fs.realpathSync(target).toLowerCase()) return;
    fs.unlinkSync(link);
  }
  fs.symlinkSync(target, link, "junction");
}

class ProviderStore {
  constructor() {
    fs.mkdirSync(STORE_ROOT, { recursive: true });
    fs.mkdirSync(DEFAULT_CONVERSATION_HOME, { recursive: true });
    if (!ISOLATED_STORE) seedOfficialCredentials();
    const metadata = this.metadata();
    let changed = false;
    if (ISOLATED_STORE && metadata.conversationHome.toLowerCase() === CODEX_HOME.toLowerCase()) {
      metadata.conversationHome = DEFAULT_CONVERSATION_HOME;
      changed = true;
    }
    if ((metadata.deletionMigrationVersion || 0) < 2) {
      const queued = new Set(metadata.pendingDeletions.map((entry) => entry.threadId));
      const now = Date.now();
      for (const threadId of metadata.hiddenThreads) {
        if (metadata.deletedThreads.includes(threadId) || queued.has(threadId)) continue;
        metadata.pendingDeletions.push({
          threadId,
          engine: "codex",
          providerId: null,
          scheduledAt: now - 60 * 60 * 1000,
          expiresAt: now,
        });
      }
      metadata.deletionMigrationVersion = 2;
      changed = true;
    }
    if (changed) {
      writeJson(METADATA_FILE, metadata);
    }
  }

  metadata() {
    const value = readJson(METADATA_FILE, {});
    return {
      relays: Array.isArray(value.relays) ? value.relays : [],
      accounts: Array.isArray(value.accounts) ? value.accounts : [],
      projects: Array.isArray(value.projects) ? value.projects : [],
      projectThreads: value.projectThreads && typeof value.projectThreads === "object"
        ? value.projectThreads
        : {},
      hiddenProjectRoots: Array.isArray(value.hiddenProjectRoots) ? value.hiddenProjectRoots : [],
      threadSettings: value.threadSettings && typeof value.threadSettings === "object"
        ? value.threadSettings
        : {},
      threadAliases: value.threadAliases && typeof value.threadAliases === "object"
        ? value.threadAliases
        : {},
      hiddenThreads: Array.isArray(value.hiddenThreads) ? value.hiddenThreads : [],
      deletedThreads: Array.isArray(value.deletedThreads) ? value.deletedThreads : [],
      localArchivedThreads: Array.isArray(value.localArchivedThreads) ? value.localArchivedThreads : [],
      pendingDeletions: Array.isArray(value.pendingDeletions) ? value.pendingDeletions : [],
      deletionMigrationVersion: Number(value.deletionMigrationVersion) || 0,
      scheduledTasks: Array.isArray(value.scheduledTasks) ? value.scheduledTasks : [],
      conversationHome: typeof value.conversationHome === "string" && value.conversationHome
        ? value.conversationHome
        : DEFAULT_CONVERSATION_HOME,
      conversationMirrorSource: typeof value.conversationMirrorSource === "string" && value.conversationMirrorSource
        ? value.conversationMirrorSource
        : null,
      providerSettings: value.providerSettings && typeof value.providerSettings === "object"
        ? value.providerSettings
        : {},
    };
  }

  list() {
    const metadata = this.metadata();
    const builtins = Object.values(BASE_PROVIDERS).map((item) => {
      if (item.id !== "claude") return item;
      const provider = { ...item, ...(metadata.providerSettings.claude || {}) };
      provider.vendorLabel ||= claudeVendorLabel(provider.baseUrl);
      return provider;
    });
    return [
      ...builtins,
      ...metadata.relays.map((item) => ({
        ...item,
        type: "relay",
        modelProvider: item.id,
        envKey: "SHARE_MASTER_RELAY_API_KEY",
      })),
      ...metadata.accounts.map((item) => ({ ...item, type: "account", modelProvider: "openai" })),
    ].map((provider) => ({
      id: provider.id,
      label: provider.label,
      connectionLabel: providerConnectionLabel(provider),
      brand: providerBrand(provider),
      vendorLabel: provider.vendorLabel,
      type: provider.type,
      engine: provider.engine,
      modelProvider: provider.modelProvider,
      baseUrl: provider.baseUrl,
      model: provider.model,
      envKey: provider.envKey,
      balanceType: provider.balanceType,
      deletable: ["relay", "account"].includes(provider.type),
      keyConfigurable: ["niubi", "hexuan", "claude"].includes(provider.id) || provider.type === "relay",
      modelConfigurable: provider.id === "claude",
      hasStoredKey: provider.type === "relay"
        ? Boolean(this.decryptRelayKey(provider.id))
        : Boolean(this.decryptStoredProviderKey(provider.id)),
    }));
  }

  publicProvider(id) {
    const provider = this.list().find((item) => item.id === id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider;
  }

  listProjects() {
    return this.metadata().projects.map(({ id, label, root, createdAt }) => ({
      id,
      label,
      root: typeof root === "string" && root ? root : null,
      createdAt,
    }));
  }

  projectThreads() {
    return { ...this.metadata().projectThreads };
  }

  hiddenProjectRoots() {
    return [...this.metadata().hiddenProjectRoots];
  }

  hiddenThreads() {
    return [...this.metadata().hiddenThreads];
  }

  threadSettings() {
    return { ...this.metadata().threadSettings };
  }

  threadAliases() {
    return { ...this.metadata().threadAliases };
  }

  deletedThreads() {
    return [...this.metadata().deletedThreads];
  }

  localArchivedThreads() {
    return [...this.metadata().localArchivedThreads];
  }

  pendingDeletions() {
    return this.metadata().pendingDeletions.map((entry) => ({ ...entry }));
  }

  scheduledTasks() {
    return this.metadata().scheduledTasks.map((task) => ({ ...task }));
  }

  saveThreadSettings(threadId, providerId, input = {}) {
    const thread = String(threadId || "").trim();
    const provider = String(providerId || "").trim();
    const model = String(input.model || "").trim();
    const effort = String(input.effort || "").trim();
    const approvalMode = String(input.approvalMode || "ask").trim();
    if (!thread || !provider) throw new Error("无效的会话设置。");
    if (model.length > 160 || effort.length > 32) throw new Error("会话模型设置过长。");
    if (!["ask", "auto", "full"].includes(approvalMode)) throw new Error("无效的批准模式。");
    const metadata = this.metadata();
    const key = `${provider}:${thread}`;
    metadata.threadSettings[key] = {
      model: model || null,
      effort: effort || null,
      approvalMode,
      updatedAt: Date.now(),
    };
    writeJson(METADATA_FILE, metadata);
    return { ...metadata.threadSettings };
  }

  conversationHome() {
    return this.metadata().conversationHome;
  }

  conversationMirrorSource() {
    return this.metadata().conversationMirrorSource;
  }

  setConversationMirrorSource(directory) {
    const source = path.resolve(String(directory || "").trim());
    if (!directory || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
      throw new Error("请选择有效的聊天记录只读源目录。");
    }
    if (!["sessions", "archived_sessions"].some((name) => fs.existsSync(path.join(source, name)))) {
      throw new Error("源目录中没有可同步的聊天记录目录。");
    }
    const target = path.resolve(this.conversationHome());
    const relativeTarget = path.relative(source, target);
    const relativeSource = path.relative(target, source);
    if (source === target
      || (relativeTarget && !relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget))
      || (relativeSource && !relativeSource.startsWith("..") && !path.isAbsolute(relativeSource))) {
      throw new Error("聊天记录源目录和 Share Master 副本目录必须彼此独立。");
    }
    const metadata = this.metadata();
    metadata.conversationMirrorSource = source;
    writeJson(METADATA_FILE, metadata);
    return source;
  }

  setConversationHome(directory) {
    const requested = String(directory || "").trim();
    const target = requested ? path.resolve(requested) : "";
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      throw new Error("请选择一个有效的聊天记录目录。");
    }
    if (ISOLATED_STORE) {
      const relative = path.relative(STORE_ROOT, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("隔离模式只能使用测试数据目录内的聊天记录。");
      }
    }
    const metadata = this.metadata();
    metadata.conversationHome = target;
    writeJson(METADATA_FILE, metadata);
    const sourceAuth = path.join(CODEX_HOME, "auth.json");
    const targetAuth = path.join(target, "auth.json");
    if (!ISOLATED_STORE
      && target.toLowerCase() !== CODEX_HOME.toLowerCase()
      && fs.existsSync(sourceAuth)
      && !fs.existsSync(targetAuth)) {
      fs.copyFileSync(sourceAuth, targetAuth, fs.constants.COPYFILE_EXCL);
    }
    return target;
  }

  addProject(input) {
    const requestedRoot = String(input?.root || "").trim();
    const root = requestedRoot ? path.resolve(requestedRoot) : null;
    if (root && (!fs.existsSync(root) || !fs.statSync(root).isDirectory())) {
      throw new Error("Project 目录无效；也可以清空目录，仅创建命名 Project。");
    }
    const label = cleanProjectLabel(input?.label || (root ? path.basename(root) || root : ""));
    const metadata = this.metadata();
    if (root) {
      const rootKey = root.toLowerCase();
      metadata.hiddenProjectRoots = metadata.hiddenProjectRoots
        .filter((item) => String(item || "").toLowerCase() !== rootKey);
    }
    const existing = root
      ? metadata.projects.find((item) => typeof item.root === "string" && item.root.toLowerCase() === root.toLowerCase())
      : null;
    if (existing) {
      writeJson(METADATA_FILE, metadata);
      return existing;
    }
    const labelKey = projectLabelKey(label);
    if (metadata.projects.some((item) => projectLabelKey(item.label) === labelKey)) {
      throw new Error(`Project 名称“${label}”已存在。`);
    }
    const project = {
      id: cleanId("project"),
      label,
      root,
      createdAt: Date.now(),
    };
    metadata.projects.push(project);
    writeJson(METADATA_FILE, metadata);
    return project;
  }

  renameProject(projectId, requestedLabel) {
    const id = String(projectId || "").trim();
    const label = cleanProjectLabel(requestedLabel);
    const metadata = this.metadata();
    const project = metadata.projects.find((item) => item.id === id);
    if (!project) throw new Error("Project 不存在。");
    const labelKey = projectLabelKey(label);
    if (metadata.projects.some((item) => item.id !== id && projectLabelKey(item.label) === labelKey)) {
      throw new Error(`Project 名称“${label}”已存在。`);
    }
    project.label = label;
    writeJson(METADATA_FILE, metadata);
    return { ...project };
  }

  deleteProject(input) {
    const request = input && typeof input === "object" ? input : { projectId: input };
    const id = String(request.projectId || "").trim();
    const requestedRoots = Array.isArray(request.roots) ? request.roots : [];
    const metadata = this.metadata();
    const index = id ? metadata.projects.findIndex((item) => item.id === id) : -1;
    if (id && index < 0) throw new Error("Project 不存在。");
    const project = index >= 0 ? metadata.projects.splice(index, 1)[0] : null;
    const roots = [project?.root, ...requestedRoots]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (!project && !roots.length) throw new Error("无效的 Project。");
    const hiddenRootKeys = new Set(metadata.hiddenProjectRoots.map((item) => String(item || "").toLowerCase()));
    for (const root of roots) {
      const resolved = path.resolve(root);
      const key = resolved.toLowerCase();
      if (hiddenRootKeys.has(key)) continue;
      metadata.hiddenProjectRoots.push(resolved);
      hiddenRootKeys.add(key);
    }
    let removedAssignments = 0;
    if (id) {
      for (const [threadId, assignedProjectId] of Object.entries(metadata.projectThreads)) {
        if (assignedProjectId !== id) continue;
        delete metadata.projectThreads[threadId];
        removedAssignments += 1;
      }
      for (const task of metadata.scheduledTasks) {
        if (task.projectId !== id) continue;
        task.projectId = null;
        task.workspace ||= project?.root || null;
        task.updatedAt = Date.now();
      }
    }
    writeJson(METADATA_FILE, metadata);
    return {
      project: project ? { ...project } : null,
      removedAssignments,
      hiddenProjectRoots: [...metadata.hiddenProjectRoots],
    };
  }

  assignThreadToProject(threadId, projectId) {
    const thread = String(threadId || "").trim();
    const project = String(projectId || "").trim();
    if (!thread) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    if (project && !metadata.projects.some((item) => item.id === project)) {
      throw new Error("Project 不存在。");
    }
    if (project) metadata.projectThreads[thread] = project;
    else delete metadata.projectThreads[thread];
    writeJson(METADATA_FILE, metadata);
    return { ...metadata.projectThreads };
  }

  renameThreadLocal(threadId, requestedName) {
    const id = String(threadId || "").trim();
    const name = String(requestedName || "").trim().replace(/\s+/g, " ");
    if (!id) throw new Error("无效的会话 ID。");
    if (!name) throw new Error("会话名称不能为空。");
    if (name.length > 160) throw new Error("会话名称不能超过 160 个字符。");
    const metadata = this.metadata();
    metadata.threadAliases[id] = name;
    writeJson(METADATA_FILE, metadata);
    return { ...metadata.threadAliases };
  }

  archiveThreadLocal(threadId) {
    const id = String(threadId || "").trim();
    if (!id) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    if (metadata.deletedThreads.includes(id)) throw new Error("会话已被永久移出 Share Master。");
    if (!metadata.localArchivedThreads.includes(id)) metadata.localArchivedThreads.push(id);
    metadata.hiddenThreads = metadata.hiddenThreads.filter((item) => item !== id);
    metadata.pendingDeletions = metadata.pendingDeletions.filter((item) => item.threadId !== id);
    writeJson(METADATA_FILE, metadata);
    return [...metadata.localArchivedThreads];
  }

  unarchiveThreadLocal(threadId) {
    const id = String(threadId || "").trim();
    if (!id) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    metadata.localArchivedThreads = metadata.localArchivedThreads.filter((item) => item !== id);
    writeJson(METADATA_FILE, metadata);
    return [...metadata.localArchivedThreads];
  }

  hideThread(threadId) {
    const id = String(threadId || "").trim();
    if (!id) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    if (metadata.deletedThreads.includes(id)) throw new Error("会话已被永久移出 Share Master。");
    if (!metadata.hiddenThreads.includes(id)) metadata.hiddenThreads.push(id);
    metadata.localArchivedThreads = metadata.localArchivedThreads.filter((item) => item !== id);
    writeJson(METADATA_FILE, metadata);
    return [...metadata.hiddenThreads];
  }

  restoreThread(threadId) {
    const id = String(threadId || "").trim();
    if (!id) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    metadata.hiddenThreads = metadata.hiddenThreads.filter((item) => item !== id);
    metadata.pendingDeletions = metadata.pendingDeletions.filter((item) => item.threadId !== id);
    writeJson(METADATA_FILE, metadata);
    return [...metadata.hiddenThreads];
  }

  scheduleThreadDeletion(threadId, engine, providerId, now = Date.now(), graceMs = 60 * 60 * 1000) {
    const id = String(threadId || "").trim();
    const targetEngine = engine === "claude" ? "claude" : "codex";
    if (!id) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    const entry = {
      threadId: id,
      engine: targetEngine,
      providerId: String(providerId || "").trim() || null,
      scheduledAt: now,
      expiresAt: now + Math.max(1000, graceMs),
    };
    metadata.pendingDeletions = metadata.pendingDeletions.filter((item) => item.threadId !== id);
    metadata.pendingDeletions.push(entry);
    if (!metadata.hiddenThreads.includes(id)) metadata.hiddenThreads.push(id);
    writeJson(METADATA_FILE, metadata);
    return { ...entry };
  }

  dueThreadDeletions(now = Date.now()) {
    return this.pendingDeletions().filter((entry) => entry.expiresAt <= now);
  }

  completeThreadDeletion(threadId) {
    const id = String(threadId || "").trim();
    if (!id) throw new Error("无效的会话 ID。");
    const metadata = this.metadata();
    metadata.pendingDeletions = metadata.pendingDeletions.filter((item) => item.threadId !== id);
    metadata.hiddenThreads = metadata.hiddenThreads.filter((item) => item !== id);
    metadata.localArchivedThreads = metadata.localArchivedThreads.filter((item) => item !== id);
    if (!metadata.deletedThreads.includes(id)) metadata.deletedThreads.push(id);
    delete metadata.projectThreads[id];
    delete metadata.threadAliases[id];
    for (const key of Object.keys(metadata.threadSettings)) {
      if (key.endsWith(`:${id}`)) delete metadata.threadSettings[key];
    }
    writeJson(METADATA_FILE, metadata);
    return [...metadata.deletedThreads];
  }

  deleteThreadNow(threadId) {
    return this.completeThreadDeletion(threadId);
  }

  saveScheduledTask(input) {
    const id = String(input?.id || "").trim();
    const prompt = String(input?.prompt || "").trim();
    const title = String(input?.title || prompt.split(/\r?\n/)[0] || "").trim().replace(/\s+/g, " ");
    const scheduledAt = Number(input?.scheduledAt);
    const repeat = ["once", "daily", "weekly"].includes(input?.repeat) ? input.repeat : "once";
    if (!prompt) throw new Error("任务内容不能为空。");
    if (prompt.length > 20000) throw new Error("任务内容不能超过 20000 个字符。");
    if (!title) throw new Error("任务名称不能为空。");
    if (title.length > 120) throw new Error("任务名称不能超过 120 个字符。");
    if (!Number.isFinite(scheduledAt) || scheduledAt <= 0) throw new Error("请选择有效的执行时间。");
    const metadata = this.metadata();
    const projectId = String(input?.projectId || "").trim() || null;
    const providerId = String(input?.providerId || "").trim() || null;
    if (projectId && !metadata.projects.some((project) => project.id === projectId)) {
      throw new Error("Project 不存在。");
    }
    if (providerId
      && !BASE_PROVIDERS[providerId]
      && !metadata.relays.some((provider) => provider.id === providerId)
      && !metadata.accounts.some((provider) => provider.id === providerId)) {
      throw new Error("连接不存在。");
    }
    const existing = id ? metadata.scheduledTasks.find((task) => task.id === id) : null;
    if (id && !existing) throw new Error("已安排任务不存在。");
    const now = Date.now();
    const task = existing || {
      id: cleanId("task"),
      createdAt: now,
      lastRunAt: null,
      lastThreadId: null,
      lastError: null,
      retryAt: null,
    };
    Object.assign(task, {
      title,
      prompt,
      scheduledAt,
      repeat,
      enabled: input?.enabled !== false,
      providerId,
      projectId,
      workspace: String(input?.workspace || "").trim() || null,
      updatedAt: now,
    });
    task.retryAt = null;
    task.lastError = null;
    if (!existing) metadata.scheduledTasks.push(task);
    writeJson(METADATA_FILE, metadata);
    return { ...task };
  }

  removeScheduledTask(taskId) {
    const id = String(taskId || "").trim();
    const metadata = this.metadata();
    const index = metadata.scheduledTasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error("已安排任务不存在。");
    const [task] = metadata.scheduledTasks.splice(index, 1);
    writeJson(METADATA_FILE, metadata);
    return { ...task };
  }

  setScheduledTaskEnabled(taskId, enabled) {
    const id = String(taskId || "").trim();
    const metadata = this.metadata();
    const task = metadata.scheduledTasks.find((item) => item.id === id);
    if (!task) throw new Error("已安排任务不存在。");
    if (enabled
      && task.providerId
      && !BASE_PROVIDERS[task.providerId]
      && !metadata.relays.some((provider) => provider.id === task.providerId)
      && !metadata.accounts.some((provider) => provider.id === task.providerId)) {
      throw new Error("原连接已删除，请先编辑任务并选择新的连接。");
    }
    task.enabled = Boolean(enabled);
    task.updatedAt = Date.now();
    task.retryAt = null;
    writeJson(METADATA_FILE, metadata);
    return { ...task };
  }

  dueScheduledTasks(now = Date.now()) {
    return this.scheduledTasks().filter((task) => (
      task.enabled
      && (task.retryAt || task.scheduledAt) <= now
    ));
  }

  completeScheduledTask(taskId, threadId, now = Date.now()) {
    const id = String(taskId || "").trim();
    const metadata = this.metadata();
    const task = metadata.scheduledTasks.find((item) => item.id === id);
    if (!task) return null;
    task.lastRunAt = now;
    task.lastThreadId = String(threadId || "").trim() || null;
    task.lastError = null;
    task.retryAt = null;
    if (task.repeat === "once") {
      task.enabled = false;
    } else {
      const interval = task.repeat === "weekly" ? 7 * 86400000 : 86400000;
      do {
        task.scheduledAt += interval;
      } while (task.scheduledAt <= now);
    }
    task.updatedAt = now;
    writeJson(METADATA_FILE, metadata);
    return { ...task };
  }

  failScheduledTask(taskId, error, now = Date.now()) {
    const id = String(taskId || "").trim();
    const metadata = this.metadata();
    const task = metadata.scheduledTasks.find((item) => item.id === id);
    if (!task) return null;
    task.lastError = String(error?.message || error || "任务执行失败").slice(0, 500);
    task.retryAt = now + 5 * 60 * 1000;
    task.updatedAt = now;
    writeJson(METADATA_FILE, metadata);
    return { ...task };
  }

  addRelay(input) {
    const label = String(input.label || "").trim();
    const rawBaseUrl = String(input.baseUrl || "").trim();
    const model = String(input.model || "").trim();
    const apiKey = String(input.apiKey || "").trim();
    let parsedBaseUrl;
    try {
      parsedBaseUrl = new URL(rawBaseUrl);
    } catch {
      parsedBaseUrl = null;
    }
    if (!label || !parsedBaseUrl || !["http:", "https:"].includes(parsedBaseUrl.protocol) || !model || !apiKey) {
      throw new Error("中转站名称、有效 Base URL、模型和 API Key 均为必填项。");
    }
    if (parsedBaseUrl.username || parsedBaseUrl.password) throw new Error("Base URL 中不能包含用户名或密码。");
    if (parsedBaseUrl.search || parsedBaseUrl.hash) throw new Error("Base URL 不能包含 query 参数或 hash。");
    const baseUrl = parsedBaseUrl.toString().replace(/\/+$/, "");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储当前不可用，未保存 API Key。");
    const id = cleanId("relay");
    const secrets = readJson(SECRETS_FILE, {});
    secrets[id] = safeStorage.encryptString(apiKey).toString("base64");
    writeJson(SECRETS_FILE, secrets);
    const metadata = this.metadata();
    metadata.relays.push({ id, label, baseUrl, model, protocol: "responses", createdAt: Date.now() });
    writeJson(METADATA_FILE, metadata);
    return this.publicProvider(id);
  }

  saveProviderKey(id, apiKey) {
    const providerId = String(id || "").trim();
    const value = String(apiKey || "").trim();
    const relay = this.metadata().relays.find((item) => item.id === providerId);
    if (!["niubi", "hexuan", "claude"].includes(providerId) && !relay) {
      throw new Error("该连接不支持单独配置 API Key。");
    }
    if (!value) throw new Error("API Key 不能为空。");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储当前不可用，未保存 API Key。");
    const secrets = readJson(SECRETS_FILE, {});
    secrets[relay ? providerId : `builtin:${providerId}`] = safeStorage.encryptString(value).toString("base64");
    writeJson(SECRETS_FILE, secrets);
    return this.publicProvider(providerId);
  }

  addAccount(input) {
    const label = String(input.label || "").trim();
    if (!label) throw new Error("账号名称不能为空。");
    const id = cleanId("account");
    const home = path.join(STORE_ROOT, "accounts", id);
    fs.mkdirSync(home, { recursive: true });
    ensureJunction(path.join(home, "sessions"), path.join(this.conversationHome(), "sessions"));
    ensureJunction(path.join(home, "archived_sessions"), path.join(this.conversationHome(), "archived_sessions"));
    const metadata = this.metadata();
    metadata.accounts.push({ id, label, home, createdAt: Date.now() });
    writeJson(METADATA_FILE, metadata);
    return this.publicProvider(id);
  }

  removeConnection(id) {
    const providerId = String(id || "").trim();
    const metadata = this.metadata();
    const relay = metadata.relays.find((item) => item.id === providerId);
    const account = metadata.accounts.find((item) => item.id === providerId);
    if (!relay && !account) throw new Error("内置连接不能删除。");

    if (account) {
      const authFile = path.join(account.home, "auth.json");
      if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
      metadata.accounts = metadata.accounts.filter((item) => item.id !== providerId);
    } else {
      metadata.relays = metadata.relays.filter((item) => item.id !== providerId);
      const secrets = readJson(SECRETS_FILE, {});
      delete secrets[providerId];
      writeJson(SECRETS_FILE, secrets);
      const catalog = path.join(STORE_ROOT, "model-catalogs", `${providerId}.json`);
      if (fs.existsSync(catalog)) fs.unlinkSync(catalog);
    }

    for (const key of Object.keys(metadata.threadSettings)) {
      if (key.startsWith(`${providerId}:`)) delete metadata.threadSettings[key];
    }
    for (const task of metadata.scheduledTasks) {
      if (task.providerId !== providerId) continue;
      task.enabled = false;
      task.lastError = "原连接已删除，请编辑任务并选择新的连接。";
      task.retryAt = null;
      task.updatedAt = Date.now();
    }
    writeJson(METADATA_FILE, metadata);
    return {
      id: providerId,
      type: relay ? "relay" : "account",
      label: relay?.label || account.label,
    };
  }

  resolve(id) {
    const conversationHome = this.conversationHome();
    if (id === "claude") {
      const settings = this.metadata().providerSettings.claude || {};
      const provider = {
        ...BASE_PROVIDERS.claude,
        ...settings,
        codexHome: conversationHome,
        claudeConfigDir: path.join(conversationHome, "claude"),
      };
      provider.vendorLabel ||= claudeVendorLabel(provider.baseUrl);
      const storedKey = this.decryptStoredProviderKey(id);
      if (storedKey) provider.env = { [provider.envKey]: storedKey };
      return provider;
    }
    if (BASE_PROVIDERS[id]) {
      const provider = { ...BASE_PROVIDERS[id], codexHome: conversationHome };
      const storedKey = this.decryptStoredProviderKey(id);
      if (storedKey && provider.envKey) provider.env = { [provider.envKey]: storedKey };
      return provider;
    }
    const metadata = this.metadata();
    const relay = metadata.relays.find((item) => item.id === id);
    if (relay) {
      const apiKey = this.decryptRelayKey(relay.id);
      const catalog = providerModelCatalog(relay.id, relay.model);
      return {
        ...relay,
        type: "relay",
        modelProvider: relay.id,
        envKey: "SHARE_MASTER_RELAY_API_KEY",
        balanceType: "auto",
        args: [
          "-c", `model_provider=${JSON.stringify(relay.id)}`,
          "-c", `model=${JSON.stringify(relay.model)}`,
          "-c", `model_catalog_json=${JSON.stringify(catalog)}`,
          "-c", "features.apps=false",
          "-c", "features.remote_plugin=false",
          "-c", `model_providers.${relay.id}.name=${JSON.stringify(relay.label)}`,
          "-c", `model_providers.${relay.id}.base_url=${JSON.stringify(relay.baseUrl)}`,
          "-c", `model_providers.${relay.id}.env_key=${JSON.stringify("SHARE_MASTER_RELAY_API_KEY")}`,
          "-c", `model_providers.${relay.id}.wire_api=${JSON.stringify("responses")}`,
          "app-server",
        ],
        env: apiKey ? { SHARE_MASTER_RELAY_API_KEY: apiKey } : {},
        codexHome: conversationHome,
      };
    }
    const account = metadata.accounts.find((item) => item.id === id);
    if (account) {
      ensureJunction(path.join(account.home, "sessions"), path.join(conversationHome, "sessions"));
      ensureJunction(path.join(account.home, "archived_sessions"), path.join(conversationHome, "archived_sessions"));
      return {
        ...account,
        type: "account",
        modelProvider: "openai",
        codexHome: account.home,
        sqliteHome: conversationHome,
        args: [
          "-c", "model_provider=\"openai\"",
          "-c", "cli_auth_credentials_store=\"file\"",
          "-c", "features.apps=false",
          "-c", "features.remote_plugin=false",
          "app-server",
        ],
      };
    }
    throw new Error(`Unknown provider: ${id}`);
  }

  withModelCatalog(provider, models) {
    if (!provider?.id || !Array.isArray(provider.args)) return provider;
    const discoveredModels = [...new Set(
      models.map((model) => String(model || "").trim()).filter(Boolean),
    )];
    if (!discoveredModels.length) return provider;
    const effectiveModel = discoveredModels.includes(provider.model)
      ? provider.model
      : discoveredModels[0];
    const catalog = providerModelCatalog(provider.id, effectiveModel, discoveredModels);
    const args = [...provider.args];
    const catalogIndex = args.findIndex((item) => (
      typeof item === "string" && item.startsWith("model_catalog_json=")
    ));
    const setting = `model_catalog_json=${JSON.stringify(catalog)}`;
    if (catalogIndex >= 0) args[catalogIndex] = setting;
    else {
      const appServerIndex = args.lastIndexOf("app-server");
      args.splice(appServerIndex >= 0 ? appServerIndex : args.length, 0, "-c", setting);
    }
    const modelIndex = args.findIndex((item) => typeof item === "string" && item.startsWith("model="));
    if (modelIndex >= 0) args[modelIndex] = `model=${JSON.stringify(effectiveModel)}`;
    else {
      const appServerIndex = args.lastIndexOf("app-server");
      args.splice(appServerIndex >= 0 ? appServerIndex : args.length, 0, "-c", `model=${JSON.stringify(effectiveModel)}`);
    }
    return { ...provider, model: effectiveModel, args, discoveredModels };
  }

  saveClaudeSettings(input) {
    const rawBaseUrl = String(input?.baseUrl || "").trim();
    const model = String(input?.model || "").trim();
    const requestedVendorLabel = String(input?.vendorLabel || "").trim();
    let baseUrl;
    try {
      const parsed = new URL(rawBaseUrl);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
      baseUrl = parsed.toString().replace(/\/+$/, "");
    } catch {
      throw new Error("请输入有效的 Claude Base URL。");
    }
    if (!model) throw new Error("请选择 Claude 模型。");
    const metadata = this.metadata();
    metadata.providerSettings.claude = {
      baseUrl,
      model,
      vendorLabel: requestedVendorLabel || claudeVendorLabel(baseUrl),
      updatedAt: Date.now(),
    };
    writeJson(METADATA_FILE, metadata);
    return this.publicProvider("claude");
  }

  decryptRelayKey(id) {
    const encoded = readJson(SECRETS_FILE, {})[id];
    if (!encoded) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      return null;
    }
  }

  hasRelayKey(id) {
    return Boolean(readJson(SECRETS_FILE, {})[id]);
  }

  hasStoredProviderKey(id) {
    return Boolean(readJson(SECRETS_FILE, {})[`builtin:${id}`]);
  }

  decryptStoredProviderKey(id) {
    const encoded = readJson(SECRETS_FILE, {})[`builtin:${id}`];
    if (!encoded) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      // Chromium profiles have distinct encryption contexts; prompt for the key in this profile.
      return null;
    }
  }
}

module.exports = {
  ProviderStore,
  STORE_ROOT,
  DEFAULT_CONVERSATION_HOME,
  ISOLATED_STORE,
  reasoningProfile,
  seedOfficialCredentials,
};
