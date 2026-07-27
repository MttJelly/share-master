function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function explicitBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["true", "1"].includes(value.trim().toLowerCase());
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchRelayBalance(provider, apiKey, fetchImpl = globalThis.fetch) {
  if (!provider?.baseUrl || !apiKey) throw new Error("中转地址或 API Key 不完整。");
  if (typeof fetchImpl !== "function") throw new Error("当前运行环境不支持余额查询。");
  const origin = new URL(provider.baseUrl).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const clientHeaders = { "User-Agent": "Share-Master/0.1.0", Accept: "application/json" };
    const headers = { ...clientHeaders, Authorization: `Bearer ${apiKey}` };
    const [usageResponse, statusResponse] = await Promise.all([
      fetchImpl(`${origin}/api/usage/token/`, { headers, signal: controller.signal }),
      fetchImpl(`${origin}/api/status`, { headers: clientHeaders, signal: controller.signal }),
    ]);
    if (!usageResponse.ok) {
      return {
        supported: false,
        status: usageResponse.status,
        message: usageResponse.status === 401
          ? "API Key 无效或无权查询余额。"
          : usageResponse.status === 403
            ? "厂商拒绝了余额查询，请稍后重试或检查 API Key。"
          : "该厂商未提供兼容的余额查询接口。",
      };
    }
    const usagePayload = await responseJson(usageResponse);
    const data = usagePayload?.data || usagePayload;
    if (!data || data.total_available === undefined) {
      return { supported: false, status: usageResponse.status, message: "厂商返回了无法识别的余额格式。" };
    }
    const statusPayload = statusResponse.ok ? await responseJson(statusResponse) : null;
    const status = statusPayload?.data || {};
    const quotaPerUnit = safeNumber(status.quota_per_unit);
    const totalAvailable = safeNumber(data.total_available);
    const totalUsed = safeNumber(data.total_used);
    const totalGranted = safeNumber(data.total_granted);
    const displayType = String(status.quota_display_type || "quota").toUpperCase();
    const tokenUnlimited = explicitBoolean(data.unlimited_quota);
    return {
      supported: true,
      name: data.name || provider.label,
      // New API uses this flag for the key's own quota cap, not the account balance.
      unlimited: tokenUnlimited && totalAvailable === null,
      tokenUnlimited,
      expiresAt: safeNumber(data.expires_at),
      quotaPerUnit,
      displayType,
      totalAvailable,
      totalUsed,
      totalGranted,
      balance: quotaPerUnit && totalAvailable !== null ? totalAvailable / quotaPerUnit : null,
      used: quotaPerUnit && totalUsed !== null ? totalUsed / quotaPerUnit : null,
      granted: quotaPerUnit && totalGranted !== null ? totalGranted / quotaPerUnit : null,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("余额查询超时。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { explicitBoolean, fetchRelayBalance };
