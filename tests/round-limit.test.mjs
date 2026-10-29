import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob } from './helpers.mjs';

function setup({ limit = 3, preview = false, nativeBoss = false } = {}) {
  const h = harness(['05-runner.js', ...(nativeBoss ? ['06-boss.js', '06-boss-greeting.js'] : [])]);
  h.context.limit = limit; h.context.preview = preview;
  h.context.jobs = Array.from({ length: 180 }, (_, i) => ({ ...fixtureJob, key: `job-${i}`, encryptJobId: `job-${i}`, encryptBossId: `boss-${i}` }));
  const calls = [], pages = [];
  h.context.adapter = { id: 'boss', isListPage: () => true, ensureLogin: () => ({ ok: true }),
    getCards: () => h.context.jobs, buildJob: card => card, canApply: () => true,
    fetchDetail: async () => ({}),
    apply: async job => { calls.push(job.key); return { ok: !preview, preview }; },
    nextPage: async () => { pages.push(true); return false; } };
  h.run(`function getPlatformId(){return 'boss'};function getHistoryKey(){return 'round-history'};
    function getDailyLimit(){return 150};function getAdapter(){return adapter};notify=()=>{};
    sleep=async()=>{};sleepHumanDelay=async()=>{};applyFilters=job=>({ok:!job.skip,reason:'不匹配'});
    config=normalizeConfig({...config,maxApplyCount:limit,bossPersonalizedGreeting:${nativeBoss || preview},
      bossGreetingMode:'fixed',bossFixedGreeting:'您好，我对岗位很感兴趣。',bossFixedGreetingConfirmed:true,
      bossFixedGreetingConfirmedText:'您好，我对岗位很感兴趣。',bossGreetingPreviewOnly:preview,
      autoRecoveryEnabled:true,bossDistanceEnabled:false});`);
  return { ...h, calls, pages };
}

test('本轮数量保存、旧无限值迁移和非法值回退，不影响固定正文或每日限制', () => {
  const h = setup();
  for (const value of [1, 20, 150, '7']) {
    h.context.value = value;
    h.run('saveConfig({...config,maxApplyCount:value},true);config=loadConfig()');
    assert.equal(h.run('config.maxApplyCount'), Number(value));
    assert.equal(h.run('config.dailyLimit'), 150);
    assert.equal(h.run('config.bossFixedGreeting'), '您好，我对岗位很感兴趣。');
  }
  for (const value of [9999, 0, -1, 151, 1.5, '', 'abc', null, Infinity]) {
    h.context.value = value;
    assert.equal(h.run('normalizeConfig({maxApplyCount:value}).maxApplyCount'), 20);
  }
});

test('设置多少最多处理多少个实际投递，达到后不翻页、不保留自动续跑', async () => {
  for (const limit of [1, 3, 150]) {
    const h = setup({ limit });
    await h.run('startApply()');
    assert.equal(h.calls.length, limit);
    assert.equal(h.run('state.applied'), limit);
    assert.equal(h.run('state.submitted'), limit);
    assert.equal(h.run('loadHistory().dailyCount'), limit);
    assert.equal(h.pages.length, 0);
    assert.equal(h.run('state.running'), false);
    assert.equal(h.run('state.pendingResume'), null);
    assert.equal(h.run('gmGet(RESUME_KEY,null)'), null);
    assert.match(h.run('state.current'), new RegExp(`达到设定数量 ${limit} 个`));
  }
});

test('跳过和未建立沟通的失败不占数量，继续查找直到达到本轮数量', async () => {
  const h = setup({ limit: 2 });
  h.context.jobs[0].skip = true;
  h.context.jobs[2].skip = true;
  h.context.adapter.apply = async job => {
    h.calls.push(job.key);
    return job.key === 'job-1' ? { ok: false, message: '未建立沟通' } : { ok: true };
  };
  await h.run('startApply()');
  assert.deepEqual(h.calls, ['job-1', 'job-3', 'job-4']);
  assert.equal(h.run('state.scanned'), 5);
  assert.equal(h.run('state.skipped'), 2);
  assert.equal(h.run('state.failed'), 1);
  assert.equal(h.run('state.submitted'), 2);
});

test('BOSS 已开聊但话术未发送也占本轮名额，重复写入记录不会重复计数', async () => {
  const h = setup({ limit: 1, nativeBoss: true });
  let contacts = 0;
  h.context.openBossConversation = async () => { contacts++; return { ok: true }; };
  h.context.sendBossGreetingInChat = async () => { throw Object.assign(Error('发送按钮未就绪'), { code: 'BOSS_GREETING_NOT_SENT', sendAttempted: false }); };
  h.context.adapter.apply = (job, detail) => h.context.applyBossJob(job, detail);
  await h.run('startApply()');
  assert.equal(contacts, 1);
  assert.equal(h.run('state.applied'), 0);
  assert.equal(h.run('state.submitted'), 1);
  assert.equal(h.run('loadHistory().dailyCount'), 1);
  assert.match(h.run('state.current'), /达到设定数量 1 个/);
  h.run('state.running=true;recordApplied(jobs[0]);recordApplied(jobs[0]);state.running=false');
  assert.equal(h.run('state.submitted'), 1);
});

test('试运行按预览数量停止，不消耗实际沟通名额或记录成功投递', async () => {
  const h = setup({ limit: 2, preview: true });
  await h.run('startApply()');
  assert.equal(h.calls.length, 2);
  assert.equal(h.run('state.previewed'), 2);
  assert.equal(h.run('state.applied'), 0);
  assert.equal(h.run('state.submitted'), 0);
  assert.equal(h.run('loadHistory().dailyCount'), 0);
  assert.equal(h.pages.length, 0);
  assert.match(h.run('state.current'), /已预览 2 个.*未实际投递/);
});

test('翻页不重置本轮数量，第二页达到数量后不再翻页', async () => {
  const h = setup({ limit: 3 });
  const jobs = h.context.jobs;
  h.context.jobs = jobs.slice(0, 2);
  h.context.adapter.nextPage = async () => { h.pages.push(true); h.context.jobs = jobs.slice(2, 4); return true; };
  await h.run('startApply()');
  assert.equal(h.calls.length, 3);
  assert.equal(h.pages.length, 1);
  assert.equal(h.run('state.submitted'), 3);
});

test('断点恢复沿用原数量与原上限，只处理剩余名额；已达数量时不扫描、不投递', async () => {
  const h = setup({ limit: 20 });
  h.run(`state.running=true;state.applied=2;state.submitted=2;state.roundLimit=3;
    globalThis.saved=createRunSnapshot();state.running=false;`);
  assert.equal(h.context.saved.submitted, 2);
  assert.equal(h.context.saved.roundLimit, 3);
  await h.run('startApply({resume:saved})');
  assert.equal(h.calls.length, 1);
  assert.equal(h.run('state.submitted'), 3);
  assert.equal(h.run('state.roundLimit'), 3);
  h.context.adapter.getCards = () => { throw Error('已达数量不得读取列表'); };
  h.run(`globalThis.finished={...saved,submitted:3,applied:3}`);
  await h.run('startApply({resume:finished})');
  assert.equal(h.calls.length, 1);
  assert.match(h.run('state.current'), /达到设定数量 3 个/);
});

test('新一轮需用户手动开始，计数重置；每日上限仍优先限制剩余数量', async () => {
  const h = setup({ limit: 2 });
  await h.run('startApply()');
  h.context.jobs = h.context.jobs.slice(2);
  await h.run('startApply()');
  assert.equal(h.calls.length, 4);
  assert.equal(h.run('state.submitted'), 2);
  assert.equal(h.run('loadHistory().dailyCount'), 4);
  const nearDaily = setup({ limit: 5 });
  nearDaily.run(`saveHistory({date:getToday(),dailyCount:149,appliedKeys:Array.from({length:149},(_,i)=>'prior-'+i)})`);
  await nearDaily.run('startApply()');
  assert.equal(nearDaily.calls.length, 1);
  assert.equal(nearDaily.run('state.submitted'), 1);
  assert.match(nearDaily.run('state.current'), /每日上限/);
});
