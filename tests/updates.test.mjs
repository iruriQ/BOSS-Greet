import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './helpers.mjs';
import { prepareRelease } from '../scripts/release.mjs';

const currentVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const futureMajor = Number(currentVersion.split('.')[0]) + 1;
const futureVersion = `${futureMajor}.0.1`, laterVersion = `${futureMajor}.1.0`;
const manifest = { schemaVersion: 1, latest: futureVersion, releases: [
  { version: futureVersion, date: '2026-10-29', title: '虚构更新', notes: ['新增示例功能。', '<img src=x onerror=alert(1)>只应作为文字显示'] },
  { version: `${futureMajor}.0.0`, date: '2026-10-29', title: '虚构改进', notes: ['改进示例操作。'] },
] };
function setup(payload = manifest, preferences = {}) {
  const requests = [], opened = [], timers = [];
  const h = harness([], {
    window: { setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; } },
    GM_xmlhttpRequest: options => { requests.push(options); options.onload({ status: 200, responseText: JSON.stringify(payload) }); },
    GM_openInTab: (url, options) => { opened.push({ url, options }); return {}; },
  });
  h.values.set(h.run('UPDATE_STORAGE_KEY'), preferences);
  return { ...h, requests, opened, timers };
}

test('按数字比较三段版本，拒绝预发布/无效版本，不把 0.10.0 判成小于 0.9.0', () => {
  const h = setup();
  assert.equal(h.run(`compareReleaseVersions('0.10.0','0.9.0')`), 1);
  assert.equal(h.run(`compareReleaseVersions('0.9.0','0.9.0')`), 0);
  assert.equal(h.run(`compareReleaseVersions('0.8.99','0.9.0')`), -1);
  for (const version of ['v0.9.0', '0.9', '0.9.1-beta', '01.0.0', 'javascript:alert(1)']) {
    h.context.version = version;
    assert.throws(() => h.run('compareReleaseVersions(version, VERSION)'), /无效/);
  }
});

test('更新检查只匿名读取固定公开清单，不发送简历、密钥或 BOSS cookie，且不修改投递配置', async () => {
  const h = setup();
  const config = h.run('JSON.stringify(config)');
  await h.run('checkVersionUpdates(true)');
  assert.equal(h.requests.length, 1);
  const request = h.requests[0];
  assert.equal(request.url, 'https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/releases.json');
  assert.equal(request.method, 'GET');
  assert.equal(request.anonymous, true);
  assert.equal(request.data, undefined);
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.headers.Cookie, undefined);
  assert.equal(h.run('state.versionUpdate.kind'), 'available');
  assert.equal(h.run('state.versionUpdate.releases[0].version'), futureVersion);
  assert.equal(h.run('JSON.stringify(config)'), config);
  assert.equal(h.opened.length, 0);
});

test('继续使用仅忽略相同版本，自动检查有节流，手动可重新查看，下一版仍提醒', async () => {
  const h = setup();
  await h.run('checkVersionUpdates(true)');
  h.run('dismissVersionUpdate()');
  assert.equal(h.run('loadUpdatePreferences().dismissedVersion'), futureVersion);
  await h.run('checkVersionUpdates(false)');
  assert.equal(h.requests.length, 1);
  h.run('updatePreferences({lastCheckedAt:0})');
  await h.run('checkVersionUpdates(false)');
  assert.equal(h.run('state.versionUpdate.kind'), '');
  await h.run('checkVersionUpdates(true)');
  assert.equal(h.run('state.versionUpdate.kind'), 'available');
  h.run('dismissVersionUpdate()');
  h.context.newManifest = { ...manifest, latest: laterVersion, releases: [{ ...manifest.releases[0], version: laterVersion }, ...manifest.releases] };
  assert.equal(h.run('showAvailableRelease(validateReleaseManifest(newManifest))'), true);
});

test('投递、预览、简历导入或收起时不弹窗，恢复空闲后展示排队的新版本', async () => {
  const h = setup();
  await h.run('checkVersionUpdates(true)');
  for (const flag of ['state.running', 'state.previewing', 'state.resumeImport.busy', 'state.collapsed']) {
    h.run(`${flag}=true`);
    assert.equal(h.run('getVersionUpdateModel().open'), false);
    h.run(`${flag}=false`);
  }
  assert.equal(h.run('getVersionUpdateModel().open'), true);
});

test('打开安装页不伪报安装成功，不受远程安装地址控制，也不覆盖任何配置', async () => {
  const h = setup({ ...manifest, installUrl: 'https://untrusted.invalid/install.js' });
  await h.run('checkVersionUpdates(true)');
  const before = h.run('JSON.stringify(config)');
  h.run('openVersionUpdateInstaller()');
  assert.equal(h.opened[0].url, 'https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/boss-auto-apply.user.js');
  assert.equal(h.opened.length, 1);
  assert.equal(h.run('state.versionUpdate.kind'), 'available');
  assert.equal(h.run('loadUpdatePreferences().installedNoticeVersion'), undefined);
  assert.equal(h.run('JSON.stringify(config)'), before);
  h.run('state.running=true;openVersionUpdateInstaller()');
  assert.equal(h.opened.length, 1);
});

test('只有实际运行新版才显示更新成功，合并跨版本说明，确认后不重复；首次安装不伪报升级', () => {
  const first = setup(); first.run('initializeVersionUpdates()');
  assert.equal(first.run('state.versionUpdate.kind'), '');
  assert.equal(first.requests.length, 0);
  const h = setup(manifest, { lastSeenVersion: '0.7.0' });
  h.run('initializeVersionUpdates()');
  assert.equal(h.run('state.versionUpdate.kind'), 'installed');
  assert.equal(h.run('state.versionUpdate.releases.length'), JSON.parse(readFileSync(new URL('../releases.json', import.meta.url), 'utf8')).releases.length);
  const saved = h.run('loadUpdatePreferences()');
  const reload = setup(manifest, saved); reload.run('initializeVersionUpdates()');
  assert.equal(reload.run('state.versionUpdate.kind'), 'installed');
  reload.run('dismissVersionUpdate()');
  const acknowledged = setup(manifest, reload.run('loadUpdatePreferences()')); acknowledged.run('initializeVersionUpdates()');
  assert.equal(acknowledged.run('state.versionUpdate.kind'), '');
  assert.equal(acknowledged.timers.length, 1);
});

test('网络错误、无效清单只提示失败，自动检查不打断使用；清单不包含任意链接或执行内容', async () => {
  const invalid = [null, {}, { ...manifest, latest: laterVersion }, { ...manifest, releases: [...manifest.releases, manifest.releases[0]] }];
  for (const payload of invalid) {
    const h = setup(payload);
    await h.run('checkVersionUpdates(false)');
    assert.equal(h.run('state.versionUpdate.kind'), '');
    assert.equal(h.run('state.versionUpdate.checking'), false);
    await h.run('checkVersionUpdates(true)');
    assert.equal(h.run('state.versionUpdate.kind'), 'error');
    assert.equal(h.opened.length, 0);
  }
  const offline = setup(); offline.context.GM_xmlhttpRequest = options => options.ontimeout();
  await offline.run('checkVersionUpdates(true)');
  assert.equal(offline.run('state.versionUpdate.kind'), 'error');
  const h = setup(); h.context.manifest = { ...manifest, installUrl: 'https://untrusted.invalid' };
  assert.equal(h.run('validateReleaseManifest(manifest).installUrl'), undefined);
  assert.equal(h.run('validateReleaseManifest(manifest).releases[0].notes[1]'), manifest.releases[0].notes[1]);
});

test('发布工具同步全部版本标记并保留旧版说明，拒绝相同版本、降版或缺少说明', () => {
  const paths = ['releases.json', 'src/userscript-header.js', 'src/00-config.js', 'src/03-updates.js', 'README.md', 'package.json', 'package-lock.json'];
  const files = Object.fromEntries(paths.map(path => [path, readFileSync(new URL('../' + path, import.meta.url), 'utf8')]));
  const output = prepareRelease(files, futureVersion, ['新增虚构功能。'], '2026-10-29');
  assert.equal(JSON.parse(output['package.json']).version, futureVersion);
  assert.equal(JSON.parse(output['package-lock.json']).packages[''].version, futureVersion);
  assert.ok(output['src/userscript-header.js'].includes(`// @version      ${futureVersion}`));
  assert.ok(output['src/00-config.js'].includes(`const VERSION = "${futureVersion}"`));
  assert.ok(output['src/03-updates.js'].includes(`"latest":"${futureVersion}"`));
  assert.ok(output['README.md'].includes(`当前版本：\`${futureVersion}\``));
  assert.equal(JSON.parse(output['releases.json']).releases[1].version, JSON.parse(files['releases.json']).latest);
  for (const [version, notes] of [[currentVersion, ['说明']], ['0.0.0', ['说明']], [futureVersion, []]]) assert.throws(() => prepareRelease(files, version, notes, '2026-10-29'));
});
