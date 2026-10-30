# 开发与发布

[返回项目首页](../README.md)

## 界面与交互

使用 React + [shadcn/ui Nova](https://ui.shadcn.com/docs/installation/manual) 组件，以青柠绿 `#6BD400` 为导航强调色，绿色用于投递操作、暖葡萄紫用于预览等辅助操作，搭配暖浅灰绿 `#F4F5EF` 背景和深色中文文字。

- Lucide 图标、Motion 动画；跟随系统的“减少动态效果”偏好。
- 默认显示左下角紧凑面板，点击右上角展开图标切换为双栏工作台。
- 标题、导航、紧凑的投递工作台和底部操作按钮保持固定，中间的设置及日志滚动；点击导航跳转到对应内容，不移动招聘网站页面。
- 导航仅保留「投递设置 → 打招呼（含话术预览）→ 投递进度」，滚动时自动同步高亮；固定工作台不再占用导航按钮。
- 工作台使用 react-resizable-panels，可拖动中间分隔条调整宽度。
- 卡片使用 dnd-kit，可通过右上角手柄在同一栏内排序；键盘可按空格抓取、方向键移动、空格放下、Esc 取消。
- 话术预览紧跟打招呼设置，排序时一起移动；投递进度展示当前处理情况。
- 话术预览展示手动填写的固定用语或 AI 定制结果，不开聊、不发送。关闭 BOSS Greet 发送后，平台默认招呼请在 BOSS 直聘的「设置打招呼语」中查看和修改；助手不读取平台招呼正文。
- Zustand 管理界面状态；分栏宽度、卡片顺序和展开偏好保存在对应脚本的本机存储中。
- 修改配置会自动保存；已有配置、投递记录、密钥保存偏好沿用原来的独立存储。投递中不能改配置或卡片顺序，停止按钮保持可用。

本地查看可交互演示（虚构数据，不会投递、不调用 AI，演示输入仅保留在当前页面）：

```bash
npm ci
npm run preview
```

打开 `http://127.0.0.1:4178`。演示是实际 React 组件，安装脚本中的界面与其共用源码。

项目仓库：[iruriQ/BOSS-Greet](https://github.com/iruriQ/BOSS-Greet)。

## 开发与检查

需要 Node.js。执行：

```bash
npm ci
npm run check
npm run typecheck
npm test
npm run test:browser
npm run test:ui
npm run check:public
```

`npm run docs:screenshots` 用虚构数据重新生成首页的三张截图；使用实际脚本面板，全部请求均被本机模拟拦截。

`npm run check` 重新生成公开安装文件并检查语法。模拟浏览器测试使用独立浏览器，拦截全部请求，不使用真实账号或真实模型服务；可用 `CHROME_PATH` 指定 Chrome 可执行文件。

`npm run check:public` 检查 Git 会收录的文件，识别误加入的私人文件和疑似密钥；本机存在私人资料时，也比对已知履历和服务地址，不输出具体命中内容。它不能保证发现所有形式的私人信息，提交前仍需查看实际改动。不要直接上传整个项目目录压缩包，私人文件也可能在目录内。

主要文件：

- `src/`：功能源码，修改后重新构建。
- `ui/`：React 界面、Nova 组件与主题；构建时一并打包进脚本，运行时不依赖 CDN。
- `boss-auto-apply.user.js`：可公开发布的安装文件，默认个人资料为空。
- `candidate.example.json`：空白配置模板，不含密钥。
- `tests/`：虚构测试数据及自动验证。

### 可选：仅在本机预填个人资料

普通用户直接在面板填写即可，不需要执行此步骤。

开发者可复制 `candidate.example.json` 为 `candidate.private.json`，填写 `intro`（简介）、`experience`（年限）、`profile`（用换行分隔的真实经历）和可选的 `service.endpoint`、`service.model`。**不要把 API Key 写入文件**。若使用明确授权的远程 HTTP 服务，可在 `service.httpOrigin` 填写精确 origin（协议、主机和端口）；此例外仅允许该 origin，面板会显示明文传输提示。

```bash
npm run build:personal
```

私人产物位于 `dist-private/boss-auto-apply-personal.user.js`，保留既有私人构建的安装身份和存储键，与通用版分开。私人构建默认使用 AI 定制模式、保留额外 AI 亮点、采用本地匹配，已保存的面板偏好优先。`candidate.private.json` 和整个 `dist-private/` 均被 Git 忽略，只在本机使用。普通 `npm run build` 不读取私人文件。

可选 `aiWorkflows` 是仅私人构建载入的案例数组，每项含 `text`（已核对的真实事实）、`matchTerms`（招聘职责匹配词）和可选 `fallback: true`（无直接匹配时的通用概括）。启用该案例库后，每条定制话术按招聘职责保留一项 AI 案例，相关案例与普通简历事实一起核验；未选案例及其数字不进入该岗位生成与修正输入。原有简历不被覆盖，固定话术不受影响。普通构建的案例库始终为空；只保存通用机制与虚构测试，不提交私人案例。独立验证运行 `npm run test:personal-workflows`，拦截所有网络请求。

既有私人副本的更新保留 BOSS、猎聘、智联的网站适用范围；通用版仍支持上述五个平台。

## 发布新版

完成代码修改后，例如运行：

```bash
npm run release -- 0.9.20 "新增了某个功能" "优化了某个操作"
npm test
npm run typecheck
npm run test:ui
npm run test:updates
npm run check:public
```

该命令统一更新版本号、`releases.json`、项目说明及公开安装文件，不会提交或推送。检查通过后，把这些文件和源码一起提交到 GitHub `main` 分支，用户即可检查到新版。只上传源码、没有增加版本号和更新说明，不会触发新版本提醒。仓库仍需保持公开以提供匿名更新检查。
