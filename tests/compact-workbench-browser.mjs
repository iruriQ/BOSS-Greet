import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const artifacts=await mkdtemp(join(tmpdir(),'boss-greet-ui-'));
try {
 const page=await browser.newPage(),errors=[],requests=[];
 await page.setViewport({width:1160,height:1000,deviceScaleFactor:1});
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:4178/?buttons=fresh-forest-green');
 await page.waitForSelector('.nova-overview');
 const fixed=()=>page.$$eval('.nova-header,.nova-nav,.nova-overview,.nova-actions',es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
 const before=await fixed();
 assert.ok(await page.$eval('.nova-overview',e=>e.getBoundingClientRect().height<115),'summary is compact');
 assert.ok(await page.$eval('.nova-header',e=>e.getBoundingClientRect().height<=52),'brand header is compact');
 assert.ok(await page.$eval('.nova-nav',e=>e.getBoundingClientRect().height<=51),'horizontal navigation saves space');
 assert.ok(await page.$eval('.nova-actions',e=>e.getBoundingClientRect().height<72),'footer stays compact');
 assert.equal(await page.$eval('.nova-select select',e=>getComputedStyle(e).fontSize),'13px');
 const active=()=>page.$eval('[aria-current="page"][data-nav]',e=>e.dataset.nav);
 assert.equal(await active(),'filters');
 assert.equal(await page.$('[data-nav="overview"]'),null);
 assert.equal(await page.$$eval('.nova-nav [data-nav]',es=>es.length),3);
 const scrollToCard=async id=>{
   await page.hover('.nova-content');await page.mouse.wheel({deltaY:1});
   const delta=await page.$eval(`[data-card="${id}"]`,e=>e.getBoundingClientRect().top-document.querySelector('.nova-content').getBoundingClientRect().top-16);
   await page.mouse.wheel({deltaY:delta});
 };
 await scrollToCard('greeting');await page.waitForFunction(()=>document.querySelector('[data-nav="greeting"]').getAttribute('aria-current')==='page');
 assert.deepEqual(await fixed(),before);
 await (await page.$('[data-boss-nova]')).screenshot({path:artifacts+'/workbench-simple-nav-greeting-preview.png'});
 await scrollToCard('preview');await page.waitForFunction(()=>document.querySelector('[data-nav="greeting"]').getAttribute('aria-current')==='page');
 await scrollToCard('logs');await page.waitForFunction(()=>document.querySelector('[data-nav="logs"]').getAttribute('aria-current')==='page');
 assert.deepEqual(await fixed(),before);
 for(const id of ['filters','greeting','logs']) {
  await page.click(`[data-nav="${id}"]`);assert.equal(await active(),id);
 }
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 // Actual wheel input must override the last clicked item, including preview.
 await scrollToCard('greeting');await page.waitForFunction(()=>document.querySelector('[data-nav="greeting"]').getAttribute('aria-current')==='page');
 await page.setViewport({width:375,height:700});
 await page.waitForFunction(()=>document.querySelector('[data-boss-nova]').getBoundingClientRect().right<=375);
 assert.ok(await page.$eval('.nova-content',e=>e.clientHeight>=375),'small screens retain usable scrolling space');
 assert.ok(await page.$eval('[data-boss-nova]',e=>e.scrollWidth<=e.clientWidth),'no horizontal overflow');
 await page.click('[data-nav="greeting"]');
 await (await page.$('[data-boss-nova]')).screenshot({path:artifacts+'/workbench-simple-nav-mobile-preview.png'});
 await page.setViewport({width:1440,height:1000});await page.goto('http://127.0.0.1:4178/?buttons=fresh-forest-green&layout=wide');
 await page.waitForSelector('[data-expanded="true"]');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const wideBefore=await fixed();await page.click('[data-nav="logs"]');assert.equal(await active(),'logs');
 await page.click('[data-nav="greeting"]');await page.waitForFunction(()=>document.querySelector('[data-nav="greeting"]').getAttribute('aria-current')==='page');
 assert.deepEqual(await fixed(),wideBefore);
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:4178/')));
 console.log('预览验证通过：工作台紧凑固定、滚轮自动跟随导航、话术预览归属打招呼、三项点击定位、窄屏/宽屏、无页面溢出与零外部请求。');
} finally {await browser.close();}
