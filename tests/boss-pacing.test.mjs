import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob} from './helpers.mjs';

function setup({storage=new Map(),clock={now:100000},random=()=>0.6}={}){
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
 const waits=[];
 const h=harness(['05-runner.js','06-boss.js'],{
  Date:FakeDate,Math:Object.assign(Object.create(Math),{random}),
  GM_getValue:(key,fallback)=>storage.get(key)??fallback,GM_setValue:(key,value)=>storage.set(key,value),
  document:{cookie:'bst=fixture',querySelectorAll:()=>[]},location:{pathname:'/web/geek/jobs',hostname:'www.zhipin.com'},
 },{bossPacing:true});
 h.context.sleep=async ms=>{waits.push(ms);clock.now+=ms;};
 h.run("function getHistoryKey(){return 'pacing-history'}");
 return {...h,storage,clock,waits};
}
test('读取岗位、开聊、打开聊天和固定话术发送均无额外停留，旧操作计时不会残留',async()=>{
 const h=setup();h.run("config.bossGreetingMode='fixed';gmSet(APP_ID+':boss-operation-time',Date.now());gmSet(APP_ID+':boss-operation-window',{dueAt:Date.now()+10000})");
 for(const kind of ['read','read','contact','read','send'])await h.run(`waitForBossOperation('${kind}')`);
 assert.equal(h.clock.now,100000);assert.deepEqual(h.waits,[]);
});
test('AI话术发送就绪后才抽取1—3秒，不因此前模型或聊天加载耗时而省略',async()=>{
 const h=setup();h.run("config.bossGreetingMode='ai'");await h.run("waitForBossOperation('read');waitForBossOperation('contact')");
 h.clock.now+=12000;await h.run("waitForBossOperation('send')");assert.equal(h.clock.now,114000);assert.ok(h.waits.every(ms=>ms<=500));
 assert.equal(h.run('state.bossPacingMessage'),'');
});
test('发送使用本次设置快照：固定正文不误加AI延迟，AI正文不能被界面模式切换取消延迟',async()=>{
 const h=setup();h.run("config.bossGreetingMode='ai'");await h.run("waitForBossOperation('send',{settings:{bossGreetingMode:'fixed'}})");assert.equal(h.clock.now,100000);
 h.run("config.bossGreetingMode='fixed'");await h.run("waitForBossOperation('send',{settings:{bossGreetingMode:'ai'}})");assert.equal(h.clock.now,102000);
});
test('每岗间隔只抽一次、包含1秒和3秒边界，读取和开聊不再抽签',async()=>{
 const values=[0,0.999999,0.2,0.8];let draws=0;const h=setup({random:()=>values[draws++]});
 for(const expected of [1,3,1,3]){
  h.run('markBossJobFinished()');const before=h.clock.now;
  await h.run("(async()=>{await waitForBossJobGap();await waitForBossOperation('read');await waitForBossOperation('contact')})()");assert.equal(h.clock.now-before,expected*1000);
 }
 assert.equal(draws,4);
});
test('停止与刷新保留岗位间隔剩余时间，不重新抽签；取消期间不会继续动作',async()=>{
 const h=setup();h.run('markBossJobFinished()');h.context.sleep=async ms=>{h.clock.now+=ms;h.run('state.stopping=true');};
 await assert.rejects(h.run('waitForBossJobGap()'),/已停止/);assert.equal(h.clock.now,100500);assert.equal(h.run('state.bossPacingMessage'),'');
 let draws=0;const k=setup({storage:h.storage,clock:h.clock,random:()=>{draws++;return 0;}});await k.run('waitForBossJobGap()');
 assert.equal(k.clock.now,102000);assert.equal(draws,0);
});
test('岗位间隔已被其他工作耗尽时不再追加等待；系统时间倒退最多重设原抽签秒数',async()=>{
 const h=setup();h.run('markBossJobFinished()');h.clock.now+=4000;await h.run('waitForBossJobGap()');assert.equal(h.waits.length,0);
 h.run('markBossJobFinished()');h.clock.now-=10000;const before=h.clock.now;await h.run('waitForBossJobGap()');assert.equal(h.clock.now-before,2000);
});
test('真实runner每岗只加一次间隔，固定和平台默认无原4—10秒；AI仅额外加发送前间隔',async()=>{
 for(const mode of ['fixed','ai','native']){
  const h=setup(),events=[];h.context.job=fixtureJob;h.context.next={...fixtureJob,encryptJobId:'next',encryptBossId:'next-boss'};
  h.run(`config.bossGreetingMode='${mode==='ai'?'ai':'fixed'}';config.skipAppliedHistory=false;applyFilters=()=>({ok:true});sleepHumanDelay=async()=>{throw new Error('不能重复等待4—10秒')};state.running=true`);
  h.context.adapter={id:'boss',fetchDetail:async()=>{events.push(['read',h.clock.now]);return{postDescription:'商务合同'};},apply:async()=>{
   await h.run("waitForBossOperation('contact');waitForBossOperation('read')");if(mode!=='native')await h.run("waitForBossOperation('send')");events.push(['send',h.clock.now]);return{ok:true};
  }};
  await h.run('handleOneJob(job,adapter);');await h.run('handleOneJob(next,adapter)');
  assert.deepEqual(events,mode==='ai'?[['read',100000],['send',102000],['read',104000],['send',106000]]:[['read',100000],['send',100000],['read',102000],['send',102000]]);
  assert.equal(h.run('state.failed'),0);
 }
});
test('筛选不符、去重、待检查三种返回都按单个岗位间隔继续，不叠加旧短暂停',async()=>{
 for(const kind of ['filter','skip','pending']){
  const h=setup();let calls=0;h.context.job=fixtureJob;h.context.next={...fixtureJob,encryptJobId:'next'};
  h.run("state.running=true;applyFilters=()=>({ok:true});sleepHumanDelay=async()=>{throw Error('旧延迟')}");
  if(kind==='filter')h.run("applyFilters=()=>({ok:false,reason:'不符'})");
  h.context.adapter={id:'boss',fetchDetail:async()=>{calls++;return{};},apply:async()=>({ok:false,...(kind==='skip'?{skipped:true}:{pendingReview:true})})};
  await h.run('handleOneJob(job,adapter)');await h.run('handleOneJob(next,adapter)');assert.equal(h.clock.now,102000);assert.equal(calls,2);
 }
});
test('异常登录在岗位间隔或AI发送等待中出现都立即停止并禁止自动续跑',async()=>{
 for(const action of ['waitForBossJobGap()',"waitForBossOperation('send')"]){
  const h=setup();let visible=false;h.run("config.bossGreetingMode='ai';markBossJobFinished();function getPlatformId(){return 'boss'};state.running=true;state.pendingResume={platform:'boss'};saveResumeState()");
  h.context.document.querySelectorAll=selector=>visible&&selector.includes("[role='dialog']")?[{innerText:'异常登录，请完成安全验证',className:'ui-dialog',getClientRects:()=>[{}],getBoundingClientRect:()=>({width:200,height:100})}]:[];
  h.context.sleep=async ms=>{h.clock.now+=ms;visible=true;};await assert.rejects(h.run(action),e=>e.code==='BOSS_PLATFORM_BLOCKED');
  assert.equal(h.run('state.pendingResume'),null);assert.equal(h.run('gmGet(RESUME_KEY,null)'),null);assert.equal(h.run('state.stopping'),true);
  visible=false;assert.match(h.run('autoRecoveryBlockReason()'),/暂停自动恢复/);h.run('beginManualBossAction();state.stopping=false');assert.equal(h.run('autoRecoveryBlockReason()'),'');
 }
});
test('真实读取函数连续调用不再逐次等待，用户停止后仍不发请求',async()=>{
 const h=setup(),operations=[];h.context.job=fixtureJob;h.context.fetch=async()=>{operations.push(h.clock.now);return{ok:true,status:200,text:async()=>JSON.stringify({code:0,zpData:{jobCard:{postDescription:'商务合同'}}})};};
 h.run("config.bossGreetingMode='fixed';config.bossDistanceEnabled=false");await h.run('fetchBossJobDetail(job)');await h.run('fetchBossJobDetail(job)');assert.deepEqual(operations,[100000,100000]);
 h.run('state.stopping=true');await assert.rejects(h.run('fetchBossJobDetail(job)'),/已停止/);assert.equal(operations.length,2);
});
test('旧间隔配置不可覆盖底层策略，页面异常监听器仍立即停止',()=>{
 const h=setup();h.run('config=normalizeConfig({...config,bossReadIntervalSec:20,bossContactIntervalSec:20,bossSendIntervalSec:20})');
 assert.equal(h.run('["bossReadIntervalSec","bossContactIntervalSec","bossSendIntervalSec"].some(key=>key in config)'),false);
 let mutation;h.context.MutationObserver=class{constructor(callback){mutation=callback;}observe(){}};h.context.document.documentElement={};h.context.window.setTimeout=callback=>callback();
 h.context.document.querySelectorAll=selector=>selector.includes("[role='dialog']")?[{innerText:'登录异常，请完成验证',className:'ui-dialog',getClientRects:()=>[{}],getBoundingClientRect:()=>({width:200,height:100})}]:[];
 h.run('state.running=true;installBossPlatformGuard()');mutation();assert.equal(h.run('state.stopping'),true);assert.equal(h.calls.length,0);
});
