import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

function setup() {
  const h = harness();
  h.run(`config.bossDistanceEnabled=true; config.bossMaxDistanceKm=10;
    config.bossHomeLocation={longitude:121.47,latitude:31.23,coordinateSystem:'gcj02'};`);
  return h;
}

test('距家筛选包括边界和零距离，使用未四舍五入的距离判断', () => {
  const h=setup();
  assert.equal(h.run('filterBossHomeDistance({}, {jobInfo:{longitude:121.47,latitude:31.23}}).ok'),true);
  h.run('const work={jobInfo:{longitude:121.57,latitude:31.23}}; const exact=bossStraightDistanceKm(config.bossHomeLocation,work.jobInfo); config.bossMaxDistanceKm=exact;');
  assert.equal(h.run('filterBossHomeDistance({},work).ok'),true);
  h.run('config.bossMaxDistanceKm=exact-0.00001');
  assert.equal(h.run('filterBossHomeDistance({},work).ok'),false);
});

test('不使用无起点距离、公司总部或缺失/非法坐标绕过筛选', () => {
  const h=setup();
  for (const value of [null,{}, {distance:'2km'}, {brandInfo:{longitude:121.47,latitude:31.23}},
    {jobInfo:{longitude:'',latitude:31.23}}, {jobInfo:{longitude:0,latitude:0}},
    {jobInfo:{longitude:'NaN',latitude:31.23}}, {jobInfo:{longitude:true,latitude:31.23}}]) {
    h.context.detail=value;
    assert.equal(h.run('filterBossHomeDistance({},detail).ok'),false);
  }
});

test('优先使用岗位详情地址，兼容原始地图 gps；缺少家庭位置/坐标系时拒绝', () => {
  const h=setup();
  h.run('const job={raw:{gps:{longitude:121.47,latitude:31.23}}};');
  assert.equal(h.run('filterBossHomeDistance(job,null).ok'),true);
  assert.equal(h.run('filterBossHomeDistance(job,{jobInfo:{longitude:121.87,latitude:31.23}}).ok'),false);
  h.run('delete config.bossHomeLocation.coordinateSystem');
  assert.equal(h.run('filterBossHomeDistance(job,null).ok'),false);
  h.run('config.bossHomeLocation=null');
  assert.equal(h.run('filterBossHomeDistance(job,null).ok'),false);
  h.run('config.bossDistanceEnabled=false');
  assert.equal(h.run('filterBossHomeDistance({},null).ok'),true);
});

test('距离不满足时，在生成话术、建立沟通前就拦截，包括关闭专属话术时', async () => {
  const h=harness(['06-boss-greeting.js']);
  h.run(`config.bossDistanceEnabled=true;config.bossMaxDistanceKm=1;
    config.bossHomeLocation={longitude:121.47,latitude:31.23,coordinateSystem:'gcj02'};
    async function prepareBossGreeting(){throw new Error('must not generate')};
    async function openBossConversation(){throw new Error('must not open chat')};`);
  for(const personalized of [true,false]) {
    h.context.personalized=personalized;
    h.run('config.bossPersonalizedGreeting=personalized');
    const result=await h.run('applyBossJob({}, {jobInfo:{longitude:122,latitude:32}})');
    assert.equal(result.skipped,true);
    assert.match(result.message,/超过/);
  }
  assert.equal(h.calls.length,0);
});

test('家庭起点同步拒绝定位和未选择结果，仅保存明确选定的坐标', () => {
  const h=setup();
  h.context.location.href='https://www.zhipin.com/web/geek/map/path?securityId=test';
  let name='我的位置', visible='我的位置';
  h.context.document.querySelectorAll=()=>[{
    get __vue__(){return {startAddress:{name,longitude:121.47,latitude:31.23}};},
    querySelector(){return {textContent:visible};},
  }];
  assert.throws(()=>h.run('syncBossHomeFromRoute()'),/我的位置/);
  name='示例家庭地标';visible='请选择起点';
  assert.throws(()=>h.run('syncBossHomeFromRoute()'));
  visible=name;
  h.run('syncBossHomeFromRoute()');
  assert.equal(h.run('loadConfig().bossHomeLocation.name'),name);
  assert.equal(h.run('loadConfig().bossHomeLocation.coordinateSystem'),'gcj02');
});

test('非法公里数和坐标未设置时不可启用；历史配置默认不启用距离筛选', () => {
  const h=setup();
  for(const max of [0,-1,201,NaN,Infinity]) {
    h.context.max=max;h.run('config.bossMaxDistanceKm=max');
    assert.throws(()=>h.run('validateBossDistanceConfig()'));
  }
  assert.equal(h.run('normalizeConfig({}).bossDistanceEnabled'),false);
});
