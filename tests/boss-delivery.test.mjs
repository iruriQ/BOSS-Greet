import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureProfile, fixtureJob } from './helpers.mjs';
function setup(overrides = {}) {
  const h = harness(['05-runner.js', '06-boss.js', '06-boss-greeting.js'], {
    GM_xmlhttpRequest: options => options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdict:'pass', checks:{typos:true,grammar:true,wording:true,facts:true,relevance:true},issues:[],edits:[] }) } }] }) }),
    ...overrides,
  });
  h.context.job = { ...fixtureJob };
  h.context.profile = fixtureProfile;
  h.run(`config = normalizeConfig({...config, ...profile, greetingAIEndpoint:'https://model.example/chat/completions', greetingAIModel:'review-test'});
    function getHistoryKey(){return 'test-history'};
    sleep = async () => {}; sleepHumanDelay = async () => {};
    state.running = true;`);
  return h;
}
const detail = { postDescription: '合同核对、授权条款与法务协作' };
test('预览不调用建立沟通、聊天发送或写入投递历史', async () => {
  const h = setup();
  h.run('config.bossGreetingPreviewOnly = true');
  h.context.detail = detail;
  const result = await h.run('applyBossJob(job, detail)');
  assert.equal(result.preview, true);
  assert.equal(h.calls.length, 0);
  assert.equal(h.run('loadHistory().dailyCount'), 0);
  assert.equal(h.run('Object.keys(loadBossGreetingLedger()).length'), 0);
});
test('未配置筛选关键词也要读取 JD，预览与成功计数分开', async () => {
  const h = setup();
  h.run('config.bossGreetingPreviewOnly = true');
  h.context.detail = detail;
  h.context.adapter = { id: 'boss', canApply: () => true, fetchDetail: async () => detail, apply: (job, detail) => h.context.applyBossJob(job, detail) };
  await h.run('handleOneJob(job, adapter)');
  assert.equal(h.run('state.previewed'), 1);
  assert.equal(h.run('state.applied'), 0);
  assert.equal(h.run('loadHistory().dailyCount'), 0);
});
test('只有专属话术确认后才成功，同招聘者另一个岗位也不会重复发', async () => {
  const h = setup();
  h.context.detail = detail;
  h.run(`config.bossGreetingPreviewOnly = false;
    let opened = 0, sent = 0;
    openBossConversation = async () => {opened++; return {ok:true}};
    sendBossGreetingInChat = async () => {sent++; return {confirmed:true}};`);
  assert.equal((await h.run('applyBossJob(job, detail)')).ok, true);
  assert.equal(h.run('loadHistory().dailyCount'), 1);
  assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].status'), 'sent');
  h.context.job = { ...fixtureJob, encryptJobId: 'other-job' };
  assert.equal((await h.run('applyBossJob(job, detail)')).skipped, true);
  assert.equal(h.run('opened'), 1);
  assert.equal(h.run('sent'), 1);
});
test('开聊提醒不是话术发送成功；未确认发送保留记录且不自动重发', async () => {
  for (const soft of [true, false]) {
    const h = setup();
    h.context.soft = soft;
    h.context.detail = detail;
    h.run(`config.bossGreetingPreviewOnly = false;
      let sent = 0;
      openBossConversation = async () => ({ok:true, softSuccess:soft, message:'开聊提醒'});
      sendBossGreetingInChat = async () => {sent++; throw new Error('无投递确认')};`);
    const result = await h.run('applyBossJob(job, detail)');
    assert.equal(result.ok, false);
    assert.equal(result.needsAttention, true);
    assert.equal(h.run('sent'), soft ? 0 : 1);
    assert.equal(h.run('loadHistory().dailyCount'), soft ? 0 : 1);
    assert.equal((await h.run('applyBossJob(job, detail)')).skipped, true);
    assert.equal(h.run('sent'), soft ? 0 : 1);
  }
});
test('停止、缺少招聘者身份或被其他标签页锁定时不会发起沟通', async () => {
  for (const mode of ['stop', 'missing', 'lock']) {
    const h = setup();
    h.context.detail = detail;
    h.run('config.bossGreetingPreviewOnly = false;');
    if (mode === 'stop') h.run('state.stopping = true');
    if (mode === 'missing') h.context.job = { ...fixtureJob, encryptBossId: '' };
    if (mode === 'lock') h.run('window.navigator.locks.request = async (key, options, callback) => callback(null)');
    assert.equal((await h.run('applyBossJob(job, detail)')).skipped, true);
    assert.equal(h.calls.length, 0);
  }
});
test('未启用专属话术时保留原投递方式', async () => {
  const h = setup();
  h.run('config.bossPersonalizedGreeting = false; openBossConversation = async () => ({ok:true, message:"original"})');
  assert.equal((await h.run('applyBossJob(job, null)')).message, 'original');
});
function chatDocument({ status = 1, wrongBoss = false, draft = '' } = {}) {
  let clicks = 0;
  const message = { isSelf: true, status, text: '专属招呼语' };
  const parent = { __vue__: { conversation$: { encryptBossId: wrongBoss ? 'wrong' : fixtureJob.encryptBossId, jobId: fixtureJob.encryptJobId } }, parentElement: null };
  const editor = { tagName: 'DIV', parentElement: parent, textContent: draft, focus() {}, dispatchEvent() {} };
  const button = { className: '', hasAttribute: () => false, getAttribute: () => null, click() { clicks++; } };
  const doc = {
    defaultView: { Event: class {} },
    querySelector(selector) { return selector === '.btn-send' ? button : editor; },
    querySelectorAll() { return clicks ? [{ __vue__: { message } }] : []; },
  };
  const frame = { contentDocument: doc, style: {}, remove() {} };
  return { doc, document: { createElement: () => frame, body: { appendChild() {} }, cookie: '' }, clicks: () => clicks };
}
test('原生聊天发送核对招聘者及岗位，服务器确认状态才算成功', async () => {
  const chat = chatDocument();
  const h = setup({ document: chat.document });
  h.run('const review = {status:"passed", reviewedText:"专属招呼语", checks:["typos","grammar","wording","facts","relevance"]}');
  assert.equal((await h.run('sendBossGreetingInChat(job, "专属招呼语", review)')).confirmed, true);
  assert.equal(chat.clicks(), 1);
});
test('错误招聘者、已有草稿时不点击发送；待发送或失败气泡不算成功且只点击一次', async () => {
  for (const options of [{ wrongBoss: true }, { draft: '人工草稿' }, { status: 0 }, { status: 4 }]) {
    const chat = chatDocument(options);
    const h = setup({ document: chat.document });
    h.run('const review = {status:"passed", reviewedText:"专属招呼语", checks:["typos","grammar","wording","facts","relevance"]}');
    await assert.rejects(h.run('sendBossGreetingInChat(job, "专属招呼语", review)'));
    assert.equal(chat.clicks(), options.wrongBoss || options.draft ? 0 : 1);
  }
});

test('Vue 消息属性缺失时，完整正文加平台送达/已读回执才能确认', () => {
  const h=setup();
  for(const options of [{receipt:true}, {receipt:true,pending:true}, {receipt:true,wrongText:true}, {receipt:false}]) {
    const node={querySelector(selector){
      if(selector==='.text-content')return {textContent:options.wrongText?'另一条消息':'专属招呼语'};
      if(selector==='.message-status.status-delivery, .message-status.status-read')return options.receipt?{}:null;
      if(selector==='.message-status.status-loading, .message-status.status-error')return options.pending?{}:null;
      return null;
    }};
    h.context.doc={querySelectorAll:()=>[node]};
    assert.equal(h.run('findConfirmedBossGreeting(doc,"专属招呼语")'),Boolean(options.receipt&&!options.pending&&!options.wrongText));
  }
});

test('服务端历史确认核对双方身份、完整正文和已存状态，不能接受本地待发或别人消息', () => {
  const h=setup();
  const message={mid:123456,from:{uid:42},to:{uid:99,source:0},body:{type:1,text:'完整招呼语'},status:0,newSubmit:false};
  h.context.identity={selfId:'42',bossId:'99',source:0};
  for(const status of [0,1,2]) {
    h.context.message={...message,status};
    assert.equal(h.run('bossHistoryMessageDelivered(message,identity,"完整招呼语")'),true);
  }
  for(const change of [{newSubmit:true},{status:3},{status:4},{mid:0},{from:{uid:99}},
    {to:{uid:100,source:0}},{to:{uid:99,source:1}},{body:{type:1,text:'另一条消息'}}, {body:{type:4,text:'完整招呼语'}}]) {
    h.context.message={...message,...change};
    assert.equal(h.run('bossHistoryMessageDelivered(message,identity,"完整招呼语")'),false);
  }
});

test('服务器已存消息但即时回执不更新时，只读核查后成功且发送仅一次', async () => {
  const chat=chatDocument({status:0});
  let reads=0;
  chat.doc.defaultView._PAGE={uid:42};
  chat.doc.defaultView.AbortController=AbortController;
  chat.doc.defaultView.fetch=async(url,options)=>{
    reads++;
    assert.match(url,/^\/wapi\/zpchat\/geek\/historyMsg\?/);
    assert.equal(options.method,'GET');
    return {ok:true,json:async()=>({code:0,zpData:{messages:[{mid:123456,from:{uid:42},to:{uid:99,source:0},body:{type:1,text:'专属招呼语'},status:0,newSubmit:false}]}})};
  };
  const h=setup({document:chat.document});
  h.context.chatDoc=chat.doc;
  h.run('const current=getBossEditorConversation(chatDoc);current.friendId=99;current.friendSource=0;const review={status:"passed",reviewedText:"专属招呼语",checks:["typos","grammar","wording","facts","relevance"]};');
  const result=await h.run('sendBossGreetingInChat(job,"专属招呼语",review)');
  assert.equal(result.confirmed,true);
  assert.equal(result.source,'server-history');
  assert.equal(reads,1);
  assert.equal(chat.clicks(),1);
  assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].expectedText'),'专属招呼语');
});
