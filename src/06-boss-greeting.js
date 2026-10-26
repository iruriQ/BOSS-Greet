// 使用 BOSS 原生聊天页的输入框发送，避免依赖未核实的“自定义招呼语保存”接口。
// 当前网页的路由参数为 id（encryptBossId）；编辑器 conversation$ 提供当前招聘者和岗位身份。
function bossGreetingRecipientKey(job) {
  return normalizeText(job.encryptBossId);
}

function loadBossGreetingLedger() {
  const saved = gmGet(GREETING_LEDGER_KEY, {});
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
}

function recordBossGreeting(job, status, extra = {}) {
  const ledger = loadBossGreetingLedger();
  ledger[bossGreetingRecipientKey(job)] = {
    ...ledger[bossGreetingRecipientKey(job)], ...extra,
    jobId: job.encryptJobId, jobName: job.jobName, status, updatedAt: Date.now(),
  };
  gmSet(GREETING_LEDGER_KEY, ledger);
}

function getBossEditor(doc) {
  return doc.querySelector('#chat-input[contenteditable="true"], .chat-input[contenteditable="true"], textarea.chat-input');
}

function getBossEditorConversation(doc) {
  let node = getBossEditor(doc);
  for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
    const view = node.__vue__;
    if (!view) continue;
    for (const data of [view.conversation$, view.$data?.conversation$, view.conversation]) {
      const value = data?.value || data;
      if (value && typeof value === "object" && value.encryptBossId) return value;
    }
  }
  return null;
}

function isBossGreetingConversation(doc, job) {
  const current = getBossEditorConversation(doc);
  return Boolean(current && String(current.encryptBossId) === String(job.encryptBossId) &&
    String(current.encryptJobId || current.jobId || "") === String(job.encryptJobId));
}

function findConfirmedBossGreeting(doc, text) {
  for (const node of doc.querySelectorAll(".message-item.item-myself")) {
    let view = node.__vue__;
    for (let depth = 0; view && depth < 3; depth += 1, view = view.$parent) {
      const message = view.message || view.$props?.message;
      // 当前站点：0 为本地待发送，1 为服务器投递确认，2 为已读，4 为发送失败。
      if (message?.isSelf && [1, 2].includes(Number(message.status)) &&
        normalizeText(message.text) === normalizeText(text)) return true;
    }
    // BOSS 当前 MessageStatus 将服务器状态 1/2 分别渲染为
    // status-delivery/status-read。部分列表节点没有挂载 message Vue 属性，
    // 此时核对同一条本人消息的完整正文及平台回执，不能只凭气泡出现算成功。
    const content = node.querySelector?.(".text-content");
    const confirmed = node.querySelector?.(".message-status.status-delivery, .message-status.status-read");
    const pendingOrFailed = node.querySelector?.(".message-status.status-loading, .message-status.status-error");
    if (content && confirmed && !pendingOrFailed &&
        normalizeText(content.textContent) === normalizeText(text)) return true;
  }
  return false;
}

function bossGreetingChatURL(job) {
  const params = new URLSearchParams({ id: job.encryptBossId, jobId: job.encryptJobId, securityId: job.securityId || "", lid: job.lid || "", source: "0" });
  return `/web/geek/chat?${params.toString()}`;
}

function bossHistoryMessageDelivered(message, identity, text) {
  if (!identity?.selfId || !identity?.bossId || !message || message.newSubmit === true ||
      !/^\d+$/.test(String(message.mid || "")) || Number(message.mid) <= 0 ||
      String(message.from?.uid) !== identity.selfId || String(message.to?.uid) !== identity.bossId ||
      Number(message.to?.source || 0) !== identity.source || Number(message.body?.type) !== 1 ||
      normalizeText(message.body?.text) !== normalizeText(text)) return false;
  // BOSS 原生历史记录转换：已存服务端消息 !newSubmit 且本人 status=0，
  // 按 DELIVERED=1 展示；只在真实 historyMsg 响应中应用，不用于本地气泡。
  return [0, 1, 2].includes(Number(message.status));
}

async function readBossGreetingHistory(doc, job) {
  if (!isBossGreetingConversation(doc, job)) throw new Error("聊天身份未确认，未读取历史");
  const current = getBossEditorConversation(doc);
  const selfId = String(doc.defaultView?._PAGE?.uid || "");
  const bossId = String(current.friendId || current.uid || "");
  const source = Number(current.friendSource || 0);
  if (!/^\d+$/.test(selfId) || !/^\d+$/.test(bossId) || selfId === bossId || !Number.isInteger(source) || source < 0) {
    throw new Error("缺少收发双方身份，不能用聊天记录确认投递");
  }
  const params = new URLSearchParams({ bossId: job.encryptBossId, groupId: "", maxMsgId: "0", c: "20", page: "1",
    src: String(source), securityId: current.securityId || job.securityId || "", gid: "" });
  const controller = new doc.defaultView.AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await doc.defaultView.fetch(`/wapi/zpchat/geek/historyMsg?${params}`, {
      method: "GET", credentials: "include", headers: buildBossHeaders(), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`服务端记录请求返回 HTTP ${response.status}`);
    const data = await response.json();
    if (data?.code !== 0 || !Array.isArray(data?.zpData?.messages)) throw new Error("服务端记录不可用或格式未确认");
    if (!isBossGreetingConversation(doc, job)) throw new Error("核查时聊天身份发生变化");
    return { messages: data.zpData.messages, identity: { selfId, bossId, source } };
  } finally { window.clearTimeout(timer); }
}

async function auditLatestBossGreeting() {
  if (state.running || state.previewing) return;
  const pending = Object.entries(loadBossGreetingLedger()).filter(([, value]) => value?.status === "unconfirmed")
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
  if (!pending) { log("success", "没有待核查的未确认发送记录"); return; }
  const [bossId, record] = pending;
  const job = { encryptBossId: bossId, encryptJobId: record.jobId, jobName: record.jobName };
  state.previewing = true;
  state.current = "只读核查最近一次未确认发送";
  renderPanel();
  const frame = document.createElement("iframe");
  frame.title = "只读核查发送记录";
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:1100px;height:800px;border:0;";
  frame.src = bossGreetingChatURL(job);
  document.body.appendChild(frame);
  try {
    let doc;
    for (let attempt = 0; attempt < 40; attempt++) {
      doc = frame.contentDocument;
      if (doc && isBossGreetingConversation(doc, job)) break;
      await sleep(500);
    }
    const result = await readBossGreetingHistory(doc, job);
    if (record.expectedText && result.messages.some((message) => bossHistoryMessageDelivered(message, result.identity, record.expectedText))) {
      if (loadBossGreetingLedger()[bossId]?.updatedAt === record.updatedAt) recordBossGreeting(job, "sent", { confirmationSource: "server-history" });
      log("success", `服务端确认【${record.jobName}】话术已投递，未再次发送`);
    } else {
      const ownDelivered = result.messages.filter((message) => bossHistoryMessageDelivered(message, result.identity, message.body?.text || "")).length;
      log("warn", `已读取【${record.jobName}】服务端记录：最近20条中有${ownDelivered}条本人已投递文字。${record.expectedText ? "未找到完整一致的话术，保留未确认记录" : "旧版未保存完整待核查话术，保留原记录；请结合聊天页核查"}。本次未发送消息。`);
    }
  } catch (error) { log("warn", `只读核查未完成：${error.message || error}；未重发`); }
  finally {
    frame.remove(); state.previewing = false; state.current = "核查结束，未发送新消息"; renderPanel();
  }
}

async function sendBossGreetingInChat(job, text, review) {
  assertGreetingReviewed(text, review);
  const frame = document.createElement("iframe");
  frame.title = "岗位招呼语发送";
  frame.src = bossGreetingChatURL(job);
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:1100px;height:800px;border:0;";
  document.body.appendChild(frame);
  try {
    let doc = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (state.stopping) throw new Error("已停止，未发送岗位招呼语");
      try { doc = frame.contentDocument; } catch { doc = null; }
      if (doc && isBossGreetingConversation(doc, job) && getBossEditor(doc)) break;
      await sleep(500);
    }
    if (!doc || !isBossGreetingConversation(doc, job)) throw new Error("无法核实聊天窗口的招聘者及岗位身份，请在聊天页人工处理");
    if (findConfirmedBossGreeting(doc, text)) return { confirmed: true, existing: true };
    const editor = getBossEditor(doc);
    const draft = normalizeText(editor.value || editor.textContent);
    if (draft) throw new Error("聊天框已有草稿，保留原文并停止发送");
    const win = doc.defaultView;
    editor.focus();
    if (editor.tagName === "TEXTAREA") {
      Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value").set.call(editor, text);
    } else {
      editor.textContent = text;
    }
    editor.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(300);
    const button = doc.querySelector(".btn-send");
    if (state.stopping || !isBossGreetingConversation(doc, job)) throw new Error("发送前会话已变化或任务已停止");
    if (!button || isDisabled(button) || normalizeText(editor.value || editor.textContent) !== normalizeText(text)) {
      throw new Error("招呼语输入或发送按钮状态未确认");
    }
    recordBossGreeting(job, "sending", { expectedText: text });
    assertGreetingReviewed(text, review);
    button.click(); // 唯一一次发送动作；超时不再点击，也不切换通道补发。
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (!isBossGreetingConversation(doc, job)) throw new Error("发送后会话身份发生变化，无法确认结果");
      if (findConfirmedBossGreeting(doc, text)) return { confirmed: true };
      if ([6, 24, 70].includes(attempt)) {
        try {
          const history = await readBossGreetingHistory(doc, job);
          if (history.messages.some((message) => bossHistoryMessageDelivered(message, history.identity, text))) {
            return { confirmed: true, source: "server-history" };
          }
        } catch (error) {
          log("debug", `只读确认暂不可用：${error.message || error}`);
        }
      }
      await sleep(500);
    }
    throw new Error("已点击发送，但未收到消息投递确认，请人工核查；程序不会自动重发");
  } finally {
    frame.remove();
  }
}

async function applyBossJob(job, detail) {
  const settings = { ...config };
  const distance = filterBossHomeDistance(job, detail, settings);
  if (!distance.ok) return { ok: false, skipped: true, message: distance.reason };
  if (!settings.bossPersonalizedGreeting) return openBossConversation(job);
  if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
  job.encryptBossId = pickFirstString(detail, ["encryptBossId", "encryptUserId"]) || job.encryptBossId;
  let greeting;
  try {
    greeting = await prepareBossGreeting(job, detail, settings);
  } catch (error) {
    if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
    if (error.code === "GREETING_JOB_CONTENT") {
      return { ok: false, skipped: true, message: `已跳过该岗位并继续，未开聊或发送：${error.message}` };
    }
    return { ok: false, needsAttention: true, message: `发送前校对未通过：${error.message || error}` };
  }
  state.lastGreeting = { ...greeting, job: formatJob(job) };
  renderPanel();
  if (settings.bossGreetingPreviewOnly) {
    log("success", `仅预览【${formatJob(job)}】（${greeting.source}）：${greeting.text}`);
    return { ok: false, preview: true, message: "仅预览，未发送" };
  }
  if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
  assertGreetingReviewed(greeting.text, greeting.proofread);
  if (!job.encryptBossId) return { ok: false, skipped: true, message: "缺少招聘者身份，未发起沟通" };
  const locks = window.navigator?.locks;
  if (!locks?.request) return { ok: false, needsAttention: true, message: "浏览器不支持跨标签页互斥，请使用新版 Chrome/Edge 后重试" };
  return locks.request(`${APP_ID}:boss-greeting-send`, { ifAvailable: true }, async (lock) => {
    if (!lock) return { ok: false, skipped: true, message: "另一个标签页正在发送招呼语" };
    if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
    const previous = loadBossGreetingLedger()[bossGreetingRecipientKey(job)];
    if (previous) return { ok: false, skipped: true, message: `该招聘者已有处理记录（${previous.status}），不自动重复发送` };
    // 建立沟通之前记录，网络中断、刷新或跨标签页重跑都不会盲目重发。
    recordBossGreeting(job, "opening");
    try {
      const contact = await openBossConversation(job);
      if (!contact.ok || contact.softSuccess) {
        recordBossGreeting(job, "contact-unconfirmed");
        return { ...contact, ok: false, needsAttention: true, message: `沟通未确认，未发送专属话术：${contact.message || "请人工核查"}` };
      }
      // 已建立沟通会消耗平台额度，即便后续话术失败也要保留每日投递记录。
      recordApplied(job);
      recordBossGreeting(job, "contact-opened");
      await sendBossGreetingInChat(job, greeting.text, greeting.proofread);
      recordBossGreeting(job, "sent");
      return { ...contact, ok: true, message: "岗位专属招呼语已确认投递" };
    } catch (error) {
      recordBossGreeting(job, "unconfirmed");
      return { ok: false, needsAttention: true, message: `招呼语发送未完成：${error.message || error}` };
    }
  });
}
