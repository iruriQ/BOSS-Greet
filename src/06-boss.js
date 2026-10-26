// =====================================================================
  // Boss 直聘
  // =====================================================================

  function isBossJobPage() {
    return /https:\/\/www\.zhipin\.com\/web\/geek\/(job|jobs|job-recommend|overseas)/.test(
      location.href,
    );
  }

  function ensureBossLogin() {
    const token = getCookie("bst");
    if (!token) {
      return {
        ok: false,
        reason: "未读取到登录 token。请先在浏览器里自行登录 Boss 直聘。",
      };
    }
    return { ok: true };
  }

  function getBossJobCardElements() {
    return collectCardsBySelectors(BOSS_SELECTORS.jobCards, {
      preferVisible: false,
    });
  }

  function buildBossJobDetail(card, index) {
    const raw = pickJobData(card) || {};
    const text = normalizeText(card.innerText || card.textContent || "");
    const jobName =
      pickFirstString(raw, ["jobName", "jobTitle", "title", "positionName"]) ||
      pickDomText(card, [
        ".job-name",
        ".job-title",
        ".job-card-left .job-name",
      ]);
    const brandName =
      pickFirstString(raw, [
        "brandName",
        "companyName",
        "brandFullName",
        "companyFullName",
      ]) ||
      pickDomText(card, [
        ".company-name",
        ".company-text .name",
        ".company-info .name",
      ]);
    const salaryDesc =
      pickFirstString(raw, ["salaryDesc", "salary", "salaryName"]) ||
      pickDomText(card, [".salary", ".job-salary", ".salary-desc"]);

    const job = {
      platform: "boss",
      index,
      card,
      raw,
      rawText: text,
      securityId: pickFirstString(raw, ["securityId", "securityID"]),
      encryptJobId: pickFirstString(raw, [
        "encryptJobId",
        "jobId",
        "encryptJobID",
      ]),
      lid: pickFirstString(raw, ["lid", "listId"]),
      encryptBossId: pickFirstString(raw, [
        "encryptBossId",
        "encryptUserId",
        "bossId",
        "encryptBossID",
      ]),
      jobName,
      brandName,
      salaryDesc,
      cityName: pickFirstString(raw, ["cityName", "city"]),
      areaDistrict: pickFirstString(raw, [
        "areaDistrict",
        "districtName",
        "area",
      ]),
      businessDistrict: pickFirstString(raw, [
        "businessDistrict",
        "businessArea",
      ]),
      brandScaleName: pickFirstString(raw, [
        "brandScaleName",
        "companyScaleName",
        "scaleName",
      ]),
      brandIndustry: pickFirstString(raw, ["brandIndustry", "industryName"]),
      jobLabels: raw.jobLabels || raw.labels || raw.skills || [],
      skills: raw.skills || [],
      contact: Boolean(
        raw.contact ||
        raw.friendStatus === 1 ||
        raw.friendStatus === "1" ||
        /已沟通|继续沟通/.test(text),
      ),
      bossOnline: pickBoolean(raw, ["bossOnline", "online", "isOnline"]),
      goldHunter: raw.goldHunter,
    };

    job.isHeadhunter =
      job.goldHunter === 1 ||
      job.goldHunter === "1" ||
      /猎头/.test(job.rawText);
    job.recruiterOnline =
      job.bossOnline === true || /在线/.test(job.rawText);

    if (!job.jobName && !job.brandName && !job.securityId) return null;
    return job;
  }

  function pickJobData(card) {
    const candidates = [];
    const directKeys = [
      "__vue__",
      "__vue_app__",
      "__vueParentComponent",
      "_vnode",
    ];

    for (const key of directKeys) {
      if (card[key]) candidates.push(card[key]);
    }

    if (card.__vue__) {
      candidates.push(
        card.__vue__.data,
        card.__vue__._data,
        card.__vue__._props,
        card.__vue__.$props,
      );
    }
    if (card.__vueParentComponent) {
      candidates.push(
        card.__vueParentComponent.props,
        card.__vueParentComponent.ctx,
        card.__vueParentComponent.setupState,
        card.__vueParentComponent.proxy,
      );
    }

    return findJobLikeObject(candidates);
  }

  function findJobLikeObject(seedList) {
    return findObjectByPredicate(seedList, looksLikeJobData, 4);
  }

  function looksLikeJobData(obj) {
    if (!obj || typeof obj !== "object") return false;
    const hasApplyFields = Boolean(
      (obj.securityId || obj.securityID) &&
      (obj.encryptJobId || obj.jobId) &&
      obj.lid,
    );
    const hasJobText = Boolean(
      obj.jobName ||
      obj.jobTitle ||
      obj.title ||
      obj.brandName ||
      obj.companyName,
    );
    return hasApplyFields || (hasJobText && Boolean(obj.securityId || obj.lid));
  }

  async function fetchBossJobDetail(job) {
    if (!job.securityId || !job.lid) {
      log("debug", `缺少详情字段，跳过详情请求：${formatJob(job)}`);
      return null;
    }

    const params = new URLSearchParams({
      lid: job.lid,
      securityId: job.securityId,
      sessionId: "",
    });
    const response = await fetch(
      `/wapi/zpgeek/job/card.json?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
        headers: buildBossHeaders(),
      },
    );
    const data = await parseResponse(response);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (
      data &&
      typeof data === "object" &&
      data.code !== undefined &&
      data.code !== 0
    ) {
      throw new Error(data.message || `接口返回 code=${data.code}`);
    }

    const detail = data?.zpData?.jobCard || data?.zpData || data?.data || null;
    if ((config.bossPersonalizedGreeting && !getGreetingJD(detail)) ||
        (config.bossDistanceEnabled && !getBossWorkPoint(null, detail))) {
      const fullResponse = await fetch(`/wapi/zpgeek/job/detail.json?${params.toString()}`, {
        method: "GET", credentials: "include", headers: buildBossHeaders(),
      });
      const fullData = await parseResponse(fullResponse);
      if (!fullResponse.ok || fullData?.code !== 0) throw new Error("岗位完整详情读取失败");
      const full = fullData.zpData || {};
      return { ...detail, ...full, postDescription: getGreetingJD(full) };
    }
    return detail;
  }

  function bossShouldSkip(_job, detail) {
    if (config.activeWithinDays > 0 && detail?.activeTimeDesc) {
      const activeDays = parseActiveDays(detail.activeTimeDesc);
      if (Number.isFinite(activeDays) && activeDays > config.activeWithinDays) {
        return { skip: true, reason: "boss活跃度未达标,已过滤" };
      }
    }

    if (detail?.friendStatus === 1 || detail?.friendStatus === "1") {
      return { skip: true, reason: "详情接口显示已沟通" };
    }

    return { skip: false, reason: "" };
  }

  function parseActiveDays(value) {
    const text = String(value || "");
    if (!text || /刚刚|今日|今天|当前|在线|分钟|小时/.test(text)) return 0;

    let match = text.match(/(\d+)\s*日/);
    if (match) return Number(match[1]);

    match = text.match(/(\d+)\s*天/);
    if (match) return Number(match[1]);

    match = text.match(/(\d+)\s*周/);
    if (match) return Number(match[1]) * 7;

    match = text.match(/(\d+)\s*月/);
    if (match) return Number(match[1]) * 30;

    match = text.match(/(\d+)\s*年/);
    if (match) return Number(match[1]) * 365;

    if (/周/.test(text)) return 7;
    if (/月/.test(text)) return 30;
    if (/年/.test(text)) return 365;
    return Number.POSITIVE_INFINITY;
  }

  async function openBossConversation(job) {
    const params = new URLSearchParams({
      securityId: job.securityId,
      jobId: job.encryptJobId,
      lid: job.lid,
    });

    const response = await fetch(
      `/wapi/zpgeek/friend/add.json?${params.toString()}`,
      {
        method: "POST",
        credentials: "include",
        headers: buildBossHeaders(),
      },
    );
    const data = await parseResponse(response);
    debugBossResponse(job, response, data);

    if (!response.ok) {
      return {
        ok: false,
        limited: response.status === 403 || response.status === 429,
        message: `HTTP ${response.status}`,
        raw: data,
      };
    }

    const message = extractBossMessage(data);
    const chatRemindDialog = getChatRemindDialog(data);
    const chatRemindText = chatRemindDialog
      ? dialogToText(chatRemindDialog)
      : "";
    const fullMessage = normalizeText(
      [message, chatRemindText].filter(Boolean).join("；"),
    );
    const remainingQuota = parseRemainingQuota(fullMessage);

    if (
      data?.code === 0 ||
      data?.message === "Success" ||
      message === "Success"
    ) {
      return {
        ok: true,
        message: message || "Success",
        remainingQuota,
        raw: data,
      };
    }

    const limited = isHardLimitMessage(fullMessage);
    const isChatRemind =
      Boolean(chatRemindDialog) || /开聊提醒/.test(fullMessage);
    if (isChatRemind && !limited && config.treatChatRemindAsSuccess) {
      return {
        ok: true,
        softSuccess: true,
        message: chatRemindText || message || "开聊提醒",
        remainingQuota,
        raw: data,
      };
    }

    return {
      ok: false,
      limited,
      message: fullMessage || `接口返回 code=${data?.code}`,
      raw: data,
    };
  }

  function buildBossHeaders() {
    const token = getCookie("bst");
    const headers = {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (token) headers.Zp_token = token;
    return headers;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return { code: response.ok ? 0 : response.status, message: text };
    }
  }

  function extractBossMessage(data) {
    if (!data) return "";
    const dialogText = dialogToText(getChatRemindDialog(data));
    return normalizeText(
      dialogText ||
        data.message ||
        data.msg ||
        data?.zpData?.message ||
        data?.zpData?.bizData?.toast ||
        data?.zpData?.toast ||
        "",
    );
  }

  function getChatRemindDialog(data) {
    if (!data || typeof data !== "object") return null;
    return (
      data?.zpData?.bizData?.chatRemindDialog ||
      data?.zpData?.chatRemindDialog ||
      data?.chatRemindDialog ||
      null
    );
  }

  function dialogToText(dialog) {
    if (!dialog || typeof dialog !== "object") return "";
    const values = [];
    const visit = (value, depth = 0) => {
      if (value == null || depth > 3) return;
      if (typeof value === "string" || typeof value === "number") {
        const text = normalizeText(value);
        if (text) values.push(text);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value === "object") {
        for (const key of [
          "title",
          "content",
          "subTitle",
          "desc",
          "text",
          "buttonText",
          "confirmText",
          "cancelText",
        ]) {
          if (Object.prototype.hasOwnProperty.call(value, key))
            visit(value[key], depth + 1);
        }
      }
    };
    visit(dialog);
    return [...new Set(values)].join("；");
  }

  function parseRemainingQuota(message) {
    const text = normalizeText(message || "");
    const match = text.match(/(?:还剩|剩余)\s*(\d+)\s*次/);
    return match ? Number(match[1]) : null;
  }

  function isHardLimitMessage(message) {
    const text = message || "";
    const remainingQuota = parseRemainingQuota(text);
    if (remainingQuota === 0) return true;
    return /上限|今日沟通人数已达|频繁|验证|验证码|登录|失效|安全|风控|异常|稍后|暂时无法|账号/.test(
      text,
    );
  }

  function debugBossResponse(job, response, data) {
    const message = extractBossMessage(data);
    if (
      !config.debug &&
      response.ok &&
      (data?.code === 0 || message === "Success")
    )
      return;
    console.groupCollapsed(
      `[${APP_ID}] 投递接口响应 ${response.status} ${data?.code ?? ""} ${formatJob(job)}`,
    );
    console.log("message:", message);
    console.log("chatRemindDialog:", getChatRemindDialog(data));
    console.log("raw:", data);
    console.groupEnd();
  }

  async function scrollForMoreJobs(label) {
    const scrollContainer = [
      ".job-list-container",
      ".job-list",
      ".recommend-job-list",
      ".job-recommend-result",
      ".recommend-result-inner",
      ".page-job-inner",
      // 智联新版拆分/内部滚动布局
      "[class*='jobs-list-sort-scroll']",
      "[class*='job-sort-scroll']",
      "[class*='job-list-panel']",
      "[class*='job-split-layout']",
      "[class*='joblist-box']",
    ]
      .map((selector) => document.querySelector(selector))
      .find(Boolean);

    if (scrollContainer) {
      const before = scrollContainer.scrollTop + scrollContainer.clientHeight;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
      await sleep(1000);
      const after = scrollContainer.scrollTop + scrollContainer.clientHeight;
      if (after > before + 20) {
        log("debug", `${label} 已滚动职位列表加载更多`);
        return true;
      }
    }

    const pageBefore = window.scrollY + window.innerHeight;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
    await sleep(1000);
    const pageAfter = window.scrollY + window.innerHeight;
    if (pageAfter > pageBefore + 20) {
      log("debug", `${label} 已滚动页面加载更多`);
      return true;
    }

    return false;
  }
