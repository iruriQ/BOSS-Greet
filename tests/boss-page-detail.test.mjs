import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob} from './helpers.mjs';
function setup(){
  const h=harness(['06-boss.js']);let clicks=0;
  const view={currentJob:{encryptJobId:'old'},jobDetail:{jobInfo:{encryptId:'old',postDescription:'旧岗位'}},jobDetailLoading:false};
  const card={__vue__:{$parent:view},click(){clicks++;view.currentJob={encryptJobId:fixtureJob.encryptJobId};view.jobDetailLoading=true;}};
  h.context.job={...fixtureJob,card};h.context.view=view;
  h.context.sleep=async()=>{view.jobDetailLoading=false;view.jobDetail={jobInfo:{encryptId:fixtureJob.encryptJobId,postDescription:'当前岗位合同管理'},bossInfo:{bossOnline:true,activeTimeDesc:'今日活跃'}};};
  return {...h,view,clicks:()=>clicks};
}
test('现代列表通过原生卡片加载详情，只读取匹配岗位，不再直接调用详情接口',async()=>{
  const h=setup();const detail=await h.run('fetchBossJobDetail(job)');
  assert.equal(detail.postDescription,'当前岗位合同管理');assert.equal(h.clicks(),1);assert.equal(h.calls.length,0);
  assert.equal(h.run('getBossRecruiterOnline(job,view.jobDetail)'),true);
  await h.run('fetchBossJobDetail(job)');assert.equal(h.clicks(),1,'已加载且身份相符的详情直接复用');
});
test('详情仍属于另一个岗位时不能生成预览，超时停止且不回退到直接请求',async()=>{
  const h=setup();h.context.sleep=async()=>{h.view.jobDetailLoading=false;};
  await assert.rejects(h.run('fetchBossJobDetail(job)'),e=>{assert.equal(e.stopPreview,true);assert.match(e.message,/网页未能加载/);return true;});
  assert.equal(h.clicks(),1);assert.equal(h.calls.length,0);
});
test('外层容器没有点击事件时，点击内部真实岗位卡片而非外壳',async()=>{
  const h=setup();let innerClicks=0;
  h.context.job.card.click=()=>{throw Error('不能点击外壳')};
  h.context.job.card.querySelector=selector=>{assert.equal(selector,'.job-card-box, .job-card-body');return{click(){innerClicks++;h.view.currentJob={encryptJobId:fixtureJob.encryptJobId};h.view.jobDetailLoading=true;}};};
  const detail=await h.run('fetchBossJobDetail(job)');assert.equal(innerClicks,1);assert.equal(detail.postDescription,'当前岗位合同管理');assert.equal(h.calls.length,0);
});
test('用户停止或网页进入验证流程时停止等待，不调用任何额外接口',async()=>{
  const h=setup();h.run('state.stopping=true');await assert.rejects(h.run('fetchBossJobDetail(job)'),/已停止/);
  assert.equal(h.calls.length,0);
  const k=setup();k.context.location.pathname='/web/geek/safe-validate';
  await assert.rejects(k.run('fetchBossJobDetail(job)'),e=>e.stopPreview===true);assert.equal(k.calls.length,0);
});
