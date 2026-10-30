import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {fixtureJob} from './helpers.mjs';
import {facts} from './target-length-fixtures.mjs';
import {personalProfile} from './personal-workflow-fixtures.mjs';
import {applyBuildVariant} from '../scripts/build-variant.mjs';

// Synthetic personal build, fresh headless profile, all outbound requests blocked.
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage(),requests=[],errors=[];
 let description='采购询价、报价与交期核对';
 await page.setViewport({width:1200,height:1000});
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',r=>{
  const path=new URL(r.url()).pathname;requests.push(path);
  if(path==='/web/geek/job')return r.respond({status:200,contentType:'text/html',body:'<html><body><div class="job-card-wrapper"><div class="job-name">业务支持</div><div class="company-name">虚构公司</div><span>今日活跃</span></div></body></html>'});
  if(path==='/wapi/zpgeek/job/card.json')return r.respond({status:200,contentType:'application/json',body:JSON.stringify({code:0,zpData:{jobCard:{postDescription:description,activeTimeDesc:'今日活跃',encryptUserId:fixtureJob.encryptBossId}}})});
  return r.respond({status:404,body:'Blocked by isolated test'});
 });
 await page.goto('https://www.zhipin.com/web/geek/job');
 await page.evaluate(({job,profile,facts})=>{
  document.querySelector('.job-card-wrapper').__vue__={data:job};
  const values=new Map();const settings={bossPersonalizedGreeting:true,bossGreetingMode:'ai',bossGreetingUseAI:true,bossGreetingMaxLength:300,
   candidateExperience:profile.experience,candidateProfile:profile.profile,candidateIntro:profile.intro,
   greetingWorkflowVersion:2,greetingAIEndpoint:'https://model.example/chat/completions',greetingAIModel:'mock'};
  window.GM_getValue=(k,v)=>values.get(k)??(k.endsWith(':config')?settings:v);window.GM_setValue=(k,v)=>values.set(k,v);
  window.prompt=()=> 'FICTIONAL_ONLY_NOT_A_SECRET';window.__ai=[];
  window.GM_xmlhttpRequest=o=>{
   if(!o.data){o.onerror();return;}const body=JSON.parse(o.data);window.__ai.push(body);const input=JSON.parse(body.messages[1].content);
   const workflow=input.candidateFacts.find(f=>f.aiWorkflow);
   const result=Object.hasOwn(input,'greeting')?{verdict:'pass',majorErrors:[],suggestions:[]}:{
    text:'您好，我有三年工作经验。'+facts.slice(0,2).join('').replace('，不负责独立审批','')+workflow.text+'期待与您进一步交流。',
    evidenceIds:['E1','E2',workflow.id],
   };
   o.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})});
  };
 },{job:fixtureJob,profile:personalProfile,facts});
 const source=await readFile(new URL('../boss-auto-apply.user.js',import.meta.url),'utf8');
 const end=source.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length;
 const variant=applyBuildVariant(source.slice(0,end),source.slice(end),personalProfile);
 const script=(variant.header+variant.config).replace('"use strict";','"use strict";waitForBossOperation=async()=>{};waitForBossJobGap=async()=>{};window.__workflow={state:()=>state,config:()=>config};');
 await page.addScriptTag({content:script});await page.waitForSelector('[name=bossGreetingMaxLength]');
 assert.equal(await page.$('[name=bossGreetingIncludeAI]'),null);
 assert.match(await page.$eval('[data-card=greeting]',e=>e.textContent),/每条定制话术按岗位职责选择/);
 await page.$eval('[name=greetingAIEndpoint]',e=>{e.closest('details').open=true});await page.click('[data-action=set-greeting-key]');
 for(const [i,text,id] of [[0,'采购询价、报价与交期核对','W3'],[1,'合同条款核对与修订','W1'],[2,'客户档案与合作方资料汇总','W2'],[3,'产品上线物料图片交付','W4'],[4,'办公室会议安排','W5']]) {
  description=text;
  await page.evaluate(({job,i})=>{document.querySelector('.job-card-wrapper').__vue__.data={...job,encryptJobId:'scenario-'+i};}, {job:fixtureJob,i});
  await page.click('[data-action=preview-greeting]');
  await page.waitForFunction(()=>window.__workflow.state().lastGreeting?.proofread?.status==='passed'&&!window.__workflow.state().previewing);
  const recent=await page.evaluate(()=>window.__ai.slice(-2));assert.equal(recent.length,2);
  const generation=JSON.parse(recent[0].messages[1].content),review=JSON.parse(recent[1].messages[1].content);
  assert.deepEqual(generation.candidateFacts.filter(f=>f.aiWorkflow).map(f=>f.id),[id]);
  assert.ok(review.candidateFacts.some(f=>f.id===id));
  const output=await page.$eval('.aj-preview',e=>e.textContent);assert.ok(output.includes('AI'));assert.ok(output.length>=200&&output.length<=300);
 }
 assert.equal(await page.evaluate(()=>window.__ai.length),10);
 assert.ok(!requests.some(path=>/friend\/add|\/chat|greeting\//.test(path)));assert.deepEqual(errors,[]);
 console.log('个人版模拟浏览器验证通过：四类招聘职责及通用回退、每条保留相关AI案例、300字范围、每个岗位两次模型调用；通用版不变，零真实平台或模型请求。');
} finally {await browser.close()}
