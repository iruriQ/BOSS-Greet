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

function isInformationalBossQuotaReminder(contact) {
  const message = normalizeText(contact?.message || "");
  const remaining = parseRemainingQuota(message);
  return contact?.ok === true && contact.softSuccess === true && !contact.limited &&
    Number.isInteger(remaining) && remaining > 0 && remaining === contact.remainingQuota &&
    /今天已与\s*\d+\s*位\s*BOSS\s*沟通/i.test(message) &&
    /(?:还剩|剩余)\s*\d+\s*次\s*沟通机会/.test(message) && !isHardLimitMessage(message);
}

// BOSS 网页 v6789 的额度提醒：remindType=2 的确认按钮携带继续开聊 URL。
// 只使用平台返回、属于本岗位的同源 friend/add 地址；确认请求最多一次。
async function confirmBossQuotaReminder(job, contact) {
  if (!isInformationalBossQuotaReminder(contact)) throw new Error("不是可继续的剩余额度提醒");
  const dialog = getChatRemindDialog(contact.raw);
  const buttons = dialog?.buttonList;
  if (dialog?.remindType !== 2 || !Array.isArray(buttons) || buttons.length !== 1 ||
      !/^(?:好|好的|确定|继续沟通)$/.test(normalizeText(buttons[0]?.text))) {
    throw new Error("额度提醒的确认按钮无法核实，未自动确认");
  }
  let url;
  try { url = new URL(buttons[0].webUrl, "https://www.zhipin.com"); }
  catch { throw new Error("额度提醒的继续地址无效"); }
  if (url.origin !== "https://www.zhipin.com" || url.username || url.password || url.hash ||
      url.pathname !== "/wapi/zpgeek/friend/add.json" ||
      url.searchParams.getAll("jobId").length !== 1 || url.searchParams.get("jobId") !== String(job.encryptJobId) ||
      url.searchParams.getAll("securityId").length !== 1 || url.searchParams.get("securityId") !== String(job.securityId)) {
    throw new Error("额度提醒的继续地址与当前岗位不符，未自动确认");
  }
  if (state.stopping) throw new Error("任务已停止，未确认额度提醒");
  await waitForBossOperation("contact");
  recordBossGreeting(job, "confirming-quota", { sendAttempted: false });
  const response = await fetch(url.pathname + url.search, {
    method: "POST", credentials: "include", headers: buildBossHeaders(),
  });
  const data = await parseResponse(response);
  assertBossPlatformReady();
  if (!response.ok || data?.code !== 0) {
    throw new Error(`额度提醒确认未成功：${extractBossMessage(data) || `HTTP ${response.status}`}；不重复确认`);
  }
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
  await waitForBossOperation("read", { root: doc });
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

function bossGreetingNotSentError(reason) {
  const error = new Error(`发送前状态未就绪：${reason}，未点击发送`);
  error.code = "BOSS_GREETING_NOT_SENT";
  return error;
}

async function prepareBossGreetingInput(doc, job, text) {
  const expected = normalizeText(text);
  let insertions = 0, lastInputPoll = -6, stable = 0, reason = "输入框未就绪";
  for (let poll = 0; poll <= 20; poll++) {
    if (state.stopping || !isBossGreetingConversation(doc, job)) throw new Error("发送前会话已变化或任务已停止");
    const blocked = autoRecoveryBlockReason(doc) || autoRecoveryBlockReason();
    if (blocked) throw new Error(`${blocked}，未点击发送`);
    const editor = getBossEditor(doc);
    const current = normalizeText(editor?.value || editor?.textContent);
    if (current && current !== expected) throw new Error("输入框出现其他内容，保留原文并暂停，请人工核查");
    if (editor && !current && insertions < 3 && poll - lastInputPoll >= 6) {
      const win = doc.defaultView;
      editor.focus();
      if (editor.tagName === "TEXTAREA") {
        Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value").set.call(editor, text);
      } else { editor.textContent = text; }
      const InputEventClass = win.InputEvent || win.Event;
      editor.dispatchEvent(new InputEventClass("input", { bubbles: true, inputType: "insertText", data: text }));
      insertions++;
      lastInputPoll = poll;
    }
    const button = doc.querySelector(".btn-send");
    const inputMatches = editor && normalizeText(editor.value || editor.textContent) === expected;
    reason = !editor ? "输入框未就绪" : !inputMatches ? "完整话术尚未保留在输入框" : !button ? "未找到发送按钮" : "发送按钮仍不可用";
    if (inputMatches && button && !isDisabled(button)) {
      // 连续两次确认，等待前端渲染稳定；期间只填写空输入框，不点击发送。
      if (++stable >= 2) return { editor, button };
    } else { stable = 0; }
    if (poll < 20) await sleep(500);
  }
  throw bossGreetingNotSentError(`已等待10秒，${reason}；尝试填写${insertions}次`);
}

async function sendBossGreetingInChat(job, text, review, { confirmQuotaReminder = false, onConversationConfirmed, settings = config } = {}) {
  assertBossGreetingAuthorized(text, review, settings);
  await waitForBossOperation("read");
  const frame = document.createElement("iframe");
  frame.title = "岗位招呼语发送";
  frame.src = bossGreetingChatURL(job);
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:1100px;height:800px;border:0;";
  document.body.appendChild(frame);
  let sendAttempted = false;
  try {
    let doc = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (state.stopping) throw new Error("已停止，未发送岗位招呼语");
      try { doc = frame.contentDocument; } catch { doc = null; }
      if (doc && autoRecoveryBlockReason(doc)) throw stopForBossPlatform(autoRecoveryBlockReason(doc));
      if (doc && isBossGreetingConversation(doc, job) && getBossEditor(doc)) break;
      await sleep(500);
    }
    if (!doc || !isBossGreetingConversation(doc, job)) throw new Error("无法核实聊天窗口的招聘者及岗位身份，请在聊天页人工处理");
    if (confirmQuotaReminder) {
      // 额度提示本身不是开聊成功回执；复用同一聊天页只读核验，不再次调用开聊接口。
      const blocked = autoRecoveryBlockReason(doc) || autoRecoveryBlockReason();
      if (blocked) throw new Error(blocked);
      try { await readBossGreetingHistory(doc, job); }
      catch (error) { throw new Error(`额度提醒后的会话核验未完成：${error.message || error}`); }
      if (state.stopping || !isBossGreetingConversation(doc, job)) throw new Error("额度提醒核验后任务停止或会话变化，未发送");
      onConversationConfirmed?.();
    }
    if (findConfirmedBossGreeting(doc, text)) return { confirmed: true, existing: true };
    assertNoOtherBossGreeting(doc);
    const editor = getBossEditor(doc);
    const draft = normalizeText(editor.value || editor.textContent);
    if (draft) throw new Error("聊天框已有草稿，保留原文并停止发送");
    const ready = await prepareBossGreetingInput(doc, job, text);
    await waitForBossOperation("send", { root: doc, settings });
    assertNoOtherBossGreeting(doc);
    const button = doc.querySelector(".btn-send");
    const finalEditor = getBossEditor(doc);
    if (state.stopping || !isBossGreetingConversation(doc, job)) throw new Error("发送前会话已变化或任务已停止");
    if (button !== ready.button || finalEditor !== ready.editor || !button || isDisabled(button) ||
        normalizeText(finalEditor?.value || finalEditor?.textContent) !== normalizeText(text)) {
      throw bossGreetingNotSentError("最终检查时输入框或按钮发生变化");
    }
    recordBossGreeting(job, "sending", { expectedText: text, sendAttempted: true });
    assertBossGreetingAuthorized(text, review, settings);
    sendAttempted = true; // 调用点击前标记；即使 click 抛错也按结果不明处理，绝不自动补发。
    button.click(); // 唯一一次发送动作；超时不再点击，也不切换通道补发。
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const blocked = autoRecoveryBlockReason(doc) || autoRecoveryBlockReason();
      if (blocked) throw stopForBossPlatform(blocked);
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
  } catch (error) {
    error.sendAttempted = sendAttempted;
    throw error;
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
  // 提前去重以免对已处理招聘者重复调用模型；发送锁内仍再次核对。
  const previous = !settings.bossGreetingPreviewOnly && job.encryptBossId && loadBossGreetingLedger()[bossGreetingRecipientKey(job)];
  if (previous) return { ok: false, skipped: true, message: `该招聘者已有处理记录（${previous.status}），不自动重复发送` };
  let greeting;
  try {
    greeting = await prepareBossGreeting(job, detail, settings);
  } catch (error) {
    if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
    if (["GREETING_REPAIR_EXHAUSTED", "GREETING_JOB_CONTENT"].includes(error.code)) {
      queueBossGreetingReview(job, error.message);
      return { ok: false, pendingReview: true, message: `话术待检查，继续后续岗位，未开聊或发送：${error.message}` };
    }
    return { ok: false, needsAttention: true,
      recoveryKind: error.code === "AI_TRANSIENT" ? "ai-transient" : error.code === "AI_AUTH" ? "credentials" : "",
      message: `话术准备未完成：${error.message || error}` };
  }
  state.lastGreeting = { ...greeting, job: formatJob(job) };
  renderPanel();
  if (settings.bossGreetingPreviewOnly) {
    log("success", `仅预览【${formatJob(job)}】（${greeting.source}）：${greeting.text}`);
    return { ok: false, preview: true, message: "仅预览，未发送" };
  }
  if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
  assertBossGreetingAuthorized(greeting.text, greeting.proofread, settings);
  if (!job.encryptBossId) return { ok: false, skipped: true, message: "缺少招聘者身份，未发起沟通" };
  const locks = window.navigator?.locks;
  if (!locks?.request) return { ok: false, needsAttention: true, message: "浏览器不支持跨标签页互斥，请使用新版 Chrome/Edge 后重试" };
  return locks.request(`${APP_ID}:boss-greeting-send`, { ifAvailable: true }, async (lock) => {
    if (!lock) return { ok: false, skipped: true, message: "另一个标签页正在发送招呼语" };
    if (state.stopping) return { ok: false, skipped: true, message: "已停止，未发送" };
    const previous = loadBossGreetingLedger()[bossGreetingRecipientKey(job)];
    if (previous) return { ok: false, skipped: true, message: `该招聘者已有处理记录（${previous.status}），不自动重复发送` };
    try { await ensureBossNativeGreetingDisabled(settings); }
    catch (error) {
      if (state.stopping) return { ok: false, skipped: true, message: "已停止，未开聊或发送" };
      return { ok: false, needsAttention: true, message: `未开聊或发送：无法确认 BOSS 自动招呼已关闭；${error.message || error}` };
    }
    if (state.stopping) return { ok: false, skipped: true, message: "已停止，未开聊或发送" };
    // 建立沟通之前记录，网络中断、刷新或跨标签页重跑都不会盲目重发。
    recordBossGreeting(job, "opening");
    try {
      const contact = await openBossConversation(job);
      if (contact.jobMismatch && contact.skipped && !contact.ok && !contact.limited) {
        recordBossGreeting(job, "job-mismatch", { sendAttempted: false, reason: contact.message });
        return contact;
      }
      const quotaReminder = isInformationalBossQuotaReminder(contact);
      if (!contact.ok || (contact.softSuccess && !quotaReminder)) {
        recordBossGreeting(job, "contact-unconfirmed");
        return { ...contact, ok: false, needsAttention: true, message: `沟通未确认，未发送专属话术：${contact.message || "请人工核查"}` };
      }
      const markContactConfirmed = () => {
        // 已建立沟通会消耗平台额度，即便后续话术失败也保留每日投递记录。
        recordApplied(job);
        recordBossGreeting(job, "contact-opened", { expectedText: greeting.text, sendAttempted: false });
      };
      if (quotaReminder) {
        recordBossGreeting(job, "checking-contact", { expectedText: greeting.text, sendAttempted: false });
        log("info", `平台提示剩余 ${contact.remainingQuota} 次沟通机会，正在确认该提醒`);
        await confirmBossQuotaReminder(job, contact);
        log("info", "额度提醒已确认，正在核验对应岗位会话");
      } else { markContactConfirmed(); }
      await sendBossGreetingInChat(job, greeting.text, greeting.proofread, {
        settings,
        confirmQuotaReminder: quotaReminder,
        onConversationConfirmed: () => {
          markContactConfirmed();
          log("success", `额度提醒后的会话已确认，继续发送已校对话术（剩余 ${contact.remainingQuota} 次）`);
        },
      });
      recordBossGreeting(job, "sent");
      return { ...contact, ok: true, softSuccess: false, message: "岗位招呼语已确认投递" };
    } catch (error) {
      if (error.code === "BOSS_GREETING_CONFLICT") {
        recordBossGreeting(job, "greeting-conflict", { expectedText: greeting.text, sendAttempted: false, reason: error.message });
        return { ok: false, needsAttention: true, message: error.message };
      }
      if (error.code === "BOSS_GREETING_NOT_SENT" && error.sendAttempted === false) {
        recordBossGreeting(job, "not-sent", { expectedText: greeting.text, sendAttempted: false, reason: error.message });
        return { ok: false, skipped: true, message: `已建立沟通，确认未点击发送；保留记录并继续后续岗位：${error.message}` };
      }
      recordBossGreeting(job, "unconfirmed");
      return { ok: false, needsAttention: true, message: `招呼语发送未完成：${error.message || error}` };
    }
  });
}
