import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob } from './helpers.mjs';
function setup() {
  const h = harness(['05-runner.js', '06-boss.js']);
  h.context.job = { ...fixtureJob, brandScaleName: '100-499人', recruiterOnline: true };
  h.context.detail = { postDescription: '商务支持，项目协调，不接受电话销售方向。', activeTimeDesc: '今天活跃' };
  h.context.adapter = { id: 'boss', canApply: () => true, supportsOnlineFilter: true,
    shouldSkip: (job, detail) => h.context.bossShouldSkip(job, detail) };
  h.run('function getHistoryKey(){return "filter-history"}; config=normalizeConfig({})');
  return h;
}
test('旧分隔文本迁移为独立数组，数组中的词不再按标点拆分，保存后不丢失', () => {
  const h = setup();
  const old = h.run('normalizeConfig({includeDescriptionKeywords:"商务；项目、运营,合同\\nExcel"}).includeDescriptionKeywords');
  assert.deepEqual(Array.from(old), ['商务','项目','运营','合同','Excel']);
  h.run(`saveConfig({...config,includeDescriptionKeywords:['C, C++','合同 管理','', '合同 管理'],excludeDescriptionKeywords:'["电话销售"]'},true)`);
  assert.deepEqual(Array.from(h.run('loadConfig().includeDescriptionKeywords')), ['C, C++','合同 管理']);
  assert.deepEqual(Array.from(h.run('loadConfig().excludeDescriptionKeywords')), ['电话销售']);
});
test('包含词是或的关系，包含优先；没有包含词时排除词才能拦截', () => {
  const h = setup();
  h.run(`config.includeDescriptionKeywords=['完全没有的词','商务'];config.excludeDescriptionKeywords=['电话销售']`);
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), true);
  h.run(`config.includeDescriptionKeywords=['软件开发']`);
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), false);
  h.run(`config.includeDescriptionKeywords=[]`);
  assert.match(h.run('applyFilters(job,detail,adapter).reason'), /排除关键词/);
  h.run(`config.excludeDescriptionKeywords=[]`);
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), true);
});
test('关键词启用时完整详情读取失败不能用列表摘要误判通过', async () => {
  const h = setup();
  h.run(`config.excludeDescriptionKeywords=['电话销售'];adapter.fetchDetail=async()=>{throw Error('超时')}`);
  assert.match(h.run('applyFilters(job,null,adapter).reason'), /无法读取完整岗位详情/);
  assert.equal(await h.run('safeFetchJobDetail(job,adapter)'), null);
  // A nested full JD is accepted after the complete detail response is merged.
  h.context.detail = { jobInfo: { postDescription: '项目协调' } };
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), true);
});
test('仅选中规模可以通过；不限、未知和格式变体有明确结果，包含词不能绕过规模筛选', () => {
  const h = setup();
  h.run(`config.bossCompanySizes=['100-499人','500-999人'];config.includeDescriptionKeywords=['商务']`);
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), true);
  h.run(`job.brandScaleName='20-99人'`);
  assert.match(h.run('applyFilters(job,detail,adapter).reason'), /不在选中范围/);
  h.run(`job.brandScaleName=''`);
  assert.match(h.run('applyFilters(job,detail,adapter).reason'), /无法确认公司规模/);
  h.context.detail.brandComInfo = { scaleName: '100—499人' };
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), true);
  h.run(`config.bossCompanySizes=[]`);
  assert.equal(h.run('applyFilters(job,null,adapter).ok'), false, 'missing JD still blocks keywords');
  h.run(`config.includeDescriptionKeywords=[]`);
  assert.equal(h.run('applyFilters(job,null,adapter).ok'), true);
  for (const [source, expected] of [['少于20人','0-20人'],['10000人以上','10000人以上'],['20人以下','0-20人'],['100-499人','100-499人'],['未知','']]) {
    h.context.scale = source;
    assert.equal(h.run('getBossCompanySize({brandScaleName:scale},null)'), expected);
  }
});
test('招聘方活跃度筛选保留，包含词不能绕过活跃度或在线条件', () => {
  const h = setup();
  h.run(`config.includeDescriptionKeywords=['商务'];detail.activeTimeDesc='30天前活跃'`);
  assert.match(h.run('applyFilters(job,detail,adapter).reason'), /活跃度/);
  h.run(`detail.activeTimeDesc='今天活跃';config.onlyOnlineBoss=true;job.recruiterOnline=false`);
  assert.match(h.run('applyFilters(job,detail,adapter).reason'), /在线/);
});
test('完整详情补取覆盖固定话术的关键词场景，不调用 AI', async () => {
  const h = setup(); const requests = [];
  h.run(`config.bossGreetingMode='fixed';config.excludeDescriptionKeywords=['电话销售']`);
  h.context.fetch = async url => { requests.push(url); return { ok:true, text:async()=>JSON.stringify({ code:0, zpData: requests.length === 1 ? {jobCard:{activeTimeDesc:'今日活跃'}} : {jobInfo:{postDescription:'电话销售岗位'}} }) }; };
  const detail = await h.run('fetchBossJobDetail(job)');
  assert.equal(requests.length, 2);
  assert.match(requests[1], /job\/detail.json/);
  h.context.detail = detail;
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'), false);
});
test('在线判断优先使用详情中的 bossInfo，区分不在线和未知，近期活跃不能代替在线',()=>{
  const h=setup();h.run('config.onlyOnlineBoss=true;job.recruiterOnline=false');
  h.context.detail={bossInfo:{bossOnline:true,activeTimeDesc:'刚刚活跃'}};
  assert.equal(h.run('applyFilters(job,detail,adapter).ok'),true);
  h.context.detail={bossInfo:{bossOnline:false,activeTimeDesc:'刚刚活跃'}};
  assert.match(h.run('applyFilters(job,detail,adapter).reason'),/当前不在线/);
  h.context.detail={bossInfo:{activeTimeDesc:'刚刚活跃'}};
  assert.match(h.run('applyFilters(job,detail,adapter).reason'),/未提供可确认/);
  h.run("job.raw={bossOnline:'1'}");assert.equal(h.run('applyFilters(job,detail,adapter).ok'),true);
  h.run("job.raw={bossOnline:'0'}");assert.match(h.run('applyFilters(job,detail,adapter).reason'),/当前不在线/);
  h.context.detail={bossInfo:{bossOnline:true,activeTimeDesc:'30天前活跃'}};
  assert.match(h.run('applyFilters(job,detail,adapter).reason'),/活跃度/);
});
test('按已确认发布时间新到旧排序，同日稳定，不使用刷新时间/活跃时间/岗位编号', () => {
  const h = setup();
  h.context.jobs = [
    { id:'old', raw:{publishTime:'2025-01-01T00:00:00Z'} },
    { id:'unknown', raw:{refreshTime:Date.now(), activeTimeDesc:'刚刚', jobId:'9999999999999'} },
    { id:'new', raw:{jobInfo:{publishTime:'2025-03-01T00:00:00Z'}} },
    { id:'same', raw:{publishTime:'2025-03-01T00:00:00Z'} },
    { id:'future', raw:{publishTime:'2099-01-01T00:00:00Z'} },
  ];
  assert.deepEqual(Array.from(h.run('orderBossJobsByPublication(jobs).map(job=>job.id)')), ['new','same','old','unknown','future']);
  assert.equal(h.run('getBossPublishedAt({publishTime:1735689600})'), Date.parse('2025-01-01T00:00:00Z'));
});
