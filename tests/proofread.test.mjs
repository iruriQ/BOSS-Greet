import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureProfile,fixtureJob} from './helpers.mjs';
const pass=(suggestions=[])=>({verdict:'pass',majorErrors:[],suggestions});
function setup(responses=[pass()]) {
 const requests=[];
 const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{GM_xmlhttpRequest:options=>{
  requests.push(JSON.parse(options.data));const next=responses.shift();
  if(typeof next==='function')return next(options,h);
  if(next==='timeout')return options.ontimeout();
  if(next==='401')return options.onload({status:401,responseText:'redacted'});
  options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:next==='bad-json'?'not json':JSON.stringify(next)}}]})});
 }});
 h.context.job={...fixtureJob};h.context.profile=fixtureProfile;h.context.detail={postDescription:'合同核对、法务协作与数据整理'};
 h.run(`config=normalizeConfig({...config,...profile,greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});
  function getHistoryKey(){return 'review-history'};sleep=async()=>{};sleepHumanDelay=async()=>{};`);
 return {...h,requests};
}
test('默认发送方式和用户明确保存的预览选择保持不变',()=>{
 const h=setup();assert.equal(h.run('config.bossGreetingPreviewOnly'),false);
 assert.equal(h.run('normalizeConfig({bossGreetingPreviewOnly:true}).bossGreetingPreviewOnly'),true);
});
test('正常只核验一次重大事实风险，发送凭据绑定完整最终正文',async()=>{
 const h=setup();const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.proofread.status,'passed');assert.equal(result.proofread.reviewedText,result.text);assert.equal(h.requests.length,1);
 assert.deepEqual([...result.proofread.checks],['facts']);
 assert.match(h.requests[0].messages[0].content,/只拦截明确且实质性的事实错误/);
 assert.ok(JSON.parse(h.requests[0].messages[1].content).candidateFacts.length>0);
});
test('可选润色建议、少写协助原词或建议更明确对象，均不改写、不复核、不阻断',async()=>{
 const notes=['可更明确指向采购资料','跟进需求和问题闭环可再具体些','句式可更自然'];
 const h=setup([pass(notes)]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(h.requests.length,1);assert.equal(result.proofread.repairRounds,0);
 assert.deepEqual([...result.proofread.suggestions],notes);assert.equal(result.proofread.status,'passed');
});
test('兼容旧服务响应时，语序用词和相关性建议不再被当成重大事实错误',async()=>{
 const h=setup([{verdict:'revise',checks:{typos:false,grammar:false,wording:false,facts:true,relevance:false},issues:['建议润色'],edits:[]}]);
 assert.equal((await h.run('prepareBossGreeting(job,detail,config)')).proofread.status,'passed');assert.equal(h.requests.length,1);
});
test('重复字和成对标点属于优化建议，不因模型通过后本地润色检查再拦截',async()=>{
 for(const intro of ['我负责负责商务支持。','我有业务支持经验（。']){
  const h=setup([pass(['标点或重复词可润色'])]);h.context.intro=intro;h.run('config.candidateIntro=intro');
  const result=await h.run('prepareBossGreeting(job,detail,config)');assert.equal(result.proofread.status,'passed');assert.equal(h.requests.length,1);
 }
});
test('核验结构不完整时仅重试格式，不改变正文或降格放行',async()=>{
 const h=setup(['bad-json',{verdict:'pass',majorErrors:[]},pass()]);
 const result=await h.run('prepareBossGreeting(job,detail,config)');assert.equal(result.proofread.status,'passed');assert.equal(h.requests.length,3);
 assert.equal(h.requests[0].messages[1].content,h.requests[2].messages[1].content);
});
test('连续格式异常记为待检查而非全局停机，下一个岗位仍可处理',async()=>{
 const h=setup(['bad-json','bad-json','bad-json',pass()]);h.context.nextJob={...fixtureJob,encryptJobId:'next',encryptBossId:'next-boss'};
 h.context.adapter={id:'boss',canApply:()=>true,fetchDetail:async()=>h.context.detail,apply:(job,detail)=>h.context.applyBossJob(job,detail)};
 h.run('state.running=true;config.bossGreetingPreviewOnly=true');
 await h.run('handleOneJob(job,adapter)');
 assert.equal(h.run('state.stopping'),false);assert.equal(h.run('state.skipped'),0);
 assert.equal(h.run('Object.keys(gmGet(GREETING_PENDING_KEY,{})).length'),1);
 await h.run('handleOneJob(nextJob,adapter)');assert.equal(h.run('state.previewed'),1);assert.equal(h.calls.length,0);
});
test('缺少原文定位的重大错误报告不能直接当成拒绝或通过',async()=>{
 const h=setup([{verdict:'repair',majorErrors:[{category:'responsibility_inflated',draftQuote:'正文不存在片段',sourceQuote:'',reason:'声称有错误'}],suggestions:[]},pass()]);
 assert.equal((await h.run('prepareBossGreeting(job,detail,config)')).proofread.status,'passed');assert.equal(h.requests.length,2);
});
test('鉴权失败或超时立即退出，不当成措辞问题反复修正',async()=>{
 for(const error of ['401','timeout']){
  const h=setup([error]);const result=await h.run('applyBossJob(job,detail)');
  assert.equal(result.needsAttention,true);assert.equal(h.requests.length,1);assert.equal(h.calls.length,0);
 }
});
test('格式重试期间停止后不再请求或发送',async()=>{
 const h=setup(['bad-json',pass()]);h.run('sleep=async()=>{state.stopping=true}');
 await h.run('applyBossJob(job,detail)');assert.equal(h.requests.length,1);assert.equal(h.calls.length,0);
});
test('不在日志或重试提示中回传无效回复的私有正文',async()=>{
 const h=setup([{verdict:'PRIVATE-RESPONSE',majorErrors:[],suggestions:[]},pass()]);
 h.run('globalThis.reviewLogs=[];log=(_level,text)=>reviewLogs.push(text)');await h.run('prepareBossGreeting(job,detail,config)');
 assert.doesNotMatch(h.run('reviewLogs.join()'),/PRIVATE-RESPONSE/);assert.doesNotMatch(JSON.stringify(h.requests[1]),/PRIVATE-RESPONSE/);
});
test('无服务只能预览未核验草稿，实际发送需要配置服务',async()=>{
 const h=setup();h.run('config.greetingAIEndpoint="";config.greetingAIModel="";config.bossGreetingPreviewOnly=true');
 assert.equal((await h.run('prepareBossGreeting(job,detail,config)')).proofread.status,'unreviewed');
 h.run('config.bossGreetingPreviewOnly=false');assert.equal((await h.run('applyBossJob(job,detail)')).needsAttention,true);assert.equal(h.requests.length,0);
});
test('发送正文变动或没有事实核验凭据时发送通道拒绝',async()=>{
 const h=setup();h.context.approval={status:'passed',reviewedText:'已核验的正文',checks:['facts']};
 await assert.rejects(h.run('sendBossGreetingInChat(job,"变动后的正文",approval)'),/没有通过完整校对/);assert.equal(h.calls.length,0);
 h.context.approval={status:'passed',reviewedText:'正文',checks:['grammar']};
 assert.throws(()=>h.run('assertGreetingReviewed("正文",approval)'));
});
test('工作年限原文进入核验依据，本地仍拦截年限或数字被改变',async()=>{
 const h=setup();h.run('config.candidateExperience="五年以上工作经验"');
 const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(JSON.parse(h.requests[0].messages[1].content).requiredExperience,'五年以上工作经验');
 h.context.text=result.text.replace('五年以上工作经验','六年以上工作经验');
 assert.match(h.run('greetingCriticalFindings(text,config).join()'),/工作年限/);
});
