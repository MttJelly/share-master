const { app, BrowserWindow, dialog, ipcMain, net, shell } = require("electron");
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CodexServer, CODEX_HOME } = require("./codex-server");
const { ClaudeServer } = require("./claude-server");
const { fetchClaudeModels, fetchClaudeModelsSafely } = require("./claude-models");
const { fetchOpenAIModels } = require("./openai-models");
const { ProviderStore, reasoningProfile } = require("./provider-store");
const { fetchRelayBalance } = require("./relay-balance");
const { executeScheduledTask, finalizeScheduledTask } = require("./scheduled-task-runner");
const { syncConversationMirror } = require("./conversation-mirror");
const { syncSkillRoots } = require("./skill-mirror");

app.setName("Share Master");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const servers = new Map();
const connectionGenerations = new Map();
const connectionAttempts = new Map();
const runningScheduledTasks = new Set();
const scheduledTaskRuns = new Map();
let conversationMirrorSync = null;
const INTERACTIVE_SERVER_REQUESTS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
  "applyPatchApproval",
  "execCommandApproval",
]);
let providerStore;
const DEFAULT_RENDERER_THREAD_TURNS = 40;

function rendererThreadWindow(result, requestedTurns = DEFAULT_RENDERER_THREAD_TURNS) {
  const thread = result?.thread;
  if (!thread || !Array.isArray(thread.turns)) return result;
  const totalTurns = thread.turns.length;
  const visibleTurns = Math.max(
    DEFAULT_RENDERER_THREAD_TURNS,
    Math.min(totalTurns, Number(requestedTurns) || DEFAULT_RENDERER_THREAD_TURNS),
  );
  return {
    ...result,
    thread: {
      ...thread,
      turns: thread.turns.slice(-visibleTurns),
      _totalTurnCount: totalTurns,
      _turnOffset: Math.max(0, totalTurns - visibleTurns),
    },
  };
}

const nextConnectionGeneration = (senderId) => {
  const generation = (connectionGenerations.get(senderId) || 0) + 1;
  connectionGenerations.set(senderId, generation);
  return generation;
};

function userEnvironmentVariable(name) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", `[Environment]::GetEnvironmentVariable('${name}','User')`],
      { windowsHide: true },
      (_error, stdout) => resolve(String(stdout || "").trim()),
    );
  });
}

async function providerEnvironment() {
  if (process.env.SHARE_MASTER_STORE_ROOT) return {};
  const [niubi, hexuan] = await Promise.all([
    userEnvironmentVariable("NIUBI_API_KEY"),
    userEnvironmentVariable("HEXUAN_API_KEY"),
  ]);
  return {
    ...(niubi ? { NIUBI_API_KEY: niubi } : {}),
    ...(hexuan ? { HEXUAN_API_KEY: hexuan } : {}),
  };
}

function apiKeyForProvider(provider, environment) {
  const keyName = provider.envKey;
  if (keyName) return provider.env?.[keyName] || environment[keyName] || null;
  return Object.values(provider.env || {})[0] || null;
}

async function accountSnapshot(server) {
  if (!["official", "account"].includes(server.provider.type)) {
    return { account: null, requiresOpenaiAuth: false, rateLimits: null };
  }
  const account = await server.request("account/read", { refreshToken: false });
  let rateLimits = null;
  if (account.account?.type === "chatgpt") {
    try {
      rateLimits = await server.request("account/rateLimits/read", {});
    } catch (error) {
      server.emit("diagnostic", `无法读取账号额度：${error.message}`);
    }
  }
  return { ...account, rateLimits };
}

async function loginOfficialAccount(provider) {
  const server = new CodexServer(provider, await providerEnvironment());
  let expectedLoginId = null;
  let earlyCompletion = null;
  let resolveCompletion;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  const onNotification = (message) => {
    if (message.method !== "account/login/completed") return;
    if (!expectedLoginId) earlyCompletion = message.params;
    else if (!message.params?.loginId || message.params.loginId === expectedLoginId) resolveCompletion(message.params);
  };
  server.on("notification", onNotification);
  try {
    await server.start();
    const started = await server.request("account/login/start", {
      type: "chatgpt",
      appBrand: "codex",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
    }, 90000);
    if (started.type !== "chatgpt" || !started.authUrl || !started.loginId) {
      throw new Error("Codex 未返回可用的 ChatGPT 登录地址。");
    }
    expectedLoginId = started.loginId;
    if (earlyCompletion && (!earlyCompletion.loginId || earlyCompletion.loginId === expectedLoginId)) {
      resolveCompletion(earlyCompletion);
    }
    await shell.openExternal(started.authUrl);
    const timeoutMs = 5 * 60 * 1000;
    let timer;
    const result = await Promise.race([
      completion,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("登录等待超时，请重试。")), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    if (!result?.success) throw new Error(result?.error || "Codex 官方登录失败。");
    return accountSnapshot(server);
  } finally {
    server.off("notification", onNotification);
    if (expectedLoginId) {
      server.request("account/login/cancel", { loginId: expectedLoginId }, 5000).catch(() => {});
    }
    server.stop();
  }
}

function createWindow(providerId = null, projectRoot = null, threadId = null, projectId = null, workspace = null) {
  const window = new BrowserWindow({
    width: Number(process.env.CODEX_DECK_QA_WIDTH || 1380),
    height: Number(process.env.CODEX_DECK_QA_HEIGHT || 900),
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#f5f6f7",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#f5f6f7", symbolColor: "#1d2329", height: 42 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const webContentsId = window.webContents.id;
  window.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: {
      ...(providerId ? { provider: providerId } : {}),
      ...(projectRoot ? { project: projectRoot } : {}),
      ...(projectId ? { projectId } : {}),
      ...(workspace ? { workspace } : {}),
      ...(threadId ? { thread: threadId } : {}),
    },
  });
  if (process.env.CODEX_DECK_QA_SCREENSHOT) {
    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) console.error(`[renderer:${level}] ${message}`);
    });
    window.webContents.once("did-finish-load", () => {
      if (process.env.CODEX_DECK_QA_SCENARIO === "request-user-input") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.send("codex:approval", {
            id: "qa-request-user-input",
            method: "item/tool/requestUserInput",
            params: {
              questions: [
                {
                  id: "mode",
                  header: "运行模式",
                  question: "选择一种运行模式",
                  isOther: true,
                  isSecret: false,
                  options: [
                    { label: "安全", description: "只读检查" },
                    { label: "完整", description: "执行完整流程" },
                  ],
                },
                { id: "note", header: "备注", question: "补充说明", isOther: false, isSecret: true, options: null },
              ],
              autoResolutionMs: null,
            },
          });
        }, 1800);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "mcp-form") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.send("codex:approval", {
            id: "qa-mcp-form",
            method: "mcpServer/elicitation/request",
            params: {
              serverName: "QA MCP",
              mode: "form",
              message: "填写测试参数",
              requestedSchema: {
                type: "object",
                required: ["name", "count"],
                properties: {
                  name: { type: "string", title: "名称" },
                  count: { type: "integer", title: "数量", minimum: 1, maximum: 10 },
                  enabled: { type: "boolean", title: "启用", default: true },
                  color: { type: "string", title: "颜色", enum: ["red", "green"] },
                  tags: { type: "array", title: "标签", items: { type: "string", enum: ["a", "b", "c"] } },
                },
              },
              _meta: null,
            },
          });
        }, 1800);
      }
      if (["view-archived", "view-removed"].includes(process.env.CODEX_DECK_QA_SCENARIO)) {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          const view = process.env.CODEX_DECK_QA_SCENARIO === "view-archived" ? "archived" : "removed";
          window.webContents.executeJavaScript(`(async () => {
            document.querySelector('[data-thread-view="${view}"]').click();
            await new Promise((resolve) => setTimeout(resolve, 150));
            document.querySelector('.thread-item')?.click();
            await new Promise((resolve) => setTimeout(resolve, 2200));
          })()`).catch((error) => console.error(`[qa:${view}] ${error.message}`));
        }, 1800);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "open-recorded-niubi") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`(async () => {
            const target = [...document.querySelectorAll('.thread-item')].find((item) => item.querySelector('small')?.textContent.startsWith('niubi'));
            if (!target) throw new Error('No Niubi-recorded thread found.');
            target.click();
            await new Promise((resolve) => setTimeout(resolve, 3000));
          })()`).catch((error) => console.error(`[qa:open-recorded-niubi] ${error.message}`));
        }, 1800);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "account-panel") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`document.querySelector('#provider-switch').click()`)
            .catch((error) => console.error(`[qa:account-panel] ${error.message}`));
        }, 3500);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "rename-dialog") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`(() => {
            const more = document.querySelector('.thread-item .thread-more');
            if (!more) throw new Error('No thread available for rename dialog QA.');
            more.click();
            document.querySelector('#thread-menu [data-action="rename"]').click();
          })()`)
            .catch((error) => console.error(`[qa:rename-dialog] ${error.message}`));
        }, 3500);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "claude-model-fallback") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`document.querySelector('[data-provider="claude"]').click()`)
            .catch((error) => console.error(`[qa:claude-model-fallback] ${error.message}`));
        }, 1800);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "relay-form") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`(async () => {
            try {
              document.querySelector('#add-connection-button').click();
              const form = document.querySelector('#relay-form');
              form.elements.label.value = 'QA Relay Form';
              form.elements.baseUrl.value = 'https://relay.example/v1';
              form.elements.model.value = 'gpt-test';
              form.elements.apiKey.value = 'share-master-relay-qa-key';
              form.requestSubmit();
              const started = Date.now();
              while (Date.now() - started < 10000) {
                const option = [...document.querySelectorAll('.provider-option strong')]
                  .find((node) => node.textContent === 'QA Relay Form');
                const error = document.querySelector('#connection-error').textContent.trim();
                if (option && !error) {
                  const providerOption = option.closest('.provider-option');
                  const providerId = providerOption.dataset.provider;
                  const formReset = [...form.querySelectorAll('input')].every((input) => !input.value);
                  window.confirm = () => true;
                  document.querySelector('[data-provider-row="' + CSS.escape(providerId) + '"] .provider-delete').click();
                  while (Date.now() - started < 10000) {
                    if (!document.querySelector('[data-provider-row="' + CSS.escape(providerId) + '"]')) {
                      window.__relayFormQa = {
                        providerId,
                        providerAdded: true,
                        formReset,
                        providerDeleted: true,
                        error: null
                      };
                      return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100));
                  }
                  window.__relayFormQa = {
                    fatal: 'Timed out waiting for relay deletion.'
                  };
                  return;
                }
                if (error) throw new Error(error);
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              throw new Error('Timed out waiting for relay form submission.');
            } catch (error) {
              window.__relayFormQa = { fatal: error.message };
            }
          })()`).catch((error) => console.error(`[qa:relay-form] ${error.message}`));
        }, 1800);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "model-settings") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`(async () => {
            const waitUntil = async (predicate, timeout = 10000) => {
              const started = Date.now();
              while (Date.now() - started < timeout) {
                if (predicate()) return;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              throw new Error('Timed out waiting for renderer state.');
            };
            try {
              const firstThread = document.querySelector('.thread-item');
              if (!firstThread) throw new Error('No thread available for model settings QA.');
              const title = firstThread.querySelector('strong').textContent;
              firstThread.click();
              await waitUntil(() => (
                document.querySelector('.thread-item.active')?.querySelector('strong')?.textContent === title
                && !document.querySelector('#session-model').disabled
                && !document.querySelector('#chat-view').classList.contains('hidden')
              ));
              await new Promise((resolve) => setTimeout(resolve, 800));
              const model = document.querySelector('#session-model');
              const effort = document.querySelector('#session-effort');
              const alternative = [...model.options].find((option) => option.value !== model.value);
              if (!alternative) throw new Error('No alternative model is available.');
              model.value = alternative.value;
              model.dispatchEvent(new Event('change', { bubbles: true }));
              const preferredEffort = [...effort.options].find((option) => option.value === 'high')
                || [...effort.options].find((option) => option.value !== effort.value);
              if (preferredEffort) {
                effort.value = preferredEffort.value;
                effort.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const autoApproval = document.querySelector('[data-approval-mode="auto"]');
              document.querySelector('#mode-badge').click();
              autoApproval.click();
              const expected = { model: model.value, effort: effort.value, approvalMode: 'auto' };
              await new Promise((resolve) => setTimeout(resolve, 900));
              document.querySelector('#new-chat-button').click();
              await waitUntil(() => document.querySelector('#chat-view').classList.contains('hidden'));
              const target = [...document.querySelectorAll('.thread-item')]
                .find((item) => item.querySelector('strong')?.textContent === title);
              if (!target) throw new Error('The selected thread disappeared.');
              target.click();
              await waitUntil(() => (
                document.querySelector('.thread-item.active')?.querySelector('strong')?.textContent === title
                && model.value === expected.model
                && effort.value === expected.effort
                && autoApproval.classList.contains('active')
              ));
              await new Promise((resolve) => setTimeout(resolve, 1200));
              if (model.value !== expected.model || effort.value !== expected.effort || !autoApproval.classList.contains('active')) {
                throw new Error('Session settings changed again after restoration.');
              }
              document.querySelector('#mode-badge').click();
              const composer = document.querySelector('.composer');
              window.__modelSettingsQa = {
                expected,
                restored: { model: model.value, effort: effort.value, approvalMode: 'auto' },
                applied: document.querySelector('#applied-settings').textContent,
                approvalMenuVisible: !document.querySelector('#approval-mode-menu').classList.contains('hidden'),
                modeVisible: document.querySelector('#mode-badge').offsetParent !== null,
                composerOverflow: composer.scrollWidth > composer.clientWidth,
                title: document.querySelector('#window-thread-title').textContent,
                error: null
              };
            } catch (error) {
              window.__modelSettingsQa = { fatal: error.message };
            }
          })()`).catch((error) => console.error(`[qa:model-settings] ${error.message}`));
        }, 3000);
      }
      if (process.env.CODEX_DECK_QA_SCENARIO === "thread-actions") {
        setTimeout(() => {
          if (window.isDestroyed() || window.webContents.isDestroyed()) return;
          window.webContents.executeJavaScript(`(async () => {
            const waitUntil = async (predicate, timeout = 10000) => {
              const started = Date.now();
              while (Date.now() - started < timeout) {
                if (predicate()) return;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              throw new Error('Timed out waiting for renderer state.');
            };
            const count = (id) => Number(document.querySelector(id).textContent);
            try {
              await waitUntil(() => document.querySelector('.thread-item'));
              const target = [...document.querySelectorAll('.thread-item')].at(-1);
              const threadId = target.dataset.threadId;
              const title = target.querySelector('strong').textContent;
              const before = {
                active: count('#active-thread-count'),
                removed: count('#removed-thread-count')
              };
              window.confirm = () => true;
              target.querySelector('.thread-more').click();
              document.querySelector('#thread-menu [data-action="remove"]').click();
              await waitUntil(() => (
                count('#active-thread-count') === before.active - 1
                && count('#removed-thread-count') === before.removed + 1
              ));
              document.querySelector('[data-thread-view="removed"]').click();
              await waitUntil(() => document.querySelector('.thread-item[data-thread-id="' + CSS.escape(threadId) + '"]'));
              const removedTarget = document.querySelector('.thread-item[data-thread-id="' + CSS.escape(threadId) + '"]');
              removedTarget.querySelector('.thread-more').click();
              document.querySelector('#thread-menu [data-action="restore"]').click();
              await waitUntil(() => (
                count('#active-thread-count') === before.active
                && count('#removed-thread-count') === before.removed
              ));
              document.querySelector('[data-thread-view="active"]').click();
              await waitUntil(() => document.querySelector('.thread-item[data-thread-id="' + CSS.escape(threadId) + '"]'));
              const activeTarget = document.querySelector('.thread-item[data-thread-id="' + CSS.escape(threadId) + '"]');
              activeTarget.querySelector('.thread-more').click();
              document.querySelector('#thread-menu [data-action="remove"]').click();
              await waitUntil(() => (
                count('#active-thread-count') === before.active - 1
                && count('#removed-thread-count') === before.removed + 1
              ));
              document.querySelector('[data-thread-view="removed"]').click();
              await waitUntil(() => document.querySelector('.thread-item[data-thread-id="' + CSS.escape(threadId) + '"]'));
              const pendingTarget = document.querySelector('.thread-item[data-thread-id="' + CSS.escape(threadId) + '"]');
              pendingTarget.querySelector('.thread-more').click();
              document.querySelector('#thread-menu [data-action="delete-now"]').click();
              await waitUntil(() => (
                count('#active-thread-count') === before.active - 1
                && count('#removed-thread-count') === before.removed
              ));
              window.__threadActionsQa = {
                threadId,
                title,
                before,
                after: {
                  active: count('#active-thread-count'),
                  removed: count('#removed-thread-count')
                },
                restored: true,
                immediateDeleted: true
              };
            } catch (error) {
              window.__threadActionsQa = { fatal: error.message };
            }
          })()`).catch((error) => console.error(`[qa:thread-actions] ${error.message}`));
        }, 3000);
      }
      setTimeout(async () => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return;
        try {
          window.show();
          if (window.isMinimized()) window.restore();
          window.focus();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const image = await window.webContents.capturePage();
          const png = image.toPNG();
          if (!png.length) throw new Error("capturePage returned an empty image.");
          fs.writeFileSync(process.env.CODEX_DECK_QA_SCREENSHOT, png);
          const summary = await window.webContents.executeJavaScript(`({
            title: document.title,
            text: document.body.innerText.slice(0, 800),
            width: innerWidth,
            height: innerHeight,
            images: [...document.querySelectorAll('#chat-view img')].map((node) => ({ complete: node.complete, naturalWidth: node.naturalWidth, alt: node.alt })),
            view: {
              selected: document.querySelector('[data-thread-view].active')?.dataset.threadView || null,
              title: document.querySelector('#window-thread-title').textContent,
              chatHidden: document.querySelector('#chat-view').classList.contains('hidden'),
              composerDisabled: document.querySelector('#composer-input').disabled
            },
            provider: {
              name: document.querySelector('#provider-name').textContent,
              state: document.querySelector('#provider-state').textContent
            },
            recordHome: state.recordHome,
            approval: {
              hidden: document.querySelector('#approval-banner').classList.contains('hidden'),
              text: document.querySelector('#approval-banner').innerText,
              inputs: [...document.querySelectorAll('#approval-banner input, #approval-banner select')].map((node) => ({ type: node.type, name: node.name, required: node.required }))
            },
            claudeConfig: {
              visible: !document.querySelector('#claude-overlay').classList.contains('hidden'),
              status: document.querySelector('#claude-model-status').textContent,
              optionCount: document.querySelector('#claude-model').options.length,
              selectedModel: document.querySelector('#claude-model').value
            },
            relayForm: window.__relayFormQa || null,
            modelSettings: window.__modelSettingsQa || null,
            threadActions: window.__threadActionsQa || null
          })`);
          summary.windowCount = BrowserWindow.getAllWindows().length;
          console.log(JSON.stringify(summary));
        } catch (error) {
          console.error(`[qa] ${error.message}`);
        } finally {
          app.quit();
        }
      }, Number(process.env.CODEX_DECK_QA_DELAY || 3500));
    });
  }
  window.on("closed", () => {
    const server = servers.get(webContentsId);
    if (server) {
      failScheduledTasksForServer(server, "任务窗口已关闭。");
      server.stop();
    }
    servers.delete(webContentsId);
    connectionAttempts.delete(webContentsId);
    nextConnectionGeneration(webContentsId);
  });
  return window;
}

function waitForQa(predicate, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const value = await predicate();
        if (value) return resolve(value);
      } catch {}
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error(`QA condition timed out after ${timeoutMs} ms.`));
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function waitForQaStep(label, predicate, timeoutMs = 15000) {
  try {
    return await waitForQa(predicate, timeoutMs);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

async function captureQaWindow(window, outputDirectory, filename) {
  if (!outputDirectory) return null;
  fs.mkdirSync(outputDirectory, { recursive: true });
  window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const image = await window.webContents.capturePage();
  const buffer = image.toPNG();
  if (!buffer.length) throw new Error(`QA screenshot ${filename} was empty.`);
  const target = path.join(outputDirectory, filename);
  fs.writeFileSync(target, buffer);
  return target;
}

async function rendererWindowSummary(window) {
  return window.webContents.executeJavaScript(`({
    providerName: document.querySelector('#provider-name').textContent,
    providerBrand: document.querySelector('#provider-mark img')?.alt || null,
    providerState: document.querySelector('#provider-state').textContent,
    connection: document.querySelector('#connection-badge').textContent.trim(),
    threadCount: Number(document.querySelector('#active-thread-count').textContent || 0),
    overlayHidden: document.querySelector('#provider-overlay').classList.contains('hidden'),
    credentialVisible: !document.querySelector('#credential-overlay').classList.contains('hidden'),
    claudeConfigVisible: !document.querySelector('#claude-overlay').classList.contains('hidden'),
    recordHomeVisible: !document.querySelector('#record-home-overlay').classList.contains('hidden'),
    projectConfigVisible: !document.querySelector('#project-overlay').classList.contains('hidden'),
    closeProviderHidden: document.querySelector('#close-provider-button').classList.contains('hidden'),
    providerError: document.querySelector('#provider-error').textContent.trim(),
    modelOptionCount: document.querySelector('#session-model').options.length,
    selectedModel: document.querySelector('#session-model').value,
    selectedEffort: document.querySelector('#session-effort').value,
    modelDisabled: document.querySelector('#session-model').disabled
  })`);
}

async function runMultiProviderWindowQa(firstWindow) {
  const outputDirectory = process.env.CODEX_DECK_QA_OUTPUT_DIR;
  try {
    await waitForQaStep("first window official connection", async () => {
      if (servers.get(firstWindow.webContents.id)?.provider.id !== "official") return false;
      const summary = await rendererWindowSummary(firstWindow);
      return summary.connection.includes("已连接") && summary.overlayHidden;
    }, 30000);
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#provider-switch').click()`);
    await waitForQaStep("provider chooser can be opened", async () => {
      const summary = await rendererWindowSummary(firstWindow);
      return !summary.overlayHidden && !summary.closeProviderHidden;
    });
    await captureQaWindow(firstWindow, outputDirectory, "provider-connections.png");
    await firstWindow.webContents.executeJavaScript(`document.querySelector('[data-provider="claude"]').click()`);
    await waitForQaStep("Claude configuration can be opened", async () => (await rendererWindowSummary(firstWindow)).claudeConfigVisible);
    await captureQaWindow(firstWindow, outputDirectory, "claude-config.png");
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#claude-close-button').click()`);
    await waitForQaStep("Claude configuration can return", async () => {
      const summary = await rendererWindowSummary(firstWindow);
      return !summary.claudeConfigVisible && !summary.overlayHidden;
    });
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#record-home-button').click()`);
    await waitForQaStep("record home configuration can be opened", async () => (await rendererWindowSummary(firstWindow)).recordHomeVisible);
    await captureQaWindow(firstWindow, outputDirectory, "record-home.png");
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#record-home-close-button').click()`);
    await waitForQaStep("record home configuration can return", async () => {
      const summary = await rendererWindowSummary(firstWindow);
      return !summary.recordHomeVisible && !summary.overlayHidden;
    });
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#close-provider-button').click()`);
    await waitForQaStep("provider chooser can return", async () => (await rendererWindowSummary(firstWindow)).overlayHidden);
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#add-project-button').click()`);
    await waitForQaStep("rootless project dialog can be opened", async () => {
      const summary = await rendererWindowSummary(firstWindow);
      return summary.projectConfigVisible;
    });
    const projectDialog = await firstWindow.webContents.executeJavaScript(`({
      nameRequired: document.querySelector('#project-name-input').required,
      rootRequired: document.querySelector('#project-root-input').required,
      rootValue: document.querySelector('#project-root-input').value,
      note: document.querySelector('#project-form .form-note').textContent
    })`);
    if (!projectDialog.nameRequired || projectDialog.rootRequired || projectDialog.rootValue) {
      throw new Error("Rootless Project dialog fields are invalid.");
    }
    await captureQaWindow(firstWindow, outputDirectory, "project-create.png");
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#project-close-button').click()`);
    await waitForQaStep("rootless project dialog can return", async () => !(await rendererWindowSummary(firstWindow)).projectConfigVisible);
    await firstWindow.webContents.executeJavaScript(`document.querySelector('#new-window-button').click()`);
    const secondWindow = await waitForQaStep("second window creation", () => BrowserWindow.getAllWindows().find((item) => item !== firstWindow));
    await waitForQaStep("second window inherited official", async () => {
      if (servers.get(secondWindow.webContents.id)?.provider.id !== "official") return false;
      const summary = await rendererWindowSummary(secondWindow);
      return summary.connection.includes("已连接") && summary.overlayHidden;
    }, 30000);

    await secondWindow.webContents.executeJavaScript(`document.querySelector('[data-provider="hexuan"]').click()`);
    await waitForQaStep("second window switched to hexuan", () => servers.get(secondWindow.webContents.id)?.provider.id === "hexuan");
    await waitForQaStep("all renderer windows ready", async () => {
      const summaries = await Promise.all([firstWindow, secondWindow].map(rendererWindowSummary));
      return summaries.every((summary) => summary.connection.includes("已连接") && summary.threadCount > 0);
    }, 30000);

    await firstWindow.webContents.executeJavaScript(`document.querySelector('#new-window-button').click()`);
    const unavailableWindow = await waitForQaStep("unavailable provider window creation", () => BrowserWindow.getAllWindows().find((item) => item !== firstWindow && item !== secondWindow));
    await waitForQaStep("unavailable provider window inherited official", async () => {
      const summary = await rendererWindowSummary(unavailableWindow);
      return servers.get(unavailableWindow.webContents.id)?.provider.id === "official" && summary.connection.includes("已连接");
    }, 30000);
    await unavailableWindow.webContents.executeJavaScript(`document.querySelector('[data-provider="niubi"]').click()`);
    const unavailableSummary = await waitForQaStep("missing NIUBI key is reported", async () => {
      const summary = await rendererWindowSummary(unavailableWindow);
      return summary.providerError.includes("NIUBI_API_KEY")
        && summary.credentialVisible
        && summary.connection.includes("未连接")
        ? summary
        : false;
    });
    unavailableWindow.close();
    await waitForQaStep("unavailable provider window closed", () => BrowserWindow.getAllWindows().length === 2);

    const windows = [firstWindow, secondWindow];
    const summaries = await Promise.all(windows.map(rendererWindowSummary));
    if (outputDirectory) {
      for (let index = 0; index < windows.length; index += 1) {
        await captureQaWindow(windows[index], outputDirectory, `multi-window-${index + 1}.png`);
      }
    }
    console.log(JSON.stringify({
      ok: true,
      windowCount: windows.length,
      serverCount: servers.size,
      providerReturn: true,
      claudeConfigurationReturn: true,
      recordHomeReturn: true,
      projectConfigurationReturn: true,
      unavailableProviderError: unavailableSummary.providerError,
      unavailableCredentialVisible: unavailableSummary.credentialVisible,
      unavailableConnection: unavailableSummary.connection,
      internalProviders: windows.map((window) => servers.get(window.webContents.id)?.provider.id || null),
      windows: summaries,
    }));
  } catch (error) {
    console.error(`[qa:multi-provider-windows] ${error.stack || error.message}`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
}

function serverFor(event) {
  const server = servers.get(event.sender.id);
  if (!server?.ready) throw new Error("请先在 Share Master 中选择连接。");
  return server;
}

function publicStoreSnapshot() {
  const metadata = providerStore.metadata();
  return {
    providers: providerStore.list(),
    projects: metadata.projects.map(({ id, label, root, createdAt }) => ({
      id,
      label,
      root: typeof root === "string" && root ? root : null,
      createdAt,
    })),
    projectThreads: { ...metadata.projectThreads },
    hiddenProjectRoots: [...metadata.hiddenProjectRoots],
    threadSettings: { ...metadata.threadSettings },
    threadAliases: { ...metadata.threadAliases },
    hiddenThreadIds: [...metadata.hiddenThreads],
    deletedThreadIds: [...metadata.deletedThreads],
    localArchivedThreadIds: [...metadata.localArchivedThreads],
    pendingDeletions: metadata.pendingDeletions.map((entry) => ({ ...entry })),
    scheduledTasks: metadata.scheduledTasks.map((task) => ({ ...task })),
    runningTaskIds: [...runningScheduledTasks],
    recordHome: metadata.conversationHome,
  };
}

function broadcastStoreSnapshot() {
  const snapshot = publicStoreSnapshot();
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    try {
      window.webContents.send("app:store-changed", snapshot);
    } catch (error) {
      if (!window.isDestroyed()) console.error(`[ipc:app:store-changed] ${error.message}`);
    }
  }
}

function broadcastThreadDeleted(threadId) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    try {
      window.webContents.send("codex:event", {
        method: "thread/deleted",
        params: { threadId },
      });
    } catch (error) {
      if (!window.isDestroyed()) console.error(`[ipc:thread-deleted] ${error.message}`);
    }
  }
}

async function runDueScheduledTasks() {
  if (!providerStore) return;
  for (const task of providerStore.dueScheduledTasks()) {
    if (runningScheduledTasks.has(task.id)) continue;
    const candidates = [...servers.values()].filter((server) => server.ready);
    const server = task.providerId
      ? candidates.find((item) => item.provider.id === task.providerId)
      : candidates[0];
    if (!server) continue;
    runningScheduledTasks.add(task.id);
    let threadId = null;
    try {
      await executeScheduledTask(
        task,
        server,
        providerStore,
        crypto.randomUUID(),
        (createdThreadId) => {
          threadId = createdThreadId;
          scheduledTaskRuns.set(createdThreadId, { taskId: task.id, server });
        },
      );
      broadcastStoreSnapshot();
    } catch (error) {
      if (threadId) scheduledTaskRuns.delete(threadId);
      runningScheduledTasks.delete(task.id);
      providerStore.failScheduledTask(task.id, error);
      broadcastStoreSnapshot();
      console.error(`[scheduled-task:${task.id}] ${error.message}`);
    }
  }
}

function handleScheduledTaskNotification(server, message) {
  if (message?.method !== "turn/completed") return;
  const threadId = message.params?.threadId;
  const run = threadId ? scheduledTaskRuns.get(threadId) : null;
  if (!run || run.server !== server) return;
  try {
    finalizeScheduledTask(run.taskId, threadId, message.params?.turn, providerStore);
  } catch (error) {
    console.error(`[scheduled-task:${run.taskId}] 无法保存任务结果：${error.message}`);
  } finally {
    scheduledTaskRuns.delete(threadId);
    runningScheduledTasks.delete(run.taskId);
    broadcastStoreSnapshot();
  }
}

function failScheduledTasksForServer(server, reason) {
  let changed = false;
  for (const [threadId, run] of scheduledTaskRuns) {
    if (run.server !== server) continue;
    try {
      providerStore.failScheduledTask(run.taskId, reason);
    } catch (error) {
      console.error(`[scheduled-task:${run.taskId}] 无法保存任务失败状态：${error.message}`);
    } finally {
      scheduledTaskRuns.delete(threadId);
      runningScheduledTasks.delete(run.taskId);
      changed = true;
    }
  }
  if (changed) broadcastStoreSnapshot();
}

function ensureScheduledTaskIdle(taskId) {
  const id = String(taskId || "").trim();
  if (id && runningScheduledTasks.has(id)) {
    throw new Error("任务正在执行，请等待本次运行结束。");
  }
}

async function runConversationMirror() {
  const source = providerStore?.conversationMirrorSource();
  if (!source) return null;
  if (conversationMirrorSync) return conversationMirrorSync;
  conversationMirrorSync = syncConversationMirror(source, providerStore.conversationHome());
  try {
    const result = await conversationMirrorSync;
    if (result.copied || result.updated) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
        window.webContents.send("codex:event", {
          method: "conversation/mirror/updated",
          params: result,
        });
      }
    }
    return result;
  } finally {
    conversationMirrorSync = null;
  }
}

if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!hasSingleInstanceLock) return;
  app.whenReady().then(() => createWindow());
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  providerStore = new ProviderStore();
  const configuredSkillSources = String(process.env.SHARE_MASTER_SKILL_SOURCES || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const skillSources = configuredSkillSources.length
    ? configuredSkillSources
    : [
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".codex", "skills"),
    ];
  if (skillSources.length) {
    try {
      const result = await syncSkillRoots(
        skillSources,
        path.join(providerStore.conversationHome(), "skills"),
      );
      console.log(`[skills] copied ${result.copied} private skill directories`);
    } catch (error) {
      console.error(`[skills] ${error.message}`);
    }
  }
  if (process.env.SHARE_MASTER_MIRROR_SOURCE) {
    providerStore.setConversationMirrorSource(process.env.SHARE_MASTER_MIRROR_SOURCE);
  }
  const scheduledTaskTimer = setInterval(() => {
    runDueScheduledTasks().catch((error) => console.error(`[scheduled-task] ${error.message}`));
  }, 30000);
  scheduledTaskTimer.unref?.();
  if (process.env.CODEX_DECK_QA_CLAUDE_TOKEN && process.env.SHARE_MASTER_STORE_ROOT) {
    providerStore.saveProviderKey("claude", process.env.CODEX_DECK_QA_CLAUDE_TOKEN);
    providerStore.saveClaudeSettings({
      vendorLabel: "Hexuan",
      baseUrl: "https://ai.hexuan.cc/v1",
      model: "fable",
    });
  }
  ipcMain.handle("app:bootstrap", async () => ({
    codexHome: providerStore.conversationHome(),
    ...publicStoreSnapshot(),
  }));

  ipcMain.handle("window:new", (_event, payload = {}) => {
    createWindow(
      payload.provider || null,
      payload.projectRoot || null,
      null,
      payload.projectId || null,
      payload.workspace || null,
    );
    return true;
  });

  ipcMain.handle("dialog:workspace", async (event, currentPath) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      title: "Choose working directory",
      defaultPath: currentPath || "F:\\codepro",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("dialog:record-home", async (event, currentPath) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      title: "选择聊天记录存放目录",
      defaultPath: currentPath || providerStore.conversationHome(),
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("provider:add-relay", (_event, input) => {
    const provider = providerStore.addRelay(input);
    broadcastStoreSnapshot();
    return provider;
  });
  ipcMain.handle("provider:add-account", (_event, input) => {
    const provider = providerStore.addAccount(input);
    broadcastStoreSnapshot();
    return provider;
  });
  ipcMain.handle("provider:remove", (_event, providerId) => {
    const removed = providerStore.removeConnection(providerId);
    for (const [webContentsId, server] of servers) {
      if (server.provider.id !== removed.id) continue;
      failScheduledTasksForServer(server, "任务使用的连接已删除。");
      server.stop();
      servers.delete(webContentsId);
      nextConnectionGeneration(webContentsId);
      const owner = BrowserWindow.getAllWindows()
        .find((window) => !window.isDestroyed() && window.webContents.id === webContentsId);
      if (owner && !owner.webContents.isDestroyed()) {
        owner.webContents.send("codex:disconnected", {
          code: null,
          reason: "provider-removed",
          providerId: removed.id,
        });
      }
    }
    broadcastStoreSnapshot();
    return removed;
  });
  ipcMain.handle("provider:save-key", (_event, input) => {
    const provider = providerStore.saveProviderKey(input?.providerId, input?.apiKey);
    broadcastStoreSnapshot();
    return provider;
  });
  ipcMain.handle("provider:claude-models", async (_event, input) => {
    const provider = providerStore.resolve("claude");
    const apiKey = String(input?.apiKey || "").trim() || provider.env?.[provider.envKey];
    return fetchClaudeModelsSafely(input?.baseUrl || provider.baseUrl, apiKey, net.fetch);
  });
  ipcMain.handle("provider:configure-claude", (_event, input) => {
    if (String(input?.apiKey || "").trim()) providerStore.saveProviderKey("claude", input.apiKey);
    const provider = providerStore.saveClaudeSettings(input);
    broadcastStoreSnapshot();
    return provider;
  });
  ipcMain.handle("provider:balance", async (_event, providerId) => {
    const provider = providerStore.resolve(providerId);
    if (!["api", "relay"].includes(provider.type)) throw new Error("该连接没有中转余额。");
    const environment = await providerEnvironment();
    const apiKey = apiKeyForProvider(provider, environment);
    if (!apiKey) throw new Error(`${provider.envKey || "API Key"} 未配置，无法查询余额。`);
    return fetchRelayBalance(provider, apiKey, net.fetch);
  });
  ipcMain.handle("project:add", (_event, input) => {
    const project = providerStore.addProject(input);
    broadcastStoreSnapshot();
    return project;
  });
  ipcMain.handle("project:rename", (_event, input) => {
    const project = providerStore.renameProject(input?.projectId, input?.label);
    broadcastStoreSnapshot();
    return project;
  });
  ipcMain.handle("project:delete", (_event, input) => {
    const result = providerStore.deleteProject(input);
    broadcastStoreSnapshot();
    return result;
  });
  ipcMain.handle("project:assign-thread", (_event, input) => {
    const projectThreads = providerStore.assignThreadToProject(input?.threadId, input?.projectId);
    broadcastStoreSnapshot();
    return projectThreads;
  });
  ipcMain.handle("thread:save-settings", (_event, input) => {
    const threadSettings = providerStore.saveThreadSettings(
      input?.threadId,
      input?.providerId,
      { model: input?.model, effort: input?.effort, approvalMode: input?.approvalMode },
    );
    broadcastStoreSnapshot();
    return threadSettings;
  });
  ipcMain.handle("settings:set-record-home", (_event, directory) => {
    const recordHome = providerStore.setConversationHome(directory);
    broadcastStoreSnapshot();
    return recordHome;
  });
  ipcMain.handle("thread:hide", (_event, threadId) => {
    const hiddenThreadIds = providerStore.hideThread(threadId);
    broadcastStoreSnapshot();
    return hiddenThreadIds;
  });
  ipcMain.handle("thread:restore", (_event, threadId) => {
    const hiddenThreadIds = providerStore.restoreThread(threadId);
    broadcastStoreSnapshot();
    return hiddenThreadIds;
  });
  ipcMain.handle("thread:rename-local", (_event, input) => {
    const aliases = providerStore.renameThreadLocal(input?.threadId, input?.name);
    broadcastStoreSnapshot();
    return aliases;
  });
  ipcMain.handle("thread:archive-local", (_event, threadId) => {
    const archivedIds = providerStore.archiveThreadLocal(threadId);
    broadcastStoreSnapshot();
    return archivedIds;
  });
  ipcMain.handle("thread:unarchive-local", (_event, threadId) => {
    const archivedIds = providerStore.unarchiveThreadLocal(threadId);
    broadcastStoreSnapshot();
    return archivedIds;
  });
  ipcMain.handle("thread:delete-now", (_event, threadId) => {
    const deletedIds = providerStore.deleteThreadNow(threadId);
    broadcastStoreSnapshot();
    broadcastThreadDeleted(threadId);
    return deletedIds;
  });
  ipcMain.handle("task:save", (_event, input) => {
    ensureScheduledTaskIdle(input?.id);
    const task = providerStore.saveScheduledTask(input);
    broadcastStoreSnapshot();
    runDueScheduledTasks().catch((error) => console.error(`[scheduled-task] ${error.message}`));
    return task;
  });
  ipcMain.handle("task:remove", (_event, taskId) => {
    ensureScheduledTaskIdle(taskId);
    const task = providerStore.removeScheduledTask(taskId);
    broadcastStoreSnapshot();
    return task;
  });
  ipcMain.handle("task:set-enabled", (_event, input) => {
    ensureScheduledTaskIdle(input?.taskId);
    const task = providerStore.setScheduledTaskEnabled(input?.taskId, input?.enabled);
    broadcastStoreSnapshot();
    if (task.enabled) runDueScheduledTasks().catch((error) => console.error(`[scheduled-task] ${error.message}`));
    return task;
  });

  ipcMain.handle("auth:official-login", async (_event, providerId = "official") => {
    const provider = providerStore.resolve(providerId);
    if (!["official", "account"].includes(provider.type)) throw new Error("该连接不是 Codex 官方账号。");
    return loginOfficialAccount(provider);
  });

  ipcMain.handle("url:open", async (_event, target) => {
    let url;
    try {
      url = new URL(String(target || ""));
    } catch {
      throw new Error("无效的外部链接。");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅允许打开 HTTP 或 HTTPS 链接。");
    await shell.openExternal(url.toString());
    return true;
  });

  ipcMain.handle("codex:connect", async (event, providerId) => {
    const sender = event.sender;
    const senderId = sender.id;
    const pendingAttempt = connectionAttempts.get(senderId);
    if (pendingAttempt?.providerId === providerId) return pendingAttempt.promise;

    const task = (async () => {
      const generation = nextConnectionGeneration(senderId);
      const previous = servers.get(senderId);
      if (previous) {
        failScheduledTasksForServer(previous, "任务使用的连接已切换。");
        previous.stop();
      }
      servers.delete(senderId);
      let provider = providerStore.resolve(providerId);
      const environment = await providerEnvironment();
      const requiredEnvironmentKey = provider.envKey || null;
      if (requiredEnvironmentKey && !provider.env?.[requiredEnvironmentKey] && !environment[requiredEnvironmentKey]) {
        throw new Error(`${requiredEnvironmentKey} 未配置，无法连接 ${provider.label}。`);
      }
      let modelWarning = null;
      if (["api", "relay"].includes(provider.type)) {
        const apiKey = apiKeyForProvider(provider, environment);
        try {
          const models = await fetchOpenAIModels(provider.baseUrl, apiKey, net.fetch);
          provider = providerStore.withModelCatalog(provider, models);
        } catch (error) {
          modelWarning = error.message;
        }
      }
      const server = provider.engine === "claude"
        ? new ClaudeServer(provider)
        : new CodexServer(provider, environment);
      const requestIsCurrent = () => !sender.isDestroyed()
        && connectionGenerations.get(senderId) === generation;
      if (!requestIsCurrent()) {
        server.stop();
        return { superseded: true };
      }
      const isCurrent = () => requestIsCurrent()
        && servers.get(senderId) === server;
      const send = (channel, value) => {
        if (!isCurrent()) return;
        try {
          sender.send(channel, value);
        } catch (error) {
          if (!sender.isDestroyed()) console.error(`[ipc:${channel}] ${error.message}`);
        }
      };
      servers.set(senderId, server);
      server.on("notification", (message) => {
        handleScheduledTaskNotification(server, message);
        send("codex:event", message);
      });
      server.on("server-request", (message) => {
        if (!isCurrent()) return;
        if (message.method === "currentTime/read") {
          server.respond(message.id, { currentTimeAt: Math.floor(Date.now() / 1000) });
          return;
        }
        if (INTERACTIVE_SERVER_REQUESTS.has(message.method)) {
          send("codex:approval", message);
          return;
        }
        server.respondError(message.id, -32601, `Share Master does not support ${message.method}.`);
        send("codex:diagnostic", `已安全取消不支持的 Codex 请求：${message.method}`);
      });
      server.on("diagnostic", (message) => send("codex:diagnostic", message));
      server.on("exit", (code) => {
        failScheduledTasksForServer(server, `连接已断开（退出代码 ${code ?? "未知"}）。`);
        if (!isCurrent()) return;
        send("codex:disconnected", { code });
        servers.delete(senderId);
      });
      try {
        await server.start();
        if (provider.type === "claude") {
          try {
            await fetchClaudeModels(
              provider.baseUrl,
              provider.env?.[provider.envKey],
              net.fetch,
            );
          } catch (error) {
            if ([401, 403].includes(error.status)) {
              throw new Error(`Claude Token 无效或已失去权限：${error.message}`);
            }
          }
        }
        runDueScheduledTasks().catch((error) => console.error(`[scheduled-task] ${error.message}`));
      } catch (error) {
        const wasCurrentRequest = requestIsCurrent();
        if (servers.get(senderId) === server) servers.delete(senderId);
        server.stop();
        if (!wasCurrentRequest) return { superseded: true };
        throw error;
      }
      if (!isCurrent()) {
        server.stop();
        return { superseded: true };
      }
      const account = await accountSnapshot(server);
      const publicProvider = providerStore.publicProvider(providerId);
      return {
        provider: providerId,
        label: publicProvider.connectionLabel,
        brand: publicProvider.brand,
        vendorLabel: provider.vendorLabel || null,
        providerType: provider.type,
        modelProvider: provider.modelProvider,
        modelSource: provider.discoveredModels?.length ? "provider" : "configured",
        modelWarning,
        ...account,
      };
    })();

    const attempt = { providerId, promise: task };
    connectionAttempts.set(senderId, attempt);
    try {
      return await task;
    } finally {
      if (connectionAttempts.get(senderId) === attempt) connectionAttempts.delete(senderId);
    }
  });

  ipcMain.handle("codex:list", (event, query) => serverFor(event).listThreads(query?.search, Boolean(query?.archived)));
  ipcMain.handle("codex:models", async (event) => {
    const server = serverFor(event);
    if (server.provider.type !== "claude") {
      const response = await server.listModels();
      if (!["api", "relay"].includes(server.provider.type)) return response;
      return {
        ...response,
        data: (response.data || []).map((model) => {
          const profile = reasoningProfile(model.model || model.id);
          if (profile) return { ...model, reasoningCapabilitiesVerified: true };
          return {
            ...model,
            defaultReasoningEffort: null,
            supportedReasoningEfforts: [],
            reasoningCapabilitiesVerified: false,
          };
        }),
      };
    }
    const apiKey = server.provider.env?.[server.provider.envKey];
    const catalog = await fetchClaudeModelsSafely(server.provider.baseUrl, apiKey, net.fetch);
    const efforts = ["low", "medium", "high", "xhigh", "max"]
      .map((reasoningEffort) => ({ reasoningEffort, description: "" }));
    const seen = new Set();
    const data = [];
    for (const route of catalog.routes) {
      seen.add(route.id);
      data.push({
        id: route.id,
        model: route.id,
        displayName: route.label,
        description: `${route.id} → ${route.actualModel}`,
        isDefault: route.id === server.provider.model,
        defaultReasoningEffort: "high",
        supportedReasoningEfforts: efforts,
      });
    }
    for (const model of catalog.models) {
      if (seen.has(model.id)) continue;
      data.push({
        id: model.id,
        model: model.id,
        displayName: model.label,
        description: model.id,
        isDefault: model.id === server.provider.model,
        defaultReasoningEffort: "high",
        supportedReasoningEfforts: efforts,
      });
    }
    if (!data.length) {
      data.push({
        id: server.provider.model,
        model: server.provider.model,
        displayName: server.provider.model,
        description: "当前配置模型",
        isDefault: true,
        defaultReasoningEffort: "high",
        supportedReasoningEfforts: efforts,
      });
    }
    return { data, nextCursor: null, warning: catalog.warning, status: catalog.status };
  });
  ipcMain.handle("codex:skills", async (event, payload = {}) => {
    const server = serverFor(event);
    if (server.provider.engine === "claude") return { data: [], warning: "Claude 连接不使用 Codex Skills。" };
    return server.request("skills/list", {
      cwds: [payload.cwd || providerStore.conversationHome()],
      forceReload: Boolean(payload.forceReload),
    });
  });
  ipcMain.handle("codex:read", async (event, threadId) => (
    rendererThreadWindow(await serverFor(event).readThread(threadId))
  ));
  ipcMain.handle("codex:read-window", async (event, payload) => (
    rendererThreadWindow(
      await serverFor(event).readThread(payload?.threadId),
      payload?.turnCount,
    )
  ));
  ipcMain.handle("codex:account-status", (event) => accountSnapshot(serverFor(event)));
  ipcMain.handle("codex:resume", async (event, payload) => (
    rendererThreadWindow(await serverFor(event).resumeThread(
      payload.threadId,
      payload.cwd || null,
      payload.modelProvider || null,
      payload.model || null,
      { approvalMode: payload.approvalMode || "ask" },
    ))
  ));
  ipcMain.handle("codex:start-thread", (event, payload) => serverFor(event).startThread(
    payload?.cwd,
    payload?.model || null,
    { approvalMode: payload?.approvalMode || "ask" },
  ));
  ipcMain.handle("codex:start-turn", (event, payload) => serverFor(event).startTurn(
    payload.threadId,
    payload.text,
    payload.cwd,
    payload.clientUserMessageId,
    {
      model: payload.model || null,
      effort: payload.effort || null,
      approvalMode: payload.approvalMode || "ask",
      skillInputs: Array.isArray(payload.skillInputs) ? payload.skillInputs : [],
    },
  ));
  ipcMain.handle("codex:rename", (event, payload) => serverFor(event).renameThread(payload.threadId, payload.name));
  ipcMain.handle("codex:interrupt", (event, payload) => serverFor(event).request("turn/interrupt", payload));
  ipcMain.handle("codex:approval-response", (event, payload) => {
    serverFor(event).respond(payload.id, payload.result);
    return true;
  });

  const initialWindow = createWindow(
    process.env.SHARE_MASTER_OPEN_PROVIDER || process.env.CODEX_DECK_QA_PROVIDER || null,
    process.env.SHARE_MASTER_OPEN_PROJECT || process.env.CODEX_DECK_QA_PROJECT || null,
    process.env.SHARE_MASTER_OPEN_THREAD || process.env.CODEX_DECK_QA_THREAD || null,
    process.env.SHARE_MASTER_OPEN_PROJECT_ID || null,
  );
  if (providerStore.conversationMirrorSource()) {
    runConversationMirror().catch((error) => console.error(`[conversation-mirror] ${error.message}`));
    const mirrorTimer = setInterval(() => {
      runConversationMirror().catch((error) => console.error(`[conversation-mirror] ${error.message}`));
    }, 60000);
    mirrorTimer.unref?.();
  }
  if (process.env.CODEX_DECK_QA_MULTI_PROVIDER === "1") runMultiProviderWindowQa(initialWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const server of servers.values()) {
    failScheduledTasksForServer(server, "Share Master 已关闭。");
    server.stop();
  }
  if (process.platform !== "darwin") app.quit();
});
