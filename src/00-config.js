const APP_ID = "boss-auto-apply-custom"; // @build-identity
  const PERSONAL_BUILD = false; // @build-variant
  const BUILD_SUFFIX = PERSONAL_BUILD ? "（个人副本）" : "";
  const CONFIG_KEY = `${APP_ID}:config`;
  // 通用版、私人构建和上游脚本分别使用独立存储。
  const HISTORY_KEY = `${APP_ID}:history`;
  const RESUME_KEY = `${APP_ID}:resume`;
  const PANEL_ID = `${APP_ID}-panel`;
  const STYLE_ID = `${APP_ID}-style`;
  const VERSION = "0.9.23";
  // 私人构建时替换此对象；公开源码和普通构建不包含个人简历。
  const DEFAULT_CANDIDATE = { intro: "", profile: "" }; // @personal-profile
  const DEFAULT_AI_SERVICE = { endpoint: "", model: "", httpOrigin: "" }; // @personal-service
  const PERSONAL_AI_WORKFLOWS = []; // @personal-ai-workflows
  const GREETING_LEDGER_KEY = `${APP_ID}:boss-greetings`;

  const BOSS_COMPANY_SIZES = ["0-20人", "20-99人", "100-499人", "500-999人", "1000-9999人", "10000人以上"];

  const DEFAULT_CONFIG = {
    autoNextPage: true,
    fetchDetail: true,
    debug: false,
    skipAppliedHistory: true,
    skipHeadhunter: true,
    onlyOnlineBoss: false,
    treatChatRemindAsSuccess: true,
    maxApplyCount: 20,
    dailyLimit: 150,
    delayMinSec: 4,
    delayMaxSec: 10,
    pageDelaySec: 3,
    activeWithinDays: 14,
    includeDescriptionKeywords: [],
    excludeDescriptionKeywords: [],
    bossCompanySizes: [],
    shixisengResume: "",
    shixisengReportTime: "",
    shixisengInternshipTime: "",
    shixisengDays: "",
    bossDistanceEnabled: false,
    bossMaxDistanceKm: 10,
    bossHomeLocation: null,
    bossPersonalizedGreeting: true,
    bossGreetingMode: PERSONAL_BUILD ? "ai" : "fixed",
    bossFixedGreeting: "",
    bossFixedGreetingConfirmed: false,
    bossFixedGreetingConfirmedText: "",
    bossGreetingPreviewOnly: false,
    greetingWorkflowVersion: 2,
    candidateIntro: DEFAULT_CANDIDATE.intro,
    candidateExperience: DEFAULT_CANDIDATE.experience || "",
    greetingIntroVersion: 1,
    candidateProfile: DEFAULT_CANDIDATE.profile,
    candidateResumeSource: "text",
    candidateResumeText: "",
    candidateBossResumeText: "",
    candidateProfileBackup: "",
    candidateProfileSource: "manual",
    bossGreetingMaxLength: 300,
    bossGreetingUseAI: !PERSONAL_BUILD,
    bossGreetingIncludeAI: PERSONAL_BUILD,
    autoRecoveryEnabled: PERSONAL_BUILD,
    rememberGreetingKey: false,
    greetingOpening: "",
    greetingAIEndpoint: DEFAULT_AI_SERVICE.endpoint,
    greetingAIModel: DEFAULT_AI_SERVICE.model,
    greetingAllowedHttpOrigin: DEFAULT_AI_SERVICE.httpOrigin,
    liepinGreeting:
      "您好，我对贵公司发布的这个职位很感兴趣，期待进一步了解。",
  };

  const BOSS_SELECTORS = {
    jobCards: [
      ".job-card-wrapper",
      ".job-card-wrap",
      ".job-card-box",
      ".job-list-box .job-card-body",
      ".rec-job-list .job-card-wrapper",
    ],
    scrollContainers: [
      ".job-list-container",
      ".job-list",
      ".recommend-job-list",
      ".job-recommend-result",
      ".recommend-result-inner",
      ".page-job-inner",
    ],
    nextIcon: ".ui-icon-arrow-right",
  };

  const LIEPIN_SELECTORS = {
    jobCards: [
      // 2026 年猎聘前端使用驼峰类名；同时兼容历史/灰度模板的连字符类名。
      'div[class*="jobCardPcContainer"]',
      'div[class*="job-card-pc-container"]',
      "li[data-tlg-ext]",
      'a[data-nick="job-detail-job-info"]',
      'a[href*="/job/"]',
      'a[href*="/a/"]',
    ],
    actionLabels: /聊一聊|继续聊|立即沟通/,
    // 聊天窗口可能在类名改版后换了容器；以 im-ui 前缀兜底，避免只认某几个固定类名。
    chatRoots: [
      "#im-c-entry",
      '[class*="im-ui-chat-modal"]',
      '[class*="im-ui-basic-chat"]',
      '[class*="im-ui-chat-container"]',
      ".im-ui-chat-container",
      '[class*="im-ui-pro-wrapper"]',
      '[class*="ant-im-modal-wrap"]',
      '[class*="chat-modal"]',
      '[class*="chat-container"]',
    ],
    chatEditor:
      'textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"][aria-multiline="true"], #chat-input, input[type="text"], input:not([type])',
  };

  const QIANCHENG_SELECTORS = {
    jobCards: [".joblist-item"],
    searchPagination: ".pageation .el-pagination",
    applyButton: "button.btn.apply",
    feedback: [
      ".el-message",
      ".el-dialog__wrapper",
      ".van-popup",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      "[class*='toast']",
    ],
  };

  const SHIXISENG_SELECTORS = {
    jobCards: [".intern-item"],
    feedback: [
      ".el-message",
      ".el-dialog__wrapper",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      "[class*='toast']",
    ],
  };

  const ZHAOPIN_SELECTORS = {
    jobCards: [
      ".joblist-box__item",
      ".positionlist .joblist-box__item",
      ".job-list-panel .joblist-box__item",
      ".joblist-box .joblist-item",
      // 2026 新版左右分栏布局
      ".job-list-panel .job-card",
      ".jobs-list-sort-scroll .job-card",
      '[class*="joblist-box"] [class*="jobItem"]',
      '[class*="job-list-panel"] [class*="jobItem"]',
    ],
    applyButton: [
      ".collect-and-apply__btn",
      ".apply-btn",
      '[class*="collect-and-apply"] button',
      '[class*="job-apply"] button',
    ],
    feedback: [
      ".a-job-apply-workflow",
      ".a-dialog",
      ".deliver-dialog",
      ".deliver-greeting-modal",
      ".el-dialog",
      ".ant-modal",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      ".ant-message",
      ".el-message",
      "[class*='toast']",
    ],
  };

  const LIEPIN_FEEDBACK_SELECTORS = [
    ".ant-modal",
    ".ant-modal-confirm",
    ".ant-message",
    ".ant-notification",
    ".ant-im-modal",
    ".ant-im-modal-confirm",
    ".ant-im-message",
    ".ant-im-notification",
    "[role='dialog']",
    "[role='alert']",
    "[role='status']",
    ".im-ui-modal",
    ".im-ui-toast",
    "[class*='im-ui'][class*='modal']",
    "[class*='toast']",
  ];

  const state = {
    bossPacingMessage: "",
    running: false,
    stopping: false,
    collapsed: false,
    scanned: 0,
    matched: 0,
    applied: 0,
    submitted: 0,
    roundLimit: 0,
    skipped: 0,
    failed: 0,
    previewed: 0,
    lastGreeting: null,
    greetingPreviewError: "",
    greetingPreviewProgress: "",
    resumeImport: { busy: false, draftText: "", source: "", message: "", revision: 0 },
    versionUpdate: { checking: false, kind: "", releases: [], status: "", message: "" },
    platformRemainingQuota: null,
    current: "未开始",
    logs: [],
    processedKeys: new Set(),
    recovering: false,
    pendingResume: null,
  };

  // 智联岗位卡片对应的 Vue 数据缓存，避免每张卡片重复深度遍历。
  const zhaopinPositionCache = new WeakMap();

  let config = loadConfig();
  let cachedPanel = null;
  // 默认仅保留于内存；用户可另行选择篡改猴专用存储，绝不写入配置或站点存储。
  let greetingAPIKey = "";
