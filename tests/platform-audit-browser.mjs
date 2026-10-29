import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

// Isolated fake sites only. Every navigation and API request is intercepted.
// These checks do NOT certify compatibility with a logged-in production account.
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
const originalBundle = await readFile(new URL('../boss-auto-apply.user.js', import.meta.url),'utf8');
const auditedVersion = originalBundle.match(/@version\s+(\S+)/)?.[1] || 'unknown';
const bundleSHA256 = createHash('sha256').update(originalBundle).digest('hex');
const source = originalBundle.replace('"use strict";', `"use strict";window.__audit={
 adapter:()=>getAdapter(),config:()=>config,state:()=>state,jobs:()=>getAdapter().getCards().map((c,i)=>getAdapter().buildJob(c,i)).filter(Boolean),
 set:patch=>{saveConfig({...config,...patch},true);renderPanel()},filter:(job,detail)=>applyFilters(job,detail,getAdapter()),
 start:()=>startApply(),history:()=>loadHistory(),run:fn=>eval(fn),
 speed:()=>{sleep=async()=>{};sleepHumanDelay=async()=>{}}
};`);
const platforms = [
 ['boss','BOSS直聘','https://www.zhipin.com/web/geek/jobs'],
 ['liepin','猎聘','https://www.liepin.com/zhaopin/'],
 ['zhaopin','智联招聘','https://sou.zhaopin.com/'],
 ['qiancheng','前程无忧','https://we.51job.com/pc/search'],
 ['shixiseng','实习僧','https://www.shixiseng.com/interns'],
];
const report = { version:auditedVersion, bundleSHA256, scope:'强制注入通用构建的隔离模拟网站；零真实投递，不代表线上账号验证', rows:[], network:[] };
function markup(id) {
 return `<html lang="zh-CN"><head><link rel="icon" href="data:,"><style>body{font-family:system-ui;background:#f4f5ef}.fixture-card{width:450px;min-height:110px;margin:12px;padding:10px;border:1px solid #ccc}button{min-height:30px}.job-name,.job-title{font-size:18px}</style></head><body><h1>隔离模拟 · ${id} · 非真实岗位</h1><div id="app"></div><main id="fixtures">`+
 Array.from({length:6},(_,i)=> {
  const name=`运营支持${i}`, company='虚构示例公司';
  if(id==='boss')return `<div class="fixture-card job-card-wrapper" data-i="${i}"><div class="job-name">${name}</div><div class="company-name">${company}</div><span>在线</span></div>`;
  if(id==='liepin')return `<div class="fixture-card jobCardPcContainer" data-i="${i}" data-job-id="${7000+i}"><a href="/job/${7000+i}.shtml" class="job-title">${name}</a><div class="company-name">${company}</div><div class="recruiter-info">今日活跃</div><button>聊一聊</button></div>`;
  if(id==='zhaopin')return `<div class="fixture-card joblist-box__item" data-i="${i}"><a class="jobinfo__name" href="https://jobs.zhaopin.com/jobdetail/fixture-${i}.htm">${name}</a><span class="companyinfo__name">${company}</span><span class="companyinfo__staff-state">今日活跃</span><button class="apply-btn">立即投递</button></div>`;
  if(id==='qiancheng')return `<div class="fixture-card joblist-item" data-i="${i}"><span sensorsdata='{"jobId":"${i+1}","jobTitle":"${name}"}' class="jname">${name}</span><span class="cname">${company}</span><button class="btn apply">申请</button></div>`;
  return `<div class="fixture-card intern-item" data-i="${i}" data-intern-id="inn_fixture_${i}"><a href="/intern/inn_fixture_${i}">${name}</a><span class="intern-detail__company"><span class="title">${company}</span></span><span class="city">上海</span></div>`;
 }).join('')+'</main></body></html>';
}
async function record(row,label,fn) {
 try { const detail = await fn(); row.checks.push({ label,status:'pass',detail:detail??'' }); }
 catch(error) { row.checks.push({label,status:'fail',detail:error.message.split('\n').slice(0,4).join(' ')}); }
}
try {
 for(const [id,name,url] of platforms) {
  const page = await browser.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewport({width:1440,height:1000});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);
  page.on('request', request=> {
   report.network.push({platform:id,method:request.method(),path:new URL(request.url()).pathname,intercepted:true});
   return request.respond({status:200,contentType:'text/html',body:markup(id)});
  });
  await page.evaluateOnNewDocument(id=>{
   window.__values=new Map();
   const fixed='您好，期待了解此岗位的工作安排。';
   window.GM_getValue=(key,fallback)=>window.__values.get(key)??(key.endsWith(':config')?{
    bossGreetingMode:'fixed',bossPersonalizedGreeting:true,bossGreetingPreviewOnly:true,bossFixedGreeting:fixed,
    bossFixedGreetingConfirmed:true,bossFixedGreetingConfirmedText:fixed,maxApplyCount:2,
    shixisengResume:'online',autoRecoveryEnabled:false,
   }:fallback);
   window.GM_setValue=(key,value)=>window.__values.set(key,value);
   window.GM_notification=()=>{};
   window.GM_xmlhttpRequest=options=>options.onerror?.();
  },id);
  await page.goto(url);
  await page.evaluate(id=>{
   const root=document.querySelector('#app');
   root.__vue__={islogin:true,$children:[]};
   window.__INITIAL_STATE__={isLogged:true,user:{fake:true}};
   window.$nuxt={$store:{state:{isLogin:true}}};
   document.cookie='bst=isolated-test';
   document.querySelectorAll('[data-i]').forEach((card,i)=>{
    if(id==='boss')card.__vue__={data:{jobName:`运营支持${i}`,brandName:'虚构示例公司',securityId:`sec-${i}`,encryptJobId:`job-${i}`,encryptBossId:`boss-${i}`,lid:`lid-${i}`,bossOnline:true,brandScaleName:'100-499人'}};
    if(id==='zhaopin')card.__vue__={data:{jobId:i+1,name:`运营支持${i}`,companyName:'虚构示例公司',applyType:1,description:'合同资料整理与项目协调',hrOnline:true}};
    if(id==='shixiseng')card.__vue__={$options:{propsData:{itemData:{uuid:`inn_fixture_${i}`,name:`运营支持${i}`,cname:'虚构示例公司',info:'合同资料整理与项目协调'}}}};
   });
   if(id==='qiancheng')root.__vue__.$children=[{$options:{name:'PCSearch'},joblist:Array.from({length:6},(_,i)=>({jobId:i+1,jobName:`运营支持${i}`,companyName:'虚构示例公司',jobDescribe:'合同资料整理与项目协调',hrIsOnline:true}))}];
  },id);
  await page.addScriptTag({content:source});
  await page.waitForSelector('[name="maxApplyCount"]');
  const row={id,name,checks:[],supported:{},findings:[]};report.rows.push(row);
  await record(row,'识别平台、读取六张模拟岗位卡片',async()=>{
   const result=await page.evaluate(()=>({id:window.__audit.adapter().id,jobs:window.__audit.jobs().map(j=>({jobName:j.jobName,canApply:window.__audit.adapter().canApply(j)}))}));
   assert.equal(result.id,id);assert.equal(result.jobs.length,6);assert.ok(result.jobs.every(j=>j.canApply));return '已读取6个虚构岗位';
  });
  await record(row,'关键词或匹配、包含优先、排除独立生效',async()=>{
   const result=await page.evaluate(()=>{
    const a=window.__audit,j=a.jobs()[0],d={postDescription:'合同资料整理，电话销售'};
    a.set({includeDescriptionKeywords:['不存在','合同'],excludeDescriptionKeywords:['电话销售'],onlyOnlineBoss:false});
    const includeWins=a.filter(j,d).ok;
    a.set({includeDescriptionKeywords:[]});const excludes=a.filter(j,d).ok;
    a.set({includeDescriptionKeywords:[],excludeDescriptionKeywords:[]});
    return{includeWins,excludes};
   });assert.equal(result.includeWins,true);assert.equal(result.excludes,false);
  });
  await record(row,'移动窗口、调整宽高、保存本机布局',async()=>{
   const box=await (await page.$('[data-boss-nova]')).boundingBox();
   const handle=await (await page.$('[data-resize="se"]')).boundingBox();
   await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
   await page.mouse.move(handle.x+handle.width/2+380-box.width,handle.y+handle.height/2+600-box.height,{steps:6});await page.mouse.up();
   const header=await (await page.$('.nova-header')).boundingBox();
   await page.mouse.move(header.x+25,header.y+25);await page.mouse.down();await page.mouse.move(header.x+125,header.y+55,{steps:6});await page.mouse.up();
   const saved=await page.evaluate(()=>[...window.__values].find(([k])=>k.endsWith(':ui'))?.[1].windowBounds);
   assert.ok(saved);assert.ok(Math.abs(saved.width-380)<2);assert.ok(saved.x>90);return '鼠标拖动与缩放已保存';
  });
  row.supported=await page.evaluate(()=>({
   aiGreeting:!!document.querySelector('[name="bossGreetingMode"]'),fixedBossGreeting:!!document.querySelector('[name="bossFixedGreeting"]'),
   distance:!!document.querySelector('[name="bossDistanceEnabled"]'),companySize:!!document.querySelector('[name="bossCompanySizes"]'),
   preview:!!document.querySelector('[name="bossGreetingPreviewOnly"]'),resumeImport:window.__audit.adapter().id==='boss',
   liepinGreeting:!!document.querySelector('[name="liepinGreeting"]'),shixisengResume:!!document.querySelector('[name="shixisengResume"]')
  }));
  if(id==='shixiseng'){
   const online=await page.evaluate(()=>{
    const a=window.__audit,j=a.jobs()[0];a.set({onlyOnlineBoss:true});return{online:j.recruiterOnline,ok:a.filter(j,{postDescription:'合同'}).ok};
   });
   if(online.online&&online.ok)row.findings.push('未提供HR在线信息的模拟实习僧岗位仍被标记在线；仅在线筛选无实际筛除作用');
   await page.evaluate(()=>window.__audit.set({onlyOnlineBoss:false}));
  }
  if(id!=='boss'){
   const unknown=await page.evaluate(()=>{
    const a=window.__audit,j=a.jobs()[0];a.set({includeDescriptionKeywords:[],excludeDescriptionKeywords:['电话销售']});const value=a.filter(j,null);a.set({excludeDescriptionKeywords:[]});return value;
   });
   if(unknown.ok)row.findings.push('详情缺失时仍按列表摘要判断，可能漏掉详情里的排除词');
  }
  if(id==='zhaopin'){
   const fallback=await page.evaluate(()=>{const card=document.querySelector('.joblist-box__item').cloneNode(true);document.querySelector('#fixtures').append(card);try{window.__audit.adapter().buildJob(card,99);return{ok:true}}catch(e){return{ok:false,error:e.message}}finally{card.remove()}});
   if(!fallback.ok)row.findings.push(`卡片没有Vue岗位数据时构建失败：${fallback.error}`);
  }
  // Native adapter execution with DOM-only success evidence, no external API.
  if(id==='zhaopin'||id==='qiancheng') await record(row,'平台原有申请处理与结果确认（模拟按钮回执）',async()=>{
   const result=await page.evaluate(async()=>{
    const a=window.__audit;a.speed();const j=a.jobs()[0],button=j.card.querySelector('button');
    button.addEventListener('click',()=>button.textContent='已投递',{once:true});
    return a.adapter().apply(j);
   });assert.equal(result.ok,true,result.message);return result.message;
  });
  if(id==='liepin') await record(row,'猎聘原有固定招呼填写、发送与去重（模拟聊天回执）',async()=>{
   const result=await page.evaluate(async()=>{
    const a=window.__audit;a.speed();const root=document.createElement('div');root.id='im-c-entry';
    root.innerHTML='<section class="im-ui-chat-input"><textarea style="width:250px;height:80px"></textarea><button class="im-ui-basic-send-btn">发送</button></section><div class="messages"></div>';
    document.body.append(root);let sends=0;
    root.querySelector('button').onclick=()=>{sends++;const input=root.querySelector('textarea');const row=document.createElement('div');row.className='im-ui-message-item-send';row.textContent=input.value;root.querySelector('.messages').append(row);input.value=''};
    const first=await a.run('deliverLiepinGreetingInDocument(document,document.querySelector("#im-c-entry"))');
    const second=await a.run('deliverLiepinGreetingInDocument(document,document.querySelector("#im-c-entry"))');
    root.remove();return{first,second,sends};
   });assert.equal(result.first.ok,true,result.first.message);assert.equal(result.second.ok,true);assert.equal(result.sends,1);
  });
  if(id==='shixiseng')await record(row,'实习僧简历选择、到岗/实习/出勤设置及确认结果（模拟弹窗）',async()=>{
   const result=await page.evaluate(async()=>{
    const a=window.__audit;a.speed();a.set({shixisengResume:'online',shixisengReportTime:'1周内',shixisengInternshipTime:'3-6个月',shixisengDays:'5天'});
    const detail=document.createElement('div');detail.className='intern-detail-page';detail.innerHTML='<button class="resume_apply">投递</button><div class="common-deliver"></div><div class="deliver-dialog-box"><div class="common-deliver__footer"><button class="btn">确认投递</button></div></div>';document.body.append(detail);
    const dialog={show:false,deliverOptions:{can_deliver:true,resume:[{stype:'online',deliver_able:true}]}};
    const vm={msg:{delivered:0,overdue:0,intern_status:0},$store:{state:{isLogin:true}},$refs:{deliverintern:dialog}};detail.__vue__=vm;
    const common={chooseResume(r){this.chosen=r.stype},inOptions:[{label:'1周内'}],timeOptions:[{label:'3-6个月'}],olOptions:[{label:'5天'}]};detail.querySelector('.common-deliver').__vue__=common;
    detail.querySelector('.resume_apply').onclick=()=>{dialog.show=true};detail.querySelector('.btn').onclick=()=>{vm.msg.delivered=1;dialog.deliverResult='success'};
    const result=await a.adapter().apply(a.jobs()[0],{closed:false,location:{href:''},document});
    detail.remove();return{result,chosen:common.chosen,report:common.report_time,time:common.internship_time,days:common.days};
   });assert.equal(result.result.ok,true,result.result.message);assert.equal(result.chosen,'online');assert.equal(result.report,'1周内');assert.equal(result.time,'3-6个月');assert.equal(result.days,'5天');
  });
  await record(row,'同一运行引擎达到2个数量停止，跳过不计入，按平台隔离历史',async()=>{
   const result=await page.evaluate(async()=>{
    const a=window.__audit,adapter=a.adapter();a.speed();
    a.set({maxApplyCount:2,onlyOnlineBoss:false,bossPersonalizedGreeting:false,includeDescriptionKeywords:[],excludeDescriptionKeywords:[],bossDistanceEnabled:false,bossCompanySizes:[]});
    adapter.ensureLogin=()=>({ok:true});adapter.nextPage=async()=>false;adapter.fetchDetail=async()=>({postDescription:'合同资料整理'});
    adapter.createApplySession=()=>({isolated:true});adapter.closeApplySession=()=>{};
    let applied=0,calls=0;adapter.apply=async()=>{calls++;if(calls===1)return{ok:false,skipped:true,message:'模拟不匹配'};applied++;return{ok:true}};
    await a.start();return{calls,applied,count:a.history().dailyCount,state:a.state().current,running:a.state().running};
   });assert.equal(result.applied,2);assert.equal(result.calls,3);assert.equal(result.count,2);assert.equal(result.running,false);assert.match(result.state,/达到设定数量 2/);
  });
  await record(row,'界面无未捕获异常',()=>assert.deepEqual(errors,[]));
  console.log(name+': '+row.checks.filter(c=>c.status==='pass').length+'/'+row.checks.length+'，发现问题 '+row.findings.length);
  await page.close();
 }
 const reportPath = `/tmp/boss-platform-audit-${auditedVersion}.json`;
 await writeFile(reportPath,JSON.stringify(report,null,2));
 console.log(`报告：${reportPath}；全部网络由测试拦截，未触达真实投递或模型服务。`);
 if(report.rows.some(row=>row.checks.some(c=>c.status==='fail')))process.exitCode=1;
} finally {await browser.close()}
