import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validVersion = value => /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/.test(value);
export function prepareRelease(files, version, notes, date) {
  const manifest = JSON.parse(files['releases.json']);
  if (!validVersion(version) || !validVersion(manifest.latest)) throw Error('请使用三段版本号，例如 0.9.1');
  const a = version.split('.').map(Number), b = manifest.latest.split('.').map(Number);
  const index = a.findIndex((value, i) => value !== b[i]);
  if (index < 0 || a[index] <= b[index]) throw Error('新版本号必须大于已发布的版本号');
  if (!notes.length || notes.length > 30 || notes.some(note => typeof note !== 'string' || !note.trim() || note.length > 1000)) throw Error('请提供 1—30 条更新说明，每条不超过 1000 字');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('发布日期无效');
  const release = { version, date, title: '本次功能更新', notes: notes.map(note => note.trim()) };
  manifest.latest = version;
  manifest.releases = [release, ...manifest.releases].slice(0, 100);
  const output = { ...files, 'releases.json': JSON.stringify(manifest, null, 2) + '\n' };
  const replacements = [
    ['src/userscript-header.js', /^\/\/ @version\s+.+$/m, `// @version      ${version}`],
    ['src/00-config.js', /const VERSION = "[^"]+";/, `const VERSION = "${version}";`],
    ['src/03-updates.js', /^const BUILTIN_RELEASES = .*; \/\/ @release-manifest$/m, `const BUILTIN_RELEASES = ${JSON.stringify(manifest)}; // @release-manifest`],
    ['README.md', /当前版本：`[^`]+`/, `当前版本：\`${version}\``],
  ];
  for (const [file, pattern, replacement] of replacements) {
    if (!pattern.test(files[file])) throw Error(`版本标记缺失：${file}`);
    output[file] = files[file].replace(pattern, () => replacement);
  }
  for (const file of ['package.json', 'package-lock.json']) {
    const data = JSON.parse(files[file]); data.version = version;
    if (data.packages?.['']) data.packages[''].version = version;
    output[file] = JSON.stringify(data, null, 2) + '\n';
  }
  return output;
}

async function main() {
  const [version, ...notes] = process.argv.slice(2);
  if (!version || !notes.length) throw Error('用法：npm run release -- 0.9.1 "新增功能说明" "改进说明"');
  const paths = ['releases.json', 'src/userscript-header.js', 'src/00-config.js', 'src/03-updates.js', 'README.md', 'package.json', 'package-lock.json'];
  const files = Object.fromEntries(await Promise.all(paths.map(async file => [file, await readFile(resolve(root, file), 'utf8')])));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const output = prepareRelease(files, version, notes, date);
  for (const file of paths) await writeFile(resolve(root, file), output[file]);
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
  console.log(`v${version} 的版本号、更新说明及安装文件已准备好。请运行测试并将这些改动一起提交到 GitHub main；本命令不会提交或上传。`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
