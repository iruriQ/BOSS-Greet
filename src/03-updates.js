// Release data is public. This request never includes a resume, key or BOSS cookies.
const BUILTIN_RELEASES = {"schemaVersion":1,"latest":"0.9.21","releases":[{"version":"0.9.21","date":"2026-10-30","title":"本次功能更新","notes":["话术优先介绍真实岗位经历、工作年限与可迁移能力，不主动介绍学历或强调经验短板。","生成、篇幅整理和事实修正统一表达要求，仍只核验重大事实风险，不增加风格核验调用。"]},{"version":"0.9.20","date":"2026-10-30","title":"本次功能更新","notes":["AI 话术改为目标字数：默认约 300 字，至少 200 字且不超过 300 字；生成、修正与发送前统一检查，保留用户已有设置数值。","招聘介绍较少时，从已确认的在线简历或上传资料补充真实成果、工具与可迁移能力；不使用未确认草稿，不重复或编造凑字。过短先补充一次，仍不合格则待检查，不开聊或发送。"]},{"version":"0.9.19","date":"2026-10-29","title":"本次功能更新","notes":["助手发送 AI 或固定话术前，自动关闭并复查 BOSS 原生自动招呼，避免双重发送；仅预览不更改设置。","无法确认关闭或发现会话已有本人文字时暂停，不补发第二条；保留平台招呼正文和模板。"]},{"version":"0.9.18","date":"2026-10-29","title":"本次功能更新","notes":["取消读取岗位、开始沟通和打开聊天页前的逐步骤等待；BOSS 岗位之间统一随机间隔1—3秒，不再叠加原4—10秒等待。","AI话术生成并核验通过、聊天输入框就绪后，随机等待1—3秒发送；固定话术和BOSS平台默认招呼不增加发送前等待。保留身份、发送回执、停止和异常暂停检查。"]},{"version":"0.9.17","date":"2026-10-29","title":"本次功能更新","notes":["紧凑固定工作台与底部操作区，统一正文布局；移除工作台导航，仅保留投递设置、打招呼和投递进度，滚动时自动同步高亮。","生成时一次挑选经历并撰写，预先约束事实、职责、数字和字数；普通优化建议不再拦截。重大错误最多修正一次并复核，仍未通过则待检查并继续后续岗位。","读取筛选岗位保持随机1—5秒，开始沟通和发送招呼调整为随机1—10秒；保留停止与平台异常暂停保护。"]},{"version":"0.9.16","date":"2026-10-29","title":"本次功能更新","notes":["读取、筛选岗位的底层随机间隔由 1—8 秒调整为 1—5 秒；开始沟通和发送招呼仍为随机 1—15 秒。保留停止和平台异常停机保护。"]},{"version":"0.9.15","date":"2026-10-29","title":"本次功能更新","notes":["话术核验未通过时，针对问题在当前同一岗位自动修正并独立复核，通过后才预览或发送；最多修正三轮，仍未通过则暂停，不标记岗位为跳过。","修正以完整原始经历和岗位描述为依据，保留事实、年限和字数要求；只修正尚未发送的话术，不会重复开聊或发送。","岗位读取筛选的底层随机间隔调整为 1—8 秒，开始沟通和发送招呼仍为 1—15 秒。"]},{"version":"0.9.14","date":"2026-10-29","title":"本次功能更新","notes":["读取筛选岗位、开始沟通和发送招呼改为底层统一的 1—15 秒随机间隔，每段间隔只抽取一次。","未结束的随机等待在停止、刷新与其他标签页之间保留；页面不增加调节入口，保留停止按钮和平台异常停机保护。随机间隔不保证避免平台限制。"]},{"version":"0.9.13","date":"2026-10-29","title":"本次功能更新","notes":["修正字数预算逻辑：优先保留最相关经历，精简通用介绍和次要亮点，不再先预留额外内容挤掉核心经历。","长经历按完整相关句提取；仍超预算时调用已配置的 AI 按岗位精简，再以完整原始经历校对，保留真实数字与职责限定。原始简历、固定话术及字数上限不变。"]},{"version":"0.9.12","date":"2026-10-29","title":"本次功能更新","notes":["操作间隔固定在底层，移除页面中的间隔调节项，保留等待时停止及异常登录停机保护。","开场问候改为自由填写的文本框，留空默认使用“您好”，保留原有已填写内容；生成与校对使用同一规则。"]},{"version":"0.9.11","date":"2026-10-29","title":"本次功能更新","notes":["新增统一操作限速：读取岗位至少间隔10秒、开聊和发送至少间隔30秒，可设置更慢；跨刷新和标签页保留操作时间。异常登录或验证时停止并清除自动续跑，处理后需手动重新开始。"]},{"version":"0.9.10","date":"2026-10-29","title":"本次功能更新","notes":["修复 BOSS 新版卡片外层容器无法触发详情切换的问题，点击实际卡片后等待对应岗位详情；严格核对岗位编号，保留在线状态和活跃度筛选。"]},{"version":"0.9.9","date":"2026-10-29","title":"本次功能更新","notes":["新版 BOSS 列表通过网页原生流程加载岗位详情，复用已加载内容并核对岗位编号；避免重复直连接口，网页加载受阻立即停止。保留在线状态与活跃度分别筛选。"]},{"version":"0.9.8","date":"2026-10-29","title":"本次功能更新","notes":["修复仅在线筛选漏读详情在线状态；区分离线与状态未知，保留招聘方活跃度筛选。完整详情请求携带当前网页会话信息；BOSS 环境校验受阻时立即停止。"]},{"version":"0.9.7","date":"2026-10-29","title":"本次功能更新","notes":["读取岗位详情失败时显示具体接口错误；验证或限流时立即停止，连续失败三次停止查找；增加只读岗位详情检查工具。"]},{"version":"0.9.6","date":"2026-10-29","title":"本次功能更新","notes":["话术预览先按当前投递条件筛选岗位，跳过不符合的岗位并继续查找，为第一个符合条件的岗位准备话术。","预览支持只读加载更多、查看筛选进度和随时停止；不写入投递记录、不占用投递名额，也不发送消息。","修改关键词、公司规模或距离等筛选条件后清除旧预览，避免误用过时结果。"]},{"version":"0.9.5","date":"2026-10-29","title":"本次功能更新","notes":["关键词改为独立输入框，支持添加删除；同组按或匹配，同时命中时包含词优先。","新增公司规模多选，只投选中的规模；无法确认规模的岗位在启用筛选时跳过。","窗口可拖动位置和调整宽高，记住本机布局，并可恢复默认大小。","保留招聘方活跃度筛选；优先使用平台最新发布排序，或对已加载且时间可确认的岗位排序，未知时间明确提示。","保留本轮投递数量上限，达到设定数量后停止，不补投其他公司规模。"]},{"version":"0.9.4","date":"2026-10-29","title":"本次功能更新","notes":["新增本轮最多投递数量，默认 20 个，可设置 1—150 个；达到设定数量后自动停止。","跳过岗位不占数量，BOSS 已建立沟通的岗位计入名额；试运行与任务恢复同样遵守本轮上限。"]},{"version":"0.9.3","date":"2026-10-29","title":"本次功能更新","notes":["移除读取 BOSS 后台招呼语的选项和查询，固定话术直接手动填写或粘贴。","升级保留已有固定文字；话术预览继续支持手填内容和可选的 AI 定制结果。"]},{"version":"0.9.2","date":"2026-10-29","title":"本次功能更新","notes":["固定话术新增手动填写和读取 BOSS 常用招呼两个来源，读取后可编辑并确认使用。","重新读取或修改正文后需重新确认；读取失败保留原文，全程无需 AI API。"]},{"version":"0.9.1","date":"2026-10-29","title":"本次功能更新","notes":["补全 GitHub 公开更新说明的访问声明，避免版本检查额外弹出跨域访问询问。"]},{"version":"0.9.0","date":"2026-10-29","title":"本次功能更新","notes":["新增版本更新提醒，展示新版本号和主要功能变化，可选择更新或继续使用当前版本。","更新完成后展示本次更新说明，底部可随时手动检查更新。","保留现有设置与投递记录，同一新版不重复提醒，运行任务时延后显示弹窗。"]},{"version":"0.8.0","date":"2026-10-28","title":"投递工作台与简历资料导入","notes":["更新投递工作台，固定顶部导航和底部操作按钮。","支持上传或粘贴简历文本，以及读取本人 BOSS 在线简历；核对后用于生成话术。","支持固定话术和可选 AI 定制模式，展示话术预览与投递进度。"]}]}; // @release-manifest
const UPDATE_STORAGE_KEY = `${APP_ID}:updates`;
const RELEASE_MANIFEST_URL = "https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/releases.json";
const UPDATE_INSTALL_URL = "https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/boss-auto-apply.user.js";
const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000;
let updateInitialized = false;
let updateTimer = null;
let updateCheckPromise = null;

function compareReleaseVersions(left, right) {
  const valid = value => typeof value === "string" && /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/.test(value);
  if (!valid(left) || !valid(right)) throw new Error("版本号格式无效");
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

function validateReleaseManifest(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.releases) || !value.releases.length || value.releases.length > 100) throw new Error("更新说明格式无效");
  compareReleaseVersions(value.latest, value.latest);
  const versions = new Set();
  const releases = value.releases.map(item => {
    compareReleaseVersions(item?.version, item?.version);
    if (versions.has(item.version) || compareReleaseVersions(item.version, value.latest) > 0 ||
      typeof item.title !== "string" || !item.title.trim() || item.title.length > 120 ||
      typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Array.isArray(item.notes) || !item.notes.length || item.notes.length > 30 ||
      item.notes.some(note => typeof note !== "string" || !note.trim() || note.length > 1000)) throw new Error("更新说明格式无效");
    versions.add(item.version);
    // No remote HTML, script, install URL or arbitrary fields enter the UI.
    return { version: item.version, title: item.title.trim(), date: item.date, notes: item.notes.map(note => note.trim()) };
  }).sort((a, b) => compareReleaseVersions(b.version, a.version));
  if (releases[0].version !== value.latest) throw new Error("最新版本与更新说明不一致");
  return { schemaVersion: 1, latest: value.latest, releases };
}

function loadUpdatePreferences() {
  const stored = gmGet(UPDATE_STORAGE_KEY, {});
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

function updatePreferences(patch) { gmSet(UPDATE_STORAGE_KEY, { ...loadUpdatePreferences(), ...patch }); }

function updateWorkBusy() { return state.running || state.previewing || state.resumeImport.busy; }

function getVersionUpdateModel() {
  const info = state.versionUpdate;
  return { ...info, currentVersion: VERSION, personalBuild: PERSONAL_BUILD,
    open: Boolean(info.kind) && !updateWorkBusy() && !state.collapsed };
}

function showAvailableRelease(manifest, manual = false) {
  if (compareReleaseVersions(manifest.latest, VERSION) <= 0) return false;
  const saved = loadUpdatePreferences();
  if (!manual && saved.dismissedVersion === manifest.latest) return false;
  // An unacknowledged installation notice takes priority over another update.
  if (!manual && state.versionUpdate.kind === "installed") return false;
  state.versionUpdate.kind = "available";
  state.versionUpdate.releases = manifest.releases.filter(item => compareReleaseVersions(item.version, VERSION) > 0);
  state.versionUpdate.message = "";
  return true;
}

function initializeVersionUpdates() {
  if (updateInitialized) return;
  updateInitialized = true;
  const saved = loadUpdatePreferences();
  let upgraded = false;
  try { upgraded = saved.lastSeenVersion && compareReleaseVersions(VERSION, saved.lastSeenVersion) > 0; } catch {}
  const pendingInstalled = saved.installedNoticeVersion === VERSION && saved.acknowledgedVersion !== VERSION;
  if (upgraded || pendingInstalled) {
    const previous = upgraded ? saved.lastSeenVersion : saved.previousVersion;
    state.versionUpdate.kind = "installed";
    state.versionUpdate.releases = validateReleaseManifest(BUILTIN_RELEASES).releases.filter(item =>
      compareReleaseVersions(item.version, VERSION) <= 0 && (!previous || compareReleaseVersions(item.version, previous) > 0));
    updatePreferences({ lastSeenVersion: VERSION, previousVersion: previous, installedNoticeVersion: VERSION });
  } else if (!saved.lastSeenVersion) updatePreferences({ lastSeenVersion: VERSION });
  if (saved.cachedManifest) {
    try { showAvailableRelease(validateReleaseManifest(saved.cachedManifest)); } catch {}
  }
  renderPanel();
  // First check shortly after mounting; subsequent checks are throttled across
  // tabs/reloads and an open page checks again every twelve hours.
  const tick = () => { void checkVersionUpdates(false); updateTimer = window.setTimeout(tick, UPDATE_CHECK_INTERVAL); };
  updateTimer = window.setTimeout(tick, 4500);
}

async function checkVersionUpdates(manual = true) {
  if (updateCheckPromise) return updateCheckPromise;
  const now = Date.now(), saved = loadUpdatePreferences();
  if (!manual && typeof saved.lastCheckedAt === "number" && saved.lastCheckedAt <= now && now - saved.lastCheckedAt < UPDATE_CHECK_INTERVAL) return;
  // Record attempts too: offline users are not queried again on every reload.
  updatePreferences({ lastCheckedAt: now });
  state.versionUpdate.checking = true;
  state.versionUpdate.status = "正在检查更新…";
  renderPanel();
  updateCheckPromise = Promise.resolve().then(async () => {
    try {
      const body = await requestReleaseManifest();
      if (body.length > 180000) throw new Error("更新说明异常");
      const manifest = validateReleaseManifest(JSON.parse(body));
      updatePreferences({ cachedManifest: manifest });
      const newer = compareReleaseVersions(manifest.latest, VERSION) > 0;
      showAvailableRelease(manifest, manual);
      state.versionUpdate.status = newer ? `发现新版 v${manifest.latest}` : "当前已是最新版本";
      if (manual && !newer) {
        state.versionUpdate.kind = "current";
        state.versionUpdate.releases = validateReleaseManifest(BUILTIN_RELEASES).releases.filter(item => item.version === VERSION);
        state.versionUpdate.message = "";
      }
    } catch {
      state.versionUpdate.status = "暂时无法检查更新，可稍后重试";
      if (manual) { state.versionUpdate.kind = "error"; state.versionUpdate.releases = []; state.versionUpdate.message = "连接 GitHub 失败或更新信息无效。当前版本可以继续使用。"; }
    } finally {
      state.versionUpdate.checking = false;
      updateCheckPromise = null;
      renderPanel();
    }
  });
  return updateCheckPromise;
}

function requestReleaseManifest() {
  // The userscript API avoids recruiting sites' CSP/CORS restrictions. Do not
  // reuse the AI request helper: this is a fixed public URL with no auth/body.
  if (typeof GM_xmlhttpRequest === "function") return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({ method: "GET", url: RELEASE_MANIFEST_URL, anonymous: true, timeout: 10000,
      headers: { "Cache-Control": "no-cache" },
      onload: response => response.status === 200 ? resolve(response.responseText) : reject(new Error("update unavailable")),
      onerror: () => reject(new Error("update unavailable")), ontimeout: () => reject(new Error("update timeout")),
      onabort: () => reject(new Error("update cancelled")),
    });
  });
  return fetch(RELEASE_MANIFEST_URL, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer",
    cache: "no-store", signal: AbortSignal.timeout(10000) }).then(response => {
    if (!response.ok) throw new Error("更新服务暂不可用");
    return response.text();
  });
}

function dismissVersionUpdate() {
  const info = state.versionUpdate;
  if (info.kind === "available" && info.releases[0]) updatePreferences({ dismissedVersion: info.releases[0].version });
  if (info.kind === "installed") updatePreferences({ acknowledgedVersion: VERSION });
  info.kind = ""; info.message = "";
  renderPanel();
}

function openVersionUpdateInstaller() {
  if (updateWorkBusy() || state.versionUpdate.kind !== "available") return;
  // Never install the public identity over an independently stored personal copy.
  if (PERSONAL_BUILD) {
    state.versionUpdate.message = "当前为个人副本，请使用个人副本构建更新，避免另外安装通用版。";
    renderPanel(); return;
  }
  try {
    const result = typeof GM_openInTab === "function"
      ? GM_openInTab(UPDATE_INSTALL_URL, { active: true })
      : window.open(UPDATE_INSTALL_URL, "_blank", "noopener,noreferrer");
    if (result === null) throw new Error("popup blocked");
    state.versionUpdate.message = "已打开更新安装页。请在篡改猴中确认更新；安装完成后刷新招聘页面。";
  } catch { state.versionUpdate.message = "无法打开安装页，请允许打开新标签页后重试。"; }
  // Opening a tab is not proof of installation: only the next running VERSION
  // is used to mark the upgrade as complete.
  renderPanel();
}
