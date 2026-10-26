import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applyBuildVariant } from "./build-variant.mjs";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(root, "src");
const sourceFiles = [
  "00-config.js",
  "01-adapters.js",
  "02-storage.js",
  "03-utils.js",
  "03-greeting.js",
  "03-proofread.js",
  "03-distance.js",
  "04-panel.js",
  "05-runner.js",
  "06-boss.js",
  "06-boss-pagination.js",
  "06-boss-greeting.js",
  "07-liepin.js",
  "08-zhaopin.js",
  "10-qiancheng.js",
  "11-shixiseng.js",
  "09-bootstrap.js",
];

let header = await readFile(resolve(sourceDir, "userscript-header.js"), "utf8");
if (!header.startsWith("// ==UserScript==") || !header.includes("// ==/UserScript==")) {
  throw new Error("油猴元信息头格式无效");
}

const parts = await Promise.all(
  sourceFiles.map((file) => readFile(resolve(sourceDir, file), "utf8")),
);
const profile = process.argv.includes("--personal")
  ? JSON.parse(await readFile(resolve(root, "candidate.private.json"), "utf8")) : null;
const variant = applyBuildVariant(header, parts[0], profile);
header = variant.header;
parts[0] = variant.config;

const body = parts
  .map((part) => part.replace(/\r?\n/g, "\n").trim())
  .filter(Boolean)
  .join("\n\n")
  .replace(/^(?=\S)/gm, "  ");
const output = `${header.trimEnd()}\n\n(() => {\n  "use strict";\n\n${body}\n})();\n`;

const personal = process.argv.includes("--personal");
const outputPath = personal ? resolve(root, "dist-private/boss-auto-apply-personal.user.js") : resolve(root, "boss-auto-apply.user.js");
if (personal) await mkdir(resolve(root, "dist-private"), { recursive: true });
await writeFile(outputPath, output);
console.log(`已构建 ${personal ? "dist-private/boss-auto-apply-personal.user.js" : "boss-auto-apply.user.js"}（${sourceFiles.length} 个源码片段）`);
