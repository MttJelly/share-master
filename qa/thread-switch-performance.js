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
    state.activeTurn = null;
    setRunning(true);
    requestTurnInterrupt();
    const interruptQueuedBeforeTurnId = state.stopRequested && document.querySelector('#stop-button').disabled;
    state.activeTurn = 'turn-fixture';
    await flushPendingInterrupt();
    setRunning(false);
    return {
      activeThreadId: state.activeThread.id,
      openingThread: state.openingThread,
      composerDisabled: document.querySelector('#composer-input').disabled,
      composerHidden: getComputedStyle(document.querySelector('.composer-wrap')).display === 'none',
      loadingVisible,
      diagnosticActivities: document.querySelectorAll('#chat-view .activity-row').length,
      interruptQueuedBeforeTurnId
    };
  })()`);
  assert.equal(resumeCalls, 1, "Active thread switching must call resume exactly once.");
  assert.equal(readCalls, 1, "Archived thread switching must call read exactly once.");
  assert.equal(protocol.activeThreadId, "interrupt-fixture");
  assert.equal(protocol.openingThread, false);
  assert.equal(protocol.composerDisabled, true);
  assert.equal(protocol.composerHidden, true);
  assert.equal(protocol.loadingVisible, true);
  assert.equal(protocol.diagnosticActivities, 0);
  assert.equal(protocol.interruptQueuedBeforeTurnId, true);
  assert.equal(interruptCalls, 1);
  console.log(JSON.stringify({ ok: true, ...result, resumeCalls, readCalls, interruptCalls, protocol }));
  window.destroy();
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
