import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob,fixtureProfile} from './helpers.mjs';
const draft={text:'您好，我有五年以上工作经验。协同PM和设计团队维护交付清单，累计支持12款应用上线。期待与您沟通。',evidenceIds:['E3']};
const pass={verdict:'pass',majorErrors:[],suggestions:['可以进一步精简结尾']};
function setup(replies){
 const requests=[];
 const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{GM_xmlhttpRequest:options=>{
  requests.push(JSON.parse(options.data));const reply=replies.shift();
  options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}]})});
 }});
 h.context.job=fixtureJob;h.context.profile=fixtureProfile;h.context.detail={postDescription:'项目交付管理，维护交付清单'};
 h.run(`config=normalizeConfig({...config,...profile,bossGreetingUseAI:true,candidateExperience:'五年以上工作经验',greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});sleep=async()=>{};`);
 return {...h,requests};
}
test('AI正常路径一次选经历并生成加一次事实核验，优化建议不追加调用',async()=>{
 const h=setup([draft,pass]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(h.requests.length,2);assert.equal(result.text,draft.text);assert.equal(result.proofread.status,'passed');
 const generation=h.requests[0],input=JSON.parse(generation.messages[1].content);
 assert.equal(input.candidateFacts.length,5);assert.equal(input.requiredExperience,'五年以上工作经验');assert.equal(input.maxCharacters,h.run('config.bossGreetingMaxLength'));
 assert.match(generation.messages[0].content,/一次完成挑选真实经历和撰写/);assert.match(generation.messages[0].content,/不得把招聘要求当成本人已有能力/);assert.match(generation.messages[0].content,/减少套话/);
 assert.deepEqual(JSON.parse(h.requests[1].messages[1].content).candidateFacts.map(f=>f.id),['E3']);
});
test('生成时发现无来源数字立即本地纠正一次，合格后才交事实核验',async()=>{
 const h=setup([{...draft,text:draft.text.replace('12款','99款')},draft,pass]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.proofread.repairRounds,1);assert.equal(h.requests.length,3);assert.match(JSON.parse(h.requests[1].messages[1].content).feedback,/数字/);
 assert.equal(JSON.parse(h.requests[2].messages[1].content).greeting,draft.text);
});
test('生成连续超限或无来源数字不交模型反复核验，转待检查且零平台请求',async()=>{
 const invalid={...draft,text:draft.text.replace('12款','99款')};const h=setup([invalid,invalid]);
 const result=await h.run('applyBossJob(job,detail)');assert.equal(result.pendingReview,true);assert.equal(h.requests.length,2);assert.equal(h.calls.length,0);
});
