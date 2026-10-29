import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob, fixtureProfile } from './helpers.mjs';
const sourceFact = '在实习期间协助核对约37份合同，核对附件和条款版本，' + '另外协助整理会议资料与报销材料并跟进内部行政流程，'.repeat(15) + '相关合同工作由法务负责人复核，不负责独立审批。';
const concise = '您好，我有五年以上工作经验。在实习期间协助核对约37份合同及附件，由法务负责人复核。期待与您沟通。';
const pass = { verdict:'pass', checks:{typos:true,grammar:true,wording:true,facts:true,relevance:true}, issues:[], edits:[] };
function setup(handler) {
  const requests=[];
  const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{GM_xmlhttpRequest:options=>{
    const body=JSON.parse(options.data);requests.push(body);
    const result=handler(body,requests.length,options);
    if(result!==undefined)options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:typeof result==='string'?result:JSON.stringify(result)}}]})});
  }});
  h.context.job=fixtureJob;h.context.profile=fixtureProfile;h.context.sourceFact=sourceFact;
  h.context.detail={postDescription:'合同管理、附件核对、配合法务审核'};
  h.run(`config=normalizeConfig({...config,...profile,bossGreetingMaxLength:180,bossGreetingIncludeAI:false,candidateExperience:'五年以上工作经验',candidateProfile:sourceFact,
    greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});function getHistoryKey(){return 'budget-history'};`);
  return {...h,requests};
}

test('短预算先保留首项相关经历，精简过长简介及额外亮点，原始简历和字数上限不变',async()=>{
  const h=harness();h.context.job=fixtureJob;h.context.profile=fixtureProfile;
  h.run(`config=normalizeConfig({...config,...profile,bossGreetingMaxLength:180,candidateIntro:'我主要从事综合支持与行政事务。'.repeat(20),candidateExperience:'五年以上工作经验'});`);
  const before=h.run('JSON.stringify(config)');
  const result=await h.run('createBossGreeting(job,{postDescription:"合同归档与法务审批"})');
  assert.equal(result.evidenceIds[0],'E1');assert.match(result.text,/37份服务合同/);
  assert.match(result.text,/五年以上工作经验/);assert.doesNotMatch(result.text,/综合支持与行政事务/);
  assert.ok(Array.from(result.text).length<=180);assert.equal(h.run('JSON.stringify(config)'),before);
  assert.equal(h.calls.length,0);
});
test('长行包含多句时提取相关完整句，不截断成果的基数、时间、单位和前后对比',async()=>{
  const h=harness();h.context.job=fixtureJob;
  h.context.fact='负责会务管理和行政接待。'.repeat(20)+'使用Excel核对合同数据，将月均整理耗时由约17小时降至约6小时。';
  h.run(`config=normalizeConfig({...config,bossGreetingUseAI:false,bossGreetingMaxLength:180,bossGreetingMode:'ai',candidateProfile:fact});`);
  const result=await h.run('createBossGreeting(job,{postDescription:"Excel合同数据核对"})');
  assert.match(result.text,/使用Excel核对合同数据，将月均整理耗时由约17小时降至约6小时。/);
  assert.doesNotMatch(result.text,/会务管理/);assert.ok(Array.from(result.text).length<=180);
});
test('无法直接容纳完整事实时按岗位精简，完整原始经历进入独立校对后绑定发送凭据',async()=>{
  const h=setup(body=>body.messages[0].content.includes('精简编辑')?{text:concise,evidenceIds:['E1']}:pass);
  const before=h.run('config.candidateProfile');
  const result=await h.run('prepareBossGreeting(job,detail,config)');
  assert.equal(result.text,concise);assert.equal(result.compressed,true);assert.equal(result.proofread.status,'passed');
  assert.equal(result.proofread.reviewedText,concise);assert.equal(h.requests.length,2);
  const input=JSON.parse(h.requests[0].messages[1].content),review=JSON.parse(h.requests[1].messages[1].content);
  assert.equal(input.maxCharacters,180);assert.equal(input.requiredExperience,'五年以上工作经验');
  assert.equal(review.candidateFacts[0].text,sourceFact);assert.equal(review.maxCharacters,180);assert.equal(review.maxCharacters,180);
  assert.equal(h.run('config.candidateProfile'),before);assert.equal(h.calls.length,0);
});
test('精简过长可纠正一次；不会静默提高上限或截掉末尾',async()=>{
  const h=setup((_body,n)=>n===1?{text:'您好，'+ '合同'.repeat(100)+'。',evidenceIds:['E1']}:{text:concise,evidenceIds:['E1']});
  const result=await h.run('createBossGreeting(job,detail,config)');
  assert.equal(result.text,concise);assert.equal(h.requests.length,2);
  assert.match(JSON.parse(h.requests[1].messages[1].content).feedback,/字数上限/);
  assert.equal(h.run('config.bossGreetingMaxLength'),180);
});
test('捏造数字、错误证据、删掉年限或始终超长的精简回复均不能进入校对或发送',async()=>{
  for(const result of [
    {text:concise.replace('37','99'),evidenceIds:['E1']},
    {text:concise,evidenceIds:['E999']},
    {text:concise.replace('五年以上工作经验','五年工作经验'),evidenceIds:['E1']},
    {text:'您好，'+ '合同'.repeat(120)+'。',evidenceIds:['E1']},
  ]) {
    const h=setup(()=>result);let opened=0;h.context.openBossConversation=async()=>{opened++;throw Error('不应开聊');};
    const outcome=await h.run('applyBossJob(job,detail)');
    assert.equal(outcome.ok,false);assert.equal(opened,0);assert.equal(h.requests.length,2);assert.equal(h.calls.length,0);
  }
});
test('文字虽短但丢失实习或协助限定时，语义校对拒绝并阻止开聊',async()=>{
  const h=setup(body=>body.messages[0].content.includes('精简编辑')?{text:concise.replace('在实习期间协助','独立负责'),evidenceIds:['E1']}:
    {verdict:'repair',majorErrors:[{category:'responsibility_inflated',draftQuote:'独立负责',sourceQuote:'在实习期间协助',reason:'将实习协助夸大为独立负责'}],suggestions:[]});
  let opened=0;h.context.openBossConversation=async()=>{opened++;throw Error('不应开聊');};
  const outcome=await h.run('applyBossJob(job,detail)');
  assert.equal(outcome.ok,false);assert.equal(outcome.pendingReview,true);assert.equal(opened,0);assert.equal(h.calls.length,0);
});
test('精简请求鉴权失败或中途停止时不重试、不校对、不发送',async()=>{
  const h=setup((_body,_n,options)=>{options.onload({status:401,responseText:'redacted'});});
  await assert.rejects(h.run('prepareBossGreeting(job,detail,config)'),/HTTP 401/);assert.equal(h.requests.length,1);
  const stopped=setup(()=>{stopped.run('state.stopping=true');return{text:concise,evidenceIds:['E1']};});
  await assert.rejects(stopped.run('prepareBossGreeting(job,detail,config)'),/任务已停止/);assert.equal(stopped.requests.length,1);
});
