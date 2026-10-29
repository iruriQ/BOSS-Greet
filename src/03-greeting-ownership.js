// BOSS web v6789 account-notify.dfd7a16b.js uses getGreetingList (GET)
// and updateGreetingV2 (form POST) with {status, templateId}. Only the enable
// flag is changed here; custom/saveV2 and all greeting text remain untouched.
async function requestBossGreetingSetting(path, options = {}) {
  assertBossPlatformReady();
  const Controller = window.AbortController || (typeof AbortController === "function" ? AbortController : null);
  const controller = Controller ? new Controller() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), 10000) : null;
  try {
    const response = await fetch(path, { credentials: "include", cache: "no-store",
      headers: buildBossDetailHeaders(), ...options, ...(controller ? { signal: controller.signal } : {}) });
    const data = await parseResponse(response);
    assertBossPlatformReady();
    if ([31, 32, 35, 36, 37, 5002, 5003, 5004].includes(Number(data?.code)) ||
        isLoginOrVerifyText(extractBossMessage(data))) throw stopForBossPlatform("读取或关闭 BOSS 自动招呼时出现登录或验证提示");
    if (!response.ok || data?.code !== 0) throw new Error(`BOSS 招呼设置请求未成功（HTTP ${response.status}，code=${data?.code ?? "未知"}）`);
    return data.zpData;
  } finally { if (timer !== null) window.clearTimeout(timer); }
}

async function readBossNativeGreetingSetting() {
  const data = await requestBossGreetingSetting("/wapi/zpchat/greeting/getGreetingList");
  const greeting = data?.greeting;
  if (!greeting || ![0, 1, "0", "1"].includes(greeting.status)) throw new Error("BOSS 未返回可确认的自动招呼开关状态");
  const id = greeting.templateId;
  if (id != null && !["string", "number"].includes(typeof id)) throw new Error("BOSS 招呼模板标识格式变化，未修改设置");
  return { enabled: Number(greeting.status) === 1, templateId: id == null ? "" : String(id) };
}

async function ensureBossNativeGreetingDisabled(settings) {
  if (!settings.bossPersonalizedGreeting || settings.bossGreetingPreviewOnly) return;
  const current = await readBossNativeGreetingSetting();
  if (!current.enabled) return;
  assertBossPlatformReady();
  // Match the native switch's payload; do not save, replace or delete text.
  await requestBossGreetingSetting("/wapi/zpchat/greeting/updateGreetingV2", {
    method: "POST", headers: { ...buildBossDetailHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: "0", templateId: current.templateId }).toString(),
  });
  const confirmed = await readBossNativeGreetingSetting();
  if (confirmed.enabled) throw new Error("BOSS 自动招呼仍为开启状态，已阻止开聊，避免发送两条招呼");
  log("info", "已关闭并确认 BOSS 自动招呼；本轮由助手发送话术，平台原有招呼正文未修改。关闭助手发送后，如需平台招呼，请在 BOSS 中重新启用。");
}

function assertNoOtherBossGreeting(doc) {
  for (const node of doc.querySelectorAll(".message-item.item-myself")) {
    if (normalizeText(node.querySelector?.(".text-content")?.textContent)) throw bossGreetingConflictError();
    let view = node.__vue__;
    for (let depth = 0; view && depth < 3; depth++, view = view.$parent) {
      const message = view.message || view.$props?.message;
      if (message?.isSelf && normalizeText(message.text)) throw bossGreetingConflictError();
    }
  }
}

function bossGreetingConflictError() {
  const error = new Error("该会话已出现本人文字消息，可能是平台自动招呼；已阻止助手补发，请检查平台设置和聊天记录");
  error.code = "BOSS_GREETING_CONFLICT";
  return error;
}
