import {execFileSync} from 'node:child_process';
import {readFile, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// 依据 Git 实际会收录的文件检查，不扫描被忽略的私人产物，不输出命中内容。
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
const issues=[];
let privateProfile=null;
try { privateProfile=JSON.parse(await readFile(resolve(root,'candidate.private.json'),'utf8')); }
catch(error) { if(error.code!=='ENOENT') throw error; }
const privateNeedles=[];
if(privateProfile) {
  for(const text of [privateProfile.intro,...String(privateProfile.profile||'').split(/\r?\n/),
    ...(privateProfile.aiWorkflows || []).map(item => item.text),privateProfile.service?.endpoint]) {
    if(typeof text==='string' && text.trim().length>=12) privateNeedles.push(text.trim());
  }
  if(privateProfile.service?.endpoint) privateNeedles.push(new URL(privateProfile.service.endpoint).hostname);
}
for(const file of files) {
  if(/(^|\/)(dist-private\/|[^/]*\.private\.json$|\.env(?:\.|$))/.test(file) && !file.endsWith('.example')) {
    issues.push(`${file}：私人文件被 Git 收录`); continue;
  }
  let bytes;
  try { if(!(await stat(resolve(root,file))).isFile()) continue; bytes=await readFile(resolve(root,file)); }
  catch(error) { if(error.code==='ENOENT') continue; throw error; }
  if(bytes.includes(0)) continue;
  const text=bytes.toString('utf8');
  // A token must start at a boundary: Tailwind's mask-linear-* utilities contain
  // the substring "sk-" but are not credentials.
  if(/(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push(`${file}：疑似真实密钥`);
  if(text.includes(homedir()+'/')) issues.push(`${file}：包含本机用户目录路径`);
  if(privateNeedles.some(needle=>text.includes(needle))) issues.push(`${file}：包含本机私人履历或服务地址`);
}
if(issues.length) {
  console.error('公开文件检查未通过（仅显示路径与原因）：\n'+issues.join('\n'));
  process.exitCode=1;
} else console.log(`公开文件检查通过：${files.length}个Git候选文件未检出已知私人履历、服务地址或疑似密钥。此检查不代替发布前人工查看改动。`);
