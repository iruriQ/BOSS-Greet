import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob,fixtureProfile} from './helpers.mjs';
const passed={verdict:'pass',checks:{typos:true,grammar:true,wording:true,facts:true,relevance:true},issues:[],edits:[]};

function setup(responses=[200]){
  const requests=[],waits=[],timers=[];
  const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js','09-bootstrap.js'],{
    document:{readyState:'loading',addEventListener(){}},
    GM_xmlhttpRequest:options=>{
      requests.push(options);
      const status=responses.shift() ?? 200;
      if(status==='timeout')return options.ontimeout();
      options.onload({status,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(passed)}}]})});
    },
  });
  h.context.job={...fixtureJob};h.context.profile=fixtureProfile;
  h.context.detail={postDescription:'合同管理、商务协同'};
  h.context.waits=waits;
  h.context.window.setTimeout=callback=>{timers.push(callback);return timers.length;};
  h.run(`config=normalizeConfig({...config,...profile,autoRecoveryEnabled:true,greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'test'});
    function getPlatformId(){return 'boss'};function getHistoryKey(){return 'history'};function getAdapter(){return adapter};
    notify=()=>{};sleep=async ms=>waits.push(ms);sleepHumanDelay=async()=>{};
    let opened=0,sent=0;openBossConversation=async()=>{opened++;return {ok:true}};
    sendBossGreetingInChat=async()=>{sent++;return {confirmed:true}};`);
  h.context.adapter={id:'boss',isListPage:()=>true,ensureLogin:()=>({ok:true}),canApply:()=>true,fetchDetail:async()=>h.context.detail,apply:(job,detail)=>h.context.applyBossJob(job,detail)};
  return {...h,requests,waits,timers};
}

test('模型超时、503、429只在开聊前等待恢复，恢复后只发送一次',async()=>{
  for(const failure of ['timeout',503,429]){
    const h=setup([failure,200]);h.run('state.running=true');
    await h.run('handleOneJob(job,adapter)');
    assert.equal(h.requests.length,2);
    assert.equal(h.waits.filter(ms=>ms===1000).length,30);
    assert.equal(h.run('opened'),1);assert.equal(h.run('sent'),1);
    assert.equal(h.run('state.applied'),1);assert.equal(h.run('state.failed'),0);
    assert.equal(h.run('state.processedKeys.size'),1);
  }
});

test('持续故障最多自动恢复3次，保留明确停止原因而非无限点击开始',async()=>{
  const h=setup([503,503,503,503,200]);h.run('state.running=true');
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.requests.length,4);
  assert.equal(h.waits.filter(ms=>ms===1000).length,210);
  assert.equal(h.run('opened'),0);assert.equal(h.run('sent'),0);
  assert.equal(h.run('state.stopping'),true);
  assert.match(h.run('state.current'),/3次上限/);
});

test('倒计时中手动停止立即取消恢复，并清除跨页面续跑状态',async()=>{
  const h=setup([503,200]);
  h.run('state.running=true;sleep=async()=>stopApply();saveResumeState()');
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.requests.length,1);
  assert.equal(h.run('sent'),0);
  assert.match(h.run('state.current'),/正在停止/);
  assert.equal(h.run('gmGet(RESUME_KEY,null)'),null);
});

test('平台限制和发送结果不明不进入自动恢复',async()=>{
  for(const result of [{limited:true,message:'今日沟通已达上限'},{needsAttention:true,message:'发送结果不明'}]){
    const h=setup();let calls=0;
    h.context.adapter.apply=async()=>{calls++;return {ok:false,...result};};
    h.run('state.running=true');await h.run('handleOneJob(job,adapter)');
    assert.equal(calls,1);assert.equal(h.waits.length,0);
    assert.equal(h.run('state.stopping'),true);
    assert.equal(h.run('state.pendingResume'),null);
  }
});

test('验证码或登录遮罩出现时自动恢复保持暂停',async()=>{
  const h=setup([503,200]);
  h.context.document.querySelectorAll=()=>[{className:'captcha',innerText:'安全验证',getClientRects:()=>[{}],getBoundingClientRect:()=>({width:200,height:100})}];
  h.run('state.running=true');await h.run('handleOneJob(job,adapter)');
  assert.equal(h.requests.length,1);
  assert.equal(h.run('sent'),0);
  assert.match(h.run('state.current'),/登录|验证/);
});

test('401保留尚未开聊岗位，清除失效密钥，更新后自动恢复原进度',async()=>{
  const h=setup([401,200]);
  h.run('state.running=true;state.applied=7;greetingAPIKey="expired-fixture"');
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.requests.length,1);assert.equal(h.run('opened'),0);
  assert.equal(h.run('greetingAPIKey'),'');
  assert.equal(h.run('state.pendingResume.applied'),7);
  assert.equal(h.run('state.pendingResume.processedKeys.length'),0);
  h.run('state.running=false;state.stopping=false;globalThis.resumed=null;startApply=async options=>{resumed=options.resume}');
  h.context.window.prompt=()=> 'replacement-fixture';
  h.run('setGreetingSessionKey()');
  assert.equal(h.run('resumed.applied'),7);
  assert.equal(h.requests.length,1);
});

test('刷新后缺密钥时只等待输入，不向接口发送无鉴权请求',()=>{
  const h=setup();
  h.run('config.rememberGreetingKey=true;state.running=true;saveResumeState();state.running=false');
  assert.equal(h.run('resumePendingRun()'),true);
  assert.equal(h.run('state.pendingResume.platform'),'boss');
  assert.match(h.run('state.current'),/等待 AI 密钥/);
  assert.equal(h.timers.length,0);assert.equal(h.requests.length,0);
});

test('停止等待密钥或尚未触发的续跑定时器后不再自动启动',()=>{
  const h=setup();
  h.run('state.running=true;saveResumeState();state.running=false;resumePendingRun();stopApply();globalThis.started=0;startApply=async()=>{started++}');
  assert.equal(h.timers.length,1);
  h.timers[0]();
  h.run('greetingAPIKey="fixture-token";resumeAfterGreetingKey()');
  assert.equal(h.run('started'),0);assert.equal(h.run('state.pendingResume'),null);
});

test('列表加载超时可自动续跑，但确认列表结束时不重新启动',async()=>{
  const h=setup();let calls=0;
  h.context.adapter.nextPage=async()=>{calls++;h.run('state.paginationRetryable=true');return calls>1;};
  assert.equal(await h.run('nextPageWithAutoRecovery(adapter)'),true);
  assert.equal(calls,2);assert.equal(h.waits.length,30);
  h.waits.length=0;calls=0;
  h.context.adapter.nextPage=async()=>{calls++;h.run('state.paginationRetryable=false');return false;};
  assert.equal(await h.run('nextPageWithAutoRecovery(adapter)'),false);
  assert.equal(calls,1);assert.equal(h.waits.length,0);
});

test('关闭自动恢复时临时故障仍停止，不自动续跑',async()=>{
  const h=setup([503,200]);h.run('config.autoRecoveryEnabled=false;state.running=true');
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.requests.length,1);assert.equal(h.waits.length,0);
  assert.equal(h.run('state.stopping'),true);
});

test('本机密钥需明确开启保存，绑定服务端点，关闭即清除且不使用站点存储',()=>{
  const h=setup();h.context.window.prompt=()=> 'private-fixture-token';
  h.run('setGreetingSessionKey()');
  assert.equal(h.values.size,0);
  h.run('saveConfig({...config,rememberGreetingKey:true});greetingAPIKey="";restoreGreetingKey()');
  assert.equal(h.run('greetingAPIKey'),'private-fixture-token');
  assert.doesNotMatch(h.run('JSON.stringify(config)'),/private-fixture-token/);
  h.run('saveConfig({...config,greetingAIEndpoint:"https://other.example/chat/completions"});restoreGreetingKey()');
  assert.equal(h.run('greetingAPIKey'),'');
  h.run('greetingAPIKey="new-fixture-token";storeGreetingKey();saveConfig({...config,rememberGreetingKey:false})');
  assert.equal(h.run('gmGet(GREETING_SECRET_KEY,null)'),null);
  h.context.GM_setValue=undefined;
  h.context.window.localStorage={setItem(){throw Error('Secrets must not use site storage');}};
  h.run('config.rememberGreetingKey=true;storeGreetingKey()');
});
