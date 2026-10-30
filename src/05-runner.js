// =====================================================================
  // 通用运行流程
  // =====================================================================

  function getJobUniqueKey(job) {
    if (job?.key) return job.key;
    // Boss 保持原有 key 结构，兼容历史记录。
    return [
      job.securityId,
      job.encryptJobId,
      job.lid,
      job.jobName,
      job.brandName,
    ]
      .map((item) => normalizeText(item))
      .join("|");
  }

  function resetRunCounters() {
    state.scanned = 0;
    state.matched = 0;
    state.applied = 0;
    state.submitted = 0;
    state.roundLimit = config.maxApplyCount;
    state.skipped = 0;
    state.failed = 0;
    state.previewed = 0;
    state.platformRemainingQuota = null;
    state.current = "准备开始";
    state.processedKeys = new Set();
  }

  async function startApply(options = {}) {
    if (state.running || state.resumeImport.busy) return;
    if (!Number.isInteger(config.maxApplyCount) || config.maxApplyCount < 1 || config.maxApplyCount > 150) {
      log("warn", "本轮投递数量请填写 1 至 150 的整数");
      return;
    }
    const adapter = getAdapter();
    if (adapter?.id === "boss") {
      try {
        if (options.resume) assertBossPlatformReady();
        else beginManualBossAction();
      } catch (error) { log("warn", error.message); renderPanel(); return; }
    }
    if (state.previewing) return;
    if (!adapter || !adapter.isListPage()) {
      log(
        "warn",
        `请先打开 ${adapter?.label || "招聘网站"} 的职位列表页面，例如 ${adapter?.exampleUrl || ""}`,
      );
      return;
    }

    let login;
    try {
      login = adapter.ensureLogin();
    } catch (error) {
      login = { ok: false, reason: `登录状态检查失败：${error.message || error}` };
    }
    if (!login.ok) {
      log("error", login.reason || "登录状态不可用，请先登录。");
      return;
    }

    if (adapter.id === "boss") {
      try { validateBossDistanceConfig(config); } catch (error) {
        log("error", error.message);
        return;
      }
    }
    if (adapter.id === "boss" && config.bossPersonalizedGreeting && config.bossGreetingMode === "fixed") {
      try { validateFixedBossGreeting(config, !config.bossGreetingPreviewOnly); } catch (error) {
        log("error", error.message);
        return;
      }
    }
    if (adapter.id === "boss" && usesBossAIGreeting() && !getGreetingFacts().length) {
      log("error", "请先填写我的简介与真实经历，再生成岗位招呼语");
      return;
    }
    if (adapter.id === "boss" && usesBossAIGreeting() && !config.bossGreetingPreviewOnly) {
      try { validateGreetingReviewConfig(config); } catch (error) {
        log("error", `尚不能自动发送：${error.message || error}。配置后即可按“生成→校对→发送”自动处理。`);
        return;
      }
    }

    const history = loadHistory();
    if (!isGreetingPreviewRun(adapter) && history.dailyCount >= getDailyLimit(adapter)) {
      log("warn", `已达每日上限（${getDailyLimit(adapter)} 次）`);
      return;
    }

    const resume = options.resume || state.pendingResume || null;
    if (needsGreetingKey(adapter)) {
      if (!resume) resetRunCounters();
      if (config.autoRecoveryEnabled) deferRunForGreetingKey(resume || createRunSnapshot());
      else { state.current = "请先设置 AI 密钥，再开始"; log("warn", state.current); renderPanel(); }
      return;
    }
    state.pendingResume = null;
    clearResumeState();
    state.running = true;
    state.stopping = false;

    if (resume) {
      state.scanned = Number(resume.scanned) || 0;
      state.matched = Number(resume.matched) || 0;
      state.applied = Number(resume.applied) || 0;
      state.submitted = Math.max(state.applied, Number.isInteger(resume.submitted) ? resume.submitted : 0);
      state.roundLimit = Math.min(config.maxApplyCount, resume.roundLimit == null
        ? config.maxApplyCount : normalizeApplyLimit(resume.roundLimit));
      state.skipped = Number(resume.skipped) || 0;
      state.failed = Number(resume.failed) || 0;
      state.previewed = Number(resume.previewed) || 0;
      state.platformRemainingQuota = null;
      state.processedKeys = new Set(
        Array.isArray(resume.processedKeys) ? resume.processedKeys : [],
      );
      state.current = "继续上次任务";
      log(
        "success",
        `已恢复上次任务：已成功 ${state.applied}，跳过 ${state.skipped}，失败 ${state.failed}`,
      );
    } else {
      resetRunCounters();
      log("success", `开始自动投递（${adapter.label}）`);
    }

    let applySession;
    try {
      applySession = adapter.createApplySession?.();
      if (adapter.createApplySession && !applySession) {
        state.current = "无法打开投递页面";
        log("error", "浏览器阻止了投递页面，请允许本站弹出窗口后重试。");
        return;
      }
      await runApplyLoop(adapter, applySession);
    } finally {
      adapter.closeApplySession?.(applySession);
      state.running = false;
      state.stopping = false;
      state.current = state.current || "已结束";
      if (state.pendingResume && config.autoRecoveryEnabled) {
        gmSet(RESUME_KEY, { ...state.pendingResume, phase: "awaiting-key", updatedAt: Date.now() });
        log("warn", "任务已暂停，等待更新 AI 密钥；设置后自动继续，投递记录已保留");
      } else {
        clearResumeState();
        log(
          "success",
          `任务结束：扫描 ${state.scanned}，匹配 ${state.matched}，预览 ${state.previewed}，成功 ${state.applied}，跳过 ${state.skipped}，失败 ${state.failed}`,
        );
        notify(`${adapter.label} 自动投递助手`, `任务结束：成功 ${state.applied} 条`);
      }
      renderPanel();
    }
  }

  function stopApply() {
    if (state.previewing && !state.running) {
      state.stopping = true;
      state.greetingPreviewProgress = "正在停止筛选预览，等待当前请求结束";
      renderPanel();
      return;
    }
    if (!state.running && !state.pendingResume) return;
    state.pendingResume = null;
    clearResumeState();
    state.stopping = state.running;
    state.current = state.running ? "正在停止，等待当前请求结束" : "已手动停止";
    log("warn", "已请求停止");
    renderPanel();
  }

  function roundUsedCount(adapter) {
    return isGreetingPreviewRun(adapter) ? state.previewed : Math.max(state.applied, state.submitted);
  }

  function stopAtRoundLimit(adapter) {
    const limit = state.roundLimit || config.maxApplyCount;
    if (roundUsedCount(adapter) < limit) return false;
    state.current = isGreetingPreviewRun(adapter)
      ? `本轮已预览 ${state.previewed} 个，达到设定数量 ${limit} 个，已停止；未实际投递`
      : `本轮已使用 ${roundUsedCount(adapter)} 个投递名额，达到设定数量 ${limit} 个，已停止`;
    log("info", state.current);
    return true;
  }

  async function runApplyLoop(adapter, applySession) {
    let pageRound = 1;
    const platformLatestOrder = adapter.id === "boss" && typeof prepareBossLatestOrder === "function"
      ? await prepareBossLatestOrder() : false;
    let reportedPublicationOrder = false;

    while (!state.stopping) {
      if (stopAtRoundLimit(adapter)) return;
      state.current = `读取第 ${pageRound} 页职位`;
      renderPanel();
      let jobs = await collectJobsWithWait(adapter);
      if (adapter.id === "boss" && typeof orderBossJobsByPublication === "function") {
        const known = jobs.filter(job => getBossPublishedAt(job) !== null || getBossPublishedAt(job.raw) !== null).length;
        jobs = orderBossJobsByPublication(jobs);
        if (jobs.length && !reportedPublicationOrder && !platformLatestOrder) {
          log(known ? "info" : "warn", known
            ? `已加载岗位中 ${known} 个可确认发布时间，按新到旧处理；其他岗位保留平台顺序。未提供全列表时间，不能保证跨页排序。`
            : "平台当前列表未提供可确认的岗位发布时间或最新排序入口，沿用平台顺序；不会用招聘方活跃时间代替发布时间。");
          reportedPublicationOrder = true;
        }
      }
      if (jobs.length === 0) {
        if (adapter.getCards().length === 0) {
          log("warn", "当前页未找到可读取的职位卡片。");
        } else {
          log("debug", "当前页职位均已处理。");
        }
      }

      for (const job of jobs) {
        if (state.stopping) break;
        if (stopAtRoundLimit(adapter)) return;

        const history = loadHistory();
        if (!isGreetingPreviewRun(adapter) && history.dailyCount >= getDailyLimit(adapter)) {
          state.current = "已达每日上限";
          log("warn", `已达每日上限（${getDailyLimit(adapter)} 次）`);
          return;
        }

        await handleOneJob(job, adapter, applySession);
        saveResumeState();
      }

      if (state.stopping) break;
      if (stopAtRoundLimit(adapter)) return;
      if (!config.autoNextPage) {
        state.current = "当前页处理完成（未开启自动翻页）";
        return;
      }

      state.paginationStopReason = "";
      const moved = await nextPageWithAutoRecovery(adapter);
      if (!moved) {
        if (state.stopping) {
          if (state.current === "正在停止，等待当前请求结束") state.current = "已手动停止";
          return;
        }
        state.current = state.paginationStopReason || "没有更多职位";
        return;
      }

      saveResumeState({ phase: "pagination" });
      pageRound += 1;
      await sleep(config.pageDelaySec * 1000);
    }

    // 平台限额/登录风控也会设置 stopping，保留其具体原因，不要覆盖成“手动停止”。
    if (state.current === "正在停止，等待当前请求结束") {
      state.current = "已手动停止";
    }
  }

  async function collectJobsWithWait(adapter) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const cards = adapter.getCards();
      if (cards.length > 0) {
        const jobs = cards
          .map((card, index) => adapter.buildJob(card, index))
          .filter(Boolean);
        return dedupeJobs(jobs).filter(
          (job) => !state.processedKeys.has(getJobUniqueKey(job)),
        );
      }
      await sleep(500);
    }
    return [];
  }

  function dedupeJobs(jobs) {
    const result = [];
    const seen = new Set();
    for (const job of jobs) {
      const key = getJobUniqueKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(job);
    }
    return result;
  }

  async function handleOneJob(job, adapter, applySession) {
    const key = getJobUniqueKey(job);
    state.processedKeys.add(key);
    state.scanned += 1;
    state.current = formatJob(job);
    renderPanel();

    let startedJob = false;
    try {
      if (adapter.id === "boss") await waitForBossJobGap();
      if (state.stopping) return;
      startedJob = true;
      // BOSS 保留活跃度、已沟通和距离等详情筛选；固定话术不要求 JD 或 AI 服务。
      const needJobDetail =
        config.fetchDetail &&
        ((adapter.id === "boss") ||
          splitKeywords(config.includeDescriptionKeywords).length > 0 ||
          splitKeywords(config.excludeDescriptionKeywords).length > 0);
      const titleFilter = filterJobTitle(job);
      const detail = titleFilter.ok && needJobDetail
        ? await safeFetchJobDetail(job, adapter)
        : null;
      const filter = titleFilter.ok ? applyFilters(job, detail, adapter) : titleFilter;
      if (!filter.ok) {
        state.skipped += 1;
        log("warn", `跳过【${formatJob(job)}】：${filter.reason}`);
        // 猎聘需要额外请求详情页做关键词过滤，跳过时稍作停顿，避免请求过密。
        if (adapter.id === "liepin") {
          await sleep(randomBetween(500, 1200));
        }
        return;
      }

      state.matched += 1;

      if (state.stopping) return;
      const result = await applyWithAutoRecovery(job, detail, adapter, applySession);
      if (state.stopping && !result.ok) return;
      if (adapter.id === "boss" && config.autoRecoveryEnabled && result.recoveryKind === "credentials") {
        // 鉴权失败发生在开聊前；保留本岗位用于更新密钥后的续跑。
        state.processedKeys.delete(key);
        state.scanned -= 1;
        state.matched -= 1;
        greetingAPIKey = "";
        storeGreetingKey();
        deferRunForGreetingKey(createRunSnapshot());
        state.stopping = true;
        return;
      }
      if (result.preview) {
        state.previewed += 1;
      } else if (result.ok) {
        state.applied += 1;
        recordApplied(job);
        if (Number.isFinite(result.remainingQuota)) {
          state.platformRemainingQuota = result.remainingQuota;
        }
        if (result.softSuccess) {
          const quotaNote = Number.isFinite(result.remainingQuota)
            ? `（平台剩余 ${result.remainingQuota} 次）`
            : "";
          log(
            "success",
            `投递成功${quotaNote}【${formatJob(job)}】：${result.message || ""}`,
          );
        } else {
          log("success", `投递成功【${formatJob(job)}】`);
        }
        if (
          Number.isFinite(result.remainingQuota) &&
          result.remainingQuota <= 3
        ) {
          log("warn", `平台沟通机会仅剩 ${result.remainingQuota} 次`);
        }
      } else if (result.pendingReview) {
        log("warn", `待检查【${formatJob(job)}】：${result.message}`);
        return;
      } else if (result.skipped) {
        state.skipped += 1;
        log(
          "warn",
          `跳过【${formatJob(job)}】：${result.message || "无需重复投递"}`,
        );
        if (adapter.id !== "boss") await sleep(randomBetween(500, 1200));
        return;
      } else if (result.limited || result.needsAttention) {
        // No conversation was opened: keep this job eligible for a manual retry.
        if (result.retryableJob) state.processedKeys.delete(key);
        state.failed += 1;
        log(
          "error",
          `平台限制或需人工处理【${formatJob(job)}】：${result.message}`,
        );
        state.current = result.message || "平台限制";
        state.stopping = true;
        return;
      } else {
        state.failed += 1;
        log("error", `投递失败【${formatJob(job)}】：${result.message}`);
      }

      if (adapter.id !== "boss") await sleepHumanDelay();
    } catch (error) {
      if (state.stopping) return;
      state.failed += 1;
      if (adapter.id === "boss" && error.stopPreview) {
        state.stopping = true;
        state.current = "BOSS 岗位读取受限，请在网页检查后手动重试";
        log("error", `${state.current}：${error.message || error}`);
        return;
      }
      log(
        "error",
        `处理失败【${formatJob(job)}】：${error.message || error}`,
        error,
      );
      if (adapter.id !== "boss") await sleepHumanDelay();
    } finally {
      if (adapter.id === "boss" && startedJob) markBossJobFinished();
      renderPanel();
    }
  }

  async function safeFetchJobDetail(job, adapter) {
    try {
      return await adapter.fetchDetail(job);
    } catch (error) {
      if (adapter.id === "boss" && error.stopPreview) throw error;
      log(
        "warn",
        `获取详情失败，将跳过无法确认的筛选条件【${formatJob(job)}】：${error.message || error}`,
      );
      return null;
    }
  }

  function filterJobTitle(job) {
    const keywords = normalizeKeywordEntries(config.excludeTitleKeywords);
    if (!keywords.length) return { ok: true, reason: "" };
    const title = normalizeText(job?.jobName);
    if (!title) return { ok: false, reason: "无法读取岗位名称，不能确认名称排除条件" };
    const matched = keywords.find(word => textHasAny(title, [word.toLowerCase()]));
    return matched ? { ok: false, reason: `岗位名称命中排除关键词「${matched}」` } : { ok: true, reason: "" };
  }

  function applyFilters(job, detail, adapter) {
    const titleFilter = filterJobTitle(job);
    if (!titleFilter.ok) return titleFilter;
    if (!adapter.canApply(job)) {
      return { ok: false, reason: adapter.noApplyReason || "缺少投递所需字段" };
    }

    if (job.contact) return { ok: false, reason: "已经沟通过或已投递" };

    if (config.skipAppliedHistory && hasAppliedToday(job)) {
      return { ok: false, reason: "今日历史中已投递" };
    }

    if (config.skipHeadhunter && job.isHeadhunter) {
      return { ok: false, reason: "过滤猎头" };
    }

    if (config.onlyOnlineBoss && adapter.supportsOnlineFilter) {
      const online = adapter.id === "boss" ? getBossRecruiterOnline(job, detail) : job.recruiterOnline;
      if (online !== true) {
        return { ok: false, reason: online === false ? "招聘者当前不在线" : "平台未提供可确认的招聘者在线状态" };
      }
    }

    if (adapter.id === "boss") {
      const scale = filterBossCompanySize(job, detail);
      if (!scale.ok) return scale;
      const distance = filterBossHomeDistance(job, detail);
      if (!distance.ok) return distance;
    }

    const platformSkip = adapter.shouldSkip?.(job, detail);
    if (platformSkip?.skip) {
      return { ok: false, reason: platformSkip.reason };
    }

    const includeDesc = splitKeywords(config.includeDescriptionKeywords);
    const excludeDesc = splitKeywords(config.excludeDescriptionKeywords);
    if (includeDesc.length || excludeDesc.length) {
      if (adapter.id === "boss" && !getGreetingJD(detail))
        return { ok: false, reason: "无法读取完整岗位详情，不能确认关键词条件" };
      const text = fuzzyText(job, detail);
      if (!textHasInclude(text, includeDesc))
        return { ok: false, reason: "岗位详情不包含指定关键词" };
      if (!includeDesc.length && excludeDesc.length && textHasAny(text, excludeDesc))
        return { ok: false, reason: "岗位详情命中排除关键词" };
    }

    return { ok: true, reason: "" };
  }

  function formatJob(job) {
    const title = normalizeText(job?.jobName) || "未知职位";
    const company = normalizeText(job?.brandName) || "未知公司";
    const salary = normalizeText(job?.salaryDesc);
    return `${title} - ${company}${salary ? ` - ${salary}` : ""}`;
  }

  function isGreetingPreviewRun(adapter) {
    return adapter?.id === "boss" && config.bossPersonalizedGreeting && config.bossGreetingPreviewOnly;
  }
