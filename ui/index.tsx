import { Component, useState, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  Activity, ArrowRight, Check, ChevronDown, CircleHelp, ClipboardCheck,
  Eye, FileText, GripVertical, Home, ListFilter, LoaderCircle,
  MapPin, Maximize2, MessageSquare, Minimize2, Minus, Play, RotateCcw, Save,
  Search, Settings2, ShieldCheck, Sparkles, Square, Terminal, Upload, X, Download, RefreshCw,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { initializeStore, usePanelStore } from "./store";
import { useSectionNavigation } from "./navigation";
import { useFloatingWindow, ResizeHandles } from "./window";
import type { CardId, PanelModel, Preferences } from "./types";

let root: Root | null = null;
let host: HTMLElement;
export function update(element: HTMLElement, model: PanelModel, preferences: Partial<Preferences>, persist: (value: Preferences) => void) {
  if (!root) {
    host = element;
    initializeStore(preferences, persist);
    root = createRoot(element, { identifierPrefix: `${element.id || "boss-demo"}-` });
    flushSync(() => {
      usePanelStore.getState().setModel(model);
      root!.render(<PanelBoundary><MotionConfig reducedMotion="user"><App /></MotionConfig></PanelBoundary>);
    });
  } else {
    flushSync(() => usePanelStore.getState().setModel(model));
  }
}

class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="nova-fallback"><strong>界面加载异常，请刷新页面</strong>
      <Button variant="destructive" data-action="stop">停止投递</Button></div> : this.props.children;
  }
}

function Field({ name, label, type = "text", area = false, min, max, step, help, maxLength, placeholder, required = false }: {
  name: string; label: string; type?: string; area?: boolean; min?: number; max?: number; step?: number; help?: string; maxLength?: number; placeholder?: string; required?: boolean;
}) {
  const value = usePanelStore(s => s.model!.config[name]);
  const id = `nova-${name}`;
  return <div className="nova-field aj-field">
    <label htmlFor={id}>{label}</label>
    {area ? <Textarea id={id} name={name} defaultValue={String(value ?? "")} maxLength={maxLength} className={name === "candidateProfile" ? "nova-profile" : ""} />
      : <Input id={id} name={name} type={type} placeholder={placeholder} maxLength={maxLength} defaultValue={String(value ?? "")} min={min} max={max} step={step} required={required} />}
    {help && <p className="nova-help">{help}</p>}
  </div>;
}
function CheckField({ name, children }: { name: string; children: ReactNode }) {
  const value = usePanelStore(s => Boolean(s.model!.config[name]));
  return <label className="nova-check aj-check"><input type="checkbox" name={name} defaultChecked={value} />
    <span>{children}</span></label>;
}
function SelectField({ name, label, options }: { name: string; label: string; options: string[][] }) {
  const value = usePanelStore(s => s.model!.config[name]);
  return <div className={`nova-field aj-field ${name === "bossGreetingMode" ? "nova-field-inline" : ""}`}><label htmlFor={`nova-${name}`}>{label}</label>
    <div className="nova-select"><select id={`nova-${name}`} name={name} defaultValue={String(value ?? "")}>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select><ChevronDown aria-hidden="true" size={16} /></div></div>;
}
function Disclosure({ title, children, open = false, icon: Icon = Settings2 }: {
  title: string; children: ReactNode; open?: boolean; icon?: LucideIcon;
}) {
  // Native details keep disclosure state during logs/counter updates and retain
  // keyboard support without a portal into the recruiting website.
  return <details className="nova-disclosure" open={open}><summary><Icon size={17} aria-hidden="true" />{title}<ChevronDown size={15} /></summary>
    <div className="nova-disclosure-content">{children}</div></details>;
}

const cards: Record<CardId, { title: string; icon: LucideIcon }> = {
  filters: { title: "投递设置", icon: ListFilter },
  greeting: { title: "打招呼用语", icon: MessageSquare },
  logs: { title: "投递进度", icon: Activity },
};
function SortableCard({ id, children, after }: { id: CardId; children: ReactNode; after?: ReactNode }) {
  const busy = usePanelStore(s => s.model!.running || s.model!.previewing || s.model!.resumeImport?.busy);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: busy });
  const Icon = cards[id].icon;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
    data-card={id} className={`nova-sortable ${isDragging ? "is-dragging" : ""}`}>
    <Card className={`nova-card nova-card-${id}`}>
      <div className="nova-card-heading"><h2><Icon size={19} aria-hidden="true" />{cards[id].title}</h2>
        <Button type="button" size="icon-sm" variant="ghost" className="nova-drag-handle" disabled={busy}
          aria-label={`拖动${cards[id].title}卡片`} title="拖动排序，也可按空格和方向键调整"
          {...attributes} {...listeners}><GripVertical size={17} /></Button></div>
      <CardContent>{children}</CardContent>
    </Card>
    {after}
  </div>;
}

function entries(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === "string");
  try { const parsed = JSON.parse(String(value)); if (Array.isArray(parsed)) return parsed; } catch (_) {}
  return String(value || "").split(/[，,\n;；、]/).map(v => v.trim()).filter(Boolean);
}
function useArrayField(name: string) {
  const initial = usePanelStore(s => s.model!.config[name]);
  const [values, setValues] = useState(() => entries(initial));
  const hidden = useRef<HTMLInputElement>(null);
  function commit(next: string[]) {
    setValues(next);
    if (hidden.current) {
      hidden.current.value = JSON.stringify(next);
      hidden.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  return { values, commit, hidden };
}
function KeywordFields({ name, label, help }: { name: string; label: string; help: string }) {
  const initial = usePanelStore(s => s.model!.config[name]);
  const sequence = useRef(0);
  const hidden = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(() => {
    const values = entries(initial);
    return (values.length ? values : [""]).map(text => ({ id: sequence.current++, text }));
  });
  function commit(next: typeof rows) {
    setRows(next.length ? next : [{ id: sequence.current++, text: "" }]);
    if (hidden.current) {
      hidden.current.value = JSON.stringify(next.map(row => row.text));
      hidden.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  return <div className="nova-field nova-keywords" role="group" aria-label={label}>
    <label>{label}</label>
    <input type="hidden" name={name} ref={hidden} defaultValue={JSON.stringify(entries(initial))} />
    <div className="nova-keyword-list">{rows.map((row, index) => <div className="nova-keyword-row" key={row.id}>
      <Input aria-label={`${label} ${index + 1}`} defaultValue={row.text} placeholder="输入一个关键词" onChange={e => {
        commit(rows.map(item => item.id === row.id ? { ...item, text: e.target.value } : item));
      }} />
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除${label} ${index + 1}`} onClick={() => commit(rows.filter(item => item.id !== row.id))}><X size={15} /></Button>
    </div>)}</div>
    <Button type="button" variant="outline" className="nova-add-keyword" onClick={() => commit([...rows, { id: sequence.current++, text: "" }])}><Plus size={15} />添加关键词</Button>
    <p className="nova-help">{help}</p>
  </div>;
}
function CompanySizes() {
  const { values, commit, hidden } = useArrayField("bossCompanySizes");
  const sizes = ["0-20人", "20-99人", "100-499人", "500-999人", "1000-9999人", "10000人以上"];
  return <div className="nova-field" role="group" aria-label="公司规模筛选"><label>公司规模（可多选）</label>
    <input type="hidden" name="bossCompanySizes" ref={hidden} defaultValue={JSON.stringify(values)} />
    <div className="nova-scale-grid"><Button type="button" variant="outline" aria-pressed={!values.length} onClick={() => commit([])}>不限规模</Button>
      {sizes.map(size => <Button key={size} type="button" variant="outline" aria-pressed={values.includes(size)} onClick={() => commit(values.includes(size) ? values.filter(v => v !== size) : [...values, size])}>
        {values.includes(size) && <Check size={14} />}{size.replace("-", "—")}</Button>)}
    </div><p className="nova-help">只投选中的公司规模，未选中的不投。选择“不限规模”时不筛选；启用筛选后，规模无法确认的岗位会跳过。</p>
  </div>;
}

function Filters() {
  const model = usePanelStore(s => s.model!);
  return <SortableCard id="filters"><div className="nova-fields">
    <div className="nova-inline-note"><Search size={16} /><span>先在招聘网站筛选岗位，助手再检查下列条件</span></div>
    <Field name="maxApplyCount" label="本轮最多投递数量" type="number" min={1} max={150} step={1} required
      help="默认 20 个，最多 150 个。达到数量后自动停止，跳过的岗位不计入。" />
    <Disclosure title="投递数量如何计算" icon={CircleHelp}>
      <p className="nova-help">BOSS 已建立沟通的岗位会计入，即使后续话术未发送成功。试运行按预览数量停止，不消耗实际沟通名额。平台实际可用额度仍然有效。</p>
    </Disclosure>
    <CheckField name="onlyOnlineBoss">{model.onlineLabel}</CheckField>
    {model.platformId === "boss" && <p className="nova-help">根据 BOSS 直聘显示的 HR／招聘方在线标记筛选；未显示在线或无法确认时跳过。</p>}
    <KeywordFields name="includeDescriptionKeywords" label="岗位详情包含关键词" help="每框一个词，命中任意一个即可。留空表示不限。" />
    <KeywordFields name="excludeDescriptionKeywords" label="岗位详情排除关键词" help="有包含词时以包含词为准，同时命中也可投；未填包含词时，命中任意排除词则跳过。" />
    {model.platformId === "boss" && <CompanySizes />}
    {model.platformId === "boss" && <Disclosure title="距家距离筛选" icon={MapPin} open={Boolean(model.config.bossDistanceEnabled)}>
      <CheckField name="bossDistanceEnabled">只投递距家范围内的岗位</CheckField>
      <Field name="bossMaxDistanceKm" label="距家直线距离上限（公里）" type="number" min={0.1} max={200} step={0.1} />
      <p className="nova-home"><Home size={16} />家庭起点：{typeof model.config.bossHomeLocation === "object" && !Array.isArray(model.config.bossHomeLocation) && model.config.bossHomeLocation?.name || "尚未同步"}</p>
      <div className="nova-button-row"><Button variant="outline" data-action="open-home">设置/修改家庭位置</Button>
        <Button variant="ghost" data-action="refresh-home" aria-label="刷新家庭位置"><RotateCcw size={16} /></Button></div>
      <p className="nova-help">在 BOSS 路线规划中选择与 App 相同的家庭起点。按直线距离筛选；无法确认地址的岗位会跳过。</p>
    </Disclosure>}
    {model.platformId === "liepin" && <Field name="liepinGreeting" label="猎聘招呼语（未自动发送时补发）" area />}
    {model.platformId === "shixiseng" && <>
      <SelectField name="shixisengResume" label="实习僧投递简历" options={[["", "请选择简历"], ["online", "在线简历"], ["attach", "附件简历（同时投递在线简历）"]]} />
      {[["shixisengReportTime", "到岗时间", ["1周内", "2周内", "1个月内", "3个月内"]],
        ["shixisengInternshipTime", "实习时长", ["3个月以内", "3-6个月", "6个月以上"]],
        ["shixisengDays", "每周出勤", ["1天", "2天", "3天", "4天", "5天", "6天"]]].map(([name, label, values]) =>
          <SelectField key={String(name)} name={String(name)} label={String(label)} options={[["", "跟随职位默认"], ...(values as string[]).map(v => [v, v])]} />)}
    </>}
    <CheckField name="debug">显示调试日志</CheckField>
  </div></SortableCard>;
}

function ResumeSource() {
  const model = usePanelStore(s => s.model!);
  const info = model.resumeImport;
  const textSource = model.config.candidateResumeSource !== "boss";
  return <div className="nova-resume-source">
    <SelectField name="candidateResumeSource" label="简历资料来源" options={[["text", "上传或粘贴简历文本"], ["boss", "读取 BOSS 在线简历"]]} />
    {textSource ? <>
      <div className="nova-field"><label htmlFor="nova-resumeTextFile"><Upload size={15} /> 上传文本文件</label>
        <Input id="nova-resumeTextFile" name="resumeTextFile" type="file" accept=".txt,.md,text/plain,text/markdown" />
        <p className="nova-help">支持 UTF-8 的 .txt / .md 文件，最大 256 KB；PDF 或 Word 请先复制正文到下方。</p></div>
      <Field name="candidateResumeText" label="简历文本（也可直接粘贴）" area maxLength={30000} help="最多 30000 字。导入只在本机处理，不会调用 AI。" />
      <Button variant="outline" data-action="prepare-resume-text">整理为经历草稿</Button>
    </> : <>
      <p className="nova-help">只读获取当前登录账号的工作、项目、教育及技能资料，不包含附件 PDF，不修改 BOSS 上的简历。</p>
      <Button variant="outline" data-action="read-boss-resume" disabled={info?.busy}>
        {info?.busy ? <LoaderCircle size={16} className="nova-spinner" /> : <FileText size={16} />}读取我的 BOSS 在线简历</Button>
      {Boolean(model.config.candidateBossResumeText) && <Disclosure title="上次读取的简历正文" icon={FileText}>
        <Textarea aria-label="上次读取的简历正文" value={String(model.config.candidateBossResumeText)} readOnly /></Disclosure>}
    </>}
    {info?.message && <p className="nova-help" role="status">{info.message}</p>}
    {Boolean(info?.draftText) && <div className="nova-resume-draft">
      <label htmlFor="nova-resumeImportDraft">经历草稿（请核对，可修改）</label>
      <Textarea key={info?.revision} id="nova-resumeImportDraft" name="resumeImportDraft" defaultValue={info?.draftText} className="nova-profile" />
      <p className="nova-help">按原文分行整理，不自动补写成果或推算年限。请保留适合直接发送的完整经历句子。</p>
      <div className="nova-button-row"><Button data-action="apply-resume-draft">确认使用以上经历</Button>
        <Button variant="ghost" data-action="cancel-resume-import">取消本次导入</Button></div>
    </div>}
    <Disclosure title="当前用于生成话术的经历" icon={FileText}>
      <Field name="candidateProfile" label="真实经历（每行一项，可直接编辑）" area help="导入并确认后更新这里。已有资料会保留，修改后请确保经历和成果真实。" />
      {Boolean(model.config.candidateProfileBackup) && <Button variant="outline" data-action="restore-resume-profile">恢复上次经历</Button>}
    </Disclosure>
  </div>;
}

function VersionUpdateDialog() {
  const info = usePanelStore(s => s.model!.versionUpdate);
  if (!info) return null;
  const available = info.kind === "available", installed = info.kind === "installed";
  const latest = info.releases[0];
  return <Dialog.Root open={info.open} disablePointerDismissal onOpenChange={open => {
    if (!open) host.querySelector<HTMLButtonElement>('[data-action="dismiss-version-update"]')?.click();
  }}>
    <Dialog.Portal container={host} className="nova-update-portal">
      <Dialog.Backdrop className="nova-update-backdrop" />
      <Dialog.Popup className="nova-update-dialog">
        <div className="nova-update-top"><span className="nova-update-symbol">{installed ? <Check size={24} /> : <Download size={24} />}</span>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭更新提示" />}><X size={18} /></Dialog.Close></div>
        <Dialog.Title className="nova-update-title">{available ? `发现新版本 v${latest?.version}` : installed ? `已更新至 v${info.currentVersion}` : info.kind === "error" ? "暂时无法检查更新" : "当前已是最新版本"}</Dialog.Title>
        <Dialog.Description className="nova-update-description">{available ? `当前版本 v${info.currentVersion}，可选择更新或继续使用。` : installed ? "新版已加载，以下是本次新增和改进的功能。" : info.kind === "error" ? "当前版本可以继续使用，稍后再检查即可。" : `正在使用 v${info.currentVersion}。`}</Dialog.Description>
        <div className="nova-update-notes">{info.releases.map(release => <section key={release.version}>
          <div className="nova-update-release"><strong>{release.title}</strong><span>v{release.version} · {release.date}</span></div>
          <ul>{release.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
        </section>)}</div>
        {available && <p className="nova-update-help">{info.personalBuild ? "当前为个人副本，请使用个人副本构建更新。" : "更新将打开篡改猴安装页，确认安装后刷新招聘页面。已有设置会保留。"}</p>}
        {info.message && <p className="nova-update-message" role="status">{info.message}</p>}
        <div className="nova-update-actions">
          {available ? <>
            <Button className="nova-update-install" data-action="install-version-update" disabled={info.personalBuild}><Download size={16} />更新到新版</Button>
            <Dialog.Close render={<Button variant="outline" data-action="dismiss-version-update" />}>继续使用当前版本</Dialog.Close>
          </> : <>
            {info.kind === "error" && <Button data-action="check-version-update" disabled={info.checking}>{info.checking ? "正在重试…" : "重新检查"}</Button>}
            <Dialog.Close render={<Button variant={info.kind === "error" ? "outline" : "default"} data-action="dismiss-version-update" />}>{installed ? "知道了，开始使用" : "继续使用"}</Dialog.Close>
          </>}
        </div>
        {available && <p className="nova-update-footnote">继续使用后，此版本不再自动弹窗；可随时点击“检查更新”查看。</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

function GreetingSettings() {
  const model = usePanelStore(s => s.model!);
  if (model.platformId !== "boss") return null;
  const enabled = model.config.bossPersonalizedGreeting;
  const fixed = model.config.bossGreetingMode === "fixed";
  return <SortableCard id="greeting" after={<Preview />}><div className="nova-fields" key={`${Boolean(enabled)}-${fixed}`}>
    <CheckField name="bossPersonalizedGreeting">由 BOSS Greet 助手发送打招呼用语</CheckField>
    <Disclosure title="平台默认招呼说明" icon={CircleHelp} open={!enabled}>
      <p className="nova-help">关闭后将发送 BOSS 直聘平台设置的默认招呼（需先在 BOSS 直聘中开启默认招呼）。</p>
      <p className="nova-help">由助手发送时，会在开聊前自动关闭并确认 BOSS 平台自动招呼，保留原有正文；关闭失败则暂停。关闭助手发送后，如需平台默认招呼，请到 BOSS 中重新启用。</p>
    </Disclosure>
    {enabled && <>
      <SelectField name="bossGreetingMode" label="话术模式" options={[["fixed", "固定话术（无需 API）"], ["ai", "AI 定制（可选，需配置 API）"]]} />
      <div className="nova-preview-mode"><CheckField name="bossGreetingPreviewOnly">试运行：只预览招呼语，不发送</CheckField>
        <p className="nova-help">开启仅筛选并预览，不发送消息；关闭后才会实际投递。</p></div>
      {fixed ? <>
        <Field name="bossFixedGreeting" label="固定打招呼内容" area help="最多 500 字，按原文发送；不使用 AI 校对，也不自动添加问候或年限。" />
        <div className="nova-confirm"><CheckField name="bossFixedGreetingConfirmed">我已核对以上内容，同意按原文发送</CheckField>
          <p className="nova-help">修改正文后会撤销确认，请重新检查并勾选。</p></div>
      </> : <>
        <div className="nova-inline-note"><Sparkles size={17} /><span>按真实经历生成 → 重大事实核验 → 通过后发送</span></div>
        <Field name="greetingOpening" label="开场问候" placeholder="留空默认使用“您好”" maxLength={30} help="可填写自己的开场问候；留空时默认使用“您好”。" />
        {model.personalAIWorkflows ? <p className="nova-help">个人版：每条定制话术按岗位职责选择一项真实 AI 工作流亮点。</p> : <CheckField name="bossGreetingIncludeAI">字数允许时补充经历中的 AI 提效亮点</CheckField>}
        <Field name="candidateIntro" label="我的简介（一句话，可留空）" />
        <Field name="candidateExperience" label="真实工作年限" />
        <ResumeSource />
        <Field name="bossGreetingMaxLength" label="目标字数（180—500）" type="number" min={180} max={500} help={`目标约 ${Number(model.config.bossGreetingMaxLength) || 300} 字，至少 ${Math.ceil((Number(model.config.bossGreetingMaxLength) || 300) * 2 / 3)} 字且不超过目标（标点计入）。岗位信息不足时，补充已确认简历中的真实亮点。`} />
        <Disclosure title="AI 服务（仅此模式需要）" icon={Sparkles}>
          <p className="nova-help">经历、岗位描述和话术将发送到你配置的服务。发送前仅核验重大事实风险，普通优化建议不拦截。</p>
          <CheckField name="bossGreetingUseAI">使用 AI 生成岗位定制话术</CheckField>
          <Field name="greetingAIEndpoint" label="完整 Chat Completions 接口地址" />
          <Field name="greetingAIModel" label="模型名称" />
          <CheckField name="rememberGreetingKey">在本机保存 AI 密钥</CheckField>
          <p className="nova-help">默认只在当前页面保留。开启后写入篡改猴专用存储，可能随篡改猴备份导出；关闭即清除，更换接口后须重新输入。</p>
          <div className="nova-key-status"><ShieldCheck size={17} />{model.hasKey ? "本次页面已配置密钥" : "尚未配置密钥"}</div>
          <Button variant="outline" data-action="set-greeting-key">设置 AI 密钥</Button>
          {Boolean(model.config.greetingAllowedHttpOrigin) && <p className="nova-help">已指定的 HTTP 接口：{String(model.config.greetingAllowedHttpOrigin)}。该接口使用明文传输。</p>}
        </Disclosure>
      </>}
    </>}
    <Disclosure title="自动恢复" icon={RotateCcw}>
      <CheckField name="autoRecoveryEnabled">临时故障自动恢复（最多 3 次）</CheckField>
      <p className="nova-help">等待 30/60/120 秒恢复列表或模型连接故障。验证码、平台限制、发送结果不明、完成或手动停止时不会重启。</p>
    </Disclosure>
  </div></SortableCard>;
}

function Preview() {
  const model = usePanelStore(s => s.model!);
  const platform = !model.config.bossPersonalizedGreeting;
  const preview = !platform && model.preview?.origin !== "platform" ? model.preview : null;
  const fixed = model.config.bossGreetingMode === "fixed";
  return <Card className="nova-card nova-card-preview" data-card="preview">
    <div className="nova-card-heading"><h2><Eye size={19} aria-hidden="true" />话术预览</h2></div>
    <CardContent>
    {preview ? <div className="aj-preview-box">
      <div className="nova-preview-job"><FileText size={17} /><strong>{preview.job}</strong></div>
      <p className="nova-help">{preview.source} · {Array.from(preview.text).length} 字</p>
      <div className="aj-preview">{preview.text}</div>
      <div className={`nova-review ${preview.status === "passed" || preview.status === "user-confirmed" ? "is-reviewed" : ""}`}><ClipboardCheck size={16} />{preview.review}</div>
    </div> : <div className="nova-empty"><div className="nova-empty-icon"><MessageSquare size={24} /></div>
      <strong>{platform ? "当前使用 BOSS 平台默认招呼" : "先看看你的打招呼内容"}</strong>
      <p>{platform ? "请在 BOSS 直聘的“设置打招呼语”中查看和修改。开启 BOSS Greet 发送后，可在这里预览手动填写或 AI 生成的内容。" : fixed ? "先按当前投递条件找到合适岗位，再预览你填写的固定用语。" : "先按当前投递条件找到合适岗位，再结合真实经历生成话术并展示校对结果。"}</p>
      {!platform && <span>预览不会开聊或发送消息</span>}</div>}
    {model.previewProgress && <p className="nova-help" role="status">{model.previewProgress}</p>}
    {model.previewError && <p className="nova-help" role="status">{model.previewError}</p>}
    {model.platformId === "boss" && !platform && <Button variant="outline" className="nova-preview-button" data-action="preview-greeting" disabled={model.running || model.previewing}>
      {model.previewing ? <LoaderCircle className="nova-spinner" size={17} /> : <Eye size={17} />}
      {model.previewing ? "正在筛选并生成…" : "筛选合适岗位并预览话术"}</Button>}
    </CardContent>
  </Card>;
}
function Logs() {
  const model = usePanelStore(s => s.model!);
  return <SortableCard id="logs"><div className="aj-logs" role="log" aria-label="投递进度">
    {model.logs.length ? model.logs.map((item, index) => <div className={`aj-log aj-log-${item.level}`} key={`${item.time}-${item.message}-${index}`}>
      <span className="nova-log-dot" /><div><span className="nova-log-message">{item.message}</span><time>{item.time}</time></div>
    </div>) : <div className="nova-empty nova-empty-small"><Terminal size={23} /><p>暂无记录，开始投递后在此查看进展。</p></div>}
  </div>
    {model.platformId === "boss" && <Disclosure title="检查工具" icon={CircleHelp}>
      <Button variant="outline" data-action="audit-delivery" disabled={model.running || model.previewing}>核查未确认发送（只读）</Button>
      <Button variant="outline" data-action="check-job-detail" disabled={model.running || model.previewing}>检查岗位详情读取</Button>
        <Button variant="outline" data-action="probe-pagination" disabled={model.running || model.previewing}>检查/加载更多（不投递）</Button>
    </Disclosure>}
  </SortableCard>;
}

function HomeSetup() {
  const model = usePanelStore(s => s.model!);
  return <div className="nova-home-setup"><h2><Home size={21} />同步家庭起点</h2>
    <p>在 BOSS 地图左侧搜索与 App 家庭位置相同的地标，点击候选结果，再同步起点。</p>
    <p className="nova-help">网页端无法直接读取 App 已存家庭地址。不会把“我的位置”作为家庭地址，家庭位置不发送给 AI 服务。</p>
    <Button data-action="sync-home">同步当前起点为家庭位置</Button>
    <p className="nova-help">{typeof model.config.bossHomeLocation === "object" && !Array.isArray(model.config.bossHomeLocation) && model.config.bossHomeLocation?.name ? `已同步：${model.config.bossHomeLocation.name}` : "尚未同步家庭位置"}</p>
    <div className="aj-logs">{model.logs.map((item, i) => <p className={`aj-log aj-log-${item.level}`} key={i}>{item.message}</p>)}</div>
  </div>;
}

function WorkspacePanels({ settings, insights }: { settings: ReactNode; insights: ReactNode }) {
  const preferences = usePanelStore(s => s.preferences);
  // Do not feed freshly persisted ratios back into an in-progress resize. The
  // library owns the live layout; restore the saved ratio only on a new mount.
  const [defaultLayout] = useState(() => preferences.layout);
  return <Group orientation="horizontal" defaultLayout={defaultLayout} className="nova-panel-group" id={`${host.id || "boss-demo"}-workspace`}
    onLayoutChanged={(layout, meta) => { if (meta.isUserInteraction) usePanelStore.getState().setPreferences({ layout }); }}>
    <Panel id="settings" minSize="45%" maxSize="75%"><div className="nova-column-scroll">{settings}</div></Panel>
    <Separator className="nova-separator" aria-label="调整设置和记录的分栏宽度"><GripVertical size={14} /></Separator>
    <Panel id="insights" minSize="25%"><div className="nova-column-scroll">{insights}</div></Panel>
  </Group>;
}

function App() {
  const model = usePanelStore(s => s.model!);
  const preferences = usePanelStore(s => s.preferences);
  const activeNav = usePanelStore(s => s.activeNav);
  const setPreferences = usePanelStore(s => s.setPreferences);
  const reduceMotion = useReducedMotion();
  const { wide: wideViewport, startGesture } = useFloatingWindow(host, preferences, Boolean(model.collapsed), setPreferences);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: reduceMotion ? "auto" : "smooth" }));
  const expanded = wideViewport && !model.homeSetup;
  host.dataset.expanded = String(expanded);
  host.dataset.collapsed = String(model.collapsed);
  host.dataset.homeSetup = String(model.homeSetup);
  host.classList.toggle("is-collapsed", model.collapsed);
  const busy = model.running || model.previewing || model.resumeImport?.busy;
  const navigation = [
    ...preferences.settingsOrder.flatMap(id => id === "filters"
      ? [{ id: "filters", label: "投递设置", icon: ListFilter }]
      : id === "greeting" && model.platformId === "boss" ? [{ id: "greeting", label: "打招呼", icon: MessageSquare }] : []),
    { id: "logs", label: "投递进度", icon: Activity },
  ];
  const navigate = useSectionNavigation(host, !model.collapsed && !model.homeSetup,
    `${expanded}-${model.platformId}-${preferences.settingsOrder.join(",")}`, reduceMotion);
  function onDragEnd(event: DragEndEvent) {
    if (event.over) usePanelStore.getState().reorder(event.active.id as CardId, event.over.id as CardId);
  }
  function settingsColumn() {
    return <form className="aj-form nova-settings-column" data-role="config-form" onSubmit={e => e.preventDefault()}>
      <fieldset disabled={busy}>
        <SortableContext items={preferences.settingsOrder} strategy={verticalListSortingStrategy}>
          {preferences.settingsOrder.map(id => id === "filters" ? <Filters key={id} /> : <GreetingSettings key={id} />)}
        </SortableContext>
      </fieldset>
    </form>;
  }
  function insightsColumn() {
    return <div className="nova-insights-column"><SortableContext items={preferences.insightOrder} strategy={verticalListSortingStrategy}>
      {preferences.insightOrder.map(id => <Logs key={id} />)}
    </SortableContext></div>;
  }
  return <motion.div className="nova-app" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
    <div role="banner" className="nova-header" title="按住标题栏拖动窗口" onPointerDown={event => startGesture(event, "move")}><div className="nova-brand"><span className="nova-brand-mark"><ArrowRight size={22} /></span>
      <div className="nova-brand-text" title={`${model.platform} · 投递助手 · v${model.version}`}><div className="aj-title">BOSS <span>Greet</span></div><p className="nova-version">v{model.version}</p></div></div>
      <div className="nova-window-actions">
        <Button variant="ghost" size="icon" aria-label="恢复默认位置和大小" title="恢复默认位置和大小" onClick={() => setPreferences({ windowBounds: null, expanded: false })}><RotateCcw size={15} /></Button>
        {!model.homeSetup && <Button variant="ghost" size="icon" aria-label={expanded ? "切换紧凑面板" : "展开工作台"}
          title={expanded ? "切换紧凑面板" : "展开工作台"} onClick={() => setPreferences({ expanded: !expanded, windowBounds: null })}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</Button>}
        <Button variant="ghost" size="icon" data-action="toggle-collapse" aria-label={model.collapsed ? "展开助手" : "收起助手"} title={model.collapsed ? "展开助手" : "收起助手"}>
          {model.collapsed ? <ChevronDown size={19} /> : <Minus size={19} />}</Button>
      </div>
    </div>
    <AnimatePresence initial={false}>
      {!model.collapsed && <motion.div key="body" className="nova-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.12 }}>
        {model.homeSetup ? <HomeSetup /> : <>
          <div role="navigation" className="nova-nav" aria-label="助手导航">{navigation.map(({ id, label, icon: Icon }) =>
            <Button key={id} variant="ghost" data-nav={id} className={activeNav === id ? "is-active" : ""} onClick={() => navigate(id)} aria-current={activeNav === id ? "page" : undefined}>
              <Icon size={19} /><span>{label}</span></Button>)}
            <div className="nova-nav-foot"><ShieldCheck size={16} /><span>配置保存在本机</span></div></div>
          <div role="main" className="nova-main">
            <section className="nova-overview" aria-label="固定工作台状态">
            <div className="nova-heading"><h1>投递工作台</h1>
              <Badge className={model.running ? "nova-status is-running" : "nova-status"}><span className="nova-status-dot" />{model.status}</Badge></div>
            <div className="nova-metrics aj-status" aria-label="本轮投递统计">
              {[["scanned", "已扫描", Search], ["matched", "已匹配", Check], ["applied", "已投递", ArrowRight], ["skipped", "已跳过", X]].map(([key, label, Icon]) => {
                const MetricIcon = Icon as LucideIcon;
                return <div className="nova-metric aj-stat" key={String(key)}><span className="nova-metric-label"><MetricIcon size={15} />{String(label)}</span>
                  <b>{model.counters[key as keyof PanelModel["counters"]]}</b></div>;
              })}
            </div>
            <div className="nova-current aj-current"><span title={model.current}><Activity size={14} /><span className="nova-current-message">{model.current}</span></span>
              <span className="nova-current-detail">失败 {model.counters.failed} · 预览 {model.counters.previewed} · 今日 {model.dailyCount}/{model.dailyLimit}
                {` · 本轮进度 ${model.roundUsed ?? model.counters.applied}/${model.roundLimit || model.config.maxApplyCount || 20}`}
                {model.remainingQuota !== null && ` · 平台剩余 ${model.remainingQuota}`}</span></div>
            </section>
            <div className="nova-content">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
              accessibility={{ screenReaderInstructions: { draggable: "按空格开始拖动卡片，方向键调整顺序，再按空格放下，按 Escape 取消。" } }}>
              <div className="nova-workspace aj-body">
                {expanded && wideViewport ? <WorkspacePanels settings={settingsColumn()} insights={insightsColumn()} /> : <>{settingsColumn()}{insightsColumn()}</>}
              </div>
            </DndContext>
            </div>
            <div role="contentinfo" className="nova-actions aj-actions"><div className="nova-primary-actions">
              <Button className="nova-start" data-action="start" disabled={busy}>
                {model.running ? <LoaderCircle size={18} className="nova-spinner" /> : <Play size={18} />} {model.running ? "正在投递" : "开始投递"}</Button>
              <Button variant="destructive" data-action="stop" disabled={!model.canStop}><Square size={16} />停止</Button>
              <Button variant="outline" data-action="save-config" disabled={busy}><Save size={16} />保存设置</Button>
            </div><div className="nova-footer-meta"><Button variant="ghost" className="nova-check-update" data-action="check-version-update" disabled={model.versionUpdate?.checking}
              title={model.versionUpdate?.status || "查看最新版本及更新说明"}>
              <RefreshCw size={12} className={model.versionUpdate?.checking ? "nova-spinner" : ""} />{model.versionUpdate?.checking ? "检查中…" : "检查更新"}</Button>
              <span className="nova-autosave">{model.demo ? "演示设置仅本页有效" : "设置自动保存到本机"}</span></div></div>
          </div>
        </>}
      </motion.div>}
    </AnimatePresence>
    {!model.collapsed && <ResizeHandles startGesture={startGesture} />}
    <VersionUpdateDialog />
  </motion.div>;
}
