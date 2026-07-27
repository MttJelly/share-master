function modelsEndpoint(baseUrl) {
  const parsed = new URL(String(baseUrl || "").trim());
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("OpenAI Base URL 无效。");
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/models`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function fetchOpenAIModels(baseUrl, apiKey, fetchImpl = globalThis.fetch) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("API Key 未配置，无法读取模型列表。");
  const response = await fetchImpl(modelsEndpoint(baseUrl), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || text || response.statusText;
    const error = new Error(`模型接口返回 ${response.status}：${detail}`);
    error.status = response.status;
    throw error;
  }
  const models = [...new Set(
    (Array.isArray(payload?.data) ? payload.data : [])
      .map((item) => typeof item === "string" ? item : item?.id)
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  )];
  if (!models.length) throw new Error("模型接口没有返回任何模型 ID。");
  return models;
}

module.exports = { fetchOpenAIModels, modelsEndpoint };
