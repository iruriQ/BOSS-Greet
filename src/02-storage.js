// =====================================================================
  // 存储与历史记录
  // =====================================================================

  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
    } catch (error) {
      console.warn(`[${APP_ID}] GM_getValue failed`, error);
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn(`[${APP_ID}] GM_setValue failed`, error);
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[${APP_ID}] localStorage set failed`, error);
    }
  }

  function loadConfig() {
    const stored = gmGet(CONFIG_KEY, {});
    return normalizeConfig(stored || {});
  }

  function normalizeApplyLimit(value) {
    const count = Number(value);
    return Number.isInteger(count) && count >= 1 && count <= 150 ? count : DEFAULT_CONFIG.maxApplyCount;
  }

  // Arrays preserve each box as one keyword. Only legacy text is split.
  function normalizeKeywordEntries(value) {
    if (typeof value === "string" && value.trim().startsWith("[")) {
      try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) value = parsed; } catch (_) {}
    }
    const items = Array.isArray(value) ? value : String(value || "").split(/[，,\n;；、]/);
    return [...new Set(items.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean))];
  }
  function normalizeCompanySizes(value) {
    return normalizeKeywordEntries(value).filter(item => BOSS_COMPANY_SIZES.includes(item));
  }

  function normalizeConfig(input) {
    const output = { ...DEFAULT_CONFIG, ...(input || {}) };
    // 老用户继续原来的 AI/平台默认流程；首次安装通用版才默认固定话术。
    if (!Object.prototype.hasOwnProperty.call(input || {}, "bossGreetingMode")) {
      output.bossGreetingMode = PERSONAL_BUILD || Object.keys(input || {}).length ? "ai" : "fixed";
    }
    if (!["fixed", "ai"].includes(output.bossGreetingMode)) output.bossGreetingMode = DEFAULT_CONFIG.bossGreetingMode;
    // 兼容早期私人构建的发送模式；通用版尊重用户保存的预览选择。
    if (PERSONAL_BUILD && Number(input?.greetingWorkflowVersion || 0) < 2) output.bossGreetingPreviewOnly = false;
    output.greetingWorkflowVersion = 2;
    if (PERSONAL_BUILD && Number(input?.greetingIntroVersion || 0) < 1) {
      output.candidateExperience = DEFAULT_CANDIDATE.experience || "";
    }
    output.greetingIntroVersion = 1;

    // 强行锁死固定参数，忽略存储的旧数据
    // Old installs used an effectively unlimited 9999; migrate to a modest
    // default while preserving valid user-selected round limits.
    output.maxApplyCount = normalizeApplyLimit(output.maxApplyCount);
    output.includeDescriptionKeywords = normalizeKeywordEntries(output.includeDescriptionKeywords);
    output.excludeDescriptionKeywords = normalizeKeywordEntries(output.excludeDescriptionKeywords);
    output.excludeTitleKeywords = normalizeKeywordEntries(output.excludeTitleKeywords);
    output.bossCompanySizes = normalizeCompanySizes(output.bossCompanySizes);
    // Timing is internal; discard old user-configurable interval values.
    for (const key of ["bossReadIntervalSec", "bossContactIntervalSec", "bossSendIntervalSec"]) delete output[key];
    output.dailyLimit = DEFAULT_CONFIG.dailyLimit;
    output.delayMinSec = DEFAULT_CONFIG.delayMinSec;
    output.delayMaxSec = DEFAULT_CONFIG.delayMaxSec;
    output.pageDelaySec = DEFAULT_CONFIG.pageDelaySec;
    output.activeWithinDays = DEFAULT_CONFIG.activeWithinDays;

    // 强制锁定默认开启的配置
    output.autoNextPage = true;
    output.fetchDetail = true;
    output.skipAppliedHistory = true;
    output.skipHeadhunter = true;
    output.treatChatRemindAsSuccess = true;

    for (const key of ["candidateIntro", "candidateExperience", "candidateProfile", "candidateResumeText", "candidateBossResumeText", "candidateProfileBackup", "greetingAIEndpoint", "greetingAIModel", "greetingAllowedHttpOrigin", "bossFixedGreeting", "bossFixedGreetingConfirmedText"]) {
      output[key] = typeof output[key] === "string" ? output[key] : "";
    }
    output.candidateResumeSource = output.candidateResumeSource === "boss" ? "boss" : "text";
    // Removed platform greeting import: keep the saved text and its matching
    // confirmation, but discard the obsolete source so old installs migrate.
    delete output.bossFixedGreetingSource;
    output.candidateProfileSource = ["text", "boss"].includes(output.candidateProfileSource) ? output.candidateProfileSource : "manual";
    for (const key of ["bossPersonalizedGreeting", "bossGreetingPreviewOnly", "bossGreetingUseAI", "bossGreetingIncludeAI"]) {
      output[key] = output[key] !== false;
    }
    output.autoRecoveryEnabled = output.autoRecoveryEnabled === true;
    output.bossFixedGreetingConfirmed = output.bossFixedGreetingConfirmed === true &&
      Boolean(output.bossFixedGreeting.trim()) && output.bossFixedGreetingConfirmedText === output.bossFixedGreeting;
    if (!output.bossFixedGreetingConfirmed) output.bossFixedGreetingConfirmedText = "";
    output.rememberGreetingKey = output.rememberGreetingKey === true;
    output.greetingOpening = typeof output.greetingOpening === "string" ? output.greetingOpening.replace(/\s+/g, " ").trim().slice(0, 30) : "";
    const length = Number(output.bossGreetingMaxLength);
    output.bossGreetingMaxLength = Number.isFinite(length)
      ? Math.max(180, Math.min(500, Math.floor(length))) : 300;
    delete output.greetingAPIKey;

    output.bossDistanceEnabled = output.bossDistanceEnabled === true;
    const maxDistance = Number(output.bossMaxDistanceKm);
    output.bossMaxDistanceKm = Number.isFinite(maxDistance) ? maxDistance : 0;
    const home = output.bossHomeLocation;
    // 保留一次同步的家庭起点；不会使用浏览器定位来替换。
    output.bossHomeLocation = home && typeof home === "object" &&
      home.coordinateSystem === "gcj02" && Number.isFinite(home.longitude) && Number.isFinite(home.latitude)
      ? { longitude: home.longitude, latitude: home.latitude,
        coordinateSystem: "gcj02", name: String(home.name || "家庭起点").slice(0, 120) } : null;

    return output;
  }

  function saveConfig(nextConfig, silent = false) {
    const previous = config;
    config = normalizeConfig(nextConfig);
    syncGreetingKeyStorage(previous);
    gmSet(CONFIG_KEY, config);
    if (!silent) {
      renderPanel();
    }
  }

  function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function loadHistory() {
    const today = getToday();
    const history = gmGet(getHistoryKey(), null) || {};
    if (history.date !== today) {
      return { date: today, dailyCount: 0, appliedKeys: [] };
    }
    if (!Array.isArray(history.appliedKeys)) history.appliedKeys = [];
    if (!Number.isFinite(Number(history.dailyCount)))
      history.dailyCount = history.appliedKeys.length;
    return history;
  }

  function saveHistory(history) {
    gmSet(getHistoryKey(), history);
  }

  function recordApplied(job) {
    const history = loadHistory();
    const key = getJobUniqueKey(job);
    if (!history.appliedKeys.includes(key)) {
      history.appliedKeys.push(key);
      // BOSS records a confirmed new contact before sending the greeting.
      // Count that contact even if the later message fails; avoid double-counting
      // when the runner records the same successful job again.
      if (state.running) state.submitted = (Number(state.submitted) || 0) + 1;
    }
    history.dailyCount = Math.max(
      Number(history.dailyCount) || 0,
      history.appliedKeys.length,
    );
    saveHistory(history);
  }

  function hasAppliedToday(job) {
    const history = loadHistory();
    return history.appliedKeys.includes(getJobUniqueKey(job));
  }

  // =====================================================================
  // 断点续跑：智联翻页会整页跳转，用 GM 存储把运行状态带到下一页
  // =====================================================================

  function saveResumeState(extra = {}) {
    if (!state.running || state.stopping) return;
    const snapshot = createRunSnapshot(extra);
    if (snapshot) gmSet(RESUME_KEY, snapshot);
  }

  function createRunSnapshot(extra = {}) {
    const platformId = getPlatformId();
    if (!platformId || platformId === "unknown") return null;
    return {
      platform: platformId,
      updatedAt: Date.now(),
      scanned: state.scanned,
      matched: state.matched,
      applied: state.applied,
      submitted: state.submitted,
      roundLimit: state.roundLimit || config.maxApplyCount,
      skipped: state.skipped,
      failed: state.failed,
      previewed: state.previewed,
      current: state.current,
      processedKeys: Array.from(state.processedKeys),
      ...extra,
    };
  }

  function clearResumeState() {
    try {
      gmSet(RESUME_KEY, null);
    } catch (error) {
      // ignore
    }
  }

  function takeResumeState() {
    const saved = gmGet(RESUME_KEY, null);
    if (!saved || typeof saved !== "object") return null;
    // 多标签页场景下不要消费其它平台的续跑状态。
    if (saved.platform !== getPlatformId()) return null;
    // 只消费一次，避免后续页面重复自动启动
    gmSet(RESUME_KEY, null);
    const age = Date.now() - Number(saved.updatedAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return null;
    return saved;
  }
