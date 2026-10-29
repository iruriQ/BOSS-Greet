import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,fixtureJob} from './helpers.mjs';
function setup(responses){
 const calls=[];
 const h=harness(['05-runner.js','06-boss.js','06-boss-greeting.js'],{fetch:async(path,options)=>{
  calls.push({path,...options});const data=responses.shift();if(data instanceof Error)throw data;
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 }},{bossGreetingGuard:true});
 h.context.job={...fixtureJob};h.context.detail={};
 h.run(`config=normalizeConfig({...config,bossPersonalizedGreeting:true,bossGreetingPreviewOnly:false,bossGreetingMode:'fixed',bossFixedGreeting:'您好，期待沟通。',bossFixedGreetingConfirmed:true,bossFixedGreetingConfirmedText:'您好，期待沟通。'});
 state.running=true;let opened=0,sent=0;function getHistoryKey(){return 'ownership-history'};
 openBossConversation=async()=>{opened++;return {ok:true}};
 sendBossGreetingInChat=async()=>{sent++;return {confirmed:true}};`);
 return {...h,calls};
}
const setting=status=>({code:0,zpData:{greeting:{status,templateId:'custom-42'}}});
test('开聊前关闭原生自动招呼并重新读取确认，仅修改开关、保留模板',async()=>{
 const h=setup([setting(1),{code:0},setting(0)]);
 assert.equal((await h.run('applyBossJob(job,detail)')).ok,true);
 assert.equal(h.calls.length,3);
 assert.equal(h.calls[1].path,'/wapi/zpchat/greeting/updateGreetingV2');
 assert.equal(h.calls[1].method,'POST');
 assert.deepEqual(Object.fromEntries(new URLSearchParams(h.calls[1].body)),{status:'0',templateId:'custom-42'});
 assert.equal(h.calls[1].headers['Content-Type'],'application/x-www-form-urlencoded');
 assert.equal(h.run('opened'),1);assert.equal(h.run('sent'),1);
});
test('原生已关闭只读取一次；每个岗位重新确认，不使用旧缓存',async()=>{
 const h=setup([setting(0),setting(0)]);
 assert.equal((await h.run('applyBossJob(job,detail)')).ok,true);
 h.context.job={...fixtureJob,encryptBossId:'boss-b',encryptJobId:'job-b'};
 assert.equal((await h.run('applyBossJob(job,detail)')).ok,true);
 assert.equal(h.calls.length,2);assert.ok(h.calls.every(x=>!x.method));
});
test('关闭失败、状态未知、登录错误及关闭后仍开启时均阻止开聊和发送',async()=>{
 for(const responses of [[new Error('network')],[{code:35}],[{code:0,zpData:{greeting:{status:9}}}],[setting(1),{code:1}],[setting(1),{code:0},setting(1)]]){
  const h=setup(responses);const result=await h.run('applyBossJob(job,detail)');
  assert.equal(result.ok,false);assert.ok(result.needsAttention||result.skipped);assert.equal(h.run('opened'),0);assert.equal(h.run('sent'),0);
  assert.equal(h.run('Object.keys(loadBossGreetingLedger()).length'),0);
 }
});
test('仅预览以及关闭助手发送时不读取或更改平台设置',async()=>{
 for(const preview of [true,false]){
  const h=setup([]);
  h.run(preview?'config.bossGreetingPreviewOnly=true':'config.bossPersonalizedGreeting=false');
  await h.run('applyBossJob(job,detail)');assert.equal(h.calls.length,0);
  assert.equal(h.run('sent'),0);assert.equal(h.run('opened'),preview?0:1);
 }
});
test('同一会话已有其他本人文字时阻止补发，普通对方消息不受影响',()=>{
 const h=setup([]);
 h.context.ownDoc={querySelectorAll:()=>[{querySelector:()=>({textContent:'BOSS默认招呼'})}]};
 assert.throws(()=>h.run('assertNoOtherBossGreeting(ownDoc)'),e=>e.code==='BOSS_GREETING_CONFLICT');
 h.context.vueDoc={querySelectorAll:()=>[{__vue__:{$parent:{message:{isSelf:true,text:'默认招呼'}}}}]};
 assert.throws(()=>h.run('assertNoOtherBossGreeting(vueDoc)'),e=>e.code==='BOSS_GREETING_CONFLICT');
 h.context.otherDoc={querySelectorAll:()=>[]};h.run('assertNoOtherBossGreeting(otherDoc)');
});
test('平台先发消息时保留已用额度及冲突记录，不误报助手已发送',async()=>{
 const h=setup([setting(0)]);
 h.run('sendBossGreetingInChat=async()=>{throw bossGreetingConflictError()}');
 const result=await h.run('applyBossJob(job,detail)');assert.equal(result.needsAttention,true);
 assert.equal(h.run('loadHistory().dailyCount'),1);
 assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].status'),'greeting-conflict');
 assert.equal(h.run('loadBossGreetingLedger()[job.encryptBossId].sendAttempted'),false);
});
