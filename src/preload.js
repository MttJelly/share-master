const { contextBridge, ipcRenderer, webUtils } = require("electron");

const pendingNavigation = [];
const navigationHandlers = new Set();
async function invokeRendererIpc(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  const payload = result?.__shareMasterIpcError;
  if (!payload) return result;
  const error = new Error(payload.message || "Share Master 请求失败。");
  if (payload.code) error.code = payload.code;
  if (payload.status !== null && payload.status !== undefined) error.status = payload.status;
  if (payload.requestId) error.requestId = payload.requestId;
  if (payload.finishReason) error.finishReason = payload.finishReason;
  throw error;
}
ipcRenderer.on("app:navigate", (_event, value) => {
  if (!navigationHandlers.size) pendingNavigation.push(value);
  else navigationHandlers.forEach((handler) => handler(value));
});

contextBridge.exposeInMainWorld("codexDeck", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  newWindow: (payload) => ipcRenderer.invoke("window:new", payload),
  setWindowTheme: (theme) => ipcRenderer.send("window:set-theme", theme),
  chooseWorkspace: (current) => ipcRenderer.invoke("dialog:workspace", current),
  chooseRecordHome: (current) => ipcRenderer.invoke("dialog:record-home", current),
  chooseSyncDirectory: (current) => ipcRenderer.invoke("dialog:sync-directory", current),
  chooseImages: () => ipcRenderer.invoke("dialog:images"),
  pasteClipboardImages: () => ipcRenderer.invoke("clipboard:images"),
  chooseSkillFolder: () => ipcRenderer.invoke("dialog:skill-folder"),
  chooseSkillZip: () => ipcRenderer.invoke("dialog:skill-zip"),
  localFilePath: (file) => webUtils.getPathForFile(file),
  notify: (payload) => ipcRenderer.invoke("app:notify", payload),
  copyText: (value) => ipcRenderer.invoke("app:copy-text", value),
  copyImage: (payload) => ipcRenderer.invoke("app:copy-image", payload),
  appSettings: () => ipcRenderer.invoke("app:settings"),
  saveAppSettings: (input) => ipcRenderer.invoke("app:save-settings", input),
  checkForUpdates: () => ipcRenderer.invoke("app:check-update"),
  localHistorySources: () => ipcRenderer.invoke("local-history:sources"),
  listLocalHistory: (input) => ipcRenderer.invoke("local-history:list", input),
  readLocalHistory: (input) => ipcRenderer.invoke("local-history:read", input),
  importLocalHistory: (input) => ipcRenderer.invoke("local-history:import", input),
  discoverLocalProviders: () => ipcRenderer.invoke("local-providers:discover"),
  importLocalProviders: (candidateIds) => ipcRenderer.invoke("local-providers:import", candidateIds),
  confirmDeepLinkImport: (input) => ipcRenderer.invoke("deep-link:confirm-import", input),
  officialLogin: (providerId) => ipcRenderer.invoke("auth:official-login", providerId),
  addRelay: (input) => ipcRenderer.invoke("provider:add-relay", input),
  updateRelay: (input) => ipcRenderer.invoke("provider:update-relay", input),
  saveProviderRoute: (input) => ipcRenderer.invoke("provider:save-route", input),
  probeProviderModels: (input) => ipcRenderer.invoke("provider:probe-models", input),
  addAccount: (input) => ipcRenderer.invoke("provider:add-account", input),
  removeProvider: (providerId) => ipcRenderer.invoke("provider:remove", providerId),
  reorderProviders: (providerIds) => ipcRenderer.invoke("provider:reorder", providerIds),
  saveProviderKey: (input) => ipcRenderer.invoke("provider:save-key", input),
  claudeModels: (input) => ipcRenderer.invoke("provider:claude-models", input),
  configureClaude: (input) => ipcRenderer.invoke("provider:configure-claude", input),
  providerBalance: (providerId) => ipcRenderer.invoke("provider:balance", providerId),
  providerUsage: (input) => ipcRenderer.invoke("usage:get", input),
  clearProviderUsage: (input) => ipcRenderer.invoke("usage:clear", input),
  saveModelPricing: (input) => ipcRenderer.invoke("usage:save-pricing", input),
  modelPricing: () => ipcRenderer.invoke("usage:pricing"),
  exportConfiguration: () => ipcRenderer.invoke("config:export"),
  importConfiguration: () => ipcRenderer.invoke("config:import"),
  listBackups: () => ipcRenderer.invoke("backup:list"),
  createBackup: () => ipcRenderer.invoke("backup:create"),
  restoreBackup: (name) => ipcRenderer.invoke("backup:restore", name),
  syncStatus: () => ipcRenderer.invoke("sync:status"),
  configureSync: (input) => ipcRenderer.invoke("sync:configure", input),
  configureWebdavSync: (input) => ipcRenderer.invoke("sync:configure-webdav", input),
  syncNow: (mode) => ipcRenderer.invoke("sync:run", mode),
  setRecordHome: (directory) => ipcRenderer.invoke("settings:set-record-home", directory),
  addProject: (input) => ipcRenderer.invoke("project:add", input),
  renameProject: (input) => ipcRenderer.invoke("project:rename", input),
  deleteProject: (input) => ipcRenderer.invoke("project:delete", input),
  assignThreadToProject: (input) => ipcRenderer.invoke("project:assign-thread", input),
  saveThreadSettings: (input) => ipcRenderer.invoke("thread:save-settings", input),
  renameThreadLocal: (input) => ipcRenderer.invoke("thread:rename-local", input),
  archiveThreadLocal: (threadId) => ipcRenderer.invoke("thread:archive-local", threadId),
  unarchiveThreadLocal: (threadId) => ipcRenderer.invoke("thread:unarchive-local", threadId),
  hideThread: (input) => ipcRenderer.invoke("thread:hide", input),
  restoreThread: (threadId) => ipcRenderer.invoke("thread:restore", threadId),
  deleteThreadNow: (threadId) => ipcRenderer.invoke("thread:delete-now", threadId),
  saveMessageQueue: (input) => ipcRenderer.invoke("thread:save-message-queue", input),
  claimMessageQueue: (input) => ipcRenderer.invoke("thread:claim-message-queue", input),
  restoreMessageQueue: (input) => ipcRenderer.invoke("thread:restore-message-queue", input),
  saveScheduledTask: (input) => ipcRenderer.invoke("task:save", input),
  removeScheduledTask: (taskId) => ipcRenderer.invoke("task:remove", taskId),
  setScheduledTaskEnabled: (input) => ipcRenderer.invoke("task:set-enabled", input),
  runScheduledTaskNow: (taskId) => ipcRenderer.invoke("task:run-now", taskId),
  openExternal: (target) => ipcRenderer.invoke("url:open", target),
  connect: (provider) => invokeRendererIpc("codex:connect", provider),
  listThreads: (query) => invokeRendererIpc("codex:list", query),
  listModels: () => invokeRendererIpc("codex:models"),
  listSkills: (payload) => invokeRendererIpc("codex:skills", payload),
  listExtensions: () => ipcRenderer.invoke("extension:list"),
  refreshSkills: () => ipcRenderer.invoke("extension:refresh-skills"),
  installSkill: (input) => ipcRenderer.invoke("extension:install-skill", input),
  removeSkill: (name) => ipcRenderer.invoke("extension:remove-skill", name),
  setSkillEnabled: (input) => ipcRenderer.invoke("extension:set-skill-enabled", input),
  savePrompt: (input) => ipcRenderer.invoke("prompt:save", input),
  removePrompt: (id) => ipcRenderer.invoke("prompt:remove", id),
  saveMcp: (input) => ipcRenderer.invoke("mcp:save", input),
  removeMcp: (id) => ipcRenderer.invoke("mcp:remove", id),
  testMcp: (id) => ipcRenderer.invoke("mcp:test", id),
  readThread: (threadId) => invokeRendererIpc("codex:read", threadId),
  readThreadWindow: (payload) => invokeRendererIpc("codex:read-window", payload),
  searchThreads: (query) => invokeRendererIpc("codex:search", query),
  accountStatus: () => invokeRendererIpc("codex:account-status"),
  resumeThread: (payload) => invokeRendererIpc("codex:resume", payload),
  startThread: (payload) => invokeRendererIpc("codex:start-thread", payload),
  startTurn: (payload) => invokeRendererIpc("codex:start-turn", payload),
  steerTurn: (payload) => invokeRendererIpc("codex:steer", payload),
  renameThread: (payload) => invokeRendererIpc("codex:rename", payload),
  interruptTurn: (payload) => invokeRendererIpc("codex:interrupt", payload),
  answerApproval: (payload) => invokeRendererIpc("codex:approval-response", payload),
  onEvent: (handler) => ipcRenderer.on("codex:event", (_event, value) => handler(value)),
  onApproval: (handler) => ipcRenderer.on("codex:approval", (_event, value) => handler(value)),
  onDiagnostic: (handler) => ipcRenderer.on("codex:diagnostic", (_event, value) => handler(value)),
  onDisconnected: (handler) => ipcRenderer.on("codex:disconnected", (_event, value) => handler(value)),
  onStoreChanged: (handler) => ipcRenderer.on("app:store-changed", (_event, value) => handler(value)),
  onExtensionsChanged: (handler) => ipcRenderer.on("app:extensions-changed", (_event, value) => handler(value)),
  onNavigate: (handler) => {
    navigationHandlers.add(handler);
    pendingNavigation.splice(0).forEach((value) => handler(value));
  },
});
