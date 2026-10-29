import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const source = (await readFile(new URL('../boss-auto-apply.user.js', import.meta.url), 'utf8'))
  .replace('"use strict";', '"use strict";window.__featureEngine={config:()=>config,state:()=>state};');
const errors = [], outbound = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url() !== 'https://www.zhipin.com/web/geek/jobs') outbound.push(request.url());
    request.respond({status:200,contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><link rel="icon" href="data:,"><style>body{margin:0;background:#e8ebdf;font-family:system-ui}h1{margin:40px 0 0 700px;color:#3f7900;font-size:24px}</style><h1>隔离测试 · 虚构数据</h1></html>'});
  });
  await page.evaluateOnNewDocument(() => {
    window.__values = new Map();
    window.GM_getValue = (key, fallback) => window.__values.get(key) ?? (key.endsWith(':config') ? {
      greetingWorkflowVersion:2,bossGreetingMode:'fixed',bossGreetingPreviewOnly:true,
      includeDescriptionKeywords:'商务；项目、Excel',excludeDescriptionKeywords:'电话销售',bossCompanySizes:[],
    } : fallback);
    window.GM_setValue = (key, value) => window.__values.set(key, value);
  });
  await page.goto('https://www.zhipin.com/web/geek/jobs');
  await page.addScriptTag({ content: source });
  await page.waitForSelector('.nova-resize-se');
  const input = i => `[aria-label="岗位详情包含关键词 ${i}"]`;
  assert.equal(await page.$$eval('[role="group"][aria-label="岗位详情包含关键词"] input:not([type="hidden"])', es => es.length),3);
  assert.equal(await page.$eval(input(2),e=>e.value),'项目');
  await page.click('[data-nav="filters"]');
  await page.$eval(input(1),e=>{e.focus();e.select()}); await page.keyboard.press('Backspace'); await page.type(input(1),'合同 管理');
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().includeDescriptionKeywords),['合同 管理','项目','Excel']);
  const includeGroup = '[role="group"][aria-label="岗位详情包含关键词"]';
  await page.click(`${includeGroup} .nova-add-keyword`);
  await page.type(input(4),'C, C++');
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().includeDescriptionKeywords),['合同 管理','项目','Excel','C, C++']);
  await page.click('[aria-label="删除岗位详情包含关键词 2"]');
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().includeDescriptionKeywords),['合同 管理','Excel','C, C++']);
  await page.$eval('.nova-content', e => e.scrollTo(0,700));
  const button = await page.$('.nova-scale-grid button:nth-child(4)'); await button.click();
  await (await page.$('.nova-scale-grid button:nth-child(5)')).click();
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().bossCompanySizes),['100-499人','500-999人']);
  assert.equal(await page.$eval('.nova-scale-grid button:nth-child(4)',e=>e.getAttribute('aria-pressed')),'true');
  const bounds = () => page.$eval('[data-boss-nova]', e => {const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
  let box = await bounds();
  const corner = await (await page.$('[data-resize="se"]')).boundingBox();
  await page.mouse.move(corner.x+corner.width-5,corner.y+corner.height-5); await page.mouse.down();
  await page.mouse.move(corner.x+corner.width-5 +354-box.width,corner.y+corner.height-5 +600-box.height,{steps:10}); await page.mouse.up();
  await page.waitForFunction(()=>Math.abs(document.querySelector('[data-boss-nova]').getBoundingClientRect().width-354)<2);
  box = await bounds(); assert.ok(Math.abs(box.height-600)<2);
  const header = await (await page.$('.nova-header')).boundingBox();
  await page.mouse.move(header.x+25,header.y+25); await page.mouse.down();
  await page.mouse.move(header.x+245,header.y+125,{steps:10}); await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('[data-boss-nova]').getBoundingClientRect().x>200);
  const moved = await bounds(); assert.ok(moved.y>box.y+80);
  const fixed = () => page.$$eval('.nova-header,.nova-nav,.nova-actions',es=>es.map(e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height]}));
  const before = await fixed();
  await page.$eval('.nova-content',e=>e.scrollTo(0,10000));
  assert.deepEqual(await fixed(),before);
  assert.ok(await page.$eval('.nova-content',e=>e.clientHeight>60));
  const values=await page.evaluate(()=>[...window.__values]);
  await page.reload(); await page.evaluate(values=>{window.__values=new Map(values)},values);await page.addScriptTag({content:source});
  await page.waitForSelector('[data-resize="se"]',{timeout:5000});
  assert.deepEqual(await bounds(),moved,'size and position survive reload');
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().includeDescriptionKeywords),['合同 管理','Excel','C, C++']);
  assert.equal(await page.$eval(input(3),e=>e.value),'C, C++');
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().bossCompanySizes),['100-499人','500-999人']);
  // Resizing the browser cannot strand the panel outside the viewport.
  await page.setViewport({width:375,height:650});
  await page.waitForFunction(()=>document.querySelector('[data-boss-nova]').getBoundingClientRect().right<=367);
  box=await bounds(); assert.ok(box.x>=8&&box.y>=8&&box.x+box.width<=367&&box.y+box.height<=642);
  await page.click('[aria-label="恢复默认位置和大小"]');
  assert.equal(await page.evaluate(()=>[...window.__values].find(([key])=>key.endsWith(':ui'))[1].windowBounds),null);
  // Deleting every row clears the filter rather than reviving saved defaults.
  await page.$eval('.nova-content',e=>e.scrollTo(0,450));
  for(let i=0;i<3;i++) await page.click('[aria-label="删除岗位详情包含关键词 1"]');
  assert.deepEqual(await page.evaluate(()=>window.__featureEngine.config().includeDescriptionKeywords),[]);
  assert.equal(await page.$eval(input(1),e=>e.value),'');
  assert.deepEqual(errors,[]);
  assert.deepEqual(outbound,[],'editing, moving and resizing must not contact any service');
  console.log('独立关键词增删保存、规模多选、鼠标移动缩放、固定栏、刷新恢复及小屏边界验证通过。');
} catch(error) { console.error('page errors',errors); throw error; } finally { await browser.close(); }
