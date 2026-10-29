import { build } from "esbuild";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNovaUI } from "./build-ui.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uiBundle = await buildNovaUI(root);
const css = JSON.parse(uiBundle.match(/^const NOVA_PANEL_CSS = (.+);\n/)[1]);
const demo = await build({ absWorkingDir: root, entryPoints: ["ui/demo.ts"], bundle: true, write: false,
  format: "iife", jsx: "automatic", minify: true, legalComments: "inline", define: { "process.env.NODE_ENV": '"production"' } });
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOSS Greet · Nova 界面演示</title>
<style>body{margin:0;background:#e8ebdf;font-family:system-ui}body::before{content:'BOSS Greet · 本地交互演示';position:fixed;right:24px;top:16px;color:#627057;font-size:13px}${css}</style>
<div data-boss-nova></div><script>${demo.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></html>`;
const port = Number(process.env.PORT || 4178);
// Preview-only variants let users compare button palettes without changing the
// installed userscript or the application's default theme.
const blueButtonPreview = `
  [data-boss-nova] { --nova-button: #2563eb; }
  [data-boss-nova] [data-slot="button"][data-variant="outline"] { border-color: #b9cef9; }
  [data-boss-nova] [data-slot="button"][data-variant="secondary"],
  [data-boss-nova] [data-slot="button"][data-variant="ghost"]:hover { background: #edf3ff; }
  [data-boss-nova] [data-slot="button"]:focus-visible { outline-color: #91b3fa; }
  [data-boss-nova] .nova-nav [data-slot="button"]:hover { background: #e5f4d8; color: #315e00; }
  [data-boss-nova] .nova-nav [data-slot="button"].is-active:hover { background: #61c000; color: #173000; }
`;
const buttonPalettes = [
  { id: "lavender", name: "浅薰衣草紫", color: "#B095E1", ink: "#30213E" },
  { id: "ice-blue", name: "冰川浅蓝", color: "#D6E4F0", ink: "#23384B" },
  { id: "dusty-blue", name: "雾霾蓝", color: "#86A7C8", ink: "#173249" },
  { id: "teal", name: "青绿", color: "#2AA198", ink: "#072F2C" },
  { id: "muted-purple", name: "灰紫", color: "#907AA9", ink: "#21182D" },
  { id: "ocean-blue", name: "深海蓝", color: "#286983", ink: "#FFFFFF" },
  { id: "slate-purple", name: "深岩紫", color: "#464261", ink: "#FFFFFF" },
  { id: "bright-ocean-blue", name: "明亮海蓝", color: "#2E7FA0", ink: "#FFFFFF" },
  { id: "forest-green", name: "深森林绿", color: "#244D24", ink: "#FFFFFF" },
  { id: "soft-forest-green", name: "柔和森林绿", color: "#477D47", ink: "#FFFFFF" },
  { id: "fresh-forest-green", name: "鲜亮森林绿", color: "#338733", ink: "#FFFFFF" },
];
function paletteCSS(palette) {
  const saveInk = palette.ink === "#FFFFFF" ? palette.color : palette.ink;
  return `
    [data-boss-nova] .nova-actions [data-action="start"] { background: ${palette.color}; color: ${palette.ink}; }
    [data-boss-nova] .nova-actions [data-action="save-config"] { background: white; border-color: ${palette.color}; color: ${saveInk}; }
    [data-boss-nova] .nova-actions [data-action="save-config"] svg { color: ${palette.color}; }
    [data-boss-nova] .nova-actions [data-action="start"]:hover { filter: brightness(.96); }
    [data-boss-nova] .nova-actions [data-action="save-config"]:hover { background: color-mix(in srgb, ${palette.color} 12%, white); }
    [data-boss-nova] .nova-actions [data-slot="button"]:focus-visible { outline-color: ${palette.color}; }
  `;
}
// A component-only view powers the comparison page using the actual React buttons.
const buttonsOnlyCSS = `
  body { background: #f1f5e9; } body::before { display: none; }
  [data-boss-nova][data-expanded] { position: static; width: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
  [data-boss-nova] .nova-header, [data-boss-nova] .nova-nav,
  [data-boss-nova] .nova-main > :not(.nova-actions) { display: none !important; }
  [data-boss-nova] .nova-shell, [data-boss-nova] .nova-main { height: auto !important; min-height: 0 !important; display: block; padding: 0; }
  [data-boss-nova] .nova-actions { border: 0; padding: 12px; }
  [data-boss-nova] .nova-actions [data-slot="button"] { font-size: 12px; padding-inline: 8px; gap: 4px; min-width: 0; }
  [data-boss-nova] .nova-actions [data-slot="button"] svg { width: 14px; height: 14px; }
  [data-boss-nova] .nova-primary-actions { gap: 6px; }
`;
const paletteGallery = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOSS Greet · 按钮配色对比</title>
<style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#e8ebdf;color:#20291c;font-family:system-ui,-apple-system,'PingFang SC',sans-serif}main{max-width:1080px;margin:auto}h1{font-size:22px;margin:0 0 8px}p{font-size:13px;line-height:1.7;color:#59664e;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:14px}article{background:white;border:1px solid #dce1d2;border-radius:16px;overflow:hidden}header{padding:12px 14px;background:#f1f5e9;display:flex;align-items:center;gap:9px;font-size:14px;font-weight:650}.swatch{width:22px;height:22px;border-radius:7px;border:1px solid #0001}code{font-size:12px;font-weight:500;color:#59664e}a{margin-left:auto;color:#375b16;font-size:12px;text-decoration:none;white-space:nowrap}iframe{width:100%;height:100px;border:0;display:block}</style>
<main><h1>绿色主题 · ${buttonPalettes.length} 种按钮配色</h1><p>只比较底部操作按钮。点击“完整页面”查看对应案例；浅色搭配深色文字。</p><div class="grid">${buttonPalettes.map((p, i) => `<article><header><span class="swatch" style="background:${p.color}"></span><span>${i + 1}. ${p.name}<br><code>${p.color}</code></span><a href="/?buttons=${p.id}">完整页面 ↗</a></header><iframe title="${p.name}按钮" src="/?buttons=${p.id}&view=buttons"></iframe></article>`).join("")}</div></main></html>`;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/palettes") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(paletteGallery); return;
  }
  if (url.pathname !== "/") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  const variant = url.searchParams.get("buttons");
  const palette = buttonPalettes.find(p => p.id === variant);
  const extraCSS = (variant === "blue" ? blueButtonPreview : palette ? paletteCSS(palette) : "")
    + (url.searchParams.get("view") === "buttons" ? buttonsOnlyCSS : "");
  response.end(html.replace("</style>", `${extraCSS}</style>`));
});
server.listen(port, "127.0.0.1", () => console.log(`Nova 本地界面演示：http://127.0.0.1:${port}（虚构数据，零真实投递）`));
