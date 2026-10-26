import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { fixtureJob, fixtureProfile } from './helpers.mjs';

// 完全隔离的浏览器和模拟页面：拦截所有请求，不连接真实招聘服务或模型服务。
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  let serverAcceptedText='';
  const rawJob = { ...fixtureJob, jobName: '商务专员', brandName: '模拟公司', activeTimeDesc: '今日活跃' };
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    requests.push(url.pathname);
    let body = '', contentType = 'text/html';
    if (url.pathname === '/web/geek/job') {
      body = `<html><head></head><body><h1>模拟岗位列表</h1><div class="job-card-wrapper"><div class="job-name">商务专员</div><div class="company-name">模拟公司</div><div>今日活跃</div></div><script>document.querySelector('.job-card-wrapper').__vue__={data:${JSON.stringify(rawJob)}};</script></body></html>`;
    } else if (url.pathname === '/web/geek/map/path') {
      body='<html><body><div class="path-plan-search"><span class="start-point-text">请选择起点</span></div></body></html>';
    } else if (url.pathname === '/wapi/zpgeek/job/card.json') {
      contentType = 'application/json';
      body = JSON.stringify({ code: 0, zpData: { jobCard: { postDescription: '合同制作、合同核对、条款与授权信息校验，协同法务和供应商跟进采购。', activeTimeDesc: '今日活跃', encryptUserId: fixtureJob.encryptBossId } } });
    } else if (url.pathname === '/wapi/zpgeek/friend/add.json') {
      contentType = 'application/json'; body = JSON.stringify({ code: 0, message: 'Success' });
    } else if (url.pathname === '/__mock/message-accepted') {
      serverAcceptedText=request.postData();contentType='application/json';body='{}';
    } else if (url.pathname === '/wapi/zpchat/geek/historyMsg') {
      contentType='application/json';body=JSON.stringify({code:0,zpData:{messages:serverAcceptedText?[{mid:123456,from:{uid:42},to:{uid:99,source:0},body:{type:1,text:serverAcceptedText},status:0,newSubmit:false}]:[]}});
    } else if (url.pathname === '/web/geek/chat') {
      body = `<html><body><section id="editor-parent"><div id="chat-input" class="chat-input" contenteditable="true"></div><button class="btn-send disabled">发送</button></section><ul class="im-list"></ul><script>
      window._PAGE={uid:42};document.querySelector('#editor-parent').__vue__={conversation$:{encryptBossId:${JSON.stringify(fixtureJob.encryptBossId)},jobId:${JSON.stringify(fixtureJob.encryptJobId)},friendId:99,friendSource:0}};
      const input=document.querySelector('#chat-input');const button=document.querySelector('.btn-send');
      input.addEventListener('input',()=>button.classList.remove('disabled'));
      button.addEventListener('click',()=>{const text=input.textContent; input.textContent='';const li=document.createElement('li');li.className='message-item item-myself';li.innerHTML='<div class=message-content><i class="message-status status-loading"></i><p class=text-content></p></div>';li.querySelector('.text-content').textContent=text;document.querySelector('.im-list').appendChild(li);fetch('/__mock/message-accepted',{method:'POST',body:text})});
      </script></body></html>`;
    } else {
      await request.respond({ status: 404, body: 'Blocked by isolated test' }); return;
    }
    await request.respond({ status: 200, contentType, body });
  });
  await page.goto('https://www.zhipin.com/web/geek/job');
  await page.evaluate(profile => {
    window.__stored = new Map();
    window.GM_getValue = (key, fallback) => window.__stored.get(key) ?? (key.endsWith(':config') ? { ...profile, greetingAIEndpoint:'https://model.example/chat/completions', greetingAIModel:'mock-review' } : fallback);
    window.GM_setValue = (key, value) => window.__stored.set(key, value);
    window.__reviewCalls = 0;
    window.GM_xmlhttpRequest = options => {
      window.__reviewCalls++;
      const reject = window.__rejectReview === true;
      const review = {verdict:reject?'reject':'pass',checks:{typos:true,grammar:!reject,wording:true,facts:true,relevance:true},issues:reject?['语序待调整']:[],edits:[]};
      options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(review)}}]})});
    };
    document.cookie = 'bst=isolated-test';
  }, fixtureProfile);
  const source = readFileSync(new URL('../boss-auto-apply.user.js', import.meta.url), 'utf8')
    .replace('"use strict";', '"use strict"; window.__test = { state:()=>state, config:()=>config, apply:(job,detail)=>applyBossJob(job,detail), history:()=>loadHistory() };');
  await page.addScriptTag({ content: source });
  await page.waitForSelector('[data-action="preview-greeting"]');
  assert.equal(await page.$eval('[name="bossGreetingPreviewOnly"]', element => element.checked), false);
  await page.select('[name="greetingOpening"]','你好');
  assert.equal(await page.evaluate(() => window.__test.config().greetingOpening), '你好');
  await page.click('[name="bossGreetingIncludeAI"]');
  assert.equal(await page.evaluate(() => window.__test.config().bossGreetingIncludeAI), false);
  await page.click('[name="bossGreetingIncludeAI"]');
  await page.click('[data-action="preview-greeting"]');
  await page.waitForSelector('.aj-preview');
  assert.match(await page.$eval('.aj-preview', element => element.textContent), /^你好，.*合同/);
  assert.equal(requests.filter(path => path.includes('friend/add')).length, 0);
  assert.equal(await page.evaluate(() => window.__test.history().dailyCount), 0);
  assert.equal(await page.evaluate(() => window.__test.config().bossGreetingPreviewOnly), false);
  // 距家筛选在任何模型调用或开聊之前生效；通过真实界面开启/关闭。
  const reviewCallsBeforeDistance=await page.evaluate(()=>window.__reviewCalls);
  await page.click('[name="bossDistanceEnabled"]');
  const distanceBlocked=await page.evaluate(job=>window.__test.apply(job,{postDescription:'合同管理'}),fixtureJob);
  assert.equal(distanceBlocked.skipped,true);
  assert.equal(await page.evaluate(()=>window.__reviewCalls),reviewCallsBeforeDistance);
  assert.equal(requests.filter(path=>path.includes('friend/add')).length,0);
  await page.click('[name="bossDistanceEnabled"]');
  await page.evaluate(() => {window.__rejectReview = true;});
  const blocked = await page.evaluate(job => window.__test.apply(job, { postDescription: '合同管理及法务协调' }), fixtureJob);
  assert.equal(blocked.skipped, true);
  assert.equal(requests.filter(path => path.includes('friend/add')).length, 0);
  await page.evaluate(() => {window.__rejectReview = false;});
  const result = await page.evaluate(job => window.__test.apply(job, { postDescription: '合同管理及法务协调' }), fixtureJob);
  assert.equal(result.ok, true, result.message);
  assert.equal(requests.filter(path => path.includes('friend/add')).length, 1);
  assert.ok(await page.evaluate(() => window.__reviewCalls >= 3));
  assert.equal(requests.filter(path => path === '/web/geek/chat').length, 1);
  assert.equal(requests.filter(path => path === '/__mock/message-accepted').length,1);
  assert.equal(requests.filter(path => path === '/wapi/zpchat/geek/historyMsg').length,1);
  assert.equal(await page.evaluate(() => window.__test.history().dailyCount), 1);
  const second = await page.evaluate(job => window.__test.apply(job, { postDescription: '合同管理及法务协调' }), fixtureJob);
  assert.equal(second.skipped, true);
  assert.equal(requests.filter(path => path.includes('friend/add')).length, 1);
  assert.deepEqual(errors, []);
  const route=page; // 复用已安装全请求拦截的隔离页面。
  await route.goto('https://www.zhipin.com/web/geek/map/path?securityId=fixture');
  await route.evaluate(()=>{
    window.__homeValues=new Map();
    window.GM_getValue=(key,fallback)=>window.__homeValues.get(key)??fallback;
    window.GM_setValue=(key,value)=>window.__homeValues.set(key,value);
    const root=document.querySelector('.path-plan-search');
    root.__vue__={startAddress:{name:'我的位置',longitude:121.47,latitude:31.23}};
  });
  await route.addScriptTag({content:source});
  await route.waitForSelector('[data-action="sync-home"]');
  await route.click('[data-action="sync-home"]');
  assert.equal(await route.evaluate(()=>[...window.__homeValues.values()].some(v=>v?.bossHomeLocation)),false);
  await route.evaluate(()=>{
    document.querySelector('.path-plan-search').__vue__.startAddress={name:'模拟家庭地标',longitude:121.47,latitude:31.23};
    document.querySelector('.start-point-text').textContent='模拟家庭地标';
  });
  await route.click('[data-action="sync-home"]');
  assert.equal(await route.evaluate(()=>[...window.__homeValues.values()].find(v=>v?.bossHomeLocation)?.bossHomeLocation.name),'模拟家庭地标');
  // 首次安装没有任何私人预填；通过界面填写后，默认AI匹配也能预览未校对草稿。
  await page.goto('https://www.zhipin.com/web/geek/job');
  await page.evaluate(() => {
    window.__stored = new Map();
    window.GM_getValue = (_key, fallback) => fallback;
    window.GM_setValue = (key, value) => window.__stored.set(key,value);
  });
  await page.addScriptTag({content:source});
  await page.waitForSelector('[name="candidateProfile"]');
  for (const name of ['candidateIntro','candidateExperience','candidateProfile','greetingAIEndpoint','greetingAIModel']) {
    assert.equal(await page.$eval(`[name="${name}"]`, el=>el.value), '');
  }
  assert.equal(await page.evaluate(()=>window.__test.config().bossGreetingUseAI),true);
  assert.equal(await page.$eval('[name="bossGreetingIncludeAI"]',el=>el.checked),false);
  assert.doesNotMatch(await page.$eval('.aj-title',el=>el.textContent),/个人副本/);
  await page.$eval('[name="candidateProfile"]',el=>{el.value='负责服务合同归档和条款核对。';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const sendsBeforePreview=requests.filter(path=>path.includes('friend/add')||path==='/__mock/message-accepted').length;
  await page.click('[data-action="preview-greeting"]');
  await page.waitForSelector('.aj-preview');
  assert.match(await page.$eval('.aj-preview',el=>el.textContent),/合同归档/);
  assert.match(await page.$eval('.aj-preview-box',el=>el.textContent),/未校对/);
  assert.equal(requests.filter(path=>path.includes('friend/add')||path==='/__mock/message-accepted').length,sendsBeforePreview);
  assert.deepEqual(errors, []);
  console.log('浏览器模拟验证通过：首次安装资料为空、问候及AI亮点开关保存、无服务可预览草稿、默认直接发送、预览零发送、校对失败零发送、成功回执及去重、距离筛选先于模型和开聊、原生地图起点同步及定位误用拦截。所有请求均被拦截。');
} finally {
  await browser.close();
}
