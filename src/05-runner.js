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
    state.skipped = 0;
    state.failed = 0;
    state.previewed = 0;
    state.platformRemainingQuota = null;
    state.current = "准备开始";
    state.processedKeys = new Set();
  }

  async function startApply(options = {}) {
    if (state.running) return;
    const adapter = getAdapter();
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
    if (adapter.id === "boss" && config.bossPersonalizedGreeting && !getGreetingFacts().length) {
      log("error", "请先填写我的简介与真实经历，再生成岗位招呼语");
      return;
    }
    if (adapter.id === "boss" && config.bossPersonalizedGreeting && !config.bossGreetingPreviewOnly) {
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

    const resume = options.resume || null;
    state.running = true;
    state.stopping = false;

    if (resume) {
      state.scanned = Number(resume.scanned) || 0;
      state.matched = Number(resume.matched) || 0;
      state.applied = Number(resume.applied) || 0;
      state.skipped = Number(resume.skipped) || 0;
      state.failed = Number(resume.failed) || 0;
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
      clearResumeState();
      log(
        "success",
        `任务结束：扫描 ${state.scanned}，匹配 ${state.matched}，预览 ${state.previewed}，成功 ${state.applied}，跳过 ${state.skipped}，失败 ${state.failed}`,
      );
      notify(
        `${adapter.label} 自动投递助手`,
        `任务结束：成功 ${state.applied} 条`,
      );
      renderPanel();
    }
  }

  function stopApply() {
    if (!state.running) return;
    state.stopping = true;
    state.current = "正在停止，等待当前请求结束";
    log("warn", "已请求停止");
    renderPanel();
  }

  async function runApplyLoop(adapter, applySession) {
    let pageRound = 1;

    while (!state.stopping) {
      state.current = `读取第 ${pageRound} 页职位`;
      renderPanel();
      const jobs = await collectJobsWithWait(adapter);
      if (jobs.length === 0) {
        if (adapter.getCards().length === 0) {
          log("warn", "当前页未找到可读取的职位卡片。");
        } else {
          log("debug", "当前页职位均已处理。");
        }
      }

      for (const job of jobs) {
        if (state.stopping) break;
        if (state.applied >= config.maxApplyCount) {
          state.current = "达到单次上限";
          return;
        }

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
      if (state.applied >= config.maxApplyCount) {
        state.current = "达到单次上限";
        return;
      }
      if (!config.autoNextPage) {
        state.current = "当前页处理完成（未开启自动翻页）";
        return;
      }

      state.paginationStopReason = "";
      const moved = await adapter.nextPage();
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

    try {
      // BOSS 专属话术始终读取 JD；其他平台沿用仅在关键词筛选时读取的策略。
      const needJobDetail =
        config.fetchDetail &&
        ((adapter.id === "boss" && (config.bossPersonalizedGreeting || config.bossDistanceEnabled)) ||
          splitKeywords(config.includeDescriptionKeywords).length > 0 ||
          splitKeywords(config.excludeDescriptionKeywords).length > 0);
      const detail = needJobDetail
        ? await safeFetchJobDetail(job, adapter)
        : null;
      const filter = applyFilters(job, detail, adapter);
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
      const result = await adapter.apply(job, adapter.id === "boss" ? detail : applySession);
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
      } else if (result.skipped) {
        state.skipped += 1;
        log(
          "warn",
          `跳过【${formatJob(job)}】：${result.message || "无需重复投递"}`,
        );
        await sleep(randomBetween(500, 1200));
        return;
      } else if (result.limited || result.needsAttention) {
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

      await sleepHumanDelay();
    } catch (error) {
      state.failed += 1;
      log(
        "error",
        `处理失败【${formatJob(job)}】：${error.message || error}`,
        error,
      );
      await sleepHumanDelay();
    } finally {
      renderPanel();
    }
  }

  async function safeFetchJobDetail(job, adapter) {
    try {
      return await adapter.fetchDetail(job);
    } catch (error) {
      log(
        "warn",
        `获取详情失败，继续使用基础信息过滤【${formatJob(job)}】：${error.message || error}`,
      );
      return null;
    }
  }

  function applyFilters(job, detail, adapter) {
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
      if (!job.recruiterOnline) {
        return { ok: false, reason: "无法确认招聘者在线" };
      }
    }

    if (adapter.id === "boss") {
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
      const text = fuzzyText(job, detail);
      if (!textHasInclude(text, includeDesc))
        return { ok: false, reason: "岗位详情不包含指定关键词" };
      if (excludeDesc.length && textHasAny(text, excludeDesc))
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
