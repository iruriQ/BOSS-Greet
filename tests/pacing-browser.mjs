import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage(),requests=[],errors=[];await page.setViewport({width:1440,height:1200});
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());requests.push(url.pathname);
  if(url.pathname==='/web/geek/jobs')return request.respond({status:200,contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><div class="job-card-wrap"><li class="job-card-box">远岗位</li></div><div class="job-card-wrap"><li class="job-card-box">近岗位</li></div><script>
  window.nativeClicks=[];
  const jobs=['far','near'].map(id=>({jobName:id==='far'?'远岗位':'近岗位',brandName:'虚构公司',encryptJobId:id,securityId:id,lid:id,brandScaleName:'100-499人',bossOnline:true}));
  function detail(id){return{jobInfo:{encryptId:id,postDescription:'商务合同管理',longitude:id==='far'?121.8:121.48,latitude:31.23},bossInfo:{bossOnline:true,activeTimeDesc:'今日活跃'}};}
  const view={currentJob:jobs[0],jobDetail:detail('far'),jobDetailLoading:false,jobList:jobs,hasMore:false,pageVo:{page:1}};
  document.querySelectorAll('.job-card-wrap').forEach((card,i)=>{card.__vue__={data:jobs[i],$parent:view};card.querySelector('li').addEventListener('click',()=>{window.nativeClicks.push(Date.now());view.currentJob=jobs[i];view.jobDetail={};view.jobDetailLoading=true;setTimeout(()=>{view.jobDetail=detail(jobs[i].encryptJobId);view.jobDetailLoading=false;},50);});});
  </script>`});
  return request.respond({status:404,body:'blocked'});
 });
 await page.evaluateOnNewDocument(()=>{
  window.__stored=new Map();window.GM_getValue=(key,fallback)=>window.__stored.get(key)??(key.endsWith(':config')?{bossGreetingMode:'fixed',bossFixedGreeting:'您好！期待与您沟通。',bossDistanceEnabled:true,bossMaxDistanceKm:10,bossHomeLocation:{longitude:121.47,latitude:31.23,coordinateSystem:'gcj02',name:'虚构起点'},includeDescriptionKeywords:['商务'],bossCompanySizes:['100-499人']}:fallback);
  window.GM_setValue=(key,value)=>window.__stored.set(key,value);window.GM_xmlhttpRequest=options=>options.onerror();
 });
 await page.goto('https://www.zhipin.com/web/geek/jobs');
 const source=(await readFile(new URL('../boss-auto-apply.user.js',import.meta.url),'utf8')).replace('"use strict";','"use strict";window.__pacing={state:()=>state,config:()=>config}; Math.random=()=>0.5;');
 await page.addScriptTag({content:source});await page.waitForSelector('[data-action="preview-greeting"]');
 assert.equal(await page.$$eval('[name="bossReadIntervalSec"],[name="bossContactIntervalSec"],[name="bossSendIntervalSec"]',e=>e.length),0);
 assert.ok(!(await page.$eval('[data-boss-nova]',e=>e.textContent)).includes('读取岗位最短间隔'));
 await page.click('[data-action="preview-greeting"]');await page.waitForFunction(()=>window.__pacing.state().bossPacingMessage.includes('进入下一岗位前等待'));
 assert.equal(await page.evaluate(()=>window.nativeClicks.length),0);
 await page.click('[data-action="stop"]');await page.waitForFunction(()=>!window.__pacing.state().previewing);assert.equal(await page.evaluate(()=>window.nativeClicks.length),0);
 const start=Date.now();await page.click('[data-action="preview-greeting"]');await page.waitForFunction(()=>!window.__pacing.state().previewing,{timeout:20000});
 assert.ok(Date.now()-start>=1800,'抽中2秒时按真实计时等待后才切换下一岗位');assert.equal(await page.evaluate(()=>window.nativeClicks.length),1);
 assert.match(await page.$eval('.nova-preview-job',e=>e.textContent),/近岗位/);
 await page.click('[data-action="preview-greeting"]');await page.waitForFunction(()=>window.__pacing.state().bossPacingMessage.includes('进入下一岗位前等待'));
 await page.evaluate(()=>{const dialog=document.createElement('div');dialog.setAttribute('role','alert');dialog.textContent='异常登录，请完成安全验证';document.body.append(dialog);});
 await page.waitForFunction(()=>!window.__pacing.state().previewing);
 assert.equal(await page.evaluate(()=>window.nativeClicks.length),1,'异常登录后不再点击下一岗位');
 assert.ok(await page.evaluate(()=>[...window.__stored.keys()].some(key=>key.endsWith(':boss-platform-pause'))));
 assert.ok(!requests.some(path=>/wapi|chat\/completions/.test(path)));assert.deepEqual(errors,[]);
 console.log('真实计时浏览器验证通过：岗位之间随机抽中2秒按真实计时执行、等待可取消、下一岗位匹配后预览、异常登录立即停止；零BOSS接口直连、零AI、零消息。');
}finally{await browser.close()}
