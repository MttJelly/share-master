function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedWindow(window, kind) {
  if (!window || typeof window !== "object") return null;
  const usedPercent = finiteNumber(window.usedPercent);
  const windowDurationMins = finiteNumber(window.windowDurationMins);
  const resetsAt = finiteNumber(window.resetsAt);
  if (usedPercent === null && windowDurationMins === null && resetsAt === null) return null;
  return {
    kind,
    usedPercent: usedPercent === null ? null : Math.max(0, Math.min(100, usedPercent)),
    windowDurationMins,
    resetsAt,
  };
}

function snapshotKey(snapshot) {
  return JSON.stringify([
    snapshot.primary?.usedPercent,
    snapshot.primary?.windowDurationMins,
    snapshot.primary?.resetsAt,
    snapshot.secondary?.usedPercent,
    snapshot.secondary?.windowDurationMins,
    snapshot.secondary?.resetsAt,
  ]);
}

function normalizeRateLimits(response) {
  if (!response || typeof response !== "object") return { groups: [], resetCredits: 0 };
  const candidates = [];
  for (const [id, snapshot] of Object.entries(response.rateLimitsByLimitId || {})) {
    if (snapshot && typeof snapshot === "object") candidates.push({ id, snapshot });
  }
  if (response.rateLimits && typeof response.rateLimits === "object") {
    candidates.push({ id: response.rateLimits.limitId || "default", snapshot: response.rateLimits });
  }

  const seen = new Set();
  const groups = [];
  for (const { id, snapshot } of candidates) {
    const primary = normalizedWindow(snapshot.primary, "primary");
    const secondary = normalizedWindow(snapshot.secondary, "secondary");
    if (!primary && !secondary) continue;
    const key = snapshotKey({ primary, secondary });
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({
      id: String(snapshot.limitId || id || "default"),
      name: String(snapshot.limitName || "").trim() || null,
      planType: snapshot.planType || null,
      windows: [primary, secondary].filter(Boolean),
      credits: snapshot.credits && typeof snapshot.credits === "object" ? {
        hasCredits: Boolean(snapshot.credits.hasCredits),
        unlimited: Boolean(snapshot.credits.unlimited),
        balance: snapshot.credits.balance ?? null,
      } : null,
      individualLimit: snapshot.individualLimit && typeof snapshot.individualLimit === "object" ? {
        limit: snapshot.individualLimit.limit ?? null,
        used: snapshot.individualLimit.used ?? null,
        remainingPercent: finiteNumber(snapshot.individualLimit.remainingPercent),
        resetsAt: finiteNumber(snapshot.individualLimit.resetsAt),
      } : null,
      reachedType: snapshot.rateLimitReachedType || null,
    });
  }
  groups.sort((left, right) => {
    const score = (group) => /codex/i.test(`${group.id} ${group.name || ""}`) ? 0 : 1;
    return score(left) - score(right);
  });
  return {
    groups,
    resetCredits: Math.max(0, finiteNumber(response.rateLimitResetCredits?.availableCount) || 0),
  };
}

function normalizeAccountUsage(response) {
  const summary = response?.summary;
  if (!summary || typeof summary !== "object") return null;
  return {
    lifetimeTokens: finiteNumber(summary.lifetimeTokens),
    peakDailyTokens: finiteNumber(summary.peakDailyTokens),
    longestRunningTurnSec: finiteNumber(summary.longestRunningTurnSec),
    currentStreakDays: finiteNumber(summary.currentStreakDays),
    longestStreakDays: finiteNumber(summary.longestStreakDays),
  };
}

module.exports = { finiteNumber, normalizeRateLimits, normalizeAccountUsage };
