const STREAM_DELTA_METHODS = new Set([
  "item/agentMessage/delta",
  "item/reasoning/summaryTextDelta",
  "item/plan/delta",
]);

function streamEventKey(message) {
  const params = message?.params || {};
  return [
    message?.method || "",
    params.threadId || params.conversationId || "",
    params.turnId || "",
    params.itemId || "",
  ].join(":");
}

function createStreamEventBatcher(deliver, options = {}) {
  if (typeof deliver !== "function") throw new TypeError("Stream event deliver callback is required.");
  const intervalMs = Math.max(10, Number(options.intervalMs) || 60);
  const pending = new Map();
  let timer = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    for (const entry of batch) {
      deliver({
        ...entry.message,
        params: { ...entry.message.params, delta: entry.chunks.join("") },
      });
    }
  };

  const push = (message) => {
    if (!STREAM_DELTA_METHODS.has(message?.method) || typeof message?.params?.delta !== "string") {
      flush();
      deliver(message);
      return;
    }
    const key = streamEventKey(message);
    const entry = pending.get(key) || { message, chunks: [] };
    entry.message = message;
    entry.chunks.push(message.params.delta);
    pending.set(key, entry);
    if (!timer) {
      timer = setTimeout(flush, intervalMs);
      timer.unref?.();
    }
  };

  const stop = (deliverPending = true) => {
    if (deliverPending) flush();
    else {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    }
  };

  return { push, flush, stop, pendingCount: () => pending.size };
}

module.exports = { STREAM_DELTA_METHODS, createStreamEventBatcher, streamEventKey };
