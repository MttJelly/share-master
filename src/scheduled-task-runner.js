async function executeScheduledTask(task, server, providerStore, clientUserMessageId, onThreadCreated = null) {
  const project = task.projectId
    ? providerStore.listProjects().find((item) => item.id === task.projectId)
    : null;
  const workspace = project?.root || task.workspace || "F:\\codepro";
  const model = task.model || server.provider.model || null;
  const effort = task.effort || "high";
  const approvalMode = task.approvalMode || "auto";
  const created = await server.startThread(workspace, model, { approvalMode });
  const threadId = created.thread?.id;
  if (!threadId) throw new Error("定时任务未能创建会话。");
  if (task.projectId) providerStore.assignThreadToProject(threadId, task.projectId);
  providerStore.renameThreadLocal(threadId, task.title);
  if (typeof onThreadCreated === "function") onThreadCreated(threadId);
  await server.startTurn(
    threadId,
    task.prompt,
    workspace,
    clientUserMessageId,
    { model, effort, approvalMode },
  );
  return { threadId, workspace };
}

function finalizeScheduledTask(taskId, threadId, turn, providerStore, options = {}) {
  const status = turn?.status;
  if (["failed", "interrupted", "cancelled"].includes(status)) {
    const detail = turn?.error?.message || `任务运行状态：${status}`;
    return providerStore.failScheduledTask(taskId, detail, Date.now(), options);
  }
  return providerStore.completeScheduledTask(taskId, threadId, Date.now(), options);
}

module.exports = { executeScheduledTask, finalizeScheduledTask };
