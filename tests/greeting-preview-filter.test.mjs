import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob, fixtureProfile } from './helpers.mjs';
function setup() {
  const h=harness(['05-runner.js','06-boss.js']);
  h.context.jobs=[]; const generated=[], reads=[], pages=[];
  h.context.getHistoryKey=()=> 'preview-history';
  h.context.adapter={id:'boss',getCards:()=>h.context.jobs,buildJob:job=>job,canApply:job=>!job.missing,
    supportsOnlineFilter:true,shouldSkip:(job,detail)=>h.context.bossShouldSkip(job,detail),
    fetchDetail:async job=>{reads.push(job.encryptJobId);return job.detail || {postDescription:'合同管理',activeTimeDesc:'今日活跃'};},
    nextPage:async options=>{pages.push(options);return false;}};
  h.context.getAdapter=()=>h.context.adapter;
  h.context.generate=async(job,detail)=>{generated.push(job.encryptJobId);return{text:'您好！对这个岗位感兴趣。',proofread:{status:'awaiting-confirmation'}};};
  h.run(`config=normalizeConfig({...config,bossGreetingMode:'fixed',bossFixedGreeting:'您好！对这个岗位感兴趣。'});prepareBossGreeting=generate;sleep=async()=>{};`);
  const job=(id,props={})=>({...fixtureJob,encryptJobId:id,brandScaleName:'100-499人',recruiterOnline:true,...props});
  return {...h,generated,reads,pages,job};
}
test('跳过首个远距离岗位、关键词/规模/活跃度/在线/已投记录不符岗位，只生成首个匹配项，预览不消耗投递名额',async()=>{
  const h=setup();
  h.context.jobs=[h.job('far',{tooFar:true}),h.job('wrong-key',{detail:{postDescription:'纯销售',activeTimeDesc:'今日活跃'}}),
    h.job('small',{brandScaleName:'20-99人'}),h.job('inactive',{detail:{postDescription:'合同管理',activeTimeDesc:'30天前活跃'}}),
    h.job('offline',{recruiterOnline:false}),h.job('contacted',{contact:true}),h.job('history'),
    h.job('valid'),h.job('later')];
  h.run(`config.includeDescriptionKeywords=['合同'];config.excludeDescriptionKeywords=['管理'];config.bossCompanySizes=['100-499人'];config.onlyOnlineBoss=true;
    filterBossHomeDistance=job=>job.tooFar?{ok:false,reason:'超过10公里'}:{ok:true};
    gmSet('preview-history',{date:getToday(),dailyCount:1,appliedKeys:[getJobUniqueKey(jobs[6])]});
    state.scanned=17;state.applied=2;state.previewed=4;state.processedKeys.add('existing');`);
  const values=JSON.stringify([...h.values].filter(([key])=>!key.endsWith(':boss-job-gap-v2'))); const config=h.run('JSON.stringify(config)');
  await h.run('previewBossGreeting()');
  assert.deepEqual(h.generated,['valid']);
  assert.equal(h.pages.length,0);
  assert.match(h.run('state.greetingPreviewProgress'),/已检查 8 个.*第一个符合条件/);
  assert.equal(h.run('state.greetingPreviewError'),'');
  assert.deepEqual(Array.from(h.run('[state.scanned,state.applied,state.previewed,state.submitted]')),[17,2,4,0]);
  assert.deepEqual(Array.from(h.run('state.processedKeys')),['existing']);
  assert.equal(JSON.stringify([...h.values].filter(([key])=>!key.endsWith(':boss-job-gap-v2'))),values);assert.equal(h.run('JSON.stringify(config)'),config);assert.equal(h.calls.length,0);
});
test('当前批次没有匹配项时只读加载更多，跨批次去重，下一批匹配岗位可预览',async()=>{
  const h=setup();const wrong=h.job('first',{brandScaleName:'20-99人'});h.context.jobs=[wrong];
  h.run(`config.bossCompanySizes=['100-499人']`);
  h.context.adapter.nextPage=async options=>{h.pages.push(options);h.context.jobs=[wrong,h.job('next')];return true;};
  await h.run('previewBossGreeting()');
  assert.deepEqual(h.generated,['next']);assert.deepEqual(h.reads,['first','next']);assert.equal(h.pages[0].probe,true);
  assert.equal(h.run('state.processedKeys.size'),0);
});
test('全部不符合或详情读取失败时不生成，展示汇总原因，不把首个失败当作整个预览失败',async()=>{
  const h=setup();h.context.jobs=[h.job('small',{brandScaleName:'20-99人'}),h.job('unreadable')];
  h.run(`config.bossCompanySizes=['100-499人']`);
  h.context.adapter.fetchDetail=async job=>{if(job.encryptJobId==='unreadable')throw Error('网络异常');return{postDescription:'合同管理'};};
  await h.run('previewBossGreeting()');
  assert.deepEqual(h.generated,[]);assert.equal(h.run('state.lastGreeting'),null);
  assert.match(h.run('state.greetingPreviewError'),/已检查 2 个.*暂未找到符合条件/);
  assert.match(h.run('state.greetingPreviewError'),/公司规模.*详情读取失败/);
  assert.equal(h.run('state.previewing'),false);
});
test('停止正在读取的预览后，不生成任何话术，也不影响历史、待恢复任务和投递计数',async()=>{
  const h=setup();h.context.jobs=[h.job('first')];
  h.context.adapter.fetchDetail=async()=>{h.run('stopApply()');return{postDescription:'合同管理'};};
  h.run(`state.pendingResume={platform:'boss',applied:3};state.submitted=3`);
  await h.run('previewBossGreeting()');
  assert.deepEqual(h.generated,[]);assert.equal(h.pages.length,0);assert.match(h.run('state.greetingPreviewError'),/已停止/);
  assert.equal(h.run('state.submitted'),3);assert.equal(h.run('state.pendingResume.applied'),3);assert.equal(h.run('state.stopping'),false);
});
test('全局配置错误在扫描前报出；符合条件后的模型错误直接展示，不把它当岗位不匹配继续消耗请求',async()=>{
  const h=setup();h.context.jobs=[h.job('first'),h.job('second')];
  h.run(`config.bossFixedGreeting=''`);await h.run('previewBossGreeting()');assert.equal(h.reads.length,0);assert.match(h.run('state.greetingPreviewError'),/填写固定/);
  h.run(`config.bossFixedGreeting='您好！';prepareBossGreeting=async()=>{throw Error('HTTP 401')}`);
  await h.run('previewBossGreeting()');assert.deepEqual(h.reads,['first']);assert.match(h.run('state.greetingPreviewError'),/HTTP 401/);
});
test('预览查找达到上限明确提示，不自动放宽筛选或无限翻页',async()=>{
  const h=setup();h.context.jobs=Array.from({length:201},(_,i)=>h.job(String(i),{brandScaleName:'20-99人'}));
  h.run(`config.bossCompanySizes=['100-499人']`);await h.run('previewBossGreeting()');
  assert.equal(h.reads.length,200);assert.deepEqual(h.generated,[]);assert.match(h.run('state.greetingPreviewError'),/已检查 200 个/);
});
test('连续三次读取错误停止扫描，验证错误首次即停止，避免继续反复请求',async()=>{
  for(const blocked of [false,true]){
    const h=setup();let count=0;
    h.context.jobs=Array.from({length:8},(_,i)=>h.job(String(i)));
    h.context.adapter.fetchDetail=async()=>{count++;const error=Error(blocked?'请完成验证':'HTTP 500');error.stopPreview=blocked;throw error;};
    await h.run('previewBossGreeting()');
    assert.equal(count,blocked?1:3);assert.equal(h.generated.length,0);assert.equal(h.pages.length,0);
    assert.match(h.run('state.greetingPreviewError'),/已停止查找.*具体原因/);assert.equal(h.run('state.previewing'),false);
  }
});
