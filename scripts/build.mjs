import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(root, "src");
const sourceFiles = [
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
  "11-shixiseng.js",
  "09-bootstrap.js",
];

const header = await readFile(resolve(sourceDir, "userscript-header.js"), "utf8");
if (!header.startsWith("// ==UserScript==") || !header.includes("// ==/UserScript==")) {
  throw new Error("油猴元信息头格式无效");
}

const parts = await Promise.all(
  sourceFiles.map((file) => readFile(resolve(sourceDir, file), "utf8")),
);
const body = parts
  .map((part) => part.replace(/\r?\n/g, "\n").trim())
  .filter(Boolean)
  .join("\n\n")
  .replace(/^(?=\S)/gm, "  ");
const output = `${header.trimEnd()}\n\n(() => {\n  "use strict";\n\n${body}\n})();\n`;

await writeFile(resolve(root, "boss-auto-apply.user.js"), output);
console.log(`已构建 boss-auto-apply.user.js（${sourceFiles.length} 个源码片段）`);
