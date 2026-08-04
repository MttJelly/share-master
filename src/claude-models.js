const { USER_AGENT } = require("./app-version");

function normalizeBaseUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Claude Base URL 无效。");
  }
  return parsed.toString().replace(/\/+$/, "");
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function claudeRoutesForBaseUrl(baseUrl) {
  const hostname = new URL(normalizeBaseUrl(baseUrl)).hostname.toLowerCase();
  return hostname === "ai.hexuan.cc" ? [
    { id: "fable", label: "Claude Fable 5", actualModel: "claude-fable-5", genuineClaude: true },
    { id: "sonnet", label: "DeepSeek V4 Pro", actualModel: "deepseek-v4-pro", genuineClaude: false },
    { id: "opus", label: "DeepSeek V4 Pro", actualModel: "deepseek-v4-pro", genuineClaude: false },
    { id: "haiku", label: "DeepSeek V4 Flash", actualModel: "deepseek-v4-flash", genuineClaude: false },
  ] : [];
}

async function fetchClaudeModels(baseUrl, apiKey, fetchImpl = globalThis.fetch) {
  if (!apiKey) throw new Error("Claude API Token 未配置。");
  if (typeof fetchImpl !== "function") throw new Error("当前运行环境不支持读取 Claude 模型。");
  const normalized = normalizeBaseUrl(baseUrl);
  const response = await fetchImpl(`${normalized}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  const payload = await responseJson(response);
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message;
    const error = new Error(detail || `读取 Claude 模型失败（HTTP ${response.status}）。`);
    error.status = response.status;
    throw error;
  }
  const models = Array.isArray(payload?.data)
    ? payload.data
      .map((item) => ({
        id: String(item?.id || "").trim(),
        label: String(item?.display_name || item?.displayName || item?.id || "").trim(),
        createdAt: item?.created_at || item?.createdAt || null,
      }))
      .filter((item) => item.id)
    : [];
  if (!models.length) throw new Error("厂商返回了空的 Claude 模型列表。");
  models.sort((left, right) => left.label.localeCompare(right.label, "en"));

  const routes = claudeRoutesForBaseUrl(normalized);

  return { models, routes };
}

async function fetchClaudeModelsSafely(baseUrl, apiKey, fetchImpl = globalThis.fetch) {
  try {
    const catalog = await fetchClaudeModels(baseUrl, apiKey, fetchImpl);
    return { ...catalog, warning: null, status: null, fallback: false };
  } catch (error) {
    let routes = [];
    try {
      routes = claudeRoutesForBaseUrl(baseUrl);
    } catch {}
    return {
      models: [],
      routes,
      warning: error.message,
      status: Number.isInteger(error.status) ? error.status : null,
      fallback: true,
    };
  }
}

module.exports = {
  claudeRoutesForBaseUrl,
  fetchClaudeModels,
  fetchClaudeModelsSafely,
  normalizeBaseUrl,
};
