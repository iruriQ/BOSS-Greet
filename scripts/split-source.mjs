import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = execFileSync("git", ["show", "HEAD:boss-auto-apply.user.js"], {
  cwd: root,
  encoding: "utf8",
});
const start = input.indexOf("(() => {");
const end = input.lastIndexOf("})();");
if (start < 0 || end <= start) throw new Error("无法识别油猴脚本入口");
const body = input
  .slice(start + "(() => {".length, end)
  .replace(/^\r?\n  "use strict";\r?\n\r?\n/, "");
const markers = [
  "  // =====================================================================\n  // 平台适配器",
  "  // =====================================================================\n  // 存储与历史记录",
  "  // =====================================================================\n  // 通用工具",
  "  // =====================================================================\n  // 日志、通知与面板",
  "  // =====================================================================\n  // 通用运行流程",
  "  // =====================================================================\n  // Boss 直聘",
  "  // =====================================================================\n  // 猎聘",
  "  // =====================================================================\n  // 智联招聘",
  "  // =====================================================================\n  // 前程无忧（51job）",
  "  // =====================================================================\n  // 断点续跑\n  // =====================================================================",
];
const files = [
  "00-config.js",
  "01-adapters.js",
  "02-storage.js",
  "03-utils.js",
  "04-panel.js",
  "05-runner.js",
  "06-boss.js",
  "07-liepin.js",
  "08-zhaopin.js",
  "10-qiancheng.js",
  "09-bootstrap.js",
];
const offsets = markers.map((marker) => body.indexOf(marker));
if (offsets.some((offset, index) => offset < 0 || (index > 0 && offset <= offsets[index - 1]))) {
  throw new Error("未找到按预期顺序排列的模块分界");
}
offsets.unshift(0);
await mkdir(resolve(root, "src"), { recursive: true });
for (let index = 0; index < files.length; index += 1) {
  const chunk = body.slice(offsets[index], offsets[index + 1] ?? body.length).trim();
  await writeFile(resolve(root, "src", files[index]), `${chunk}\n`);
}
console.log(`已拆分为 ${files.length} 个源码片段`);
