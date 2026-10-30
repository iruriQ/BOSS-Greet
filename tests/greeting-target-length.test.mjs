import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob} from './helpers.mjs';
// Fictional confirmed online-resume facts; never use a live account or model.
import {facts,draft,short} from './target-length-fixtures.mjs';
const pass={verdict:'pass',majorErrors:[],suggestions:[]};
function setup(replies=[]){
 const requests=[];let opened=0,sent=0;
 const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{GM_xmlhttpRequest:options=>{
  requests.push(JSON.parse(options.data));const reply=replies.shift();
  if(typeof reply==='function')return reply(options,h);
  options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}]})});
 }},{greetingTargetLength:true});
 h.context.job={...fixtureJob};h.context.facts=facts;h.context.draft=draft;
 h.context.detail={postDescription:'协助日常业务支持。'};
 h.run(String.raw`config=normalizeConfig({...config,bossPersonalizedGreeting:true,bossGreetingMode:'ai',bossGreetingUseAI:true,bossGreetingMaxLength:300,
 candidateExperience:'三年工作经验',candidateProfile:facts.join('\n'),candidateProfileSource:'boss',candidateBossResumeText:'未确认草稿：独立主导整个部门',
 greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});
 function getHistoryKey(){return 'target-length-history'};sleep=async()=>{};state.running=true;`);
 h.context.openBossConversation=async()=>{opened++;return{ok:true}};
 h.context.sendBossGreetingInChat=async(_job,text,approval,{settings})=>{h.context.text=text;h.context.approval=approval;h.context.settings=settings;h.run('assertBossGreetingAuthorized(text,approval,settings)');sent++;return{confirmed:true}};
 return {...h,requests,opened:()=>opened,sent:()=>sent};
}
test('目标300对应至少200且不超过300，默认300，保留用户已有数值',()=>{
 const h=setup();assert.deepEqual(JSON.parse(h.run('JSON.stringify(getGreetingLengthRange(config))')),{targetCharacters:300,minCharacters:200,maxCharacters:300});
 assert.equal(h.run('DEFAULT_CONFIG.bossGreetingMaxLength'),300);
 assert.equal(h.run('normalizeConfig({bossGreetingMaxLength:360}).bossGreetingMaxLength'),360);
 h.run('config.bossGreetingMaxLength=360');assert.equal(h.run('getGreetingLengthRange(config).minCharacters'),240);
 for(const [length,ok] of [[199,false],[200,true],[300,true],[301,false]]){
  h.context.body='文'.repeat(length);assert.equal(h.run('greetingLengthFindings(body, {bossGreetingMaxLength:300}).length===0'),ok);
 }
});
test('招聘介绍较少时发送全部已确认事实供补亮点，正常生成及事实核验总共两次调用',async()=>{
 const h=setup([draft,pass]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.ok(Array.from(result.text).length>=200&&Array.from(result.text).length<=300);
 assert.equal(h.requests.length,2);const input=JSON.parse(h.requests[0].messages[1].content);
 assert.equal(input.minCharacters,200);assert.equal(input.targetCharacters,300);assert.equal(input.maxCharacters,300);assert.equal(input.jobDescriptionLimited,true);
 assert.equal(input.candidateFacts.length,4);assert.ok(input.candidateFacts.some(f=>f.text.includes('12家虚构门店')));
 assert.ok(!JSON.stringify(input).includes('独立主导整个部门'));
 assert.match(h.requests[0].messages[0].content,/不得重复同一事实/);
 assert.equal(h.calls.length,0);assert.equal(h.opened(),0);assert.equal(result.proofread.status,'passed');
});
test('短稿先补充一次，合格后才独立核验并正式发送一次',async()=>{
 const h=setup([short,draft,pass]);const result=await h.run('applyBossJob(job,detail)');
 assert.equal(result.ok,true);assert.equal(h.requests.length,3);assert.equal(h.opened(),1);assert.equal(h.sent(),1);
 assert.match(JSON.parse(h.requests[1].messages[1].content).feedback,/最低 200 字/);
 assert.equal(JSON.parse(h.requests[2].messages[1].content).greeting,draft.text);
});
test('两次生成均低于200时明确提示资料不足、记录待检查，零核验零开聊零发送',async()=>{
 const h=setup([short,short]);const result=await h.run('applyBossJob(job,detail)');
 assert.equal(result.pendingReview,true);assert.match(result.message,/最低 200 字/);
 assert.equal(h.requests.length,2);assert.equal(h.opened(),0);assert.equal(h.sent(),0);assert.equal(h.run('state.stopping'),false);
});
test('目标300仍阻止超长回复，不会截字或偷偷放宽300',async()=>{
 const h=setup([{...draft,text:draft.text+facts[3]},draft,pass]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.text,draft.text);assert.equal(h.run('config.bossGreetingMaxLength'),300);
 assert.match(JSON.parse(h.requests[1].messages[1].content).feedback,/字数上限/);
});
test('本地模板在篇幅不足时补充已确认简历亮点，并保留完整事实与原始资料',async()=>{
 const h=setup();h.run('config.bossGreetingUseAI=false');h.context.detail={postDescription:'合同附件核对。'};
 const before=h.run('config.candidateProfile');const result=await h.run('createBossGreeting(job,detail,config)');
 assert.ok(Array.from(result.text).length>=200&&Array.from(result.text).length<=300);
 assert.ok(result.evidenceIds.length>1);assert.match(result.text,/实习期间协助/);assert.match(result.text,/不负责独立审批/);
 assert.equal(h.run('config.candidateProfile'),before);assert.equal(h.requests.length,0);
});
test('事实修正后的短稿仍被拦住，不会将旧核验凭据用于短稿发送',async()=>{
 const major={verdict:'repair',majorErrors:[{category:'metrics_changed',draftQuote:'37份',sourceQuote:'37份',reason:'隔离测试的重大事实反馈'}],suggestions:[]};
 const h=setup([major,short]);h.run('createBossGreeting=async()=>draft');
 const result=await h.run('applyBossJob(job,detail)');assert.equal(result.pendingReview,true);
 assert.equal(h.requests.length,2);assert.equal(h.opened(),0);assert.equal(h.sent(),0);
 const input=JSON.parse(h.requests[1].messages[1].content);assert.equal(input.minCharacters,200);assert.equal(input.targetCharacters,300);
});
test('发送前再次检查最低字数；固定原文不受AI长度规则影响',()=>{
 const h=setup();h.context.short=short;
 assert.throws(()=>h.run(`assertBossGreetingAuthorized(short.text,{status:'passed',reviewedText:short.text,checks:['facts']},config)`),/最低 200 字/);
 h.run(String.raw`config=normalizeConfig({...config,bossGreetingMode:'fixed',bossFixedGreeting:'您好，期待沟通。',bossFixedGreetingConfirmed:true,bossFixedGreetingConfirmedText:'您好，期待沟通。'});
 assertBossGreetingAuthorized('您好，期待沟通。',{status:'user-confirmed',reviewedText:'您好，期待沟通。'},config)`);
});
test('生成中停止时不再核验、开聊或发送',async()=>{
 const h=setup([(options,h)=>{h.run('state.stopping=true');options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(draft)}}]})})}]);
 await assert.rejects(h.run('prepareBossGreeting(job,detail,config)'),/任务已停止/);
 assert.equal(h.requests.length,1);assert.equal(h.opened(),0);assert.equal(h.sent(),0);
});

test('篇幅整理同样补短稿并与事实核验共用一次修正预算',async()=>{
 const h=setup([short,draft,pass]);h.context.longFact=facts[0].repeat(8);
 h.run(String.raw`config.bossGreetingUseAI=false;config.candidateProfile=[longFact,...facts.slice(1)].join('\n')`);
 const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.text,draft.text);assert.equal(result.proofread.repairRounds,1);assert.equal(h.requests.length,3);
 const input=JSON.parse(h.requests[0].messages[1].content);assert.equal(input.minCharacters,200);assert.equal(input.candidateFacts.length,4);
});
test('同一句经历重复凑够字数不能直接通过生成',async()=>{
 const repeated={text:'您好，我有三年工作经验。'+facts[0].repeat(3),evidenceIds:['E1']};
 const h=setup([repeated,draft,pass]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.text,draft.text);assert.match(JSON.parse(h.requests[1].messages[1].content).feedback,/重复/);
 assert.equal(h.requests.length,3);
});
