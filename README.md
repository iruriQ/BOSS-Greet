# BOSS Greet

专注于 **BOSS 直聘网页端**的求职投递助手，可筛选岗位、控制投递数量、发送固定或 AI 定制招呼。

**适用范围：下列功能介绍与安装步骤均以 BOSS 直聘为主。猎聘、智联招聘、前程无忧和实习僧仅保留部分基础适配，功能不完整，未完成与 BOSS 同等范围的验证，暂不建议用于这些平台。**

当前版本：`0.9.24`。 [安装助手](https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/boss-auto-apply.user.js) · [最新版下载](https://github.com/iruriQ/BOSS-Greet/releases/latest)

## 有哪些功能

| 功能 | 怎么用 |
| --- | --- |
| 岗位筛选 | 按岗位名称排除词、详情关键词、公司规模、距家距离、招聘方在线及活跃度筛选 |
| 控制数量 | 本轮最多投 1—150 个，达到数量自动停止 |
| 三种招呼方式 | BOSS 平台默认、自己填写固定话术、AI 按岗位定制，具体选择见下表 |
| 简历资料 | 上传或粘贴文本，也可读取本人 BOSS 在线简历，核对后使用 |
| 话术预览 | 先筛出合适岗位，再预览招呼；预览不开聊、不发送 |
| 投递进度 | 查看扫描、匹配、投递和跳过数量，以及处理原因 |
| 避免重复 | 保留去重记录；助手发招呼前关闭并复查 BOSS 自动招呼 |
| 窗口调整 | 拖动标题移动，拖动边缘缩放；工作台与操作按钮固定 |
| 版本提醒 | 显示新版本及更新内容，可更新或继续使用当前版本 |

## 打招呼怎么选

在「打招呼」功能中，通过「由 BOSS Greet 助手发送打招呼用语」勾选框选择：

| 方式 | 怎么选择 | 使用前准备 |
| --- | --- | --- |
| **BOSS 平台默认招呼** | **不勾选**助手发送 | 先在 BOSS 中设置并开启默认招呼；无需填写助手话术、简历或 AI API |
| **自己填写固定话术** | **勾选**助手发送 → 选择「固定话术」 | 自行输入或粘贴完整招呼，核对后勾选确认；无需简历或 AI API |
| **AI 按岗位生成** | **勾选**助手发送 → 选择「AI 定制」 | 提供并核对本人真实经历，配置 AI 接口地址、模型和密钥；按各岗位要求生成并核验 |

平台默认招呼由 **BOSS 自己发送**，助手负责筛选和发起沟通，不读取、填入平台招呼正文。选择助手发送时，会自动关闭并复查 BOSS 自动招呼以避免重复；以后切回平台默认方式，需要到 BOSS 中重新开启默认招呼。

## 看图了解

**① 投递设置：关键词独立填写、公司规模多选、自定本轮数量。**

![投递设置与进度工作台](images/demo-nova-workbench.png)

**② 固定话术：填好正文并勾选确认即可，不用配置 AI。**

<img src="images/demo-configuration.png" alt="固定话术填写与确认" width="640">

**③ AI 话术预览：按岗位生成，重大事实核验通过后展示。**

<img src="images/demo-greeting-preview.png" alt="AI 定制话术与核验结果" width="640">

截图均使用虚构岗位、经历和模拟模型回复，未向真实招聘者发送消息。

## 新手安装（电脑端）

需要电脑端 **Chrome 或 Edge + 篡改猴**。不用编程，不需要 Node.js、Python 或服务器，也无需 GitHub 账号。

1. 打开 [篡改猴官网](https://www.tampermonkey.net/)，选择自己的浏览器，在官方扩展商店安装。
2. 右键篡改猴图标 →「管理扩展程序」→ 开启「允许用户脚本」。没有此项时按 [官方说明](https://www.tampermonkey.net/faq.php?locale=zh&q=Q209) 开启开发者模式。
3. 点击 [安装助手](https://raw.githubusercontent.com/iruriQ/BOSS-Greet/main/boss-auto-apply.user.js)，在篡改猴页面点「安装」。若只显示代码，到篡改猴「管理面板 → 实用工具 → 从 URL 安装」粘贴该链接安装。
4. 登录 [BOSS 职位列表](https://www.zhipin.com/web/geek/job)并刷新，按上表选择招呼方式并完成准备。设置条件和数量，先预览；使用助手发送时，正式投递前取消「试运行：只预览招呼语，不发送」，再点「开始投递」。

**AI 与网络：** BOSS 平台默认招呼、固定话术和筛选无需 API；AI 定制需自己的接口、模型和密钥。VPN 并非必需，取决于能否访问扩展商店、GitHub 及自选 AI 接口。安装后固定模式只需招聘网站可访问。

**资料与使用：** 公开版不含私人简历或密钥；资料保存在本机，AI 模式会发送相关资料到你配置的服务。保持网页打开，只启用一份助手；遇登录异常或验证会暂停，不保证避免平台限制。

[详细使用与常见问题](docs/usage.md) · [开发与发布](docs/development.md) · [历史更新](https://github.com/iruriQ/BOSS-Greet/releases)

基于 [ultraplan-bit/boss-auto-apply](https://github.com/ultraplan-bit/boss-auto-apply) 和 [muyuniao/boss-auto-apply](https://github.com/muyuniao/boss-auto-apply) 修改，采用 [MIT 许可](LICENSE)。
