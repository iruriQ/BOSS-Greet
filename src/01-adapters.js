// =====================================================================
  // 平台适配器
  // =====================================================================

  const ADAPTERS = {
    boss: {
      id: "boss",
      label: "Boss 直聘",
      onlineLabel: "仅在线 BOSS",
      exampleUrl: "https://www.zhipin.com/web/geek/job",
      isListPage: isBossJobPage,
      ensureLogin: ensureBossLogin,
      getCards: getBossJobCardElements,
      buildJob: buildBossJobDetail,
      fetchDetail: fetchBossJobDetail,
      apply: applyBossJob,
      nextPage: goBossNextPageOrScroll,
      canApply: (job) =>
        Boolean(job?.securityId && job?.encryptJobId && job?.lid),
      noApplyReason: "缺少 securityId / encryptJobId / lid，无法调用投递接口",
      shouldSkip: bossShouldSkip,
      supportsOnlineFilter: true,
    },
    liepin: {
      id: "liepin",
      label: "猎聘",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://www.liepin.com/zhaopin/",
      isListPage: isLiepinListPage,
      ensureLogin: ensureLiepinLogin,
      getCards: getLiepinJobCardElements,
      buildJob: buildLiepinJobDetail,
      fetchDetail: fetchLiepinJobDetail,
      apply: applyLiepinJob,
      nextPage: goLiepinNextPage,
      canApply: (job) =>
        Boolean(job?.actionAvailable || job?.detailUrl || job?.jobId),
      noApplyReason: "未找到聊一聊按钮（可能已沟通或岗位已关闭）",
      supportsOnlineFilter: true,
    },
    zhaopin: {
      id: "zhaopin",
      label: "智联招聘",
      onlineLabel: "仅在线 HR",
      exampleUrl: "https://sou.zhaopin.com/",
      isListPage: isZhaopinListPage,
      ensureLogin: ensureZhaopinLogin,
      getCards: getZhaopinJobCardElements,
      buildJob: buildZhaopinJobDetail,
      fetchDetail: fetchZhaopinJobDetail,
      apply: applyZhaopinJob,
      nextPage: goZhaopinNextPage,
      canApply: (job) =>
        Boolean(job?.applyAvailable || String(job?.applyType) === "1"),
      noApplyReason: "未找到立即投递按钮（可能已投递或需跳转外部投递）",
      supportsOnlineFilter: true,
    },
  };

  function getPlatformId() {
    const host = String(location.hostname || "");
    if (/(^|\.)zhipin\.com$/i.test(host)) return "boss";
    if (/(^|\.)liepin\.com$/i.test(host)) return "liepin";
    if (/(^|\.)zhaopin\.com$/i.test(host)) return "zhaopin";
    return "unknown";
  }

  function getAdapter() {
    return ADAPTERS[getPlatformId()] || null;
  }

  // 平台自身的每日投递上限；智联招聘站内限制为 100 次/天。
  const PLATFORM_DAILY_LIMITS = {
    zhaopin: 100,
  };

  function getDailyLimit(adapter = getAdapter()) {
    const platformLimit = adapter ? PLATFORM_DAILY_LIMITS[adapter.id] : null;
    return Number.isFinite(platformLimit)
      ? Math.min(config.dailyLimit, platformLimit)
      : config.dailyLimit;
  }

  function isSupportedListPage() {
    const adapter = getAdapter();
    return Boolean(adapter && adapter.isListPage());
  }

  function getHistoryKey() {
    const platformId = getPlatformId();
    return platformId === "boss"
      ? HISTORY_KEY
      : `${APP_ID}:${platformId}:history`;
  }
