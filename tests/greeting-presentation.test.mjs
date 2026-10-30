import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, fixtureJob, fixtureProfile} from './helpers.mjs';
import {facts, draft} from './target-length-fixtures.mjs';

const pass={verdict:'pass',majorErrors:[],suggestions:['可选：将结尾表达得更自然']};
function setup(replies=[]) {
  const requests=[];
  const h=harness(['05-runner.js'], {GM_xmlhttpRequest:options=>{
    requests.push(JSON.parse(options.data));
    options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(replies.shift())}}]})});
  }}, {greetingTargetLength:true});
  h.context.job=fixtureJob;h.context.profile=fixtureProfile;h.context.facts=facts;h.context.draft=draft;
  h.run(String.raw`config=normalizeConfig({...config,...profile,bossGreetingUseAI:true,candidateExperience:'三年工作经验',
    candidateIntro:'我毕业于示例大学，本科学历。虽然没有商品运营经验，但是有业务支持经验。',
    candidateProfile:facts.join('\n'),greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'});`);
  return {...h,requests};
}

test('学历和短板介绍只从本地开场省略，保留真实曾任岗位、工作年限和原始资料',()=>{
  const h=setup();
  h.run("config.candidateIntro='我毕业于示例大学，本科学历。我曾担任业务助理。虽然没有商品运营经验，但是有协调能力。'");
  const before=h.run('config.candidateIntro');
  const intro=h.run('getGreetingPositiveIntro(config)');
  assert.match(intro,/曾担任业务助理/);assert.match(intro,/三年工作经验/);
  assert.doesNotMatch(intro,/大学|学历|没有|虽然/);
  assert.equal(h.run('config.candidateIntro'),before);
  assert.match(h.run('getGreetingIntro(config)'),/没有商品运营经验/);
});

test('本地匹配不因学历或缺少经验的关键词命中而照搬整行，也不会删否定词变成具备经验',async()=>{
  const h=setup();h.run(String.raw`config.bossGreetingUseAI=false;config.candidateProfile=[
    '我的学历为本科，学习过合同管理。','我没有独立合同审批经验，但协助整理过资料。',...facts].join('\n')`);
  const before=h.run('config.candidateProfile');
  const result=await h.run('createBossGreeting(job,{postDescription:"合同资料核对"},config)');
  assert.doesNotMatch(result.text,/学历|本科|独立合同审批经验|商品运营经验/);
  assert.match(result.text,/实习期间协助/);assert.match(result.text,/不负责独立审批/);
  assert.equal(h.run('config.candidateProfile'),before);assert.equal(h.requests.length,0);
});

test('仅有混合短板句时交给既有语义整理，完整原文保留给事实核验',async()=>{
  const positive={text:'您好，我有三年工作经验。协助整理合同资料并跟进反馈，期待沟通。',evidenceIds:['E1']};
  const h=setup([positive]);h.run(String.raw`config.bossGreetingUseAI=false;config.candidateProfile='我没有独立合同审批经验，但协助整理合同资料并跟进反馈。';
    getGreetingLengthRange=()=>({targetCharacters:300,minCharacters:0,maxCharacters:300})`);
  const result=await h.run('createBossGreeting(job,{postDescription:"合同资料整理"},config)');
  assert.equal(result.text,positive.text);
  const input=JSON.parse(h.requests[0].messages[1].content);
  assert.match(input.candidateFacts[0].text,/没有独立合同审批经验/);
  assert.match(h.requests[0].messages[0].content,/不主动介绍学历/);
  assert.match(h.requests[0].messages[0].content,/不得直接删掉否定词/);
});

test('生成阶段统一正面表达且不新增风格核验，完整来源仍用于核验，总共两次调用',async()=>{
  const h=setup([draft,pass]);
  const result=await h.run('prepareBossGreeting(job,{postDescription:"协助合同资料与数据台账整理"},config)');
  assert.equal(result.proofread.status,'passed');assert.equal(h.requests.length,2);
  const prompt=h.requests[0].messages[0].content;
  assert.match(prompt,/真实曾任岗位/);assert.match(prompt,/不主动介绍学历/);
  assert.match(prompt,/不要写‘没有某类经验’/);assert.match(prompt,/总工作年限不等于某岗位或行业年限/);
  assert.match(prompt,/不能承诺无依据的业绩数字/);
  assert.match(prompt,/首句必须明确以‘我’为主语/);assert.match(prompt,/不写简历摘要/);
  assert.match(prompt,/不擅自改变任职时间/);assert.match(prompt,/不要每个分句都重复‘我’/);
  const input=JSON.parse(h.requests[0].messages[1].content);
  assert.match(input.candidateIntro,/示例大学/);assert.equal(input.requiredExperience,'三年工作经验');
  assert.match(h.requests[1].messages[0].content,/省略学历和自我否定不等于编造/);
  assert.match(result.text,/实习期间协助/);assert.doesNotMatch(result.text,/学历|大学|没有.*经验|三年商品运营/);
  assert.ok(result.text.length>=200&&result.text.length<=300);assert.equal(h.calls.length,0);
});

test('事实修正沿用正面表达规则，不为建议另开风格改写轮次',async()=>{
  const h=setup([draft]);h.context.review={majorErrors:[]};
  await h.run('requestGreetingRepair({...draft,text:draft.text+"旧句。"},review,[],job,{postDescription:"合同整理"},config)');
  assert.equal(h.requests.length,1);assert.match(h.requests[0].messages[0].content,/不主动介绍学历/);
  assert.match(h.requests[0].messages[0].content,/实习、模拟、参与、协助/);
  assert.match(h.requests[0].messages[0].content,/首句必须明确以‘我’为主语/);
});

test('本地简介补齐任职句的主语，保留当前或过去时态，不改角色、数字及原始简介',()=>{
  const h=setup();
  for(const [source,expected] of [
    ['现任运营助理，具备项目支持经验。','我目前担任运营助理，具备项目支持经验。'],
    ['曾任数据助理，协助整理报表。','我曾担任数据助理，协助整理报表。'],
    ['目前担任行政助理。','我目前担任行政助理。'],
    ['我有三年工作经验。','我有三年工作经验。'],
  ]) {
    h.context.intro=source;h.run('config.candidateIntro=intro;config.candidateExperience=""');
    assert.equal(h.run('getGreetingPositiveIntro(config)'),expected);
    assert.equal(h.run('config.candidateIntro'),source);
  }
});

test('学历句移除后仍以本人为主语，篇幅整理也收到自然消息要求',async()=>{
  const h=setup([draft]);h.run("config.candidateIntro='我毕业于示例大学。现任运营助理，负责日常业务支持。';config.candidateExperience=''");
  assert.match(h.run('getGreetingPositiveIntro(config)'),/^我目前担任运营助理/);
  h.run("config.candidateExperience='三年工作经验'");
  await h.run('compressBossGreeting(job,{postDescription:"合同资料整理"},getGreetingFacts(config),["E1","E2","E3"],config)');
  assert.match(h.requests[0].messages[0].content,/首句必须明确以‘我’为主语/);
  assert.match(h.requests[0].messages[0].content,/避免把简历条目机械串联/);
});

test('用户确认的固定原文不受AI表达规则改写，不调用模型',async()=>{
  const h=setup();const text='您好，我毕业于示例大学，没有某行业经验，希望沟通。';h.context.fixed=text;
  h.run('config.bossGreetingMode="fixed";config.bossFixedGreeting=fixed;config.bossFixedGreetingConfirmed=true;config.bossFixedGreetingConfirmedText=fixed');
  const result=await h.run('prepareBossGreeting(job,{},config)');
  assert.equal(result.text,text);assert.equal(h.requests.length,0);
});
