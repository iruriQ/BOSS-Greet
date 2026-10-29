import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import prefixSelector from "postcss-prefix-selector";

export async function buildNovaUI(root) {
  const cssPath = resolve(root, "ui/styles.css");
  const css = await postcss([
    tailwindcss({ base: resolve(root, "ui"), optimize: true }),
    prefixSelector({
      prefix: "[data-boss-nova]",
      transform(prefix, selector, prefixed, filePath, rule) {
        // Tailwind property initialization and theme variables must include the
        // root itself; no preflight or selectors escape into the host website.
        if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return selector;
        if (selector === ":root" || selector === ":host") return prefix;
        if (selector.includes("[data-boss-nova]")) return selector;
        return prefixed;
      },
    }),
  ]).process(await readFile(cssPath, "utf8"), { from: cssPath });
  const js = await build({
    absWorkingDir: root,
    entryPoints: ["ui/index.tsx"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "NovaPanel",
    target: "chrome110",
    jsx: "automatic",
    minify: true,
    legalComments: "inline",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return `const NOVA_PANEL_CSS = ${JSON.stringify(css.css)};\n${js.outputFiles[0].text}`;
}
