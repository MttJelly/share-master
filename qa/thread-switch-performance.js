const assert = require("node:assert/strict");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const root = path.resolve(__dirname, "..");
app.setPath("userData", path.join(__dirname, ".thread-performance-profile"));

async function run() {
  await app.whenReady();
  let resumeCalls = 0;
  let readCalls = 0;
  let interruptCalls = 0;
  let startTurnCalls = 0;
  let notificationCalls = 0;
  ipcMain.handle("app:bootstrap", () => ({
    providers: [],
    projects: [],
    projectThreads: {},
    hiddenProjectRoots: [],
    threadSettings: {},
    hiddenThreadIds: [],
    pendingDeletions: [],
    scheduledTasks: [],
    runningTaskIds: [],
    recordHome: "",
  }));
  ipcMain.handle("extension:list", () => ({ skills: [], prompts: [], mcpServers: [] }));
  ipcMain.handle("codex:resume", (_event, input) => {
    resumeCalls += 1;
    return {
      thread: {
        id: input.threadId,
        name: "Resumed fixture",
        cwd: root,
        model: "gpt-fixture",
        turns: [{
          id: "resumed-turn",
          items: [{ id: "resumed-agent", type: "agentMessage", text: "Resumed once." }],
        }],
      },
    };
  });
  ipcMain.handle("codex:read", (_event, threadId) => {
    readCalls += 1;
    return {
      thread: {
        id: threadId,
        name: "Read-only fixture",
        cwd: root,
        model: "gpt-fixture",
        turns: [{
          id: "read-turn",
          items: [{ id: "read-agent", type: "agentMessage", text: "Read once." }],
        }],
      },
    };
  });
  ipcMain.handle("codex:interrupt", () => {
    interruptCalls += 1;
    return true;
  });
  ipcMain.handle("codex:start-turn", () => {
    startTurnCalls += 1;
    return { turn: { id: `queued-turn-${startTurnCalls}` } };
  });
  ipcMain.handle("thread:save-message-queue", (_event, input) => input.messages || []);
  ipcMain.handle("app:notify", () => {
    notificationCalls += 1;
    return true;
  });
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(root, "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  await window.loadFile(path.join(root, "src", "renderer", "index.html"));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const turns = Array.from({ length: 400 }, (_, index) => ({
      id: 'turn-' + index,
      items: [
        {
          id: 'user-' + index,
          type: 'userMessage',
          content: [{ type: 'text', text: 'Question ' + index + '\\n' + 'context '.repeat(30) }]
        },
        {
          id: 'command-' + index,
          type: 'commandExecution',
          command: 'rg --files fixture-' + index,
          status: 'completed',
          aggregatedOutput: 'fixture/output-' + index
        },
        {
          id: 'agent-' + index,
          type: 'agentMessage',
          text: '## Answer ' + index + '\\n\\n' + '- result\\n'.repeat(20) + '\\n\\\`\\\`\\\`js\\nconst value = ' + index + ';\\n\\\`\\\`\\\`'
        }
      ]
    }));
    const thread = { id: 'performance-thread', name: 'Performance fixture', turns };
    const started = performance.now();
    renderConversation(thread);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const firstRenderMs = performance.now() - started;
    const repeated = performance.now();
    renderConversation(thread);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const repeatedRenderMs = performance.now() - repeated;
    renderConversation({ ...thread, id: 'other-performance-thread', name: 'Other performance fixture' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cachedSwitch = performance.now();
    showCachedConversation(thread);
    renderConversation(thread);
    const cachedSwitchMs = performance.now() - cachedSwitch;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      firstRenderMs,
      repeatedRenderMs,
      cachedSwitchMs,
      messages: document.querySelectorAll('.message').length,
      activities: document.querySelectorAll('.activity-row').length,
      htmlBytes: document.querySelector('#chat-view').innerHTML.length,
      hasEarlierControl: Boolean(document.querySelector('.load-earlier-turns')),
      exposesCommand: document.querySelector('#chat-view').textContent.includes('rg --files'),
      exposesCommandOutput: document.querySelector('#chat-view').textContent.includes('fixture/output-')
    };
  })()`);
  assert.equal(result.messages, 80);
  assert.equal(result.activities, 40);
  assert.equal(result.hasEarlierControl, true);
  assert.equal(result.exposesCommand, false);
  assert.equal(result.exposesCommandOutput, false);
  assert.ok(result.firstRenderMs < 10000, `Synthetic conversation render took ${result.firstRenderMs.toFixed(1)} ms.`);
  assert.ok(
    result.repeatedRenderMs < result.firstRenderMs,
    `Cached render (${result.repeatedRenderMs.toFixed(1)} ms) was not faster than the first render (${result.firstRenderMs.toFixed(1)} ms).`,
  );
  assert.ok(
    result.cachedSwitchMs < result.firstRenderMs,
    `Cached A-B-A switch (${result.cachedSwitchMs.toFixed(1)} ms) was not faster than the first render (${result.firstRenderMs.toFixed(1)} ms).`,
  );
  const streaming = await window.webContents.executeJavaScript(`(async () => {
    state.activeThread = { id: 'stream-performance-thread', name: 'Stream performance' };
    state.renderedThreadId = state.activeThread.id;
    document.querySelector('#chat-view').replaceChildren();
    const started = performance.now();
    for (let index = 0; index < 1200; index += 1) {
      appendAgentMessageDelta('stream-agent-performance', 'token ');
      appendActivityDelta('stream-reasoning-performance', 'stream-turn', '思考过程', 'step ', 'brain', state.activeThread.id);
    }
    const dispatchMs = performance.now() - started;
    const pendingBeforeFlush = pendingAgentStreamRenders.size + pendingActivityStreamDeltas.size;
    await new Promise((resolve) => setTimeout(resolve, STREAM_RENDER_INTERVAL_MS * 3));
    return {
      dispatchMs,
      pendingBeforeFlush,
      pendingAfterFlush: pendingAgentStreamRenders.size + pendingActivityStreamDeltas.size,
      agentTextLength: document.querySelector('[data-message-id="stream-agent-performance"]')?.textContent.length || 0,
      reasoningTextLength: document.querySelector('[data-activity-id="stream-reasoning-performance"] .activity-output')?.textContent.length || 0,
    };
  })()`);
  assert.equal(streaming.pendingBeforeFlush, 2);
  assert.equal(streaming.pendingAfterFlush, 0);
  assert.ok(streaming.agentTextLength >= 7200);
  assert.ok(streaming.reasoningTextLength >= 6000);
  assert.ok(streaming.dispatchMs < 1000, `Batched stream dispatch took ${streaming.dispatchMs.toFixed(1)} ms.`);
  const protocol = await window.webContents.executeJavaScript(`(async () => {
    state.connected = true;
    state.provider = 'fixture';
    state.providerType = 'api';
    state.modelProvider = 'fixture';
    state.providers = [{ id: 'fixture', model: 'gpt-fixture' }];
    state.modelCatalog = [{
      id: 'gpt-fixture',
      model: 'gpt-fixture',
      displayName: 'GPT Fixture',
      supportedReasoningEfforts: ['low'],
      defaultReasoningEffort: 'low'
    }];
    document.querySelector('#session-model').replaceChildren(new Option('GPT Fixture', 'gpt-fixture'));
    const opening = openThread({ id: 'active-fixture', name: 'Active fixture', cwd: ${JSON.stringify(root)} });
    const loadingVisible = Boolean(document.querySelector('.conversation-loading'));
    await opening;
    state.threadView = 'archived';
    updateThreadViewControls();
    await openThread({ id: 'archived-fixture', name: 'Archived fixture', cwd: ${JSON.stringify(root)}, _archived: true });
    state.activeThread = { id: 'interrupt-fixture' };
    setThreadRunning('interrupt-fixture', true);
    requestTurnInterrupt();
    const interruptQueuedBeforeTurnId = state.stopRequested && document.querySelector('#stop-button').disabled;
    state.runningThreads.get('interrupt-fixture').turnId = 'turn-fixture';
    await flushPendingInterrupt('interrupt-fixture');
    setThreadRunning('interrupt-fixture', false);
    state.threadView = 'active';
    state.activeArchived = false;
    updateThreadViewControls();
    state.activeThread = { id: 'background-a', name: 'Background A', cwd: ${JSON.stringify(root)} };
    state.threadResumed = true;
    setThreadRunning('background-a', true, 'background-turn-1');
    const input = document.querySelector('#composer-input');
    input.value = 'queued follow-up';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sendMessage('queue');
    const queuedBeforeCompletion = (state.messageQueues.get('background-a') || []).length;
    const composerEnabledWhileRunning = !input.disabled;
    state.activeThread = { id: 'background-b', name: 'Background B', cwd: ${JSON.stringify(root)} };
    syncActiveRunState();
    const backgroundPreservedAfterSwitch = state.runningThreads.has('background-a');
    handleEvent({ method: 'turn/completed', params: { threadId: 'background-a', turn: { id: 'background-turn-1', status: 'completed' } } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const queuedTurnStarted = state.runningThreads.get('background-a')?.turnId === 'queued-turn-1';
    handleEvent({ method: 'turn/completed', params: { threadId: 'background-a', turn: { id: 'queued-turn-1', status: 'completed' } } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      activeThreadId: state.activeThread.id,
      openingThread: state.openingThread,
      composerDisabled: document.querySelector('#composer-input').disabled,
      composerHidden: getComputedStyle(document.querySelector('.composer-wrap')).display === 'none',
      loadingVisible,
      diagnosticActivities: document.querySelectorAll('#chat-view .activity-row').length,
      interruptQueuedBeforeTurnId,
      queuedBeforeCompletion,
      composerEnabledWhileRunning,
      backgroundPreservedAfterSwitch,
      queuedTurnStarted
    };
  })()`);
  assert.equal(resumeCalls, 1, "Active thread switching must call resume exactly once.");
  assert.equal(readCalls, 1, "Archived thread switching must call read exactly once.");
  assert.equal(protocol.activeThreadId, "background-b");
  assert.equal(protocol.openingThread, false);
  assert.equal(protocol.composerDisabled, false);
  assert.equal(protocol.composerHidden, false);
  assert.equal(protocol.loadingVisible, true);
  assert.equal(protocol.diagnosticActivities, 0);
  assert.equal(protocol.interruptQueuedBeforeTurnId, true);
  assert.equal(interruptCalls, 1);
  assert.equal(protocol.queuedBeforeCompletion, 1);
  assert.equal(protocol.composerEnabledWhileRunning, true);
  assert.equal(protocol.backgroundPreservedAfterSwitch, true);
  assert.equal(protocol.queuedTurnStarted, true);
  assert.equal(startTurnCalls, 1);
  assert.equal(notificationCalls, 1);
  console.log(JSON.stringify({ ok: true, ...result, streaming, resumeCalls, readCalls, interruptCalls, startTurnCalls, notificationCalls, protocol }));
  window.destroy();
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
