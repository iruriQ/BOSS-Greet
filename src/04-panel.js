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
    const css = `
      #${PANEL_ID} {
        position: fixed;
        left: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 380px;
        max-height: calc(100vh - 36px);
        overflow: hidden;
        border-radius: 14px;
        background: #ffffff;
        color: #1f2937;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.08);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID} * { box-sizing: border-box; }
      #${PANEL_ID} .aj-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        color: #fff;
        background: linear-gradient(135deg, #00bebd, #12a0a8);
      }
      #${PANEL_ID} .aj-title { font-weight: 700; font-size: 14px; }
      #${PANEL_ID} .aj-subtitle { opacity: .88; font-size: 11px; }
      #${PANEL_ID} .aj-icon-btn {
        border: 0;
        border-radius: 8px;
        padding: 4px 8px;
        cursor: pointer;
        color: #fff;
        background: rgba(255,255,255,.18);
      }
      #${PANEL_ID}.is-collapsed { width: 240px; }
      #${PANEL_ID}.is-collapsed .aj-body { display: none; }
      #${PANEL_ID} .aj-body {
        max-height: calc(100vh - 92px);
        overflow: auto;
        padding: 10px 12px 12px;
      }
      #${PANEL_ID} .aj-status {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
        margin-bottom: 10px;
      }
      #${PANEL_ID} .aj-stat {
        border-radius: 10px;
        padding: 6px 4px;
        background: #f8fafc;
        text-align: center;
        border: 1px solid #e5e7eb;
      }
      #${PANEL_ID} .aj-stat b { display: block; font-size: 15px; color: #0f766e; }
      #${PANEL_ID} .aj-stat span { font-size: 11px; color: #64748b; }
      #${PANEL_ID} .aj-current {
        margin: 8px 0 10px;
        padding: 7px 9px;
        border-radius: 10px;
        background: #f0fdfa;
        color: #115e59;
        border: 1px solid #ccfbf1;
        word-break: break-word;
      }
      #${PANEL_ID} .aj-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${PANEL_ID} .aj-field { display: flex; flex-direction: column; gap: 4px; }
      #${PANEL_ID} .aj-field.aj-wide { grid-column: 1 / -1; }
      #${PANEL_ID} .aj-form > fieldset > .aj-wide { grid-column: 1 / -1; }
      #${PANEL_ID} label { color: #334155; font-size: 12px; }
      #${PANEL_ID} input[type="text"],
      #${PANEL_ID} input[type="number"],
      #${PANEL_ID} select,
      #${PANEL_ID} textarea {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 6px 8px;
        outline: none;
        font: inherit;
        background: #fff;
      }
      #${PANEL_ID} textarea { min-height: 42px; resize: vertical; }
      #${PANEL_ID} input:focus,
      #${PANEL_ID} select:focus,
      #${PANEL_ID} textarea:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20,184,166,.14); }
      #${PANEL_ID} .aj-checks {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 8px;
        padding: 8px;
        border-radius: 10px;
        background: #f8fafc;
        border: 1px solid #e5e7eb;
      }
      #${PANEL_ID} .aj-check {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      #${PANEL_ID} .aj-check input { accent-color: #0d9488; }
      #${PANEL_ID} .aj-actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 7px;
        margin: 10px 0;
      }
      #${PANEL_ID} .aj-btn {
        border: 0;
        border-radius: 9px;
        padding: 7px 8px;
        cursor: pointer;
        font-weight: 650;
        color: #0f172a;
        background: #e2e8f0;
      }
      #${PANEL_ID} .aj-btn:hover { filter: brightness(.98); }
      #${PANEL_ID} .aj-btn-primary { background: #14b8a6; color: #fff; }
      #${PANEL_ID} .aj-btn-danger { background: #ef4444; color: #fff; }
      #${PANEL_ID} .aj-btn:disabled { opacity: .55; cursor: not-allowed; }
      #${PANEL_ID} .aj-logs {
        max-height: 190px;
        overflow: auto;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #0f172a;
        padding: 8px;
      }
      #${PANEL_ID} .aj-log {
        color: #cbd5e1;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        line-height: 1.45;
        padding: 2px 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${PANEL_ID} .aj-log-success { color: #86efac; }
      #${PANEL_ID} .aj-log-warn { color: #fde68a; }
      #${PANEL_ID} .aj-log-error { color: #fca5a5; }
      #${PANEL_ID} .aj-log-debug { color: #93c5fd; }
      #${PANEL_ID} .aj-help { color: #64748b; font-size: 12px; margin: 5px 0; }
      #${PANEL_ID} details { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
      #${PANEL_ID} summary { cursor: pointer; font-weight: 650; }
      #${PANEL_ID} .aj-preview { white-space: pre-wrap; word-break: break-word; line-height: 1.65; }
      #${PANEL_ID} .aj-preview-box { padding: 9px; background: #f0fdfa; border-radius: 9px; margin: 8px 0; }
      #${PANEL_ID} textarea[name="candidateProfile"] { min-height: 180px; }
    `;

    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
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
    const homeSetup = isBossHomeSetupPage();
    cachedPanel.style.left = homeSetup ? "auto" : "";
    cachedPanel.style.right = homeSetup ? "18px" : "";
    if (homeSetup) {
      cachedPanel.innerHTML = `<div class="aj-header"><div><div class="aj-title">同步家庭起点${BUILD_SUFFIX}</div><div class="aj-subtitle">v${VERSION}</div></div></div>
        <div class="aj-body"><p>在 BOSS 地图左侧搜索与 App 家庭位置相同的地标，点击候选结果完成选择，再点击下方按钮。</p>
        <p class="aj-help">网页端无法直接读取 App 已存家庭地址。仅同步你选定的起点；不会把“我的位置”作为家庭地址。</p>
        <button class="aj-btn aj-btn-primary" data-action="sync-home">同步当前起点为家庭位置</button>
        <p class="aj-help">${config.bossHomeLocation ? `已同步：${htmlEscape(config.bossHomeLocation.name)}` : "尚未同步家庭位置"}</p>
        <div class="aj-logs">${state.logs.map((entry) => `<div class="aj-log">${htmlEscape(entry.message)}</div>`).join("")}</div></div>`;
      return;
    }
    const history = loadHistory();
    cachedPanel.classList.toggle("is-collapsed", state.collapsed);
    const runningText = state.running
      ? state.stopping
        ? "停止中"
        : "运行中"
      : "空闲";
    const quotaText =
      state.platformRemainingQuota == null
        ? ""
        : ` · 平台剩余 ${state.platformRemainingQuota}`;
    const dailyLimit = getDailyLimit(adapter);
    const logsHtml = state.logs.length
      ? state.logs
        .map(
          (item) =>
            `<div class="aj-log aj-log-${item.level}">[${htmlEscape(item.time)}] ${htmlEscape(item.message)}</div>`,
        )
        .join("")
      : '<div class="aj-log">暂无日志。点击“开始”按钮进行自动投递。</div>';
    const title = adapter ? `${adapter.label} 定制招呼助手${BUILD_SUFFIX}` : `定制招呼助手${BUILD_SUFFIX}`;
    const onlineLabel = adapter?.onlineLabel || "仅在线 BOSS";
    // 猎聘招呼语只在猎聘页面显示，避免影响另外两个平台的面板。
    const liepinGreetingField =
      adapter?.id === "liepin"
        ? textAreaHtml("liepinGreeting", "猎聘招呼语（未自动发送时补发）")
        : "";
    const shixisengSettings =
      adapter?.id === "shixiseng" ? renderShixisengSettings() : "";
    const distanceFields = adapter?.id === "boss" ? `<details class="aj-wide" open>
      <summary>距家距离筛选</summary>
      ${checkboxHtml("bossDistanceEnabled", "只投递距家范围内的岗位")}
      ${inputHtml("bossMaxDistanceKm", "距家直线距离上限（公里，含边界）", "number", 'min="0.1" max="200" step="0.1"')}
      <p class="aj-help">家庭起点：${config.bossHomeLocation ? htmlEscape(config.bossHomeLocation.name) : "尚未同步"}</p>
      <button class="aj-btn" type="button" data-action="open-home">设置/修改家庭位置</button>
      <button class="aj-btn" type="button" data-action="refresh-home">刷新家庭位置</button>
      <p class="aj-help">首次在 BOSS 路线规划中选择一次与 App 相同的家庭起点。按直线距离筛选，不是通勤路程或时间；无法确认工作地址的岗位会跳过。家庭位置不发送给 AI 服务。</p>
    </details>` : "";
    const bossGreetingFields = adapter?.id === "boss" ? `
      <details class="aj-wide" open>
        <summary>岗位专属招呼语</summary>
        <p class="aj-help">逐岗生成→检查错别字、语序、用词、事实与岗位相关性→通过后直接发送。单条话术未通过则跳过该岗位继续；接口异常、平台限制或发送结果不明时停止，避免误发或重复发送。</p>
        <p class="aj-help">平台开启默认招呼时，可能先自动发出默认内容，本工具再发送岗位专属消息。</p>
        ${checkboxHtml("bossPersonalizedGreeting", "启用岗位专属招呼语")}
        ${checkboxHtml("bossGreetingPreviewOnly", "仅预览，不发送（可选）")}
        ${selectHtml("greetingOpening", "开场问候", [["您好", "您好"], ["你好", "你好"]])}
        ${checkboxHtml("bossGreetingIncludeAI", "每条补充经历中的 AI 提效亮点（可选）")}
        ${inputHtml("candidateIntro", "我的简介（一句身份介绍，可留空）")}
        ${inputHtml("candidateExperience", "工作年限（每条话术必带）")}
        ${textAreaHtml("candidateProfile", "真实经历（每行一项，写成可直接发送的完整句子）")}
        ${inputHtml("bossGreetingMaxLength", "招呼语字数上限（180—500）", "number", 'min="180" max="500"')}
        <details>
          <summary>AI 服务（自动发送前校对必填）</summary>
          <p class="aj-help">每条待发送话术均需模型校对。经历、岗位描述和话术会发送到所填服务；修正后再复核。下方语义匹配开关只控制经历选择，不会关闭校对。密钥仅在本次页面会话有效。</p>
          ${checkboxHtml("bossGreetingUseAI", "使用 AI 选择经历")}
          ${inputHtml("greetingAIEndpoint", "完整 Chat Completions 接口地址")}
          ${inputHtml("greetingAIModel", "模型名称")}
          <p class="aj-help">API Key：${greetingAPIKey ? "本次页面已配置" : "尚未配置"}。通过浏览器弹窗输入，不放入页面输入框。</p>
          <button class="aj-btn" type="button" data-action="set-greeting-key">设置本次 API Key</button>
          ${config.greetingAllowedHttpOrigin ? `<p class="aj-help">已指定的 HTTP 接口：${htmlEscape(config.greetingAllowedHttpOrigin)}。该接口使用明文传输。</p>` : ""}
        </details>
      </details>` : "";
    const preview = adapter?.id === "boss" && state.lastGreeting ? `
      <div class="aj-preview-box">
        <b>最近一次生成</b>
        <p class="aj-help">${htmlEscape(state.lastGreeting.job)}<br>${htmlEscape(state.lastGreeting.source)} · ${Array.from(state.lastGreeting.text).length} 字<br>${htmlEscape(greetingReviewLabel(state.lastGreeting.proofread))}</p>
        <div class="aj-preview">${htmlEscape(state.lastGreeting.text)}</div>
      </div>` : "";

    cachedPanel.innerHTML = `
      <div class="aj-header">
        <div>
          <div class="aj-title">${htmlEscape(title)}</div>
          <div class="aj-subtitle">v${VERSION} · ${runningText} · 今日已投 ${history.dailyCount}/${dailyLimit}${quotaText}</div>
        </div>
        <button class="aj-icon-btn" data-action="toggle-collapse">${state.collapsed ? "展开" : "收起"}</button>
      </div>
      <div class="aj-body">
        <div class="aj-status" ${adapter?.id === "boss" ? 'style="grid-template-columns:repeat(6,1fr)"' : ""}>
          <div class="aj-stat"><b>${state.scanned}</b><span>扫描</span></div>
          <div class="aj-stat"><b>${state.matched}</b><span>匹配</span></div>
          <div class="aj-stat"><b>${state.applied}</b><span>成功</span></div>
          <div class="aj-stat"><b>${state.skipped}</b><span>跳过</span></div>
          <div class="aj-stat"><b>${state.failed}</b><span>失败</span></div>
          ${adapter?.id === "boss" ? `<div class="aj-stat"><b>${state.previewed}</b><span>预览</span></div>` : ""}
        </div>
        <div class="aj-current">当前：${htmlEscape(state.current)}</div>
        <form class="aj-form" data-role="config-form">
          <fieldset style="display:contents" ${state.running || state.previewing ? "disabled" : ""}>
          <div class="aj-checks">
            ${checkboxHtml("onlyOnlineBoss", onlineLabel)}
            ${checkboxHtml("debug", "调试日志")}
          </div>
          ${textAreaHtml("includeDescriptionKeywords", "岗位详情包含关键词")}
          ${textAreaHtml("excludeDescriptionKeywords", "岗位详情排除关键词")}
          ${distanceFields}
          ${liepinGreetingField}
          ${shixisengSettings}
          ${bossGreetingFields}
          </fieldset>
        </form>
        <div class="aj-actions">
          <button class="aj-btn aj-btn-primary" data-action="start" ${state.running || state.previewing ? "disabled" : ""}>开始</button>
          <button class="aj-btn aj-btn-danger" data-action="stop" ${state.running ? "" : "disabled"}>停止</button>
          ${adapter?.id === "boss" ? `<button class="aj-btn" data-action="preview-greeting" ${state.running || state.previewing ? "disabled" : ""}>${state.previewing ? "正在生成…" : "预览首个岗位话术"}</button>` : ""}
          ${adapter?.id === "boss" ? `<button class="aj-btn" data-action="audit-delivery" ${state.running || state.previewing ? "disabled" : ""}>核查未确认发送（只读）</button>` : ""}
          ${adapter?.id === "boss" ? `<button class="aj-btn" data-action="probe-pagination" ${state.running || state.previewing ? "disabled" : ""}>检查/加载更多（不投递）</button>` : ""}
        </div>
        ${preview}
        <div class="aj-logs">${logsHtml}</div>
      </div>
    `;
  }

  function renderShixisengSettings() {
    const resumeOptions = [
      ["", "请选择简历"],
      ["online", "在线简历"],
      ["attach", "附件简历（同时投递在线简历）"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${config.shixisengResume === value ? "selected" : ""}>${label}</option>`,
      )
      .join("");
    return `
      <div class="aj-field aj-wide">
        <label>实习僧投递简历</label>
        <select name="shixisengResume">${resumeOptions}</select>
      </div>
      ${selectHtml("shixisengReportTime", "到岗时间", ["", "1周内", "2周内", "1个月内", "3个月内"], "跟随职位默认")}
      ${selectHtml("shixisengInternshipTime", "实习时长", ["", "3个月以内", "3-6个月", "6个月以上"], "跟随职位默认")}
      ${selectHtml("shixisengDays", "每周出勤", ["", "1天", "2天", "3天", "4天", "5天", "6天"], "跟随职位默认")}
    `;
  }

  function checkboxHtml(name, label) {
    return `<label class="aj-check"><input type="checkbox" name="${name}" ${config[name] ? "checked" : ""}> ${label}</label>`;
  }

  function textAreaHtml(name, label) {
    return `
      <div class="aj-field aj-wide">
        <label>${label}</label>
        <textarea name="${name}">${htmlEscape(config[name])}</textarea>
      </div>
    `;
  }

  function selectHtml(name, label, options, defaultLabel = "") {
    return `<div class="aj-field aj-wide"><label>${htmlEscape(label)}</label><select name="${name}">${options.map(option => {
      const [value, text] = Array.isArray(option) ? option : [option, option || defaultLabel];
      return `<option value="${htmlEscape(value)}" ${config[name] === value ? "selected" : ""}>${htmlEscape(text)}</option>`;
    }).join("")}</select></div>`;
  }

  function inputHtml(name, label, type = "text", extra = "") {
    return `<div class="aj-field aj-wide"><label>${htmlEscape(label)}</label><input type="${type}" name="${name}" value="${htmlEscape(config[name])}" ${extra}></div>`;
  }

  function greetingReviewLabel(review) {
    if (review?.status === "passed") return `校对通过${review.corrections ? `，已修正 ${review.corrections} 处并复核` : ""}`;
    if (review?.status === "checking") return "正在校对，尚未发送";
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
    return normalizeConfig(next);
  }

  function mountPanel() {
    if (!document.body || cachedPanel) return;
    addStyles();
    cachedPanel = document.createElement("div");
    cachedPanel.id = PANEL_ID;
    document.body.appendChild(cachedPanel);
    cachedPanel.addEventListener("click", handlePanelClick);
    cachedPanel.addEventListener("input", handleFormInput);
    cachedPanel.addEventListener("change", handleFormInput);
    renderPanel();
  }

  function handleFormInput(event) {
    const form = cachedPanel?.querySelector('[data-role="config-form"]');
    if (!form || !form.contains(event.target)) return;
    if (state.running || state.previewing) return;
    saveConfig(collectFormConfig(), true);
  }

  function handlePanelClick(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (!target) return;
    event.preventDefault();
    const action = target.getAttribute("data-action");
    if (action === "audit-delivery") { auditLatestBossGreeting(); return; }
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
