import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applyBuildVariant } from "./build-variant.mjs";
import { fileURLToPath } from "node:url";
import { buildNovaUI } from "./build-ui.mjs";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(root, "src");
const sourceFiles = [
  "00-config.js",
  "01-adapters.js",
  "02-storage.js",
  "03-utils.js",
  "03-resume.js",
  "03-greeting.js",
  "03-proofread.js",
  "03-distance.js",
  "03-recovery.js",
  "03-greeting-ownership.js",
  "03-updates.js",
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
const releaseManifest = JSON.parse(await readFile(resolve(root, "releases.json"), "utf8"));
const packageInfo = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = parts[0].match(/const VERSION = "([^"]+)";/)?.[1];
if (version !== packageInfo.version || version !== releaseManifest.latest || !header.includes(`// @version      ${version}\n`)) {
  throw new Error("版本号不一致，请使用 npm run release 准备发布");
}
const updatesIndex = sourceFiles.indexOf("03-updates.js");
// Reuse the same strict schema validator as the installed updater. A malformed
// built-in changelog must fail the build rather than break panel startup.
runInNewContext(parts[updatesIndex] + "\nvalidateReleaseManifest(manifestInput);", {
  APP_ID: "build-validation", manifestInput: releaseManifest,
}, { timeout: 1000 });
if (JSON.stringify(releaseManifest).length > 180000) throw new Error("更新说明过长，请归档部分旧版本");
parts[updatesIndex] = parts[updatesIndex].replace(/^const BUILTIN_RELEASES = .*; \/\/ @release-manifest$/m,
  () => `const BUILTIN_RELEASES = ${JSON.stringify(releaseManifest)}; // @release-manifest`);
const profile = process.argv.includes("--personal")
  ? JSON.parse(await readFile(resolve(root, "candidate.private.json"), "utf8")) : null;
const variant = applyBuildVariant(header, parts[0], profile);
header = variant.header;
parts[0] = variant.config;
parts.splice(1, 0, await buildNovaUI(root));

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
