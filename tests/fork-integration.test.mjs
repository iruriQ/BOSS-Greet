import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob} from './helpers.mjs';
const files=['01-adapters.js','04-panel.js','05-runner.js','06-boss.js','06-boss-pagination.js','06-boss-greeting.js','07-liepin.js','08-zhaopin.js','10-qiancheng.js','11-shixiseng.js'];

test('合并后五个平台仍分别识别，BOSS 距家筛选与原有投递适配同时存在',()=>{
  const h=harness(files);
  for(const [host,id] of [['www.zhipin.com','boss'],['www.liepin.com','liepin'],['www.zhaopin.com','zhaopin'],['we.51job.com','qiancheng'],['www.shixiseng.com','shixiseng']]){
    h.context.location.hostname=host;
    assert.equal(h.run('getAdapter().id'),id);
    assert.equal(h.run('typeof getAdapter().apply'),'function');
  }
  assert.equal(h.run('getDailyLimit(ADAPTERS.qiancheng)'),100);
  assert.equal(h.run('typeof filterBossHomeDistance'),'function');
  assert.equal(h.run('typeof ADAPTERS.shixiseng.createApplySession'),'function');
});

test('问候和实习僧配置在规范化及保存后保留完整选项值（实际控件另经浏览器验证）',()=>{
  const h=harness(files);
  h.run('saveConfig({...config,greetingOpening:"你好",shixisengDays:"3天",shixisengResume:"attach"},true);config=loadConfig()');
  assert.equal(h.run('config.greetingOpening'),'你好');
  assert.equal(h.run('config.shixisengDays'),'3天');
  assert.equal(h.run('config.shixisengResume'),'attach');
});

test('BOSS 收到 JD，实习僧收到本轮投递窗口，避免合并后参数串用',async()=>{
  for(const id of ['boss','shixiseng']){
    const h=harness(files);h.context.job={...fixtureJob,platform:id};
    h.run('config.bossGreetingMode="ai";applyFilters=()=>({ok:true});sleepHumanDelay=async()=>{};safeFetchJobDetail=async()=>({postDescription:"示例JD"});');
    h.context.session={windowMarker:'demo-session'};
    let argument;
    h.context.adapter={id,apply:async(_job,value)=>{argument=value;return {skipped:true,message:'仅检查参数'}}};
    await h.run('handleOneJob(job,adapter,session)');
    if(id==='boss')assert.equal(argument.postDescription,'示例JD');
    else assert.equal(argument,h.context.session);
    assert.equal(h.run('state.applied'),0);
  }
});

test('实习僧投递窗口在一轮结束及异常时关闭，保留 fork 的窗口生命周期',async()=>{
  for(const fail of [false,true]){
    const h=harness(files);let opened=0,closed=0;
    const session={windowMarker:'demo-session'};
    h.context.adapter={id:'shixiseng',isListPage:()=>true,ensureLogin:()=>({ok:true}),createApplySession:()=>{opened++;return session;},closeApplySession:value=>{assert.equal(value,session);closed++;}};
    h.context.fail=fail;h.context.session=session;
    h.run('getAdapter=()=>adapter;notify=()=>{};runApplyLoop=async(a,s)=>{if(s!==session)throw Error("窗口参数错误");if(fail)throw Error("模拟异常");};');
    if(fail)await assert.rejects(h.run('startApply()'),/模拟异常/);
    else await h.run('startApply()');
    assert.equal(opened,1);assert.equal(closed,1);
    assert.equal(h.run('state.running'),false);
  }
});
