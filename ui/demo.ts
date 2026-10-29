import { update } from "./index";
import type { PanelModel, Preferences } from "./types";
import releases from "../releases.json";

// Entirely fictional, local UI demo. No recruitment, chat, or model API exists here.
const element = document.querySelector<HTMLElement>("[data-boss-nova]")!;
const greeting = "您好！我对贵公司的招聘岗位很感兴趣，希望进一步了解工作内容与任职要求，期待与您沟通。";
const model: PanelModel = {
  demo: true,
  version: releases.latest, title: "BOSS Greet 界面演示", platform: "BOSS", platformId: "boss",
  onlineLabel: "只投递招聘方显示在线的岗位", homeSetup: false, collapsed: false, running: false,
  previewing: false, canStop: false, status: "演示模式", current: "界面演示 · 不会实际投递或调用 AI",
  resumeImport: { busy: false, draftText: "", source: "", message: "", revision: 0 },
  versionUpdate: { checking: false, kind: "", releases: [], status: "演示不会连接 GitHub", message: "",
    currentVersion: releases.latest, personalBuild: false, open: false },
  counters: { scanned: 128, matched: 42, applied: 24, skipped: 18, failed: 0, previewed: 1 },
  dailyCount: 24, dailyLimit: 150, remainingQuota: null, hasKey: false,
  config: { bossPersonalizedGreeting: true, bossGreetingMode: "fixed", bossGreetingPreviewOnly: true,
    maxApplyCount: 20, bossFixedGreeting: greeting, bossFixedGreetingConfirmed: false, onlyOnlineBoss: true,
    bossMaxDistanceKm: 10, bossDistanceEnabled: false, bossHomeLocation: null,
    includeDescriptionKeywords: ["商务支持", "项目协调"], excludeDescriptionKeywords: ["电话销售"], bossCompanySizes: ["100-499人", "500-999人"], debug: false,
    greetingOpening: "", candidateIntro: "", candidateExperience: "", candidateProfile: "",
    candidateResumeSource: "text", candidateResumeText: "", candidateBossResumeText: "", candidateProfileBackup: "", candidateProfileSource: "manual",
    bossGreetingMaxLength: 300, bossGreetingUseAI: true, bossGreetingIncludeAI: false,
    greetingAIEndpoint: "", greetingAIModel: "", rememberGreetingKey: false, autoRecoveryEnabled: false },
  logs: [
    { time: "14:22", level: "info", message: "等待开始演示，不会发送消息" },
    { time: "14:21", level: "success", message: "已载入演示话术" },
    { time: "14:20", level: "success", message: "界面已准备就绪" },
  ],
  preview: null,
};
let preferences: Partial<Preferences> = { expanded: new URLSearchParams(location.search).get("layout") === "wide" };
function render() {
  if (!model.running) {
    model.roundLimit = Number(model.config.maxApplyCount) || 20;
    model.roundUsed = model.config.bossPersonalizedGreeting && model.config.bossGreetingPreviewOnly
      ? model.counters.previewed : model.counters.applied;
  }
  model.versionUpdate!.open = Boolean(model.versionUpdate!.kind) && !model.running && !model.previewing && !model.resumeImport?.busy && !model.collapsed;
  update(element, { ...model, config: { ...model.config } }, preferences, value => { preferences = value; });
}
function showDemoVersionUpdate(installed = false) {
  const parts = releases.latest.split('.').map(Number); parts[2]++;
  model.versionUpdate!.kind = installed ? "installed" : "available";
  model.versionUpdate!.releases = [{ ...releases.releases[0], version: installed ? releases.latest : parts.join('.'), title: "版本更新提醒与功能说明",
    notes: ["发现新版本时展示主要功能变化，可自主选择更新。", "继续使用当前版本后，同一新版不再反复提醒。", "新版安装完成后，展示本次更新说明。"] }];
  model.versionUpdate!.message = "弹窗效果演示，不会下载或安装任何软件。";
}
function log(message: string) { model.logs.unshift({ time: new Date().toLocaleTimeString(), level: "info", message }); render(); }
function stop() { model.running = false; model.canStop = false; model.status = "演示已停止"; log("演示已停止，没有发出任何网络请求"); }
let timer: ReturnType<typeof setInterval> | undefined;
element.addEventListener("input", saveFields);
element.addEventListener("change", saveFields);
function saveFields(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
  if (!input.name) return;
  if (input instanceof HTMLInputElement && input.type === "file") {
    if (event.type === "change") void importDemoResumeFile(input.files?.[0]);
    return;
  }
  if (input.name === "resumeImportDraft") { model.resumeImport!.draftText = input.value; return; }
  model.config[input.name] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
  if (["candidateResumeSource", "candidateResumeText"].includes(input.name)) {
    model.resumeImport!.draftText = "";
    model.resumeImport!.message = "请重新导入整理，当前使用的经历保持不变。";
  }
  if (input.name === "bossFixedGreeting") {
    model.config.bossFixedGreetingConfirmed = false; model.preview = null;
    const checkbox = element.querySelector<HTMLInputElement>('[name="bossFixedGreetingConfirmed"]');
    if (checkbox) checkbox.checked = false;
  }
  if (["bossPersonalizedGreeting", "bossGreetingMode", "includeDescriptionKeywords", "excludeDescriptionKeywords", "bossCompanySizes", "bossDistanceEnabled", "bossMaxDistanceKm", "onlyOnlineBoss"].includes(input.name)) {
    model.preview = null; model.previewProgress = ""; model.previewError = "";
  }
  render();
}
function setDemoField(name: string, value: string) {
  model.config[name] = value;
  const field = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (field) field.value = value;
}
function prepareDemoResumeText(text: string) {
  if (!text.trim() || text.length > 30000) throw Error("请填写不超过 30000 字的简历文本");
  const lines = text.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !/^(?:姓名|手机|电话|邮箱|地址|微信|QQ)\s*[:：]/i.test(line))
    .map(line => line.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "").replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, ""))
    .filter(line => line.trim());
  if (!lines.length) throw Error("没有识别到可用经历，请检查简历正文");
  model.resumeImport = { busy: false, draftText: lines.join("\n"), source: String(model.config.candidateResumeSource),
    revision: (model.resumeImport?.revision || 0) + 1, message: "经历草稿已整理，请核对后确认。演示操作仅在本页有效。" };
}
async function importDemoResumeFile(file?: File) {
  if (!file) return;
  model.resumeImport!.busy = true; render();
  try {
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 256 * 1024) throw Error("请选择不超过 256 KB 的 UTF-8 文本文件");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (!text.trim() || text.length > 30000) throw Error("文本不能为空，且最多 30000 字");
    setDemoField("candidateResumeText", text);
    model.resumeImport!.draftText = "";
    model.resumeImport!.message = "文本已载入。点击“整理为经历草稿”，核对后再使用。";
  } catch (error) { model.resumeImport!.message = error instanceof Error ? error.message : "文件读取失败"; }
  finally { model.resumeImport!.busy = false; render(); }
}
element.addEventListener("click", event => {
  const action = (event.target as Element).closest("[data-action]")?.getAttribute("data-action");
  if (!action) return;
  event.preventDefault();
  if (action === "check-version-update") { showDemoVersionUpdate(); render(); return; }
  if (action === "dismiss-version-update") { model.versionUpdate!.kind = ""; render(); return; }
  if (action === "install-version-update") { model.versionUpdate!.message = "这里只展示更新流程。正式版本会打开篡改猴安装页，由用户确认安装。"; render(); return; }
  if (action === "prepare-resume-text" || action === "read-boss-resume") {
    try {
      if (action === "read-boss-resume") {
        const sample = "负责客户资料整理、合同归档及审批进度跟进。\n使用 Excel 整理业务数据，维护项目进度台账。";
        setDemoField("candidateBossResumeText", sample);
        prepareDemoResumeText(sample);
        model.resumeImport!.message = "已载入虚构在线简历示例，未读取真实账号。请核对后确认使用。";
      } else prepareDemoResumeText(String(model.config.candidateResumeText || ""));
    } catch (error) { model.resumeImport!.message = error instanceof Error ? error.message : "整理失败"; }
    render(); return;
  }
  if (action === "apply-resume-draft") {
    if (!model.resumeImport!.draftText.trim()) return;
    model.config.candidateProfileBackup = model.config.candidateProfile;
    setDemoField("candidateProfile", model.resumeImport!.draftText);
    model.resumeImport!.draftText = "";
    model.resumeImport!.message = "已使用核对后的经历，上次经历已保留。演示设置仅本页有效。";
    model.preview = null; render(); return;
  }
  if (action === "restore-resume-profile") {
    const previous = String(model.config.candidateProfile || "");
    setDemoField("candidateProfile", String(model.config.candidateProfileBackup || ""));
    model.config.candidateProfileBackup = previous;
    model.resumeImport!.message = "已恢复上次经历。"; model.preview = null; render(); return;
  }
  if (action === "cancel-resume-import") {
    model.resumeImport!.draftText = ""; model.resumeImport!.message = "已取消，当前经历未改变。"; render(); return;
  }
  if (action === "toggle-collapse") { model.collapsed = !model.collapsed; render(); }
  else if (action === "save-config") log("演示设置已更新，仅保留在当前演示页面");
  else if (action === "stop") { clearInterval(timer); stop(); }
  else if (action === "start") {
    const limitField = element.querySelector<HTMLInputElement>('[name="maxApplyCount"]');
    if (!limitField?.reportValidity() || model.running) return;
    const limit = Number(limitField.value);
    model.config.maxApplyCount = limit;
    model.roundLimit = limit; model.roundUsed = 0;
    model.counters = { scanned: 0, matched: 0, applied: 0, skipped: 0, failed: 0, previewed: 0 };
    model.running = true; model.canStop = true; model.status = "演示运行中";
    const previewOnly = model.config.bossPersonalizedGreeting && model.config.bossGreetingPreviewOnly;
    log(`开始播放 ${limit} 个岗位的界面演示，不连接任何招聘或 AI 服务`);
    timer = setInterval(() => {
      model.roundUsed = (model.roundUsed || 0) + 1;
      model.counters.scanned++; model.counters.matched++;
      if (previewOnly) model.counters.previewed++; else model.counters.applied++;
      model.current = `演示已处理 ${model.roundUsed}/${limit} 个岗位`;
      if (model.roundUsed >= limit) {
        clearInterval(timer); model.running = false; model.canStop = false;
        model.status = "演示已完成"; model.current = `已达到本轮设定数量 ${limit} 个，演示已停止`;
        log("达到设定数量后自动停止；以上均为虚构演示，未实际投递");
      } else render();
    }, 900);
  } else if (action === "preview-greeting") {
    if (!model.config.bossPersonalizedGreeting) return;
    const items = (value: unknown): string[] => {
      if (Array.isArray(value)) return value;
      try { const parsed = JSON.parse(String(value)); if (Array.isArray(parsed)) return parsed; } catch (_) {}
      return [];
    };
    const include = items(model.config.includeDescriptionKeywords), exclude = items(model.config.excludeDescriptionKeywords);
    const sizes = items(model.config.bossCompanySizes);
    const jobs = [
      { title: "客户顾问 · 虚构示例", jd: "电话销售 客户服务", size: "20-99人", distance: 30.57 },
      { title: "项目助理 · 虚构示例", jd: "项目协调 项目执行 数据整理", size: "100-499人", distance: 8.2 },
      { title: "商务运营 · 虚构示例", jd: "商务支持 合同管理 数据台账", size: "500-999人", distance: 6.3 },
    ];
    let checked = 0;
    const job = jobs.find(job => {
      checked++;
      const text = `${job.title} ${job.jd}`.toLowerCase();
      return (!sizes.length || sizes.includes(job.size)) &&
        (!model.config.bossDistanceEnabled || job.distance <= Number(model.config.bossMaxDistanceKm)) &&
        (include.length ? include.some(word => text.includes(word.toLowerCase())) : !exclude.some(word => text.includes(word.toLowerCase())));
    });
    model.preview = null; model.previewProgress = ""; model.previewError = "";
    if (!job) {
      model.previewError = `已检查 ${checked} 个虚构示例岗位，暂未找到符合当前关键词、规模或距离条件的岗位。可调整条件后重试；这里不读取真实 BOSS 数据。`;
    } else {
      model.preview = { origin: "assistant", job: job.title, source: "本地界面模拟", text: String(model.config.bossFixedGreeting || greeting), review: "虚构演示内容 · 未调用 AI 或实际发送", status: "draft" };
      model.previewProgress = `已检查 ${checked} 个虚构岗位，展示第一个符合条件的岗位；距家 ${job.distance} 公里，公司 ${job.size}。`;
    }
    log("已按当前条件筛选虚构岗位并更新预览，未连接招聘或 AI 服务");
  } else log("此处为界面演示；实际功能请在招聘网站中的助手使用");
});
const updateDemo = new URLSearchParams(location.search).get("update");
if (updateDemo === "available" || updateDemo === "installed") showDemoVersionUpdate(updateDemo === "installed");
render();
