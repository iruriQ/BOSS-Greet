import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const source=(await readFile(new URL('../boss-auto-apply.user.js',import.meta.url),'utf8'))
 .replace('"use strict";','"use strict";waitForBossOperation=async()=>{};waitForBossJobGap=async()=>{};window.__preview={state:()=>state,history:()=>loadHistory(),config:()=>config};');
try{
 const page=await browser.newPage(),requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());requests.push(url.pathname);
  if(url.pathname==='/wapi/zpgeek/job/card.json'){
   assert.notEqual(url.searchParams.get('lid'),'title-excluded','名称排除岗位不应请求详情');
   const near=url.searchParams.get('lid')==='near';
   return request.respond({status:200,contentType:'application/json',body:JSON.stringify({code:0,zpData:{jobCard:{postDescription:'合同管理与商务支持',activeTimeDesc:'今日活跃',longitude:near?121.48:121.8,latitude:31.23}}})});
  }
  if(url.pathname==='/web/geek/jobs')return request.respond({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><div id="list"><div class="job-card-wrapper">销售助理</div><div class="job-card-wrapper">远距离商务岗位</div><div class="job-card-wrapper">附近商务岗位</div></div><script>
   const jobs=['title-excluded','far','near'].map(id=>({jobName:id==='title-excluded'?'销售助理':id==='far'?'远距离商务岗位':'附近商务岗位',brandName:'虚构公司',brandScaleName:'100-499人',encryptJobId:id,securityId:id,lid:id}));
   const list={jobList:jobs,hasMore:false,pageVo:{page:1},loading:false};
   document.querySelectorAll('.job-card-wrapper').forEach((card,i)=>{card.__vue__={data:jobs[i],$parent:list}});
   </script>`});
  return request.respond({status:404,body:'blocked'});
 });
 await page.evaluateOnNewDocument(()=>{
  window.__values=new Map(JSON.parse(localStorage.getItem('synthetic-gm')||'[]'));
  window.GM_getValue=(key,fallback)=>window.__values.get(key)??(key.endsWith(':config')?{bossGreetingMode:'fixed',bossFixedGreeting:'您好！我有合同管理经验，期待与您沟通。',bossDistanceEnabled:true,bossMaxDistanceKm:10,bossHomeLocation:{longitude:121.47,latitude:31.23,coordinateSystem:'gcj02',name:'虚构起点'},excludeTitleKeywords:['销售'],includeDescriptionKeywords:['合同'],bossCompanySizes:['100-499人']}:fallback);
  window.GM_setValue=(key,value)=>{window.__values.set(key,value);localStorage.setItem('synthetic-gm',JSON.stringify([...window.__values]));};
  window.GM_xmlhttpRequest=options=>{if(options.url.includes('releases.json')){options.onerror();return;}throw Error('不应调用模型')};
 });
 await page.goto('https://www.zhipin.com/web/geek/jobs');await page.addScriptTag({content:source});
 await page.waitForSelector('[data-action="preview-greeting"]');
 assert.equal(await page.$eval('[data-action="preview-greeting"]',e=>e.textContent.trim()),'筛选合适岗位并预览话术');
 await page.click('[data-action="preview-greeting"]');await page.waitForFunction(()=>!window.__preview.state().previewing);
 assert.ok(await page.$('.aj-preview'),await page.evaluate(()=>window.__preview.state().greetingPreviewError));
 assert.match(await page.$eval('.nova-preview-job',e=>e.textContent),/附近商务岗位/);
 assert.match(await page.$eval('[data-card="preview"]',e=>e.textContent),/已检查 3 个/);
 assert.equal(requests.filter(path=>path.endsWith('/card.json')).length,2);
 assert.equal(await page.evaluate(()=>window.__preview.history().dailyCount),0);
 assert.equal(await page.evaluate(()=>window.__preview.state().processedKeys.size),0);
 assert.equal(await page.evaluate(()=>window.__preview.state().submitted),0);
 // Independent title boxes save, invalidate stale previews, and skip all
 // excluded titles before any detail/model/contact request.
 await page.$eval('input[aria-label="岗位名称排除关键词 1"]',e=>{e.focus();e.select()});await page.keyboard.press('Backspace');await page.type('input[aria-label="岗位名称排除关键词 1"]','商务');
 await page.waitForFunction(()=>window.__preview.state().lastGreeting===null);
 assert.equal(await page.$('.aj-preview'),null);
 await page.$eval('[aria-label="岗位名称排除关键词"] .nova-add-keyword',e=>e.click());
 await page.type('input[aria-label="岗位名称排除关键词 2"]','销售');
 assert.deepEqual(await page.evaluate(()=>window.__preview.config().excludeTitleKeywords),['商务','销售']);
 const readsBefore=requests.filter(path=>path.endsWith('/card.json')).length;
 await page.click('[data-action="preview-greeting"]');await page.waitForFunction(()=>!window.__preview.state().previewing);
 assert.match(await page.$eval('[data-card="preview"]',e=>e.textContent),/岗位名称命中排除关键词/);
 assert.equal(requests.filter(path=>path.endsWith('/card.json')).length,readsBefore);
 await page.reload();await page.addScriptTag({content:source});await page.waitForSelector('input[aria-label="岗位名称排除关键词 2"]');
 assert.equal(await page.$eval('input[aria-label="岗位名称排除关键词 1"]',e=>e.value),'商务');
 assert.equal(await page.$eval('input[aria-label="岗位名称排除关键词 2"]',e=>e.value),'销售');
 await page.$eval('input[aria-label="岗位名称排除关键词 1"]',e=>{e.focus();e.select()});await page.keyboard.press('Backspace');await page.type('input[aria-label="岗位名称排除关键词 1"]','销售');
 await page.$eval('button[aria-label="删除岗位名称排除关键词 2"]',e=>e.click());
 assert.deepEqual(await page.evaluate(()=>window.__preview.config().excludeTitleKeywords),['销售']);
 // A filter edit invalidates the previous selection immediately. Neither job
 // fits the tighter radius, so no stale preview or message may remain.
 await page.$eval('[name="bossMaxDistanceKm"]',e=>{e.value='0.1';e.dispatchEvent(new Event('input',{bubbles:true}))});
 assert.equal(await page.$('.aj-preview'),null);
 await page.click('[data-action="preview-greeting"]');
 await page.waitForFunction(()=>!window.__preview.state().previewing);
 assert.match(await page.$eval('[data-card="preview"]',e=>e.textContent),/已检查 3 个岗位，暂未找到符合条件/);
 assert.equal(await page.$('.aj-preview'),null);
 assert.ok(!requests.some(path=>/friend\/add|chat\/|chat\/completions/.test(path)));
 assert.deepEqual(errors,[]);
 console.log('真实打包界面验证通过：独立名称排除框添加/删除及刷新保留、名称排除优先且零详情请求、跳过远岗位后预览近岗位、修改条件清空旧结果、全部不符汇总；零开聊、零消息、零AI调用、零投递记录。');
}finally{await browser.close()}
