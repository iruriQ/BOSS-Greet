import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './helpers.mjs';

test('HTTP 例外只适用于用户明确指定的完整 origin，其他 HTTP 地址仍被拒绝', () => {
  const h=harness();
  h.run('config.greetingAllowedHttpOrigin="http://model.example:27483"');
  assert.equal(h.run('validateGreetingAIEndpoint("http://model.example:27483/v1/chat/completions")'),'http://model.example:27483/v1/chat/completions');
  for(const url of ['http://model.example:27484/v1/chat/completions','http://other.example:27483/v1/chat/completions','http://model.example.evil.test:27483/v1/chat/completions']){
    h.context.url=url;assert.throws(()=>h.run('validateGreetingAIEndpoint(url)'));
  }
});

test('密钥只由弹窗进入本次脚本内存，不保存到配置或渲染到页面输入框', () => {
  const h=harness();
  h.context.window.prompt=()=> 'private-placeholder-token';
  h.run('setGreetingSessionKey()');
  assert.equal(h.run('greetingAPIKey'),'private-placeholder-token');
  assert.equal(h.values.size,0);
  assert.ok(!h.run('JSON.stringify(config)').includes('private-placeholder-token'));
  const panel=readFileSync(new URL('../src/04-panel.js',import.meta.url),'utf8');
  assert.doesNotMatch(panel,/name="greetingAPIKey"|htmlEscape\(greetingAPIKey\)/);
  h.context.window.prompt=()=> null;
  h.run('setGreetingSessionKey()');
  assert.equal(h.run('greetingAPIKey'),'private-placeholder-token');
});
