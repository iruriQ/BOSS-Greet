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
      publishedAt: getBossPublishedAt(raw),
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
    job.recruiterOnline = getBossRecruiterOnline(job, null) === true;

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

  function bossDetailReadError(stage, response, data, fallback = "") {
    const message = normalizeText(data?.message || data?.msg || fallback).slice(0, 180);
    const status = response?.status;
    const code = data?.code;
    const error = new Error(`${stage}${status ? ` HTTP ${status}` : ""}${code !== undefined ? `，code=${code}` : ""}${message ? `：${message}` : ""}`);
    error.stopPreview = [401, 403, 429].includes(status) || [31, 32, 35, 36, 37, 5002, 5003, 5004].includes(Number(code)) || /登录|验证|频繁|访问受限|环境.*异常/.test(message);
    return error;
  }

  async function requestBossJobDetail(path, params, stage) {
    await waitForBossOperation("read");
    let response;
    try {
      response = await fetch(`${path}?${params.toString()}`, {
        method: "GET", credentials: "include", headers: buildBossDetailHeaders(),
      });
      assertBossPlatformReady();
    } catch (error) {
      if (error.stopPreview) throw error;
      throw bossDetailReadError(stage, null, null, error.message || "网络请求失败");
    }
    let data;
    try { data = JSON.parse(await response.text()); }
    catch { throw bossDetailReadError(stage, response, null, "返回内容不是岗位 JSON 数据，可能是验证页或网络错误页"); }
    if (!response.ok || (data?.code !== undefined && data.code !== 0)) {
      const error = bossDetailReadError(stage, response, data);
      if (error.stopPreview) throw stopForBossPlatform(error.message);
      throw error;
    }
    const detail = data?.zpData?.jobCard || data?.zpData || data?.data;
    if (!detail || typeof detail !== "object" || Array.isArray(detail))
      throw bossDetailReadError(stage, response, data, "返回数据中缺少岗位详情");
    return detail;
  }

  async function fetchBossJobDetail(job) {
    assertBossPlatformReady();
    const pageView = getBossJobDetailView(job);
    if (pageView) return readBossJobDetailFromPage(job, pageView);
    if (!job.securityId || !job.lid) {
      log("debug", `缺少详情字段，跳过详情请求：${formatJob(job)}`);
      return null;
    }
    const params = new URLSearchParams({ lid: job.lid, securityId: job.securityId, _: String(Date.now()) });
    const detail = await requestBossJobDetail("/wapi/zpgeek/job/card.json", params, "岗位卡片接口");
    if (((usesBossAIGreeting() || splitKeywords(config.includeDescriptionKeywords).length ||
          splitKeywords(config.excludeDescriptionKeywords).length) && !getGreetingJD(detail)) ||
        (config.bossDistanceEnabled && !getBossWorkPoint(null, detail))) {
      const full = await requestBossJobDetail("/wapi/zpgeek/job/detail.json", params, "岗位完整详情接口");
      return { ...detail, ...full, postDescription: getGreetingJD(full) };
    }
    return detail;
  }

  async function diagnoseBossJobDetail() {
    if (state.running || state.previewing || state.resumeImport.busy) return;
    state.previewing = true; state.stopping = false;
    renderPanel();
    try {
      beginManualBossAction();
      const adapter = getAdapter();
      const job = adapter?.id === "boss" && adapter.getCards().map((card, index) => adapter.buildJob(card, index)).find(Boolean);
      if (!job) throw new Error("当前没有可检查的岗位");
      const detail = await fetchBossJobDetail(job);
      if (!detail) throw new Error("岗位卡片缺少读取所需字段");
      const full = getBossJobDetailView(job) ? detail : await requestBossJobDetail("/wapi/zpgeek/job/detail.json", new URLSearchParams({lid:job.lid,securityId:job.securityId,_:String(Date.now())}), "岗位完整详情接口");
      const online = getBossRecruiterOnline(job, full);
      log("success", `岗位完整详情检查通过【${formatJob(job)}】：描述${getGreetingJD(full) ? "已读取" : "缺失"}，工作坐标${getBossWorkPoint(job, full) ? "已读取" : "缺失"}，招聘者${online === true ? "当前在线" : online === false ? "当前不在线" : "未提供在线状态"}；未调用 AI 或发送消息`);
    } catch (error) { log("error", `岗位读取检查失败：${error.message || error}`); }
    finally { state.previewing = false; state.stopping = false; renderPanel(); }
  }

  // Only explicit publication fields are accepted. Recruiter activity, refresh
  // times, job IDs and arbitrary numbers must never be treated as publication.
  function getBossPublishedAt(raw, now = Date.now()) {
    for (const source of [raw?.jobInfo, raw]) {
      for (const field of ["firstPublishTime", "jobPublishTime", "publishTime", "publishDate", "publishedAt", "releaseTime", "releaseDate"]) {
        const value = source?.[field];
        if (value === null || value === undefined || value === "") continue;
        let timestamp = NaN;
        if (typeof value === "number" || /^\d{10}(?:\d{3})?$/.test(String(value))) {
          const n = Number(value); timestamp = n < 1e12 ? n * 1000 : n;
        } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s]|$)/.test(String(value))) {
          timestamp = Date.parse(String(value));
        }
        if (Number.isFinite(timestamp) && timestamp >= 946684800000 && timestamp <= now + 60000) return timestamp;
      }
    }
    return null;
  }

  function orderBossJobsByPublication(jobs) {
    return jobs.map((job, index) => ({ job, index, time: getBossPublishedAt(job) ?? getBossPublishedAt(job.raw) }))
      .sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity) || a.index - b.index).map(item => item.job);
  }

  async function prepareBossLatestOrder() {
    if (typeof document.querySelectorAll !== "function") return false;
    // Use the platform's own "latest publication" sort when exposed, retaining
    // the existing intent/search filters. Do not invent API sorting parameters.
    const controls = [...document.querySelectorAll('button, a, [role="option"], [role="tab"]')]
      .filter(node => !cachedPanel?.contains(node) && isElementVisible(node) && /^(最新发布|最新职位|按发布时间排序)$/.test(normalizeText(node.textContent)));
    if (controls.length === 1) {
      const control = controls[0];
      const isSelected = node => node && (node.getAttribute('aria-selected') === 'true' || node.getAttribute('aria-pressed') === 'true' || /(^|\s)(active|selected|is-active)(\s|$)/.test(node.className));
      if (!isSelected(control)) {
        await waitForBossOperation("read");
        control.click();
        let confirmed = false;
        for (let i = 0; i < 20 && !state.stopping; i++) {
          await sleep(250);
          const updated = [...document.querySelectorAll('button, a, [role="option"], [role="tab"]')]
            .find(node => !cachedPanel?.contains(node) && /^(最新发布|最新职位|按发布时间排序)$/.test(normalizeText(node.textContent)) && isSelected(node));
          if (updated) { confirmed = true; break; }
        }
        if (!confirmed) { log('warn', '未能确认平台最新发布排序已生效，将按可确认的时间处理已加载岗位'); return false; }
      }
      log('info', '已采用平台最新发布排序，保留当前岗位方向及筛选条件');
      return true;
    }
    return false;
  }

  function getBossCompanySize(job, detail) {
    const sources = [job, detail?.brandComInfo, detail?.brandInfo, detail?.companyInfo, detail?.jobInfo, detail];
    for (const source of sources) {
      for (const key of ["brandScaleName", "companyScaleName", "scaleName"]) {
        const text = String(source?.[key] || "").replace(/\s/g, "").replace(/[—–~～至]/g, "-");
        if (/^(?:少于20人|20人以下|0-20人)$/.test(text)) return "0-20人";
        if (/^(?:10000人以上|10000\+人|10000人及以上)$/.test(text)) return "10000人以上";
        if (BOSS_COMPANY_SIZES.includes(text)) return text;
      }
    }
    return "";
  }
  function filterBossCompanySize(job, detail) {
    const selected = normalizeCompanySizes(config.bossCompanySizes);
    if (!selected.length) return { ok: true };
    const size = getBossCompanySize(job, detail);
    if (!size) return { ok: false, reason: "无法确认公司规模，已跳过" };
    return selected.includes(size) ? { ok: true } : { ok: false, reason: `公司规模 ${size} 不在选中范围` };
  }

  function bossShouldSkip(_job, detail) {
    const activeDesc = detail?.bossInfo?.activeTimeDesc || detail?.jobCard?.bossInfo?.activeTimeDesc || detail?.activeTimeDesc;
    if (config.activeWithinDays > 0 && activeDesc) {
      const activeDays = parseActiveDays(activeDesc);
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
    await waitForBossOperation("contact");
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
    assertBossPlatformReady();
    if ([31, 32, 35, 36, 37, 5002, 5003, 5004].includes(Number(data?.code)) || isLoginOrVerifyText(extractBossMessage(data))) {
      throw stopForBossPlatform(`BOSS 暂停操作：${extractBossMessage(data) || `code=${data?.code}`}`);
    }
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
    // 只处理平台明确给出的单岗位经历不匹配；不点击继续、不重试该岗位。
    // 账号/验证/频率等限制优先，其他未知提醒仍保留人工检查。
    if (!limited && isBossJobExperienceMismatch(fullMessage)) {
      return {
        ok: false,
        skipped: true,
        jobMismatch: true,
        message: `BOSS 提示该岗位工作经历不匹配，未继续开聊或发送话术；继续筛选其他岗位：${fullMessage}`,
        raw: data,
      };
    }
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

  // Match the normal same-origin detail request. Never log or persist this
  // transient page token, and do not synthesize platform challenge tokens.
  function buildBossDetailHeaders() {
    const headers = buildBossHeaders();
    try {
      const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      const token = pageWindow?._PAGE?.token;
      if (typeof token === "string" && token.split("|")[0]) headers.token = token.split("|")[0];
    } catch {}
    return headers;
  }

  function getBossRecruiterOnline(job, detail) {
    for (const source of [detail?.bossInfo, detail?.jobCard?.bossInfo, detail, detail?.jobCard, job?.raw?.bossInfo, job?.raw]) {
      for (const key of ["bossOnline", "online", "isOnline"]) {
        const value = source?.[key];
        if (value === true || value === 1 || value === "1" || value === "true") return true;
        if (value === false || value === 0 || value === "0" || value === "false") return false;
      }
    }
    if (typeof job?.bossOnline === "boolean") return job.bossOnline;
    if (job?.recruiterOnline === true) return true;
    // Only the recruiter's dedicated marker counts; arbitrary job text and
    // recent-activity descriptions must never imply current online presence.
    if (job?.card?.querySelector?.(".boss-online-tag, .boss-online-icon")) return true;
    return undefined;
  }

  function getBossJobDetailView(job) {
    const seen = new Set();
    for (let node = job?.card, depth = 0; node && depth < 16; node = node.parentElement, depth++) {
      for (let view = node.__vue__, parent = 0; view && parent < 16 && !seen.has(view); view = view.$parent, parent++) {
        seen.add(view);
        if (view.currentJob && typeof view.jobDetail === "object" && "jobDetailLoading" in view) return view;
      }
    }
    return null;
  }

  async function readBossJobDetailFromPage(job, view) {
    assertBossPlatformReady();
    const ready = () => {
      const detail = view.jobDetail;
      const id = detail?.jobInfo?.encryptId || detail?.jobInfo?.encryptJobId;
      if (view.currentJob?.encryptJobId !== job.encryptJobId || view.jobDetailLoading ||
          !detail?.jobInfo || (id && id !== job.encryptJobId)) return null;
      return detail;
    };
    let detail = ready();
    if (!detail) {
      await waitForBossOperation("read");
      // The normal job-card click lets BOSS load its own detail pane. Do not
      // invoke internal request clients or manufacture security challenge data.
      const target = job.card.matches?.(".job-card-box, .job-card-body") ? job.card
        : job.card.querySelector?.(".job-card-box, .job-card-body") || job.card;
      target.click();
      for (let poll = 0; poll < 80; poll++) {
        assertBossPlatformReady();
        if (state.stopping) throw new Error("已停止读取岗位详情");
        if (/\/safe-validate|\/captcha/.test(location.pathname || "")) break;
        await sleep(250);
        detail = ready();
        if (detail) break;
      }
    }
    if (!detail) {
      const error = new Error("BOSS 网页未能加载当前岗位详情，已停止；请在网页查看是否需要登录或验证后手动重试");
      error.stopPreview = true;
      throw error;
    }
    return { ...detail, postDescription: getGreetingJD(detail) };
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

  function isBossJobExperienceMismatch(message) {
    return /工作(?:经验|经历)(?:与(?:该)?(?:岗位|职位)(?:要求)?)?不匹配/.test(normalizeText(message || ""));
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
