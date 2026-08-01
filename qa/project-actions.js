const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const root = path.resolve(__dirname, "..");
const screenshot = path.join(__dirname, "multi-window-artifacts", "project-actions.png");
const scheduledScreenshot = path.join(__dirname, "multi-window-artifacts", "scheduled-tasks.png");
const taskDialogScreenshot = path.join(__dirname, "multi-window-artifacts", "scheduled-task-dialog.png");
const taskDialogCompactScreenshot = path.join(__dirname, "multi-window-artifacts", "scheduled-task-dialog-compact.png");
app.setPath("userData", path.join(__dirname, ".project-actions-profile"));

async function run() {
  await app.whenReady();
  const projects = [];
  const projectThreads = {};
  const scheduledTasks = [];
  const hiddenThreads = new Set();
  const deletedThreads = new Set();
  const localArchivedThreads = new Set();
  let addCalls = 0;
  let renameCalls = 0;
  let deleteCalls = 0;
  let taskSaveCalls = 0;
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
  const key = (value) => normalize(value).toLocaleLowerCase("zh-CN");

  ipcMain.handle("app:bootstrap", () => ({
    providers: [],
    projects: [],
    projectThreads: {},
    hiddenProjectRoots: [],
    threadSettings: {},
    threadAliases: {},
    hiddenThreadIds: [],
    deletedThreadIds: [],
    localArchivedThreadIds: [],
    pendingDeletions: [],
    scheduledTasks: [],
    runningTaskIds: [],
    recordHome: "",
  }));
  ipcMain.handle("project:add", (_event, input) => {
    addCalls += 1;
    const label = normalize(input?.label);
    if (projects.some((project) => key(project.label) === key(label))) throw new Error("Project 名称已存在。");
    const project = {
      id: `project-${projects.length + 1}`,
      label,
      root: null,
      createdAt: Date.now() + projects.length,
    };
    projects.push(project);
    return project;
  });
  ipcMain.handle("project:rename", (_event, input) => {
    renameCalls += 1;
    const project = projects.find((item) => item.id === input?.projectId);
    if (!project) throw new Error("Project 不存在。");
    const label = normalize(input?.label);
    if (projects.some((item) => item.id !== project.id && key(item.label) === key(label))) {
      throw new Error("Project 名称已存在。");
    }
    project.label = label;
    return { ...project };
  });
  ipcMain.handle("project:delete", (_event, input) => {
    deleteCalls += 1;
    const projectId = input?.projectId;
    if (!projectId && input?.roots?.length) {
      return { project: null, removedAssignments: 0, hiddenProjectRoots: input.roots };
    }
    const index = projects.findIndex((item) => item.id === projectId);
    if (index < 0) throw new Error("Project 不存在。");
    const [project] = projects.splice(index, 1);
    for (const [threadId, assignedProjectId] of Object.entries(projectThreads)) {
      if (assignedProjectId === project.id) delete projectThreads[threadId];
    }
    return { project, removedAssignments: 0, hiddenProjectRoots: input?.roots || [] };
  });
  ipcMain.handle("task:save", (_event, input) => {
    taskSaveCalls += 1;
    const task = {
      ...input,
      id: input?.id || `task-${scheduledTasks.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRunAt: null,
      lastThreadId: null,
      lastError: null,
      retryAt: null,
    };
    scheduledTasks.push(task);
    return task;
  });
  ipcMain.handle("task:set-enabled", (_event, input) => {
    const task = scheduledTasks.find((item) => item.id === input?.taskId);
    task.enabled = Boolean(input?.enabled);
    return { ...task };
  });
  ipcMain.handle("task:remove", (_event, taskId) => {
    const index = scheduledTasks.findIndex((item) => item.id === taskId);
    return scheduledTasks.splice(index, 1)[0];
  });
  ipcMain.handle("thread:hide", (_event, input) => {
    hiddenThreads.add(input.threadId);
    return {
      hiddenThreadIds: [...hiddenThreads],
      pendingDeletion: { threadId: input.threadId, expiresAt: Date.now() + 3600000 },
      pendingDeletions: [{ threadId: input.threadId, expiresAt: Date.now() + 3600000 }],
    };
  });
  ipcMain.handle("thread:restore", (_event, threadId) => {
    hiddenThreads.delete(threadId);
    return [...hiddenThreads];
  });
  ipcMain.handle("thread:delete-now", (_event, threadId) => {
    hiddenThreads.delete(threadId);
    deletedThreads.add(threadId);
    return [...deletedThreads];
  });
  ipcMain.handle("thread:archive-local", (_event, threadId) => {
    localArchivedThreads.add(threadId);
    return [...localArchivedThreads];
  });
  ipcMain.handle("thread:unarchive-local", (_event, threadId) => {
    localArchivedThreads.delete(threadId);
    return [...localArchivedThreads];
  });

  const window = new BrowserWindow({
    show: false,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(root, "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const rendererErrors = [];
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3) rendererErrors.push(message);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    rendererErrors.push(`Renderer exited: ${details.reason}`);
  });
  await window.loadFile(path.join(root, "src", "renderer", "index.html"));
  const summary = await window.webContents.executeJavaScript(`(async () => {
    const waitUntil = async (predicate, timeout = 5000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('Timed out waiting for Project UI.');
    };
    const createProject = async (label) => {
      document.querySelector('#add-project-button').click();
      document.querySelector('#project-name-input').value = label;
      document.querySelector('#project-form').requestSubmit();
      await waitUntil(() => document.querySelector('#project-overlay').classList.contains('hidden'));
    };
    window.confirm = () => true;
    await createProject('Old Project');
    await createProject('New Project');
    await createProject('Delete Project');
    state.projectThreads = { 'delete-thread': 'project-3' };
    document.querySelector('[data-project-id="project-3"] .project-delete').click();
    await waitUntil(() => !document.querySelector('[data-project-id="project-3"]'));
    const deletedProjectMapping = state.projectThreads['delete-thread'];
    const activeAfterDelete = state.activeProject;

    document.querySelector('[data-project-id="project-1"] .project-rename').click();
    const renameDialog = {
      title: document.querySelector('#project-title').textContent,
      rootHidden: document.querySelector('#project-root-input').closest('label').classList.contains('hidden'),
      submit: document.querySelector('#project-submit-label').textContent
    };
    document.querySelector('#project-name-input').value = 'Renamed Project';
    document.querySelector('#project-form').requestSubmit();
    await waitUntil(() => document.querySelector('#project-overlay').classList.contains('hidden'));

    document.querySelector('[data-project-id="project-1"] .project-rename').click();
    document.querySelector('#project-name-input').value = '  NEW   project  ';
    document.querySelector('#project-form').requestSubmit();
    await waitUntil(() => document.querySelector('#project-error').textContent.includes('已存在'));
    const duplicateError = document.querySelector('#project-error').textContent;
    document.querySelector('#project-close-button').click();

    state.projectThreads = { 'old-thread': 'project-1', 'new-thread': 'project-2' };
    state.activeThreads = [
      { id: 'old-thread', name: 'Old thread', recencyAt: 100 },
      { id: 'new-thread', name: 'New thread', recencyAt: 200 }
    ];
    state.archivedThreads = [];
    syncProjects();
    const newFirst = [...document.querySelectorAll('.project-row:not([data-project-id="all"]) .project-select strong')]
      .map((node) => node.textContent);
    state.activeThreads[0].recencyAt = 300;
    syncProjects();
    const oldFirst = [...document.querySelectorAll('.project-row:not([data-project-id="all"]) .project-select strong')]
      .map((node) => node.textContent);
    const orderingState = {
      savedProjects: state.savedProjects,
      projectThreads: state.projectThreads,
      activeThreads: state.activeThreads,
      allThreads: state.allThreads
    };
    state.savedProjects = [
      { id: 'rooted-project', label: 'Rooted Project', root: 'F:\\\\rooted-project', createdAt: 1 },
      { id: 'plain-project', label: 'Plain Project', root: null, createdAt: 1 }
    ];
    state.projectThreads = {
      'rooted-assigned-thread': 'rooted-project',
      'plain-assigned-thread': 'plain-project'
    };
    state.activeThreads = [
      { id: 'rooted-assigned-thread', name: 'Rooted assigned', cwd: 'F:\\\\other-workspace', recencyAt: 300 },
      { id: 'plain-assigned-thread', name: 'Plain assigned', cwd: 'F:\\\\plain-workspace', recencyAt: 200 }
    ];
    state.allThreads = state.activeThreads;
    syncProjects();
    const rootedProject = state.projects.find((project) => project.id === 'rooted-project');
    const rootedAssignment = {
      order: [...document.querySelectorAll('.project-row:not([data-project-id="all"]) .project-select strong')]
        .map((node) => node.textContent),
      count: document.querySelector('[data-project-id="rooted-project"] .project-count').textContent,
      belongs: threadBelongsToProject(state.activeThreads[0], rootedProject)
    };
    state.savedProjects = orderingState.savedProjects;
    state.projectThreads = orderingState.projectThreads;
    state.activeThreads = orderingState.activeThreads;
    state.allThreads = orderingState.allThreads;
    syncProjects();
    const deleteUiThread = { id: 'delete-ui-thread', name: 'Delete UI thread', recencyAt: 250 };
    state.activeThreads.push(deleteUiThread);
    state.activeProject = null;
    state.menuThread = deleteUiThread;
    await threadMenuAction('remove');
    setThreadView('removed');
    const removedBeforeImmediateDelete = state.threads.some((thread) => thread.id === deleteUiThread.id);
    state.menuThread = deleteUiThread;
    await threadMenuAction('delete-now');
    const immediateDelete = {
      removedBefore: removedBeforeImmediateDelete,
      removedAfter: state.threads.some((thread) => thread.id === deleteUiThread.id),
      scheduledCount: document.querySelector('#scheduled-thread-count').textContent
    };
    setThreadView('active');
    const snapshot = (overrides = {}) => ({
      providers: [],
      projects: state.savedProjects,
      projectThreads: state.projectThreads,
      hiddenProjectRoots: state.hiddenProjectRoots,
      threadSettings: state.threadSettings,
      threadAliases: state.threadAliases,
      hiddenThreadIds: [...state.hiddenThreadIds],
      deletedThreadIds: [...state.deletedThreadIds],
      localArchivedThreadIds: [...state.localArchivedThreadIds],
      pendingDeletions: state.pendingDeletions,
      scheduledTasks: state.scheduledTasks,
      runningTaskIds: [...state.runningTaskIds],
      recordHome: state.recordHome,
      ...overrides
    });
    const syncThread = state.activeThreads[0];
    const contextTarget = document.querySelector('[data-thread-id="' + syncThread.id + '"]');
    contextTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 180 }));
    const contextMenuOpened = !elements.menu.classList.contains('hidden') && state.menuThread?.id === syncThread.id;
    elements.menu.classList.add('hidden');
    state.menuThread = syncThread;
    await threadMenuAction('archive');
    const archiveUiAdded = state.localArchivedThreadIds.has(syncThread.id);
    setThreadView('archived');
    state.menuThread = state.threads.find((thread) => thread.id === syncThread.id);
    await threadMenuAction('unarchive');
    const archiveUiRemoved = !state.localArchivedThreadIds.has(syncThread.id);
    setThreadView('active');
    const localArchiveUi = { added: archiveUiAdded, removed: archiveUiRemoved };
    state.threadView = 'archived';
    state.localArchivedThreadIds = new Set([syncThread.id]);
    state.activeThread = { ...syncThread, _archived: true, _localArchived: true };
    applyStoreSnapshot(snapshot({ localArchivedThreadIds: [] }));
    const crossWindowUnarchiveCleared = state.activeThread === null;
    state.threadView = 'active';
    state.activeThread = syncThread;
    state.threadAliases = {};
    elements.windowTitle.textContent = 'Before sync';
    applyStoreSnapshot(snapshot({ threadAliases: { [syncThread.id]: 'Cross-window title' } }));
    const crossWindowAliasTitle = elements.windowTitle.textContent;
    newChat(false);
    const savedProjects = [...state.savedProjects];
    const assignedThreads = { ...state.projectThreads };
    const projectThreads = [...state.activeThreads];
    state.savedProjects = [];
    state.projectThreads = {};
    state.activeThreads = [
      { id: 'inferred-alpha', name: 'Alpha', cwd: '/alpha/shared', recencyAt: 100 },
      { id: 'inferred-beta', name: 'Beta', cwd: '/beta/shared', recencyAt: 200 }
    ];
    syncProjects();
    const inferredLabels = state.projects.map((project) => project.label);
    const inferredCountBeforeDelete = document.querySelectorAll('.project-row:not([data-project-id="all"])').length;
    document.querySelector('.project-row:not([data-project-id="all"]) .project-delete').click();
    await waitUntil(() => document.querySelectorAll('.project-row:not([data-project-id="all"])').length === inferredCountBeforeDelete - 1);
    const inferredCountAfterDelete = document.querySelectorAll('.project-row:not([data-project-id="all"])').length;
    state.hiddenProjectRoots = [];
    state.savedProjects = savedProjects;
    state.projectThreads = assignedThreads;
    state.activeThreads = projectThreads;
    state.activeProject = savedProjects[0];
    syncProjects();
    state.providers = [{ id: 'fixture-provider', label: 'Fixture', connectionLabel: 'Fixture connection' }];
    document.querySelector('#schedule-task-button').click();
    document.querySelector('#task-name-input').value = 'Daily summary';
    document.querySelector('#task-prompt-input').value = 'Summarize the project';
    document.querySelector('#task-time-input').value = '2026-07-27T09:30';
    document.querySelector('#task-repeat-select').value = 'daily';
    document.querySelector('#task-provider-select').value = 'fixture-provider';
    document.querySelector('#task-form').requestSubmit();
    await waitUntil(() => document.querySelector('#task-overlay').classList.contains('hidden'));
    state.pendingDeletions = [{ threadId: 'old-thread', expiresAt: Date.now() + 60000 }];
    state.hiddenThreadIds = new Set(['old-thread']);
    updateThreadViewControls();
    setThreadView('scheduled');
    const scheduledView = {
      active: document.querySelector('[data-thread-view="scheduled"]').classList.contains('active'),
      count: document.querySelector('#scheduled-thread-count').textContent,
      tasks: [...document.querySelectorAll('#thread-list .task-main strong')].map((node) => node.textContent),
      deletedThreadVisible: Boolean(document.querySelector('[data-thread-id="old-thread"]')),
      providerId: state.scheduledTasks[0]?.providerId || null,
      composerHidden: getComputedStyle(document.querySelector('.composer-wrap')).display === 'none'
    };
    const runningTaskId = state.scheduledTasks[0].id;
    state.runningTaskIds = new Set([runningTaskId]);
    renderScheduledTasks();
    const runningRow = document.querySelector('[data-task-id="' + runningTaskId + '"]');
    const runningTaskUi = {
      label: runningRow.querySelector('.task-main small').textContent,
      rowMarkedRunning: runningRow.classList.contains('running'),
      mainDisabled: runningRow.querySelector('.task-main').disabled,
      toggleDisabled: runningRow.querySelector('.task-toggle').disabled,
      deleteDisabled: runningRow.querySelector('.task-action.delete').disabled
    };
    state.runningTaskIds = new Set();
    renderScheduledTasks();
    state.pendingDeletions = [];
    state.hiddenThreadIds = new Set();
    setThreadView('active');
    const activeComposerVisible = getComputedStyle(document.querySelector('.composer-wrap')).display !== 'none';
    return {
      renameDialog,
      duplicateError,
      newFirst,
      oldFirst,
      rootedAssignment,
      inferredLabels,
      inferredCountBeforeDelete,
      inferredCountAfterDelete,
      activeProject: state.activeProject?.label || null,
      labels: state.savedProjects.map((project) => project.label),
      deletedProjectMapping,
      activeAfterDelete,
      immediateDelete,
      localArchiveUi,
      contextMenuOpened,
      crossWindowUnarchiveCleared,
      crossWindowAliasTitle,
      scheduledView,
      runningTaskUi,
      activeComposerVisible
    };
  })()`);

  assert.equal(addCalls, 3);
  assert.equal(renameCalls, 1, "A client-side duplicate name must not call the rename IPC.");
  assert.equal(deleteCalls, 2);
  assert.equal(taskSaveCalls, 1);
  assert.equal(summary.renameDialog.title, "重命名 Project");
  assert.equal(summary.renameDialog.rootHidden, true);
  assert.equal(summary.renameDialog.submit, "保存");
  assert.match(summary.duplicateError, /已存在/);
  assert.deepEqual(new Set(summary.labels), new Set(["Renamed Project", "New Project"]));
  assert.equal(summary.deletedProjectMapping, undefined);
  assert.equal(summary.activeAfterDelete, null);
  assert.deepEqual(summary.immediateDelete, { removedBefore: true, removedAfter: false, scheduledCount: "0" });
  assert.deepEqual(summary.localArchiveUi, { added: true, removed: true });
  assert.equal(summary.contextMenuOpened, true);
  assert.equal(summary.crossWindowUnarchiveCleared, true);
  assert.equal(summary.crossWindowAliasTitle, "Cross-window title");
  assert.deepEqual(summary.scheduledView, {
    active: true,
    count: "1",
    tasks: ["Daily summary"],
    deletedThreadVisible: false,
    providerId: "fixture-provider",
    composerHidden: true,
  });
  assert.equal(summary.activeComposerVisible, true);
  assert.deepEqual(summary.runningTaskUi, {
    label: "正在执行",
    rowMarkedRunning: true,
    mainDisabled: true,
    toggleDisabled: true,
    deleteDisabled: true,
  });
  assert.deepEqual(summary.newFirst, ["New Project", "Renamed Project"]);
  assert.deepEqual(summary.oldFirst, ["Renamed Project", "New Project"]);
  assert.deepEqual(summary.rootedAssignment, {
    order: ["Rooted Project", "Plain Project"],
    count: "1",
    belongs: true,
  });
  assert.equal(new Set(summary.inferredLabels.map((label) => label.toLocaleLowerCase("zh-CN"))).size, 2);
  assert.equal(summary.inferredCountAfterDelete, summary.inferredCountBeforeDelete - 1);
  assert.deepEqual(rendererErrors, []);

  await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('#provider-overlay').classList.add('hidden');
    document.querySelector('#project-overlay').classList.add('hidden');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  fs.mkdirSync(path.dirname(screenshot), { recursive: true });
  fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-thread-view="scheduled"]').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  fs.writeFileSync(scheduledScreenshot, (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('.task-main').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  fs.writeFileSync(taskDialogScreenshot, (await window.webContents.capturePage()).toPNG());
  window.setSize(700, 650);
  await new Promise((resolve) => setTimeout(resolve, 150));
  fs.writeFileSync(taskDialogCompactScreenshot, (await window.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({
    ok: true,
    addCalls,
    renameCalls,
    deleteCalls,
    taskSaveCalls,
    ...summary,
    screenshot,
    scheduledScreenshot,
    taskDialogScreenshot,
    taskDialogCompactScreenshot,
  }));
  window.destroy();
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
