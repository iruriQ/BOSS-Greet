import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {fixtureJob} from './helpers.mjs';
import {facts,draft,short} from './target-length-fixtures.mjs';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage(),requests=[],errors=[];
 await page.setViewport({width:1200,height:1000});
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',r=>{
  const path=new URL(r.url()).pathname;requests.push(path);
  if(path==='/web/geek/job')return r.respond({status:200,contentType:'text/html',body:'<html><body><div class="job-card-wrapper"><div class="job-name">业务支持</div><div class="company-name">虚构公司</div><span>今日活跃</span></div></body></html>'});
  if(path==='/wapi/zpgeek/job/card.json')return r.respond({status:200,contentType:'application/json',body:JSON.stringify({code:0,zpData:{jobCard:{postDescription:'协助日常业务支持。',activeTimeDesc:'今日活跃',encryptUserId:fixtureJob.encryptBossId}}})});
  return r.respond({status:404,body:'Blocked by isolated test'});
 });
 await page.goto('https://www.zhipin.com/web/geek/job');
 await page.evaluate(({job,facts,draft,short})=>{
  document.querySelector('.job-card-wrapper').__vue__={data:job};
  const values=new Map();const profile={bossPersonalizedGreeting:true,bossGreetingMode:'ai',bossGreetingUseAI:true,bossGreetingMaxLength:300,
   candidateExperience:'三年工作经验',candidateProfile:facts.join('\n'),candidateProfileSource:'boss',greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'};
  window.GM_getValue=(k,v)=>values.get(k)??(k.endsWith(':config')?profile:v);window.GM_setValue=(k,v)=>values.set(k,v);
  window.prompt=()=> 'FICTIONAL_ONLY_NOT_A_SECRET';window.__replies=[short,draft,{verdict:'pass',majorErrors:[],suggestions:[]}];window.__ai=[];
  window.GM_xmlhttpRequest=o=>{
   if(!o.data){o.onerror();return;}window.__ai.push(JSON.parse(o.data));
   const reply=window.__replies.shift();o.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}]})});
  };
 },{job:fixtureJob,facts,draft,short});
 const source=(await readFile(new URL('../boss-auto-apply.user.js',import.meta.url),'utf8')).replace('"use strict";','"use strict";waitForBossOperation=async()=>{};waitForBossJobGap=async()=>{};window.__target={state:()=>state,config:()=>config,authorize:assertBossGreetingAuthorized};');
 await page.addScriptTag({content:source});await page.waitForSelector('[name=bossGreetingMaxLength]');
 assert.match(await page.$eval('[name=bossGreetingMaxLength]',e=>e.closest('.nova-field').textContent),/目标字数.*至少 200 字/);
 await page.$eval('[name=greetingAIEndpoint]',e=>{e.closest('details').open=true});await page.click('[data-action=set-greeting-key]');
 await page.click('[data-action=preview-greeting]');await page.waitForFunction(()=>window.__target.state().lastGreeting?.proofread?.status==='passed'&&!window.__target.state().previewing);
 const text=await page.$eval('.aj-preview',e=>e.textContent);assert.equal(text,draft.text);assert.ok(Array.from(text).length>=200&&Array.from(text).length<=300);
 const calls=await page.evaluate(()=>window.__ai);assert.equal(calls.length,3);assert.match(JSON.parse(calls[1].messages[1].content).feedback,/最低 200 字/);
 assert.equal(JSON.parse(calls[0].messages[1].content).jobDescriptionLimited,true);
 await page.$eval('[name=bossGreetingMaxLength]',e=>{e.value='450';e.dispatchEvent(new Event('input',{bubbles:true}))});
 assert.match(await page.$eval('[name=bossGreetingMaxLength]',e=>e.closest('.nova-field').textContent),/至少 300 字/);
 await page.$eval('[name=bossGreetingMaxLength]',e=>{e.value='300';e.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.evaluate(short=>{window.__replies=[short,short]},short);await page.click('[data-action=preview-greeting]');
 await page.waitForFunction(()=>window.__target.state().greetingPreviewError.includes('最低 200 字')&&!window.__target.state().previewing);
 assert.equal(await page.evaluate(()=>window.__target.state().lastGreeting?.proofread?.status==='passed'),false);
 const blocked=await page.evaluate(short=>{try{window.__target.authorize(short.text,{status:'passed',reviewedText:short.text,checks:['facts']},window.__target.config());return false}catch{return true}},short);
 assert.equal(blocked,true);assert.ok(!requests.some(p=>/friend\/add|\/chat|greeting\//.test(p)));assert.deepEqual(errors,[]);
 console.log('目标字数浏览器验证通过：300对应至少200、短稿补亮点后一次核验、稀疏JD、450动态下限、短稿不冒充核验通过、发送前再次拦截；零真实岗位、模型或消息请求。');
}finally{await browser.close()}
