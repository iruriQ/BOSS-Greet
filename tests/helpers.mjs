import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function harness(extraFiles = [], overrides = {}, { bossPacing = false, bossGreetingGuard = false, greetingTargetLength = false } = {}) {
  const values = new Map();
  const calls = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {}, debug() {}, groupCollapsed() {}, groupEnd() {} },
    URL, URLSearchParams, Set, Map, WeakMap, WeakSet, Date,
    GM_getValue: (key, fallback) => values.get(key) ?? fallback,
    GM_setValue: (key, value) => values.set(key, value),
    window: { setTimeout, clearTimeout, navigator: { locks: { request: async (_key, _options, callback) => callback({}) } } },
    location: { hostname: 'www.zhipin.com', href: 'https://www.zhipin.com/web/geek/job' },
    document: { cookie: 'bst=test-token' },
    fetch: async (...args) => { calls.push(args); throw new Error('Unexpected request'); },
    ...overrides,
  });
  const files = ['00-config.js', '02-storage.js', '03-utils.js', '03-resume.js', '03-greeting.js', '03-proofread.js', '03-distance.js', '03-recovery.js', '03-greeting-ownership.js', '03-updates.js', ...extraFiles];
  vm.runInContext(files.map(file => readFileSync(resolve(root, 'src', file), 'utf8')).join('\n'), context);
  const run = (code) => vm.runInContext(code, context);
  run(`function log(){}; function renderPanel(){}; function formatJob(job){return job.jobName + ' - ' + job.brandName};`);
  // Most suites isolate filtering/delivery. Real shared-clock pacing is tested
  // separately with a deterministic advancing clock rather than wall sleeps.
  if (!bossPacing) run('waitForBossOperation=async()=>{};waitForBossJobGap=async()=>{}');
  // Delivery suites isolate the platform-setting API; ownership has its own live-code tests.
  if (!bossGreetingGuard) run('ensureBossNativeGreetingDisabled=async()=>{}');
  // Small legacy fixtures isolate matching/fact review/delivery. Real target-length
  // enforcement, repair and dispatch are exercised separately with full resume fixtures.
  if (!greetingTargetLength) run(`getGreetingLengthRange=(settings=config)=>({targetCharacters:settings.bossGreetingMaxLength,minCharacters:0,maxCharacters:settings.bossGreetingMaxLength})`);
  return { context, run, values, calls };
}
// 下列人物经历、数量和成果均为虚构测试数据。
export const fixtureProfile = {
  bossGreetingMode: "ai",
  bossGreetingUseAI: false,
  bossGreetingIncludeAI: true,
  candidateIntro: '我有业务支持与项目协同经验。',
  candidateProfile: [
    '负责37份服务合同归档，核对附件和条款版本，跟进法务审批。',
    '使用Excel整理门店数据，制作库存统计报表和数据台账。',
    '协同PM和设计团队维护交付清单，累计支持12款应用上线。',
    '对接供应商确认采购订单，跟进验收记录、付款和发票。',
    '在模拟项目中实践AI资料分类，将月均重复整理耗时由约17小时降至约6小时。',
  ].join('\n'),
};
export const fixtureJob = { jobName: '商务专员', brandName: '示例公司', encryptBossId: 'boss-a', encryptJobId: 'job-a', securityId: 'sec-a', lid: 'lid-a' };
