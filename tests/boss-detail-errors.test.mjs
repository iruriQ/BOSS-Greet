import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob } from './helpers.mjs';

test('岗位接口保留 HTTP 和业务错误；验证/限流立即停止预览', async () => {
  for (const response of [
    {ok:true,status:200,text:async()=>JSON.stringify({code:37,message:'您的环境存在异常.'})},
    {ok:false,status:403,text:async()=>JSON.stringify({code:37,message:'请完成验证'})},
    {ok:true,status:200,text:async()=>JSON.stringify({code:1001,message:'访问频繁'})},
  ]) {
    const h = harness(['06-boss.js']);
    h.context.fetch = async () => response;
    await assert.rejects(h.run('fetchBossJobDetail('+JSON.stringify(fixtureJob)+')'), error => {
      assert.equal(error.stopPreview,true);
      assert.match(error.message,/岗位卡片接口 HTTP/);
      assert.match(error.message,/code=/);
      return true;
    });
  }
});
test('完整详情使用当前页面 token 和时间戳，token 不持久化，不修改沟通接口请求头',async()=>{
  const requests=[];
  const h=harness(['06-boss.js'],{unsafeWindow:{_PAGE:{token:'fixture-page-token|metadata'}},fetch:async(url,options)=>{
    requests.push({url,options});return{ok:true,status:200,text:async()=>JSON.stringify({code:0,zpData:{jobCard:{postDescription:'商务合同'}}})};
  }});
  await h.run('fetchBossJobDetail('+JSON.stringify(fixtureJob)+')');
  assert.equal(requests[0].options.headers.token,'fixture-page-token');
  assert.equal(new URL(requests[0].url,'https://www.zhipin.com').searchParams.has('_'),true);
  assert.equal(h.run('buildBossHeaders().token'),undefined);
  assert.equal(JSON.stringify([...h.values]).includes('fixture-page-token'),false);
});
test('HTML 验证页不能被误当作正常岗位，日志不包含返回页面原文', async () => {
  const h = harness(['06-boss.js'], {fetch:async()=>({ok:true,status:200,text:async()=>'<html>private-page-content</html>'})});
  await assert.rejects(h.run('fetchBossJobDetail('+JSON.stringify(fixtureJob)+')'), error=>{
    assert.match(error.message,/不是岗位 JSON/);
    assert.doesNotMatch(error.message,/private-page-content/);
    return true;
  });
});
test('成功的岗位 JSON 读取以及完整详情错误来源可区分', async()=>{
  const h=harness(['06-boss.js']);const paths=[];
  h.run("config.bossGreetingEnabled=false;config.includeDescriptionKeywords=[];config.excludeDescriptionKeywords=[];config.bossDistanceEnabled=false");
  h.context.fetch=async path=>{paths.push(path);return {ok:true,status:200,text:async()=>JSON.stringify({code:0,zpData:{jobCard:{postDescription:'合同管理'}}})};};
  assert.equal((await h.run('fetchBossJobDetail('+JSON.stringify(fixtureJob)+')')).postDescription,'合同管理');
  assert.equal(paths.length,1);
  h.run("config.includeDescriptionKeywords=['合同']");
  h.context.fetch=async path=>({ok:true,status:200,text:async()=>JSON.stringify(path.includes('/card.json')?{code:0,zpData:{jobCard:{jobName:'测试'}}}:{code:8,message:'详情不可用'})});
  await assert.rejects(h.run('fetchBossJobDetail('+JSON.stringify(fixtureJob)+')'),/岗位完整详情接口 HTTP 200，code=8：详情不可用/);
});
test('正式筛选遇到 BOSS 环境异常立即停止，不发送也不继续读取其他岗位',async()=>{
  const h=harness(['05-runner.js','06-boss.js']);h.context.job=fixtureJob;
  h.context.adapter={id:'boss',fetchDetail:async()=>{const e=Error('code=37：您的环境存在异常');e.stopPreview=true;throw e;}};
  h.run("config.fetchDetail=true;state.running=true;applyWithAutoRecovery=async()=>{throw Error('不应发送')}");
  await h.run('handleOneJob(job,adapter)');
  assert.equal(h.run('state.stopping'),true);assert.equal(h.run('state.submitted'),0);
  assert.match(h.run('state.current'),/岗位读取受限/);
});
