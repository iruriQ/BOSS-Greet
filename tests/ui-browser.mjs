import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

// Real bundled React UI, isolated fake recruiting pages, every request intercepted.
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const source = (await readFile(new URL("../boss-auto-apply.user.js", import.meta.url), "utf8"))
  .replace('"use strict";', '"use strict";window.__uiEngine={state:()=>state,config:()=>config,render:()=>renderPanel(),log:(text)=>log("info",text)};');
const greeting = "您好！我对贵公司的招聘岗位很感兴趣，希望进一步了解工作内容与任职要求，期待与您沟通。";
const fixture = { bossGreetingMode: "fixed", bossFixedGreeting: greeting, bossFixedGreetingConfirmed: false,
  bossGreetingPreviewOnly: true, bossFixedGreetingSource: 'boss', shixisengResume: "attach", shixisengDays: "3天" };
const errors = [], requests = [];
const platformRequests = [];
const resumeRequests = [];
async function verifyNavigation(page) {
  // Wait for resize/reparent and theme transitions before comparing fixed bounds.
  await page.evaluate(async () => {
    await document.fonts.ready;
    let previous = '', stable = 0;
    while (stable < 5) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = [...document.querySelectorAll('.nova-header,.nova-nav,.nova-overview,.nova-actions')]
        .map(e => { const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height].join(','); }).join('|');
      stable = current === previous ? stable + 1 : 0; previous = current;
    }
  });
  await page.$eval('.nova-content', e => e.scrollTo(0, 0));
  const fixedPosition = () => page.$$eval('.nova-header, .nova-nav, .nova-overview, .nova-actions', es => es.map(e => {
    const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  }));
  const fixedBefore = await fixedPosition();
  const contentBefore = await page.$$eval('.nova-heading, .nova-metrics', es => es.map(e => e.getBoundingClientRect().top));
  const pageBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
  await page.hover('.nova-content');
  await page.mouse.wheel({ deltaY: 320 });
  await page.waitForFunction(() => document.querySelector('.nova-content').scrollTop > 100);
  const contentAfter = await page.$$eval('.nova-heading, .nova-metrics', es => es.map(e => e.getBoundingClientRect().top));
  assert.deepEqual(contentAfter, contentBefore, 'compact statistics must stay fixed while the cards scroll');
  assert.deepEqual(await fixedPosition(), fixedBefore, 'header, navigation and footer must stay fixed while scrolling');
  assert.ok(await page.evaluate(() => {
    const content = document.querySelector('.nova-content').getBoundingClientRect();
    const footer = document.querySelector('.nova-actions').getBoundingClientRect();
    const panel = document.querySelector('[data-boss-nova]').getBoundingClientRect();
    return Math.abs(content.bottom - footer.top) < 1 && footer.bottom <= panel.bottom && footer.top > content.top;
  }), 'footer must be visible without covering the content');
  for (const id of ['logs', 'filters', 'greeting']) {
    await page.click(`.nova-nav button[data-nav="${id}"]`);
    await page.waitForFunction(id => {
      const main = document.querySelector('.nova-content'), box = main.getBoundingClientRect();
      const target = document.querySelector(`[data-card="${id}"]`);
      const top = target.getBoundingClientRect().top;
      return top >= box.top - 1 && top < box.bottom - 20;
    }, {}, id);
    assert.equal(await page.$eval('.nova-nav [aria-current="page"]', e => e.textContent),
      { filters: '投递设置', greeting: '打招呼', logs: '投递进度' }[id]);
    assert.deepEqual(await fixedPosition(), fixedBefore);
    assert.deepEqual(await page.evaluate(() => [window.scrollX, window.scrollY]), pageBefore, 'navigation must not scroll the recruiting website');
  }
}
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url()); requests.push(url.pathname);
    if (url.pathname === '/wapi/zpchat/greeting/getGreetingList') {
      platformRequests.push(request.method());
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 7 }) });
    }
    if (url.pathname === '/wapi/zpgeek/resume/geek/preview/data.json') {
      resumeRequests.push(request.method());
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, zpData: {
        baseInfo: { name: '不应进入草稿', phone: '13800000000' }, workExpList: [{ workContent: '负责虚构项目的合同归档。' }],
      } }) });
    }
    return request.respond({ status: 200, contentType: "text/html", body: `<!doctype html><html lang="zh-CN"><head><style>
      body{margin:0;background:#eae7f1;font-family:system-ui}#host-control{color:rgb(11,22,33);padding:7px;border:2px solid #aaa}
      header{height:72px;padding-left:430px}header span{border:1px solid #333;padding:12px}main{margin-left:430px;max-width:600px}nav{width:900px}footer{padding-left:430px}
      .demo-note{position:absolute;right:25px;top:20px;color:#665d75;font-size:14px}
      </style></head><body><div class="demo-note">隔离测试 · 虚构数据 · 未连接招聘账号</div>
      <button id="host-control" class="flex rounded-lg bg-primary">招聘网站原有按钮</button></body></html>` });
  });
  await page.evaluateOnNewDocument(fixture => {
    window.__uiValues = new Map();
    window.GM_getValue = (key, fallback) => window.__uiValues.get(key) ?? (key.endsWith(":config") ? fixture : key.endsWith(":ui") ? { expanded: true, settingsOrder: ['greeting', 'filters'], insightOrder: ['preview', 'logs'] } : fallback);
    window.GM_setValue = (key, value) => window.__uiValues.set(key, value);
    window.GM_notification = () => {};
  }, fixture);
  await page.goto("https://www.zhipin.com/web/geek/jobs");
  const before = await page.$eval("#host-control", e => { const s = getComputedStyle(e); return [s.display, s.color, s.padding, s.borderRadius]; });
  await page.addScriptTag({ content: source });
  await page.waitForSelector('[data-card="greeting"]');
  assert.deepEqual(await page.$eval("#host-control", e => { const s = getComputedStyle(e); return [s.display, s.color, s.padding, s.borderRadius]; }), before, "UI styles must not change the recruiting website");
  assert.equal(await page.$eval('[data-action="start"]', e => getComputedStyle(e).backgroundColor), "rgb(51, 135, 51)");
  assert.equal(await page.$eval('.aj-title span', e => getComputedStyle(e).borderTopWidth), "0px");
  assert.equal(await page.$eval('.nova-main', e => getComputedStyle(e).marginLeft), "0px");
  assert.equal(await page.$eval('[name="bossFixedGreeting"]', e => e.value), greeting);
  assert.deepEqual(await page.$$eval('.nova-settings-column > fieldset > [data-card]', es => es.map(e => e.dataset.card)), ['filters', 'greeting'], 'legacy layouts must adopt the agreed default order');
  assert.deepEqual(await page.$$eval('.nova-nav button[data-nav]', es => es.map(e => e.dataset.nav)), ['filters', 'greeting', 'logs']);
  assert.equal(await page.$eval('.nova-card-greeting', e => e.nextElementSibling?.dataset.card), 'preview', 'preview must stay directly below greeting settings');
  assert.deepEqual(await page.$$eval('.nova-insights-column > [data-card]', es => es.map(e => e.dataset.card)), ['logs'], 'legacy preview order must not restore a detached preview');
  await page.$eval('[name="bossFixedGreeting"]', e => { e.focus(); e.setSelectionRange(3, 3); });
  await page.evaluate(() => window.__uiEngine.log("日志更新不能打断输入"));
  assert.deepEqual(await page.evaluate(() => [document.activeElement.name, document.activeElement.selectionStart, document.activeElement.value]), ["bossFixedGreeting", 3, greeting]);
  await page.click('[data-action="save-config"]');
  assert.match(await page.$eval(".aj-logs", e => e.textContent), /设置已保存/);
  await verifyNavigation(page);

  // Round limit is editable, persisted and rejects invalid input before start.
  assert.equal(await page.$eval('[name="maxApplyCount"]', e => e.value), '20');
  for (const value of ['', '0', '151', '1.5']) {
    await page.$eval('[name="maxApplyCount"]', (e, value) => {
      e.value = value; e.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    assert.equal(await page.$eval('[name="maxApplyCount"]', e => e.checkValidity()), false);
    await page.click('[data-action="start"]');
    assert.equal(await page.evaluate(() => window.__uiEngine.state().running), false);
    assert.equal(requests.filter(path => /friend\/add|chat\/completions/.test(path)).length, 0);
  }
  await page.$eval('[name="maxApplyCount"]', e => {
    e.value = '7'; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.__uiEngine.config().maxApplyCount), 7);
  assert.equal(await page.$eval('[name="maxApplyCount"]', e => e.checkValidity()), true);

  // A real resize gesture changes and persists the split ratio.
  const separator = await page.$('[role="separator"]');
  const box = await separator.boundingBox();
  const resizeY = await page.$eval('.nova-content', (e, y) => Math.min(y, e.getBoundingClientRect().bottom - 50), box.y + box.height / 2);
  const widthBefore = await page.$eval('[data-panel][id="settings"]', e => e.getBoundingClientRect().width);
  await page.mouse.move(box.x + box.width / 2, resizeY);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 55, resizeY, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => [...window.__uiValues].some(([k, v]) => k.endsWith(":ui") && v.layout.settings > 61));
  // Pointer resize commits on an animation frame; wait until painted panel
  // widths agree with the saved percentage before comparing a later reload.
  await page.waitForFunction(() => {
    const saved = [...window.__uiValues].find(([k]) => k.endsWith(":ui"))[1].layout.settings;
    const widths = [...document.querySelectorAll('.nova-panel-group > [data-panel]')].map(e => e.getBoundingClientRect().width);
    return Math.abs(widths[0] / (widths[0] + widths[1]) * 100 - saved) < .05;
  });
  const resizedWidth = await page.$eval('[data-panel][id="settings"]', e => e.getBoundingClientRect().width);
  assert.ok(resizedWidth > widthBefore + 30);

  // Pointer sorting also moves the corresponding navigation entry.
  await page.$eval('.nova-content', e => e.scrollTo(0, 0));
  const handle = await page.$('[data-card="filters"] .nova-drag-handle');
  const from = await handle.boundingBox();
  const to = await (await page.$('[data-card="greeting"] .nova-drag-handle')).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 50, { steps: 15 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector(".nova-settings-column > fieldset > [data-card]")?.dataset.card === "greeting");
  assert.deepEqual(await page.$$eval('.nova-nav button[data-nav]', es => es.map(e => e.dataset.nav)), ['greeting', 'filters', 'logs']);
  const values = await page.evaluate(() => [...window.__uiValues]);
  await page.reload();
  await page.evaluate(values => { window.__uiValues = new Map(values); }, values);
  await page.addScriptTag({ content: source });
  await page.waitForSelector('[data-card="greeting"]');
  assert.deepEqual(await page.$$eval(".nova-settings-column > fieldset > [data-card]", es => es.map(e => e.dataset.card)), ["greeting", "filters"]);
  assert.deepEqual(await page.$$eval('.nova-nav button[data-nav]', es => es.map(e => e.dataset.nav)), ['greeting', 'filters', 'logs']);
  assert.equal(await page.$eval('.nova-card-greeting', e => e.nextElementSibling?.dataset.card), 'preview');
  await page.waitForFunction(expected => Math.abs(document.querySelector('[data-panel][id="settings"]').getBoundingClientRect().width - expected) < 3, {}, resizedWidth);
  assert.equal(await page.$eval('[name="bossFixedGreeting"]', e => e.value), greeting);
  assert.equal(await page.$eval('[name="maxApplyCount"]', e => e.value), '7');

  // Restore the agreed order using accessible keyboard sorting.
  await page.focus('[data-card="filters"] .nova-drag-handle');
  await page.keyboard.press("Space", { delay: 80 });
  await page.waitForFunction(() => document.activeElement.getAttribute("aria-pressed") === "true");
  await page.keyboard.press("ArrowUp", { delay: 80 });
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(e => e.textContent.includes('over droppable area greeting')));
  await page.keyboard.press("Space", { delay: 80 });
  await page.waitForFunction(() => [...window.__uiValues].some(([k, v]) => k.endsWith(":ui") && v.settingsOrder[0] === "filters"));
  assert.deepEqual(await page.$$eval('.nova-nav button[data-nav]', es => es.map(e => e.dataset.nav)), ['filters', 'greeting', 'logs']);
  assert.equal(await page.$eval('.nova-card-greeting', e => e.nextElementSibling?.dataset.card), 'preview', 'preview must follow greeting settings after sorting');

  const artifactDir = await mkdtemp(join(tmpdir(),"boss-greet-ui-test-"));
  await page.$eval('[name="bossMaxDistanceKm"]', e => { e.closest("details").open = false; });
  await page.evaluate(() => { document.querySelector(".nova-content").scrollTop = 0; });
  await (await page.$("[data-boss-nova]")).screenshot({ path: join(artifactDir,"demo-nova-workbench.png") });

  // The wide view stacks without horizontal overflow when the viewport shrinks.
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector("[data-boss-nova]").getBoundingClientRect().width < 391);
  await page.waitForFunction(() => !document.querySelector(".nova-panel-group"));
  // Wait for the responsive button size to settle before measuring the fixed
  // chrome; base-ui's transition can still be finishing after the React swap.
  await page.waitForFunction(() => Math.abs(document.querySelector('.nova-nav').getBoundingClientRect().height - 67) < .1);
  await page.waitForFunction(() => { const e = document.querySelector('[data-boss-nova]'); return e.scrollWidth <= e.clientWidth + 1; });
  assert.equal(await page.$eval('[data-boss-nova]', e => e.scrollWidth <= e.clientWidth + 1), true);
  await verifyNavigation(page);
  assert.ok(await page.$('[aria-label="展开工作台"]'), 'narrow floating windows automatically use compact content');
  await page.click('[data-action="toggle-collapse"]');
  await page.waitForFunction(() => !document.querySelector(".nova-main"));
  await page.click('[data-action="toggle-collapse"]');
  await page.waitForSelector('[name="bossFixedGreeting"]');
  assert.equal(await page.$eval('[name="bossFixedGreeting"]', e => e.value), greeting);

  // Old platform-import settings migrate without losing the saved text.
  // The removed feature must have no visible entry and no backend reads.
  assert.equal(await page.$('[name="bossFixedGreetingSource"]'), null);
  assert.equal(await page.$('[data-action="read-boss-fixed-greeting"]'), null);
  assert.equal(await page.evaluate(() => 'bossFixedGreetingSource' in window.__uiEngine.config()), false);
  await page.click('[name="bossPersonalizedGreeting"]');
  assert.equal(await page.$('.aj-preview-box'), null);
  assert.equal(await page.$('[data-action="preview-greeting"]'), null);
  assert.match(await page.$eval('[data-card="preview"]', e => e.textContent), /平台默认招呼请|请在 BOSS 直聘/);
  await page.click('[name="bossPersonalizedGreeting"]');
  assert.equal(await page.$eval('[name="bossFixedGreeting"]', e => e.value), greeting);
  await page.click('[name="bossFixedGreetingConfirmed"]');
  assert.equal(await page.evaluate(() => window.__uiEngine.config().bossFixedGreetingConfirmed), true);
  await page.$eval('[name="bossFixedGreeting"]', e => {
    e.value += '谢谢！'; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.$eval('[name="bossFixedGreetingConfirmed"]', e => e.checked), false);
  assert.equal(await page.evaluate(() => window.__uiEngine.config().bossFixedGreetingConfirmed), false);
  assert.deepEqual(platformRequests, [], 'manual editing must never read BOSS greeting settings');

  // Both resume sources use a review draft. Neither reading nor cancelling
  // changes active experiences; applying updates the mounted form as well.
  await page.select('[name="bossGreetingMode"]', 'ai');
  await page.waitForSelector('[name="candidateResumeText"]');
  const setField = (name, text) => page.$eval(`[name="${name}"]`, (e, text) => {
    e.value = text; e.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await setField('candidateProfile', '旧的真实经历。');
  await setField('candidateResumeText', '姓名：示例用户\n邮箱：fiction@example.invalid\n负责虚构项目的数据整理。');
  await page.click('[data-action="prepare-resume-text"]');
  await page.waitForSelector('[name="resumeImportDraft"]');
  assert.equal(await page.$eval('[name="resumeImportDraft"]', e => e.value), '负责虚构项目的数据整理。');
  assert.equal(await page.evaluate(() => window.__uiEngine.config().candidateProfile), '旧的真实经历。');
  await setField('resumeImportDraft', '本人核对后的数据整理经历。');
  await page.click('[data-action="apply-resume-draft"]');
  await page.waitForFunction(() => window.__uiEngine.config().candidateProfile === '本人核对后的数据整理经历。');
  assert.equal(await page.$eval('[name="candidateProfile"]', e => e.value), '本人核对后的数据整理经历。');
  await page.$eval('[name="candidateProfile"]', e => { e.closest('details').open = true; });
  await page.click('[data-action="restore-resume-profile"]');
  await page.waitForFunction(() => window.__uiEngine.config().candidateProfile === '旧的真实经历。');
  await page.select('[name="candidateResumeSource"]', 'boss');
  await page.click('[data-action="read-boss-resume"]');
  await page.waitForSelector('[name="resumeImportDraft"]');
  assert.equal(await page.$eval('[name="resumeImportDraft"]', e => e.value), '负责虚构项目的合同归档。');
  assert.equal(await page.evaluate(() => window.__uiEngine.config().candidateProfile), '旧的真实经历。');
  await page.click('[data-action="cancel-resume-import"]');
  assert.equal(await page.$('[name="resumeImportDraft"]'), null);
  assert.deepEqual(resumeRequests, ['GET']);

  // Existing third-party adapters keep intact multi-character select options.
  await page.goto("https://www.shixiseng.com/interns");
  await page.addScriptTag({ content: source });
  await page.waitForSelector('[name="shixisengResume"]');
  assert.equal(await page.$eval('[name="shixisengResume"]', e => e.value), "attach");
  assert.equal(await page.$eval('[name="shixisengDays"]', e => e.value), "3天");
  assert.match(await page.$eval('[name="shixisengDays"]', e => e.textContent), /跟随职位默认/);
  await page.select('[name="shixisengDays"]', "5天");
  assert.equal(await page.evaluate(() => window.__uiEngine.config().shixisengDays), "5天");
  assert.deepEqual(errors, []);
  assert.equal(requests.some(path => path !== '/wapi/zpchat/greeting/getGreetingList' && /friend\/add|chat|completions/.test(path)), false);
  console.log("Nova UI 浏览器验证通过：顶部、紧凑工作台和底部固定、中间卡片滚动且不被按钮遮挡、三个导航定位且不移动招聘页、色号、样式隔离、日志更新保留光标、配置保存、鼠标分栏、键盘/鼠标拖拽、布局跨刷新保存、窄屏与收起、其他平台控件。零真实投递。");
} finally { await browser.close(); }
