async function executeScheduledTask(task, server, providerStore, clientUserMessageId, onThreadCreated = null) {
  const project = task.projectId
    ? providerStore.listProjects().find((item) => item.id === task.projectId)
    : null;
  const workspace = project?.root || task.workspace || "F:\\codepro";
  const model = server.provider.model || null;
  const created = await server.startThread(workspace, model, { approvalMode: "auto" });
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
    { model, effort: "high", approvalMode: "auto" },
  );
  return { threadId, workspace };
}

function finalizeScheduledTask(taskId, threadId, turn, providerStore) {
  const status = turn?.status;
  if (["failed", "interrupted", "cancelled"].includes(status)) {
    const detail = turn?.error?.message || `任务运行状态：${status}`;
    return providerStore.failScheduledTask(taskId, detail);
  }
  return providerStore.completeScheduledTask(taskId, threadId);
}

module.exports = { executeScheduledTask, finalizeScheduledTask };
