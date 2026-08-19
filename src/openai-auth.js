const OFFICIAL_PROVIDER_TYPES = new Set(["official", "account"]);

function isOfficialProvider(provider) {
  return OFFICIAL_PROVIDER_TYPES.has(provider?.type);
}

function isAuthenticatedOfficialSnapshot(snapshot) {
  // App-server reports requiresOpenaiAuth=true for an authenticated ChatGPT
  // account when the active provider requires OpenAI credentials.
  return Boolean(snapshot?.account);
}

function officialAuthError(afterLogin = false) {
  return new Error(afterLogin
    ? "ChatGPT 登录未完成，请在浏览器中完成认证后重试。"
    : "尚未登录 ChatGPT。请先登录官方账号，再进入聊天。"
  );
}

function requireAuthenticatedOfficialSnapshot(provider, snapshot, options = {}) {
  if (!isOfficialProvider(provider)) return snapshot;
  if (!isAuthenticatedOfficialSnapshot(snapshot)) throw officialAuthError(Boolean(options.afterLogin));
  return snapshot;
}

module.exports = {
  OFFICIAL_PROVIDER_TYPES,
  isOfficialProvider,
  isAuthenticatedOfficialSnapshot,
  officialAuthError,
  requireAuthenticatedOfficialSnapshot,
};
