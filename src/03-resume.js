// Resume imports are local drafts until the user explicitly applies them.
// No model call, platform write, attachment download or job action is involved.
const MAX_CANDIDATE_RESUME_TEXT = 30000;

function prepareCandidateResumeText(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("请先上传或粘贴简历文本");
  if (value.length > MAX_CANDIDATE_RESUME_TEXT) throw new Error("简历文本最多 30000 字，请分段整理，不会截断你的资料");
  if (/[\u0000\ufffd]/.test(value)) throw new Error("文本包含乱码，请使用 UTF-8 编码的文本文件");
  const lines = [];
  let removed = 0;
  for (let line of value.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    line = line.trim().replace(/^#{1,6}\s*/, "").replace(/^(?:[-•·*]\s*|\d+[、)）]\s*|\d+[.．](?!\d)\s*)/, "");
    if (!line) continue;
    if (/^(?:姓名|性别|年龄|出生日期|生日|婚姻|婚育|民族|籍贯|户籍|手机|电话|邮箱|电子邮箱|微信|QQ|身份证|联系地址|家庭地址|现居住地址|通讯地址|name|gender|age|birthday|phone|mobile|tel|email|address|wechat)\s*[:：]/i.test(line)) { removed++; continue; }
    const redacted = line
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
      .replace(/(?<!\d)(?:\+?86[ -]?)?1[3-9]\d{9}(?!\d)/g, "")
      .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "").trim();
    if (redacted !== line) removed++;
    line = redacted;
    if (!line || /^(?:个人简历|简历|基本信息|个人信息|联系方式|工作经历|项目经历|项目经验|教育经历|教育背景|专业技能|技能特长|个人优势|自我评价|荣誉奖项|资格证书|求职意向)\s*[:：]?$/.test(line)) continue;
    // Break long paragraphs only at complete Chinese sentence boundaries.
    const parts = line.length > 400 ? line.match(/[^。！？]+[。！？]?/g) || [line] : [line];
    for (const part of parts) if (part.trim()) lines.push(part.trim());
  }
  const unique = [...new Set(lines)];
  if (!unique.length) throw new Error("没有识别到可用的经历或技能，请检查简历正文");
  if (unique.length > 200) throw new Error("简历条目超过 200 条，请分段整理，不会自动丢弃条目");
  return { text: unique.join("\n"), count: unique.length, removed,
    longLines: unique.filter(line => line.length > 400).length };
}

function parseBossOnlineResume(payload) {
  if (payload?.code !== 0 || !payload.zpData || typeof payload.zpData !== "object" || Array.isArray(payload.zpData)) {
    throw new Error("读取在线简历失败，请确认已登录 BOSS 直聘；当前经历未改变");
  }
  const data = payload.zpData;
  const readModule = (type, key) => {
    if (!data.feature?.useNewStruct) return data[key];
    if (!Array.isArray(data.moduleList)) throw new Error("在线简历格式发生变化，当前经历未改变");
    const module = data.moduleList.find(item => item?.moduleType === type && item.customConfig?.showType === 0);
    return module?.data?.[key] ?? module?.dataList ?? module?.data;
  };
  const lines = [];
  const add = value => { if (typeof value === "string" && value.trim()) lines.push(value.trim()); };
  add(readModule(11, "userDesc"));
  add(readModule(22, "professionalSkill"));
  const work = readModule(12, "workExpList");
  if (Array.isArray(work)) for (const item of work) {
    if (!item || typeof item !== "object") continue;
    const context = [item.companyName, item.customPositionName || item.positionName].filter(v => typeof v === "string" && v.trim()).join(" / ");
    for (const key of ["workContent", "workPerformance"]) {
      if (typeof item[key] === "string" && item[key].trim()) add(context ? `工作经历（${context}）：${item[key]}` : item[key]);
    }
  }
  const projects = readModule(13, "projectExpList");
  if (Array.isArray(projects)) for (const item of projects) {
    if (!item || typeof item !== "object") continue;
    const context = [item.name, item.roleName].filter(v => typeof v === "string" && v.trim()).join(" / ");
    for (const key of ["projectDesc", "performance"]) {
      if (typeof item[key] === "string" && item[key].trim()) add(context ? `项目经历（${context}）：${item[key]}` : item[key]);
    }
  }
  const education = readModule(14, "educationExpList");
  if (Array.isArray(education)) for (const item of education) {
    if (!item || typeof item !== "object") continue;
    const fields = [item.schoolName, item.majorName, item.degreeName].filter(v => typeof v === "string" && v.trim());
    if (fields.length) add(`教育经历：${fields.join(" / ")}`);
  }
  const certifications = readModule(16, "certificationList");
  if (Array.isArray(certifications)) for (const item of certifications) add(typeof item === "string" ? item : item?.name);
  if (!lines.length) throw new Error("在线简历中没有可读取的经历或技能；附件简历不在读取范围内，当前经历未改变");
  // Allow-list only. baseInfo, phone, email, birthday, address, health data,
  // attachment URLs and every unknown field are never copied into the draft.
  const prepared = prepareCandidateResumeText(lines.join("\n"));
  return { text: prepared.text, count: prepared.count, removed: prepared.removed, longLines: prepared.longLines };
}

async function readBossOnlineResume() {
  if (getAdapter()?.id !== "boss") throw new Error("请在已登录的 BOSS 直聘页面读取本人的在线简历");
  // Verified against BOSS web v6789: app~2.6a7d5ca6.js, module 41742 rf.
  // GET without a resume/user ID reads the signed-in user's own online resume.
  const response = await fetch("/wapi/zpgeek/resume/geek/preview/data.json", {
    method: "GET", credentials: "include", headers: buildBossHeaders(), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("在线简历读取失败，请稍后重试；当前经历未改变");
  return parseBossOnlineResume(await parseResponse(response));
}

function publishResumeImportDraft(prepared, source) {
  const previous = state.resumeImport;
  state.resumeImport = { busy: false, draftText: prepared.text, source, revision: (previous.revision || 0) + 1,
    message: `已整理 ${prepared.count} 条原文${prepared.removed ? "，已过滤联系方式等信息" : ""}。请核对并编辑后，点击“确认使用以上经历”。${prepared.longLines ? "部分条目较长，建议拆成完整短句。" : ""}` };
  renderPanel();
}

async function importCandidateResumeFile(file) {
  if (state.running || state.previewing || state.resumeImport.busy) return;
  if (!file) return;
  state.resumeImport.busy = true;
  state.resumeImport.draftText = "";
  state.resumeImport.message = "正在读取本机文本文件…";
  renderPanel();
  try {
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 256 * 1024) throw new Error("请选择不超过 256 KB 的 UTF-8 .txt 或 .md 文件，PDF/Word 请先复制为文本");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (!text.trim() || text.length > MAX_CANDIDATE_RESUME_TEXT) throw new Error("简历文本不能为空，且最多 30000 字");
    // Keep the complete local text; do not replace active experiences on upload.
    saveConfig({ ...config, candidateResumeSource: "text", candidateResumeText: text }, true);
    const field = cachedPanel?.querySelector('[name="candidateResumeText"]');
    if (field) field.value = text;
    state.resumeImport.draftText = "";
    state.resumeImport.message = "文本已载入。点击“整理为经历草稿”，核对后再用于生成话术。";
  } catch (error) {
    state.resumeImport.message = error instanceof TypeError ? "文件不是有效 UTF-8 文本，请重新导出；当前经历未改变" : String(error.message || "文件读取失败");
  } finally {
    state.resumeImport.busy = false;
    renderPanel();
  }
}

async function handleResumeImportAction(action) {
  if (state.running || state.previewing || state.resumeImport.busy) return;
  try {
    if (action === "prepare-resume-text") {
      saveConfig(collectFormConfig(), true);
      state.resumeImport.draftText = "";
      publishResumeImportDraft(prepareCandidateResumeText(config.candidateResumeText), "text");
    } else if (action === "read-boss-resume") {
      saveConfig(collectFormConfig(), true);
      state.resumeImport = { ...state.resumeImport, busy: true, draftText: "", message: "正在只读获取本人的在线简历…" };
      renderPanel();
      const prepared = await readBossOnlineResume();
      saveConfig({ ...config, candidateBossResumeText: prepared.text }, true);
      publishResumeImportDraft(prepared, "boss");
    } else if (action === "apply-resume-draft") {
      const prepared = prepareCandidateResumeText(state.resumeImport.draftText);
      if (!state.resumeImport.source) throw new Error("请先导入并核对简历");
      saveConfig({ ...collectFormConfig(), candidateProfileBackup: config.candidateProfile,
        candidateProfile: prepared.text, candidateProfileSource: state.resumeImport.source }, true);
      const field = cachedPanel?.querySelector('[name="candidateProfile"]');
      if (field) field.value = config.candidateProfile;
      state.lastGreeting = null;
      state.greetingPreviewError = "";
      state.resumeImport.draftText = "";
      state.resumeImport.message = "已使用核对后的经历。简介和工作年限保留原值，请自行核对。";
      log("success", "已更新生成话术所用经历，上次经历已保留，可恢复");
    } else if (action === "restore-resume-profile") {
      if (!config.candidateProfileBackup) throw new Error("暂无可恢复的上次经历");
      saveConfig({ ...config, candidateProfile: config.candidateProfileBackup, candidateProfileBackup: config.candidateProfile, candidateProfileSource: "manual" }, true);
      const field = cachedPanel?.querySelector('[name="candidateProfile"]');
      if (field) field.value = config.candidateProfile;
      state.lastGreeting = null;
      state.greetingPreviewError = "";
      state.resumeImport.message = "已恢复上次经历。";
    } else if (action === "cancel-resume-import") {
      state.resumeImport.draftText = "";
      state.resumeImport.message = "已取消本次导入，当前经历未改变。";
    }
  } catch (error) {
    state.resumeImport.message = error.name === "TimeoutError" ? "在线简历读取超时，请重试；当前经历未改变" : String(error.message || "导入失败，当前经历未改变");
  } finally {
    state.resumeImport.busy = false;
    renderPanel();
  }
}
