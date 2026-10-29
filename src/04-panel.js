// =====================================================================
  // 日志、通知与面板
  // =====================================================================

  function log(level, message, data) {
    if (level === "debug" && !config.debug) return;
    const time = new Date().toLocaleTimeString();
    const entry = { time, level, message, data };
    state.logs.unshift(entry);
    state.logs = state.logs.slice(0, 120);

    const prefix = `[${APP_ID}] ${message}`;
    if (level === "error") console.error(prefix, data || "");
    else if (level === "warn") console.warn(prefix, data || "");
    else if (level === "debug") console.debug(prefix, data || "");
    else console.log(prefix, data || "");

    renderPanel();
  }

  function notify(title, text) {
    try {
      if (typeof GM_notification === "function") {
        GM_notification({ title, text, timeout: 3500 });
      }
    } catch (error) {
      console.warn(`[${APP_ID}] notification failed`, error);
    }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    if (typeof GM_addStyle === "function") {
      const style = GM_addStyle(NOVA_PANEL_CSS);
      if (style?.setAttribute) style.id = STYLE_ID;
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = NOVA_PANEL_CSS;
    document.head.appendChild(style);
  }

  function htmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderPanel() {
    if (!cachedPanel) return;
    const adapter = getAdapter();
    const history = loadHistory();
    const status = state.running
      ? state.stopping ? "停止中" : state.recovering ? "自动恢复中" : "运行中"
      : state.pendingResume ? "等待恢复" : "准备就绪";
    NovaPanel.update(cachedPanel, {
      version: VERSION,
      title: `${adapter?.label || "招聘网站"} 定制招呼助手${BUILD_SUFFIX}`,
      platform: `${adapter?.label || "招聘网站"}${BUILD_SUFFIX}`,
      platformId: adapter?.id || "",
      onlineLabel: adapter?.onlineLabel || "只投递招聘方显示在线的岗位",
      homeSetup: isBossHomeSetupPage(),
      collapsed: state.collapsed,
      running: state.running,
      previewing: Boolean(state.previewing),
      resumeImport: { ...state.resumeImport },
      versionUpdate: getVersionUpdateModel(),
      canStop: Boolean(state.running || state.previewing || state.pendingResume),
      status,
      current: state.bossPacingMessage || state.current,
      counters: { scanned: state.scanned, matched: state.matched, applied: state.applied,
        skipped: state.skipped, failed: state.failed, previewed: state.previewed },
      dailyCount: history.dailyCount,
      dailyLimit: getDailyLimit(adapter),
      remainingQuota: state.platformRemainingQuota,
      roundLimit: state.roundLimit || config.maxApplyCount,
      roundUsed: roundUsedCount(adapter),
      config: { ...config },
      hasKey: Boolean(greetingAPIKey),
      previewError: state.greetingPreviewError || "",
      previewProgress: state.bossPacingMessage || state.greetingPreviewProgress || "",
      logs: state.logs.map(({ time, level, message }) => ({ time, level, message })),
      preview: state.lastGreeting ? {
        origin: state.lastGreeting.origin || "assistant",
        job: state.lastGreeting.job, source: state.lastGreeting.source, text: state.lastGreeting.text,
        review: greetingReviewLabel(state.lastGreeting.proofread), status: state.lastGreeting.proofread?.status || "draft",
      } : null,
    }, gmGet(`${APP_ID}:ui`, {}), preferences => gmSet(`${APP_ID}:ui`, preferences));
  }

  function greetingReviewLabel(review) {
    if (review?.status === "user-confirmed") return "用户已确认原文 · 未使用 AI 校对";
    if (review?.status === "awaiting-confirmation") return "待用户检查确认 · 尚不可发送";
    if (review?.status === "passed" && review.repairRounds) return `重大事实核验通过，已修正并复核`;
    if (review?.status === "repairing") return review.reason || "正在自动修正，尚未发送";
    if (review?.status === "passed") return `重大事实核验通过${review.suggestions?.length ? "，优化建议不影响发送" : ""}`;
    if (review?.status === "checking") return "正在核验重大事实风险，尚未发送";
    if (review?.status === "blocked") return `已阻止发送：${review.reason || "校对未通过"}`;
    return "未校对，仅供草稿预览";
  }

  function collectFormConfig() {
    const form = cachedPanel?.querySelector('[data-role="config-form"]');
    if (!form) return config;
    const next = { ...config };
    // 起点可在另一个 BOSS 路线规划标签页同步；开始前读取最新值。
    next.bossHomeLocation = loadConfig().bossHomeLocation;
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        next[key] = field.checked;
      } else if (field instanceof HTMLInputElement && field.type === "number") {
        next[key] = Number(field.value);
      } else if (
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLInputElement
      ) {
        next[key] = field.value;
      }
    }
    next.bossFixedGreetingConfirmedText = next.bossFixedGreetingConfirmed &&
      next.bossFixedGreeting === config.bossFixedGreeting ? next.bossFixedGreeting : "";
    return normalizeConfig(next);
  }

  function mountPanel() {
    if (!document.body || cachedPanel) return;
    addStyles();
    cachedPanel = document.createElement("div");
    cachedPanel.id = PANEL_ID;
    cachedPanel.setAttribute("data-boss-nova", "");
    document.body.appendChild(cachedPanel);
    cachedPanel.addEventListener("click", handlePanelClick);
    cachedPanel.addEventListener("input", handleFormInput);
    cachedPanel.addEventListener("change", handleFormInput);
    renderPanel();
    initializeVersionUpdates();
  }

  function handleFormInput(event) {
    const form = cachedPanel?.querySelector('[data-role="config-form"]');
    if (!form || !form.contains(event.target)) return;
    if (state.running || state.previewing || state.resumeImport.busy) return;
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      if (event.type === "change" && event.target.name === "resumeTextFile") void importCandidateResumeFile(event.target.files?.[0]);
      return;
    }
    if (event.target.name === "resumeImportDraft") {
      state.resumeImport.draftText = event.target.value;
      return;
    }
    if (["includeDescriptionKeywords", "excludeDescriptionKeywords", "bossCompanySizes", "onlyOnlineBoss", "bossDistanceEnabled", "bossMaxDistanceKm"].includes(event.target.name)) {
      state.lastGreeting = null; state.greetingPreviewError = ""; state.greetingPreviewProgress = "";
    }
    const previousMode = config.bossGreetingMode;
    const previousEnabled = config.bossPersonalizedGreeting;
    const next = collectFormConfig();
    if (event.target.name === "candidateProfile") next.candidateProfileSource = "manual";
    saveConfig(next, true);
    if (["candidateResumeSource", "candidateResumeText"].includes(event.target.name)) {
      state.resumeImport.draftText = "";
      state.resumeImport.message = "简历来源或正文已更新，请重新导入整理；当前使用的经历保持不变。";
    }
    if (["greetingOpening", "candidateIntro", "candidateExperience", "candidateProfile"].includes(event.target.name)) state.lastGreeting = null;
    if (event.target.name === "bossFixedGreeting") {
      const checkbox = form.elements.namedItem("bossFixedGreetingConfirmed");
      if (checkbox) checkbox.checked = config.bossFixedGreetingConfirmed;
      state.lastGreeting = null;
      state.greetingPreviewError = "";
    }
    if (config.bossGreetingMode !== previousMode || config.bossPersonalizedGreeting !== previousEnabled) {
      state.lastGreeting = null;
      state.greetingPreviewError = "";
    }
    renderPanel();
  }

  function handlePanelClick(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (!target) return;
    event.preventDefault();
    const action = target.getAttribute("data-action");
    if (action === "check-version-update") { void checkVersionUpdates(true); return; }
    if (action === "dismiss-version-update") { dismissVersionUpdate(); return; }
    if (action === "install-version-update") { openVersionUpdateInstaller(); return; }
    if (["prepare-resume-text", "read-boss-resume", "apply-resume-draft", "restore-resume-profile", "cancel-resume-import"].includes(action)) {
      void handleResumeImportAction(action);
      return;
    }
    if (state.resumeImport.busy) return;
    if (action === "save-config") {
      if (state.running || state.previewing) return;
      saveConfig(collectFormConfig(), true);
      log("success", "设置已保存至本机");
      return;
    }
    if (action === "audit-delivery") { auditLatestBossGreeting(); return; }
    if (action === "check-job-detail") { diagnoseBossJobDetail(); return; }
    if (action === "probe-pagination") { probeBossPagination(); return; }

    if (["open-home", "sync-home", "refresh-home"].includes(action)) {
      if (state.running || state.previewing) return;
      if (action === "open-home") { saveConfig(collectFormConfig()); openBossHomeSetup(); }
      if (action === "refresh-home") {
        saveConfig(collectFormConfig());
        log("success", config.bossHomeLocation ? "已读取同步的家庭起点" : "尚未同步家庭起点");
      }
      if (action === "sync-home") {
        try { syncBossHomeFromRoute(); } catch (error) { log("warn", error.message); }
      }
      return;
    }

    if (action === "set-greeting-key") {
      setGreetingSessionKey();
      return;
    }

    if (action === "preview-greeting") {
      if (state.running || state.previewing) return;
      saveConfig(collectFormConfig());
      previewBossGreeting();
      renderPanel();
      return;
    }

    if (action === "toggle-collapse") {
      state.collapsed = !state.collapsed;
      renderPanel();
      return;
    }

    if (action === "start") {
      if (state.running || state.previewing) return;
      const limitField = cachedPanel?.querySelector('[name="maxApplyCount"]');
      if (limitField && !limitField.reportValidity()) return;
      saveConfig(collectFormConfig());
      startApply().catch((error) => {
        state.running = false;
        state.stopping = false;
        state.current = "异常停止";
        log("error", `运行异常：${error.message || error}`, error);
      });
      return;
    }

    if (action === "stop") {
      stopApply();
      return;
    }
  }
