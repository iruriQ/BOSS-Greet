import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

// Entirely fictional data; no account, model or live recruiting requests.
const payload = { code: 0, zpData: {
  baseInfo: { name: '测试用户', phone: '13800000000', birthday: '1990-01-01' },
  userDesc: '熟悉商务支持与数据整理。', professionalSkill: '使用 Excel 维护业务台账。',
  workExpList: [{ companyName: '虚构公司', positionName: '商务助理', workContent: '跟进合同归档。', workPerformance: '完成 37 份资料核对。' }],
  projectExpList: [{ name: '虚构项目', roleName: '执行', projectDesc: '维护项目进度。', performance: '完成交付清单。', url: 'https://private.invalid' }],
  educationExpList: [{ schoolName: '示例大学', majorName: '管理学', degreeName: '本科' }],
  certificationList: [{ name: '示例技能证书' }],
  attachmentList: [{ url: 'https://private.invalid/resume.pdf' }], handicappedInfo: { description: '不应读取的健康资料' },
} };
function setup(response = payload) {
  const requests = [];
  const h = harness(['06-boss.js'], { AbortSignal, TextDecoder,
    GM_xmlhttpRequest() { throw Error('导入不得调用 AI'); },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => JSON.stringify(response) }; },
  });
  h.context.getAdapter = () => ({ id: 'boss' });
  h.run(`function collectFormConfig(){return {...config}};config.candidateProfile='原有完整经历。';config.candidateIntro='保留简介';config.candidateExperience='两年以上';`);
  return { ...h, requests };
}

test('文本按原文分行、去重和过滤联系信息，保留小数与限定条件，不截断长段', () => {
  const h = setup();
  h.context.input = '# 工作经历\n姓名：测试用户\n邮箱：test@example.invalid\n1. 使用 Excel 整理数据。\n1.5 年项目协同经验。\n使用 Excel 整理数据。\n联系方式 13800000000';
  const result = h.run('prepareCandidateResumeText(input)');
  assert.equal(result.text, '使用 Excel 整理数据。\n1.5 年项目协同经验。');
  assert.equal(result.removed, 3);
  h.context.longInput = '完整限定条件'.repeat(100);
  assert.equal(h.run('prepareCandidateResumeText(longInput).text'), h.context.longInput);
  assert.equal(h.run('prepareCandidateResumeText(longInput).longLines'), 1);
  assert.throws(() => h.run(`prepareCandidateResumeText('a'.repeat(30001))`), /30000/);
  assert.throws(() => h.run(`prepareCandidateResumeText('姓名：测试')`), /没有识别/);
});

test('在线简历只导入允许的经历字段；仅一个本人 GET，不下载附件、不读取联系人、不覆盖资料', async () => {
  const h = setup();
  await h.run(`handleResumeImportAction('read-boss-resume')`);
  const draft = h.run('state.resumeImport.draftText');
  assert.match(draft, /虚构公司 \/ 商务助理.*跟进合同归档/);
  assert.match(draft, /维护项目进度/);
  assert.match(draft, /示例大学/);
  assert.doesNotMatch(draft, /13800000000|测试用户|1990|private|健康/);
  assert.equal(h.run('config.candidateProfile'), '原有完整经历。');
  assert.equal(h.run('config.candidateBossResumeText'), draft);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/wapi/zpgeek/resume/geek/preview/data.json');
  assert.equal(h.requests[0].options.method, 'GET');
  assert.equal(h.requests[0].options.credentials, 'include');
  assert.equal(h.requests[0].options.body, undefined);
});

test('新结构只读取显示的模块，不回退到旧字段或隐藏模块', () => {
  const h = setup();
  h.context.response = { code: 0, zpData: { ...payload.zpData, feature: { useNewStruct: true }, moduleList: [
    { moduleType: 11, customConfig: { showType: 0 }, data: { userDesc: '可见优势。' } },
    { moduleType: 22, customConfig: { showType: 1 }, data: { professionalSkill: '隐藏技能' } },
    { moduleType: 12, customConfig: { showType: 0 }, dataList: [{ workContent: '可见工作。' }] },
    { moduleType: 20, customConfig: { showType: 0 }, data: { description: '健康资料' } },
  ] } };
  assert.equal(h.run('parseBossOnlineResume(response).text'), '可见优势。\n可见工作。');
});

test('核对后确认才更新经历，保留备份，简介与年限不变；取消或失败不改变当前资料', async () => {
  const h = setup();
  h.run(`config.candidateResumeText='新导入的真实经历。';`);
  await h.run(`handleResumeImportAction('prepare-resume-text')`);
  assert.equal(h.run('config.candidateProfile'), '原有完整经历。');
  h.run(`state.resumeImport.draftText='本人核对后的完整句子。';`);
  await h.run(`handleResumeImportAction('apply-resume-draft')`);
  assert.equal(h.run('config.candidateProfile'), '本人核对后的完整句子。');
  assert.equal(h.run('config.candidateProfileBackup'), '原有完整经历。');
  assert.equal(h.run('config.candidateProfileSource'), 'text');
  assert.equal(h.run('config.candidateIntro'), '保留简介');
  assert.equal(h.run('config.candidateExperience'), '两年以上');
  await h.run(`handleResumeImportAction('restore-resume-profile')`);
  assert.equal(h.run('config.candidateProfile'), '原有完整经历。');
  await h.run(`handleResumeImportAction('prepare-resume-text')`);
  await h.run(`handleResumeImportAction('cancel-resume-import')`);
  assert.equal(h.run('state.resumeImport.draftText'), '');
  assert.equal(h.run('config.candidateProfile'), '原有完整经历。');
  const bad = setup({ code: 7 });
  await bad.run(`handleResumeImportAction('read-boss-resume')`);
  assert.equal(bad.run('state.resumeImport.busy'), false);
  assert.equal(bad.run('state.resumeImport.draftText'), '');
  assert.match(bad.run('state.resumeImport.message'), /登录/);
  assert.equal(bad.run('config.candidateProfile'), '原有完整经历。');
});

test('文本上传保留完整正文而不覆盖当前经历，拒绝错误类型、超限或乱码文件', async () => {
  const h = setup();
  const file = (name, bytes, size = bytes.byteLength) => ({ name, size, arrayBuffer: async () => bytes });
  h.context.file = file('resume.txt', new TextEncoder().encode('姓名：测试\n完整工作正文。'));
  await h.run('importCandidateResumeFile(file)');
  assert.equal(h.run('config.candidateResumeText'), '姓名：测试\n完整工作正文。');
  assert.equal(h.run('config.candidateProfile'), '原有完整经历。');
  for (const invalid of [file('resume.pdf', new Uint8Array([1])), file('huge.txt', new Uint8Array([1]), 300000), file('bad.txt', new Uint8Array([255]))]) {
    h.context.file = invalid;
    await h.run('importCandidateResumeFile(file)');
    assert.equal(h.run('config.candidateResumeText'), '姓名：测试\n完整工作正文。');
    assert.equal(h.run('config.candidateProfile'), '原有完整经历。');
    assert.equal(h.run('state.resumeImport.busy'), false);
    assert.ok(h.run('state.resumeImport.message').length > 0);
  }
  assert.equal(h.requests.length, 0);
});

test('旧设置迁移不丢经历；简历来源及本机正文可保存，导入进行时不重入', async () => {
  const h = setup();
  assert.equal(h.run(`normalizeConfig({candidateProfile:'旧经历'}).candidateProfile`), '旧经历');
  assert.equal(h.run(`normalizeConfig({candidateProfile:'旧经历'}).candidateResumeSource`), 'text');
  h.run(`saveConfig({...config,candidateResumeSource:'boss',candidateResumeText:'本机原文',candidateBossResumeText:'线上原文'},true);`);
  assert.equal(h.run('loadConfig().candidateResumeSource'), 'boss');
  assert.equal(h.run('loadConfig().candidateResumeText'), '本机原文');
  h.run('state.resumeImport.busy=true;');
  await h.run(`handleResumeImportAction('read-boss-resume')`);
  assert.equal(h.requests.length, 0);
});
