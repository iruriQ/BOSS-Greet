import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob } from './helpers.mjs';

function setup({hasMore=true,loading=false,known=true,onSleep}={}) {
  const root={scrollHeight:1000,clientHeight:100,scrollTop:900,parentElement:null};
  const view={jobList:[],hasMore,moreLoading:loading,loading:false,pageVo:{page:8}};
  const fixture={cards:[],logs:[],polls:0,scrolls:0,events:0};
  function add(id) { fixture.cards.push({job:{...fixtureJob,encryptJobId:id,lid:id,securityId:id},__vue__:known?view:null,parentElement:root}); }
  add('job-a');
  const h=harness(['05-runner.js','06-boss.js','06-boss-pagination.js'],{
    document:{documentElement:root,scrollingElement:root,querySelector:()=>null},
  });
  Object.assign(h.context.window,{
    scrollY:900,innerHeight:100,Event:class {constructor(type){this.type=type;}},
    getComputedStyle:()=>({overflowY:'visible'}),
    scrollTo(){fixture.scrolls++;}, // 已到底，故滚动位置始终不变。
    dispatchEvent(){fixture.events++;if(known&&view.hasMore)view.moreLoading=true;},
  });
  h.context.fixture=fixture;
  h.context.sleep=async()=>{fixture.polls++;onSleep?.({fixture,view,add,h});};
  h.run(`getBossJobCardElements=()=>fixture.cards;buildBossJobDetail=card=>card.job;
    log=(level,message)=>fixture.logs.push({level,message});
    state.processedKeys.add(getJobUniqueKey(fixture.cards[0].job));`);
  return {...h,fixture,view,add};
}

test('页面已到底且3秒后才追加15个岗位时继续，而不是按像素不变误判结束', async()=>{
  const h=setup({onSleep({fixture,view,add}){
    if(fixture.polls===6){for(let i=0;i<15;i++)add(`new-${i}`);view.moreLoading=false;view.pageVo.page=9;}
  }});
  assert.equal(await h.run('goBossNextPageOrScroll()'),true);
  assert.equal(h.fixture.cards.length,16);
  assert.equal(h.fixture.polls,6);
  assert.equal(h.fixture.events,1);
  assert.match(h.fixture.logs.at(-1).message,/卡片1→16/);
  assert.equal(h.run('state.paginationStopReason'),'');
  assert.equal(h.calls.length,0);
});

test('翻页前已有新岗位时立即继续；平台标记无更多也不能漏掉未处理卡片', async()=>{
  const h=setup({hasMore:false});h.add('already-appended');
  assert.equal(await h.run('goBossNextPageOrScroll()'),true);
  assert.equal(h.fixture.events,0);
});

test('只有平台明确hasMore=false、加载结束且连续稳定确认后才报告列表结束',async()=>{
  const h=setup({hasMore:false});
  assert.equal(await h.run('goBossNextPageOrScroll()'),false);
  assert.equal(h.fixture.polls,3);
  assert.equal(h.fixture.events,0);
  assert.match(h.run('state.paginationStopReason'),/平台确认无更多/);
});

test('仍在加载、仍有更多或状态未知时超时只报告暂停，不伪装为列表结束',async()=>{
  for(const options of [{loading:true},{known:false}]) {
    const h=setup(options);
    assert.equal(await h.run('goBossNextPageOrScroll()'),false);
    assert.equal(h.fixture.polls,60);
    assert.doesNotMatch(h.run('state.paginationStopReason'),/平台确认无更多|没有更多职位/);
    assert.match(h.run('state.paginationStopReason'),/加载超时|未能确认/);
  }
});

test('只读加载检查忽略已有卡片，只在真正新增岗位后报告加载成功',async()=>{
  const h=setup({onSleep({fixture,view,add}){if(fixture.polls===4){add('new-probe');view.moreLoading=false;}}});
  h.run('state.processedKeys.clear()');
  assert.equal(await h.run('goBossNextPageOrScroll({probe:true})'),true);
  assert.equal(h.fixture.polls,4);
  assert.equal(h.calls.length,0);
});

test('加载期间手动停止时保留手动停止原因',async()=>{
  const h=setup();
  h.context.adapter={id:'boss',getCards:()=>h.fixture.cards,buildJob:card=>card.job,nextPage:async()=>{
    h.run('state.stopping=true;state.current="正在停止，等待当前请求结束"');return false;
  }};
  await h.run('runApplyLoop(adapter)');
  assert.equal(h.run('state.current'),'已手动停止');
});
