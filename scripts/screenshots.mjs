import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {facts as demoFacts,draft as demoDraft} from '../tests/target-length-fixtures.mjs';

// 仅启动隔离浏览器。所有页面、API 与模型回复均在本机模拟，拒绝其他请求。
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=await readFile(resolve(root,'scripts/fixtures/screenshot-page.html'),'utf8');
const source=await readFile(resolve(root,'boss-auto-apply.user.js'),'utf8');
const output=resolve(root,'images');
await mkdir(output,{recursive:true});
const job={jobName:'数据运营专员',brandName:'示例数科',salaryDesc:'8-12K',encryptJobId:'demo-job',encryptBossId:'demo-boss',securityId:'demo-security',lid:'demo-list',activeTimeDesc:'今日活跃'};
const description='使用Excel和SQL整理、清洗业务数据，维护统计口径；制作经营分析报表，保证数据准确、更新及时；与业务团队核对异常数据，跟进问题处理进度。有数据整理、业务支持或相关工作经验，熟悉Excel与SQL，有良好的沟通与协作习惯。';
const profile={bossGreetingMode:'ai',candidateIntro:'我主要从事数据整理与业务支持工作。',candidateExperience:'三年工作经验',candidateProfile:demoFacts.join('\n'),bossGreetingMaxLength:300,greetingAIEndpoint:'https://api.example.com/v1/chat/completions',greetingAIModel:'example-model',bossGreetingUseAI:true,bossGreetingIncludeAI:true,bossGreetingPreviewOnly:true,greetingWorkflowVersion:2};
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:1100,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:"prefers-reduced-motion",value:"reduce"}]);
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',async request=>{
    const url=new URL(request.url());requests.push(url.pathname);
    if(url.origin==='https://www.zhipin.com'&&url.pathname==='/web/geek/jobs') return request.respond({status:200,contentType:'text/html',body:html});
    if(url.origin==='https://www.zhipin.com'&&url.pathname==='/wapi/zpgeek/job/card.json') return request.respond({status:200,contentType:'application/json',body:JSON.stringify({code:0,zpData:{jobCard:{postDescription:description,activeTimeDesc:'今日活跃',encryptUserId:job.encryptBossId}}})});
    return request.respond({status:404,body:'Not available in screenshot demo'});
  });
  await page.goto('https://www.zhipin.com/web/geek/jobs');
  await page.evaluate(({job,profile,demoDraft})=>{
    document.cookie='bst=demo-only';
    const card=document.querySelector('.job-card-wrapper');card.__vue__={data:job};
    card.parentElement.__vue__={jobList:[job],hasMore:false,moreLoading:false,loading:false,pageVo:{page:1}};
    const stored=new Map();
    window.GM_getValue=(key,fallback)=>stored.get(key)??(key.endsWith(':config')?profile:key.endsWith(':ui')?{expanded:true}:fallback);
    window.GM_setValue=(key,value)=>stored.set(key,value);
    window.GM_notification=()=>{};
    window.prompt=()=> 'DEMO_ONLY_NOT_A_REAL_KEY';
    window.__demoAIRequests=[];
    window.GM_xmlhttpRequest=options=>{
      if(!options.data) { options.onerror(); return; } // GitHub update checks stay offline.
      const body=JSON.parse(options.data);window.__demoAIRequests.push(body);
      const isGeneration=body.messages[0].content.includes('一次完成挑选真实经历和撰写');
      const content=isGeneration?demoDraft:{verdict:'pass',majorErrors:[],suggestions:[]};
      options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]})});
    };
  },{job,profile,demoDraft});
  await page.addScriptTag({content:source});
  await page.waitForSelector('[name="candidateProfile"]');
  await page.$eval('[name="greetingAIEndpoint"]',el=>{el.closest('details').open=true;});
  await page.click('[data-action="set-greeting-key"]');
  await page.click('[data-action="preview-greeting"]');
  await page.waitForFunction(()=>document.querySelector('.aj-preview-box')?.textContent.includes('重大事实核验通过'),{timeout:10000});
  assert.match(await page.$eval('.aj-preview',el=>el.textContent),/^您好，.*三年工作经验.*Excel/s);
  const previewLength=await page.$eval('.aj-preview',el=>Array.from(el.textContent).length);
  assert.ok(previewLength>=200 && previewLength<=300);
  assert.match(await page.$eval('.aj-preview-box',el=>el.textContent),/AI 定制生成.*重大事实核验通过/s);
  assert.equal(requests.some(path=>/friend\/add|chat|message-accepted/.test(path)),false);
  assert.equal(await page.evaluate(()=>window.__demoAIRequests.length),2);
  await page.evaluate(()=>{const content=document.querySelector('.nova-content'),preview=document.querySelector('[data-card="preview"]');content.scrollTop+=preview.getBoundingClientRect().top-content.getBoundingClientRect().top-12;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await (await page.$('.nova-card-preview')).screenshot({path:resolve(output,'demo-greeting-preview.png')});
  // Default fixed mode uses the real confirmation/preview flow and calls no model.
  await page.select('[name="bossGreetingMode"]','fixed');
  await page.waitForSelector('[name="bossFixedGreeting"]');
  await page.$eval('[name="bossFixedGreeting"]',el=>{
    el.value='您好！我对贵公司的招聘岗位很感兴趣，希望进一步了解工作内容与任职要求，期待与您沟通。';
    el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.click('[name="bossFixedGreetingConfirmed"]');
  await page.click('[data-action="preview-greeting"]');
  await page.waitForFunction(()=>document.querySelector('.aj-preview-box')?.textContent.includes('用户已确认原文'));
  assert.equal(await page.evaluate(()=>window.__demoAIRequests.length),2);
  await page.click('[data-nav="greeting"]');
  await (await page.$('[data-card="greeting"] .nova-card')).screenshot({path:resolve(output,'demo-configuration.png')});
  await page.click('[data-nav="filters"]');
  await (await page.$('[data-boss-nova]')).screenshot({path:resolve(output,'demo-nova-workbench.png')});
  assert.deepEqual(errors,[]);
  console.log('已生成三张演示截图：工作台、固定话术配置、AI 话术预览。真实面板与生成流程，虚构岗位和经历，模拟AI回复；全部请求均被拦截，零真实发送。');
} finally { await browser.close(); }
