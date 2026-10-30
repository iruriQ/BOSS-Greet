import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {harness,fixtureJob} from './helpers.mjs';
import {applyBuildVariant} from '../scripts/build-variant.mjs';
import {facts} from './target-length-fixtures.mjs';

// Fictional portfolio; no real user's workflow text, paths or performance data.
import {workflows,personalProfile} from './personal-workflow-fixtures.mjs';

const pass={verdict:'pass',majorErrors:[],suggestions:[]};
const draftFor=index=>({text:'您好，我有三年工作经验。'+facts.slice(0,2).join('').replace('，不负责独立审批','')+workflows[index].text+'期待与您进一步交流。',evidenceIds:['E1','E2',`W${index+1}`]});
function setup(replies=[],personal=true){
 const requests=[];
 const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{GM_xmlhttpRequest:options=>{
  requests.push(JSON.parse(options.data));const result=replies.shift();
  options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})});
 }},{personalProfile:personal?personalProfile:null,greetingTargetLength:true});
 h.context.job=fixtureJob;
 h.run(`config=normalizeConfig({...config,bossGreetingMode:'ai',bossGreetingUseAI:true,greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});`);
 h.context.detail={postDescription:'采购询价、供应商报价与交期核对'};
 return {...h,requests};
}

test('按招聘职责选合同、资料、采购、上线亮点，未知方向用通用案例，不为每个方向强塞合同',()=>{
 const h=setup();
 for(const [description,id] of [['核对合同条款，跟进合同修订','W1'],['维护客户档案与合作方资料汇总','W2'],['采购询价，核对报价及交期','W3'],['上线物料图片与交付核对','W4'],['安排办公室会议','W5'],['无需采购，不涉及合同','W5']]){
  h.context.description=description;
  assert.equal(h.run('selectGreetingAIWorkflow(getGreetingFacts(config),{jobName:"业务支持"},{postDescription:description}).id'),id);
 }
 assert.equal(h.run('selectGreetingAIWorkflow(getGreetingFacts(config),{jobName:"合同专员"},detail).id'),'W3');
});

test('生成和事实核验只接收本岗位AI事实，普通路径仍两次调用，原有简历不变',async()=>{
 const draft=draftFor(2);const h=setup([draft,pass]);const before=h.run('config.candidateProfile');
 const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.proofread.status,'passed');assert.equal(h.requests.length,2);assert.equal(result.text,draft.text);
 const input=JSON.parse(h.requests[0].messages[1].content);
 assert.deepEqual(input.candidateFacts.filter(f=>f.aiWorkflow).map(f=>f.id),['W3']);
 assert.ok(!input.candidateFacts.some(f=>f.id==='W1'||f.id==='E4'));
 assert.ok(!JSON.stringify(input).includes('17小时'));assert.equal(input.includeAIHighlight,true);
 assert.match(h.requests[0].messages[0].content,/每条定制话术必须/);
 assert.match(h.requests[0].messages[0].content,/不把流程设计或模拟验证写成生产系统/);
 const review=JSON.parse(h.requests[1].messages[1].content);
 assert.equal(review.candidateFacts.find(f=>f.id==='W3').text,workflows[2].text);
 assert.equal(h.run('config.candidateProfile'),before);assert.equal(h.calls.length,0);
 assert.ok(result.text.length>=200&&result.text.length<=300);
});

test('缺少选中的AI经历时只用既有一次修正预算，不额外增加审查轮次',async()=>{
 const good=draftFor(2),bad={...good,evidenceIds:['E1','E2'],text:good.text.replace(workflows[2].text,facts[2])};
 const h=setup([bad,good,pass]);const result=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(result.text,good.text);assert.equal(h.requests.length,3);
 assert.match(JSON.parse(h.requests[1].messages[1].content).feedback,/AI 工作流/);
 assert.equal(result.proofread.repairRounds,1);
});

test('不能引用别的AI案例或借用其数字，两次失败仍零开聊和发送',async()=>{
 for(const invalid of [{...draftFor(2),evidenceIds:['E1','E2','W1']},{...draftFor(2),text:draftFor(2).text.replace('方便人工核对','将耗时降至17小时，方便人工核对')}]){
  const h=setup([invalid,invalid]);let opened=0;h.context.openBossConversation=async()=>{opened++;throw new Error('不得开聊')};
  const result=await h.run('applyBossJob(job,detail)');
  assert.equal(result.pendingReview,true);assert.equal(opened,0);assert.equal(h.calls.length,0);assert.equal(h.requests.length,2);
 }
});

test('本地模板预留AI案例篇幅且不会重复，修改简历不会覆盖私人案例库',async()=>{
 const h=setup();h.run('config.bossGreetingUseAI=false');
 const result=await h.run('createBossGreeting(job,detail,config)');
 assert.ok(result.evidenceIds.includes('W3'));assert.equal(result.text.split(workflows[2].text).length,2);
 assert.ok(result.text.length<=300);assert.equal(h.requests.length,0);
 h.run('config.candidateProfile="协助整理采购需求和报价资料。"');
 assert.equal(h.run('getGreetingFacts(config).filter(f=>f.aiWorkflow).length'),5);
 assert.equal(h.run('getGreetingFacts(config)[0].text'),'协助整理采购需求和报价资料。');
});

test('精简保留案例名额，事实修正仍只能用当前案例，固定话术不追加AI',async()=>{
 const draft=draftFor(2),h=setup([draft,draft]);h.context.old={...draft,text:draft.text+'旧句。'};
 h.run('config.candidateProfile += "\\n负责额外合同资料核对。\\n负责额外会议安排。\\n负责额外台账整理。"');
 await h.run('compressBossGreeting(job,detail,greetingFactsForJob(getGreetingFacts(config),job,detail),["E1","E2","E3","E5","E6","E7"],config)');
 assert.ok(JSON.parse(h.requests[0].messages[1].content).candidateFacts.some(f=>f.id==='W3'));
 await h.run('requestGreetingRepair(old,{majorErrors:[]},[],job,detail,config)');
 assert.deepEqual(JSON.parse(h.requests[1].messages[1].content).candidateFacts.filter(f=>f.aiWorkflow).map(f=>f.id),['W3']);
 h.run('config.bossGreetingMode="fixed";config.bossFixedGreeting="您好，期待沟通。";config.bossFixedGreetingConfirmed=true;config.bossFixedGreetingConfirmedText=config.bossFixedGreeting');
 const fixed=await h.run('prepareBossGreeting(job,detail,config)');
 assert.equal(fixed.text,'您好，期待沟通。');assert.equal(h.requests.length,2);
 h.context.approval=fixed.proofread;h.run('assertBossGreetingAuthorized(config.bossFixedGreeting,approval,config)');
});

test('通用构建案例库始终为空，私人构建仅嵌入白名单字段且拒绝无效案例',()=>{
 const h=setup([],false);assert.equal(h.run('hasPersonalAIWorkflows()'),false);assert.equal(h.run('greetingAIWorkflowPrompt()'),'');
 assert.equal(h.run('getGreetingFacts(config).length'),0);
 const header=readFileSync(new URL('../src/userscript-header.js',import.meta.url),'utf8');
 const source=readFileSync(new URL('../src/00-config.js',import.meta.url),'utf8');
 const profile={...personalProfile,aiWorkflows:[{...workflows[0],apiKey:'must-never-be-embedded',sourcePath:'must-never-be-embedded'}]};
 const built=applyBuildVariant(header,source,profile);assert.ok(!built.config.includes('must-never-be-embedded'));
 const context=vm.createContext({loadConfig:()=>({})});vm.runInContext(built.config,context);
 assert.equal(vm.runInContext('PERSONAL_AI_WORKFLOWS.length',context),1);
 assert.throws(()=>applyBuildVariant(header,source,{...personalProfile,aiWorkflows:[{text:'',matchTerms:[]}]}),/工作流/);
});
