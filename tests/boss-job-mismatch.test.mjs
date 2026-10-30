import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob } from './helpers.mjs';

const mismatch = '工作经历不匹配；您的工作经历与该岗位要求不匹配，得到回复的概率较低，建议您选择其他职位沟通。';
function setup({ mode = 'fixed', warning = mismatch, code = 1, status = 200 } = {}) {
  const posts = [], sent = [];
  const h = harness(['05-runner.js', '06-boss.js', '06-boss-greeting.js'], {
    fetch: async (url, options) => {
      posts.push([url, options]);
      return { ok: status === 200, status, text: async () => JSON.stringify({ code,
        zpData: { bizData: { chatRemindDialog: { title: warning, content: warning } } } }) };
    },
  });
  h.context.job = { ...fixtureJob };
  h.context.detail = { postDescription: '业务支持与合同管理' };
  h.context.adapter = { id: 'boss', canApply: () => true, fetchDetail: async () => h.context.detail,
    apply: (job, detail) => h.context.applyBossJob(job, detail) };
  h.run(`config = normalizeConfig({...config, bossPersonalizedGreeting:${mode !== 'native'},
    bossGreetingMode:'${mode === 'ai' ? 'ai' : 'fixed'}', bossGreetingPreviewOnly:false,
    bossDistanceEnabled:false, onlyOnlineBoss:false, companySizes:[], includeDescriptionKeywords:[],
    excludeDescriptionKeywords:[], excludeTitleKeywords:[], autoRecoveryEnabled:true});
    state.running=true; sleep=async()=>{};
    prepareBossGreeting=async()=>({text:'您好，我有业务支持经验。',proofread:{status:'passed'}});
    assertBossGreetingAuthorized=()=>{};
    function getPlatformId(){return 'boss'};
    function getHistoryKey(){return 'job-mismatch-history'};
    log=()=>{};`);
  h.context.sendBossGreetingInChat = async () => { sent.push(true); throw Error('不应发送'); };
  return { ...h, posts, sent };
}

test('三种模式遇到明确经历不匹配只跳过当前岗位，不暂停、不发送、不占额度', async () => {
  for (const mode of ['native', 'fixed', 'ai']) {
    const h = setup({ mode });
    await h.run('handleOneJob(job,adapter)');
    assert.equal(h.posts.length, 1);
    assert.equal(h.sent.length, 0);
    assert.equal(h.run('state.stopping'), false);
    assert.equal(h.run('state.skipped'), 1);
    assert.equal(h.run('state.failed'), 0);
    assert.equal(h.run('state.applied'), 0);
    assert.equal(h.run('state.submitted'), 0);
    assert.equal(h.run('loadHistory().dailyCount'), 0);
    if (mode !== 'native') {
      assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].status'), 'job-mismatch');
      assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].sendAttempted'), false);
    }
  }
});

test('跳过经历不匹配后，循环仍处理下一个岗位且不重试前一个', async () => {
  const h = setup();
  h.context.jobs = [h.context.job, { ...fixtureJob, encryptJobId: 'job-next', encryptBossId: 'boss-next' }];
  const next = [];
  h.context.adapter.getCards = () => h.context.jobs;
  h.context.adapter.buildJob = job => job;
  h.context.adapter.nextPage = async () => false;
  h.context.adapter.apply = (job, detail) => {
    if (job.encryptJobId === fixtureJob.encryptJobId) return h.context.applyBossJob(job, detail);
    next.push(job.encryptJobId); return { ok: true };
  };
  h.run(`config.autoNextPage=false;config.maxApplyCount=20;
    collectJobsWithWait=async()=>jobs;prepareBossLatestOrder=async()=>false;
    function getDailyLimit(){return 150};`);
  await h.run('runApplyLoop(adapter)');
  assert.deepEqual(next, ['job-next']);
  assert.equal(h.posts.length, 1);
  assert.equal(h.run('state.skipped'), 1);
  assert.equal(h.run('state.applied'), 1);
  assert.equal(h.run('state.stopping'), false);
});

test('经历不匹配不会覆盖验证、频率、账号和额度等整轮暂停原因', async () => {
  for (const warning of [mismatch+'请完成安全验证', mismatch+'操作频繁', mismatch+'账号异常', mismatch+'还剩0次沟通机会']) {
    const h = setup({ warning });
    await h.run('handleOneJob(job,adapter)');
    assert.equal(h.run('state.stopping'), true, warning);
    assert.equal(h.run('state.skipped'), 0);
    assert.equal(h.sent.length, 0);
    assert.equal(h.posts.length, 1);
  }
});

test('未知提醒和发送状态不明仍需人工检查，不扩大成自动跳过', async () => {
  const h = setup({ warning: '请补充资料后再沟通' });
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.run('state.stopping'), true);
  assert.equal(h.run('state.skipped'), 0);
  assert.equal(h.sent.length, 0);
});

test('经验不匹配两种明确措辞都识别，普通职责文字不会误判', () => {
  const h = setup();
  for (const text of ['工作经历不匹配', '工作经验不匹配', '您的工作经验与该岗位要求不匹配']) {
    h.context.text = text;
    assert.equal(h.run('isBossJobExperienceMismatch(text)'), true);
  }
  for (const text of ['工作经历符合要求', '工作经验不限', '职位不匹配，请检查', '请完善工作经历']) {
    h.context.text = text;
    assert.equal(h.run('isBossJobExperienceMismatch(text)'), false);
  }
});
