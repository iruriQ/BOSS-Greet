import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';

// 仅启动隔离浏览器。所有页面、API 与模型回复均在本机模拟，拒绝其他请求。
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=await readFile(resolve(root,'scripts/fixtures/screenshot-page.html'),'utf8');
const source=await readFile(resolve(root,'boss-auto-apply.user.js'),'utf8');
const output=resolve(root,'images');
await mkdir(output,{recursive:true});
const job={jobName:'数据运营专员',brandName:'示例数科',salaryDesc:'8-12K',encryptJobId:'demo-job',encryptBossId:'demo-boss',securityId:'demo-security',lid:'demo-list',activeTimeDesc:'今日活跃'};
const description='使用Excel和SQL整理、清洗业务数据，维护统计口径；制作经营分析报表，保证数据准确、更新及时；与业务团队核对异常数据，跟进问题处理进度。有数据整理、业务支持或相关工作经验，熟悉Excel与SQL，有良好的沟通与协作习惯。';
const profile={candidateIntro:'我主要从事数据整理与业务支持工作。',candidateExperience:'三年工作经验',candidateProfile:[
  '使用Excel与SQL清洗业务数据，制作经营分析报表。',
  '与业务团队核对数据口径，跟进异常问题的处理进度。',
  '使用AI辅助资料分类与文档初稿整理，并人工核对输出。',
].join('\n'),greetingAIEndpoint:'https://api.example.com/v1/chat/completions',greetingAIModel:'example-model',bossGreetingUseAI:true,bossGreetingIncludeAI:true,bossGreetingPreviewOnly:true,greetingWorkflowVersion:2};
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:1180,deviceScaleFactor:2});
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
  await page.evaluate(({job,profile})=>{
    document.cookie='bst=demo-only';
    const card=document.querySelector('.job-card-wrapper');card.__vue__={data:job};
    card.parentElement.__vue__={jobList:[job],hasMore:false,moreLoading:false,loading:false,pageVo:{page:1}};
    const stored=new Map();
    window.GM_getValue=(key,fallback)=>stored.get(key)??(key.endsWith(':config')?profile:fallback);
    window.GM_setValue=(key,value)=>stored.set(key,value);
    window.GM_notification=()=>{};
    window.prompt=()=> 'DEMO_ONLY_NOT_A_REAL_KEY';
    window.__demoAIRequests=[];
    window.GM_xmlhttpRequest=options=>{
      const body=JSON.parse(options.data);window.__demoAIRequests.push(body);
      const isSelection=!body.messages[0].content.includes('校对员');
      const content=isSelection?{evidenceIds:['E1','E2'],style:'interest'}:{verdict:'pass',checks:{typos:true,grammar:true,wording:true,facts:true,relevance:true},issues:[],edits:[]};
      options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]})});
    };
  },{job,profile});
  await page.addScriptTag({content:source});
  await page.waitForSelector('[name="candidateProfile"]');
  await page.evaluate(()=>{
    const distance=document.querySelector('[name="bossMaxDistanceKm"]').closest('details');distance.open=false;
    const service=document.querySelector('[name="greetingAIEndpoint"]').closest('details');service.open=true;
  });
  await page.click('[data-action="set-greeting-key"]');
  // renderPanel 重绘后，通过原生 disclosure 状态展示配置，面板样式不作修改。
  await page.evaluate(()=>{
    document.querySelector('[name="bossMaxDistanceKm"]').closest('details').open=false;
    document.querySelector('[name="greetingAIEndpoint"]').closest('details').open=true;
    const section=document.querySelector('[name="candidateProfile"]').closest('details');
    const body=document.querySelector('.aj-body');body.scrollTop+=section.getBoundingClientRect().top-body.getBoundingClientRect().top;
  });
  await page.screenshot({path:resolve(output,'demo-configuration.png')});
  await page.click('[data-action="start"]');
  await page.waitForFunction(()=>document.querySelector('.aj-logs')?.textContent.includes('任务结束：扫描 1'),{timeout:30000});
  assert.match(await page.$eval('.aj-preview',el=>el.textContent),/^您好，.*三年工作经验.*Excel与SQL/);
  assert.doesNotMatch(await page.$eval('.aj-preview',el=>el.textContent), /采购跟进/);
  assert.match(await page.$eval('.aj-preview-box',el=>el.textContent),/AI 语义匹配.*校对通过/s);
  assert.match(await page.$eval('.aj-logs',el=>el.textContent),/预览 1，成功 0/);
  assert.equal(requests.some(path=>/friend\/add|chat|message-accepted/.test(path)),false);
  assert.equal(await page.evaluate(()=>window.__demoAIRequests.length),2);
  await page.evaluate(()=>{
    document.querySelector('#stage-kicker').textContent='02 / 按岗匹配与校对';
    document.querySelector('#stage-title').textContent='同一份经历，回应当前岗位的具体需求';
    document.querySelector('#stage-subtitle').textContent='读取 Excel、SQL 与报表要求，选择相关经历，保留问候和真实年限。';
    document.querySelector('#stage-label').textContent='话术预览 · 仅预览，未发送';
    document.querySelector('#stage-note').innerHTML='<strong>预览结果由当前项目的生成与校对流程输出</strong>本演示使用模拟模型回复来复现流程，不代表真实 AI 服务的校对能力；未连接真实账号、未发送消息。';
    document.querySelector('[name="bossMaxDistanceKm"]').closest('details').open=false;
    document.querySelector('[name="candidateProfile"]').closest('details').open=false;
    document.querySelector('.aj-body').scrollTop=0;
  });
  await page.screenshot({path:resolve(output,'demo-greeting-preview.png')});
  assert.deepEqual(errors,[]);
  console.log('已生成两张演示截图：images/demo-configuration.png、images/demo-greeting-preview.png。真实面板与生成流程，虚构岗位和经历，模拟AI回复；全部请求均被拦截，零真实发送。');
} finally { await browser.close(); }
