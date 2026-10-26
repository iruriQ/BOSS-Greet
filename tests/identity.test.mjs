import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {applyBuildVariant} from '../scripts/build-variant.mjs';
import {harness} from './helpers.mjs';
const header = readFileSync(new URL('../src/userscript-header.js', import.meta.url), 'utf8');
const configSource = readFileSync(new URL('../src/00-config.js', import.meta.url), 'utf8');

test('通用构建不内置任何人的履历、年限、家庭地址或服务，使用独立身份', () => {
  const result = applyBuildVariant(header, configSource);
  assert.match(result.header, /@name\s+BOSS 岗位定制招呼助手\n/);
  assert.match(result.header, /@namespace\s+local\.boss-auto-apply\.custom/);
  assert.doesNotMatch(result.header, /@updateURL|@downloadURL/);
  const h = harness();
  for (const key of ['candidateIntro','candidateProfile','candidateExperience','greetingAIEndpoint','greetingAIModel']) {
    assert.equal(h.run(`config.${key}`), '');
  }
  assert.equal(h.run('config.bossHomeLocation'), null);
  assert.equal(h.run('config.bossDistanceEnabled'), false);
  assert.equal(h.run('config.bossGreetingIncludeAI'), false);
  assert.equal(h.run('config.bossGreetingUseAI'), true);
});

test('私人构建保留既有安装身份、记录键及用户偏好，额外密钥字段不能写入脚本', () => {
  const result = applyBuildVariant(header, configSource, {
    intro:'虚构身份', profile:'虚构经历$&。', experience:'五年以上工作经验',
    service:{endpoint:'https://model.example/chat/completions',model:'example-model',apiKey:'must-never-be-embedded'},
    apiKey:'must-never-be-embedded',
  });
  assert.match(result.header, /BOSS 岗位定制招呼助手（个人副本）/);
  assert.match(result.header, /local\.boss-auto-apply\.personal-copy/);
  assert.doesNotMatch(result.config, /must-never-be-embedded/);
  const storage = readFileSync(new URL('../src/02-storage.js', import.meta.url),'utf8');
  const context = vm.createContext({GM_getValue:(_key,fallback)=>fallback});
  vm.runInContext(result.config + '\n' + storage, context);
  const value = code => vm.runInContext(code, context);
  assert.equal(value('APP_ID'),'boss-auto-apply-personal-copy');
  assert.equal(value('config.candidateProfile'),'虚构经历$&。');
  assert.equal(value('config.candidateExperience'),'五年以上工作经验');
  assert.equal(value('config.bossGreetingIncludeAI'),true);
  assert.equal(value('config.bossGreetingUseAI'),false);
  assert.equal(value('normalizeConfig({bossGreetingPreviewOnly:true}).bossGreetingPreviewOnly'),false);
  assert.equal(value('normalizeConfig({bossGreetingPreviewOnly:true,greetingWorkflowVersion:2}).bossGreetingPreviewOnly'),true);
  assert.throws(()=>applyBuildVariant(header,configSource,{intro:'',profile:''}),/非空/);
});

test('通用版的配置、历史、续跑、发送记录与上游及私人构建分别隔离', () => {
  const h = harness();
  const keys = h.run('[CONFIG_KEY,HISTORY_KEY,RESUME_KEY,GREETING_LEDGER_KEY,PANEL_ID,STYLE_ID]');
  for (const key of keys) {
    assert.ok(key.startsWith('boss-auto-apply-custom'));
    assert.ok(!key.startsWith('boss-auto-apply-personal-copy'));
    assert.ok(!key.startsWith('boss-auto-apply-lite'));
  }
});
