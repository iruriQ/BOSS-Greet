import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob} from './helpers.mjs';
const text='您好！我对贵公司的岗位很感兴趣，期待进一步交流。\n感谢您查看我的简历。';
function setup(extra={}){
  let aiCalls=0,opened=0,sent=0;
  const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{
    GM_xmlhttpRequest:()=>{aiCalls++;throw Error('固定话术不能调用AI');},...extra,
  });
  h.context.job={...fixtureJob};h.context.fixedText=text;
  h.run(`config=normalizeConfig({...config,bossGreetingMode:'fixed',bossFixedGreeting:fixedText,bossFixedGreetingConfirmed:true,bossFixedGreetingConfirmedText:fixedText});
    function getHistoryKey(){return 'history'};function getDailyLimit(){return 150};sleep=async()=>{};sleepHumanDelay=async()=>{};`);
  h.context.openBossConversation=async()=>{opened++;return {ok:true};};
  h.context.sendBossGreetingInChat=async(_job,value,approval,options)=>{
    h.context.value=value;h.context.approval=approval;h.context.settings=options.settings;
    h.run('assertBossGreetingAuthorized(value,approval,settings)');sent++;return {confirmed:true};
  };
  return {...h,aiCalls:()=>aiCalls,opened:()=>opened,sent:()=>sent};
}

test('固定话术无简历、JD、模型和密钥时仍原样发送，所有AI调用为零并保留去重',async()=>{
  const h=setup();
  const result=await h.run('applyBossJob(job,null)');
  assert.equal(result.ok,true);assert.equal(h.context.value,text);
  assert.equal(h.aiCalls(),0);assert.equal(h.opened(),1);assert.equal(h.sent(),1);
  assert.equal(h.run('loadHistory().dailyCount'),1);
  assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].status'),'sent');
  assert.equal((await h.run('applyBossJob(job,null)')).skipped,true);
  assert.equal(h.opened(),1);assert.equal(h.sent(),1);
});
test('即便已有AI配置和密钥，固定模式也不向AI发送任何资料',async()=>{
  const h=setup();h.run(`config.greetingAIEndpoint='https://model.example/chat/completions';config.greetingAIModel='unused';greetingAPIKey='fictional';config.bossGreetingUseAI=true;`);
  assert.equal((await h.run('applyBossJob(job,null)')).ok,true);assert.equal(h.aiCalls(),0);
});

test('空正文、仅空格、超长、隐藏字符、待填模板、未确认及确认文本不一致时零开聊零发送',async()=>{
  for(const value of ['', '  ', '文'.repeat(501), '您好\u200b', '您好，{{姓名}}', '请填写经历']){
    const h=setup();h.context.value=value;
    h.run('config.bossFixedGreeting=value;config.bossFixedGreetingConfirmedText=value');
    assert.equal((await h.run('applyBossJob(job,null)')).needsAttention,true);
    assert.equal(h.opened(),0);assert.equal(h.sent(),0);assert.equal(h.aiCalls(),0);
  }
  for(const change of ['config.bossFixedGreetingConfirmed=false','config.bossFixedGreetingConfirmedText="旧文本"']){
    const h=setup();h.run(change);
    assert.equal((await h.run('applyBossJob(job,null)')).needsAttention,true);assert.equal(h.opened(),0);
  }
});
test('固定模式可以预览未确认原文，但不能将预览当作发送许可',async()=>{
  const h=setup();h.run('config.bossGreetingPreviewOnly=true;config.bossFixedGreetingConfirmed=false');
  const draft=await h.run('prepareBossGreeting(job,null,config)');
  assert.equal(draft.text,text);assert.equal(draft.proofread.status,'awaiting-confirmation');
  assert.equal((await h.run('applyBossJob(job,null)')).preview,true);
  assert.equal(h.opened(),0);assert.equal(h.sent(),0);assert.equal(h.aiCalls(),0);
});
test('固定原文确认与AI校对不可互相替代，最终文本发生变化时拒绝发送',()=>{
  const h=setup();h.run(`const fixedReview={status:'user-confirmed',reviewedText:fixedText};
    const aiReview={status:'passed',reviewedText:fixedText,checks:['typos','grammar','wording','facts','relevance']};`);
  assert.doesNotThrow(()=>h.run('assertBossGreetingAuthorized(fixedText,fixedReview,config)'));
  assert.throws(()=>h.run('assertBossGreetingAuthorized(fixedText,aiReview,config)'),/不一致/);
  assert.throws(()=>h.run('assertBossGreetingAuthorized(fixedText+"更改",fixedReview,config)'),/不一致/);
  h.run('config.bossGreetingMode="ai"');
  assert.throws(()=>h.run('assertBossGreetingAuthorized(fixedText,fixedReview,config)'),/完整校对/);
});
test('修改固定正文撤销确认，重载配置也不会恢复旧确认',()=>{
  const h=setup();h.run('config=normalizeConfig({...config,bossFixedGreeting:fixedText+"新增"})');
  assert.equal(h.run('config.bossFixedGreetingConfirmed'),false);
  assert.equal(h.run('config.bossFixedGreetingConfirmedText'),'');
  assert.throws(()=>h.run('validateFixedBossGreeting(config)'),/勾选确认/);
});
test('新通用安装默认固定话术，旧AI配置和关闭助手的旧选择保持不变',()=>{
  const h=setup();
  assert.equal(h.run('normalizeConfig({}).bossGreetingMode'),'fixed');
  for(const legacy of [{bossPersonalizedGreeting:true,candidateProfile:'旧经历'},{greetingAIEndpoint:'https://model.example/v1/chat/completions'}]){
    h.context.legacy=legacy;assert.equal(h.run('normalizeConfig(legacy).bossGreetingMode'),'ai');
  }
  assert.equal(h.run('normalizeConfig({bossPersonalizedGreeting:false}).bossPersonalizedGreeting'),false);
});
test('固定模式启动不检查AI、不等待密钥；未确认先阻止启动',async()=>{
  const h=setup();let runs=0;h.context.adapter={id:'boss',isListPage:()=>true,ensureLogin:()=>({ok:true})};
  h.context.runApplyLoop=async()=>{runs++;};
  h.run('getAdapter=()=>adapter;notify=()=>{};config.rememberGreetingKey=true;config.autoRecoveryEnabled=true;');
  assert.equal(h.run('needsGreetingKey(adapter)'),false);
  await h.run('startApply()');assert.equal(runs,1);assert.equal(h.aiCalls(),0);
  h.run('config.bossFixedGreetingConfirmed=false');
  await h.run('startApply()');assert.equal(runs,1);assert.equal(h.run('state.pendingResume'),null);
});
test('固定模式保留岗位详情和距离筛选，但详情缺失不影响固定话术准备',async()=>{
  const h=setup();let details=0;
  h.context.adapter={id:'boss',fetchDetail:async()=>{details++;return null;},apply:(job,detail)=>h.context.applyBossJob(job,detail)};
  h.run('applyFilters=()=>({ok:true});state.running=true');
  await h.run('handleOneJob(job,adapter)');assert.equal(details,1);assert.equal(h.sent(),1);
  const blocked=setup();blocked.run('config.bossDistanceEnabled=true');
  assert.equal((await blocked.run('applyBossJob(job,null)')).skipped,true);assert.equal(blocked.opened(),0);assert.equal(blocked.aiCalls(),0);
});
test('等待AI密钥时切换话术模式会取消旧续跑，保留AI服务及密钥保存偏好',()=>{
  const h=setup();h.run(`config.bossGreetingMode='ai';config.rememberGreetingKey=true;state.pendingResume={platform:'boss'};saveConfig({...config,bossGreetingMode:'fixed'});`);
  assert.equal(h.run('state.pendingResume'),null);assert.equal(h.run('config.rememberGreetingKey'),true);
});
