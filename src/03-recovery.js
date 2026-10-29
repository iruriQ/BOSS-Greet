// 自动恢复只重试未开聊、未发送的模型请求或列表加载，不重试投递本身。
const AUTO_RECOVERY_DELAYS = [30, 60, 120];
const GREETING_SECRET_KEY = `${APP_ID}:ai-key`;
const BOSS_JOB_GAP_KEY = `${APP_ID}:boss-job-gap-v2`;
const BOSS_PAUSE_SECONDS = Object.freeze({ min: 1, max: 3 });
const BOSS_PLATFORM_PAUSE_KEY = `${APP_ID}:boss-platform-pause`;

function stopForBossPlatform(reason) {
  const message = reason || "BOSS 出现登录或验证提示，请处理后手动重新开始";
  gmSet(BOSS_PLATFORM_PAUSE_KEY, { reason: message, at: Date.now() });
  state.stopping = true;
  state.pendingResume = null;
  state.current = message;
  clearResumeState();
  const error = new Error(message);
  error.stopPreview = true;
  error.code = "BOSS_PLATFORM_BLOCKED";
  return error;
}

function assertBossPlatformReady(root = document) {
  const reason = autoRecoveryBlockReason(root) || (root !== document && autoRecoveryBlockReason());
  if (reason) throw stopForBossPlatform(reason);
  if (state.stopping) throw new Error("已停止，未继续操作 BOSS");
}

function beginManualBossAction() {
  const reason = bossVisibleBlockReason();
  if (reason) throw stopForBossPlatform(reason);
  // Only a new user-initiated start/preview clears a previous platform pause.
  if (gmGet(BOSS_PLATFORM_PAUSE_KEY, null)) gmSet(BOSS_PLATFORM_PAUSE_KEY, null);
}

function createBossPausePlan() {
  const seconds = BOSS_PAUSE_SECONDS.min + Math.floor(Math.random() *
    (BOSS_PAUSE_SECONDS.max - BOSS_PAUSE_SECONDS.min + 1));
  const startedAt = Date.now();
  return { startedAt, seconds, dueAt: startedAt + seconds * 1000 };
}

function markBossJobFinished() {
  // A single gap per completed candidate, shared with preview and across reloads.
  // Old per-operation deadlines are deliberately not reused after this migration.
  gmSet(BOSS_JOB_GAP_KEY, createBossPausePlan());
}

async function waitForBossPause(plan, label, root = document) {
  try {
    while (true) {
      assertBossPlatformReady(root);
      const remaining = plan.dueAt - Date.now();
      if (remaining <= 0) return;
      state.bossPacingMessage = `${label}：${Math.ceil(remaining / 1000)} 秒，可点击停止`;
      renderPanel();
      await sleep(Math.min(500, remaining));
    }
  } finally { state.bossPacingMessage = ""; renderPanel(); }
}

async function waitForBossJobGap() {
  assertBossPlatformReady();
  const plan = gmGet(BOSS_JOB_GAP_KEY, null);
  if (!plan || !Number.isInteger(plan.seconds) || plan.seconds < 1 || plan.seconds > 3 ||
      !Number.isFinite(plan.startedAt) || plan.dueAt !== plan.startedAt + plan.seconds * 1000) return;
  // Retain the draw if the system clock moves backwards, without a huge wait.
  if (plan.startedAt > Date.now()) {
    plan.startedAt = Date.now(); plan.dueAt = plan.startedAt + plan.seconds * 1000;
    gmSet(BOSS_JOB_GAP_KEY, plan);
  }
  await waitForBossPause(plan, "进入下一岗位前等待");
}

async function waitForBossOperation(kind, { root = document, settings = config } = {}) {
  if (!["read", "contact", "send"].includes(kind)) throw new Error("未知 BOSS 操作类型");
  assertBossPlatformReady(root);
  // Reading, opening a conversation and fixed/native greetings add no delay.
  // Only an AI greeting that is ready to send gets its own fresh 1–3s pause.
  if (kind === "send" && settings.bossGreetingMode === "ai") {
    await waitForBossPause(createBossPausePlan(), "AI 话术已核验，发送前等待", root);
  }
}

function storeGreetingKey() {
  // 凭据不可通过 gmSet 回退到网页 localStorage；用户须明确开启本机保存。
  if (typeof GM_setValue !== "function" || typeof GM_getValue !== "function") return;
  try {
    if (config.rememberGreetingKey && greetingAPIKey) {
      GM_setValue(GREETING_SECRET_KEY, { endpoint: config.greetingAIEndpoint.trim(), key: greetingAPIKey });
    } else if (GM_getValue(GREETING_SECRET_KEY, null)) {
      GM_setValue(GREETING_SECRET_KEY, null);
    }
  } catch { log("warn", "本机密钥存储不可用；当前密钥仅在本页面有效"); }
}

function restoreGreetingKey() {
  if (!config.rememberGreetingKey || typeof GM_getValue !== "function") return;
  try {
    const saved = GM_getValue(GREETING_SECRET_KEY, null);
    if (saved?.endpoint === config.greetingAIEndpoint.trim() && typeof saved.key === "string") greetingAPIKey = saved.key.trim();
  } catch { /* 不读取站点存储，不把存储内容写入日志。 */ }
}

function syncGreetingKeyStorage(previous) {
  // 更换服务时不能把原服务的密钥带到另一个目的地。
  if (previous?.greetingAIEndpoint !== config.greetingAIEndpoint) greetingAPIKey = "";
  if (previous?.rememberGreetingKey !== config.rememberGreetingKey || previous?.greetingAIEndpoint !== config.greetingAIEndpoint) storeGreetingKey();
  if (previous?.autoRecoveryEnabled && !config.autoRecoveryEnabled && state.pendingResume) {
    state.pendingResume = null;
    clearResumeState();
    state.current = "已关闭自动恢复，请手动开始";
  }
  if (state.pendingResume && (previous?.bossGreetingMode !== config.bossGreetingMode ||
      previous?.bossPersonalizedGreeting !== config.bossPersonalizedGreeting)) {
    state.pendingResume = null;
    clearResumeState();
    state.current = "话术模式已切换，请检查设置后点击开始";
  }
}

function needsGreetingKey(adapter) {
  return adapter?.id === "boss" && usesBossAIGreeting() && !config.bossGreetingPreviewOnly &&
    (PERSONAL_BUILD || config.rememberGreetingKey) && !greetingAPIKey;
}

function deferRunForGreetingKey(saved) {
  state.pendingResume = saved;
  state.current = "等待 AI 密钥：设置后将自动继续，不会反复请求接口";
  if (saved) gmSet(RESUME_KEY, { ...saved, phase: "awaiting-key", updatedAt: Date.now() });
  log("warn", state.current);
  renderPanel();
}

function resumeAfterGreetingKey() {
  if (!greetingAPIKey || !config.autoRecoveryEnabled || !state.pendingResume || state.running || state.previewing) return;
  const blocked = autoRecoveryBlockReason();
  if (blocked) { state.current = blocked; log("warn", blocked); renderPanel(); return; }
  startApply({ resume: state.pendingResume }).catch(error => {
    log("error", `恢复任务失败：${error.message || error}`);
    renderPanel();
  });
}

function bossVisibleBlockReason(root = document) {
  if (/\/safe-validate|\/captcha|\/web\/user\/|\/passport/.test(location.pathname || "")) return "BOSS 页面需要登录或安全验证，请处理后手动重新开始";
  if (typeof root.querySelectorAll !== "function") return "";
  if (root === document && hasVisibleLoginSurface()) return "请先处理平台登录或验证";
  const selectors = "[role='dialog'],[role='alert'],.dialog-wrap,.ui-dialog,.captcha,.verify-wrap,.passport-login,.login-dialog,.login-modal,.toast,.toast-wrap,.ui-toast,iframe[src*='captcha'],iframe[src*='passport'],iframe[src*='login']";
  for (const element of root.querySelectorAll(selectors)) {
    if (typeof cachedPanel !== "undefined" && cachedPanel?.contains(element)) continue;
    if (!isElementVisible(element)) continue;
    const text = normalizeText(element.innerText || element.textContent || "");
    if (isLoginOrVerifyText(text) || isLimitText(text) || /captcha|verify-wrap|passport-login|login-dialog|login-modal/.test(String(element.className)) || /captcha|passport|login/.test(element.getAttribute?.("src") || "")) {
      return "平台出现登录、验证或沟通限制，已保留暂停";
    }
  }
  return "";
}

function autoRecoveryBlockReason(root = document) {
  return bossVisibleBlockReason(root) || (gmGet(BOSS_PLATFORM_PAUSE_KEY, null) ? "平台异常后已暂停自动恢复，请处理提示后手动重新开始" : "");
}

function installBossPlatformGuard() {
  if (typeof MutationObserver !== "function" || !document.documentElement) return;
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending || state.stopping || !(state.running || state.previewing || state.pendingResume)) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      if (state.stopping || !(state.running || state.previewing || state.pendingResume)) return;
      const reason = bossVisibleBlockReason();
      if (!reason) return;
      stopForBossPlatform(reason);
      log("warn", `${reason}；已停止，处理后需手动重新开始`);
      renderPanel();
    }, 200);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
}

async function waitForAutoRecovery(attempt, label) {
  if (!config.autoRecoveryEnabled || state.stopping) return false;
  const seconds = AUTO_RECOVERY_DELAYS[attempt];
  if (!seconds) return false;
  state.recovering = true;
  log("warn", `${label}，${seconds} 秒后自动恢复（第 ${attempt + 1}/${AUTO_RECOVERY_DELAYS.length} 次）；可点击停止取消`);
  try {
    for (let remaining = seconds; remaining > 0; remaining--) {
      if (state.stopping || !config.autoRecoveryEnabled) return false;
      const blocked = autoRecoveryBlockReason();
      if (blocked) { state.current = blocked; state.stopping = true; log("warn", blocked); return false; }
      state.current = `${label}，${remaining} 秒后自动恢复（${attempt + 1}/${AUTO_RECOVERY_DELAYS.length}）`;
      renderPanel();
      await sleep(1000);
    }
    return !state.stopping && config.autoRecoveryEnabled;
  } finally { state.recovering = false; renderPanel(); }
}

async function applyWithAutoRecovery(job, detail, adapter, applySession) {
  let attempt = 0;
  while (true) {
    const result = await adapter.apply(job, adapter.id === "boss" ? detail : applySession);
    if (adapter.id !== "boss" || result.recoveryKind !== "ai-transient" || !config.autoRecoveryEnabled) return result;
    if (attempt >= AUTO_RECOVERY_DELAYS.length) return { ...result, message: `${result.message}；自动恢复已达3次上限，请检查 AI 服务` };
    if (!await waitForAutoRecovery(attempt++, "AI 服务暂时不可用，尚未开聊或发送")) return result;
  }
}

async function nextPageWithAutoRecovery(adapter) {
  let attempt = 0;
  while (true) {
    if (await adapter.nextPage()) return true;
    if (adapter.id !== "boss" || !state.paginationRetryable || state.stopping || !config.autoRecoveryEnabled) return false;
    if (attempt >= AUTO_RECOVERY_DELAYS.length) {
      state.paginationStopReason += "；自动恢复已达3次上限";
      return false;
    }
    if (!await waitForAutoRecovery(attempt++, "列表暂未加载完成")) return false;
  }
}
