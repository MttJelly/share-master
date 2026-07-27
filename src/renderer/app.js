/* global lucide, marked, DOMPurify */

const api = window.codexDeck;
const state = {
  provider: null,
  providerType: null,
  modelProvider: null,
  modelCatalog: [],
  skills: [],
  skillsLoading: false,
  skillQueryStart: null,
  threadSettings: {},
  threadAliases: {},
  account: null,
  rateLimits: null,
  relayBalance: null,
  relayBalanceLoading: false,
  connected: false,
  activeThreads: [],
  archivedThreads: [],
  allThreads: [],
  threads: [],
  threadView: "active",
  projects: [],
  savedProjects: [],
  projectThreads: {},
  hiddenProjectRoots: [],
  hiddenThreadIds: new Set(),
  deletedThreadIds: new Set(),
  localArchivedThreadIds: new Set(),
  pendingDeletions: [],
  scheduledTasks: [],
  runningTaskIds: new Set(),
  activeProject: null,
  activeThread: null,
  threadResumed: false,
  activeArchived: false,
  activeTurn: null,
  stopRequested: false,
  interruptingTurnId: null,
  workspace: "F:\\codepro",
  running: false,
  streamNodes: new Map(),
  menuThread: null,
  providers: [],
  connectingProvider: null,
  connectionGeneration: 0,
  loadGeneration: 0,
  openThreadGeneration: 0,
  openingThread: false,
  connectionPromise: null,
  accountRefreshPromise: null,
  approvalQueue: [],
  activeApproval: null,
  renameResolve: null,
  pendingCredentialProvider: null,
  editingProject: null,
  editingTask: null,
  recordHome: "",
  claudeCatalog: null,
  approvalMode: "ask",
  appliedThreadSettings: new Map(),
  reroutedModels: new Map(),
  renderTarget: null,
  renderedThreadId: null,
  renderedThreadRevision: null,
  conversationCache: new Map(),
  visibleTurnCounts: new Map(),
  threadRefreshTimer: null,
};

const INITIAL_VISIBLE_TURNS = 40;
const EARLIER_TURN_BATCH = 40;

const $ = (selector) => document.querySelector(selector);
const elements = {
  overlay: $("#provider-overlay"), providerError: $("#provider-error"), providerName: $("#provider-name"),
  providerState: $("#provider-state"), providerMark: $("#provider-mark"), threadList: $("#thread-list"),
  threadCount: $("#thread-count"), search: $("#thread-search"), chat: $("#chat-view"), empty: $("#empty-state"),
  emptyTitle: $("#empty-title"), emptySubtitle: $("#empty-subtitle"), input: $("#composer-input"), send: $("#send-button"), stop: $("#stop-button"),
  connection: $("#connection-badge"), workspaceLabel: $("#workspace-label"), windowTitle: $("#window-thread-title"),
  approval: $("#approval-banner"), menu: $("#thread-menu"), projectList: $("#project-list"),
  activeThreadCount: $("#active-thread-count"), archivedThreadCount: $("#archived-thread-count"),
  removedThreadCount: $("#removed-thread-count"), statusToast: $("#status-toast"),
  scheduledThreadCount: $("#scheduled-thread-count"),
  accountPanel: $("#account-panel"), renameOverlay: $("#rename-overlay"), renameForm: $("#rename-form"),
  renameInput: $("#rename-input"), renameError: $("#rename-error"),
  credentialOverlay: $("#credential-overlay"), credentialForm: $("#credential-form"),
  credentialError: $("#credential-error"), credentialApiKey: $("#credential-api-key"),
  claudeOverlay: $("#claude-overlay"), claudeForm: $("#claude-form"),
  recordHomeOverlay: $("#record-home-overlay"), recordHomeInput: $("#record-home-input"),
  projectOverlay: $("#project-overlay"), projectForm: $("#project-form"),
  projectNameInput: $("#project-name-input"), projectRootInput: $("#project-root-input"),
  taskOverlay: $("#task-overlay"), taskForm: $("#task-form"), taskNameInput: $("#task-name-input"),
  taskPromptInput: $("#task-prompt-input"), taskTimeInput: $("#task-time-input"),
  taskRepeatSelect: $("#task-repeat-select"), taskProjectSelect: $("#task-project-select"),
  taskProviderSelect: $("#task-provider-select"), taskEnabledInput: $("#task-enabled-input"), taskError: $("#task-error"),
  sessionModel: $("#session-model"), sessionEffort: $("#session-effort"),
  appliedSettings: $("#applied-settings"), modeBadge: $("#mode-badge"),
  approvalModeMenu: $("#approval-mode-menu"), approvalModeLabel: $("#approval-mode-label"),
  composerBrandIcon: $("#composer-brand-icon"),
  skillButton: $("#skill-button"), skillMenu: $("#skill-menu"), skillSearch: $("#skill-search"),
  skillList: $("#skill-list"),
};

marked.setOptions({ breaks: true, gfm: true });
const markdownCache = new Map();
const renderMarkdown = (text) => {
  const source = String(text || "");
  const cached = markdownCache.get(source);
  if (cached !== undefined) {
    markdownCache.delete(source);
    markdownCache.set(source, cached);
    return cached;
  }
  const rendered = DOMPurify.sanitize(marked.parse(source));
  if (source.length <= 200000) {
    markdownCache.set(source, rendered);
    if (markdownCache.size > 500) markdownCache.delete(markdownCache.keys().next().value);
  }
  return rendered;
};
const refreshIcons = () => lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
const titleOf = (thread) => state.threadAliases[thread?.id] || thread?.name || thread?.preview || "未命名会话";
const normalizePath = (value) => String(value || "").replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase();
const samePath = (left, right) => normalizePath(left) === normalizePath(right);
const folderName = (value) => String(value || "").split(/[\\/]/).filter(Boolean).at(-1) || String(value || "Project");
const sameProject = (left, right) => Boolean(left && right && left.id === right.id);
const threadBelongsToProject = (thread, project) => {
  const assignedProject = state.projectThreads[thread.id];
  if (assignedProject) return assignedProject === project?.id;
  return Boolean(project?.root && samePath(thread.cwd, project.root));
};
const brandIconPath = (brand) => `../../node_modules/simple-icons/icons/${brand === "claude" ? "claude" : "openai"}.svg`;
const effortLabels = {
  low: "轻",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "Max",
  ultra: "Ultra",
};
const approvalModeLabels = {
  ask: "请求批准",
  auto: "替我审批",
  full: "完全访问",
};
const currentProviderDefinition = () => state.providers.find((item) => item.id === state.provider) || null;
const threadSettingsKey = (threadId) => `${state.provider}:${threadId}`;
const pendingDeletion = (threadId) => state.pendingDeletions.find((item) => item.threadId === threadId) || null;
const taskBelongsToProject = (task, project) => {
  if (!project) return true;
  if (task.projectId) return task.projectId === project.id;
  return Boolean(project.root && task.workspace && samePath(task.workspace, project.root));
};
const projectLabelKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
const timeAgo = (seconds) => {
  if (!seconds) return "";
  const diff = Math.max(0, Date.now() - seconds * 1000);
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return new Date(seconds * 1000).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
};

const planLabel = (plan) => ({
  free: "Free", go: "Go", plus: "Plus", pro: "Pro", prolite: "Pro Lite", team: "Team",
  self_serve_business_usage_based: "Business", business: "Business", enterprise_cbp_usage_based: "Enterprise",
  enterprise: "Enterprise", edu: "Education", unknown: "未知套餐",
})[plan] || plan || "未知套餐";

function quotaWindowLabel(window, index) {
  const minutes = window?.windowDurationMins;
  if (minutes === 300) return "5 小时额度";
  if (minutes === 10080) return "每周额度";
  if (minutes && minutes % 1440 === 0) return `${minutes / 1440} 天额度`;
  if (minutes && minutes % 60 === 0) return `${minutes / 60} 小时额度`;
  return index === 0 ? "主要额度" : "次要额度";
}

function resetTimeLabel(timestamp) {
  if (!timestamp) return "重置时间未知";
  return `${new Date(timestamp * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 重置`;
}

function renderAccountPanel() {
  const isOfficial = ["official", "account"].includes(state.providerType);
  const isRelay = ["api", "relay"].includes(state.providerType);
  elements.accountPanel.classList.toggle("hidden", !isOfficial && !isRelay);
  const loginButton = $("#official-login-button");
  loginButton.classList.toggle("hidden", isRelay);
  if (isRelay) {
    if (state.relayBalanceLoading) {
      elements.accountPanel.innerHTML = '<div class="account-empty"><strong>正在查询中转余额</strong><span>正在连接厂商的余额接口...</span></div>';
      return;
    }
    const balance = state.relayBalance;
    if (!balance) {
      elements.accountPanel.innerHTML = '<div class="account-empty"><strong>中转余额</strong><span>连接后自动查询余额。</span></div>';
      return;
    }
    if (!balance.supported) {
      elements.accountPanel.innerHTML = `<div class="account-empty"><strong>无法显示中转余额</strong><span>${escapeHtml(balance.message || "该厂商未提供兼容余额接口。")}</span></div>`;
      return;
    }
    const symbol = balance.displayType === "USD" ? "$" : balance.displayType === "CNY" ? "¥" : "";
    const amount = (value) => {
      if (value === null || value === undefined) return "未知";
      const number = Number(value);
      return number < 0
        ? `-${symbol}${Math.abs(number).toFixed(2)}`
        : `${symbol}${number.toFixed(2)}`;
    };
    const usedPercent = !balance.unlimited && balance.granted > 0 && balance.used !== null
      ? Math.max(0, Math.min(100, Math.round((balance.used / balance.granted) * 100)))
      : null;
    const expiry = balance.expiresAt ? new Date(balance.expiresAt * 1000).toLocaleDateString("zh-CN") : "无固定到期日";
    const balanceDetail = balance.unlimited
      ? `<span>累计已用 <strong>${amount(balance.used)}</strong></span>`
      : `<span>总额度 <strong>${amount(balance.granted)}</strong></span>`;
    elements.accountPanel.innerHTML = `<div class="account-heading"><div><strong>${escapeHtml(balance.name || state.providers.find((item) => item.id === state.provider)?.label || "中转账号")}</strong><span>${escapeHtml(expiry)}</span></div><span class="account-auth-state"><span class="status-dot connected"></span>余额已同步</span></div><div class="relay-balance-value"><span>可用余额</span><strong>${balance.unlimited ? "无限" : amount(balance.balance)}</strong></div>${usedPercent === null ? "" : `<div class="quota-row"><div><strong>剩余额度</strong><span>剩余 ${100 - usedPercent}% · ${amount(balance.balance)}</span></div><div class="quota-track"><span style="width:${100 - usedPercent}%"></span></div></div>`}<div class="credit-row">${balanceDetail}<button id="refresh-relay-balance" class="inline-icon-button" type="button" title="刷新余额"><span data-lucide="refresh-cw"></span></button></div>`;
    $("#refresh-relay-balance").addEventListener("click", refreshRelayBalance);
    refreshIcons();
    return;
  }
  if (!isOfficial) return;
  const account = state.account;
  const response = state.rateLimits;
  const snapshot = response?.rateLimitsByLimitId?.codex || response?.rateLimits || null;
  loginButton.classList.remove("hidden");
  loginButton.innerHTML = `<span data-lucide="log-in"></span>${account ? "切换或重新登录" : "登录当前官方账号"}`;
  if (!account) {
    elements.accountPanel.innerHTML = '<div class="account-empty"><strong>尚未登录</strong><span>登录后可查看账号、套餐和 Codex 额度。</span></div>';
    refreshIcons();
    return;
  }
  const windows = [snapshot?.primary, snapshot?.secondary].filter(Boolean);
  const quotaRows = windows.map((window, index) => {
    const used = Math.max(0, Math.min(100, Number(window.usedPercent || 0)));
    return `<div class="quota-row"><div><strong>${quotaWindowLabel(window, index)}</strong><span>剩余 ${100 - used}% · ${resetTimeLabel(window.resetsAt)}</span></div><div class="quota-track"><span style="width:${100 - used}%"></span></div></div>`;
  }).join("");
  const credits = snapshot?.credits;
  const creditsText = credits?.unlimited ? "无限" : credits?.balance ?? (credits?.hasCredits ? "可用" : "0");
  const resetCredits = response?.rateLimitResetCredits?.availableCount || 0;
  elements.accountPanel.innerHTML = `<div class="account-heading"><div><strong>${escapeHtml(account.email || "ChatGPT 账号")}</strong><span>${escapeHtml(planLabel(account.planType))}</span></div><span class="account-auth-state"><span class="status-dot connected"></span>已登录</span></div><div class="quota-list">${quotaRows || '<div class="quota-unavailable">暂未返回额度窗口</div>'}</div><div class="credit-row"><span>Credits <strong>${escapeHtml(creditsText)}</strong></span>${resetCredits ? `<span>可用完整重置 <strong>${resetCredits}</strong> 次</span>` : ""}</div>`;
  refreshIcons();
}

function applyAccountSnapshot(snapshot = {}) {
  state.account = snapshot.account || null;
  state.rateLimits = snapshot.rateLimits || null;
  if (state.connected && state.account?.email) elements.providerState.textContent = `${state.account.email} · ${planLabel(state.account.planType)}`;
  renderAccountPanel();
}

async function refreshRelayBalance() {
  if (!state.connected || !["api", "relay"].includes(state.providerType) || !state.provider) return;
  const generation = state.connectionGeneration;
  state.relayBalanceLoading = true;
  renderAccountPanel();
  try {
    const balance = await api.providerBalance(state.provider);
    if (generation !== state.connectionGeneration) return;
    state.relayBalance = balance;
    if (balance.supported) {
      if (balance.unlimited) {
        elements.providerState.textContent = "共享本地历史 · 无限额度";
      } else if (balance.balance !== null) {
        const symbol = balance.displayType === "USD" ? "$" : balance.displayType === "CNY" ? "¥" : "";
        const number = Number(balance.balance);
        const formatted = number < 0
          ? `-${symbol}${Math.abs(number).toFixed(2)}`
          : `${symbol}${number.toFixed(2)}`;
        elements.providerState.textContent = `共享本地历史 · 余额 ${formatted}`;
      }
    }
  } catch (error) {
    if (generation !== state.connectionGeneration) return;
    state.relayBalance = { supported: false, message: error.message };
  } finally {
    if (generation === state.connectionGeneration) {
      state.relayBalanceLoading = false;
      renderAccountPanel();
    }
  }
}

function selectedSessionSettings() {
  return {
    model: elements.sessionModel.value || null,
    effort: elements.sessionEffort.value || null,
    approvalMode: state.approvalMode,
  };
}

function approvalModeFromSettings(settings = {}) {
  if (settings.sandboxPolicy?.type === "dangerFullAccess" && settings.approvalPolicy === "never") return "full";
  if (["auto_review", "guardian_subagent"].includes(settings.approvalsReviewer)) return "auto";
  return "ask";
}

function setApprovalMode(mode, persist = true) {
  const next = ["ask", "auto", "full"].includes(mode) ? mode : "ask";
  state.approvalMode = next;
  elements.approvalModeLabel.textContent = approvalModeLabels[next];
  for (const option of elements.approvalModeMenu.querySelectorAll("[data-approval-mode]")) {
    const active = option.dataset.approvalMode === next;
    option.classList.toggle("active", active);
    option.setAttribute("aria-checked", String(active));
  }
  elements.approvalModeMenu.classList.add("hidden");
  elements.modeBadge.setAttribute("aria-expanded", "false");
  renderAppliedSettings();
  refreshIcons();
  if (persist) persistActiveThreadSettings();
}

function renderAppliedSettings() {
  const requested = selectedSessionSettings();
  const applied = state.activeThread?.id
    ? state.appliedThreadSettings.get(state.activeThread.id)
    : null;
  const rerouted = state.activeThread?.id ? state.reroutedModels.get(state.activeThread.id) : null;
  elements.appliedSettings.classList.remove("confirmed", "rerouted");
  if (!state.activeThread) {
    elements.appliedSettings.textContent = "待首轮确认";
    elements.appliedSettings.title = "模型、推理强度和批准模式将在创建会话时发送给服务端。";
    return;
  }
  if (!applied) {
    elements.appliedSettings.textContent = "等待服务端确认";
    elements.appliedSettings.title = "尚未收到 thread/settings/updated 回执。";
    return;
  }
  const model = rerouted?.toModel || applied.model || "默认模型";
  const effort = applied.effort ? effortLabels[applied.effort] || applied.effort : "默认";
  const mode = approvalModeLabels[applied.approvalMode || "ask"];
  const matches = (!requested.model || requested.model === applied.model)
    && (!requested.effort || requested.effort === applied.effort)
    && requested.approvalMode === applied.approvalMode;
  if (!matches) {
    elements.appliedSettings.textContent = "待下一轮应用";
    elements.appliedSettings.title = `当前已应用：${model} · ${effort} · ${mode}`;
    return;
  }
  elements.appliedSettings.classList.add(rerouted ? "rerouted" : "confirmed");
  elements.appliedSettings.textContent = rerouted
    ? `已路由 ${rerouted.fromModel} → ${rerouted.toModel}`
    : `已应用 ${model} · ${effort}`;
  elements.appliedSettings.title = `服务端确认：${model} · ${effort} · ${mode}`;
}

function renderEffortOptions(preferred = null) {
  const model = state.modelCatalog.find((item) => (item.model || item.id) === elements.sessionModel.value)
    || state.modelCatalog.find((item) => item.id === elements.sessionModel.value)
    || null;
  const efforts = model?.supportedReasoningEfforts || [];
  const normalizedEfforts = efforts
    .map((item) => typeof item === "string"
      ? { reasoningEffort: item, description: "" }
      : item)
    .filter((item) => item?.reasoningEffort);
  const values = normalizedEfforts
    .map((item) => item.reasoningEffort)
    .filter(Boolean);
  const fallback = model?.defaultReasoningEffort || (values.includes("high") ? "high" : values[0] || "");
  const selected = values.includes(preferred) ? preferred : values.includes(fallback) ? fallback : values[0] || "";
  elements.sessionEffort.innerHTML = "";
  for (const effort of values) {
    const definition = normalizedEfforts.find((item) => item.reasoningEffort === effort);
    const option = new Option(effortLabels[effort] || effort, effort);
    option.title = definition?.description || option.textContent;
    elements.sessionEffort.appendChild(option);
  }
  if (!values.length) {
    const option = new Option("模型默认", "");
    option.title = "该中转站没有声明此模型支持哪些推理强度。";
    elements.sessionEffort.appendChild(option);
  }
  elements.sessionEffort.value = selected;
  elements.sessionEffort.closest(".session-select").title = elements.sessionEffort.selectedOptions[0]?.title || "推理强度";
}

function applyThreadSessionSettings(thread = null) {
  const saved = thread?.id ? state.threadSettings[threadSettingsKey(thread.id)] : null;
  const preferredModel = saved?.model || thread?.model || null;
  const defaultModel = state.modelCatalog.find((item) => item.isDefault)
    || state.modelCatalog.find((item) => (item.model || item.id) === currentProviderDefinition()?.model)
    || state.modelCatalog[0]
    || null;
  const selectedModel = state.modelCatalog.find((item) => (
    item.id === preferredModel || item.model === preferredModel
  )) || defaultModel;
  if (selectedModel) elements.sessionModel.value = selectedModel.model || selectedModel.id;
  const officialPowerDefault = !thread
    && ["official", "account"].includes(state.providerType)
    && (selectedModel?.model || selectedModel?.id) === "gpt-5.6-sol"
    ? "medium"
    : null;
  renderEffortOptions(saved?.effort || officialPowerDefault);
  setApprovalMode(saved?.approvalMode || "ask", false);
  renderAppliedSettings();
  syncComposerState();
}

async function loadSessionModels() {
  const generation = state.connectionGeneration;
  try {
    const response = await api.listModels();
    if (generation !== state.connectionGeneration) return;
    state.modelCatalog = (response.data || []).filter((item) => (
      item?.id
      && item.id !== "codex-auto-review"
      && (item.model || item.id)
    ));
    elements.sessionModel.innerHTML = "";
    for (const model of state.modelCatalog) {
      const value = model.model || model.id;
      const label = model.displayName || model.id;
      const option = new Option(label, value);
      option.title = model.description || label;
      elements.sessionModel.appendChild(option);
    }
    if (!state.modelCatalog.length) throw new Error("当前连接没有返回可选模型。");
    applyThreadSessionSettings(state.activeThread);
    if (response.warning) showDiagnostic(`Claude 模型列表暂不可用，已显示可用别名：${response.warning}`, true);
  } catch (error) {
    if (generation !== state.connectionGeneration) return;
    state.modelCatalog = [];
    const fallback = currentProviderDefinition()?.model || "默认模型";
    elements.sessionModel.innerHTML = "";
    elements.sessionModel.appendChild(new Option(fallback, fallback === "默认模型" ? "" : fallback));
    renderEffortOptions();
    showDiagnostic(`模型列表读取失败：${error.message}`, true);
  }
}

async function persistActiveThreadSettings() {
  if (!state.activeThread?.id || !state.provider) return;
  const settings = selectedSessionSettings();
  const key = threadSettingsKey(state.activeThread.id);
  state.threadSettings[key] = { ...settings, updatedAt: Date.now() };
  try {
    state.threadSettings = await api.saveThreadSettings({
      threadId: state.activeThread.id,
      providerId: state.provider,
      ...settings,
    });
  } catch (error) {
    showDiagnostic(`会话设置保存失败：${error.message}`, true);
  }
}

function setConnected(connected, label = "") {
  state.connected = connected;
  if (!connected) {
    state.skills = [];
    closeSkillMenu();
  }
  $("#close-provider-button").classList.toggle("hidden", !connected);
  elements.connection.innerHTML = `<span class="status-dot ${connected ? "connected" : ""}"></span>${connected ? "已连接" : "未连接"}`;
  elements.providerState.textContent = connected
    ? state.account?.email ? `${state.account.email} · ${planLabel(state.account.planType)}` : "共享本地历史"
    : "连接已断开";
  if (label) elements.providerName.textContent = label;
  elements.sessionModel.disabled = !connected;
  elements.sessionEffort.disabled = !connected;
  syncComposerState();
}

function connect(provider, closeOverlay = true) {
  if (state.connectionPromise && state.connectingProvider === provider) {
    return state.connectionPromise;
  }
  if (!state.connectionPromise && state.connected && state.provider === provider) {
    if (closeOverlay) elements.overlay.classList.add("hidden");
    return Promise.resolve(true);
  }
  const generation = ++state.connectionGeneration;
  state.connectingProvider = provider;
  ++state.loadGeneration;
  ++state.openThreadGeneration;
  elements.providerError.textContent = "正在连接...";
  setRunning(false);
  setConnected(false);
  const task = (async () => {
    try {
      const result = await api.connect(provider);
      if (generation !== state.connectionGeneration || result?.superseded) return false;
      state.provider = provider;
      state.connectingProvider = null;
      state.providerType = result.providerType;
      state.modelProvider = result.modelProvider;
      state.threadResumed = false;
      state.relayBalance = null;
      applyAccountSnapshot(result);
      setConnected(true, result.label);
      elements.providerMark.innerHTML = `<img src="${brandIconPath(result.brand)}" alt="${result.brand === "claude" ? "Claude" : "OpenAI"}" />`;
      elements.composerBrandIcon.src = brandIconPath(result.brand);
      if (closeOverlay) elements.overlay.classList.add("hidden");
      elements.providerError.textContent = "";
      await Promise.all([loadThreads(), loadSessionModels(), loadSkills()]);
      if (result.modelWarning) {
        showDiagnostic(`中转站模型列表不可用，已退回配置模型：${result.modelWarning}`, true);
      }
      if (["api", "relay"].includes(state.providerType)) refreshRelayBalance();
      return generation === state.connectionGeneration;
    } catch (error) {
      if (generation !== state.connectionGeneration) return false;
      setConnected(false);
      elements.providerError.textContent = error.message;
      if (closeOverlay) elements.overlay.classList.remove("hidden");
      showDiagnostic(error.message, true);
      const definition = state.providers.find((item) => item.id === provider);
      if (definition?.id === "claude") {
        openClaudeDialog(definition, error.message);
      } else if (definition?.keyConfigurable && error.message.includes(definition.envKey || "_API_KEY")) {
        openCredentialDialog(definition);
      }
      return false;
    }
  })();
  state.connectionPromise = task;
  task.then(() => {
    if (state.connectionPromise === task) state.connectionPromise = null;
    if (generation === state.connectionGeneration && state.connectingProvider === provider) {
      state.connectingProvider = null;
    }
  });
  return task;
}

async function loadThreads() {
  if (!state.connected) return;
  const generation = ++state.loadGeneration;
  const connectionGeneration = state.connectionGeneration;
  try {
    const [active, archived] = await Promise.all([
      api.listThreads({ search: "", archived: false }),
      api.listThreads({ search: "", archived: true }),
    ]);
    if (generation !== state.loadGeneration || connectionGeneration !== state.connectionGeneration) return;
    state.activeThreads = active.data || [];
    state.archivedThreads = (archived.data || []).map((thread) => ({ ...thread, _archived: true }));
    state.allThreads = threadsForCurrentView();
    updateThreadViewControls();
    syncProjects();
    applyThreadFilter(elements.search.value.trim());
  } catch (error) {
    if (generation !== state.loadGeneration || connectionGeneration !== state.connectionGeneration) return;
    showDiagnostic(error.message, true);
  }
}

function closeSkillMenu() {
  state.skillQueryStart = null;
  elements.skillMenu.classList.add("hidden");
  elements.skillButton.setAttribute("aria-expanded", "false");
}

function renderSkillMenu(query = "") {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("en-US");
  const matches = state.skills.filter((skill) => {
    if (!normalizedQuery) return true;
    return `${skill.name} ${skill.description || ""}`.toLocaleLowerCase("en-US").includes(normalizedQuery);
  });
  elements.skillList.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "skill-empty";
    empty.textContent = state.skillsLoading ? "正在读取 Skills..." : "没有匹配的 Skill";
    elements.skillList.appendChild(empty);
    return;
  }
  for (const skill of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "skill-option";
    option.dataset.skillName = skill.name;
    option.setAttribute("role", "menuitem");
    const icon = document.createElement("span");
    icon.dataset.lucide = "wand-sparkles";
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = `/${skill.name}`;
    const description = document.createElement("small");
    description.textContent = skill.description || "Codex Skill";
    copy.append(name, description);
    option.append(icon, copy);
    option.addEventListener("click", () => insertSkill(skill.name));
    elements.skillList.appendChild(option);
  }
  refreshIcons();
}

function openSkillMenu(query = "", fromComposer = false) {
  if (elements.skillButton.disabled) return;
  elements.approvalModeMenu.classList.add("hidden");
  elements.modeBadge.setAttribute("aria-expanded", "false");
  elements.skillSearch.value = query;
  renderSkillMenu(query);
  elements.skillMenu.classList.remove("hidden");
  elements.skillButton.setAttribute("aria-expanded", "true");
  if (!fromComposer) requestAnimationFrame(() => elements.skillSearch.focus());
}

function insertSkill(name) {
  const token = `/${name} `;
  const input = elements.input;
  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  let start = state.skillQueryStart;
  let prefix = "";
  if (start === null || start > selectionStart) {
    start = selectionStart;
    if (start > 0 && !/\s/.test(input.value[start - 1])) prefix = " ";
  }
  input.setRangeText(`${prefix}${token}`, start, selectionEnd, "end");
  closeSkillMenu();
  input.focus();
  resizeComposer();
}

function updateSkillAutocomplete() {
  if (elements.input.disabled || state.providerType === "claude") {
    closeSkillMenu();
    return;
  }
  const caret = elements.input.selectionStart ?? elements.input.value.length;
  if (caret !== (elements.input.selectionEnd ?? caret)) {
    closeSkillMenu();
    return;
  }
  const prefix = elements.input.value.slice(0, caret);
  const match = prefix.match(/(?:^|\s)([/\$])([\w-]*)$/);
  if (!match) {
    if (state.skillQueryStart !== null) closeSkillMenu();
    return;
  }
  state.skillQueryStart = prefix.lastIndexOf(match[1]);
  openSkillMenu(match[2] || "", true);
}

async function loadSkills(forceReload = false) {
  if (!state.connected || state.providerType === "claude") {
    state.skills = [];
    renderSkillMenu();
    syncComposerState();
    return;
  }
  const generation = state.connectionGeneration;
  state.skillsLoading = true;
  syncComposerState();
  try {
    const response = await api.listSkills({ cwd: state.workspace, forceReload });
    if (generation !== state.connectionGeneration) return;
    const deduplicated = new Map();
    for (const group of response?.data || []) {
      for (const skill of group?.skills || []) {
        const name = String(skill?.name || "").trim();
        if (!name || skill.enabled === false || deduplicated.has(name)) continue;
        deduplicated.set(name, {
          name,
          description: String(skill.description || "").trim(),
          path: skill.path || "",
          scope: skill.scope || "",
        });
      }
    }
    state.skills = [...deduplicated.values()]
      .sort((left, right) => left.name.localeCompare(right.name, "en-US"));
    elements.skillButton.title = state.skills.length
      ? `Skills (${state.skills.length})`
      : "没有可用的 Skills";
    if (!elements.skillMenu.classList.contains("hidden")) {
      renderSkillMenu(elements.skillSearch.value);
    }
  } catch (error) {
    if (generation !== state.connectionGeneration) return;
    state.skills = [];
    elements.skillButton.title = "Skills 加载失败";
    showDiagnostic(`Skills 加载失败：${error.message}`, true);
  } finally {
    if (generation === state.connectionGeneration) {
      state.skillsLoading = false;
      syncComposerState();
    }
  }
}

function syncProjects() {
  const byRoot = new Map();
  const hiddenRoots = new Set(state.hiddenProjectRoots.map(normalizePath));
  const conversationThreads = [...state.activeThreads, ...state.archivedThreads]
    .filter((thread) => !state.deletedThreadIds.has(thread.id));
  const saved = state.savedProjects.map((project) => ({ ...project, root: project.root || null }));
  for (const project of saved) {
    const key = normalizePath(project.root);
    if (key) byRoot.set(key, project);
  }
  const projects = [...saved];
  for (const thread of conversationThreads) {
    if (state.projectThreads[thread.id]) continue;
    const root = String(thread.cwd || "").trim();
    const key = normalizePath(root);
    if (key && !hiddenRoots.has(key) && !byRoot.has(key)) {
      const inferred = { id: `inferred:${key}`, label: folderName(root), root, inferred: true };
      byRoot.set(key, inferred);
      projects.push(inferred);
    }
  }
  const usedLabels = new Set();
  const uniqueProjects = projects.map((project) => {
    let label = project.label;
    let key = projectLabelKey(label);
    if (usedLabels.has(key)) {
      const parts = String(project.root || "").split(/[\\/]/).filter(Boolean);
      const context = parts.at(-2) || parts.at(-1) || "Project";
      label = `${label} · ${context}`;
      key = projectLabelKey(label);
      let suffix = 2;
      while (usedLabels.has(key)) {
        label = `${project.label} · ${context} ${suffix++}`;
        key = projectLabelKey(label);
      }
    }
    usedLabels.add(key);
    return label === project.label ? project : { ...project, label };
  });
  const allThreads = conversationThreads;
  const timestampMs = (value) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const recencyByProject = new Map();
  const recencyByRoot = new Map();
  for (const thread of allThreads) {
    const recency = timestampMs(thread.recencyAt || thread.updatedAt);
    if (!recency) continue;
    const assignedProject = state.projectThreads[thread.id];
    if (assignedProject) {
      recencyByProject.set(assignedProject, Math.max(recencyByProject.get(assignedProject) || 0, recency));
      continue;
    }
    const rootKey = normalizePath(thread.cwd);
    if (rootKey) recencyByRoot.set(rootKey, Math.max(recencyByRoot.get(rootKey) || 0, recency));
  }
  const projectRecency = (project) => Math.max(
    recencyByProject.get(project.id) || 0,
    project.root ? recencyByRoot.get(normalizePath(project.root)) || 0 : 0,
  ) || timestampMs(project.createdAt);
  state.projects = uniqueProjects.sort((left, right) => (
    projectRecency(right) - projectRecency(left)
    || left.label.localeCompare(right.label, "zh-CN")
  ));
  if (state.activeProject) {
    state.activeProject = state.projects.find((item) => sameProject(item, state.activeProject))
      || (state.activeProject.root
        ? state.projects.find((item) => item.root && samePath(item.root, state.activeProject.root))
        : null);
  }
  renderProjects();
}

function updateThreadViewControls() {
  const allThreads = [...state.activeThreads, ...state.archivedThreads]
    .filter((thread) => !state.deletedThreadIds.has(thread.id));
  const removed = allThreads.filter((thread) => state.hiddenThreadIds.has(thread.id));
  elements.activeThreadCount.textContent = state.activeThreads.filter((thread) => (
    !state.hiddenThreadIds.has(thread.id)
    && !state.deletedThreadIds.has(thread.id)
    && !state.localArchivedThreadIds.has(thread.id)
  )).length;
  const archivedIds = new Set(state.archivedThreads
    .filter((thread) => !state.hiddenThreadIds.has(thread.id) && !state.deletedThreadIds.has(thread.id))
    .map((thread) => thread.id));
  for (const threadId of state.localArchivedThreadIds) {
    if (!state.hiddenThreadIds.has(threadId) && !state.deletedThreadIds.has(threadId)) archivedIds.add(threadId);
  }
  elements.archivedThreadCount.textContent = archivedIds.size;
  elements.removedThreadCount.textContent = removed.length;
  elements.scheduledThreadCount.textContent = state.scheduledTasks.length;
  document.body.classList.toggle("non-composer-view", state.threadView !== "active");
  document.querySelectorAll("[data-thread-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.threadView === state.threadView);
  });
}

function threadsForCurrentView() {
  if (state.threadView === "archived") {
    const merged = new Map(state.archivedThreads.map((thread) => [thread.id, thread]));
    for (const thread of state.activeThreads) {
      if (state.localArchivedThreadIds.has(thread.id)) {
        merged.set(thread.id, { ...thread, _archived: true, _localArchived: true });
      }
    }
    return [...merged.values()];
  }
  if (state.threadView === "scheduled") return [];
  if (state.threadView === "removed") return [...state.activeThreads, ...state.archivedThreads];
  return state.activeThreads.filter((thread) => !state.localArchivedThreadIds.has(thread.id));
}

function setThreadView(view) {
  state.threadView = ["archived", "scheduled", "removed"].includes(view) ? view : "active";
  elements.search.placeholder = state.threadView === "scheduled" ? "搜索已安排任务" : "搜索聊天记录";
  state.allThreads = threadsForCurrentView();
  updateThreadViewControls();
  newChat(false);
  applyThreadFilter();
  renderProjects();
}

function applyThreadFilter(search = elements.search.value.trim()) {
  const query = search.toLocaleLowerCase("zh-CN");
  if (state.threadView === "scheduled") {
    state.threads = [];
    renderThreadList();
    return;
  }
  state.threads = state.allThreads.filter((thread) => {
    if (state.deletedThreadIds.has(thread.id)) return false;
    const hidden = state.hiddenThreadIds.has(thread.id);
    if (state.threadView === "removed" ? !hidden : hidden) return false;
    if (state.activeProject && !threadBelongsToProject(thread, state.activeProject)) return false;
    if (!query) return true;
    return [titleOf(thread), thread.cwd, thread.modelProvider].some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(query));
  });
  renderThreadList();
}

function renderProjects() {
  elements.projectList.innerHTML = "";
  const entries = [{ id: "all", label: "所有会话", root: null }, ...state.projects];
  const visibleThreads = state.threadView === "scheduled" ? [] : state.allThreads.filter((thread) => (
    !state.deletedThreadIds.has(thread.id)
    && (state.threadView === "removed" ? state.hiddenThreadIds.has(thread.id) : !state.hiddenThreadIds.has(thread.id))
  ));
  const projectCounts = new Map();
  for (const thread of visibleThreads) {
    const assignedProject = state.projectThreads[thread.id];
    if (assignedProject) {
      projectCounts.set(assignedProject, (projectCounts.get(assignedProject) || 0) + 1);
      continue;
    }
    const rootKey = normalizePath(thread.cwd);
    if (rootKey) projectCounts.set(`root:${rootKey}`, (projectCounts.get(`root:${rootKey}`) || 0) + 1);
  }
  let activeRow = null;
  const fragment = document.createDocumentFragment();
  for (const project of entries) {
    const row = document.createElement("div");
    const isAll = project.id === "all";
    const active = isAll ? !state.activeProject : sameProject(project, state.activeProject);
    const count = state.threadView === "scheduled"
      ? isAll
        ? state.scheduledTasks.length
        : state.scheduledTasks.filter((task) => taskBelongsToProject(task, project)).length
      : isAll
        ? visibleThreads.length
        : project.root
          ? (projectCounts.get(project.id) || 0)
            + (projectCounts.get(`root:${normalizePath(project.root)}`) || 0)
          : projectCounts.get(project.id) || 0;
    row.className = `project-row ${active ? "active" : ""}`;
    row.dataset.projectId = project.id;
    if (active) activeRow = row;
    const select = document.createElement("button");
    select.className = "project-select";
    select.title = isAll ? "显示所有会话" : project.root || "无本地目录";
    select.innerHTML = `<span data-lucide="${isAll ? "messages-square" : project.root ? "folder" : "folder-dot"}"></span><strong>${escapeHtml(project.label)}</strong><span class="project-count">${count}</span>`;
    select.addEventListener("click", () => selectProject(isAll ? null : project));
    row.appendChild(select);
    if (!isAll) {
      const rename = document.createElement("button");
      rename.className = "project-action project-rename";
      rename.title = "重命名 Project";
      rename.setAttribute("aria-label", `重命名 ${project.label}`);
      rename.innerHTML = '<span data-lucide="pencil"></span>';
      rename.addEventListener("click", () => openProjectDialog(project));
      row.appendChild(rename);
      const openWindow = document.createElement("button");
      openWindow.className = "project-action project-window";
      openWindow.title = "在新窗口打开";
      openWindow.setAttribute("aria-label", `在新窗口打开 ${project.label}`);
      openWindow.innerHTML = '<span data-lucide="panels-top-left"></span>';
      openWindow.addEventListener("click", () => {
        api.newWindow({
          provider: state.provider,
          projectId: project.inferred ? null : project.id,
          projectRoot: project.root || null,
          workspace: project.root || state.workspace,
        }).catch(showActionError);
      });
      row.appendChild(openWindow);
      const remove = document.createElement("button");
      remove.className = "project-action project-delete";
      remove.title = "删除 Project";
      remove.setAttribute("aria-label", `删除 ${project.label}`);
      remove.innerHTML = '<span data-lucide="trash-2"></span>';
      remove.addEventListener("click", () => deleteProject(project, remove));
      row.appendChild(remove);
    }
    fragment.appendChild(row);
  }
  elements.projectList.appendChild(fragment);
  refreshIcons();
  requestAnimationFrame(() => activeRow?.scrollIntoView({ block: "nearest", inline: "nearest" }));
}

function selectProject(project) {
  state.activeProject = project;
  if (project?.root) state.workspace = project.root;
  updateWorkspace();
  newChat(false);
  applyThreadFilter();
  renderProjects();
}

async function deleteProject(project, button) {
  const confirmed = confirm(
    `删除 Project“${project.label}”？\n\n只会删除 Project 配置和会话归属关系，不会删除本地目录、聊天记录或 Codex/Claude 会话。`,
  );
  if (!confirmed) return;
  button.disabled = true;
  const wasActive = sameProject(state.activeProject, project);
  const roots = [...new Set(
    [...state.activeThreads, ...state.archivedThreads]
      .filter((thread) => threadBelongsToProject(thread, project))
      .map((thread) => String(thread.cwd || "").trim())
      .filter(Boolean),
  )];
  if (project.root && !roots.some((root) => samePath(root, project.root))) roots.push(project.root);
  try {
    const result = await api.deleteProject({
      projectId: project.inferred ? null : project.id,
      roots,
    });
    state.savedProjects = state.savedProjects.filter((item) => item.id !== project.id);
    state.projectThreads = Object.fromEntries(
      Object.entries(state.projectThreads).filter(([, projectId]) => projectId !== project.id),
    );
    state.hiddenProjectRoots = result.hiddenProjectRoots || state.hiddenProjectRoots;
    if (wasActive) {
      state.activeProject = null;
      updateWorkspace();
      newChat(false);
    }
    syncProjects();
    applyThreadFilter();
    showDiagnostic(`已删除 Project“${project.label}”，聊天记录未修改。`, false);
  } catch (error) {
    button.disabled = false;
    showActionError(error);
  }
}

function renderThreadList() {
  if (state.threadView === "scheduled") {
    renderScheduledTasks();
    return;
  }
  elements.threadCount.textContent = state.threads.length;
  elements.threadList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const thread of state.threads) {
    const item = document.createElement("button");
    item.className = `thread-item ${state.activeThread?.id === thread.id ? "active" : ""}`;
    item.dataset.threadId = thread.id;
    const savedModel = state.threadSettings[threadSettingsKey(thread.id)]?.model;
    const deletion = pendingDeletion(thread.id);
    const deletionMinutes = deletion ? Math.max(1, Math.ceil((deletion.expiresAt - Date.now()) / 60000)) : null;
    const detail = deletion
      ? `${deletionMinutes} 分钟后从 Share Master 清除`
      : `${savedModel || thread.model || thread.modelProvider || "会话"} · ${timeAgo(thread.recencyAt || thread.updatedAt)}`;
    item.classList.toggle("pending-delete", Boolean(deletion));
    item.innerHTML = `<span class="thread-copy"><strong>${escapeHtml(titleOf(thread))}</strong><small>${escapeHtml(detail)}</small></span><span class="thread-more" title="会话操作"><span data-lucide="ellipsis"></span></span>`;
    item.addEventListener("click", (event) => {
      if (event.target.closest(".thread-more")) return openThreadMenu(thread, event);
      openThread(state.threadView === "removed" ? { ...thread, _removed: true } : thread);
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openThreadMenu(thread, event);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      openThreadMenu(thread, event);
    });
    fragment.appendChild(item);
  }
  elements.threadList.appendChild(fragment);
  refreshIcons();
}

function taskScheduleLabel(task) {
  const repeat = task.repeat === "daily" ? "每天" : task.repeat === "weekly" ? "每周" : "一次";
  const when = new Date(task.scheduledAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (state.runningTaskIds.has(task.id)) return "正在执行";
  if (task.lastError) return `${task.enabled ? "重试" : "需处理"} · ${task.lastError}`;
  if (!task.enabled && task.lastRunAt) return `已完成 · ${new Date(task.lastRunAt).toLocaleDateString("zh-CN")}`;
  return `${task.enabled ? when : "已暂停"} · ${repeat}`;
}

function renderScheduledTasks() {
  const query = elements.search.value.trim().toLocaleLowerCase("zh-CN");
  const tasks = state.scheduledTasks
    .filter((task) => !state.activeProject || taskBelongsToProject(task, state.activeProject))
    .filter((task) => !query || [task.title, task.prompt].some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(query)))
    .sort((left, right) => Number(right.enabled) - Number(left.enabled) || left.scheduledAt - right.scheduledAt);
  elements.threadCount.textContent = tasks.length;
  elements.threadList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    const running = state.runningTaskIds.has(task.id);
    const row = document.createElement("div");
    row.className = `task-item ${task.enabled ? "" : "disabled"} ${running ? "running" : ""}`;
    row.dataset.taskId = task.id;
    const main = document.createElement("button");
    main.className = "task-main";
    main.disabled = running;
    main.innerHTML = `<strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(taskScheduleLabel(task))}</small>`;
    main.addEventListener("click", () => openTaskDialog(task));
    row.appendChild(main);
    const toggle = document.createElement("button");
    toggle.className = "task-action task-toggle";
    toggle.title = running ? "任务执行中" : task.enabled ? "暂停任务" : "启用任务";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.disabled = running;
    toggle.innerHTML = `<span data-lucide="${task.enabled ? "pause" : "play"}"></span>`;
    toggle.addEventListener("click", () => toggleScheduledTask(task, toggle));
    row.appendChild(toggle);
    const remove = document.createElement("button");
    remove.className = "task-action delete";
    remove.title = "删除任务";
    remove.setAttribute("aria-label", remove.title);
    remove.disabled = running;
    remove.innerHTML = '<span data-lucide="trash-2"></span>';
    remove.addEventListener("click", () => removeScheduledTask(task, remove));
    row.appendChild(remove);
    fragment.appendChild(row);
  }
  elements.threadList.appendChild(fragment);
  refreshIcons();
}

function renderProviderOptions() {
  const container = $("#provider-options");
  container.innerHTML = "";
  for (const provider of state.providers) {
    const row = document.createElement("div");
    row.className = "provider-option-row";
    row.dataset.providerRow = provider.id;
    const option = document.createElement("button");
    option.className = "provider-option";
    option.dataset.provider = provider.id;
    const brandLabel = provider.brand === "claude" ? "Claude" : "OpenAI";
    const icon = `<img src="${brandIconPath(provider.brand)}" alt="${brandLabel}" />`;
    const configuredKey = provider.hasStoredKey ? "密钥已加密保存在应用内" : null;
    const detail = provider.type === "account"
      ? "OpenAI · 独立官方登录，共享聊天记录"
      : provider.type === "relay"
        ? `OpenAI · ${provider.model} · ${provider.baseUrl}`
        : provider.id === "niubi"
          ? `OpenAI · ${provider.model} · ${configuredKey || "首次连接时配置 API Key"}`
          : provider.id === "hexuan"
            ? `OpenAI · ${provider.model} · ${configuredKey || "使用现有 HEXUAN_API_KEY"}`
            : provider.id === "claude"
              ? `Claude · ${provider.model || "未选择模型"} · ${configuredKey || "需要配置 Token"}`
              : "OpenAI · 使用 Codex 官方登录状态";
    option.innerHTML = `<span class="provider-icon brand">${icon}</span><span><strong>${escapeHtml(provider.connectionLabel || provider.label)}</strong><small>${escapeHtml(detail)}</small></span><span data-lucide="chevron-right"></span>`;
    option.addEventListener("click", () => {
      if (provider.id === "claude" && !provider.hasStoredKey) openClaudeDialog(provider);
      else connect(provider.id);
    });
    row.appendChild(option);
    if (provider.id === "claude") {
      row.classList.add("configurable");
      const configure = document.createElement("button");
      configure.className = "provider-configure";
      configure.type = "button";
      configure.title = "配置 Claude Token 和模型";
      configure.setAttribute("aria-label", configure.title);
      configure.innerHTML = '<span data-lucide="settings"></span>';
      configure.addEventListener("click", () => openClaudeDialog(provider));
      row.appendChild(configure);
    }
    if (provider.deletable) {
      row.classList.add("deletable");
      const remove = document.createElement("button");
      remove.className = "provider-delete";
      remove.type = "button";
      remove.title = `删除 ${provider.connectionLabel || provider.label}`;
      remove.setAttribute("aria-label", remove.title);
      remove.innerHTML = '<span data-lucide="trash-2"></span>';
      remove.addEventListener("click", () => removeProviderConnection(provider, remove));
      row.appendChild(remove);
    }
    container.appendChild(row);
  }
  refreshIcons();
}

async function removeProviderConnection(provider, button) {
  const credential = provider.type === "relay" ? "加密 API Key" : "独立登录凭据";
  const confirmed = confirm(
    `删除连接“${provider.connectionLabel || provider.label}”？\n\n将删除该连接及其${credential}，共享聊天记录完全不变。`,
  );
  if (!confirmed) return;
  button.disabled = true;
  try {
    await api.removeProvider(provider.id);
    showDiagnostic(`已删除连接“${provider.connectionLabel || provider.label}”，聊天记录未修改。`, false);
  } catch (error) {
    button.disabled = false;
    showActionError(error);
  }
}

function upsertProvider(provider) {
  const index = state.providers.findIndex((item) => item.id === provider.id);
  if (index >= 0) state.providers[index] = provider;
  else state.providers.push(provider);
}

function applyStoreSnapshot(snapshot) {
  const previousRecordHome = state.recordHome;
  const previousTaskThreads = new Set(state.scheduledTasks.map((task) => task.lastThreadId).filter(Boolean));
  const pendingOrActiveProvider = state.provider || state.connectingProvider;
  const activeProviderWasRemoved = Boolean(
    pendingOrActiveProvider
      && !(snapshot.providers || []).some((provider) => provider.id === pendingOrActiveProvider),
  );
  const activeId = state.activeThread?.id || null;
  const wasHidden = activeId ? state.hiddenThreadIds.has(activeId) : false;
  const wasDeleted = activeId ? state.deletedThreadIds.has(activeId) : false;
  const wasLocalArchived = activeId ? state.localArchivedThreadIds.has(activeId) : false;
  const providerArchived = Boolean(state.activeThread?._archived && !state.activeThread?._localArchived);
  state.providers = snapshot.providers || state.providers;
  state.savedProjects = snapshot.projects || [];
  state.projectThreads = snapshot.projectThreads || {};
  state.hiddenProjectRoots = snapshot.hiddenProjectRoots || [];
  state.threadSettings = snapshot.threadSettings || {};
  state.threadAliases = snapshot.threadAliases || {};
  state.hiddenThreadIds = new Set(snapshot.hiddenThreadIds || []);
  state.deletedThreadIds = new Set(snapshot.deletedThreadIds || []);
  state.localArchivedThreadIds = new Set(snapshot.localArchivedThreadIds || []);
  state.pendingDeletions = snapshot.pendingDeletions || [];
  state.scheduledTasks = snapshot.scheduledTasks || [];
  state.runningTaskIds = new Set(snapshot.runningTaskIds || []);
  const hasNewTaskThread = state.scheduledTasks.some((task) => task.lastThreadId && !previousTaskThreads.has(task.lastThreadId));
  state.recordHome = snapshot.recordHome || state.recordHome;
  const isHidden = activeId ? state.hiddenThreadIds.has(activeId) : false;
  const isDeleted = activeId ? state.deletedThreadIds.has(activeId) : false;
  const isLocalArchived = activeId ? state.localArchivedThreadIds.has(activeId) : false;
  renderProviderOptions();
  state.allThreads = threadsForCurrentView();
  updateThreadViewControls();
  syncProjects();
  applyThreadFilter();
  const wasInView = activeId
    ? state.threadView === "removed"
      ? wasHidden && !wasDeleted
      : state.threadView === "scheduled"
        ? false
        : state.threadView === "archived"
          ? !wasHidden && !wasDeleted && (providerArchived || wasLocalArchived)
          : !wasHidden && !wasDeleted && !wasLocalArchived
    : false;
  const isInView = activeId
    ? state.threadView === "removed"
      ? isHidden && !isDeleted
      : state.threadView === "scheduled"
        ? false
        : state.threadView === "archived"
          ? !isHidden && !isDeleted && (providerArchived || isLocalArchived)
          : !isHidden && !isDeleted && !isLocalArchived
    : false;
  if (activeId && wasInView !== isInView) newChat(false);
  else if (state.activeThread) elements.windowTitle.textContent = titleOf(state.activeThread);
  if (activeProviderWasRemoved) {
    ++state.connectionGeneration;
    state.connectingProvider = null;
    state.provider = null;
    state.providerType = null;
    state.modelProvider = null;
    state.modelCatalog = [];
    state.account = null;
    state.rateLimits = null;
    state.relayBalance = null;
    setConnected(false);
    newChat(false);
    elements.providerName.textContent = "未连接";
    elements.providerState.textContent = "选择账号或 API";
    elements.providerMark.textContent = "S";
    elements.overlay.classList.remove("hidden");
    elements.providerError.textContent = "当前连接已删除，请选择其他连接方式。";
  } else if (previousRecordHome !== state.recordHome && state.provider) {
    connect(state.provider);
  } else if (hasNewTaskThread && state.connected) {
    loadThreads();
  }
}

async function openThread(thread) {
  const generation = ++state.openThreadGeneration;
  const isCurrent = () => generation === state.openThreadGeneration;
  clearRequestsForThreadChange(thread.id);
  state.openingThread = true;
  state.workspace = thread.cwd || state.workspace;
  state.activeThread = thread;
  state.threadResumed = false;
  state.activeArchived = Boolean(thread._archived || thread._removed);
  state.activeTurn = null;
  elements.windowTitle.textContent = titleOf(thread);
  updateWorkspace();
  setRunning(false);
  applyThreadSessionSettings(thread);
  updateActiveThreadSelection();
  if (!showCachedConversation(thread)) showThreadLoading();
  try {
    const pendingConnection = state.connectionPromise;
    if (pendingConnection) await pendingConnection;
    if (!isCurrent()) return;
    if (!state.connected) throw new Error("请先连接账号或 API。 ");
    if (state.activeArchived) {
      const readResult = await api.readThread(thread.id);
      if (!isCurrent()) return;
      state.activeThread = readResult.thread;
      applyThreadSessionSettings(readResult.thread);
      renderConversation(readResult.thread);
      showDiagnostic(`${thread._removed ? "已移除" : "归档"}会话以只读方式打开，官方 Codex 记录未修改。`, false);
      return;
    }
    try {
      if (!isCurrent() || !state.connected) return;
      const result = await api.resumeThread({
        threadId: thread.id,
        cwd: state.workspace,
        modelProvider: state.modelProvider,
        ...selectedSessionSettings(),
      });
      if (!isCurrent()) return;
      state.activeThread = result.thread;
      state.threadResumed = true;
      applyThreadSessionSettings(result.thread);
      renderConversation(result.thread);
    } catch (error) {
      if (!isCurrent()) return;
      const readResult = await api.readThread(thread.id);
      if (!isCurrent()) return;
      state.activeThread = readResult.thread;
      applyThreadSessionSettings(readResult.thread);
      renderConversation(readResult.thread);
      showDiagnostic(`会话已只读打开；暂时无法继续对话：${error.message}`, true);
    }
  } catch (error) {
    if (!isCurrent()) return;
    showThreadOpenError(error.message);
    showDiagnostic(error.message, true);
  } finally {
    if (isCurrent()) {
      state.openingThread = false;
      syncComposerState();
    }
  }
}

function showThreadLoading() {
  if (state.renderedThreadId) parkRenderedConversation();
  elements.empty.classList.add("hidden");
  elements.chat.classList.remove("hidden");
  elements.chat.innerHTML = '<div class="conversation-state conversation-loading" role="status" aria-label="正在打开会话"><span data-lucide="loader-circle"></span><span>正在打开会话</span></div>';
  refreshIcons();
}

function showThreadOpenError(message) {
  if (state.renderedThreadId) parkRenderedConversation();
  elements.empty.classList.add("hidden");
  elements.chat.classList.remove("hidden");
  elements.chat.innerHTML = `<div class="conversation-state conversation-error" role="alert"><span data-lucide="circle-alert"></span><span>${escapeHtml(message || "无法打开会话")}</span></div>`;
  refreshIcons();
}

function updateActiveThreadSelection() {
  const activeId = state.activeThread?.id || null;
  elements.threadList.querySelectorAll(".thread-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.threadId === activeId);
  });
}

function itemRevision(item) {
  const contentLength = Array.isArray(item?.content)
    ? item.content.reduce((total, part) => total + String(part?.text || part?.path || part?.url || "").length, 0)
    : 0;
  return [
    item?.id,
    item?.type,
    item?.status,
    String(item?.text || "").length,
    String(item?.aggregatedOutput || "").length,
    contentLength,
  ].join(":");
}

function conversationRevision(thread) {
  const turns = thread?.turns || [];
  const lastTurn = turns.at(-1) || null;
  const lastItems = lastTurn?.items || [];
  return `${turns.length}:${lastTurn?.id || ""}:${lastItems.length}:${itemRevision(lastItems.at(-1))}`;
}

function parkRenderedConversation() {
  if (!state.renderedThreadId || !elements.chat.childNodes.length) {
    state.renderedThreadId = null;
    state.renderedThreadRevision = null;
    return;
  }
  if (elements.chat.childElementCount > 250) {
    elements.chat.replaceChildren();
    state.renderedThreadId = null;
    state.renderedThreadRevision = null;
    state.streamNodes = new Map();
    return;
  }
  const fragment = document.createDocumentFragment();
  fragment.append(...elements.chat.childNodes);
  state.conversationCache.delete(state.renderedThreadId);
  state.conversationCache.set(state.renderedThreadId, {
    fragment,
    revision: state.renderedThreadRevision,
    streamNodes: state.streamNodes,
  });
  while (state.conversationCache.size > 1) {
    state.conversationCache.delete(state.conversationCache.keys().next().value);
  }
  state.renderedThreadId = null;
  state.renderedThreadRevision = null;
  state.streamNodes = new Map();
}

function showCachedConversation(thread) {
  const threadId = thread?.id;
  if (!threadId) return false;
  if (state.renderedThreadId === threadId) return true;
  const cached = state.conversationCache.get(threadId);
  if (!cached) return false;
  parkRenderedConversation();
  state.conversationCache.delete(threadId);
  elements.empty.classList.add("hidden");
  elements.chat.classList.remove("hidden");
  elements.chat.replaceChildren(cached.fragment);
  state.streamNodes = cached.streamNodes;
  state.renderedThreadId = threadId;
  state.renderedThreadRevision = cached.revision;
  scrollToBottom();
  return true;
}

function renderConversation(thread) {
  const revision = conversationRevision(thread);
  elements.windowTitle.textContent = titleOf(thread);
  elements.empty.classList.add("hidden");
  elements.chat.classList.remove("hidden");
  if (state.renderedThreadId === thread.id && state.renderedThreadRevision === revision) {
    scrollToBottom();
    return;
  }
  if (state.renderedThreadId && state.renderedThreadId !== thread.id) parkRenderedConversation();
  state.streamNodes.clear();
  const fragment = document.createDocumentFragment();
  const turns = thread.turns || [];
  const visibleCount = state.visibleTurnCounts.get(thread.id) || INITIAL_VISIBLE_TURNS;
  const serverWindowed = Number.isFinite(Number(thread._totalTurnCount));
  const totalTurnCount = serverWindowed ? Number(thread._totalTurnCount) : turns.length;
  const firstVisibleTurn = serverWindowed ? 0 : Math.max(0, turns.length - visibleCount);
  const omittedTurnCount = serverWindowed
    ? Math.max(0, Number(thread._turnOffset) || totalTurnCount - turns.length)
    : firstVisibleTurn;
  if (omittedTurnCount > 0) {
    const earlier = document.createElement("button");
    earlier.type = "button";
    earlier.className = "load-earlier-turns";
    earlier.textContent = `加载更早记录（剩余 ${omittedTurnCount} 轮）`;
    earlier.addEventListener("click", async () => {
      earlier.disabled = true;
      try {
        const nextCount = Math.min(totalTurnCount, turns.length + EARLIER_TURN_BATCH);
        if (serverWindowed) {
          const result = await api.readThreadWindow({ threadId: thread.id, turnCount: nextCount });
          const expanded = { ...thread, ...result.thread };
          state.activeThread = expanded;
          state.renderedThreadRevision = null;
          renderConversation(expanded);
        } else {
          state.visibleTurnCounts.set(thread.id, visibleCount + EARLIER_TURN_BATCH);
          state.renderedThreadRevision = null;
          renderConversation(thread);
        }
      } catch (error) {
        earlier.disabled = false;
        showActionError(error);
      }
    });
    fragment.appendChild(earlier);
  }
  state.renderTarget = fragment;
  try {
    for (const turn of turns.slice(firstVisibleTurn)) {
      for (const item of turn.items || []) renderItem(item, turn.id);
    }
  } finally {
    state.renderTarget = null;
  }
  elements.chat.replaceChildren(fragment);
  state.renderedThreadId = thread.id;
  state.renderedThreadRevision = revision;
  refreshIcons();
  scrollToBottom();
}

function conversationTarget() {
  return state.renderTarget || elements.chat;
}

function userText(item) {
  return (item.content || []).flatMap((part) => {
    if (part.type === "text") return [part.text];
    if (part.type === "skill") return [`/${part.name}`];
    if (part.type === "mention") return [`@${part.name}`];
    return [];
  }).join("\n");
}

function parseSkillInvocations(text) {
  const selected = new Map();
  const available = new Map(state.skills.map((skill) => [skill.name, skill]));
  const prompt = String(text || "").replace(
    /(^|\s)([/\$])([\w-]+)(?=\s|$)/g,
    (match, whitespace, _prefix, name) => {
      const skill = available.get(name);
      if (!skill?.path) return match;
      selected.set(name, { name, path: skill.path });
      return whitespace;
    },
  ).replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim();
  return { prompt, skillInputs: [...selected.values()] };
}

function renderItem(item, turnId = null) {
  if (!item) return;
  if (item.type === "userMessage") {
    if (item.clientId) {
      const optimistic = document.querySelector(`[data-message-id="${CSS.escape(item.clientId)}"]`);
      if (optimistic) optimistic.dataset.messageId = item.id;
    }
    return appendUserMessage(item);
  }
  if (item.type === "agentMessage") return appendMessage("agent", item.text, item.id, item.phase);
  if (item.type === "plan") {
    return appendActivity({
      ...item,
      command: "计划",
      aggregatedOutput: String(item.text || ""),
      displayOutput: true,
    }, turnId);
  }
  if (item.type === "reasoning") {
    const summary = (item.summary || [])
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .filter(Boolean)
      .join("\n");
    if (!summary) return null;
    return appendActivity({
      ...item,
      command: "思考摘要",
      aggregatedOutput: summary,
      displayOutput: true,
    }, turnId);
  }
  if (item.type === "imageView") {
    appendActivity(item, turnId);
    return appendActivityImage(item.id, item.path, turnId);
  }
  if (item.type === "imageGeneration") {
    appendActivity(item, turnId);
    return appendActivityImage(item.id, item.savedPath || item.result, turnId, Boolean(item.savedPath));
  }
  if (["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "webSearch", "collabAgentToolCall"].includes(item.type)) {
    const labels = {
      commandExecution: "执行命令",
      fileChange: "修改文件",
      mcpToolCall: "使用工具",
      dynamicToolCall: "使用工具",
      webSearch: "搜索资料",
      collabAgentToolCall: "协作任务",
    };
    return appendActivity({
      id: item.id,
      type: item.type,
      command: labels[item.type] || "执行操作",
      status: item.status,
    }, turnId);
  }
}

function localImageUrl(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const encoded = normalized.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  if (normalized.startsWith("//")) return `file:${encoded}`;
  return `file:///${encoded.replace(/^([A-Za-z])%3A/i, "$1:")}`;
}

function safeImageSource(value, isLocal = false) {
  if (!value) return null;
  if (isLocal) return localImageUrl(value);
  const source = String(value);
  if (/^data:image\//i.test(source) || /^https:\/\//i.test(source) || /^file:\/\//i.test(source)) return source;
  if (/^[A-Za-z]:[\\/]/.test(source) || /^\\\\/.test(source)) return localImageUrl(source);
  return null;
}

function appendUserMessage(item) {
  const node = appendMessage("user", userText(item), item.id);
  node.querySelector(".message-media")?.remove();
  const images = (item.content || []).filter((part) => ["image", "localImage"].includes(part.type));
  if (!images.length) return node;
  const media = document.createElement("div");
  media.className = "message-media";
  for (const part of images) {
    const source = safeImageSource(part.type === "localImage" ? part.path : part.url, part.type === "localImage");
    if (!source) {
      const fallback = document.createElement("span");
      fallback.className = "image-fallback";
      fallback.textContent = "图片来源不受支持";
      media.appendChild(fallback);
      continue;
    }
    const image = document.createElement("img");
    image.src = source;
    image.alt = "会话图片";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      const fallback = document.createElement("span");
      fallback.className = "image-fallback";
      fallback.textContent = `图片无法加载：${part.path || part.url || "未知来源"}`;
      image.replaceWith(fallback);
    }, { once: true });
    media.appendChild(image);
  }
  node.querySelector(".message-body").appendChild(media);
  return node;
}

function appendMessage(role, text, id = crypto.randomUUID(), phase = null) {
  const target = conversationTarget();
  let node = target.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  if (!node) {
    node = document.createElement("article");
    node.className = `message ${role}`;
    node.dataset.messageId = id;
    node.innerHTML = `<div class="message-avatar">${role === "user" ? "YOU" : state.providerType === "claude" ? "CL" : "CX"}</div><div class="message-body"></div>`;
    target.appendChild(node);
  }
  node.querySelector(".message-body").innerHTML = role === "agent" ? renderMarkdown(text) : `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`;
  if (role === "agent") node.dataset.rawText = String(text || "");
  if (phase) node.dataset.phase = phase;
  state.streamNodes.set(id, node);
  if (!state.renderTarget) scrollToBottom();
  return node;
}

function appendActivity(item, turnId = null) {
  const target = conversationTarget();
  let group = target.lastElementChild?.classList.contains("activity") ? target.lastElementChild : null;
  if (group && turnId && group.dataset.turnId !== turnId) group = null;
  if (!group) {
    group = document.createElement("div");
    group.className = "activity";
    if (turnId) group.dataset.turnId = turnId;
    target.appendChild(group);
  }
  let row = group.querySelector(`[data-activity-id="${CSS.escape(item.id)}"]`);
  if (!row) {
    row = document.createElement("div");
    row.className = "activity-row";
    row.dataset.activityId = item.id;
    group.appendChild(row);
  }
  const details = item.command || item.tool || item.query || item.path || (item.changes ? `${item.changes.length} 个文件变更` : item.type);
  const icon = item.type === "commandExecution" ? "terminal" : item.type === "fileChange" ? "file-diff" : item.type === "webSearch" ? "globe" : "wrench";
  const output = item.displayOutput && item.aggregatedOutput
    ? `<pre class="activity-output">${escapeHtml(item.aggregatedOutput)}</pre>`
    : "";
  row.innerHTML = `<span data-lucide="${icon}"></span><code>${escapeHtml(details)}</code><span>${escapeHtml(item.status || "")}</span>${output}`;
  if (!state.renderTarget) {
    refreshIcons();
    scrollToBottom();
  }
}

function appendActivityImage(itemId, value, turnId, isLocal = true) {
  const source = safeImageSource(value, isLocal);
  if (!source) return;
  const row = conversationTarget().querySelector(`[data-activity-id="${CSS.escape(itemId)}"]`);
  if (!row) return;
  row.querySelector(".activity-image")?.remove();
  const image = document.createElement("img");
  image.className = "activity-image";
  image.src = source;
  image.alt = "Codex 查看或生成的图片";
  image.loading = "lazy";
  image.addEventListener("error", () => image.remove(), { once: true });
  row.appendChild(image);
  if (turnId) row.closest(".activity").dataset.turnId = turnId;
}

function appendActivityDelta(itemId, turnId, label, delta, icon = "terminal") {
  let row = elements.chat.querySelector(`[data-activity-id="${CSS.escape(itemId)}"]`);
  if (!row) {
    appendActivity({ id: itemId, type: "stream", command: label, status: "进行中" }, turnId);
    row = elements.chat.querySelector(`[data-activity-id="${CSS.escape(itemId)}"]`);
  }
  let output = row.querySelector(".activity-output");
  if (!output) {
    output = document.createElement("pre");
    output.className = "activity-output";
    row.appendChild(output);
  }
  output.textContent += delta || "";
  if (!row.querySelector("svg")) row.insertAdjacentHTML("afterbegin", `<span data-lucide="${icon}"></span>`);
  scrollToBottom();
}

function showDiagnostic(message, isError = false) {
  if (!message || /Ignored unsupported project-local config/.test(message)) return;
  if (["api", "relay"].includes(state.providerType)
    && /(?:failed to fetch codex rate limits|无法读取账号额度|backend-api\/wham\/usage)/i.test(message)) return;
  clearTimeout(elements.statusToast._timer);
  elements.statusToast.textContent = message;
  elements.statusToast.classList.toggle("error", isError);
  elements.statusToast.classList.remove("hidden");
  elements.statusToast._timer = setTimeout(() => elements.statusToast.classList.add("hidden"), isError ? 9000 : 5000);
}

async function sendMessage() {
  const text = elements.input.value.trim();
  if (!text || !state.connected || state.running) return;
  const { prompt, skillInputs } = parseSkillInvocations(text);
  const generation = state.openThreadGeneration;
  const isCurrent = (threadId = null) => generation === state.openThreadGeneration
    && (!threadId || state.activeThread?.id === threadId);
  const workspace = state.workspace;
  const sessionSettings = selectedSessionSettings();
  const initialThread = state.activeThread;
  const needsResume = Boolean(initialThread && !state.threadResumed);
  elements.input.value = "";
  resizeComposer();
  state.stopRequested = false;
  state.interruptingTurnId = null;
  setRunning(true);
  try {
    let targetThread = initialThread;
    if (!targetThread) {
      const created = await api.startThread({ cwd: workspace, ...sessionSettings });
      targetThread = created.thread;
      if (state.activeProject && !state.activeProject.root && !state.activeProject.inferred) {
        state.projectThreads = await api.assignThreadToProject({
          threadId: targetThread.id,
          projectId: state.activeProject.id,
        });
      }
      state.threadSettings[threadSettingsKey(targetThread.id)] = { ...sessionSettings, updatedAt: Date.now() };
      try {
        state.threadSettings = await api.saveThreadSettings({
          threadId: targetThread.id,
          providerId: state.provider,
          ...sessionSettings,
        });
      } catch (error) {
        if (generation === state.openThreadGeneration) showDiagnostic(`会话已创建，但模型设置保存失败：${error.message}`, true);
      }
      const name = text.split(/\r?\n/)[0].slice(0, 52);
      try {
        state.threadAliases = await api.renameThreadLocal({ threadId: targetThread.id, name });
      } catch (error) {
        if (generation === state.openThreadGeneration) showDiagnostic(`会话已创建，但自动命名失败：${error.message}`, true);
      }
      if (generation === state.openThreadGeneration) {
        state.activeThread = targetThread;
        state.threadResumed = true;
        state.activeArchived = false;
        parkRenderedConversation();
        state.renderedThreadId = targetThread.id;
        state.renderedThreadRevision = null;
        elements.empty.classList.add("hidden");
        elements.chat.classList.remove("hidden");
        elements.chat.innerHTML = "";
        elements.windowTitle.textContent = titleOf(targetThread);
      }
    } else if (needsResume) {
      const resumed = await api.resumeThread({
        threadId: targetThread.id,
        cwd: workspace,
        modelProvider: state.modelProvider,
        ...sessionSettings,
      });
      targetThread = resumed.thread;
      if (isCurrent(targetThread.id)) {
        state.activeThread = targetThread;
        state.threadResumed = true;
      }
    }
    const clientUserMessageId = crypto.randomUUID();
    if (isCurrent(targetThread.id)) appendMessage("user", text, clientUserMessageId);
    const result = await api.startTurn({
      threadId: targetThread.id,
      text: prompt,
      skillInputs,
      cwd: workspace,
      clientUserMessageId,
      ...sessionSettings,
    });
    if (isCurrent(targetThread.id)) {
      state.activeTurn = result.turn?.id || null;
      flushPendingInterrupt();
    }
    await loadThreads();
  } catch (error) {
    if (generation === state.openThreadGeneration) {
      setRunning(false);
      showDiagnostic(error.message, true);
    }
  }
}

function setRunning(running) {
  state.running = running;
  if (!running) {
    state.stopRequested = false;
    state.interruptingTurnId = null;
    elements.stop.disabled = false;
    elements.stop.title = "停止";
  }
  elements.send.classList.toggle("hidden", running);
  elements.stop.classList.toggle("hidden", !running);
  syncComposerState();
}

async function flushPendingInterrupt() {
  const threadId = state.activeThread?.id;
  const turnId = state.activeTurn;
  if (!state.stopRequested || !threadId || !turnId || state.interruptingTurnId === turnId) return;
  state.interruptingTurnId = turnId;
  try {
    await api.interruptTurn({ threadId, turnId });
  } catch (error) {
    if (state.activeTurn === turnId) {
      state.interruptingTurnId = null;
      state.stopRequested = false;
      elements.stop.disabled = false;
      elements.stop.title = "停止";
      showActionError(error);
    }
  }
}

function requestTurnInterrupt() {
  if (!state.running) return;
  state.stopRequested = true;
  elements.stop.disabled = true;
  elements.stop.title = "正在停止";
  flushPendingInterrupt();
}

function scheduleThreadRefresh(delay = 300) {
  clearTimeout(state.threadRefreshTimer);
  state.threadRefreshTimer = setTimeout(() => {
    state.threadRefreshTimer = null;
    if (state.connected) loadThreads();
  }, delay);
}

function syncComposerState() {
  const disabled = !state.connected || state.activeArchived || state.openingThread;
  elements.input.disabled = disabled;
  elements.send.disabled = disabled || state.running || !elements.input.value.trim();
  const controlsDisabled = disabled || state.running || state.modelCatalog.length === 0;
  elements.sessionModel.disabled = controlsDisabled;
  elements.sessionEffort.disabled = controlsDisabled;
  elements.modeBadge.disabled = disabled || state.running;
  elements.skillButton.disabled = disabled || state.running || state.skillsLoading || state.providerType === "claude";
  elements.input.placeholder = state.activeArchived
    ? "当前会话为只读"
    : state.openingThread ? "正在加载会话"
    : state.providerType === "claude" ? "给 Claude 发送消息" : "给 Codex 发送消息";
}

function refreshAccountStatus() {
  if (!state.connected || !["official", "account"].includes(state.providerType)) return Promise.resolve();
  if (state.accountRefreshPromise) return state.accountRefreshPromise;
  const generation = state.connectionGeneration;
  const task = api.accountStatus()
    .then((snapshot) => {
      if (generation === state.connectionGeneration) applyAccountSnapshot(snapshot);
    })
    .catch((error) => showDiagnostic(`账号状态刷新失败：${error.message}`, true))
    .finally(() => {
      if (state.accountRefreshPromise === task) state.accountRefreshPromise = null;
    });
  state.accountRefreshPromise = task;
  return task;
}

function handleEvent(message) {
  const { method, params = {} } = message;
  if (method === "skills/changed") {
    loadSkills(true);
    return;
  }
  if (method === "thread/settings/updated") {
    const settings = params.threadSettings || {};
    state.appliedThreadSettings.set(params.threadId, {
      model: settings.model || null,
      effort: settings.effort || null,
      approvalMode: approvalModeFromSettings(settings),
      modelProvider: settings.modelProvider || null,
    });
    if (params.threadId === state.activeThread?.id) renderAppliedSettings();
    return;
  }
  if (method === "model/rerouted") {
    state.reroutedModels.set(params.threadId, {
      fromModel: params.fromModel,
      toModel: params.toModel,
      reason: params.reason,
    });
    if (params.threadId === state.activeThread?.id) renderAppliedSettings();
    showDiagnostic(`模型已由服务端重路由：${params.fromModel} → ${params.toModel}`, false);
    return;
  }
  if (method === "provider/model-resolved") {
    const requested = params.requestedModel || "未知";
    const actual = params.actualModel || requested;
    const vendor = state.providers.find((item) => item.id === "claude")?.vendorLabel || "Claude";
    elements.providerState.textContent = requested === actual
      ? `${vendor} · ${actual}`
      : `${vendor} · ${requested} → ${actual}`;
    if (params.threadId) {
      state.appliedThreadSettings.set(params.threadId, {
        model: requested,
        effort: selectedSessionSettings().effort,
        approvalMode: state.approvalMode,
        modelProvider: "claude",
      });
      if (requested !== actual) {
        state.reroutedModels.set(params.threadId, {
          fromModel: requested,
          toModel: actual,
          reason: "provider",
        });
      }
      if (params.threadId === state.activeThread?.id) renderAppliedSettings();
    }
    if (requested !== actual) showDiagnostic(`Claude 模型路由：${requested} → ${actual}`, false);
    return;
  }
  if (["account/updated", "account/rateLimits/updated", "account/login/completed"].includes(method)) {
    refreshAccountStatus();
    return;
  }
  if (method === "conversation/mirror/updated") {
    scheduleThreadRefresh(1200);
    const count = Number(params.copied || 0) + Number(params.updated || 0);
    if (count) showDiagnostic(`已同步 ${count} 条本地聊天记录。`, false);
    return;
  }
  const eventThreadId = params.threadId || params.conversationId || null;
  const globallyRelevant = ["thread/name/updated", "thread/started", "thread/archived", "thread/unarchived", "thread/deleted"].includes(method);
  if (eventThreadId && !globallyRelevant && eventThreadId !== state.activeThread?.id) return;
  if (method === "item/started" || method === "item/completed") {
    renderItem(params.item, params.turnId);
  } else if (method === "item/agentMessage/delta") {
    const id = params.itemId || "stream-agent";
    const node = state.streamNodes.get(id) || appendMessage("agent", "", id, "commentary");
    const body = node.querySelector(".message-body");
    const text = `${node.dataset.rawText || ""}${params.delta || ""}`;
    node.dataset.rawText = text;
    body.innerHTML = renderMarkdown(text);
    scrollToBottom();
  } else if (method === "item/commandExecution/outputDelta" || method === "item/fileChange/outputDelta") {
    return;
  } else if (method === "item/reasoning/summaryTextDelta") {
    appendActivityDelta(params.itemId, params.turnId, "思考过程", params.delta, "brain");
  } else if (method === "item/plan/delta") {
    appendActivityDelta(params.itemId, params.turnId, "计划", params.delta, "list-checks");
  } else if (method === "turn/started") {
    state.activeTurn = params.turn?.id || state.activeTurn;
    setRunning(true);
    flushPendingInterrupt();
  } else if (method === "turn/completed") {
    const status = params.turn?.status;
    setRunning(false);
    state.activeTurn = null;
    if (status === "failed") showDiagnostic(params.turn?.error?.message || "本轮执行失败。", true);
    if (status === "interrupted") showDiagnostic("本轮已停止。", false);
    scheduleThreadRefresh();
  } else if (method === "thread/name/updated") {
    if (state.activeThread?.id === params.threadId) {
      state.activeThread.name = params.threadName || state.activeThread.name;
      elements.windowTitle.textContent = titleOf(state.activeThread);
    }
    scheduleThreadRefresh();
  } else if (["thread/started", "thread/archived", "thread/unarchived"].includes(method)) {
    scheduleThreadRefresh();
  } else if (method === "thread/deleted") {
    if (state.activeThread?.id === params.threadId) newChat(false);
    scheduleThreadRefresh();
  } else if (method === "serverRequest/resolved") {
    resolveApproval(params.requestId);
  } else if (["error", "warning", "guardianWarning", "configWarning", "deprecationNotice"].includes(method)) {
    const detail = params.message || params.error?.message || JSON.stringify(params);
    showDiagnostic(detail, method === "error");
  }
}

function showApproval(request) {
  const requestThreadId = request.params?.threadId || request.params?.conversationId;
  if (requestThreadId && requestThreadId !== state.activeThread?.id) {
    api.answerApproval({ id: request.id, result: declinedRequestResult(request) })
      .catch((error) => showDiagnostic(error.message, true));
    return;
  }
  if (state.activeApproval?.id === request.id || state.approvalQueue.some((item) => item.id === request.id)) return;
  state.approvalQueue.push(request);
  renderNextApproval();
}

function declinedRequestResult(request) {
  if (request.method === "item/tool/requestUserInput") {
    return { answers: Object.fromEntries((request.params?.questions || []).map((question) => [question.id, { answers: [] }])) };
  }
  if (request.method === "mcpServer/elicitation/request") return { action: "decline", content: null, _meta: null };
  return approvalResult(request, "decline");
}

function approvalResult(request, decision) {
  const params = request.params || {};
  if (request.method === "item/permissions/requestApproval") {
    const granted = {};
    if (decision.startsWith("accept") && params.permissions?.network) granted.network = params.permissions.network;
    if (decision.startsWith("accept") && params.permissions?.fileSystem) granted.fileSystem = params.permissions.fileSystem;
    return { permissions: granted, scope: decision === "acceptForSession" ? "session" : "turn" };
  }
  if (["applyPatchApproval", "execCommandApproval"].includes(request.method)) {
    const legacyDecision = decision === "accept" ? "approved"
      : decision === "acceptForSession" ? "approved_for_session"
        : decision === "cancel" ? "abort" : "denied";
    return { decision: legacyDecision };
  }
  return { decision };
}

function renderNextApproval() {
  if (state.activeApproval || state.approvalQueue.length === 0) {
    elements.approval.classList.toggle("hidden", !state.activeApproval);
    return;
  }
  const request = state.approvalQueue.shift();
  state.activeApproval = request;
  if (request.method === "item/tool/requestUserInput") {
    renderUserInputRequest(request);
    return;
  }
  if (request.method === "mcpServer/elicitation/request") {
    renderMcpElicitationRequest(request);
    return;
  }
  elements.approval.classList.remove("request-banner");
  const params = request.params || {};
  const detail = params.command || params.reason || JSON.stringify(params.permissions || params, null, 2);
  elements.approval.classList.remove("hidden");
  elements.approval.innerHTML = `<div class="approval-title">Codex 请求授权</div><div class="approval-detail">${escapeHtml(detail)}</div><div class="approval-actions"><button data-decision="decline">拒绝</button><button data-decision="acceptForSession">本会话允许</button><button class="approve" data-decision="accept">允许一次</button></div>`;
  elements.approval.querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
    const decision = button.dataset.decision;
    for (const action of elements.approval.querySelectorAll("button")) action.disabled = true;
    await answerServerRequest(request, approvalResult(request, decision));
  }));
}

async function answerServerRequest(request, result) {
  for (const action of elements.approval.querySelectorAll("button")) action.disabled = true;
  try {
    await api.answerApproval({ id: request.id, result });
    resolveApproval(request.id);
  } catch (error) {
    showDiagnostic(error.message, true);
    for (const action of elements.approval.querySelectorAll("button")) action.disabled = false;
  }
}

function renderUserInputRequest(request) {
  const questions = request.params?.questions || [];
  elements.approval.classList.add("request-banner");
  elements.approval.classList.remove("hidden");
  elements.approval.innerHTML = `<div class="approval-title">Codex 需要你的选择</div><form class="request-form"></form>`;
  const form = elements.approval.querySelector("form");
  questions.forEach((question, index) => {
    const field = document.createElement("label");
    field.className = "request-question";
    field.innerHTML = `<strong>${escapeHtml(question.header || `问题 ${index + 1}`)}</strong><span>${escapeHtml(question.question)}</span>`;
    const options = question.options || [];
    if (options.length) {
      const group = document.createElement("div");
      group.className = "request-options";
      options.forEach((option, optionIndex) => {
        const row = document.createElement("label");
        row.className = "request-option";
        row.innerHTML = `<input type="radio" name="question-${index}" value="${escapeHtml(option.label)}" ${optionIndex === 0 ? "required" : ""}><span>${escapeHtml(option.label)}<small>${escapeHtml(option.description || "")}</small></span>`;
        group.appendChild(row);
      });
      if (question.isOther) {
        const other = document.createElement("label");
        other.className = "request-option";
        other.innerHTML = `<input type="radio" name="question-${index}" value="__other__"><span>其他</span>`;
        group.appendChild(other);
        const otherInput = document.createElement("input");
        otherInput.type = question.isSecret ? "password" : "text";
        otherInput.name = `other-${index}`;
        otherInput.placeholder = "输入其他回答";
        group.appendChild(otherInput);
      }
      field.appendChild(group);
    } else {
      const input = document.createElement("input");
      input.type = question.isSecret ? "password" : "text";
      input.name = `question-${index}`;
      input.required = true;
      field.appendChild(input);
    }
    form.appendChild(field);
  });
  form.insertAdjacentHTML("beforeend", '<div class="approval-actions"><button type="button" data-skip>跳过</button><button class="approve" type="submit">提交</button></div>');
  form.querySelector("[data-skip]").addEventListener("click", () => answerServerRequest(request, declinedRequestResult(request)));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const answers = {};
    questions.forEach((question, index) => {
      const selected = form.querySelector(`[name="question-${index}"]:checked`);
      const direct = form.querySelector(`[name="question-${index}"]:not([type="radio"])`);
      let value = selected?.value || direct?.value || "";
      if (value === "__other__") value = form.querySelector(`[name="other-${index}"]`)?.value || "";
      answers[question.id] = { answers: value ? [value] : [] };
    });
    answerServerRequest(request, { answers });
  });
}

function renderMcpElicitationRequest(request) {
  const params = request.params || {};
  elements.approval.classList.remove("hidden");
  if (params.mode === "url") {
    elements.approval.classList.remove("request-banner");
    elements.approval.innerHTML = `<div class="approval-title">${escapeHtml(params.serverName)} 请求在浏览器中继续</div><div class="approval-detail">${escapeHtml(params.message)}\n${escapeHtml(params.url)}</div><div class="approval-actions"><button data-decline>拒绝</button><button class="approve" data-open>打开链接</button></div>`;
    elements.approval.querySelector("[data-decline]").addEventListener("click", () => answerServerRequest(request, { action: "decline", content: null, _meta: null }));
    elements.approval.querySelector("[data-open]").addEventListener("click", async () => {
      try {
        await api.openExternal(params.url);
        await answerServerRequest(request, { action: "accept", content: null, _meta: params._meta || null });
      } catch (error) {
        showDiagnostic(error.message, true);
      }
    });
    return;
  }
  const schema = params.requestedSchema || {};
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  elements.approval.classList.add("request-banner");
  elements.approval.innerHTML = `<div class="approval-title">${escapeHtml(params.serverName)} 请求信息</div><div class="approval-detail">${escapeHtml(params.message || "")}</div><form class="request-form"></form>`;
  const form = elements.approval.querySelector("form");
  for (const [name, definition] of Object.entries(properties)) {
    form.appendChild(buildMcpField(name, definition || {}, required.has(name)));
  }
  form.insertAdjacentHTML("beforeend", '<div class="approval-actions"><button type="button" data-decline>拒绝</button><button class="approve" type="submit">提交</button></div>');
  form.querySelector("[data-decline]").addEventListener("click", () => answerServerRequest(request, { action: "decline", content: null, _meta: null }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const content = {};
    for (const [name, definition] of Object.entries(properties)) {
      const input = form.elements.namedItem(name);
      if (!input) continue;
      if (definition.type === "boolean") {
        if (input.checked || required.has(name) || definition.default !== undefined) content[name] = input.checked;
      } else if (["number", "integer"].includes(definition.type)) {
        if (input.value !== "") content[name] = Number(input.value);
      } else if (definition.type === "array") {
        const values = [...input.selectedOptions].map((option) => option.value);
        if (values.length || required.has(name)) content[name] = values;
      } else if (input.value !== "" || required.has(name)) {
        content[name] = input.value;
      }
    }
    answerServerRequest(request, { action: "accept", content, _meta: params._meta || null });
  });
}

function buildMcpField(name, definition, isRequired) {
  const field = document.createElement("label");
  field.className = "request-question";
  field.innerHTML = `<strong>${escapeHtml(definition.title || name)}</strong>${definition.description ? `<span>${escapeHtml(definition.description)}</span>` : ""}`;
  let input;
  const options = definition.enum || definition.oneOf || definition.items?.enum || definition.items?.anyOf || null;
  if (options) {
    input = document.createElement("select");
    input.multiple = definition.type === "array";
    if (!input.multiple && !isRequired) input.appendChild(new Option("", ""));
    for (const option of options) input.appendChild(new Option(option.title || option, option.const || option));
  } else {
    input = document.createElement("input");
    input.type = definition.type === "boolean" ? "checkbox"
      : ["number", "integer"].includes(definition.type) ? "number"
        : definition.format === "uri" ? "url"
          : definition.format === "email" ? "email"
            : definition.format === "date" ? "date"
              : definition.format === "date-time" ? "datetime-local" : "text";
    if (definition.minimum !== undefined) input.min = definition.minimum;
    if (definition.maximum !== undefined) input.max = definition.maximum;
    if (definition.minLength !== undefined) input.minLength = definition.minLength;
    if (definition.maxLength !== undefined) input.maxLength = definition.maxLength;
  }
  input.name = name;
  input.required = isRequired && definition.type !== "boolean";
  if (definition.default !== undefined && definition.type !== "array") {
    if (definition.type === "boolean") input.checked = definition.default;
    else input.value = definition.default;
  }
  if (definition.type === "array" && Array.isArray(definition.default)) {
    for (const option of input.options) option.selected = definition.default.includes(option.value);
  }
  field.appendChild(input);
  return field;
}

function resolveApproval(requestId) {
  state.approvalQueue = state.approvalQueue.filter((request) => String(request.id) !== String(requestId));
  if (state.activeApproval && String(state.activeApproval.id) === String(requestId)) {
    state.activeApproval = null;
    elements.approval.classList.add("hidden");
  }
  renderNextApproval();
}

function clearRequestsForThreadChange(nextThreadId) {
  const pending = [state.activeApproval, ...state.approvalQueue].filter(Boolean);
  const keep = [];
  for (const request of pending) {
    const requestThreadId = request.params?.threadId || request.params?.conversationId || null;
    if (!requestThreadId || requestThreadId === nextThreadId) {
      keep.push(request);
      continue;
    }
    api.answerApproval({ id: request.id, result: declinedRequestResult(request) }).catch(showActionError);
  }
  state.activeApproval = null;
  state.approvalQueue = keep;
  elements.approval.classList.add("hidden");
  renderNextApproval();
}

function newChat(switchToActive = true) {
  ++state.openThreadGeneration;
  state.openingThread = false;
  parkRenderedConversation();
  setRunning(false);
  clearRequestsForThreadChange(null);
  if (switchToActive && state.threadView !== "active") {
    state.threadView = "active";
    state.allThreads = state.activeThreads;
    updateThreadViewControls();
    applyThreadFilter();
    renderProjects();
  }
  state.activeThread = null;
  state.activeTurn = null;
  state.threadResumed = false;
  state.activeArchived = state.threadView !== "active";
  elements.chat.innerHTML = "";
  elements.chat.classList.add("hidden");
  elements.empty.classList.remove("hidden");
  applyThreadSessionSettings(null);
  if (state.activeArchived) {
    const viewLabel = state.threadView === "removed" ? "已移除" : state.threadView === "scheduled" ? "已安排" : "归档";
    elements.windowTitle.textContent = state.activeProject ? `${state.activeProject.label} · ${viewLabel}` : `${viewLabel}会话`;
    elements.emptyTitle.textContent = state.threadView === "scheduled" ? "已安排任务" : `选择${viewLabel}会话`;
    elements.emptySubtitle.textContent = state.threadView === "scheduled"
      ? "选择任务进行编辑，或使用日历按钮安排新任务。"
      : `选择一条${viewLabel}会话查看内容。`;
  } else {
    elements.emptyTitle.textContent = "开始一个工作会话";
    elements.windowTitle.textContent = state.activeProject ? `${state.activeProject.label} · 新会话` : "新会话";
    elements.emptySubtitle.textContent = state.activeProject
      ? `在 ${state.activeProject.label} 中开始新会话。`
      : "选择左侧记录，或直接描述你要完成的事情。";
    elements.input.focus();
  }
  syncComposerState();
  renderThreadList();
}

function openThreadMenu(thread, event) {
  event.stopPropagation();
  state.menuThread = thread;
  const removeButton = elements.menu.querySelector("[data-action=remove], [data-action=restore]");
  const archiveButton = elements.menu.querySelector("[data-action=archive], [data-action=unarchive]");
  const renameButton = elements.menu.querySelector("[data-action=rename]");
  const deleteButton = elements.menu.querySelector("[data-action=delete-now]");
  const hidden = state.hiddenThreadIds.has(thread.id);
  const deletion = pendingDeletion(thread.id);
  const locallyArchived = state.localArchivedThreadIds.has(thread.id);
  const providerArchived = Boolean(thread._archived && !locallyArchived);
  removeButton.dataset.action = hidden ? "restore" : "remove";
  removeButton.classList.toggle("danger-action", !hidden);
  removeButton.innerHTML = `<span data-lucide="${hidden ? "archive-restore" : "trash-2"}"></span>${deletion ? "取消删除并恢复" : hidden ? "恢复会话" : "移除会话"}`;
  archiveButton.dataset.action = locallyArchived ? "unarchive" : "archive";
  archiveButton.innerHTML = `<span data-lucide="${locallyArchived ? "archive-restore" : "archive"}"></span>${locallyArchived ? "取消归档" : "归档"}`;
  archiveButton.classList.toggle("hidden", hidden || providerArchived);
  renameButton.classList.toggle("hidden", hidden);
  deleteButton.classList.toggle("hidden", !hidden);
  const anchor = event.currentTarget?.getBoundingClientRect?.();
  const clientX = event.clientX || (anchor ? anchor.right - 8 : 0);
  const clientY = event.clientY || (anchor ? anchor.bottom : 0);
  elements.menu.style.left = `${Math.min(clientX, innerWidth - 165)}px`;
  elements.menu.style.top = `${Math.min(clientY, innerHeight - 170)}px`;
  elements.menu.classList.remove("hidden");
  refreshIcons();
}

function closeRenameDialog(value = null) {
  elements.renameOverlay.classList.add("hidden");
  const resolve = state.renameResolve;
  state.renameResolve = null;
  resolve?.(value);
}

function openRenameDialog(thread) {
  if (state.renameResolve) closeRenameDialog(null);
  elements.renameInput.value = titleOf(thread);
  elements.renameError.textContent = "";
  elements.renameOverlay.classList.remove("hidden");
  refreshIcons();
  requestAnimationFrame(() => {
    elements.renameInput.focus();
    elements.renameInput.select();
  });
  return new Promise((resolve) => { state.renameResolve = resolve; });
}

function applyThreadName(threadId, name) {
  state.threadAliases[threadId] = name;
  for (const collection of [state.activeThreads, state.archivedThreads, state.allThreads, state.threads]) {
    const thread = collection.find((item) => item.id === threadId);
    if (thread) thread.name = name;
  }
  if (state.activeThread?.id === threadId) {
    state.activeThread.name = name;
    elements.windowTitle.textContent = name;
  }
  applyThreadFilter();
  renderProjects();
}

async function threadMenuAction(action) {
  const thread = state.menuThread;
  elements.menu.classList.add("hidden");
  if (!thread) return;
  try {
    if (action === "rename") {
      const name = await openRenameDialog(thread);
      if (!name) return;
      state.threadAliases = await api.renameThreadLocal({ threadId: thread.id, name });
      applyThreadName(thread.id, name);
      showDiagnostic("会话名称已在 Share Master 中更新，原始记录未修改。", false);
    } else if (action === "archive") {
      state.localArchivedThreadIds = new Set(await api.archiveThreadLocal(thread.id));
      if (state.activeThread?.id === thread.id) newChat();
      state.allThreads = threadsForCurrentView();
      updateThreadViewControls();
      applyThreadFilter();
      renderProjects();
      showDiagnostic("会话已归档到 Share Master。", false);
      return;
    } else if (action === "unarchive") {
      state.localArchivedThreadIds = new Set(await api.unarchiveThreadLocal(thread.id));
      if (state.activeThread?.id === thread.id) newChat(false);
      state.allThreads = threadsForCurrentView();
      updateThreadViewControls();
      applyThreadFilter();
      renderProjects();
      showDiagnostic("会话已恢复到活动列表。", false);
      return;
    } else if (action === "remove") {
      const confirmed = confirm("从 Share Master 中移除这个会话？\n\n只会在本应用中隐藏，官方 Codex 会话记录完全不变。");
      if (!confirmed) return;
      const hiddenIds = await api.hideThread(thread.id);
      state.hiddenThreadIds = new Set(hiddenIds);
      if (state.activeThread?.id === thread.id) newChat();
      updateThreadViewControls();
      applyThreadFilter();
      renderProjects();
      return;
    } else if (action === "restore") {
      const hiddenIds = await api.restoreThread(thread.id);
      state.hiddenThreadIds = new Set(hiddenIds);
      state.allThreads = threadsForCurrentView();
      if (state.activeThread?.id === thread.id) newChat(false);
      updateThreadViewControls();
      applyThreadFilter();
      renderProjects();
      return;
    } else if (action === "delete-now") {
      const confirmed = confirm(
        "立即从 Share Master 中删除这个会话？\n\n该操作无法在 Share Master 中撤销，但不会删除或修改原始 ChatGPT/Codex/Claude 会话记录。",
      );
      if (!confirmed) return;
      state.deletedThreadIds = new Set(await api.deleteThreadNow(thread.id));
      state.hiddenThreadIds.delete(thread.id);
      state.pendingDeletions = state.pendingDeletions.filter((item) => item.threadId !== thread.id);
      if (state.activeThread?.id === thread.id) newChat(false);
      state.allThreads = threadsForCurrentView();
      updateThreadViewControls();
      syncProjects();
      applyThreadFilter();
      showDiagnostic("会话已从 Share Master 中永久移除，原始记录未修改。", false);
      return;
    }
    await loadThreads();
  } catch (error) {
    showActionError(error);
  }
}

function updateWorkspace() {
  elements.workspaceLabel.textContent = state.workspace;
  elements.workspaceLabel.title = state.workspace;
}

function resizeComposer() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 180)}px`;
  syncComposerState();
}

function scrollToBottom() { requestAnimationFrame(() => { elements.chat.scrollTop = elements.chat.scrollHeight; }); }
function escapeHtml(value) { const node = document.createElement("div"); node.textContent = String(value ?? ""); return node.innerHTML; }
function showActionError(error) { showDiagnostic(error?.message || String(error), true); }

function openCredentialDialog(provider) {
  state.pendingCredentialProvider = provider;
  $("#credential-provider-id").value = provider.id;
  $("#credential-title").textContent = `配置 ${provider.label}`;
  $("#credential-subtitle").textContent = "API Key 将使用 Windows 安全存储加密保存，不会写入聊天记录。";
  elements.credentialApiKey.value = "";
  elements.credentialError.textContent = "";
  elements.overlay.classList.add("hidden");
  $("#connection-overlay").classList.add("hidden");
  elements.credentialOverlay.classList.remove("hidden");
  refreshIcons();
  requestAnimationFrame(() => elements.credentialApiKey.focus());
}

function closeCredentialDialog() {
  elements.credentialOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
  state.pendingCredentialProvider = null;
}

function updateClaudeRouteNote() {
  const option = $("#claude-model").selectedOptions[0];
  const actual = option?.dataset.actualModel;
  const genuine = option?.dataset.genuineClaude === "true";
  $("#claude-route-note").textContent = actual
    ? genuine
      ? `真实 Claude 路由：${option.value} → ${actual}`
      : `兼容路由：${option.value} → ${actual}。该选项实际不是 Claude 模型。`
    : "模型名称来自厂商 /v1/models；能否调用仍取决于当前 Token 权限。";
}

async function loadClaudeModels() {
  const button = $("#claude-load-models");
  const status = $("#claude-model-status");
  const apiKey = $("#claude-api-key").value.trim();
  const baseUrl = $("#claude-base-url").value.trim();
  button.disabled = true;
  status.textContent = "正在读取...";
  try {
    const catalog = await api.claudeModels({ baseUrl, apiKey });
    state.claudeCatalog = catalog;
    const select = $("#claude-model");
    const previous = select.value || state.providers.find((item) => item.id === "claude")?.model;
    select.innerHTML = "";
    if (catalog.routes?.length) {
      const routesGroup = document.createElement("optgroup");
      routesGroup.label = catalog.fallback ? "内置路由（Token 未验证）" : "已验证路由";
      for (const route of catalog.routes) {
        const routeType = route.genuineClaude ? "真实 Claude" : "兼容模型";
        const option = new Option(`${route.label}（${route.id} → ${route.actualModel}，${routeType}）`, route.id);
        option.dataset.actualModel = route.actualModel;
        option.dataset.genuineClaude = String(route.genuineClaude);
        routesGroup.appendChild(option);
      }
      select.appendChild(routesGroup);
    }
    if (catalog.models.length) {
      const modelsGroup = document.createElement("optgroup");
      modelsGroup.label = `厂商列出、未验证（${catalog.models.length}）`;
      const ordered = [...catalog.models].sort((left, right) => (
        left.id === "claude-fable-5" ? -1 : right.id === "claude-fable-5" ? 1 : left.label.localeCompare(right.label, "en")
      ));
      for (const model of ordered) {
        const option = new Option(model.label === model.id ? model.id : `${model.label} · ${model.id}`, model.id);
        modelsGroup.appendChild(option);
      }
      select.appendChild(modelsGroup);
    }
    select.value = [...select.options].some((option) => option.value === previous)
      ? previous
      : [...select.options].some((option) => option.value === "fable")
        ? "fable"
        : select.options[0]?.value || "";
    status.textContent = catalog.warning
      ? `Token 无法读取模型（${catalog.status || "请求失败"}：${catalog.warning}）；已加载 ${catalog.routes.length} 个内置路由，请更换 Token`
      : `已读取 ${catalog.models.length} 个模型`;
    updateClaudeRouteNote();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function openClaudeDialog(provider, errorMessage = "") {
  elements.overlay.classList.add("hidden");
  elements.credentialOverlay.classList.add("hidden");
  $("#connection-overlay").classList.add("hidden");
  elements.claudeOverlay.classList.remove("hidden");
  $("#claude-vendor-label").value = provider.vendorLabel || "";
  $("#claude-base-url").value = provider.baseUrl || "https://api.anthropic.com/v1";
  $("#claude-api-key").value = "";
  $("#claude-api-key").required = !provider.hasStoredKey;
  $("#claude-error").textContent = errorMessage;
  $("#claude-model-status").textContent = provider.hasStoredKey ? "可读取已保存 Token 的模型列表" : "请先输入 Token";
  $("#claude-model").innerHTML = `<option value="${escapeHtml(provider.model || "")}">${escapeHtml(provider.model || "请先读取模型列表")}</option>`;
  refreshIcons();
  if (provider.hasStoredKey) loadClaudeModels();
}

function closeClaudeDialog() {
  elements.claudeOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

function openRecordHomeDialog() {
  elements.recordHomeInput.value = state.recordHome;
  $("#record-home-error").textContent = "";
  elements.overlay.classList.add("hidden");
  elements.recordHomeOverlay.classList.remove("hidden");
  refreshIcons();
}

function closeRecordHomeDialog() {
  elements.recordHomeOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

function syncProjectRootControls() {
  $("#project-root-clear").classList.toggle("hidden", !elements.projectRootInput.value);
}

function projectNameTaken(label, exceptProject = null) {
  const key = projectLabelKey(label);
  return state.projects.some((project) => (
    !sameProject(project, exceptProject) && projectLabelKey(project.label) === key
  ));
}

function openProjectDialog(project = null) {
  if (!project?.id) project = null;
  state.editingProject = project;
  elements.projectForm.reset();
  elements.projectNameInput.value = project?.label || "";
  elements.projectRootInput.value = project?.root || "";
  $("#project-title").textContent = project ? "重命名 Project" : "创建 Project";
  $("#project-description").textContent = project
    ? "修改 Project 的显示名称，不会移动目录或会话。"
    : "Project 可以独立命名，本地目录为可选项。";
  $("#project-dialog-icon").setAttribute("data-lucide", project ? "pencil" : "folder-plus");
  $("#project-submit-label").textContent = project ? "保存" : "创建";
  $("#project-submit [data-lucide]").setAttribute("data-lucide", project ? "check" : "plus");
  $("#project-path-actions").classList.toggle("hidden", Boolean(project));
  elements.projectRootInput.closest("label").classList.toggle("hidden", Boolean(project));
  elements.projectForm.querySelector(".form-note").classList.toggle("hidden", Boolean(project));
  $("#project-error").textContent = "";
  syncProjectRootControls();
  elements.projectOverlay.classList.remove("hidden");
  elements.projectNameInput.focus();
  refreshIcons();
}

function closeProjectDialog() {
  elements.projectOverlay.classList.add("hidden");
  state.editingProject = null;
}

function taskDateInputValue(timestamp) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function populateTaskProjects(selectedId = "") {
  elements.taskProjectSelect.replaceChildren(new Option("不指定 Project", ""));
  for (const project of state.savedProjects) {
    elements.taskProjectSelect.appendChild(new Option(project.label, project.id));
  }
  elements.taskProjectSelect.value = selectedId || "";
}

function populateTaskProviders(selectedId = "") {
  elements.taskProviderSelect.replaceChildren(new Option("执行时使用任一连接", ""));
  for (const provider of state.providers) {
    elements.taskProviderSelect.appendChild(new Option(
      provider.connectionLabel || provider.label,
      provider.id,
    ));
  }
  elements.taskProviderSelect.value = selectedId || "";
}

function openTaskDialog(task = null) {
  state.editingTask = task;
  elements.taskForm.reset();
  $("#task-id").value = task?.id || "";
  elements.taskNameInput.value = task?.title || "";
  elements.taskPromptInput.value = task?.prompt || "";
  const defaultTime = Math.ceil((Date.now() + 60 * 60 * 1000) / 300000) * 300000;
  elements.taskTimeInput.value = taskDateInputValue(task?.scheduledAt || defaultTime);
  elements.taskRepeatSelect.value = task?.repeat || "once";
  elements.taskEnabledInput.checked = task?.enabled !== false;
  populateTaskProjects(task?.projectId || state.activeProject?.id || "");
  populateTaskProviders(task?.providerId || state.provider || "");
  $("#task-title").textContent = task ? "编辑已安排任务" : "安排任务";
  $("#task-submit-label").textContent = task ? "保存" : "安排";
  elements.taskError.textContent = "";
  elements.taskOverlay.classList.remove("hidden");
  elements.taskNameInput.focus();
  refreshIcons();
}

function closeTaskDialog() {
  elements.taskOverlay.classList.add("hidden");
  state.editingTask = null;
}

async function toggleScheduledTask(task, button) {
  button.disabled = true;
  try {
    const updated = await api.setScheduledTaskEnabled({ taskId: task.id, enabled: !task.enabled });
    const index = state.scheduledTasks.findIndex((item) => item.id === updated.id);
    if (index >= 0) state.scheduledTasks[index] = updated;
    updateThreadViewControls();
    renderScheduledTasks();
  } catch (error) {
    button.disabled = false;
    showActionError(error);
  }
}

async function removeScheduledTask(task, button) {
  if (!confirm(`删除已安排任务“${task.title}”？\n\n只删除 Share Master 中的任务配置，不会删除已生成的会话。`)) return;
  button.disabled = true;
  try {
    await api.removeScheduledTask(task.id);
    state.scheduledTasks = state.scheduledTasks.filter((item) => item.id !== task.id);
    updateThreadViewControls();
    renderProjects();
    renderScheduledTasks();
  } catch (error) {
    button.disabled = false;
    showActionError(error);
  }
}

$("#official-login-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const providerId = ["official", "account"].includes(state.providerType) ? state.provider : "official";
  button.disabled = true;
  elements.providerError.textContent = "请在浏览器中完成 ChatGPT 登录...";
  try {
    const snapshot = await api.officialLogin(providerId);
    applyAccountSnapshot(snapshot);
    elements.providerError.textContent = "登录成功，正在重新连接...";
    await connect(providerId);
    showDiagnostic(`已登录 ${snapshot.account?.email || "ChatGPT 账号"}。`, false);
  } catch (error) {
    elements.providerError.textContent = error.message;
    showActionError(error);
  } finally {
    button.disabled = false;
    renderAccountPanel();
  }
});
$("#add-connection-button").addEventListener("click", () => {
  elements.overlay.classList.add("hidden");
  $("#connection-overlay").classList.remove("hidden");
});
$("#close-connection-button").addEventListener("click", () => {
  $("#connection-overlay").classList.add("hidden");
  elements.overlay.classList.remove("hidden");
});
$("#credential-close-button").addEventListener("click", closeCredentialDialog);
$("#claude-close-button").addEventListener("click", closeClaudeDialog);
$("#claude-load-models").addEventListener("click", loadClaudeModels);
$("#claude-model").addEventListener("change", updateClaudeRouteNote);
$("#project-close-button").addEventListener("click", closeProjectDialog);
$("#schedule-task-button").addEventListener("click", () => {
  if (state.threadView !== "scheduled") setThreadView("scheduled");
  openTaskDialog();
});
$("#task-close-button").addEventListener("click", closeTaskDialog);
$("#project-root-choose").addEventListener("click", async () => {
  try {
    const root = await api.chooseWorkspace(elements.projectRootInput.value || state.workspace);
    if (!root) return;
    elements.projectRootInput.value = root;
    if (!elements.projectNameInput.value.trim()) elements.projectNameInput.value = folderName(root);
    syncProjectRootControls();
  } catch (error) {
    $("#project-error").textContent = error.message;
  }
});
$("#project-root-clear").addEventListener("click", () => {
  elements.projectRootInput.value = "";
  syncProjectRootControls();
});
elements.projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const editingProject = state.editingProject;
  const button = event.currentTarget.querySelector("button[type=submit]");
  if (projectNameTaken(data.label, editingProject)) {
    $("#project-error").textContent = `Project 名称“${data.label.trim()}”已存在。`;
    return;
  }
  button.disabled = true;
  $("#project-error").textContent = editingProject ? "正在保存..." : "正在创建...";
  try {
    const project = editingProject
      ? editingProject.inferred
        ? await api.addProject({ label: data.label, root: editingProject.root || "" })
        : await api.renameProject({ projectId: editingProject.id, label: data.label })
      : await api.addProject(data);
    const index = state.savedProjects.findIndex((item) => item.id === project.id);
    if (index >= 0) state.savedProjects[index] = project;
    else state.savedProjects.push(project);
    syncProjects();
    closeProjectDialog();
    selectProject(state.projects.find((item) => item.id === project.id) || project);
  } catch (error) {
    $("#project-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
elements.taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const button = event.currentTarget.querySelector("button[type=submit]");
  const scheduledAt = new Date(data.scheduledAt).getTime();
  if (!Number.isFinite(scheduledAt)) {
    elements.taskError.textContent = "请选择有效的执行时间。";
    return;
  }
  const project = state.savedProjects.find((item) => item.id === data.projectId) || null;
  button.disabled = true;
  elements.taskError.textContent = state.editingTask ? "正在保存..." : "正在安排...";
  try {
    const task = await api.saveScheduledTask({
      id: state.editingTask?.id || null,
      title: data.title,
      prompt: data.prompt,
      scheduledAt,
      repeat: data.repeat,
      enabled: elements.taskEnabledInput.checked,
      providerId: data.providerId || null,
      projectId: project?.id || null,
      workspace: project?.root || state.editingTask?.workspace || state.workspace,
    });
    const index = state.scheduledTasks.findIndex((item) => item.id === task.id);
    if (index >= 0) state.scheduledTasks[index] = task;
    else state.scheduledTasks.push(task);
    closeTaskDialog();
    updateThreadViewControls();
    renderProjects();
    renderScheduledTasks();
    showDiagnostic(`任务“${task.title}”已安排。`, false);
  } catch (error) {
    elements.taskError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
elements.claudeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  $("#claude-error").textContent = "正在保存...";
  try {
    const provider = await api.configureClaude(data);
    upsertProvider(provider);
    renderProviderOptions();
    elements.claudeOverlay.classList.add("hidden");
    await connect("claude");
  } catch (error) {
    $("#claude-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
elements.credentialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const providerId = state.pendingCredentialProvider?.id;
  const apiKey = elements.credentialApiKey.value.trim();
  if (!providerId || !apiKey) return;
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  elements.credentialError.textContent = "正在验证连接...";
  try {
    const provider = await api.saveProviderKey({ providerId, apiKey });
    upsertProvider(provider);
    renderProviderOptions();
    elements.credentialOverlay.classList.add("hidden");
    state.pendingCredentialProvider = null;
    await connect(providerId);
  } catch (error) {
    elements.credentialError.textContent = error.message;
    showActionError(error);
  } finally {
    submit.disabled = false;
  }
});
document.querySelectorAll("[data-connection-tab]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-connection-tab]").forEach((item) => item.classList.toggle("active", item === button));
  $("#relay-form").classList.toggle("hidden", button.dataset.connectionTab !== "relay");
  $("#account-form").classList.toggle("hidden", button.dataset.connectionTab !== "account");
}));
$("#relay-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const provider = await api.addRelay(data);
    upsertProvider(provider);
    renderProviderOptions();
    form.reset();
    $("#connection-overlay").classList.add("hidden");
    await connect(provider.id);
  } catch (error) { $("#connection-error").textContent = error.message; }
});
$("#account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const provider = await api.addAccount(data);
    upsertProvider(provider);
    renderProviderOptions();
    form.reset();
    $("#connection-overlay").classList.add("hidden");
    await api.officialLogin(provider.id);
    elements.overlay.classList.remove("hidden");
    elements.providerError.textContent = `已创建 ${provider.label}，请在登录窗口完成认证后选择该账号。`;
  } catch (error) { $("#account-error").textContent = error.message; }
});
$("#provider-switch").addEventListener("click", () => {
  elements.overlay.classList.remove("hidden");
  if (["api", "relay"].includes(state.providerType)) refreshRelayBalance();
});
$("#record-home-button").addEventListener("click", openRecordHomeDialog);
$("#record-home-close-button").addEventListener("click", closeRecordHomeDialog);
$("#record-home-choose").addEventListener("click", async () => {
  try {
    const selected = await api.chooseRecordHome(elements.recordHomeInput.value || state.recordHome);
    if (selected) elements.recordHomeInput.value = selected;
  } catch (error) {
    $("#record-home-error").textContent = error.message;
  }
});
$("#record-home-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextHome = elements.recordHomeInput.value.trim();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  $("#record-home-error").textContent = "正在切换...";
  try {
    const previousRecordHome = state.recordHome;
    const appliedRecordHome = await api.setRecordHome(nextHome);
    elements.recordHomeOverlay.classList.add("hidden");
    if (state.recordHome === previousRecordHome && appliedRecordHome !== previousRecordHome) {
      state.recordHome = appliedRecordHome;
      if (state.provider) await connect(state.provider);
    }
    if (!state.provider) elements.overlay.classList.remove("hidden");
  } catch (error) {
    $("#record-home-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#close-provider-button").addEventListener("click", () => {
  if (state.connected) elements.overlay.classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!elements.renameOverlay.classList.contains("hidden")) closeRenameDialog(null);
  else if (!elements.projectOverlay.classList.contains("hidden")) closeProjectDialog();
  else if (!elements.claudeOverlay.classList.contains("hidden")) closeClaudeDialog();
  else if (!elements.recordHomeOverlay.classList.contains("hidden")) closeRecordHomeDialog();
  else if (!elements.credentialOverlay.classList.contains("hidden")) closeCredentialDialog();
  else if (!$("#connection-overlay").classList.contains("hidden")) {
    $("#connection-overlay").classList.add("hidden");
    elements.overlay.classList.remove("hidden");
  } else if (state.connected && !elements.overlay.classList.contains("hidden")) {
    elements.overlay.classList.add("hidden");
  }
});
$("#new-chat-button").addEventListener("click", newChat);
document.querySelectorAll("[data-thread-view]").forEach((button) => button.addEventListener("click", () => setThreadView(button.dataset.threadView)));
$("#new-window-button").addEventListener("click", () => {
  api.newWindow({
    provider: state.provider,
    projectId: state.activeProject && !state.activeProject.inferred ? state.activeProject.id : null,
    projectRoot: state.activeProject?.root || null,
    workspace: state.workspace,
  }).catch(showActionError);
});
$("#add-project-button").addEventListener("click", () => openProjectDialog());
$("#sidebar-toggle").addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
$("#workspace-button").addEventListener("click", async () => {
  try {
    const selected = await api.chooseWorkspace(state.workspace);
    if (!selected) return;
    state.workspace = selected;
    if (!state.activeProject || state.activeProject.root) {
      state.activeProject = state.projects.find((item) => item.root && samePath(item.root, selected)) || null;
    }
    updateWorkspace();
    newChat();
    applyThreadFilter();
    renderProjects();
    await loadSkills(true);
  } catch (error) {
    showActionError(error);
  }
});
elements.search.addEventListener("input", () => { clearTimeout(elements.search._timer); elements.search._timer = setTimeout(() => applyThreadFilter(), 120); });
elements.chat.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  const target = link.getAttribute("href") || "";
  if (!/^https?:\/\//i.test(target)) {
    showDiagnostic(`已阻止不受支持的链接：${target}`, true);
    return;
  }
  api.openExternal(target).catch(showActionError);
});
elements.input.addEventListener("input", () => {
  resizeComposer();
  updateSkillAutocomplete();
});
elements.sessionModel.addEventListener("change", () => {
  renderEffortOptions(elements.sessionEffort.value);
  renderAppliedSettings();
  persistActiveThreadSettings();
});
elements.sessionEffort.addEventListener("change", () => {
  elements.sessionEffort.closest(".session-select").title = elements.sessionEffort.selectedOptions[0]?.title || "推理强度";
  renderAppliedSettings();
  persistActiveThreadSettings();
});
elements.modeBadge.addEventListener("click", () => {
  if (elements.modeBadge.disabled) return;
  const opening = elements.approvalModeMenu.classList.contains("hidden");
  closeSkillMenu();
  elements.approvalModeMenu.classList.toggle("hidden", !opening);
  elements.modeBadge.setAttribute("aria-expanded", String(opening));
});
elements.approvalModeMenu.querySelectorAll("[data-approval-mode]").forEach((option) => {
  option.addEventListener("click", () => {
    const mode = option.dataset.approvalMode;
    if (mode === "full" && state.approvalMode !== "full") {
      const confirmed = confirm("完全访问权限允许模型不经询问访问互联网及电脑上的任何文件。确定为本会话启用？");
      if (!confirmed) return;
    }
    setApprovalMode(mode);
  });
});
$("#approval-learn-more").addEventListener("click", () => {
  api.openExternal("https://developers.openai.com/codex/security").catch(showActionError);
});
elements.skillButton.addEventListener("click", () => {
  if (elements.skillButton.disabled) return;
  const opening = elements.skillMenu.classList.contains("hidden");
  if (opening) {
    state.skillQueryStart = null;
    openSkillMenu();
  } else {
    closeSkillMenu();
    elements.input.focus();
  }
});
elements.skillSearch.addEventListener("input", () => renderSkillMenu(elements.skillSearch.value));
elements.skillSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const first = elements.skillList.querySelector(".skill-option");
    if (first) {
      event.preventDefault();
      first.click();
    }
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeSkillMenu();
    elements.input.focus();
  } else if (event.key === "ArrowDown") {
    const first = elements.skillList.querySelector(".skill-option");
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }
});
elements.skillList.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  const options = [...elements.skillList.querySelectorAll(".skill-option")];
  const index = options.indexOf(document.activeElement);
  const next = event.key === "ArrowDown"
    ? options[Math.min(index + 1, options.length - 1)]
    : index <= 0 ? elements.skillSearch : options[index - 1];
  if (next) {
    event.preventDefault();
    next.focus();
  }
});
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.skillMenu.classList.contains("hidden")) {
    event.preventDefault();
    closeSkillMenu();
  } else if (event.key === "ArrowDown" && state.skillQueryStart !== null) {
    const first = elements.skillList.querySelector(".skill-option");
    if (first) {
      event.preventDefault();
      first.focus();
    }
  } else if (event.key === "Enter" && !event.shiftKey) {
    const first = state.skillQueryStart !== null
      ? elements.skillList.querySelector(".skill-option")
      : null;
    event.preventDefault();
    if (first) first.click();
    else sendMessage();
  }
});
elements.send.addEventListener("click", sendMessage);
elements.stop.addEventListener("click", requestTurnInterrupt);
elements.menu.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => threadMenuAction(button.dataset.action)));
document.addEventListener("click", (event) => { if (!event.target.closest("#thread-menu") && !event.target.closest(".thread-more")) elements.menu.classList.add("hidden"); });
document.addEventListener("click", (event) => {
  if (event.target.closest("#approval-mode-menu") || event.target.closest("#mode-badge")) return;
  elements.approvalModeMenu.classList.add("hidden");
  elements.modeBadge.setAttribute("aria-expanded", "false");
});
document.addEventListener("click", (event) => {
  if (event.target.closest("#skill-menu") || event.target.closest("#skill-button")) return;
  closeSkillMenu();
});
document.addEventListener("keydown", (event) => {
  const commandKey = event.ctrlKey || event.metaKey;
  if (commandKey && event.key.toLocaleLowerCase("en-US") === "k") {
    event.preventDefault();
    elements.search.focus();
    elements.search.select();
  } else if (commandKey && event.shiftKey && event.key.toLocaleLowerCase("en-US") === "o") {
    event.preventDefault();
    newChat();
  } else if (commandKey && event.shiftKey && event.key.toLocaleLowerCase("en-US") === "s") {
    event.preventDefault();
    if (state.threadView !== "scheduled") setThreadView("scheduled");
    openTaskDialog();
  } else if (event.key === "Escape") {
    elements.menu.classList.add("hidden");
    elements.approvalModeMenu.classList.add("hidden");
    closeSkillMenu();
    if (!elements.taskOverlay.classList.contains("hidden")) closeTaskDialog();
    else if (!elements.projectOverlay.classList.contains("hidden")) closeProjectDialog();
    else if (!elements.renameOverlay.classList.contains("hidden")) closeRenameDialog(null);
  }
});
elements.renameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.renameInput.value.trim();
  if (!name) {
    elements.renameError.textContent = "会话名称不能为空。";
    return;
  }
  closeRenameDialog(name);
});
$("#rename-close-button").addEventListener("click", () => closeRenameDialog(null));
elements.renameOverlay.addEventListener("click", (event) => {
  if (event.target === elements.renameOverlay) closeRenameDialog(null);
});
elements.projectOverlay.addEventListener("click", (event) => {
  if (event.target === elements.projectOverlay) closeProjectDialog();
});
elements.taskOverlay.addEventListener("click", (event) => {
  if (event.target === elements.taskOverlay) closeTaskDialog();
});

api.onEvent(handleEvent);
api.onApproval(showApproval);
api.onDiagnostic((message) => showDiagnostic(message));
api.onDisconnected(() => {
  setConnected(false);
  setRunning(false);
  state.activeApproval = null;
  state.approvalQueue = [];
  elements.approval.classList.add("hidden");
});
api.onStoreChanged(applyStoreSnapshot);

(async function init() {
  try {
    const bootstrap = await api.bootstrap();
    state.providers = bootstrap.providers;
    state.savedProjects = bootstrap.projects || [];
    state.projectThreads = bootstrap.projectThreads || {};
    state.hiddenProjectRoots = bootstrap.hiddenProjectRoots || [];
    state.threadSettings = bootstrap.threadSettings || {};
    state.threadAliases = bootstrap.threadAliases || {};
    state.hiddenThreadIds = new Set(bootstrap.hiddenThreadIds || []);
    state.deletedThreadIds = new Set(bootstrap.deletedThreadIds || []);
    state.localArchivedThreadIds = new Set(bootstrap.localArchivedThreadIds || []);
    state.pendingDeletions = bootstrap.pendingDeletions || [];
    state.scheduledTasks = bootstrap.scheduledTasks || [];
    state.runningTaskIds = new Set(bootstrap.runningTaskIds || []);
    state.recordHome = bootstrap.recordHome || bootstrap.codexHome || state.recordHome;
    const params = new URLSearchParams(location.search);
    const projectId = params.get("projectId");
    const projectRoot = params.get("project");
    const requestedWorkspace = params.get("workspace");
    if (projectId) {
      state.activeProject = state.savedProjects.find((item) => item.id === projectId) || null;
      state.workspace = state.activeProject?.root || requestedWorkspace || state.workspace;
    } else if (projectRoot) {
      state.activeProject = state.savedProjects.find((item) => samePath(item.root, projectRoot))
        || { id: "window-project", label: folderName(projectRoot), root: projectRoot, inferred: true };
      state.workspace = projectRoot;
    } else if (requestedWorkspace) {
      state.workspace = requestedWorkspace;
    }
    renderProviderOptions();
    syncProjects();
    updateWorkspace();
    if (projectId || projectRoot) newChat();
    refreshIcons();
    const provider = params.get("provider");
    if (provider) {
      await connect(provider);
      const threadId = params.get("thread");
      const thread = [...state.activeThreads, ...state.archivedThreads].find((item) => item.id === threadId);
      if (thread) await openThread(thread);
    }
  } catch (error) {
    setConnected(false);
    elements.overlay.classList.remove("hidden");
    elements.providerError.textContent = error.message;
    showDiagnostic(error.message, true);
  }
})();
