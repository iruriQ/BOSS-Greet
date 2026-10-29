import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob,fixtureProfile} from './helpers.mjs';
const pass={verdict:'pass',majorErrors:[],suggestions:[]};
const bad={text:'您好，我有五年以上工作经验。独立主导12款应用上线。期待与您沟通。',evidenceIds:['E3'],source:'测试草稿'};
const fixed={text:'您好，我有五年以上工作经验。协同PM和设计团队维护交付清单，累计支持12款应用上线。期待与您沟通。',evidenceIds:['E3']};
const major={verdict:'repair',majorErrors:[{category:'responsibility_inflated',draftQuote:'独立主导12款应用上线',sourceQuote:'累计支持12款应用上线',reason:'把支持上线扩大为独立主导'}],suggestions:[]};
function setup(responses){
 const requests=[];let opened=0,sent=0,delivered='';
 const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{GM_xmlhttpRequest:options=>{
  requests.push(JSON.parse(options.data));const next=responses.shift();
  if(typeof next==='function')return next(options,h);
  if(next==='401')return options.onload({status:401,responseText:'redacted'});
  options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(next)}}]})});
 }});
 h.context.job={...fixtureJob};h.context.profile=fixtureProfile;h.context.detail={postDescription:'项目交付管理，维护交付清单'};h.context.draft=bad;
 h.run(`config=normalizeConfig({...config,...profile,candidateExperience:'五年以上工作经验',greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});
  createBossGreeting=async()=>draft;function getHistoryKey(){return 'repair-history'};sleep=async()=>{};sleepHumanDelay=async()=>{};`);
 h.context.openBossConversation=async()=>{opened++;return{ok:true};};
 h.context.sendBossGreetingInChat=async(_job,text,approval)=>{h.context.approval=approval;h.context.sending=text;h.run('assertGreetingReviewed(sending,approval)');sent++;delivered=text;return{confirmed:true};};
 return {...h,requests,opened:()=>opened,sent:()=>sent,delivered:()=>delivered};
}
test('重大夸大先修正一次再独立复核，预览不另找岗位也不开聊',async()=>{
 const h=setup([major,fixed,pass]);h.run('config.bossGreetingPreviewOnly=true');const before=h.run('config.candidateProfile');
 const result=await h.run('prepareBossGreeting(job,detail,config)');assert.equal(result.text,fixed.text);assert.equal(result.proofread.repairRounds,1);
 assert.equal(h.requests.length,3);assert.equal(h.opened(),0);assert.equal(h.sent(),0);
 const repair=JSON.parse(h.requests[1].messages[1].content),review=JSON.parse(h.requests[2].messages[1].content);
 assert.match(repair.findings.join(),/独立主导/);assert.equal(repair.candidateFacts.length,5);assert.deepEqual(review.candidateFacts.map(f=>f.id),['E3']);
 assert.equal(review.greeting,fixed.text);assert.equal(h.run('config.candidateProfile'),before);
});
test('正式投递只发送核验通过的修正文一次，下一次仍去重',async()=>{
 const h=setup([major,fixed,pass]);assert.equal((await h.run('applyBossJob(job,detail)')).ok,true);
 assert.equal(h.opened(),1);assert.equal(h.sent(),1);assert.equal(h.delivered(),fixed.text);
 assert.equal((await h.run('applyBossJob(job,detail)')).skipped,true);assert.equal(h.sent(),1);
});
test('一次修正后仍有重大错误则保存待检查并继续，不再进行第三轮或终止任务',async()=>{
 const stillWrong={text:bad.text.replace('期待与您沟通。','期待交流。'),evidenceIds:['E3']};
 const h=setup([major,stillWrong,major]);h.context.adapter={id:'boss',canApply:()=>true,fetchDetail:async()=>h.context.detail,apply:(job,detail)=>h.context.applyBossJob(job,detail)};
 h.run('state.running=true');await h.run('handleOneJob(job,adapter)');
 assert.equal(h.requests.length,3);assert.equal(h.opened(),0);assert.equal(h.sent(),0);assert.equal(h.run('state.stopping'),false);
 assert.equal(h.run('state.skipped'),0);assert.equal(h.run('Object.keys(gmGet(GREETING_PENDING_KEY,{})).length'),1);
});
test('修正引入新数字、错误证据或未改变正文时不再反复修正，转待检查且零开聊',async()=>{
 for(const value of [{...fixed,text:fixed.text.replace('12款','99款')},{...fixed,evidenceIds:['E999']},bad]){
  const h=setup([major,value]);const result=await h.run('applyBossJob(job,detail)');
  assert.equal(result.pendingReview,true);assert.equal(h.requests.length,2);assert.equal(h.opened(),0);
 }
});
test('修正阶段鉴权错误或手动停止后不继续复核和发送',async()=>{
 const h=setup([major,'401']);assert.equal((await h.run('applyBossJob(job,detail)')).recoveryKind,'credentials');assert.equal(h.requests.length,2);
 const stopped=setup([major,(options,h)=>{h.run('state.stopping=true');options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(fixed)}}]})});}]);
 await stopped.run('applyBossJob(job,detail)');assert.equal(stopped.requests.length,2);assert.equal(stopped.opened(),0);
});
