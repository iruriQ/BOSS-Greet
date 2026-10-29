import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

// Only fictional releases and intercepted requests. No installer is opened.
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const source = (await readFile(new URL('../boss-auto-apply.user.js', import.meta.url), 'utf8')).replace('"use strict";',
  '"use strict";window.__updatesTest={state:()=>state,config:()=>config,render:()=>renderPanel(),check:()=>checkVersionUpdates(true)};');
const currentVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const futureVersion = `${Number(currentVersion.split('.')[0]) + 1}.0.0`;
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="zh-CN"><body><button id="host-button">招聘页面按钮</button></body></html>' }));
  await page.goto('https://www.zhipin.com/web/geek/jobs');
  await page.evaluate(futureVersion => {
    window.__updateValues = new Map([['boss-auto-apply-custom:updates', { lastSeenVersion: '0.8.0' }]]);
    window.GM_getValue = (key, fallback) => window.__updateValues.get(key) ?? fallback;
    window.GM_setValue = (key, value) => window.__updateValues.set(key, value);
    window.__openedInstallers = [];
    window.__releaseRequests = [];
    window.__offlineUpdates = false;
    window.__latestRelease = { schemaVersion: 1, latest: futureVersion, releases: [{ version: futureVersion, date: '2026-10-29', title: '虚构新版',
      notes: ['新增一个示例功能。', '<img src=x onerror=alert(1)>应显示为普通文字。'] }] };
    window.GM_xmlhttpRequest = options => {
      window.__releaseRequests.push({ url: options.url, method: options.method, anonymous: options.anonymous });
      if (options.url !== 'https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/releases.json') throw Error('Unexpected request');
      if (window.__offlineUpdates) options.onerror();
      else options.onload({ status: 200, responseText: JSON.stringify(window.__latestRelease) });
    };
    window.GM_openInTab = url => { window.__openedInstallers.push(url); return {}; };
  }, futureVersion);
  await page.addScriptTag({ content: source });
  await page.waitForSelector('[role="dialog"]');
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
  assert.match(await page.$eval('[role="dialog"]', e => e.textContent), new RegExp(`已更新至 v${currentVersion.replaceAll('.', '\\.')}`));
  await page.click('[data-action="dismiss-version-update"]');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const config = await page.evaluate(() => JSON.stringify(window.__updatesTest.config()));
  await page.click('[data-action="check-version-update"]');
  await page.waitForSelector('[role="dialog"]');
  assert.ok((await page.$eval('[role="dialog"]', e => e.textContent)).includes(`发现新版本 v${futureVersion}`));
  assert.match(await page.$eval('[role="dialog"]', e => e.textContent), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.$('[role="dialog"] img'), null, 'release text must never be interpreted as HTML');
  assert.ok(await page.$eval('[role="dialog"]', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  await page.click('[data-action="install-version-update"]');
  assert.deepEqual(await page.evaluate(() => window.__openedInstallers), ['https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/boss-auto-apply.user.js']);
  assert.match(await page.$eval('[role="dialog"]', e => e.textContent), /确认更新/);
  assert.equal(await page.evaluate(() => window.__updatesTest.state().versionUpdate.kind), 'available');
  await page.click('[data-action="dismiss-version-update"]');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(await page.evaluate(() => window.__updateValues.get('boss-auto-apply-custom:updates').dismissedVersion), futureVersion);
  await page.click('[data-action="check-version-update"]');
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.evaluate(() => { window.__updatesTest.state().running = true; window.__updatesTest.render(); });
  await page.evaluate(() => window.__updatesTest.check());
  assert.equal(await page.$('[role="dialog"]'), null, 'running task must not be interrupted');
  await page.evaluate(() => { window.__updatesTest.state().running = false; window.__updatesTest.render(); });
  await page.waitForSelector('[role="dialog"]');
  await page.click('[aria-label="关闭更新提示"]');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.evaluate(() => { window.__offlineUpdates = true; });
  await page.click('[data-action="check-version-update"]');
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.$eval('[role="dialog"]', e => e.textContent), /暂时无法检查更新/);
  await page.click('[data-action="dismiss-version-update"]');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(await page.evaluate(() => JSON.stringify(window.__updatesTest.config())), config);
  assert.deepEqual(errors, []);
  console.log('版本更新浏览器验证通过：升级完成说明、新版本弹窗、普通文本渲染、窄屏布局、安装页固定地址、继续旧版、手动重查、Escape/关闭、任务中延后、断网保留使用及配置不变。零实际安装或投递。');
} finally { await browser.close(); }
