/* global lucide, marked, DOMPurify, ShareMasterVueRuntime */

const api = window.codexDeck;
const state = ShareMasterVueRuntime.shallowReactive({
  provider: null,
  providerType: null,
  providerEngine: null,
  modelProvider: null,
  modelCatalog: [],
  skills: [],
  managedSkills: [],
  promptTemplates: [],
  mcpServers: [],
  theme: ["system", "light", "dark"].includes(localStorage.getItem("share-master-theme"))
    ? localStorage.getItem("share-master-theme")
    : "system",
  extensionTab: "skills",
  editingPromptId: null,
  promptEditorMode: "edit",
  editingMcpId: null,
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
  usage: null,
  modelPricing: {},
  providerRoutes: {},
  providerHealth: {},
  draggingProviderId: null,
  routeFallbackDraft: [],
  draggingFallbackId: null,
  syncBackend: "directory",
  skillInstallKind: "folder",
  scheduledTasks: [],
  editingRelay: null,
  probedProviderModels: [],
  runningTaskIds: new Set(),
  activeProject: null,
  activeThread: null,
  threadResumed: false,
  activeArchived: false,
  activeTurn: null,
  stopRequested: false,
  interruptingTurnId: null,
  runningThreads: new Map(),
  interruptedTurns: new Map(),
  messageQueues: new Map(),
  steeringQueuedMessages: new Set(),
  steeringThreads: new Set(),
  queueDispatchingThreads: new Set(),
  threadSearchHits: new Map(),
  threadSearchGeneration: 0,
  threadSearchQuery: "",
  submitting: false,
  pendingAttachments: [],
  workspace: "",
  running: false,
  streamNodes: new Map(),
  menuThread: null,
  providers: [],
  providerPresets: {},
  pendingDeepLinkImport: null,
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
  localHistorySources: [],
  localHistorySourceId: null,
  localHistoryConversations: [],
  localHistorySelectedId: null,
  localHistoryLoading: false,
  localHistoryGeneration: 0,
  localProviderCandidates: [],
  selectedLocalProviderIds: new Set(),
  localProviderLoading: false,
  localProviderGeneration: 0,
  reconnectAttempt: 0,
  reconnectTimer: null,
  reconnecting: false,
});
window.shareMasterState = state;

const INITIAL_VISIBLE_TURNS = 40;
const EARLIER_TURN_BATCH = 40;
const STREAM_RENDER_INTERVAL_MS = 80;
const COMPOSER_ACTIVITY_WINDOW_MS = 600;
const pendingAgentStreamRenders = new Map();
const pendingActivityStreamDeltas = new Map();
const streamTextChunks = new WeakMap();
let streamRenderTimer = null;
let scrollFrame = null;
let composerInputFrame = null;
let lastComposerInputAt = Number.NEGATIVE_INFINITY;

const $ = (selector) => document.querySelector(selector);
const elements = {
  overlay: $("#provider-overlay"), providerError: $("#provider-error"), providerName: $("#provider-name"),
  providerState: $("#provider-state"), providerMark: $("#provider-mark"), threadList: $("#thread-list"),
  threadCount: $("#thread-count"), search: $("#thread-search"), chat: $("#chat-view"), empty: $("#empty-state"),
  emptyTitle: $("#empty-title"), emptySubtitle: $("#empty-subtitle"), input: $("#composer-input"), send: $("#send-button"),
  stop: $("#stop-button"),
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
  localHistoryOverlay: $("#local-history-overlay"), localHistorySources: $("#local-history-sources"),
  localHistoryList: $("#local-history-list"), localHistoryPreview: $("#local-history-preview"),
  localHistorySearch: $("#local-history-search"), localHistorySummary: $("#local-history-summary"),
  localProviderOverlay: $("#local-provider-overlay"), localProviderList: $("#local-provider-list"),
  localProviderSummary: $("#local-provider-summary"), localProviderStatus: $("#local-provider-status"),
  localProviderImportButton: $("#local-provider-import-button"),
  usageOverlay: $("#usage-overlay"), usageProviderFilter: $("#usage-provider-filter"),
  usageStats: $("#usage-stats"), usageTrend: $("#usage-trend"), usageLogList: $("#usage-log-list"),
  healthOverlay: $("#health-overlay"), healthList: $("#health-list"),
  extensionsOverlay: $("#extensions-overlay"), extensionsSkillList: $("#extensions-skill-list"),
  extensionsSkillSearch: $("#extensions-skill-search"), extensionsStatus: $("#extensions-status"),
  extensionsPromptList: $("#extensions-prompt-list"), extensionsMcpList: $("#extensions-mcp-list"),
  promptForm: $("#prompt-form"), mcpForm: $("#mcp-form"),
  skillInstallOverlay: $("#skill-install-overlay"), skillInstallForm: $("#skill-install-form"),
  pricingForm: $("#pricing-form"), pricingProvider: $("#pricing-provider"), pricingModel: $("#pricing-model"),
  backupOverlay: $("#backup-overlay"), backupList: $("#backup-list"), backupStatus: $("#backup-status"),
  syncOverlay: $("#sync-overlay"), syncDirectoryInput: $("#sync-directory-input"),
  syncAutoInput: $("#sync-auto-input"), syncStatus: $("#sync-status"), syncHistory: $("#sync-history"),
  syncWebdavForm: $("#sync-webdav-form"),
  appSettingsOverlay: $("#app-settings-overlay"), appSettingsForm: $("#app-settings-form"),
  importPreviewOverlay: $("#deep-link-import-overlay"), importPreviewDetails: $("#import-preview-details"),
  projectOverlay: $("#project-overlay"), projectForm: $("#project-form"),
  projectNameInput: $("#project-name-input"), projectRootInput: $("#project-root-input"),
  taskOverlay: $("#task-overlay"), taskForm: $("#task-form"), taskNameInput: $("#task-name-input"),
  taskPromptInput: $("#task-prompt-input"), taskTimeInput: $("#task-time-input"),
  taskRepeatSelect: $("#task-repeat-select"), taskProjectSelect: $("#task-project-select"),
  taskProviderSelect: $("#task-provider-select"), taskEnabledInput: $("#task-enabled-input"), taskError: $("#task-error"),
  taskModelInput: $("#task-model-input"), taskApprovalSelect: $("#task-approval-select"),
  taskNotifyInput: $("#task-notify-input"), taskRetryInput: $("#task-retry-input"),
  sessionModel: $("#session-model"), sessionEffort: $("#session-effort"),
  appliedSettings: $("#applied-settings"), modeBadge: $("#mode-badge"),
  approvalModeMenu: $("#approval-mode-menu"), approvalModeLabel: $("#approval-mode-label"),
  fullAccessOverlay: $("#full-access-overlay"), fullAccessConfirm: $("#full-access-confirm"),
  fullAccessCancel: $("#full-access-cancel"),
  composerBrandIcon: $("#composer-brand-icon"),
  skillButton: $("#skill-button"), skillMenu: $("#skill-menu"), skillSearch: $("#skill-search"),
  skillList: $("#skill-list"),
  attachButton: $("#attach-button"), attachmentList: $("#attachment-list"),
  messageQueuePanel: $("#message-queue-panel"),
};

const composerWrap = document.querySelector(".composer-wrap");
if (composerWrap && typeof ResizeObserver === "function") {
  new ResizeObserver(([entry]) => {
    const height = Math.ceil(entry?.contentRect?.height || composerWrap.getBoundingClientRect().height || 0);
    if (height) document.documentElement.style.setProperty("--composer-inset", `${height + 28}px`);
  }).observe(composerWrap);
}

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

function applyTheme(theme, persist = true) {
  const preference = ["system", "light", "dark"].includes(theme) ? theme : "system";
  const resolved = preference === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : preference;
  state.theme = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  window.codexDeck.setWindowTheme(resolved);
  if (persist) localStorage.setItem("share-master-theme", preference);
  const labels = { system: "跟随系统", light: "浅色", dark: "深色" };
  const icons = { system: "monitor", light: "sun", dark: "moon" };
  const button = $("#theme-button");
  button.title = `主题：${labels[preference]}`;
  button.setAttribute("aria-label", `切换主题，当前${labels[preference]}`);
  button.innerHTML = `<span data-lucide="${icons[preference]}"></span>`;
  refreshIcons();
}
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

let fullAccessConfirmationResolve = null;

function focusComposerAfterPermissionChange() {
  syncComposerState();
  requestAnimationFrame(() => {
    if (!elements.input.disabled) elements.input.focus({ preventScroll: true });
  });
}

function closeFullAccessConfirmation(confirmed = false) {
  if (elements.fullAccessOverlay.classList.contains("hidden") && !fullAccessConfirmationResolve) return;
  elements.fullAccessOverlay.classList.add("hidden");
  const resolve = fullAccessConfirmationResolve;
  fullAccessConfirmationResolve = null;
  resolve?.(confirmed);
  focusComposerAfterPermissionChange();
}

function confirmFullAccess() {
  if (fullAccessConfirmationResolve) return Promise.resolve(false);
  elements.approvalModeMenu.classList.add("hidden");
  elements.modeBadge.setAttribute("aria-expanded", "false");
  elements.fullAccessOverlay.classList.remove("hidden");
  refreshIcons();
  requestAnimationFrame(() => elements.fullAccessCancel.focus());
  return new Promise((resolve) => { fullAccessConfirmationResolve = resolve; });
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

function clearReconnectTimer(resetAttempt = false) {
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  state.reconnecting = false;
  if (resetAttempt) state.reconnectAttempt = 0;
}

function connect(provider, closeOverlay = true, reconnecting = false) {
  if (!reconnecting) clearReconnectTimer(true);
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
  resetAllRuns();
  setConnected(false);
  const task = (async () => {
    try {
      const result = await api.connect(provider);
      if (generation !== state.connectionGeneration || result?.superseded) return false;
      state.provider = provider;
      state.connectingProvider = null;
      state.providerType = result.providerType;
      state.providerEngine = result.providerEngine;
      state.modelProvider = result.modelProvider;
      state.threadResumed = false;
      state.relayBalance = null;
      applyAccountSnapshot(result);
      setConnected(true, result.label);
      clearReconnectTimer(true);
      const visual = providerVisual(currentProviderDefinition() || {
        brand: result.brand,
        preset: result.providerPreset,
      });
      elements.providerMark.className = `provider-mark ${visual.className}`;
      elements.providerMark.innerHTML = visual.markup;
      elements.composerBrandIcon.src = result.providerPreset === "qwen"
        ? "../../node_modules/simple-icons/icons/alibabacloud.svg"
        : brandIconPath(result.brand);
      elements.composerBrandIcon.alt = visual.label;
      if (closeOverlay) elements.overlay.classList.add("hidden");
      elements.providerError.textContent = "";
      await Promise.all([loadThreads(), loadSessionModels(), loadSkills()]);
      if (result.modelWarning) {
        showDiagnostic(`中转站模型列表不可用，已退回配置模型：${result.modelWarning}`, true);
      }
      if (reconnecting) showDiagnostic("模型连接已自动恢复，可以继续刚才的会话。", false);
      if (["api", "relay"].includes(state.providerType)
        && currentProviderDefinition()?.protocol !== "chat_completions") refreshRelayBalance();
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

function scheduleReconnect(provider, disconnect = {}) {
  if (!provider || state.reconnectTimer || state.connectionPromise) return;
  const delays = [1000, 3000, 8000];
  if (state.reconnectAttempt >= delays.length) {
    state.reconnecting = false;
    elements.providerState.textContent = "自动重连失败，请手动重试";
    showDiagnostic("模型连接连续恢复失败。已保留当前会话，请点击左下角连接重新尝试。", true);
    return;
  }
  const delay = delays[state.reconnectAttempt];
  state.reconnecting = true;
  elements.providerState.textContent = `${Math.ceil(delay / 1000)} 秒后自动重连`;
  const detail = disconnect.detail ? `：${disconnect.detail}` : "";
  showDiagnostic(`模型连接意外断开，正在准备第 ${state.reconnectAttempt + 1} 次重连${detail}`, true);
  state.reconnectTimer = setTimeout(async () => {
    state.reconnectTimer = null;
    state.reconnectAttempt += 1;
    elements.providerState.textContent = "正在自动重连…";
    const connected = await connect(provider, false, true);
    if (!connected) scheduleReconnect(provider, disconnect);
  }, delay);
}

function handleConnectionDisconnect(payload = {}) {
  const provider = payload.providerId || state.provider;
  for (const [threadId, run] of state.runningThreads) {
    const interruption = {
      id: run.turnId || `connection-${threadId}-${Date.now()}`,
      status: "failed",
      error: {
        code: "SERVER_DISCONNECTED",
        message: payload.detail
          ? `模型连接在回答完成前退出：${payload.detail}`
          : "模型连接在回答完成前退出。已保留当前内容，连接恢复后可以继续生成。",
      },
    };
    state.interruptedTurns.set(threadId, interruption);
    if (threadId === state.activeThread?.id) appendTurnInterruption(interruption, threadId);
  }
  setConnected(false);
  resetAllRuns();
  state.activeApproval = null;
  state.approvalQueue = [];
  elements.approval.classList.add("hidden");
  if (payload.reconnectable !== false && payload.reason === "server-exit") scheduleReconnect(provider, payload);
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
  const commands = [
    ...state.promptTemplates.map((template) => ({
      ...template,
      commandType: "prompt",
      description: template.description || "本地 Prompt 模板",
    })),
    ...state.skills.map((skill) => ({ ...skill, commandType: "skill" })),
  ];
  const matches = commands.filter((skill) => {
    if (!normalizedQuery) return true;
    return `${skill.name} ${skill.description || ""}`.toLocaleLowerCase("en-US").includes(normalizedQuery);
  });
  elements.skillList.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "skill-empty";
    empty.textContent = state.skillsLoading ? "正在读取命令..." : "没有匹配的命令";
    elements.skillList.appendChild(empty);
    return;
  }
  for (const skill of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "skill-option";
    option.dataset.skillName = skill.name;
    option.dataset.commandType = skill.commandType;
    option.setAttribute("role", "menuitem");
    const icon = document.createElement("span");
    icon.dataset.lucide = skill.commandType === "prompt" ? "text-cursor-input" : "wand-sparkles";
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = `/${skill.name}`;
    const description = document.createElement("small");
    description.textContent = skill.description || (skill.commandType === "prompt" ? "本地 Prompt 模板" : "Codex Skill");
    copy.append(name, description);
    option.append(icon, copy);
    option.addEventListener("click", () => insertCommand(skill));
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

function insertCommand(command) {
  const text = command.commandType === "prompt" ? `${command.content}\n` : `/${command.name} `;
  const input = elements.input;
  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  let start = state.skillQueryStart;
  let prefix = "";
  if (start === null || start > selectionStart) {
    start = selectionStart;
    if (start > 0 && !/\s/.test(input.value[start - 1])) prefix = " ";
  }
  input.setRangeText(`${prefix}${text}`, start, selectionEnd, "end");
  closeSkillMenu();
  input.focus();
  resizeComposer();
}

function updateSkillAutocomplete() {
  if (elements.input.disabled) {
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
  if (!state.connected || ["claude", "openai-compatible"].includes(state.providerEngine)) {
    state.skills = [];
    elements.skillButton.title = state.promptTemplates.length
      ? `Prompt 命令 (${state.promptTemplates.length})`
      : "没有可用的命令";
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
    const commandCount = state.skills.length + state.promptTemplates.length;
    elements.skillButton.title = commandCount ? `命令 (${commandCount})` : "没有可用的命令";
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

function applyExtensionSnapshot(snapshot = {}) {
  state.managedSkills = Array.isArray(snapshot.skills) ? snapshot.skills : state.managedSkills;
  state.promptTemplates = Array.isArray(snapshot.prompts) ? snapshot.prompts : state.promptTemplates;
  state.mcpServers = Array.isArray(snapshot.mcpServers) ? snapshot.mcpServers : state.mcpServers;
  $("#extensions-skill-count").textContent = String(state.managedSkills.length);
  $("#extensions-prompt-count").textContent = String(state.promptTemplates.length);
  $("#extensions-mcp-count").textContent = String(state.mcpServers.length);
  renderManagedSkills(elements.extensionsSkillSearch.value);
  renderPromptIndex();
  renderMcpIndex();
  renderSkillMenu(elements.skillSearch.value);
  syncComposerState();
}

async function loadExtensions() {
  const snapshot = await api.listExtensions();
  applyExtensionSnapshot(snapshot);
  return snapshot;
}

function renderManagedSkills(query = "") {
  const needle = String(query || "").trim().toLocaleLowerCase("zh-CN");
  const matches = state.managedSkills.filter((skill) => (
    !needle || `${skill.name} ${skill.description || ""} ${skill.source || ""}`.toLocaleLowerCase("zh-CN").includes(needle)
  ));
  elements.extensionsSkillList.replaceChildren();
  if (!matches.length) {
    elements.extensionsSkillList.innerHTML = `<div class="extensions-empty">${state.managedSkills.length ? "没有匹配的 Skill" : "尚未发现可管理的 Skill"}</div>`;
    return;
  }
  for (const skill of matches) {
    const row = document.createElement("div");
    row.className = `extension-row${skill.enabled ? "" : " disabled"}`;
    const source = String(skill.source || "Share Master 私有目录");
    row.innerHTML = `<span class="extension-row-icon"><span data-lucide="wand-sparkles"></span></span><span class="extension-copy"><strong><code>/${escapeHtml(skill.name)}</code></strong><span title="${escapeHtml(`${skill.description || "Share Master Skill"}\n来源：${source}\n私有副本：${skill.path || ""}`)}">${escapeHtml(skill.description || "Share Master Skill")} · ${escapeHtml(source.split(/[\\/]/).filter(Boolean).slice(-2).join(" / "))}</span></span>`;
    const toggle = document.createElement("label");
    toggle.className = "extension-toggle";
    toggle.innerHTML = `<span>${skill.enabled ? "已启用" : "已停用"}</span>`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = skill.enabled;
    input.setAttribute("aria-label", `${skill.enabled ? "停用" : "启用"} ${skill.name}`);
    input.addEventListener("change", async () => {
      input.disabled = true;
      elements.extensionsStatus.textContent = `正在${input.checked ? "启用" : "停用"} ${skill.name}...`;
      try {
        const response = await api.setSkillEnabled({ name: skill.name, enabled: input.checked });
        applyExtensionSnapshot(response);
        if (state.connected && !["claude", "openai-compatible"].includes(state.providerEngine)) await loadSkills(true);
        elements.extensionsStatus.textContent = `${skill.name} 已${input.checked ? "启用" : "停用"}`;
      } catch (error) {
        input.checked = !input.checked;
        elements.extensionsStatus.textContent = error.message;
      } finally {
        input.disabled = false;
      }
    });
    toggle.appendChild(input);
    const actions = document.createElement("span");
    actions.className = "extension-row-actions";
    if (skill.removable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button danger-icon";
      remove.title = `卸载 ${skill.name}`;
      remove.setAttribute("aria-label", remove.title);
      remove.innerHTML = '<span data-lucide="trash-2"></span>';
      remove.addEventListener("click", async () => {
        if (!confirm(`卸载 Skill“${skill.name}”？\n\n只删除 Share Master 私有安装副本。`)) return;
        remove.disabled = true;
        try {
          const response = await api.removeSkill(skill.name);
          applyExtensionSnapshot(response);
          elements.extensionsStatus.textContent = `${skill.name} 已卸载`;
        } catch (error) {
          remove.disabled = false;
          elements.extensionsStatus.textContent = error.message;
        }
      });
      actions.appendChild(remove);
    }
    actions.appendChild(toggle);
    row.appendChild(actions);
    elements.extensionsSkillList.appendChild(row);
  }
  refreshIcons();
}

function switchExtensionTab(tab) {
  state.extensionTab = ["skills", "prompts", "mcp"].includes(tab) ? tab : "skills";
  document.querySelectorAll("[data-extension-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.extensionTab === state.extensionTab);
  });
  for (const name of ["skills", "prompts", "mcp"]) {
    $(`#extensions-${name}-panel`).classList.toggle("hidden", name !== state.extensionTab);
  }
}

async function openExtensionsDialog(tab = "skills") {
  elements.overlay.classList.add("hidden");
  elements.extensionsOverlay.classList.remove("hidden");
  elements.extensionsStatus.textContent = "";
  switchExtensionTab(tab);
  try {
    await loadExtensions();
  } catch (error) {
    elements.extensionsStatus.textContent = error.message;
  }
  refreshIcons();
}

function closeExtensionsDialog() {
  elements.extensionsOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

function setSkillInstallKind(kind) {
  state.skillInstallKind = ["folder", "zip", "github"].includes(kind) ? kind : "folder";
  document.querySelectorAll("[data-skill-install-kind]").forEach((button) => button.classList.toggle("active", button.dataset.skillInstallKind === state.skillInstallKind));
  const source = $("#skill-install-source");
  source.value = "";
  source.readOnly = state.skillInstallKind !== "github";
  source.type = state.skillInstallKind === "github" ? "url" : "text";
  source.placeholder = state.skillInstallKind === "github"
    ? "https://github.com/owner/repository"
    : state.skillInstallKind === "zip" ? "选择 Skill ZIP 包" : "选择包含 SKILL.md 的文件夹";
  $("#skill-install-source-label").textContent = state.skillInstallKind === "github" ? "GitHub 仓库 URL" : state.skillInstallKind === "zip" ? "Skill ZIP 包" : "Skill 文件夹";
  $("#skill-install-browse").classList.toggle("hidden", state.skillInstallKind === "github");
  $("#skill-install-status").textContent = "";
}

function openSkillInstallDialog() {
  elements.extensionsOverlay.classList.add("hidden");
  elements.skillInstallOverlay.classList.remove("hidden");
  elements.skillInstallForm.reset();
  setSkillInstallKind("folder");
  refreshIcons();
}

function closeSkillInstallDialog() {
  elements.skillInstallOverlay.classList.add("hidden");
  elements.extensionsOverlay.classList.remove("hidden");
}

function resetPromptEditor() {
  state.editingPromptId = null;
  elements.promptForm.reset();
  elements.promptForm.elements.id.value = "";
  $("#prompt-editor-title").textContent = "新建 Prompt";
  $("#prompt-delete-button").classList.add("hidden");
  $("#prompt-error").textContent = "";
  setPromptEditorMode("edit");
  renderPromptIndex();
}

function selectPrompt(template) {
  state.editingPromptId = template.id;
  elements.promptForm.elements.id.value = template.id;
  elements.promptForm.elements.name.value = template.name;
  elements.promptForm.elements.description.value = template.description || "";
  elements.promptForm.elements.content.value = template.content || "";
  $("#prompt-editor-title").textContent = `编辑 /${template.name}`;
  $("#prompt-delete-button").classList.remove("hidden");
  $("#prompt-error").textContent = "";
  setPromptEditorMode("edit");
  renderPromptIndex();
  refreshIcons();
}

function setPromptEditorMode(mode) {
  state.promptEditorMode = mode === "preview" ? "preview" : "edit";
  document.querySelectorAll("[data-prompt-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.promptMode === state.promptEditorMode);
  });
  const field = $("#prompt-content-field");
  field.classList.toggle("prompt-preview-mode", state.promptEditorMode === "preview");
  if (state.promptEditorMode === "preview") {
    const content = elements.promptForm.elements.content.value.trim();
    $("#prompt-markdown-preview").innerHTML = content ? renderMarkdown(content) : '<span class="prompt-preview-empty">暂无可预览内容</span>';
  }
  refreshIcons();
}

function renderPromptIndex() {
  elements.extensionsPromptList.replaceChildren();
  if (!state.promptTemplates.length) {
    elements.extensionsPromptList.innerHTML = '<div class="extensions-empty">暂无 Prompt 模板</div>';
    return;
  }
  for (const template of state.promptTemplates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `extension-index-row${template.id === state.editingPromptId ? " active" : ""}`;
    button.innerHTML = `<span><strong>/${escapeHtml(template.name)}</strong><span>${escapeHtml(template.description || "本地模板")}</span></span><i class="extension-state"></i>`;
    button.addEventListener("click", () => selectPrompt(template));
    elements.extensionsPromptList.appendChild(button);
  }
}

function resetMcpEditor() {
  state.editingMcpId = null;
  elements.mcpForm.reset();
  elements.mcpForm.elements.id.value = "";
  elements.mcpForm.elements.enabled.checked = true;
  $("#mcp-editor-title").textContent = "添加 MCP";
  $("#mcp-delete-button").classList.add("hidden");
  $("#mcp-test-button").classList.add("hidden");
  setMcpStatus("");
  updateMcpTransportFields();
  renderMcpIndex();
}

function selectMcp(server) {
  state.editingMcpId = server.id;
  const form = elements.mcpForm.elements;
  form.id.value = server.id;
  form.name.value = server.name;
  form.transport.value = server.transport || "stdio";
  form.command.value = server.command || "";
  form.args.value = (server.args || []).join("\n");
  form.url.value = server.url || "";
  form.env.value = (server.envKeys || []).map((key) => `${key}=`).join("\n");
  form.enabled.checked = server.enabled !== false;
  $("#mcp-editor-title").textContent = `编辑 ${server.name}`;
  $("#mcp-delete-button").classList.remove("hidden");
  $("#mcp-test-button").classList.remove("hidden");
  setMcpStatus(server.hasSecrets ? "敏感变量已加密保存，留空可保留原值。" : "");
  updateMcpTransportFields();
  renderMcpIndex();
  refreshIcons();
}

function setMcpStatus(message, isError = false) {
  const status = $("#mcp-error");
  status.textContent = message || "";
  status.classList.toggle("neutral-status", !isError);
}

function renderMcpIndex() {
  elements.extensionsMcpList.replaceChildren();
  if (!state.mcpServers.length) {
    elements.extensionsMcpList.innerHTML = '<div class="extensions-empty">暂无 MCP 服务</div>';
    return;
  }
  for (const server of state.mcpServers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `extension-index-row${server.id === state.editingMcpId ? " active" : ""}`;
    button.innerHTML = `<span><strong>${escapeHtml(server.name)}</strong><span>${escapeHtml(server.transport === "stdio" ? server.command : server.url)}</span></span><i class="extension-state${server.enabled === false ? " off" : ""}"></i>`;
    button.addEventListener("click", () => selectMcp(server));
    elements.extensionsMcpList.appendChild(button);
  }
}

function updateMcpTransportFields() {
  const stdio = elements.mcpForm.elements.transport.value === "stdio";
  $("#mcp-command-field").classList.toggle("hidden", !stdio);
  $("#mcp-args-field").classList.toggle("hidden", !stdio);
  $("#mcp-url-field").classList.toggle("hidden", stdio);
  elements.mcpForm.elements.command.required = stdio;
  elements.mcpForm.elements.url.required = !stdio;
}

function mcpEnvironmentInput(value) {
  const env = {};
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error("环境变量必须使用 KEY=VALUE 格式。");
    env[line.slice(0, separator).trim()] = line.slice(separator + 1);
  }
  return env;
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
    .filter((thread) => !state.deletedThreadIds.has(thread.id))
    .filter((thread) => !state.activeProject || threadBelongsToProject(thread, state.activeProject));
  const removed = allThreads.filter((thread) => state.hiddenThreadIds.has(thread.id));
  elements.activeThreadCount.textContent = state.activeThreads.filter((thread) => (
    (!state.activeProject || threadBelongsToProject(thread, state.activeProject))
    &&
    !state.hiddenThreadIds.has(thread.id)
    && !state.deletedThreadIds.has(thread.id)
    && !state.localArchivedThreadIds.has(thread.id)
  )).length;
  const archivedIds = new Set(state.archivedThreads
    .filter((thread) => (!state.activeProject || threadBelongsToProject(thread, state.activeProject))
      && !state.hiddenThreadIds.has(thread.id) && !state.deletedThreadIds.has(thread.id))
    .map((thread) => thread.id));
  for (const threadId of state.localArchivedThreadIds) {
    const thread = allThreads.find((item) => item.id === threadId);
    if (thread && !state.hiddenThreadIds.has(threadId) && !state.deletedThreadIds.has(threadId)) archivedIds.add(threadId);
  }
  elements.archivedThreadCount.textContent = archivedIds.size;
  elements.removedThreadCount.textContent = removed.length;
  elements.scheduledThreadCount.textContent = state.activeProject
    ? state.scheduledTasks.filter((task) => taskBelongsToProject(task, state.activeProject)).length
    : state.scheduledTasks.length;
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
  if (query !== state.threadSearchQuery) {
    state.threadSearchHits.clear();
    state.threadSearchQuery = query;
  }
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
    return [titleOf(thread), thread.cwd, thread.modelProvider].some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(query))
      || state.threadSearchHits.has(thread.id);
  });
  renderThreadList();
}

async function runThreadFullTextSearch(query, generation) {
  if (!state.connected || state.threadView === "scheduled" || query.length < 2) return;
  try {
    const matches = await api.searchThreads(query);
    if (generation !== state.threadSearchGeneration || elements.search.value.trim().toLocaleLowerCase("zh-CN") !== query) return;
    state.threadSearchHits = new Map((matches || []).map((match) => [match.id, match.snippet || ""]));
    applyThreadFilter(query);
  } catch (error) {
    if (generation === state.threadSearchGeneration) showDiagnostic(`全文搜索失败：${error.message}`, true);
  }
}

function scheduleThreadSearch() {
  const query = elements.search.value.trim().toLocaleLowerCase("zh-CN");
  const generation = ++state.threadSearchGeneration;
  clearTimeout(elements.search._timer);
  if (query !== state.threadSearchQuery) state.threadSearchHits.clear();
  state.threadSearchQuery = query;
  applyThreadFilter(query);
  if (query.length >= 2) {
    elements.search._timer = setTimeout(() => runThreadFullTextSearch(query, generation), 260);
  }
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
    const run = state.runningThreads.get(thread.id);
    const queueLength = (state.messageQueues.get(thread.id) || []).length;
    const searchSnippet = state.threadSearchHits.get(thread.id);
    const deletionMinutes = deletion ? Math.max(1, Math.ceil((deletion.expiresAt - Date.now()) / 60000)) : null;
    const detail = searchSnippet
      ? searchSnippet
      : deletion
      ? `${deletionMinutes} 分钟后从 Share Master 清除`
      : run ? `正在思考${queueLength ? ` · ${queueLength} 条排队` : ""}`
      : queueLength ? `${queueLength} 条待发送 · 点击会话后继续`
      : thread._syncedFromCodex ? `已同步的 Codex 会话 · ${timeAgo(thread.recencyAt || thread.updatedAt)}`
      : `${savedModel || thread.model || thread.modelProvider || "会话"} · ${timeAgo(thread.recencyAt || thread.updatedAt)}`;
    item.classList.toggle("pending-delete", Boolean(deletion));
    item.classList.toggle("thread-running", Boolean(run));
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
  const repeat = ({ once: "一次", hourly: "每小时", daily: "每天", weekdays: "工作日", weekly: "每周", monthly: "每月" })[task.repeat] || "一次";
  const when = new Date(task.scheduledAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (state.runningTaskIds.has(task.id)) return "正在执行";
  if (task.retryAt) return `${timeAgo(Math.floor(task.retryAt / 1000)) === "刚刚" ? "即将重试" : `${new Date(task.retryAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 重试`} · ${repeat}`;
  if (task.lastError) return `${task.enabled ? "上次失败" : "需处理"} · ${repeat}`;
  if (task.enabled && task.scheduledAt <= Date.now()) return `等待连接 · ${repeat}`;
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
    const run = document.createElement("button");
    run.className = "task-action run";
    run.title = running ? "任务执行中" : "立即运行";
    run.setAttribute("aria-label", run.title);
    run.disabled = running;
    run.innerHTML = '<span data-lucide="play"></span>';
    run.addEventListener("click", () => runScheduledTaskNow(task, run));
    row.appendChild(run);
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

function providerGroup(provider) {
  if (["official", "account"].includes(provider.type)) return { rank: 0, label: "OpenAI 账号" };
  if (provider.protocol === "chat_completions") return { rank: 2, label: "Chat Completions 模型" };
  return { rank: 1, label: "Codex 与编程代理" };
}

function providerVisual(provider = {}) {
  if (provider.preset === "deepseek") {
    return { className: "deepseek", label: "DeepSeek", markup: "<span>DS</span>" };
  }
  if (provider.preset === "qwen") {
    return { className: "qwen", label: "Qwen", markup: "<span>QW</span>" };
  }
  if (provider.protocol === "chat_completions") {
    return { className: "compatible", label: "兼容模型", markup: "<span>AI</span>" };
  }
  const brandLabel = provider.brand === "claude" ? "Claude" : "OpenAI";
  return {
    className: "brand",
    label: brandLabel,
    markup: `<img src="${brandIconPath(provider.brand)}" alt="${brandLabel}" />`,
  };
}

function renderProviderOptions() {
  const container = $("#provider-options");
  container.innerHTML = "";
  const providers = state.providers
    .map((provider, index) => ({ provider, index, group: providerGroup(provider) }))
    .sort((left, right) => left.group.rank - right.group.rank || left.index - right.index);
  let previousGroup = null;
  for (const { provider, group } of providers) {
    if (group.label !== previousGroup) {
      const heading = document.createElement("div");
      heading.className = "provider-group-label";
      heading.textContent = group.label;
      container.appendChild(heading);
      previousGroup = group.label;
    }
    const row = document.createElement("div");
    row.className = `provider-option-row provider-${provider.preset || provider.brand || "default"}`;
    row.dataset.providerRow = provider.id;
    row.dataset.providerGroup = group.label;
    const drag = document.createElement("button");
    drag.className = "provider-drag";
    drag.type = "button";
    drag.draggable = true;
    drag.title = `拖动调整 ${provider.connectionLabel || provider.label} 的顺序`;
    drag.setAttribute("aria-label", drag.title);
    drag.innerHTML = '<span data-lucide="grip-vertical"></span>';
    drag.addEventListener("dragstart", (event) => {
      state.draggingProviderId = provider.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", provider.id);
      row.classList.add("dragging");
    });
    drag.addEventListener("dragend", () => {
      state.draggingProviderId = null;
      document.querySelectorAll(".provider-option-row").forEach((item) => item.classList.remove("dragging", "drag-target"));
    });
    row.addEventListener("dragover", (event) => {
      const source = state.providers.find((item) => item.id === state.draggingProviderId);
      if (!source || providerGroup(source).label !== group.label || source.id === provider.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add("drag-target");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-target"));
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      row.classList.remove("drag-target");
      const sourceId = state.draggingProviderId || event.dataTransfer.getData("text/plain");
      const source = state.providers.find((item) => item.id === sourceId);
      if (!source || providerGroup(source).label !== group.label || sourceId === provider.id) return;
      const providerIds = state.providers.map((item) => item.id);
      providerIds.splice(providerIds.indexOf(sourceId), 1);
      providerIds.splice(providerIds.indexOf(provider.id), 0, sourceId);
      try {
        state.providers = await api.reorderProviders(providerIds);
        renderProviderOptions();
      } catch (error) {
        showActionError(error);
      }
    });
    const option = document.createElement("button");
    option.className = "provider-option";
    option.dataset.provider = provider.id;
    const visual = providerVisual(provider);
    const health = state.providerHealth[provider.id] || null;
    const route = state.providerRoutes[provider.id] || null;
    const configuredKey = provider.hasStoredKey ? "密钥已加密保存在应用内" : null;
    const baseDetail = provider.type === "account"
      ? "OpenAI · 独立官方登录，共享聊天记录"
      : provider.type === "relay"
        ? `${provider.protocol === "chat_completions" ? "Chat Completions" : "Codex Responses"} · ${provider.model} · ${provider.baseUrl}`
        : provider.id === "niubi"
          ? `OpenAI · ${provider.model} · ${configuredKey || "首次连接时配置 API Key"}`
          : provider.id === "hexuan"
            ? `OpenAI · ${provider.model} · ${configuredKey || "使用现有 HEXUAN_API_KEY"}`
            : provider.id === "claude"
              ? `Claude · ${provider.model || "未选择模型"} · ${configuredKey || "需要配置 Token"}`
              : "OpenAI · 使用 Codex 官方登录状态";
    const healthLabel = health?.openUntil > Date.now()
      ? `冷却中 · ${Math.max(1, Math.ceil((health.openUntil - Date.now()) / 1000))} 秒`
      : health?.status === "healthy" ? `正常 · ${Math.max(0, Number(health.latencyMs) || 0)} ms`
        : health?.status === "degraded" ? `不稳定 · 连续失败 ${health.failures || 1} 次`
          : health?.status === "configuration-error" ? "连接配置错误"
            : route?.enabled ? `自动切换 · ${route.fallbackProviderIds?.length || 0} 个备用` : null;
    const detail = [baseDetail, healthLabel].filter(Boolean).join(" · ");
    option.innerHTML = `<span class="provider-icon ${visual.className}" aria-label="${escapeHtml(visual.label)}">${visual.markup}</span><span><strong>${escapeHtml(provider.connectionLabel || provider.label)}</strong><small>${escapeHtml(detail)}</small></span>`;
    option.addEventListener("click", () => {
      if (provider.id === "claude" && !provider.hasStoredKey) openClaudeDialog(provider);
      else connect(provider.id);
    });
    const actions = document.createElement("div");
    actions.className = "provider-row-actions";
    const trailing = document.createElement("span");
    trailing.className = "provider-trailing";
    if (healthLabel) {
      trailing.innerHTML = `<span class="provider-health ${health?.openUntil > Date.now() ? "open" : health?.status || "route"}" title="${escapeHtml(healthLabel)}"></span>`;
    } else {
      trailing.innerHTML = '<span data-lucide="chevron-right"></span>';
    }
    actions.appendChild(trailing);
    row.append(drag, option, actions);
    if (provider.id === "claude" || provider.type === "relay") {
      row.classList.add("configurable");
      const configure = document.createElement("button");
      configure.className = "provider-configure";
      configure.type = "button";
      configure.title = provider.type === "relay" ? "编辑供应商" : "配置 Claude Token 和模型";
      configure.setAttribute("aria-label", configure.title);
      configure.innerHTML = '<span data-lucide="settings"></span>';
      configure.addEventListener("click", () => (
        provider.type === "relay" ? openRelayDialog(provider) : openClaudeDialog(provider)
      ));
      actions.appendChild(configure);
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
      actions.appendChild(remove);
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
  if (Array.isArray(snapshot.providerPresets) && Object.keys(state.providerPresets).length === 0) {
    renderProviderPresetCatalog(snapshot.providerPresets);
  }
  state.savedProjects = snapshot.projects || [];
  state.projectThreads = snapshot.projectThreads || {};
  state.hiddenProjectRoots = snapshot.hiddenProjectRoots || [];
  state.threadSettings = snapshot.threadSettings || {};
  state.providerRoutes = snapshot.providerRoutes || state.providerRoutes;
  state.threadAliases = snapshot.threadAliases || {};
  state.hiddenThreadIds = new Set(snapshot.hiddenThreadIds || []);
  state.deletedThreadIds = new Set(snapshot.deletedThreadIds || []);
  state.localArchivedThreadIds = new Set(snapshot.localArchivedThreadIds || []);
  state.pendingDeletions = snapshot.pendingDeletions || [];
  state.scheduledTasks = snapshot.scheduledTasks || [];
  if (snapshot.messageQueues && typeof snapshot.messageQueues === "object") {
    state.messageQueues = restoredMessageQueues(snapshot.messageQueues);
  }
  syncRecoveredTurns(snapshot.recoveredTurns);
  if (Array.isArray(snapshot.promptTemplates)) state.promptTemplates = snapshot.promptTemplates;
  if (Array.isArray(snapshot.mcpServers)) state.mcpServers = snapshot.mcpServers;
  state.runningTaskIds = new Set(snapshot.runningTaskIds || []);
  $("#extensions-prompt-count").textContent = String(state.promptTemplates.length);
  $("#extensions-mcp-count").textContent = String(state.mcpServers.length);
  renderPromptIndex();
  renderMcpIndex();
  renderSkillMenu(elements.skillSearch.value);
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
  else if (state.activeThread) {
    elements.windowTitle.textContent = titleOf(state.activeThread);
    renderMessageQueuePanel(state.activeThread.id);
  }
  if (activeProviderWasRemoved) {
    ++state.connectionGeneration;
    state.connectingProvider = null;
    state.provider = null;
    state.providerType = null;
    state.providerEngine = null;
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
  state.pendingAttachments = [];
  renderAttachments();
  state.threadResumed = false;
  state.activeArchived = Boolean(thread._archived || thread._removed);
  state.threadResumed = state.runningThreads.has(thread.id);
  elements.windowTitle.textContent = titleOf(thread);
  updateWorkspace();
  syncActiveRunState();
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
    if (state.runningThreads.has(thread.id)) {
      const readResult = await api.readThread(thread.id);
      if (!isCurrent()) return;
      state.activeThread = readResult.thread;
      state.threadResumed = true;
      applyThreadSessionSettings(readResult.thread);
      renderConversation(readResult.thread);
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
      state.threadResumed = !result.thread._crossModelReadOnly;
      if (result.thread._crossModelReadOnly) state.activeArchived = true;
      applyThreadSessionSettings(result.thread);
      renderConversation(result.thread);
      if (result.thread._crossModelReadOnly) {
        showDiagnostic("该会话来自其他模型，当前以只读方式打开；跨模型接续分支正在启用中。", false);
      } else if ((state.messageQueues.get(thread.id) || []).length) {
        setTimeout(() => startNextQueuedMessage(thread.id), 0);
      }
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
  syncThinkingIndicator();
  scrollToBottom();
  return true;
}

function renderConversation(thread) {
  const revision = conversationRevision(thread);
  elements.windowTitle.textContent = titleOf(thread);
  elements.empty.classList.add("hidden");
  elements.chat.classList.remove("hidden");
  if (state.renderedThreadId === thread.id && state.renderedThreadRevision === revision) {
    syncThinkingIndicator();
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
      if (turn.status === "failed") appendTurnInterruption(turn, thread.id);
    }
    const pendingInterruption = state.interruptedTurns.get(thread.id);
    if (pendingInterruption) appendTurnInterruption(pendingInterruption, thread.id);
  } finally {
    state.renderTarget = null;
  }
  elements.chat.replaceChildren(fragment);
  state.renderedThreadId = thread.id;
  state.renderedThreadRevision = revision;
  renderMessageQueuePanel(thread.id);
  syncThinkingIndicator();
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

function renderItem(item, turnId = null, streaming = false) {
  if (!item) return;
  if (item.type === "userMessage") {
    if (item.clientId) {
      const optimistic = document.querySelector(`[data-message-id="${CSS.escape(item.clientId)}"]`);
      if (optimistic) optimistic.dataset.messageId = item.id;
    }
    return appendUserMessage(item);
  }
  if (item.type === "agentMessage") {
    return appendMessage("agent", item.text, item.id, item.phase, item.sourceLabel || null, streaming);
  }
  if (item.type === "plan") {
    return appendActivity({
      ...item,
      command: "计划",
      aggregatedOutput: String(item.text || ""),
      displayOutput: true,
    }, turnId);
  }
  if (item.type === "reasoning") {
    const summaryParts = (item.summary || [])
      .map((part) => ({
        type: typeof part === "string" ? null : part?.type || null,
        text: typeof part === "string" ? part : part?.text || "",
      }))
      .filter((part) => part.text);
    const isStreamedCompatibleSummary = summaryParts.length > 1
      && summaryParts.every((part) => part.type === "summary_text");
    const summary = summaryParts.map((part) => part.text).join(isStreamedCompatibleSummary ? "" : "\n\n");
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

function interruptionCopy(turn = {}) {
  const code = String(turn.error?.code || "").trim();
  if (code === "OUTPUT_TRUNCATED") {
    return {
      title: "回答达到长度上限",
      detail: turn.error?.message || "模型达到输出长度上限，当前回答可能不完整。",
      icon: "text-cursor-input",
    };
  }
  if (code === "CONTENT_FILTERED") {
    return {
      title: "回答被提前中止",
      detail: turn.error?.message || "模型供应商因内容过滤提前结束了回答。",
      icon: "shield-alert",
    };
  }
  return {
    title: "回答中途断开",
    detail: turn.error?.message || "模型连接在生成完成前结束。已生成的内容已经保留。",
    icon: "wifi-off",
  };
}

function appendTurnInterruption(turn = {}, threadId = state.activeThread?.id) {
  if (!threadId) return null;
  const target = conversationTarget();
  const turnId = String(turn.id || `connection-${threadId}`);
  let node = target.querySelector(`[data-interrupted-turn-id="${CSS.escape(turnId)}"]`);
  if (node) return node;
  const copy = interruptionCopy(turn);
  const requestId = String(turn.error?.requestId || turn.requestId || "").trim();
  node = document.createElement("section");
  node.className = "turn-interruption";
  node.dataset.interruptedTurnId = turnId;
  node.dataset.threadId = threadId;
  node.innerHTML = `
    <span class="turn-interruption-icon"><span data-lucide="${copy.icon}"></span></span>
    <span class="turn-interruption-copy">
      <strong>${escapeHtml(copy.title)}</strong>
      <span>${escapeHtml(copy.detail)}</span>
      ${requestId ? `<small>请求 ID：${escapeHtml(requestId)}</small>` : ""}
    </span>
    <span class="turn-interruption-actions">
      <button class="secondary-command continue-interrupted-turn" type="button"><span data-lucide="corner-down-right"></span>继续生成</button>
    </span>`;
  node.querySelector(".continue-interrupted-turn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (state.activeThread?.id !== threadId) return;
    if (!state.connected) {
      showDiagnostic("连接尚未恢复，请等待自动重连或重新选择连接。", true);
      return;
    }
    if (state.running || state.submitting) {
      showDiagnostic("当前会话仍在运行，请先等待或停止当前回复。", true);
      return;
    }
    button.disabled = true;
    button.innerHTML = '<span data-lucide="loader-circle"></span>正在继续';
    button.classList.add("working");
    refreshIcons();
    const savedDraft = elements.input.value;
    const savedAttachments = [...state.pendingAttachments];
    elements.input.value = "请从刚才中断的位置继续。先检查已经完成的操作，不要重复已完成的文件修改、工具调用或已经输出的内容。";
    state.pendingAttachments = [];
    renderAttachments();
    elements.input.dispatchEvent(new Event("input", { bubbles: true }));
    await sendMessage("auto");
    if (state.activeThread?.id === threadId) {
      const currentDraft = elements.input.value.trim();
      elements.input.value = [savedDraft.trim(), currentDraft].filter(Boolean).join("\n");
      state.pendingAttachments = [...new Set([...savedAttachments, ...state.pendingAttachments])];
      renderAttachments();
      resizeComposer();
      syncComposerState();
    }
    if (state.runningThreads.has(threadId)) {
      state.interruptedTurns.delete(threadId);
      button.innerHTML = '<span data-lucide="check"></span>已继续';
    } else {
      button.disabled = false;
      button.classList.remove("working");
      button.innerHTML = '<span data-lucide="corner-down-right"></span>继续生成';
    }
    refreshIcons();
  });
  target.appendChild(node);
  if (!state.renderTarget) {
    syncThinkingIndicator();
    refreshIcons();
    scrollToBottom();
  }
  return node;
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

function renderAttachments() {
  ShareMasterVueRuntime.attachmentUi.items = state.pendingAttachments.map((filePath) => ({
    path: filePath,
    name: String(filePath).split(/[\\/]/).filter(Boolean).at(-1) || "图片附件",
    url: localImageUrl(filePath),
  }));
}

function addAttachments(paths) {
  const existing = new Set(state.pendingAttachments.map(normalizePath));
  for (const filePath of paths || []) {
    if (!filePath || existing.has(normalizePath(filePath))) continue;
    state.pendingAttachments.push(filePath);
    existing.add(normalizePath(filePath));
    if (state.pendingAttachments.length >= 8) break;
  }
  renderAttachments();
  syncComposerState();
}

const IMAGE_ATTACHMENT_PATTERN = /\.(?:gif|jpe?g|png|webp)$/i;
let attachmentDragDepth = 0;

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function setAttachmentDragActive(active) {
  ShareMasterVueRuntime.attachmentUi.dragActive = Boolean(active);
}

function resetAttachmentDrag() {
  attachmentDragDepth = 0;
  setAttachmentDragActive(false);
}

function droppedAttachmentPaths(files) {
  return Array.from(files || []).map((file) => {
    try {
      return api.localFilePath(file);
    } catch {
      return "";
    }
  }).filter(Boolean);
}

function addDroppedAttachments(paths) {
  const files = Array.from(paths || []).filter(Boolean);
  const images = files.filter((filePath) => IMAGE_ATTACHMENT_PATTERN.test(filePath));
  if (images.length) addAttachments(images);
  const unsupported = files.length - images.length;
  if (unsupported > 0 && images.length) showDiagnostic(`已忽略 ${unsupported} 个非图片文件`, true);
  if (files.length && !images.length) showDiagnostic("当前仅支持 PNG、JPG、WebP 和 GIF 图片附件", true);
  return { added: images.length, unsupported };
}

window.addEventListener("share-master:remove-attachment", (event) => {
  const index = Number(event.detail?.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.pendingAttachments.length) return;
  state.pendingAttachments.splice(index, 1);
  renderAttachments();
  syncComposerState();
});

window.addEventListener("share-master:copy-attachment", async (event) => {
  const filePath = String(event.detail?.path || "");
  if (!filePath) return;
  try {
    await api.copyImage({ path: filePath });
    showDiagnostic("图片已复制到剪贴板。", false);
  } catch (error) {
    showDiagnostic(`复制图片失败：${error.message}`, true);
  }
});

window.addEventListener("dragenter", (event) => {
  if (!hasDraggedFiles(event) || elements.attachButton.disabled) return;
  event.preventDefault();
  attachmentDragDepth += 1;
  setAttachmentDragActive(true);
});

window.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event) || elements.attachButton.disabled) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragleave", (event) => {
  if (!hasDraggedFiles(event)) return;
  attachmentDragDepth = Math.max(0, attachmentDragDepth - 1);
  if (attachmentDragDepth === 0) setAttachmentDragActive(false);
});

window.addEventListener("drop", (event) => {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  const paths = droppedAttachmentPaths(event.dataTransfer.files);
  resetAttachmentDrag();
  addDroppedAttachments(paths);
});

let clipboardPastePending = false;

function clipboardContainsImage(event) {
  const data = event.clipboardData;
  if (!data) return false;
  return Array.from(data.items || []).some((item) => item.kind === "file" || /^image\//i.test(item.type || ""))
    || Array.from(data.types || []).includes("Files");
}

async function pasteClipboardAttachments(event) {
  if (elements.attachButton.disabled || clipboardPastePending || !clipboardContainsImage(event)) return;
  event.preventDefault();
  const directPaths = droppedAttachmentPaths(event.clipboardData?.files);
  if (directPaths.length) {
    const result = addDroppedAttachments(directPaths);
    if (result.added) showDiagnostic(`已从剪贴板添加 ${result.added} 张图片。`, false);
    return;
  }
  clipboardPastePending = true;
  try {
    const result = await api.pasteClipboardImages();
    const added = addDroppedAttachments(result?.paths || []);
    if (added.added) showDiagnostic(`已从剪贴板添加 ${added.added} 张图片。`, false);
    else showDiagnostic("剪贴板中没有可添加的图片附件。", true);
  } catch (error) {
    showDiagnostic(`粘贴附件失败：${error.message}`, true);
  } finally {
    clipboardPastePending = false;
    elements.input.focus();
  }
}

function queuedMessageSteerKey(threadId, clientUserMessageId) {
  return `${threadId}:${clientUserMessageId}`;
}

function providerSupportsQueuedGuide() {
  return ["codex", "openai-compatible", "claude"].includes(state.providerEngine);
}

function queuedMessageCanSteer(threadId, message) {
  const run = state.runningThreads.get(threadId);
  return Boolean(
    state.connected
    && !state.submitting
    && providerSupportsQueuedGuide()
    && run?.turnId
    && !state.steeringThreads.has(threadId)
    && !state.queueDispatchingThreads.has(threadId)
    && (!message?.providerId || message.providerId === state.provider)
    && !state.steeringQueuedMessages.has(queuedMessageSteerKey(threadId, message?.clientUserMessageId)),
  );
}

function queuedMessageAttachmentPaths(message) {
  return (message?.imageInputs || []).map((image) => image?.path).filter(Boolean);
}

function queueThreadBusy(threadId) {
  return state.steeringThreads.has(threadId) || state.queueDispatchingThreads.has(threadId);
}

async function removeQueuedMessage(threadId, clientUserMessageId, { restoreToComposer = false } = {}) {
  if (queueThreadBusy(threadId)) {
    showDiagnostic("队列正在处理，请稍候再操作。", false);
    return false;
  }
  const queue = state.messageQueues.get(threadId) || [];
  const index = queue.findIndex((message) => message.clientUserMessageId === clientUserMessageId);
  if (index < 0) return false;
  const [message] = queue.splice(index, 1);
  if (queue.length) state.messageQueues.set(threadId, queue);
  else state.messageQueues.delete(threadId);
  await persistMessageQueue(threadId);
  if (restoreToComposer && threadId === state.activeThread?.id) {
    elements.input.value = message.displayText || message.text || "";
    state.pendingAttachments = [];
    addAttachments(queuedMessageAttachmentPaths(message));
    renderAttachments();
    resizeComposer();
    syncComposerState();
    elements.input.focus();
    elements.input.setSelectionRange(elements.input.value.length, elements.input.value.length);
  }
  renderMessageQueuePanel(threadId);
  syncActiveRunState();
  return true;
}

function renderMessageQueuePanel(threadId = state.activeThread?.id) {
  const panel = elements.messageQueuePanel;
  if (!panel) return;
  const queue = threadId ? state.messageQueues.get(threadId) || [] : [];
  panel.replaceChildren();
  panel.classList.toggle("hidden", !queue.length || threadId !== state.activeThread?.id);
  if (!queue.length || threadId !== state.activeThread?.id) return;

  const heading = document.createElement("div");
  heading.className = "message-queue-heading";
  const headingIcon = document.createElement("span");
  headingIcon.className = "message-queue-heading-icon";
  headingIcon.innerHTML = '<span data-lucide="list-plus"></span>';
  const title = document.createElement("strong");
  title.textContent = `待发送 · ${queue.length}`;
  const detail = document.createElement("small");
  const running = Boolean(state.runningThreads.get(threadId));
  detail.textContent = running ? "当前回复完成后按顺序发送" : "等待继续发送";
  heading.append(headingIcon, title, detail);
  if (!running) {
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "message-queue-resume";
    resume.innerHTML = '<span data-lucide="play"></span><span>继续发送</span>';
    resume.addEventListener("click", () => startNextQueuedMessage(threadId));
    heading.appendChild(resume);
  }

  const list = document.createElement("div");
  list.className = "message-queue-list";
  queue.forEach((message) => {
    const item = document.createElement("div");
    item.className = "queued-prompt-item";
    item.dataset.clientUserMessageId = message.clientUserMessageId || "";
    const queueIcon = document.createElement("span");
    queueIcon.className = "queued-prompt-icon";
    queueIcon.innerHTML = '<span data-lucide="clock-3"></span>';
    const copy = document.createElement("span");
    copy.className = "queued-prompt-copy";
    const prompt = document.createElement("strong");
    prompt.textContent = String(message.displayText || message.text || "").trim() || "图片附件";
    prompt.title = prompt.textContent;
    const meta = document.createElement("small");
    const attachmentCount = queuedMessageAttachmentPaths(message).length;
    const steering = state.steeringQueuedMessages.has(queuedMessageSteerKey(threadId, message.clientUserMessageId));
    meta.className = "queued-prompt-state";
    meta.textContent = steering
      ? "正在引导当前回复…"
      : attachmentCount ? `${attachmentCount} 张图片 · 已排队` : "已排队";
    copy.append(prompt, meta);
    const actions = document.createElement("span");
    actions.className = "queued-prompt-actions";
    const steer = document.createElement("button");
    steer.type = "button";
    steer.className = "queued-steer-button";
    steer.dataset.threadId = threadId;
    steer.dataset.clientUserMessageId = message.clientUserMessageId || "";
    steer.textContent = steering ? "引导中" : "引导";
    steer.addEventListener("click", () => steerQueuedMessage(threadId, message.clientUserMessageId));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "queued-prompt-icon-button queued-prompt-delete";
    remove.title = "删除这条排队消息";
    remove.setAttribute("aria-label", remove.title);
    remove.innerHTML = '<span data-lucide="trash-2"></span>';
    remove.addEventListener("click", () => removeQueuedMessage(threadId, message.clientUserMessageId));
    const more = document.createElement("details");
    more.className = "queued-prompt-more";
    const moreToggle = document.createElement("summary");
    moreToggle.className = "queued-prompt-icon-button";
    moreToggle.title = "更多操作";
    moreToggle.setAttribute("aria-label", moreToggle.title);
    moreToggle.innerHTML = '<span data-lucide="ellipsis"></span>';
    const moreMenu = document.createElement("span");
    moreMenu.className = "queued-prompt-more-menu";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "queued-prompt-edit";
    edit.innerHTML = '<span data-lucide="pencil"></span><span>编辑消息</span>';
    edit.addEventListener("click", () => removeQueuedMessage(threadId, message.clientUserMessageId, { restoreToComposer: true }));
    moreMenu.appendChild(edit);
    more.append(moreToggle, moreMenu);
    actions.append(steer, remove, more);
    item.append(queueIcon, copy, actions);
    list.appendChild(item);
  });
  panel.append(heading, list);
  refreshQueuedSteerButtons(threadId);
  refreshIcons();
}

function refreshQueuedSteerButtons(threadId = state.activeThread?.id) {
  if (!threadId || threadId !== state.activeThread?.id) return;
  const queue = state.messageQueues.get(threadId) || [];
  const messages = new Map(queue.map((message) => [message.clientUserMessageId, message]));
  for (const button of elements.messageQueuePanel?.querySelectorAll(".queued-steer-button") || []) {
    const message = messages.get(button.dataset.clientUserMessageId);
    const visible = Boolean(message && providerSupportsQueuedGuide() && state.runningThreads.get(threadId)?.turnId);
    button.classList.toggle("hidden", !visible);
    button.disabled = !visible || !queuedMessageCanSteer(threadId, message);
    button.title = button.disabled
      ? "当前回复结束后将自动发送"
      : state.providerEngine === "codex" ? "立即引导当前回复" : "停止当前回复并立即按这条消息继续";
    button.setAttribute("aria-label", button.title);
  }
  const busy = queueThreadBusy(threadId);
  for (const button of elements.messageQueuePanel?.querySelectorAll(".queued-prompt-delete, .queued-prompt-edit") || []) {
    button.disabled = busy;
  }
  for (const toggle of elements.messageQueuePanel?.querySelectorAll(".queued-prompt-more > summary") || []) {
    toggle.setAttribute("aria-disabled", String(busy));
    toggle.addEventListener("click", (event) => {
      if (busy) event.preventDefault();
    });
  }
}

function setPendingMessageDelivery(node, delivery, threadId, clientUserMessageId) {
  node.querySelector(".message-delivery-state")?.remove();
  if (!delivery) return null;
  const status = document.createElement("div");
  status.className = `message-delivery-state delivery-${delivery}`;
  const label = document.createElement("span");
  label.className = "message-delivery-label";
  label.textContent = delivery === "queue" ? "已排队"
    : delivery === "steered" ? "已引导"
      : "正在引导当前回复";
  status.appendChild(label);
  node.querySelector(".message-column")?.appendChild(status);
  return status;
}

function appendPendingUserMessage(text, id, attachments = [], delivery = null, threadId = state.activeThread?.id) {
  const node = appendUserMessage({
    id,
    content: [
      ...(text ? [{ type: "text", text }] : []),
      ...attachments.map((filePath) => ({ type: "localImage", path: filePath })),
    ],
  });
  node.dataset.pendingThreadId = threadId || "";
  setPendingMessageDelivery(node, delivery, threadId, id);
  return node;
}

function appendUserMessage(item) {
  const node = appendMessage("user", userText(item), item.id);
  if (item.clientId) node.querySelector(".message-delivery-state")?.remove();
  node.querySelector(".message-media")?.remove();
  const images = (item.content || []).filter((part) => ["image", "localImage"].includes(part.type));
  node.dataset.attachmentSources = JSON.stringify(images.map((part) => ({
    path: part.path || null,
    url: part.url || null,
  })));
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
    const mediaItem = document.createElement("span");
    mediaItem.className = "message-media-item";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "message-media-copy";
    copy.title = "复制图片";
    copy.setAttribute("aria-label", copy.title);
    copy.innerHTML = '<span data-lucide="copy"></span>';
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      try {
        await api.copyImage(part.path ? { path: part.path } : { url: part.url });
        copy.title = "已复制";
        copy.innerHTML = '<span data-lucide="check"></span>';
        showDiagnostic("图片已复制到剪贴板。", false);
      } catch (error) {
        showDiagnostic(`复制图片失败：${error.message}`, true);
      } finally {
        copy.disabled = false;
        refreshIcons();
        setTimeout(() => {
          if (!copy.isConnected) return;
          copy.title = "复制图片";
          copy.innerHTML = '<span data-lucide="copy"></span>';
          refreshIcons();
        }, 1400);
      }
    });
    mediaItem.append(image, copy);
    media.appendChild(mediaItem);
  }
  node.querySelector(".message-body").appendChild(media);
  if (!state.renderTarget) refreshIcons();
  return node;
}

function providerInitials(label) {
  const value = String(label || "").trim();
  if (/deepseek/i.test(value)) return "DS";
  if (/qwen|通义|千问/i.test(value)) return "QW";
  if (/claude|anthropic/i.test(value)) return "CL";
  if (/codex/i.test(value)) return "CX";
  if (/openai|chatgpt/i.test(value)) return "OA";
  const words = value.match(/[a-zA-Z0-9]+/g);
  if (words?.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  if (words?.[0]) return words[0].slice(0, 2).toUpperCase();
  return [...value].slice(0, 2).join("") || "AI";
}

function composerInsert(value) {
  const text = String(value || "").trim();
  if (!text) return;
  elements.input.value = elements.input.value.trim()
    ? `${elements.input.value.trim()}\n\n${text}`
    : text;
  elements.input.dispatchEvent(new Event("input", { bubbles: true }));
  elements.input.focus();
}

function previousUserMessageText(node) {
  let current = node?.previousElementSibling || null;
  while (current) {
    if (current.matches?.(".message.user")) return current.dataset.rawText || "";
    current = current.previousElementSibling;
  }
  return "";
}

function ensureMessageActions(node, role) {
  let actions = node.querySelector(".message-actions");
  if (actions) return;
  actions = document.createElement("div");
  actions.className = "message-actions";
  const addAction = (icon, title, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-action-button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = `<span data-lucide="${icon}"></span>`;
    button.addEventListener("click", handler);
    actions.appendChild(button);
  };
  addAction("copy", "复制消息", async (event) => {
    const button = event.currentTarget;
    try {
      await api.copyText(node.dataset.rawText || "");
      button.title = "已复制";
      button.innerHTML = '<span data-lucide="check"></span>';
      refreshIcons();
      setTimeout(() => {
        if (!button.isConnected) return;
        button.title = "复制消息";
        button.innerHTML = '<span data-lucide="copy"></span>';
        refreshIcons();
      }, 1400);
    } catch (error) {
      showActionError(error);
    }
  });
  addAction("quote", "引用到输入框", () => {
    const quoted = String(node.dataset.rawText || "").slice(0, 4000).split("\n").map((line) => `> ${line}`).join("\n");
    composerInsert(quoted);
  });
  if (role === "user") {
    addAction("pencil", "编辑并重新发送", () => {
      if (state.runningThreads.has(state.activeThread?.id)) requestTurnInterrupt();
      elements.input.value = node.dataset.rawText || "";
      let sources = [];
      try {
        sources = JSON.parse(node.dataset.attachmentSources || "[]");
      } catch {
        sources = [];
      }
      state.pendingAttachments = [];
      addAttachments(sources.map((source) => source?.path).filter(Boolean));
      renderAttachments();
      resizeComposer();
      syncComposerState();
      elements.input.focus();
      elements.input.setSelectionRange(elements.input.value.length, elements.input.value.length);
    });
    actions.lastElementChild?.classList.add("user-edit-message");
  }
  if (role === "agent") {
    addAction("refresh-cw", "重新生成回答", () => {
      if (state.running || state.submitting) {
        showDiagnostic("请先停止或等待当前回复完成。", true);
        return;
      }
      const prompt = previousUserMessageText(node);
      if (!prompt) {
        showDiagnostic("未找到可重新生成的用户消息。", true);
        return;
      }
      elements.input.value = prompt;
      elements.input.dispatchEvent(new Event("input", { bubbles: true }));
      sendMessage("auto");
    });
  }
  node.querySelector(".message-column")?.appendChild(actions);
  if (!state.renderTarget) refreshIcons();
}

function appendMessage(role, text, id = crypto.randomUUID(), phase = null, sourceLabel = null, streaming = false) {
  const target = conversationTarget();
  let node = target.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  if (!node) {
    node = document.createElement("article");
    node.className = `message ${role}`;
    node.dataset.messageId = id;
    node.dataset.messageRole = role;
    const providerLabel = sourceLabel || currentProviderDefinition()?.label
      || (state.providerType === "claude" ? "Claude" : "Share Master");
    const avatar = role === "user" ? "你" : providerInitials(providerLabel);
    node.innerHTML = `<div class="message-avatar">${avatar}</div><div class="message-column"><div class="message-header">${role === "user" ? "你" : escapeHtml(providerLabel)}</div><div class="message-body"></div></div>`;
    target.appendChild(node);
  }
  const body = node.querySelector(".message-body");
  if (role === "agent" && streaming) {
    const initialText = String(text || "");
    body.textContent = initialText;
    streamTextChunks.set(node, initialText ? [initialText] : []);
    delete node.dataset.rawText;
  } else {
    body.innerHTML = role === "agent" ? renderMarkdown(text) : `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`;
    node.dataset.rawText = String(text || "");
    streamTextChunks.delete(node);
  }
  node.classList.toggle("streaming", role === "agent" && streaming);
  if (role === "agent" && streaming) {
    node.setAttribute("aria-busy", "true");
    node.querySelector(".message-actions")?.remove();
  } else {
    node.removeAttribute("aria-busy");
    ensureMessageActions(node, role);
  }
  if (phase) node.dataset.phase = phase;
  state.streamNodes.set(id, node);
  if (!state.renderTarget) {
    syncThinkingIndicator();
    scrollToBottom();
  }
  return node;
}

function appendActivity(item, turnId = null) {
  const target = conversationTarget();
  const lastContent = target.lastElementChild?.classList.contains("thinking-indicator")
    ? target.lastElementChild.previousElementSibling
    : target.lastElementChild;
  let group = lastContent?.classList.contains("activity") ? lastContent : null;
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
    row.className = `activity-row activity-${String(item.type || "operation").replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}`;
    row.dataset.activityId = item.id;
    group.appendChild(row);
  }
  const details = item.command || item.tool || item.query || item.path || (item.changes ? `${item.changes.length} 个文件变更` : item.type);
  const icon = item.type === "commandExecution" ? "terminal"
    : item.type === "fileChange" ? "file-diff"
      : item.type === "webSearch" ? "globe"
        : item.type === "reasoning" ? "brain"
          : item.type === "plan" ? "list-checks" : "wrench";
  const output = item.displayOutput && item.aggregatedOutput
    ? `<pre class="activity-output">${escapeHtml(item.aggregatedOutput)}</pre>`
    : "";
  row.innerHTML = `<span data-lucide="${icon}"></span><code>${escapeHtml(details)}</code><span>${escapeHtml(item.status || "")}</span>${output}`;
  if (!state.renderTarget) {
    syncThinkingIndicator();
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

function renderActivityDelta(itemId, turnId, label, delta, icon = "terminal") {
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
  appendTextDelta(output, delta);
  if (!row.querySelector("svg")) row.insertAdjacentHTML("afterbegin", `<span data-lucide="${icon}"></span>`);
}

function appendTextDelta(node, value) {
  const text = String(value || "");
  if (!text) return;
  const last = node.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) last.appendData(text);
  else node.append(document.createTextNode(text));
}

function streamingText(node) {
  const chunks = streamTextChunks.get(node);
  return chunks ? chunks.join("") : node.dataset.rawText || "";
}

function finalizeStreamingNode(node) {
  const body = node.querySelector(".message-body");
  const text = streamingText(node);
  node.dataset.rawText = text;
  body.innerHTML = renderMarkdown(text);
  streamTextChunks.delete(node);
  node.classList.remove("streaming");
  node.removeAttribute("aria-busy");
  ensureMessageActions(node, "agent");
}

function shouldAutoScrollStream() {
  if (performance.now() - lastComposerInputAt < COMPOSER_ACTIVITY_WINDOW_MS) return false;
  const gap = elements.chat.scrollHeight - elements.chat.scrollTop - elements.chat.clientHeight;
  return elements.chat.clientHeight <= 0 || gap < 420;
}

function flushPendingStreamUpdates(itemId = null, finalize = false) {
  if (itemId === null && streamRenderTimer) {
    clearTimeout(streamRenderTimer);
    streamRenderTimer = null;
  }
  const shouldScroll = shouldAutoScrollStream();
  const finalizedNodes = new Set();
  for (const [id, pending] of [...pendingAgentStreamRenders]) {
    if (itemId !== null && id !== itemId) continue;
    pendingAgentStreamRenders.delete(id);
    if (!pending.node.isConnected) continue;
    const body = pending.node.querySelector(".message-body");
    if (finalize) {
      finalizeStreamingNode(pending.node);
      finalizedNodes.add(pending.node);
    } else {
      appendTextDelta(body, pending.deltas.join(""));
    }
  }
  for (const [id, pending] of [...pendingActivityStreamDeltas]) {
    if (itemId !== null && id !== itemId) continue;
    pendingActivityStreamDeltas.delete(id);
    if (pending.threadId && pending.threadId !== state.activeThread?.id) continue;
    renderActivityDelta(id, pending.turnId, pending.label, pending.deltas.join(""), pending.icon);
  }
  if (finalize) {
    for (const node of elements.chat.querySelectorAll(".message.agent.streaming")) {
      if (!finalizedNodes.has(node)) finalizeStreamingNode(node);
    }
  }
  if (shouldScroll) scrollToBottom();
}

function scheduleStreamUpdateFlush() {
  if (streamRenderTimer) return;
  streamRenderTimer = setTimeout(() => {
    streamRenderTimer = null;
    flushPendingStreamUpdates();
  }, STREAM_RENDER_INTERVAL_MS);
}

function appendAgentMessageDelta(itemId, delta) {
  const node = state.streamNodes.get(itemId) || appendMessage("agent", "", itemId, "commentary", null, true);
  if (!node.classList.contains("streaming")) {
    node.classList.add("streaming");
    node.setAttribute("aria-busy", "true");
    node.querySelector(".message-actions")?.remove();
  }
  const value = String(delta || "");
  if (!streamTextChunks.has(node)) streamTextChunks.set(node, node.dataset.rawText ? [node.dataset.rawText] : []);
  if (value) streamTextChunks.get(node).push(value);
  const pending = pendingAgentStreamRenders.get(itemId) || { node, deltas: [] };
  if (value) pending.deltas.push(value);
  pendingAgentStreamRenders.set(itemId, pending);
  scheduleStreamUpdateFlush();
}

function appendActivityDelta(itemId, turnId, label, delta, icon = "terminal", threadId = state.activeThread?.id) {
  const pending = pendingActivityStreamDeltas.get(itemId) || {
    threadId,
    turnId,
    label,
    icon,
    deltas: [],
  };
  const value = String(delta || "");
  if (value) pending.deltas.push(value);
  pendingActivityStreamDeltas.set(itemId, pending);
  scheduleStreamUpdateFlush();
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

function restoredMessageQueues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
  return new Map(Object.entries(value).flatMap(([threadId, messages]) => {
    if (!Array.isArray(messages) || !messages.length) return [];
    return [[threadId, messages.map((message) => ({ ...message, threadId }))]];
  }));
}

function restoreRecoveredTurns(value) {
  const recovered = new Map();
  for (const turn of Array.isArray(value) ? value : []) {
    const threadId = String(turn?.threadId || "").trim();
    if (!threadId) continue;
    const restarted = turn.interruptionReason === "app-restarted";
    recovered.set(threadId, {
      id: turn.turnId || `restart-${threadId}`,
      status: "failed",
      error: {
        code: restarted ? "APP_RESTARTED" : "SERVER_DISCONNECTED",
        message: restarted
          ? "Share Master 上次在回答完成前关闭。当前会话记录和待发送消息均已保留，可以继续生成或让队列继续发送。"
          : "模型连接在回答完成前退出。当前会话记录和待发送消息均已保留，可以继续生成或让队列继续发送。",
      },
    });
  }
  return recovered;
}

function syncRecoveredTurns(value) {
  if (!Array.isArray(value)) return;
  const recovered = restoreRecoveredTurns(value);
  for (const [threadId, turn] of state.interruptedTurns) {
    if (["APP_RESTARTED", "SERVER_DISCONNECTED"].includes(turn?.error?.code) && !recovered.has(threadId)) {
      state.interruptedTurns.delete(threadId);
    }
  }
  for (const [threadId, turn] of recovered) {
    if (!state.runningThreads.has(threadId)) state.interruptedTurns.set(threadId, turn);
  }
}

async function persistMessageQueue(threadId) {
  if (!threadId) return;
  try {
    await api.saveMessageQueue({ threadId, messages: state.messageQueues.get(threadId) || [] });
  } catch (error) {
    showDiagnostic(`待发送队列保存失败：${error.message}`, true);
  }
}

async function waitForTurnToStop(threadId, turnId, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentTurnId = state.runningThreads.get(threadId)?.turnId || null;
    if (!currentTurnId || currentTurnId !== turnId) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function steerQueuedMessage(threadId, clientUserMessageId) {
  const queue = state.messageQueues.get(threadId) || [];
  const message = queue.find((item) => item.clientUserMessageId === clientUserMessageId);
  const run = state.runningThreads.get(threadId);
  if (!message) {
    showDiagnostic("这条消息已不在待发送队列中。", true);
    refreshQueuedSteerButtons(threadId);
    return;
  }
  if (!queuedMessageCanSteer(threadId, message) || !run?.turnId) {
    showDiagnostic("当前回复已经结束，这条消息会继续按队列发送。", false);
    refreshQueuedSteerButtons(threadId);
    return;
  }
  const steerKey = queuedMessageSteerKey(threadId, clientUserMessageId);
  const expectedTurnId = run.turnId;
  const useNativeSteer = state.providerEngine === "codex";
  const node = threadId === state.activeThread?.id
    ? appendPendingUserMessage(
      message.displayText || message.text || "",
      clientUserMessageId,
      queuedMessageAttachmentPaths(message),
      "steer",
      threadId,
    )
    : null;
  const status = node?.querySelector(".message-delivery-state") || null;
  const statusLabel = status?.querySelector(".message-delivery-label");
  state.steeringThreads.add(threadId);
  state.steeringQueuedMessages.add(steerKey);
  syncComposerState();
  renderMessageQueuePanel(threadId);
  let inactive = false;
  let steered = false;
  let removedIndex = -1;
  try {
    if (useNativeSteer) {
      const result = await api.steerTurn({ ...message, expectedTurnId });
      inactive = Boolean(result?.inactive || result?.steered === false);
      if (inactive) {
        node?.remove();
        showDiagnostic("当前回复已结束，消息继续按队列发送。", false);
        return;
      }
    } else {
      await api.interruptTurn({ threadId, turnId: expectedTurnId });
      const stopped = await waitForTurnToStop(threadId, expectedTurnId);
      if (!stopped) throw new Error("停止当前回复超时，请稍后重试。");
    }
    const currentQueue = state.messageQueues.get(threadId) || [];
    const currentIndex = currentQueue.findIndex((item) => item.clientUserMessageId === clientUserMessageId);
    if (currentIndex >= 0) {
      removedIndex = currentIndex;
      currentQueue.splice(currentIndex, 1);
    }
    if (currentQueue.length) state.messageQueues.set(threadId, currentQueue);
    else state.messageQueues.delete(threadId);
    await persistMessageQueue(threadId);
    if (!useNativeSteer) await beginTurn({ ...message, threadId });
    steered = true;
    if (status) status.className = "message-delivery-state delivery-steered";
    if (statusLabel) statusLabel.textContent = "已引导";
    status?.querySelector(".queued-steer-button")?.remove();
    if (status) setTimeout(() => status.remove(), 1800);
    showDiagnostic("已引导当前回复。", false);
  } catch (error) {
    if (removedIndex >= 0 && !steered) {
      const currentQueue = state.messageQueues.get(threadId) || [];
      if (!currentQueue.some((item) => item.clientUserMessageId === clientUserMessageId)) {
        currentQueue.splice(Math.min(removedIndex, currentQueue.length), 0, message);
        state.messageQueues.set(threadId, currentQueue);
        await persistMessageQueue(threadId);
      }
    }
    node?.remove();
    showDiagnostic(`引导发送失败，消息仍在队列中：${error.message}`, true);
  } finally {
    state.steeringQueuedMessages.delete(steerKey);
    state.steeringThreads.delete(threadId);
    if (inactive && state.runningThreads.get(threadId)?.turnId === expectedTurnId) {
      setThreadRunning(threadId, false);
    } else {
      syncActiveRunState();
    }
    renderMessageQueuePanel(threadId);
    const remaining = state.messageQueues.get(threadId) || [];
    if ((inactive || steered) && remaining.length && !state.runningThreads.has(threadId)) {
      setTimeout(() => startNextQueuedMessage(threadId), 0);
    }
  }
}

async function sendMessage(_deliveryMode = "auto") {
  const text = elements.input.value.trim();
  const attachments = [...state.pendingAttachments];
  if ((!text && !attachments.length) || !state.connected || state.submitting) return;
  const { prompt, skillInputs } = parseSkillInvocations(text);
  const generation = state.openThreadGeneration;
  const isCurrent = (threadId = null) => generation === state.openThreadGeneration
    && (!threadId || state.activeThread?.id === threadId);
  const workspace = state.workspace;
  const sessionSettings = selectedSessionSettings();
  const initialThread = state.activeThread;
  const needsResume = Boolean(initialThread && !state.threadResumed && !state.runningThreads.has(initialThread.id));
  elements.input.value = "";
  state.pendingAttachments = [];
  renderAttachments();
  resizeComposer();
  if (initialThread && state.runningThreads.has(initialThread.id)) {
    const clientUserMessageId = crypto.randomUUID();
    const outgoing = {
      threadId: initialThread.id,
      text: prompt,
      displayText: text,
      skillInputs,
      imageInputs: attachments.map((filePath) => ({ path: filePath, detail: "auto" })),
      cwd: workspace,
      clientUserMessageId,
      providerId: state.provider,
      queuedAt: Date.now(),
      ...sessionSettings,
    };
    const queue = state.messageQueues.get(initialThread.id) || [];
    queue.push(outgoing);
    state.messageQueues.set(initialThread.id, queue);
    await persistMessageQueue(initialThread.id);
    showDiagnostic(`消息已排队（${queue.length}）`, false);
    syncActiveRunState();
    return;
  }
  state.submitting = true;
  syncComposerState();
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
    if (isCurrent(targetThread.id)) appendPendingUserMessage(text, clientUserMessageId, attachments);
    await beginTurn({
      threadId: targetThread.id,
      text: prompt,
      displayText: text,
      skillInputs,
      imageInputs: attachments.map((filePath) => ({ path: filePath, detail: "auto" })),
      cwd: workspace,
      clientUserMessageId,
      ...sessionSettings,
    });
    await loadThreads();
  } catch (error) {
    if (generation === state.openThreadGeneration) {
      showDiagnostic(error.message, true);
    }
  } finally {
    state.submitting = false;
    syncComposerState();
    syncThinkingIndicator();
  }
}

async function beginTurn(payload) {
  const threadId = payload.threadId;
  setThreadRunning(threadId, true);
  try {
    const result = await api.startTurn(payload);
    const run = state.runningThreads.get(threadId);
    if (run) run.turnId = result.turn?.id || run.turnId || null;
    state.interruptedTurns.delete(threadId);
    if (threadId === state.activeThread?.id) {
      elements.chat.querySelectorAll(".turn-interruption").forEach((node) => node.remove());
    }
    if (threadId === state.activeThread?.id) syncActiveRunState();
    flushPendingInterrupt(threadId);
    return result;
  } catch (error) {
    setThreadRunning(threadId, false);
    throw error;
  }
}

async function startNextQueuedMessage(threadId) {
  if (!threadId
    || state.steeringThreads.has(threadId)
    || state.queueDispatchingThreads.has(threadId)
    || state.runningThreads.has(threadId)) return;
  state.queueDispatchingThreads.add(threadId);
  let optimistic = null;
  let next = null;
  let claimed = false;
  try {
    const queue = state.messageQueues.get(threadId) || [];
    next = queue[0] || null;
    if (!next || !state.connected) {
      syncActiveRunState();
      return;
    }
    if (next.providerId && next.providerId !== state.provider) {
      const label = state.providers.find((provider) => provider.id === next.providerId)?.connectionLabel || "原连接";
      showDiagnostic(`这条待发送消息属于${label}，请先切换连接。`, true);
      syncActiveRunState();
      return;
    }
    const result = await api.claimMessageQueue({
      threadId,
      clientUserMessageId: next.clientUserMessageId,
      message: next,
      remainingMessages: queue.slice(1),
    });
    if (result?.busy) {
      showDiagnostic("这个会话正在另一个窗口中回答，待发送消息会在回答完成后继续。", false);
      return;
    }
    next = result?.message || null;
    const remaining = Array.isArray(result?.messages) ? result.messages : [];
    if (remaining.length) state.messageQueues.set(threadId, remaining);
    else state.messageQueues.delete(threadId);
    renderMessageQueuePanel(threadId);
    if (!next) return;
    claimed = true;
    if (threadId === state.activeThread?.id) {
      optimistic = appendPendingUserMessage(
        next.displayText || next.text || "",
        next.clientUserMessageId,
        queuedMessageAttachmentPaths(next),
        null,
        threadId,
      );
    }
    await beginTurn({ ...next, threadId });
  } catch (error) {
    optimistic?.remove();
    if (claimed && next) {
      const restored = await api.restoreMessageQueue({ threadId, message: next }).catch(() => null);
      if (Array.isArray(restored)) state.messageQueues.set(threadId, restored);
    }
    renderMessageQueuePanel(threadId);
    showDiagnostic(`排队消息发送失败：${error.message}`, true);
    api.notify({ title: "Share Master", body: `排队消息发送失败：${error.message}` }).catch(() => {});
  } finally {
    state.queueDispatchingThreads.delete(threadId);
    renderMessageQueuePanel(threadId);
    syncActiveRunState();
  }
}

function setThreadRunning(threadId, running, turnId = null) {
  if (!threadId) return;
  if (running) {
    const current = state.runningThreads.get(threadId) || {
      turnId: null,
      stopRequested: false,
      interruptingTurnId: null,
      startedAt: Date.now(),
    };
    if (turnId) current.turnId = turnId;
    state.runningThreads.set(threadId, current);
  } else {
    state.runningThreads.delete(threadId);
  }
  syncActiveRunState();
}

function syncThinkingIndicator() {
  const threadId = state.activeThread?.id || null;
  const run = threadId ? state.runningThreads.get(threadId) : null;
  const shouldShow = Boolean(
    threadId
    && (run || state.submitting)
    && !state.activeArchived
    && state.renderedThreadId === threadId
    && !elements.chat.classList.contains("hidden"),
  );
  let indicator = elements.chat.querySelector(".thinking-indicator");
  if (!shouldShow) {
    indicator?.remove();
    return;
  }
  if (indicator?.dataset.threadId !== threadId) {
    indicator?.remove();
    indicator = null;
  }
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "thinking-indicator";
    indicator.dataset.threadId = threadId;
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-live", "polite");
    const providerLabel = currentProviderDefinition()?.label
      || (state.providerType === "claude" ? "Claude" : "Share Master");
    indicator.innerHTML = `
      <span class="thinking-avatar">${escapeHtml(providerInitials(providerLabel))}</span>
      <span class="thinking-copy">
        <strong class="thinking-label"></strong>
        <small class="thinking-detail"></small>
      </span>
      <span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
  }
  const queueLength = (state.messageQueues.get(threadId) || []).length;
  const label = run?.stopRequested ? "正在停止…" : run ? "正在思考…" : "正在连接模型…";
  const detail = run?.stopRequested
    ? "正在安全结束当前回复"
    : queueLength
      ? `模型正在处理你的消息 · 后续 ${queueLength} 条待发送`
      : "模型正在处理你的消息";
  indicator.dataset.state = run?.stopRequested ? "stopping" : run ? "thinking" : "connecting";
  indicator.querySelector(".thinking-label").textContent = label;
  indicator.querySelector(".thinking-detail").textContent = detail;
  if (indicator !== elements.chat.lastElementChild) elements.chat.appendChild(indicator);
}

function resetAllRuns(clearQueues = false) {
  state.runningThreads.clear();
  state.steeringQueuedMessages.clear();
  state.steeringThreads.clear();
  state.queueDispatchingThreads.clear();
  if (clearQueues) state.messageQueues.clear();
  state.submitting = false;
  syncActiveRunState();
}

function syncActiveRunState() {
  const threadId = state.activeThread?.id;
  const run = threadId ? state.runningThreads.get(threadId) : null;
  state.running = Boolean(run);
  state.activeTurn = run?.turnId || null;
  state.stopRequested = Boolean(run?.stopRequested);
  state.interruptingTurnId = run?.interruptingTurnId || null;
  for (const button of elements.chat.querySelectorAll(".user-edit-message")) {
    const title = run ? "停止当前回复并编辑这条消息" : "编辑并重新发送";
    button.title = title;
    button.setAttribute("aria-label", title);
  }
  elements.send.classList.remove("hidden");
  elements.stop.classList.toggle("hidden", !run);
  elements.stop.disabled = Boolean(run?.stopRequested);
  elements.stop.title = run?.stopRequested ? "正在停止" : "停止当前回复";
  elements.send.title = run ? "排队发送（Enter）" : "发送";
  elements.send.setAttribute("aria-label", run ? "排队发送" : "发送");
  syncComposerState();
  syncThinkingIndicator();
  renderMessageQueuePanel(threadId);
  if (state.threads.length) renderThreadList();
}

async function flushPendingInterrupt(threadId = state.activeThread?.id) {
  const run = threadId ? state.runningThreads.get(threadId) : null;
  const turnId = run?.turnId;
  if (!run?.stopRequested || !turnId || run.interruptingTurnId === turnId) return;
  run.interruptingTurnId = turnId;
  if (threadId === state.activeThread?.id) syncActiveRunState();
  try {
    await api.interruptTurn({ threadId, turnId });
  } catch (error) {
    const current = state.runningThreads.get(threadId);
    if (current?.turnId === turnId) {
      current.interruptingTurnId = null;
      current.stopRequested = false;
      if (threadId === state.activeThread?.id) syncActiveRunState();
      showActionError(error);
    }
  }
}

function requestTurnInterrupt() {
  const threadId = state.activeThread?.id;
  const run = threadId ? state.runningThreads.get(threadId) : null;
  if (!run) return;
  run.stopRequested = true;
  syncActiveRunState();
  flushPendingInterrupt(threadId);
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
  const hasContent = Boolean(elements.input.value.trim() || state.pendingAttachments.length);
  elements.send.disabled = disabled || state.submitting || !hasContent;
  const hasRecoveredQueue = !state.running && Boolean(state.activeThread?.id && state.messageQueues.get(state.activeThread.id)?.length);
  const controlsDisabled = disabled || state.modelCatalog.length === 0;
  elements.sessionModel.disabled = controlsDisabled;
  elements.sessionEffort.disabled = controlsDisabled;
  elements.modeBadge.disabled = disabled || state.providerEngine === "openai-compatible";
  elements.skillButton.disabled = disabled || state.skillsLoading || (state.skills.length + state.promptTemplates.length === 0);
  elements.attachButton.disabled = disabled || state.submitting;
  elements.input.placeholder = state.activeArchived
    ? "当前会话为只读"
    : state.openingThread ? "正在加载会话"
    : state.running ? "继续输入，Enter 排队；可在队列中点击“引导”"
    : hasRecoveredQueue ? "存在待发送消息，可在上方队列中继续"
    : state.providerType === "claude"
      ? "给 Claude 发送消息"
      : state.providerEngine === "openai-compatible" ? "给当前模型发送消息" : "给 Codex 发送消息";
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

function threadForId(threadId) {
  return [...state.activeThreads, ...state.archivedThreads].find((thread) => thread.id === threadId) || null;
}

function notifyThreadCompletion(threadId, turn) {
  const thread = threadForId(threadId);
  const title = titleOf(thread || { id: threadId });
  const status = turn?.status;
  const body = status === "failed"
    ? `${title} 运行失败`
    : status === "interrupted" ? `${title} 已停止` : `${title} 已完成`;
  api.notify({ title: "Share Master", body }).catch(() => {});
}

function completeThreadRun(threadId, turn) {
  const currentRun = state.runningThreads.get(threadId);
  if (currentRun?.turnId && turn?.id && currentRun.turnId !== turn.id) return;
  const wasBackground = threadId !== state.activeThread?.id || document.hidden;
  setThreadRunning(threadId, false);
  if (turn?.status === "failed") state.interruptedTurns.set(threadId, { ...turn });
  else if (turn?.status === "completed") state.interruptedTurns.delete(threadId);
  const queue = state.messageQueues.get(threadId) || [];
  if (queue.length) {
    setTimeout(() => startNextQueuedMessage(threadId), 0);
  } else if (wasBackground) {
    notifyThreadCompletion(threadId, turn);
  }
  if (threadId === state.activeThread?.id) {
    if (turn?.status === "failed") {
      appendTurnInterruption(turn, threadId);
      showDiagnostic(turn.error?.message || "回答中途断开，已保留当前内容。", true);
    }
    if (turn?.status === "interrupted") showDiagnostic("本轮已停止。", false);
  }
  scheduleThreadRefresh();
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
    const targetLabel = providerUsageLabel(params.toProviderId);
    showDiagnostic(`已自动切换到 ${targetLabel}：${params.fromModel} → ${params.toModel}`, false);
    renderProviderOptions();
    return;
  }
  if (method === "provider/health-updated") {
    state.providerHealth[params.providerId] = { ...params };
    renderProviderOptions();
    if (!elements.healthOverlay.classList.contains("hidden")) renderHealthMonitor();
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
  if (method === "turn/started") {
    setThreadRunning(eventThreadId, true, params.turn?.id || null);
    flushPendingInterrupt(eventThreadId);
    return;
  }
  if (method === "turn/completed") {
    if (eventThreadId === state.activeThread?.id) flushPendingStreamUpdates(null, true);
    completeThreadRun(eventThreadId, params.turn);
    if (!elements.usageOverlay.classList.contains("hidden")) refreshUsage();
    return;
  }
  const globallyRelevant = ["thread/name/updated", "thread/started", "thread/archived", "thread/unarchived", "thread/deleted"].includes(method);
  if (eventThreadId && !globallyRelevant && eventThreadId !== state.activeThread?.id) return;
  if (method === "item/started" || method === "item/completed") {
    if (method === "item/completed" && params.item?.id) flushPendingStreamUpdates(params.item.id);
    renderItem(params.item, params.turnId, method === "item/started");
  } else if (method === "item/agentMessage/delta") {
    const id = params.itemId || "stream-agent";
    appendAgentMessageDelta(id, params.delta);
  } else if (method === "item/commandExecution/outputDelta" || method === "item/fileChange/outputDelta") {
    return;
  } else if (method === "item/reasoning/summaryTextDelta") {
    appendActivityDelta(params.itemId, params.turnId, "思考过程", params.delta, "brain", eventThreadId);
  } else if (method === "item/plan/delta") {
    appendActivityDelta(params.itemId, params.turnId, "计划", params.delta, "list-checks", eventThreadId);
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

function renderNextApproval(threadId = state.activeThread?.id || null) {
  if (state.activeApproval) {
    elements.approval.classList.remove("hidden");
    return;
  }
  const requestIndex = state.approvalQueue.findIndex((request) => {
    const requestThreadId = request.params?.threadId || request.params?.conversationId || null;
    return !requestThreadId || requestThreadId === threadId;
  });
  if (requestIndex < 0) {
    elements.approval.classList.toggle("hidden", !state.activeApproval);
    return;
  }
  const [request] = state.approvalQueue.splice(requestIndex, 1);
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
  if (state.activeApproval) state.approvalQueue.unshift(state.activeApproval);
  state.activeApproval = null;
  elements.approval.classList.add("hidden");
  renderNextApproval(nextThreadId);
}

function newChat(switchToActive = true) {
  ++state.openThreadGeneration;
  state.openingThread = false;
  parkRenderedConversation();
  state.pendingAttachments = [];
  renderAttachments();
  clearRequestsForThreadChange(null);
  if (switchToActive && state.threadView !== "active") {
    state.threadView = "active";
    state.allThreads = state.activeThreads;
    updateThreadViewControls();
    applyThreadFilter();
    renderProjects();
  }
  state.activeThread = null;
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
    elements.emptyTitle.textContent = "新会话";
    elements.windowTitle.textContent = state.activeProject ? `${state.activeProject.label} · 新会话` : "新会话";
    elements.emptySubtitle.textContent = state.activeProject
      ? state.activeProject.label
      : "Share Master";
    elements.input.focus();
  }
  syncComposerState();
  syncActiveRunState();
  renderThreadList();
}

function openThreadMenu(thread, event) {
  event.stopPropagation();
  state.menuThread = thread;
  const removeButton = elements.menu.querySelector("[data-action=remove], [data-action=restore]");
  const archiveButton = elements.menu.querySelector("[data-action=archive], [data-action=unarchive]");
  const renameButton = elements.menu.querySelector("[data-action=rename]");
  const deleteButton = elements.menu.querySelector("[data-action=delete-now]");
  const clearQueueButton = elements.menu.querySelector("[data-action=clear-queue]");
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
  clearQueueButton.classList.toggle("hidden", !(state.messageQueues.get(thread.id) || []).length);
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
      const confirmed = confirm("从 Share Master 中移除这个会话？\n\n可在一小时内恢复；到期后会从 Share Master 列表清除。原始 ChatGPT/Codex/Claude 会话记录完全不变。");
      if (!confirmed) return;
      const result = await api.hideThread({
        threadId: thread.id,
        engine: state.providerEngine === "claude" ? "claude" : state.providerEngine === "openai-compatible" ? "openai-compatible" : "codex",
        providerId: state.provider,
      });
      state.hiddenThreadIds = new Set(result.hiddenThreadIds || []);
      state.pendingDeletions = result.pendingDeletions || [];
      if (state.activeThread?.id === thread.id) newChat();
      updateThreadViewControls();
      applyThreadFilter();
      renderProjects();
      showDiagnostic("会话已移除，可在一小时内恢复。", false);
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
    } else if (action === "clear-queue") {
      const count = (state.messageQueues.get(thread.id) || []).length;
      if (!count || !confirm(`清空这个会话的 ${count} 条待发送消息？`)) return;
      state.messageQueues.delete(thread.id);
      await persistMessageQueue(thread.id);
      syncActiveRunState();
      renderThreadList();
      showDiagnostic("待发送队列已清空。", false);
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

function resizeComposer(syncState = true) {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 180)}px`;
  if (syncState) syncComposerState();
}

function scheduleComposerInputUpdate() {
  lastComposerInputAt = performance.now();
  syncComposerState();
  if (composerInputFrame) return;
  composerInputFrame = requestAnimationFrame(() => {
    composerInputFrame = null;
    resizeComposer(false);
    updateSkillAutocomplete();
  });
}

function scrollToBottom() {
  if (performance.now() - lastComposerInputAt < COMPOSER_ACTIVITY_WINDOW_MS) return;
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    elements.chat.scrollTop = elements.chat.scrollHeight;
  });
}
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

function localHistoryEmpty(icon, title, detail) {
  elements.localHistoryPreview.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "local-history-empty";
  empty.innerHTML = `<span data-lucide="${icon}"></span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
  elements.localHistoryPreview.appendChild(empty);
  refreshIcons();
}

function renderLocalHistorySources() {
  elements.localHistorySources.innerHTML = "";
  for (const source of state.localHistorySources) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.localHistorySourceId === source.id ? "active" : "";
    button.disabled = !source.available;
    button.innerHTML = `<span data-lucide="${source.id === "claude" ? "bot" : "terminal-square"}"></span><span><strong>${escapeHtml(source.label)}</strong><small>${escapeHtml(source.available ? source.description : "本机未发现记录")}</small></span>`;
    button.addEventListener("click", () => {
      if (state.localHistorySourceId === source.id) return;
      state.localHistorySourceId = source.id;
      state.localHistorySelectedId = null;
      renderLocalHistorySources();
      loadLocalHistory();
    });
    elements.localHistorySources.appendChild(button);
  }
  refreshIcons();
}

function renderLocalHistoryList(result) {
  state.localHistoryConversations = result.conversations || [];
  elements.localHistoryList.innerHTML = "";
  elements.localHistorySummary.textContent = `${result.total || 0} 条会话${result.total > state.localHistoryConversations.length ? ` · 显示前 ${state.localHistoryConversations.length} 条` : ""}`;
  if (!state.localHistoryConversations.length) {
    const empty = document.createElement("div");
    empty.className = "local-history-list-empty";
    empty.textContent = elements.localHistorySearch.value.trim() ? "没有匹配的本地会话" : "该来源暂无本地会话";
    elements.localHistoryList.appendChild(empty);
    localHistoryEmpty("search-x", "没有可预览的会话", "可以切换来源、修改搜索词或刷新。");
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const conversation of state.localHistoryConversations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `local-history-item ${conversation.id === state.localHistorySelectedId ? "active" : ""}`;
    button.dataset.conversationId = conversation.id;
    const heading = document.createElement("strong");
    heading.textContent = conversation.title || "未命名会话";
    heading.title = heading.textContent;
    const details = document.createElement("small");
    const time = timeAgo((conversation.updatedAt || 0) / 1000);
    details.textContent = [conversation.model, conversation.archived ? "已归档" : "", time].filter(Boolean).join(" · ") || "本地会话";
    const directory = document.createElement("code");
    directory.textContent = conversation.cwd || "未记录工作目录";
    directory.title = directory.textContent;
    const count = document.createElement("span");
    count.className = "local-history-message-count";
    count.textContent = conversation.messageCountApproximate
      ? `至少 ${conversation.messageCount || 0} 条消息`
      : `${conversation.messageCount || 0} 条消息`;
    button.append(heading, details, directory, count);
    button.addEventListener("click", () => openLocalHistoryConversation(conversation));
    fragment.appendChild(button);
  }
  elements.localHistoryList.appendChild(fragment);
}

async function loadLocalHistory() {
  if (!state.localHistorySourceId || elements.localHistoryOverlay.classList.contains("hidden")) return;
  const generation = ++state.localHistoryGeneration;
  state.localHistoryLoading = true;
  elements.localHistorySummary.textContent = "正在读取…";
  elements.localHistoryList.innerHTML = '<div class="local-history-list-empty local-history-loading"><span data-lucide="loader-circle"></span>正在建立只读索引</div>';
  refreshIcons();
  try {
    const result = await api.listLocalHistory({
      sourceId: state.localHistorySourceId,
      search: elements.localHistorySearch.value.trim(),
      limit: 500,
    });
    if (generation !== state.localHistoryGeneration) return;
    renderLocalHistoryList(result);
    const selected = state.localHistoryConversations.find((item) => item.id === state.localHistorySelectedId);
    if (selected) {
      state.localHistoryLoading = false;
      openLocalHistoryConversation(selected);
    }
  } catch (error) {
    if (generation !== state.localHistoryGeneration) return;
    elements.localHistorySummary.textContent = "读取失败";
    elements.localHistoryList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "local-history-list-empty local-history-error";
    empty.textContent = error.message || "无法读取本地会话";
    elements.localHistoryList.appendChild(empty);
    localHistoryEmpty("circle-alert", "无法读取本地记录", error.message || "请稍后重试。");
  } finally {
    if (generation === state.localHistoryGeneration) state.localHistoryLoading = false;
  }
}

function renderLocalHistoryPreview(conversation) {
  elements.localHistoryPreview.innerHTML = "";
  const header = document.createElement("header");
  header.className = "local-history-preview-heading";
  const title = document.createElement("h3");
  title.textContent = conversation.title || "未命名会话";
  const badges = document.createElement("div");
  badges.className = "local-history-badges";
  for (const label of [conversation.sourceLabel, conversation.model, conversation.archived ? "已归档" : ""].filter(Boolean)) {
    const badge = document.createElement("span");
    badge.textContent = label;
    badges.appendChild(badge);
  }
  const meta = document.createElement("p");
  const date = conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleString("zh-CN") : "时间未知";
  meta.textContent = `${conversation.cwd || "未记录工作目录"} · ${date} · ${conversation.messageCount || 0} 条消息`;
  meta.title = meta.textContent;
  header.append(title, badges, meta);
  elements.localHistoryPreview.appendChild(header);

  const messages = document.createElement("div");
  messages.className = "local-history-messages";
  for (const message of conversation.messages || []) {
    const article = document.createElement("section");
    article.className = `local-history-message ${message.role || "assistant"}`;
    const label = document.createElement("div");
    label.className = "local-history-message-heading";
    const role = message.role === "user" ? "你" : message.role === "reasoning" ? "推理摘要" : conversation.sourceLabel || "助手";
    label.textContent = role;
    if (message.timestamp) {
      const time = document.createElement("time");
      time.textContent = new Date(message.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      label.appendChild(time);
    }
    const body = document.createElement("div");
    body.className = "local-history-message-body";
    body.textContent = message.text || "";
    article.append(label, body);
    messages.appendChild(article);
  }
  if (conversation.truncated) {
    const notice = document.createElement("div");
    notice.className = "local-history-truncated";
    notice.textContent = "此会话较长，当前显示开头和最近的消息。原始文件没有被修改。";
    messages.prepend(notice);
  }
  if (!messages.children.length) {
    const empty = document.createElement("div");
    empty.className = "local-history-list-empty";
    empty.textContent = "该文件中没有可显示的用户或助手消息。";
    messages.appendChild(empty);
  }
  elements.localHistoryPreview.appendChild(messages);
}

async function openLocalHistoryConversation(conversation) {
  state.localHistorySelectedId = conversation.id;
  elements.localHistoryList.querySelectorAll(".local-history-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.conversationId === conversation.id);
  });
  const generation = ++state.localHistoryGeneration;
  localHistoryEmpty("loader-circle", "正在打开会话", "正在从原始记录中生成只读预览。");
  try {
    const result = await api.readLocalHistory({ conversationId: conversation.id });
    if (generation !== state.localHistoryGeneration) return;
    renderLocalHistoryPreview(result);
  } catch (error) {
    if (generation !== state.localHistoryGeneration) return;
    localHistoryEmpty("circle-alert", "无法打开会话", error.message || "本地文件可能已被移动。");
  }
}

async function openLocalHistoryDialog() {
  const generation = ++state.localHistoryGeneration;
  elements.localHistoryOverlay.classList.remove("hidden");
  elements.localHistorySearch.focus();
  localHistoryEmpty("loader-circle", "正在查找本地记录", "只会读取受支持客户端的会话目录。");
  try {
    const sources = await api.localHistorySources();
    if (generation !== state.localHistoryGeneration) return;
    state.localHistorySources = sources;
    const current = state.localHistorySources.find((source) => source.id === state.localHistorySourceId && source.available);
    state.localHistorySourceId = current?.id || state.localHistorySources.find((source) => source.available)?.id || null;
    renderLocalHistorySources();
    if (state.localHistorySourceId) await loadLocalHistory();
    else localHistoryEmpty("hard-drive", "没有发现本地记录", "当前支持 Codex 和 Claude Code 的本地 JSONL 会话。");
  } catch (error) {
    localHistoryEmpty("circle-alert", "无法读取本地记录", error.message || "请稍后重试。");
  }
}

function closeLocalHistoryDialog() {
  clearTimeout(elements.localHistorySearch._timer);
  state.localHistoryGeneration += 1;
  state.localHistoryLoading = false;
  elements.localHistoryOverlay.classList.add("hidden");
}

const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

function providerUsageLabel(providerId) {
  const provider = state.providers.find((item) => item.id === providerId);
  return provider?.connectionLabel || provider?.label || providerId || "未知连接";
}

function renderUsage(usage) {
  state.usage = usage;
  const stats = [
    [usage.requestCount || 0, "请求"],
    [compactNumber.format(usage.totalTokens || 0), "Token"],
    [`$${Number(usage.costUsd || 0).toFixed(6)}`, "估算成本"],
    [`${Math.round(usage.averageDurationMs || 0)} ms`, "平均耗时"],
    [usage.failedCount || 0, `失败 · 中断 ${usage.interruptedCount || 0}`],
  ];
  elements.usageStats.innerHTML = stats.map(([value, label]) => (
    `<div class="usage-stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(String(label))}</span></div>`
  )).join("");
  const daily = Array.isArray(usage.daily) ? usage.daily.slice(-14) : [];
  const maximum = Math.max(1, ...daily.map((entry) => Number(entry.totalTokens) || 0));
  elements.usageTrend.innerHTML = daily.length
    ? daily.map((entry, index) => {
      const tokens = Number(entry.totalTokens) || 0;
      const height = tokens ? Math.max(6, Math.round(tokens / maximum * 100)) : 2;
      const label = new Date(`${entry.day}T12:00:00`).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
      const showLabel = index === 0 || index === daily.length - 1 || index === Math.floor(daily.length / 2);
      return `<span class="usage-trend-column" title="${escapeHtml(label)} · ${escapeHtml(compactNumber.format(tokens))} Token · $${Number(entry.costUsd || 0).toFixed(5)}"><i style="height:${height}%"></i><small>${showLabel ? escapeHtml(label) : ""}</small></span>`;
    }).join("")
    : '<div class="usage-empty">暂无趋势数据</div>';
  $("#usage-log-count").textContent = `${usage.logs?.length || 0} / ${usage.requestCount || 0}`;
  elements.usageLogList.replaceChildren();
  if (!usage.logs?.length) {
    elements.usageLogList.innerHTML = '<div class="usage-empty">暂无请求记录</div>';
    return;
  }
  for (const log of usage.logs) {
    const row = document.createElement("div");
    row.className = "usage-log-row";
    const statusLabel = log.status === "failed" ? "失败" : log.status === "interrupted" ? "已停止" : "完成";
    const diagnostic = [log.errorMessage, log.requestId ? `请求 ID：${log.requestId}` : null, log.finishReason ? `结束原因：${log.finishReason}` : null]
      .filter(Boolean).join("\n");
    if (diagnostic) row.title = diagnostic;
    row.innerHTML = [
      `<span class="usage-log-provider"><strong>${escapeHtml(providerUsageLabel(log.providerId))}</strong><br>${escapeHtml(new Date(log.finishedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</span>`,
      `<span title="${escapeHtml(log.model)}">${escapeHtml(log.model)}</span>`,
      `<span class="usage-status ${escapeHtml(log.status)}">${statusLabel}</span>`,
      `<span>${Math.round(log.durationMs || 0)} ms</span>`,
      `<span class="usage-log-cost">${compactNumber.format(log.totalTokens || 0)} · $${Number(log.costUsd || 0).toFixed(5)}</span>`,
    ].join("");
    elements.usageLogList.appendChild(row);
  }
}

function populateUsageProviders() {
  const usageValue = elements.usageProviderFilter.value;
  const pricingValue = elements.pricingProvider.value;
  elements.usageProviderFilter.replaceChildren(new Option("全部连接", ""));
  elements.pricingProvider.replaceChildren();
  for (const provider of state.providers) {
    const label = provider.connectionLabel || provider.label;
    elements.usageProviderFilter.appendChild(new Option(label, provider.id));
    elements.pricingProvider.appendChild(new Option(label, provider.id));
  }
  elements.usageProviderFilter.value = [...elements.usageProviderFilter.options].some((option) => option.value === usageValue)
    ? usageValue
    : "";
  elements.pricingProvider.value = [...elements.pricingProvider.options].some((option) => option.value === pricingValue)
    ? pricingValue
    : state.provider || elements.pricingProvider.options[0]?.value || "";
}

function loadPricingFields(resetModel = false) {
  const providerId = elements.pricingProvider.value;
  const provider = state.providers.find((item) => item.id === providerId);
  if (resetModel || !elements.pricingModel.value) elements.pricingModel.value = provider?.model || "";
  const pricing = state.modelPricing[`${providerId}:${elements.pricingModel.value.trim()}`] || {};
  $("#pricing-input").value = pricing.inputPerMillion ?? 0;
  $("#pricing-cache").value = pricing.cachedInputPerMillion ?? pricing.inputPerMillion ?? 0;
  $("#pricing-output").value = pricing.outputPerMillion ?? 0;
}

async function refreshUsage() {
  $("#usage-refresh-button").disabled = true;
  try {
    renderUsage(await api.providerUsage({ providerId: elements.usageProviderFilter.value || null }));
  } catch (error) {
    showActionError(error);
  } finally {
    $("#usage-refresh-button").disabled = false;
  }
}

async function openUsageDialog() {
  elements.overlay.classList.add("hidden");
  elements.usageOverlay.classList.remove("hidden");
  populateUsageProviders();
  try {
    state.modelPricing = await api.modelPricing();
  } catch (error) {
    $("#pricing-status").textContent = error.message;
  }
  loadPricingFields(true);
  refreshIcons();
  await refreshUsage();
}

function closeUsageDialog() {
  elements.usageOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

function monitoredProviders() {
  return state.providers.filter((provider) => provider.type === "relay" || provider.id === "claude");
}

function healthStatus(provider) {
  const health = state.providerHealth[provider.id] || null;
  if (health?.status === "checking") return { key: "checking", label: "检测中" };
  if (health?.openUntil > Date.now()) {
    return { key: "open", label: `冷却中 · ${Math.max(1, Math.ceil((health.openUntil - Date.now()) / 1000))} 秒` };
  }
  if (health?.status === "healthy") return { key: "healthy", label: `${Math.max(0, Number(health.latencyMs) || 0)} ms` };
  if (["degraded", "configuration-error", "error"].includes(health?.status)) {
    return { key: health.status, label: health.status === "degraded" ? `不稳定 · ${health.failures || 1} 次失败` : "不可用" };
  }
  return { key: "idle", label: "尚未检测" };
}

function renderHealthMonitor() {
  const providers = monitoredProviders();
  elements.healthList.replaceChildren();
  if (!providers.length) {
    elements.healthList.innerHTML = '<div class="usage-empty">尚未添加可检测的模型连接</div>';
  }
  let healthy = 0;
  let unavailable = 0;
  for (const provider of providers) {
    const status = healthStatus(provider);
    if (status.key === "healthy") healthy += 1;
    if (["open", "configuration-error", "error"].includes(status.key)) unavailable += 1;
    const route = state.providerRoutes[provider.id] || null;
    const fallbackLabels = (route?.fallbackProviderIds || []).map(providerUsageLabel).join(" → ");
    const row = document.createElement("div");
    row.className = `health-row health-${status.key}`;
    if (state.providerHealth[provider.id]?.lastError) row.title = state.providerHealth[provider.id].lastError;
    const visual = providerVisual(provider);
    const copy = document.createElement("div");
    copy.className = "health-copy";
    const protocol = provider.id === "claude"
      ? "Anthropic Messages"
      : provider.protocol === "chat_completions" ? "Chat Completions" : "Responses";
    copy.innerHTML = `<strong>${escapeHtml(provider.connectionLabel || provider.label)}</strong><span>${escapeHtml(protocol)} · ${escapeHtml(provider.model || "默认模型")}${fallbackLabels ? ` · 备用 ${escapeHtml(fallbackLabels)}` : ""}</span>`;
    const stateNode = document.createElement("span");
    stateNode.className = "health-state";
    stateNode.innerHTML = `<i></i><span>${escapeHtml(status.label)}</span>`;
    const test = document.createElement("button");
    test.type = "button";
    test.className = "health-test icon-button";
    test.title = `检测 ${provider.connectionLabel || provider.label}`;
    test.setAttribute("aria-label", test.title);
    test.disabled = status.key === "checking";
    test.innerHTML = '<span data-lucide="refresh-cw"></span>';
    test.addEventListener("click", () => testProviderHealth(provider));
    const icon = document.createElement("span");
    icon.className = `provider-icon ${visual.className}`;
    icon.innerHTML = visual.markup;
    row.append(icon, copy, stateNode, test);
    elements.healthList.appendChild(row);
  }
  $("#health-summary").textContent = `${providers.length} 个连接 · ${healthy} 正常${unavailable ? ` · ${unavailable} 不可用` : ""}`;
  refreshIcons();
}

async function testProviderHealth(provider) {
  state.providerHealth[provider.id] = { status: "checking", checkedAt: Date.now() };
  renderHealthMonitor();
  renderProviderOptions();
  const startedAt = Date.now();
  try {
    if (provider.id === "claude") {
      const catalog = await api.claudeModels({ baseUrl: provider.baseUrl, apiKey: "" });
      if (catalog.warning) throw new Error(catalog.warning);
    } else {
      await api.probeProviderModels({ providerId: provider.id });
    }
    state.providerHealth[provider.id] = {
      status: "healthy",
      failures: 0,
      openUntil: 0,
      latencyMs: Math.max(0, Date.now() - startedAt),
      checkedAt: Date.now(),
      lastError: null,
    };
  } catch (error) {
    state.providerHealth[provider.id] = {
      status: "error",
      failures: Number(state.providerHealth[provider.id]?.failures) || 0,
      openUntil: 0,
      latencyMs: Math.max(0, Date.now() - startedAt),
      checkedAt: Date.now(),
      lastError: String(error?.message || error),
    };
  }
  renderHealthMonitor();
  renderProviderOptions();
}

function openHealthDialog() {
  elements.overlay.classList.add("hidden");
  elements.healthOverlay.classList.remove("hidden");
  $("#health-status").textContent = "";
  renderHealthMonitor();
}

function closeHealthDialog() {
  elements.healthOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

async function loadBackups() {
  elements.backupList.innerHTML = '<div class="usage-empty">正在读取备份</div>';
  try {
    const backups = await api.listBackups();
    elements.backupList.replaceChildren();
    if (!backups.length) {
      elements.backupList.innerHTML = '<div class="usage-empty">暂无备份</div>';
      return;
    }
    for (const backup of backups) {
      const row = document.createElement("div");
      row.className = "backup-row";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = new Date(backup.createdAt).toLocaleString("zh-CN");
      const detail = document.createElement("small");
      detail.textContent = `${backup.name} · ${Math.max(1, Math.round(backup.size / 1024))} KB`;
      copy.append(title, detail);
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "backup-restore";
      restore.textContent = "恢复";
      restore.addEventListener("click", async () => {
        if (!confirm(`恢复 ${title.textContent} 的配置备份？\n\n当前配置会先自动备份；所有连接将断开，需要重新连接。`)) return;
        restore.disabled = true;
        elements.backupStatus.textContent = "正在恢复...";
        try {
          await api.restoreBackup(backup.name);
          setConnected(false);
          resetAllRuns();
          elements.backupStatus.textContent = "备份已恢复，请重新选择连接。";
          await loadBackups();
        } catch (error) {
          elements.backupStatus.textContent = error.message;
          restore.disabled = false;
        }
      });
      row.append(copy, restore);
      elements.backupList.appendChild(row);
    }
  } catch (error) {
    elements.backupList.innerHTML = `<div class="usage-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function openBackupDialog() {
  elements.overlay.classList.add("hidden");
  elements.backupOverlay.classList.remove("hidden");
  elements.backupStatus.textContent = "";
  refreshIcons();
  await loadBackups();
}

function closeBackupDialog() {
  elements.backupOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

function renderSyncStatus(snapshot) {
  state.syncBackend = snapshot.backend === "webdav" ? "webdav" : "directory";
  document.querySelectorAll("[data-sync-backend]").forEach((button) => button.classList.toggle("active", button.dataset.syncBackend === state.syncBackend));
  $("#sync-directory-fields").classList.toggle("hidden", state.syncBackend !== "directory");
  elements.syncWebdavForm.classList.toggle("hidden", state.syncBackend !== "webdav");
  elements.syncDirectoryInput.value = snapshot.directory || "";
  elements.syncWebdavForm.elements.url.value = snapshot.webdavUrl || "";
  elements.syncWebdavForm.elements.username.value = "";
  elements.syncWebdavForm.elements.password.value = "";
  elements.syncWebdavForm.elements.username.placeholder = snapshot.hasWebdavCredentials ? "凭据已加密保存" : "WebDAV 用户名";
  elements.syncWebdavForm.elements.password.placeholder = snapshot.hasWebdavCredentials ? "凭据已加密保存" : "WebDAV 密码";
  $("#sync-pull-label").textContent = state.syncBackend === "webdav" ? "使用 WebDAV" : "使用同步目录";
  elements.syncAutoInput.checked = Boolean(snapshot.autoSync);
  const configured = state.syncBackend === "webdav" ? snapshot.webdavUrl : snapshot.directory;
  $("#sync-summary").innerHTML = configured
    ? `<strong>${snapshot.remoteExists ? "同步文件可用" : "等待首次同步"}</strong><span>${snapshot.lastSyncedAt ? `上次同步 ${escapeHtml(timeAgo(Math.floor(snapshot.lastSyncedAt / 1000)))}` : "尚未同步"}</span>`
    : `<strong>未配置${state.syncBackend === "webdav" ? " WebDAV" : "同步目录"}</strong><span>${state.syncBackend === "webdav" ? "凭据仅加密保存在本机" : "可选择网盘或局域网同步文件夹"}</span>`;
  elements.syncHistory.replaceChildren();
  if (!snapshot.history?.length) {
    elements.syncHistory.innerHTML = '<div class="usage-empty">暂无同步记录</div>';
    return;
  }
  for (const entry of snapshot.history) {
    const row = document.createElement("div");
    row.className = `sync-history-row sync-${entry.status}`;
    const icon = entry.status === "conflict" ? "triangle-alert" : entry.direction === "pull" ? "download" : entry.direction === "push" ? "upload" : "check";
    row.innerHTML = `<span class="sync-history-icon"><span data-lucide="${icon}"></span></span><span><strong>${escapeHtml(entry.message || "同步完成")}</strong><small>${escapeHtml(new Date(entry.at).toLocaleString("zh-CN"))}</small></span>`;
    elements.syncHistory.appendChild(row);
  }
  refreshIcons();
}

async function loadSyncStatus() {
  const snapshot = await api.syncStatus();
  renderSyncStatus(snapshot);
  return snapshot;
}

async function openSyncDialog() {
  elements.overlay.classList.add("hidden");
  elements.syncOverlay.classList.remove("hidden");
  elements.syncStatus.textContent = "";
  refreshIcons();
  try {
    await loadSyncStatus();
  } catch (error) {
    elements.syncStatus.textContent = error.message;
  }
}

function closeSyncDialog() {
  elements.syncOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

async function openAppSettingsDialog() {
  elements.overlay.classList.add("hidden");
  elements.appSettingsOverlay.classList.remove("hidden");
  $("#app-settings-status").textContent = "";
  refreshIcons();
  try {
    const settings = await api.appSettings();
    elements.appSettingsForm.elements.launchAtLogin.checked = Boolean(settings.launchAtLogin);
    elements.appSettingsForm.elements.closeToTray.checked = settings.closeToTray !== false;
    $("#app-version").textContent = settings.version ? `v${settings.version}` : "v--";
    $("#update-status").textContent = "检查 GitHub Release，不会自动覆盖本地数据";
    $("#update-status").dataset.state = "idle";
    $("#download-update-button").classList.add("hidden");
    $("#download-update-button").dataset.url = "";
  } catch (error) {
    $("#app-settings-status").textContent = error.message;
  }
}

function closeAppSettingsDialog() {
  elements.appSettingsOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

const deepLinkImportLabels = {
  provider: { title: "导入模型供应商", description: "确认后继续填写 API Key，链接本身不会保存密钥。", icon: "network" },
  mcp: { title: "导入 MCP 服务", description: "仅导入连接结构；环境变量密钥需要随后在本机填写。", icon: "server-cog" },
  prompt: { title: "导入 Prompt 模板", description: "模板会保存到 Share Master 私有扩展中心。", icon: "text-cursor-input" },
  skill: { title: "从 GitHub 安装 Skill", description: "确认后下载公开仓库，并执行路径与文件安全检查。", icon: "package-plus" },
};

function importPreviewRows(importType, config) {
  if (importType === "provider") return [["名称", config.label], ["Base URL", config.baseUrl], ["默认模型", config.model], ["协议", config.protocol]];
  if (importType === "prompt") return [["命令", `/${config.name}`], ["说明", config.description || "无"], ["模板内容", config.content]];
  if (importType === "skill") return [["GitHub 仓库", config.source], ["安装位置", "Share Master 私有 Skill 库"]];
  return [
    ["名称", config.name], ["传输方式", config.transport],
    [config.transport === "stdio" ? "启动命令" : "服务 URL", config.transport === "stdio" ? config.command : config.url],
    ["参数", config.args?.length ? config.args.join(" ") : "无"],
    ["待填写环境变量", config.envKeys?.length ? config.envKeys.join(", ") : "无"],
  ];
}

function openDeepLinkImportPreview(payload = {}) {
  const meta = deepLinkImportLabels[payload.importType];
  if (!meta || !payload.config) return;
  state.pendingDeepLinkImport = { importType: payload.importType, config: payload.config };
  $("#import-preview-title").textContent = meta.title;
  $("#import-preview-description").textContent = meta.description;
  $("#import-preview-status").textContent = "";
  const logo = elements.importPreviewOverlay.querySelector(".import-preview-logo");
  logo.innerHTML = `<span data-lucide="${meta.icon}"></span>`;
  elements.importPreviewDetails.replaceChildren(...importPreviewRows(payload.importType, payload.config).map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "import-preview-row";
    const term = document.createElement("span");
    term.textContent = label;
    const detail = document.createElement(label === "模板内容" ? "pre" : "strong");
    detail.textContent = String(value || "");
    row.append(term, detail);
    return row;
  }));
  elements.importPreviewOverlay.classList.remove("hidden");
  refreshIcons();
}

function closeDeepLinkImportPreview() {
  elements.importPreviewOverlay.classList.add("hidden");
  state.pendingDeepLinkImport = null;
}

async function confirmDeepLinkImport() {
  const request = state.pendingDeepLinkImport;
  if (!request) return;
  const button = $("#import-preview-confirm-button");
  button.disabled = true;
  $("#import-preview-status").textContent = request.importType === "skill" ? "正在下载并检查..." : "正在导入...";
  try {
    const result = await api.confirmDeepLinkImport(request);
    closeDeepLinkImportPreview();
    if (request.importType === "provider") {
      openRelayDialog(null, result.config);
      $("#connection-error").textContent = "请填写 API Key 后完成导入。";
      return;
    }
    if (request.importType === "mcp") {
      await loadExtensions();
      openExtensionsDialog("mcp");
      showDiagnostic(result.requiresSecrets ? "MCP 已导入，请在环境变量区域填写密钥。" : "MCP 已导入。", false);
      return;
    }
    if (request.importType === "prompt") {
      await loadExtensions();
      openExtensionsDialog("prompts");
      showDiagnostic("Prompt 模板已导入。", false);
      return;
    }
    await loadExtensions();
    openExtensionsDialog("skills");
    showDiagnostic("Skill 已完成安全检查并安装。", false);
  } catch (error) {
    $("#import-preview-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function runConfigurationSync(mode) {
  const controls = [$("#sync-now-button"), $("#sync-push-button"), $("#sync-pull-button")];
  controls.forEach((button) => { button.disabled = true; });
  elements.syncStatus.textContent = "正在同步...";
  try {
    const snapshot = await api.syncNow(mode);
    renderSyncStatus(snapshot);
    elements.syncStatus.textContent = snapshot.result?.message || "同步完成。";
  } catch (error) {
    elements.syncStatus.textContent = error.message;
  } finally {
    controls.forEach((button) => { button.disabled = false; });
  }
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

function populateTaskModels(selectedModel = "") {
  const list = $("#task-model-options");
  list.replaceChildren();
  const providerId = elements.taskProviderSelect.value;
  const provider = state.providers.find((item) => item.id === providerId) || null;
  const models = providerId && providerId !== state.provider
    ? [provider?.model, ...(provider?.discoveredModels || [])]
    : state.modelCatalog.map((item) => item.model || item.id);
  for (const model of [...new Set(models.filter(Boolean))]) list.appendChild(new Option(model, model));
  elements.taskModelInput.value = selectedModel || "";
}

function renderTaskHistory(task) {
  const history = Array.isArray(task?.runHistory) ? task.runHistory : [];
  $("#task-history").classList.toggle("hidden", !task);
  $("#task-history-summary").textContent = history.length ? `最近 ${history.length} 次` : "暂无记录";
  const list = $("#task-history-list");
  list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "task-history-empty";
    empty.textContent = "此任务还没有运行记录";
    list.appendChild(empty);
    return;
  }
  for (const run of history.slice(0, 6)) {
    const row = document.createElement("div");
    row.className = `task-history-row ${run.status || "failed"}`;
    const icon = run.status === "completed" ? "circle-check" : run.status === "running" ? "loader-circle" : "circle-x";
    const label = run.status === "completed"
      ? `${run.manual ? "手动运行" : "计划运行"}完成`
      : run.status === "running" ? `${run.manual ? "手动运行" : "计划运行"}中`
      : run.error || "运行失败";
    row.innerHTML = `<span data-lucide="${icon}"></span><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><time>${new Date(run.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>`;
    list.appendChild(row);
  }
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
  populateTaskModels(task?.model || "");
  elements.taskApprovalSelect.value = task?.approvalMode || "auto";
  elements.taskNotifyInput.checked = task?.notifyOnCompletion !== false;
  elements.taskRetryInput.checked = task?.retryOnFailure !== false;
  $("#task-timezone-label").textContent = `时区：${task?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"}`;
  $("#task-title").textContent = task ? "编辑已安排任务" : "安排任务";
  $("#task-submit-label").textContent = task ? "保存" : "安排";
  $("#task-run-now-button").classList.toggle("hidden", !task);
  $("#task-run-now-button").disabled = Boolean(task && state.runningTaskIds.has(task.id));
  renderTaskHistory(task);
  elements.taskError.textContent = "";
  elements.taskOverlay.classList.remove("hidden");
  elements.taskNameInput.focus();
  refreshIcons();
}

async function runScheduledTaskNow(task, button) {
  button.disabled = true;
  elements.taskError.textContent = "正在启动任务...";
  try {
    const result = await api.runScheduledTaskNow(task.id);
    const index = state.scheduledTasks.findIndex((item) => item.id === task.id);
    if (index >= 0 && result.task) state.scheduledTasks[index] = result.task;
    state.runningTaskIds.add(task.id);
    renderScheduledTasks();
    if (!elements.taskOverlay.classList.contains("hidden")) {
      renderTaskHistory(result.task || task);
      $("#task-run-now-button").disabled = true;
      elements.taskError.textContent = "任务已启动，将在后台继续运行。";
    } else {
      showDiagnostic(`“${task.title}”已在后台启动。`, false);
    }
  } catch (error) {
    button.disabled = false;
    elements.taskError.textContent = error.message;
    showActionError(error);
  }
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
function renderProviderPresetCatalog(catalog = []) {
  state.providerPresets = Object.fromEntries(catalog.map((preset) => [preset.id, preset]));
  const select = $("#provider-preset");
  const groups = new Map();
  for (const preset of catalog) {
    const group = preset.group || "其他";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(preset);
  }
  select.replaceChildren(...[...groups].map(([label, presets]) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = label;
    optgroup.replaceChildren(...presets.map((preset) => new Option(preset.label, preset.id)));
    return optgroup;
  }));
  select.value = state.providerPresets.deepseek ? "deepseek" : catalog[0]?.id || "";
}

function applyProviderPreset(overwrite = true) {
  const form = $("#relay-form");
  const preset = state.providerPresets[$("#provider-preset").value] || state.providerPresets.custom;
  if (!preset) return;
  if (overwrite) {
    form.elements.label.value = preset.label;
    form.elements.baseUrl.value = preset.baseUrl;
    form.elements.model.value = preset.model;
  }
  form.elements.protocol.value = preset.protocol;
  $("#provider-protocol-note").textContent = preset.note;
  syncProviderRouteControls();
  if (overwrite) {
    state.probedProviderModels = [];
    renderProviderModelOptions();
    $("#provider-model-status").textContent = "";
  }
}

function renderProviderModelOptions() {
  const list = $("#provider-model-options");
  list.replaceChildren(...state.probedProviderModels.map((model) => {
    const option = document.createElement("option");
    option.value = model;
    return option;
  }));
}

function syncProviderRouteControls(route = null) {
  const form = $("#relay-form");
  const currentId = state.editingRelay?.id || form.elements.id.value || null;
  const enabledForProtocol = form.elements.protocol.value === "chat_completions";
  const fallback = $("#provider-fallback");
  if (route) state.routeFallbackDraft = [...new Set(route.fallbackProviderIds || [])];
  const candidates = state.providers.filter((provider) => (
    provider.type === "relay"
    && provider.id !== currentId
    && provider.protocol === "chat_completions"
  ));
  const candidateIds = new Set(candidates.map((provider) => provider.id));
  state.routeFallbackDraft = state.routeFallbackDraft.filter((id) => candidateIds.has(id));
  const available = candidates.filter((provider) => !state.routeFallbackDraft.includes(provider.id));
  fallback.replaceChildren(new Option("选择连接加入队列", ""), ...available.map((provider) => (
    new Option(provider.connectionLabel || provider.label, provider.id)
  )));
  fallback.value = "";
  renderProviderFallbackChain(candidates);
  const routeAvailable = enabledForProtocol && (candidates.length > 0 || state.routeFallbackDraft.length > 0);
  const controls = [
    $("#provider-failover-enabled"),
    $("#provider-failure-threshold"),
    $("#provider-cooldown-seconds"),
  ];
  for (const control of controls) control.disabled = !routeAvailable;
  fallback.disabled = !enabledForProtocol || available.length === 0;
  $("#provider-route-settings").classList.toggle("route-disabled", !routeAvailable);
  if (!routeAvailable || state.routeFallbackDraft.length === 0) $("#provider-failover-enabled").checked = false;
}

function moveFallbackProvider(providerId, offset) {
  const index = state.routeFallbackDraft.indexOf(providerId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= state.routeFallbackDraft.length) return;
  [state.routeFallbackDraft[index], state.routeFallbackDraft[target]] = [state.routeFallbackDraft[target], state.routeFallbackDraft[index]];
  syncProviderRouteControls();
}

function renderProviderFallbackChain(candidates = []) {
  const container = $("#provider-fallback-chain");
  const byId = new Map(candidates.map((provider) => [provider.id, provider]));
  if (!state.routeFallbackDraft.length) {
    container.innerHTML = '<span class="provider-fallback-empty">尚未添加备用连接</span>';
    return;
  }
  container.replaceChildren(...state.routeFallbackDraft.map((providerId, index) => {
    const provider = byId.get(providerId);
    const row = document.createElement("div");
    row.className = "provider-fallback-row";
    row.draggable = true;
    row.dataset.providerId = providerId;
    row.innerHTML = `<span class="fallback-grip" title="拖拽排序"><span data-lucide="grip-vertical"></span></span><span class="fallback-order">${index + 1}</span><strong>${escapeHtml(provider?.connectionLabel || provider?.label || providerId)}</strong><button class="icon-button fallback-up" type="button" title="上移" aria-label="上移" ${index === 0 ? "disabled" : ""}><span data-lucide="chevron-up"></span></button><button class="icon-button fallback-down" type="button" title="下移" aria-label="下移" ${index === state.routeFallbackDraft.length - 1 ? "disabled" : ""}><span data-lucide="chevron-down"></span></button><button class="icon-button danger-icon fallback-remove" type="button" title="移除" aria-label="移除"><span data-lucide="x"></span></button>`;
    row.querySelector(".fallback-up").addEventListener("click", () => moveFallbackProvider(providerId, -1));
    row.querySelector(".fallback-down").addEventListener("click", () => moveFallbackProvider(providerId, 1));
    row.querySelector(".fallback-remove").addEventListener("click", () => {
      state.routeFallbackDraft = state.routeFallbackDraft.filter((id) => id !== providerId);
      syncProviderRouteControls();
    });
    row.addEventListener("dragstart", () => { state.draggingFallbackId = providerId; });
    row.addEventListener("dragend", () => { state.draggingFallbackId = null; });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const from = state.routeFallbackDraft.indexOf(state.draggingFallbackId);
      const to = state.routeFallbackDraft.indexOf(providerId);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = state.routeFallbackDraft.splice(from, 1);
      state.routeFallbackDraft.splice(to, 0, moved);
      syncProviderRouteControls();
    });
    return row;
  }));
  refreshIcons();
}

function localProviderStatus(candidate) {
  if (candidate.duplicate) return "已存在于 Share Master";
  if (!candidate.hasCredential) return "未找到可导入的 API Key";
  if (candidate.kind === "claude") return "将更新 Share Master 的 Claude Code 连接";
  return "可安全导入";
}

function renderLocalProviderCandidates() {
  const validIds = new Set(state.localProviderCandidates
    .filter((candidate) => candidate.importable && !candidate.duplicate)
    .map((candidate) => candidate.id));
  state.selectedLocalProviderIds = new Set([...state.selectedLocalProviderIds].filter((id) => validIds.has(id)));
  elements.localProviderList.innerHTML = "";
  if (state.localProviderLoading) {
    elements.localProviderList.innerHTML = '<div class="local-provider-empty"><span data-lucide="loader-circle"></span><strong>正在扫描本机配置</strong><small>只读取已知配置位置，不会遍历或修改其他文件。</small></div>';
    elements.localProviderImportButton.disabled = true;
    refreshIcons();
    return;
  }
  if (!state.localProviderCandidates.length) {
    elements.localProviderList.innerHTML = '<div class="local-provider-empty"><span data-lucide="search-x"></span><strong>没有发现可识别的模型配置</strong><small>你仍可通过“添加连接”手动填写 Base URL、模型和 API Key。</small></div>';
    elements.localProviderImportButton.disabled = true;
    refreshIcons();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const candidate of state.localProviderCandidates) {
    const selectable = candidate.importable && !candidate.duplicate;
    const row = document.createElement("label");
    row.className = `local-provider-row${selectable ? "" : " disabled"}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedLocalProviderIds.has(candidate.id);
    checkbox.disabled = !selectable;
    checkbox.setAttribute("aria-label", `选择 ${candidate.label}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        if (candidate.kind === "claude") {
          for (const other of state.localProviderCandidates) {
            if (other.kind === "claude") state.selectedLocalProviderIds.delete(other.id);
          }
        }
        state.selectedLocalProviderIds.add(candidate.id);
      } else {
        state.selectedLocalProviderIds.delete(candidate.id);
      }
      renderLocalProviderCandidates();
    });
    const visual = document.createElement("span");
    visual.className = `local-provider-icon ${candidate.kind === "claude" ? "claude" : candidate.preset || "custom"}`;
    visual.textContent = candidate.kind === "claude" ? "C" : candidate.preset === "deepseek" ? "DS" : candidate.preset === "qwen" ? "QW" : "AI";
    const copy = document.createElement("span");
    copy.className = "local-provider-copy";
    const title = document.createElement("span");
    title.className = "local-provider-title-row";
    title.innerHTML = `<strong>${escapeHtml(candidate.label)}</strong><em class="local-provider-badge ${candidate.duplicate ? "duplicate" : candidate.hasCredential ? "ready" : "missing"}">${escapeHtml(localProviderStatus(candidate))}</em>`;
    const detail = document.createElement("small");
    detail.textContent = `${candidate.source} · ${candidate.model} · ${candidate.baseUrl}`;
    const protocol = document.createElement("small");
    protocol.className = "local-provider-protocol";
    protocol.textContent = candidate.kind === "claude"
      ? "Claude Messages / Claude Code"
      : candidate.protocol === "responses" ? "OpenAI Responses / Codex 代理" : "OpenAI Chat Completions";
    copy.append(title, detail, protocol);
    row.append(checkbox, visual, copy);
    fragment.appendChild(row);
  }
  elements.localProviderList.appendChild(fragment);
  const selectedCount = state.selectedLocalProviderIds.size;
  elements.localProviderImportButton.disabled = selectedCount === 0;
  elements.localProviderImportButton.lastChild.textContent = selectedCount ? `导入所选配置 (${selectedCount})` : "导入所选配置";
}

async function loadLocalProviderCandidates() {
  const generation = ++state.localProviderGeneration;
  state.localProviderLoading = true;
  elements.localProviderStatus.classList.add("neutral-status");
  elements.localProviderStatus.textContent = "";
  elements.localProviderSummary.textContent = "正在检查已知配置位置...";
  renderLocalProviderCandidates();
  try {
    const result = await api.discoverLocalProviders();
    if (generation !== state.localProviderGeneration) return;
    state.localProviderCandidates = result.candidates || [];
    state.selectedLocalProviderIds = new Set();
    const available = state.localProviderCandidates.filter((candidate) => candidate.importable && !candidate.duplicate).length;
    elements.localProviderSummary.textContent = `扫描 ${result.sources?.length || 0} 个来源 · 发现 ${state.localProviderCandidates.length} 项 · ${available} 项可导入`;
    elements.localProviderStatus.textContent = (result.warnings || []).join(" ");
  } catch (error) {
    if (generation !== state.localProviderGeneration) return;
    state.localProviderCandidates = [];
    elements.localProviderSummary.textContent = "扫描失败";
    elements.localProviderStatus.classList.remove("neutral-status");
    elements.localProviderStatus.textContent = error.message;
  } finally {
    if (generation === state.localProviderGeneration) {
      state.localProviderLoading = false;
      renderLocalProviderCandidates();
    }
  }
}

function openLocalProviderDialog() {
  elements.overlay.classList.add("hidden");
  elements.localProviderOverlay.classList.remove("hidden");
  loadLocalProviderCandidates();
  refreshIcons();
}

function closeLocalProviderDialog() {
  state.localProviderGeneration += 1;
  state.localProviderLoading = false;
  elements.localProviderOverlay.classList.add("hidden");
  elements.overlay.classList.remove("hidden");
}

async function importSelectedLocalProviders() {
  const candidateIds = [...state.selectedLocalProviderIds];
  if (!candidateIds.length) return;
  const button = elements.localProviderImportButton;
  button.disabled = true;
  elements.localProviderStatus.textContent = "正在加密保存到 Share Master...";
  try {
    const response = await api.importLocalProviders(candidateIds);
    state.providers = response.providers || state.providers;
    renderProviderOptions();
    const imported = response.results.filter((result) => result.status === "imported");
    const duplicates = response.results.filter((result) => result.status === "duplicate");
    const errors = response.results.filter((result) => result.status === "error");
    await loadLocalProviderCandidates();
    const summary = [
      imported.length ? `已导入 ${imported.length} 项` : "",
      duplicates.length ? `${duplicates.length} 项已存在` : "",
      errors.length ? `${errors.length} 项失败：${errors.map((result) => result.error).join("；")}` : "",
    ].filter(Boolean).join(" · ");
    elements.localProviderStatus.textContent = summary || "没有需要导入的配置。";
    elements.localProviderStatus.classList.toggle("neutral-status", errors.length === 0);
    if (imported.length) showDiagnostic(`${summary}。原配置未作任何修改。`, false);
  } catch (error) {
    elements.localProviderStatus.textContent = error.message;
    elements.localProviderStatus.classList.remove("neutral-status");
  } finally {
    button.disabled = state.selectedLocalProviderIds.size === 0;
  }
}

function openRelayDialog(provider = null, draft = null) {
  const form = $("#relay-form");
  form.reset();
  state.editingRelay = provider;
  state.routeFallbackDraft = [];
  state.probedProviderModels = [...(provider?.discoveredModels || [])];
  if (provider) {
    form.elements.id.value = provider.id;
    form.elements.preset.value = provider.preset || "custom";
    form.elements.label.value = provider.label || "";
    form.elements.baseUrl.value = provider.baseUrl || "";
    form.elements.model.value = provider.model || "";
    form.elements.protocol.value = provider.protocol || "chat_completions";
    form.elements.apiKey.required = false;
    form.elements.apiKey.placeholder = "留空则继续使用已加密保存的密钥";
  } else {
    form.elements.preset.value = state.providerPresets.deepseek ? "deepseek" : Object.keys(state.providerPresets)[0] || "";
    form.elements.apiKey.required = true;
    form.elements.apiKey.placeholder = "仅加密保存在本机";
    applyProviderPreset(true);
    if (draft) {
      form.elements.preset.value = state.providerPresets[draft.preset] ? draft.preset : "custom";
      form.elements.label.value = draft.label || "";
      form.elements.baseUrl.value = draft.baseUrl || "";
      form.elements.model.value = draft.model || "";
      form.elements.protocol.value = draft.protocol || "chat_completions";
      applyProviderPreset(false);
    }
  }
  const route = provider ? state.providerRoutes[provider.id] || null : null;
  $("#provider-failover-enabled").checked = Boolean(route?.enabled);
  $("#provider-failure-threshold").value = route?.failureThreshold || 2;
  $("#provider-cooldown-seconds").value = Math.round((route?.cooldownMs || 60000) / 1000);
  syncProviderRouteControls(route);
  renderProviderModelOptions();
  $("#connection-title").textContent = provider ? "编辑模型供应商" : "添加连接";
  $("#provider-submit-label").textContent = provider ? "保存供应商" : "添加供应商";
  $("#provider-model-status").textContent = state.probedProviderModels.length
    ? `已保存 ${state.probedProviderModels.length} 个模型`
    : "";
  $("#connection-error").textContent = "";
  elements.overlay.classList.add("hidden");
  $("#connection-overlay").classList.remove("hidden");
  refreshIcons();
}

$("#add-connection-button").addEventListener("click", () => openRelayDialog());
$("#local-provider-discovery-button").addEventListener("click", openLocalProviderDialog);
$("#local-provider-close-button").addEventListener("click", closeLocalProviderDialog);
$("#local-provider-refresh-button").addEventListener("click", loadLocalProviderCandidates);
elements.localProviderImportButton.addEventListener("click", importSelectedLocalProviders);
elements.localProviderOverlay.addEventListener("click", (event) => {
  if (event.target === elements.localProviderOverlay) closeLocalProviderDialog();
});
$("#close-connection-button").addEventListener("click", () => {
  $("#connection-overlay").classList.add("hidden");
  elements.overlay.classList.remove("hidden");
  state.editingRelay = null;
  state.routeFallbackDraft = [];
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
$("#local-history-button").addEventListener("click", openLocalHistoryDialog);
$("#local-history-close-button").addEventListener("click", closeLocalHistoryDialog);
$("#local-history-refresh-button").addEventListener("click", loadLocalHistory);
elements.localHistorySearch.addEventListener("input", () => {
  clearTimeout(elements.localHistorySearch._timer);
  elements.localHistorySearch._timer = setTimeout(loadLocalHistory, 180);
});
elements.localHistoryOverlay.addEventListener("click", (event) => {
  if (event.target === elements.localHistoryOverlay) closeLocalHistoryDialog();
});
$("#task-close-button").addEventListener("click", closeTaskDialog);
$("#task-run-now-button").addEventListener("click", () => {
  if (state.editingTask) runScheduledTaskNow(state.editingTask, $("#task-run-now-button"));
});
elements.taskProviderSelect.addEventListener("change", () => populateTaskModels(elements.taskModelInput.value));
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
  if (!state.editingTask && scheduledAt < Date.now() - 60000) {
    elements.taskError.textContent = "执行时间不能早于当前时间。";
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
      model: data.model || null,
      approvalMode: data.approvalMode,
      timeZone: state.editingTask?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      notifyOnCompletion: elements.taskNotifyInput.checked,
      retryOnFailure: elements.taskRetryInput.checked,
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
$("#provider-preset").addEventListener("change", () => applyProviderPreset(true));
$("#provider-fallback").addEventListener("change", (event) => {
  const providerId = event.currentTarget.value;
  if (providerId && !state.routeFallbackDraft.includes(providerId)) state.routeFallbackDraft.push(providerId);
  syncProviderRouteControls();
});
$("#relay-form").elements.protocol.addEventListener("change", (event) => {
  $("#provider-protocol-note").textContent = event.currentTarget.value === "responses"
    ? state.providerPresets.responses?.note || "OpenAI Responses 兼容接口。"
    : state.providerPresets[$("#provider-preset").value]?.note || state.providerPresets.custom?.note || "OpenAI 兼容接口。";
  syncProviderRouteControls();
});
$("#provider-load-models").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const form = $("#relay-form");
  const status = $("#provider-model-status");
  button.disabled = true;
  status.textContent = "正在测试连接...";
  $("#connection-error").textContent = "";
  try {
    const result = await api.probeProviderModels({
      providerId: state.editingRelay?.id || null,
      baseUrl: form.elements.baseUrl.value,
      apiKey: form.elements.apiKey.value,
    });
    state.probedProviderModels = result.models;
    renderProviderModelOptions();
    const currentModel = form.elements.model.value.trim();
    if (!result.models.includes(currentModel)) form.elements.model.value = result.models[0];
    status.textContent = `连接成功 · ${result.latencyMs} ms · ${result.models.length} 个模型`;
  } catch (error) {
    state.probedProviderModels = [];
    renderProviderModelOptions();
    status.textContent = "";
    $("#connection-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#relay-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.discoveredModels = [...state.probedProviderModels];
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  $("#connection-error").textContent = "";
  try {
    const wasEditing = Boolean(state.editingRelay);
    const provider = state.editingRelay
      ? await api.updateRelay(data)
      : await api.addRelay(data);
    if (!wasEditing) {
      state.editingRelay = provider;
      form.elements.id.value = provider.id;
      form.elements.apiKey.required = false;
      form.elements.apiKey.placeholder = "留空则继续使用已加密保存的密钥";
    }
    const route = await api.saveProviderRoute({
      providerId: provider.id,
      enabled: form.elements.failoverEnabled.checked,
      fallbackProviderIds: [...state.routeFallbackDraft],
      failureThreshold: form.elements.failureThreshold.value,
      cooldownMs: Number(form.elements.cooldownSeconds.value) * 1000,
    });
    state.providerRoutes[provider.id] = route;
    upsertProvider(provider);
    renderProviderOptions();
    form.reset();
    form.elements.id.value = "";
    form.elements.apiKey.required = true;
    form.elements.apiKey.placeholder = "仅加密保存在本机";
    state.editingRelay = null;
    state.routeFallbackDraft = [];
    state.probedProviderModels = [];
    $("#connection-error").textContent = "";
    $("#connection-overlay").classList.add("hidden");
    await connect(provider.id);
  } catch (error) {
    $("#connection-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
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
$("#health-button").addEventListener("click", openHealthDialog);
$("#health-close-button").addEventListener("click", closeHealthDialog);
$("#health-done-button").addEventListener("click", closeHealthDialog);
$("#health-test-all-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  $("#health-status").textContent = "正在检测...";
  await Promise.all(monitoredProviders().map((provider) => testProviderHealth(provider)));
  $("#health-status").textContent = "检测完成";
  button.disabled = false;
});
elements.healthOverlay.addEventListener("click", (event) => {
  if (event.target === elements.healthOverlay) closeHealthDialog();
});
$("#extensions-button").addEventListener("click", () => openExtensionsDialog());
$("#extensions-close-button").addEventListener("click", closeExtensionsDialog);
$("#extensions-done-button").addEventListener("click", closeExtensionsDialog);
elements.extensionsOverlay.addEventListener("click", (event) => {
  if (event.target === elements.extensionsOverlay) closeExtensionsDialog();
});
document.querySelectorAll("[data-extension-tab]").forEach((button) => {
  button.addEventListener("click", () => switchExtensionTab(button.dataset.extensionTab));
});
elements.extensionsSkillSearch.addEventListener("input", () => renderManagedSkills(elements.extensionsSkillSearch.value));
$("#extensions-refresh-skills").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  elements.extensionsStatus.textContent = "正在刷新私有 Skill 镜像...";
  try {
    const response = await api.refreshSkills();
    applyExtensionSnapshot(response);
    if (state.connected && !["claude", "openai-compatible"].includes(state.providerEngine)) await loadSkills(true);
    elements.extensionsStatus.textContent = `刷新完成：${response.result?.activated || 0} 个已启用`;
  } catch (error) {
    elements.extensionsStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#skill-install-button").addEventListener("click", openSkillInstallDialog);
$("#skill-install-close-button").addEventListener("click", closeSkillInstallDialog);
document.querySelectorAll("[data-skill-install-kind]").forEach((button) => button.addEventListener("click", () => setSkillInstallKind(button.dataset.skillInstallKind)));
$("#skill-install-browse").addEventListener("click", async () => {
  try {
    const selected = state.skillInstallKind === "zip" ? await api.chooseSkillZip() : await api.chooseSkillFolder();
    if (selected) $("#skill-install-source").value = selected;
  } catch (error) {
    $("#skill-install-status").textContent = error.message;
  }
});
elements.skillInstallForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  $("#skill-install-status").textContent = "正在检查并安装...";
  try {
    const response = await api.installSkill({ kind: state.skillInstallKind, source: $("#skill-install-source").value });
    applyExtensionSnapshot(response);
    closeSkillInstallDialog();
    elements.extensionsStatus.textContent = `已安装 ${response.installed.map((item) => item.name).join("、")}`;
    if (state.connected && !["claude", "openai-compatible"].includes(state.providerEngine)) await loadSkills(true);
  } catch (error) {
    $("#skill-install-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
elements.skillInstallOverlay.addEventListener("click", (event) => {
  if (event.target === elements.skillInstallOverlay) closeSkillInstallDialog();
});
$("#prompt-new-button").addEventListener("click", resetPromptEditor);
document.querySelectorAll("[data-prompt-mode]").forEach((button) => button.addEventListener("click", () => setPromptEditorMode(button.dataset.promptMode)));
elements.promptForm.elements.content.addEventListener("input", () => {
  if (state.promptEditorMode === "preview") setPromptEditorMode("preview");
});
elements.promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  $("#prompt-error").textContent = "";
  try {
    const template = await api.savePrompt(Object.fromEntries(new FormData(event.currentTarget)));
    await loadExtensions();
    selectPrompt(template);
    $("#prompt-error").textContent = "已保存";
  } catch (error) {
    $("#prompt-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#prompt-delete-button").addEventListener("click", async () => {
  const template = state.promptTemplates.find((item) => item.id === state.editingPromptId);
  if (!template || !confirm(`删除 Prompt “/${template.name}”？`)) return;
  try {
    await api.removePrompt(template.id);
    await loadExtensions();
    resetPromptEditor();
  } catch (error) {
    $("#prompt-error").textContent = error.message;
  }
});
$("#mcp-new-button").addEventListener("click", resetMcpEditor);
$("#mcp-transport").addEventListener("change", updateMcpTransportFields);
elements.mcpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  setMcpStatus("");
  try {
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const server = await api.saveMcp({
      ...values,
      enabled: event.currentTarget.elements.enabled.checked,
      args: String(values.args || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      env: mcpEnvironmentInput(values.env),
    });
    await loadExtensions();
    selectMcp(server);
    setMcpStatus(state.connected && !["claude", "openai-compatible"].includes(state.providerEngine)
      ? "已保存，下次重新连接时生效"
      : "已保存");
  } catch (error) {
    setMcpStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$("#mcp-delete-button").addEventListener("click", async () => {
  const server = state.mcpServers.find((item) => item.id === state.editingMcpId);
  if (!server || !confirm(`删除 MCP “${server.name}”？加密环境变量也会一并删除。`)) return;
  try {
    await api.removeMcp(server.id);
    await loadExtensions();
    resetMcpEditor();
    elements.extensionsStatus.textContent = state.connected && !["claude", "openai-compatible"].includes(state.providerEngine)
      ? "MCP 已删除，下次重新连接时生效"
      : "MCP 已删除";
  } catch (error) {
    setMcpStatus(error.message, true);
  }
});
$("#mcp-test-button").addEventListener("click", async (event) => {
  if (!state.editingMcpId) return;
  const button = event.currentTarget;
  button.disabled = true;
  setMcpStatus("正在检测...");
  try {
    const result = await api.testMcp(state.editingMcpId);
    setMcpStatus(`${result.detail} · ${result.latencyMs} ms`);
  } catch (error) {
    setMcpStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$("#usage-button").addEventListener("click", openUsageDialog);
$("#usage-close-button").addEventListener("click", closeUsageDialog);
$("#usage-done-button").addEventListener("click", closeUsageDialog);
$("#usage-refresh-button").addEventListener("click", refreshUsage);
elements.usageProviderFilter.addEventListener("change", refreshUsage);
elements.pricingProvider.addEventListener("change", () => loadPricingFields(true));
elements.pricingModel.addEventListener("change", () => loadPricingFields(false));
elements.pricingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  $("#pricing-status").textContent = "";
  try {
    const providerId = elements.pricingProvider.value;
    const model = elements.pricingModel.value.trim();
    const pricing = await api.saveModelPricing({
      providerId,
      model,
      inputPerMillion: $("#pricing-input").value,
      cachedInputPerMillion: $("#pricing-cache").value,
      outputPerMillion: $("#pricing-output").value,
    });
    state.modelPricing[`${providerId}:${model}`] = pricing;
    $("#pricing-status").textContent = "价格已保存，后续请求将自动估算成本。";
    await refreshUsage();
  } catch (error) {
    $("#pricing-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#usage-clear-button").addEventListener("click", async () => {
  const providerId = elements.usageProviderFilter.value || null;
  const scope = providerId ? providerUsageLabel(providerId) : "全部连接";
  if (!confirm(`清空${scope}的本地请求日志？\n\n聊天记录和模型配置不会被删除。`)) return;
  try {
    await api.clearProviderUsage({ providerId });
    await refreshUsage();
  } catch (error) {
    showActionError(error);
  }
});
elements.usageOverlay.addEventListener("click", (event) => {
  if (event.target === elements.usageOverlay) closeUsageDialog();
});
$("#config-export-button").addEventListener("click", async () => {
  try {
    const result = await api.exportConfiguration();
    if (!result.canceled) showDiagnostic("配置已导出；文件不包含 API Key。", false);
  } catch (error) {
    showActionError(error);
  }
});
$("#config-import-button").addEventListener("click", async () => {
  try {
    const result = await api.importConfiguration();
    if (result.canceled) return;
    showDiagnostic(`已导入配置：新增 ${result.providersAdded} 个连接、更新 ${result.providersUpdated} 个连接、新增 ${result.projectsAdded} 个 Project、${result.promptsImported || 0} 个 Prompt、${result.mcpServersImported || 0} 个 MCP；API Key 和 MCP 密钥需要单独配置。`, false);
  } catch (error) {
    showActionError(error);
  }
});
$("#backup-button").addEventListener("click", openBackupDialog);
$("#backup-close-button").addEventListener("click", closeBackupDialog);
$("#backup-done-button").addEventListener("click", closeBackupDialog);
$("#backup-create-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  elements.backupStatus.textContent = "正在备份...";
  try {
    await api.createBackup();
    elements.backupStatus.textContent = "备份已创建。";
    await loadBackups();
  } catch (error) {
    elements.backupStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
elements.backupOverlay.addEventListener("click", (event) => {
  if (event.target === elements.backupOverlay) closeBackupDialog();
});
$("#sync-button").addEventListener("click", openSyncDialog);
$("#sync-close-button").addEventListener("click", closeSyncDialog);
$("#sync-done-button").addEventListener("click", closeSyncDialog);
$("#sync-directory-choose").addEventListener("click", async () => {
  try {
    const selected = await api.chooseSyncDirectory(elements.syncDirectoryInput.value);
    if (!selected) return;
    const snapshot = await api.configureSync({ directory: selected, autoSync: elements.syncAutoInput.checked });
    renderSyncStatus(snapshot);
    elements.syncStatus.textContent = "同步目录已保存。";
  } catch (error) {
    elements.syncStatus.textContent = error.message;
  }
});
document.querySelectorAll("[data-sync-backend]").forEach((button) => button.addEventListener("click", () => {
  state.syncBackend = button.dataset.syncBackend;
  document.querySelectorAll("[data-sync-backend]").forEach((item) => item.classList.toggle("active", item === button));
  $("#sync-directory-fields").classList.toggle("hidden", state.syncBackend !== "directory");
  elements.syncWebdavForm.classList.toggle("hidden", state.syncBackend !== "webdav");
  $("#sync-pull-label").textContent = state.syncBackend === "webdav" ? "使用 WebDAV" : "使用同步目录";
  refreshIcons();
}));
elements.syncWebdavForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const snapshot = await api.configureWebdavSync({
      url: event.currentTarget.elements.url.value,
      username: event.currentTarget.elements.username.value,
      password: event.currentTarget.elements.password.value,
      autoSync: elements.syncAutoInput.checked,
    });
    renderSyncStatus(snapshot);
    elements.syncStatus.textContent = "WebDAV 连接已加密保存。";
  } catch (error) {
    elements.syncStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
elements.syncAutoInput.addEventListener("change", async () => {
  try {
    const snapshot = state.syncBackend === "webdav"
      ? await api.configureWebdavSync({ url: elements.syncWebdavForm.elements.url.value, autoSync: elements.syncAutoInput.checked })
      : await api.configureSync({ directory: elements.syncDirectoryInput.value, autoSync: elements.syncAutoInput.checked });
    renderSyncStatus(snapshot);
  } catch (error) {
    elements.syncAutoInput.checked = false;
    elements.syncStatus.textContent = error.message;
  }
});
$("#sync-now-button").addEventListener("click", () => runConfigurationSync("auto"));
$("#sync-push-button").addEventListener("click", () => runConfigurationSync("push"));
$("#sync-pull-button").addEventListener("click", () => runConfigurationSync("pull"));
elements.syncOverlay.addEventListener("click", (event) => {
  if (event.target === elements.syncOverlay) closeSyncDialog();
});
$("#app-settings-button").addEventListener("click", openAppSettingsDialog);
$("#app-settings-close-button").addEventListener("click", closeAppSettingsDialog);
elements.appSettingsOverlay.addEventListener("click", (event) => {
  if (event.target === elements.appSettingsOverlay) closeAppSettingsDialog();
});
elements.appSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api.saveAppSettings({
      launchAtLogin: event.currentTarget.elements.launchAtLogin.checked,
      closeToTray: event.currentTarget.elements.closeToTray.checked,
    });
    $("#app-settings-status").textContent = "设置已保存。";
  } catch (error) {
    $("#app-settings-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#check-update-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const status = $("#update-status");
  button.disabled = true;
  status.textContent = "正在连接私有 GitHub 仓库...";
  status.dataset.state = "checking";
  try {
    const result = await api.checkForUpdates();
    status.textContent = result.message;
    status.dataset.state = result.status;
    const download = $("#download-update-button");
    download.dataset.url = result.releaseUrl || "";
    download.classList.toggle("hidden", result.status !== "available" || !result.releaseUrl);
    status.title = result.latestVersion ? `当前 v${result.currentVersion} · 最新 v${result.latestVersion}` : "";
    refreshIcons();
  } catch (error) {
    status.textContent = error.message;
    status.dataset.state = "error";
  } finally {
    button.disabled = false;
  }
});
$("#download-update-button").addEventListener("click", (event) => {
  const target = event.currentTarget.dataset.url;
  if (target) api.openExternal(target).catch(showActionError);
});
$("#import-preview-close-button").addEventListener("click", closeDeepLinkImportPreview);
$("#import-preview-cancel-button").addEventListener("click", closeDeepLinkImportPreview);
$("#import-preview-confirm-button").addEventListener("click", confirmDeepLinkImport);
elements.importPreviewOverlay.addEventListener("click", (event) => {
  if (event.target === elements.importPreviewOverlay) closeDeepLinkImportPreview();
});
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
  else if (!elements.backupOverlay.classList.contains("hidden")) closeBackupDialog();
  else if (!elements.extensionsOverlay.classList.contains("hidden")) closeExtensionsDialog();
  else if (!elements.healthOverlay.classList.contains("hidden")) closeHealthDialog();
  else if (!elements.usageOverlay.classList.contains("hidden")) closeUsageDialog();
  else if (!elements.localHistoryOverlay.classList.contains("hidden")) closeLocalHistoryDialog();
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
$("#theme-button").addEventListener("click", () => {
  const order = ["system", "light", "dark"];
  applyTheme(order[(order.indexOf(state.theme) + 1) % order.length]);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "system") applyTheme("system", false);
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
elements.search.addEventListener("input", scheduleThreadSearch);
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
  scheduleComposerInputUpdate();
});
elements.input.addEventListener("paste", pasteClipboardAttachments);
elements.attachButton.addEventListener("click", async () => {
  if (elements.attachButton.disabled) return;
  try {
    addAttachments(await api.chooseImages());
    elements.input.focus();
  } catch (error) {
    showActionError(error);
  }
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
  option.addEventListener("click", async () => {
    const mode = option.dataset.approvalMode;
    if (mode === "full" && state.approvalMode !== "full") {
      const confirmed = await confirmFullAccess();
      if (!confirmed) return;
    }
    setApprovalMode(mode);
    focusComposerAfterPermissionChange();
  });
});
elements.fullAccessCancel.addEventListener("click", () => closeFullAccessConfirmation(false));
elements.fullAccessConfirm.addEventListener("click", () => closeFullAccessConfirmation(true));
elements.fullAccessOverlay.addEventListener("click", (event) => {
  if (event.target === elements.fullAccessOverlay) closeFullAccessConfirmation(false);
});
elements.fullAccessOverlay.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [elements.fullAccessCancel, elements.fullAccessConfirm];
  const current = controls.indexOf(document.activeElement);
  event.preventDefault();
  controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
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
    else sendMessage("auto");
  }
});
elements.send.addEventListener("click", () => sendMessage("auto"));
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
    if (!elements.fullAccessOverlay.classList.contains("hidden")) {
      event.preventDefault();
      closeFullAccessConfirmation(false);
      return;
    }
    elements.menu.classList.add("hidden");
    elements.approvalModeMenu.classList.add("hidden");
    closeSkillMenu();
    if (!elements.taskOverlay.classList.contains("hidden")) closeTaskDialog();
    else if (!elements.localHistoryOverlay.classList.contains("hidden")) closeLocalHistoryDialog();
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
api.onDisconnected(handleConnectionDisconnect);
api.onStoreChanged(applyStoreSnapshot);
api.onExtensionsChanged((snapshot) => applyExtensionSnapshot(snapshot));
api.onNavigate((payload = {}) => {
  if (payload.action === "new-chat") newChat();
  if (payload.action === "extensions") openExtensionsDialog(payload.tab || "skills");
  if (payload.action === "import-preview") openDeepLinkImportPreview(payload);
  if (payload.view && ["active", "archived", "scheduled", "removed"].includes(payload.view)) {
    elements.overlay.classList.add("hidden");
    setThreadView(payload.view);
  }
});

setInterval(() => {
  updateThreadViewControls();
  renderThreadList();
}, 30000);

(async function init() {
  try {
    const bootstrap = await api.bootstrap();
    state.providers = bootstrap.providers;
    renderProviderPresetCatalog(bootstrap.providerPresets || []);
    state.savedProjects = bootstrap.projects || [];
    state.projectThreads = bootstrap.projectThreads || {};
    state.hiddenProjectRoots = bootstrap.hiddenProjectRoots || [];
    state.threadSettings = bootstrap.threadSettings || {};
    state.providerRoutes = bootstrap.providerRoutes || {};
    state.threadAliases = bootstrap.threadAliases || {};
    state.hiddenThreadIds = new Set(bootstrap.hiddenThreadIds || []);
    state.deletedThreadIds = new Set(bootstrap.deletedThreadIds || []);
    state.localArchivedThreadIds = new Set(bootstrap.localArchivedThreadIds || []);
    state.pendingDeletions = bootstrap.pendingDeletions || [];
    state.scheduledTasks = bootstrap.scheduledTasks || [];
    state.messageQueues = restoredMessageQueues(bootstrap.messageQueues);
    syncRecoveredTurns(bootstrap.recoveredTurns);
    state.promptTemplates = bootstrap.promptTemplates || [];
    state.mcpServers = bootstrap.mcpServers || [];
    state.runningTaskIds = new Set(bootstrap.runningTaskIds || []);
    state.recordHome = bootstrap.recordHome || bootstrap.codexHome || state.recordHome;
    state.workspace = bootstrap.defaultWorkspace || state.workspace;
    await loadExtensions();
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
    applyTheme(state.theme, false);
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
