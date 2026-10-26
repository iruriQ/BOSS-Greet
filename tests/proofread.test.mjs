import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureProfile, fixtureJob } from './helpers.mjs';
const checks = {typos:true,grammar:true,wording:true,facts:true,relevance:true};
const pass = () => ({verdict:'pass',checks:{...checks},issues:[],edits:[]});
function setup(responses = [pass()]) {
  const calls = [];
  const h = harness(['05-runner.js','06-boss.js','06-boss-greeting.js'], {
    GM_xmlhttpRequest: options => {
      calls.push(JSON.parse(options.data));
      const response = responses.shift();
      if (response === 'timeout') return options.ontimeout();
      options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]})});
    },
  });
  h.context.job = {...fixtureJob};
  h.context.profile = fixtureProfile;
  h.context.detail = {postDescription:'合同核对、商务支持与数据整理'};
  h.run(`config=normalizeConfig({...config,...profile,greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'review-test'});
    function getHistoryKey(){return 'test-history'};
    sleep=async()=>{};sleepHumanDelay=async()=>{};`);
  return {...h, reviewCalls:calls};
}
const revise = (before, after) => ({verdict:'revise',checks:{...checks,typos:false},issues:['需要修正字词或语序'],edits:[{before,after,reason:'修正字词或语序'}]});

test('通用版默认校对后发送，始终尊重用户明确保存的预览选择', () => {
  const h=setup();
  assert.equal(h.run('config.bossGreetingPreviewOnly'), false);
  assert.equal(h.run('normalizeConfig({bossGreetingPreviewOnly:true}).bossGreetingPreviewOnly'), true);
  assert.equal(h.run('normalizeConfig({bossGreetingPreviewOnly:true,greetingWorkflowVersion:2}).bossGreetingPreviewOnly'), true);
});
test('实际发送必经完整语义校对，回执绑定最终文本', async () => {
  const h=setup();
  const result=await h.run('prepareBossGreeting(job,detail,config)');
  assert.equal(result.proofread.status,'passed');
  assert.equal(result.proofread.reviewedText,result.text);
  assert.equal(h.reviewCalls.length,1);
  assert.match(h.reviewCalls[0].messages[0].content,/错别字、语序.*用词/);
  const body=JSON.parse(h.reviewCalls[0].messages[1].content);
  assert.ok(body.candidateFacts.length > 0);
  assert.equal(body.greeting,result.text);
});
test('错别字修正后再次复核最终文本，发送修改后的内容', async () => {
  const h=setup([revise('沟通配和','沟通配合'),pass()]);
  h.run('config.candidateIntro="我负责跨部门沟通配和。"');
  const result=await h.run('prepareBossGreeting(job,detail,config)');
  assert.match(result.text,/沟通配合/);
  assert.doesNotMatch(result.text,/沟通配和/);
  assert.equal(result.proofread.corrections,1);
  assert.equal(h.reviewCalls.length,2);
  const final=JSON.parse(h.reviewCalls[1].messages[1].content);
  assert.equal(final.finalPass,true);
  assert.equal(final.greeting,result.text);
});
test('允许有限的语序调整，修正后必须复核', async () => {
  const h=setup([revise('我熟练能够使用办公工具','我能够熟练使用办公工具'),pass()]);
  h.run('config.candidateIntro="我熟练能够使用办公工具。"');
  const result=await h.run('prepareBossGreeting(job,detail,config)');
  assert.match(result.text,/我能够熟练使用办公工具/);
});
test('校对不通过、结果不完整、超时或最终复核失败时不建立沟通', async () => {
  const cases=[
    [ {...pass(),verdict:'reject',issues:['用词不当']} ],
    [ {...pass(),checks:{...checks,grammar:false}} ],
    [ {verdict:'pass',checks:{typos:true},issues:[],edits:[]} ],
    ['timeout'],
    [revise('沟通配和','沟通配合'),{...pass(),verdict:'reject',issues:['仍有语病']}],
  ];
  for(const [index,responses] of cases.entries()){
    const h=setup(responses);
    h.run('config.candidateIntro="我负责跨部门沟通配和。"');
    const result=await h.run('applyBossJob(job,detail)');
    assert.equal(result.ok,false);
    if ([0,1,4].includes(index)) assert.equal(result.skipped,true);
    else assert.equal(result.needsAttention,true);
    assert.equal(h.calls.length,0);
    assert.equal(h.run('Object.keys(loadBossGreetingLedger()).length'),0);
  }
});
test('阻止校对改动数字、工具、职责程度、公司名或无法定位的片段', async () => {
  const changes=[['17小时','99小时'],['支持12款','主导12款'],['Excel','Python'],['示例公司','另一家公司'],['不存在片段','替换内容']];
  for(const [before,after] of changes){
    const h=setup([revise(before,after)]);
    h.context.sample='您好，我对示例公司的商务专员岗位感兴趣。熟练使用Excel，支持12款产品上线，将月均耗时由约17小时降至约6小时。';
    h.context.edits=[{before,after,reason:'修正'}];
    assert.throws(()=>h.run('applyGreetingProofEdits(sample,edits,job,config)'));
  }
});
test('本地格式检查不会被模型的通过结果覆盖', async () => {
  for(const intro of ['我负责{{岗位}}。','我负责负责商务支持。','我有商务支持经验（。']){
    const h=setup();h.context.intro=intro;h.run('config.candidateIntro=intro');
    const result=await h.run('applyBossJob(job,detail)');
    assert.equal(result.skipped,true);
    assert.equal(h.calls.length,0);
  }
});
test('无模型时允许明确标记的草稿预览，实际发送必阻止', async () => {
  const h=setup();
  h.run('config.greetingAIEndpoint="";config.greetingAIModel="";config.bossGreetingPreviewOnly=true');
  const draft=await h.run('prepareBossGreeting(job,detail,config)');
  assert.equal(draft.proofread.status,'unreviewed');
  h.run('config.bossGreetingPreviewOnly=false');
  const result=await h.run('applyBossJob(job,detail)');
  assert.equal(result.needsAttention,true);
  assert.equal(h.calls.length,0);
  assert.equal(h.reviewCalls.length,0);
});
test('最终发送文本与校对文本不一致时，发送通道在创建聊天窗口前拒绝', async () => {
  const h=setup();
  h.context.review={status:'passed',reviewedText:'已经校对的文本',checks:Object.keys(checks)};
  await assert.rejects(h.run('sendBossGreetingInChat(job,"被改动的文本",review)'),/没有通过完整校对/);
  assert.equal(h.calls.length,0);
});
test('修正之后仍不接受事实检查未通过的结果', async () => {
  const h=setup([{...revise('沟通配和','沟通配合'),checks:{...checks,facts:false}}]);
  h.run('config.candidateIntro="我负责跨部门沟通配和。"');
  const result=await h.run('applyBossJob(job,detail)');
  assert.equal(result.skipped,true);
  assert.equal(h.reviewCalls.length,1);
});

test('单条内容拒绝后继续下一岗位；接口异常仍停机且零发送', async () => {
  const h=setup([{...pass(),verdict:'reject',checks:{...checks,relevance:false},issues:['经历与岗位相关性不足']},pass()]);
  h.context.nextJob={...fixtureJob,encryptJobId:'job-b',encryptBossId:'boss-b',securityId:'sec-b',lid:'lid-b'};
  h.context.adapter={id:'boss',canApply:()=>true,fetchDetail:async()=>h.context.detail,apply:(job,detail)=>h.context.applyBossJob(job,detail)};
  h.run(`let opened=0,sent=0;state.running=true;
    openBossConversation=async()=>{opened++;return {ok:true}};
    sendBossGreetingInChat=async()=>{sent++;return {confirmed:true}};`);
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.run('state.stopping'),false);
  assert.equal(h.run('opened'),0);
  await h.run('handleOneJob(nextJob,adapter)');
  assert.equal(h.run('state.applied'),1);
  assert.equal(h.run('state.skipped'),1);
  assert.equal(h.run('opened'),1);
  assert.equal(h.run('sent'),1);
  const failed=setup(['timeout']);
  failed.context.adapter={id:'boss',canApply:()=>true,fetchDetail:async()=>failed.context.detail,apply:(job,detail)=>failed.context.applyBossJob(job,detail)};
  failed.run('state.running=true');
  await failed.run('handleOneJob(job,adapter)');
  assert.equal(failed.run('state.stopping'),true);
  assert.equal(failed.calls.length,0);
});

test('年限进入校对依据，校对不得删除问候或改动五年以上年限', async () => {
  const h=setup();
  h.run('config.candidateExperience="五年以上工作经验"');
  const result=await h.run('prepareBossGreeting(job,detail,config)');
  const body=JSON.parse(h.reviewCalls[0].messages[1].content);
  assert.equal(body.requiredExperience,'五年以上工作经验');
  assert.match(body.candidateIntro,/五年以上工作经验/);
  h.context.sample=result.text;
  for(const [before,after] of [['您好，',''],['五年以上工作经验','六年以上工作经验'],['五年以上工作经验','五年工作经验']]) {
    h.context.edits=[{before,after,reason:'调整措辞'}];
    assert.throws(()=>h.run('applyGreetingProofEdits(sample,edits,job,config)'));
  }
  h.context.noGreeting=result.text.replace(/^您好，/,'');
  assert.match(h.run('lintGreetingText(noGreeting,config).join()'),/问候/);
  h.context.noExperience=result.text.replace('五年以上工作经验','相关经验');
  assert.match(h.run('lintGreetingText(noExperience,config).join()'),/工作年限/);
});
