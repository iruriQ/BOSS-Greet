import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, fixtureJob } from './helpers.mjs';

const text = '您好，我对您发布的职位很感兴趣，方便进一步沟通吗？';

test('取消平台读取后，旧来源配置丢弃但原正文、相符确认、简历和筛选条件保持不变', () => {
  const h = harness();
  h.context.savedText = text;
  for (const confirmed of [false, true]) {
    h.context.confirmed = confirmed;
    h.run(`config=normalizeConfig({bossGreetingMode:'fixed',bossFixedGreetingSource:'boss',
      bossFixedGreeting:savedText,bossFixedGreetingConfirmed:confirmed,
      bossFixedGreetingConfirmedText:confirmed?savedText:'',candidateProfile:'已保存的经历。',
      candidateResumeSource:'boss',bossDistanceEnabled:true,bossMaxDistanceKm:12,bossGreetingPreviewOnly:true});`);
    assert.equal(h.run("'bossFixedGreetingSource' in config"), false);
    assert.equal(h.run('config.bossFixedGreeting'), text);
    assert.equal(h.run('config.bossFixedGreetingConfirmed'), confirmed);
    assert.equal(h.run('config.candidateProfile'), '已保存的经历。');
    assert.equal(h.run('config.candidateResumeSource'), 'boss');
    assert.equal(h.run('config.bossMaxDistanceKm'), 12);
    assert.equal(h.run('config.bossGreetingPreviewOnly'), true);
    h.run('saveConfig(config,true)');
    assert.equal(h.run('loadConfig().bossFixedGreeting'), text);
    assert.equal(h.run('loadConfig().bossFixedGreetingConfirmed'), confirmed);
  }
  assert.equal(h.calls.length, 0);
});

test('关闭助手发送时不会读取平台后台或保留旧预览，明确指向 BOSS 自身设置', async () => {
  const h = harness();
  h.context.getAdapter = () => ({ id: 'boss', getCards() { throw Error('不应扫描岗位'); } });
  h.run(`config.bossPersonalizedGreeting=false;state.lastGreeting={origin:'platform',text:'旧平台正文'};`);
  const before = h.run('JSON.stringify(config)');
  await h.run('previewBossGreeting()');
  assert.equal(h.run('state.lastGreeting'), null);
  assert.match(h.run('state.greetingPreviewError'), /平台默认招呼请到 BOSS 直聘/);
  assert.equal(h.run('state.previewing'), false);
  assert.equal(h.run('JSON.stringify(config)'), before);
  assert.equal(h.calls.length, 0);
  assert.equal([...h.values.keys()].filter(key=>!key.endsWith(':boss-job-gap-v2')).length, 0);
});

test('固定预览读取岗位详情做筛选，保留原文，不调用 AI 或代替用户确认', async () => {
  let aiCalls = 0;
  const h = harness(['05-runner.js','06-boss.js'], { GM_xmlhttpRequest() { aiCalls++; throw Error('不应调用 AI'); } });
  h.context.getHistoryKey=()=> 'preview-history';
  h.context.getAdapter = () => ({ id:'boss',getCards:()=>[{}],buildJob:()=>fixtureJob,canApply:()=>true,fetchDetail:async()=>({activeTimeDesc:'今日活跃'}) });
  h.context.savedText = text + '\n感谢您查看我的简历。';
  h.run(`config=normalizeConfig({...config,bossGreetingMode:'fixed',bossFixedGreeting:savedText,
    bossFixedGreetingConfirmed:false,bossDistanceEnabled:false});`);
  await h.run('previewBossGreeting()');
  assert.equal(h.run('state.lastGreeting.text'), h.context.savedText);
  assert.equal(h.run('state.lastGreeting.proofread.status'), 'awaiting-confirmation');
  assert.equal(h.run('config.bossFixedGreetingConfirmed'), false);
  assert.equal(h.run('state.greetingPreviewError'), '');
  assert.equal(h.run('state.previewing'), false);
  assert.equal(aiCalls, 0);
  assert.equal(h.calls.length, 0);
  assert.equal([...h.values.keys()].filter(key=>!key.endsWith(':boss-job-gap-v2')).length, 0);
});
