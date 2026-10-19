#!/usr/bin/env node
/**
 * 校验仓库内所有 Markdown 文件的相对链接是否指向真实存在的文件。
 *
 * 用法:
 *   node scripts/check-docs.mjs            # 校验
 *   node scripts/check-docs.mjs --verbose  # 打印每个被检查的链接
 *
 * 跳过: http(s)://、mailto:、纯锚点(#xxx)、代码块内的内容。
 * 退出码: 0 = 全部通过；1 = 存在失效链接。
 */
import { readdir, readFile, access } from 'node:fs/promises';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', '__pycache__']);
const verbose = process.argv.includes('--verbose');

/** 递归收集 .md 文件 */
async function collectMarkdown(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await collectMarkdown(join(dir, entry.name), out);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** 去掉 ``` 代码块，避免把示例代码里的括号当成链接 */
function stripFencedCode(text) {
  return text.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, '');
}

/** 提取 [text](target)，忽略图片 ![](...) 之外的差异（图片同样是链接，一并校验） */
function extractLinks(markdown) {
  const links = [];
  const re = /(!?)\[[^\][]*\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = re.exec(markdown)) !== null) {
    links.push(match[2]);
  }
  return links;
}

function isExternal(target) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // http:, https:, mailto:, data: 等
    target.startsWith('//') ||
    target.startsWith('#')
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const files = await collectMarkdown(ROOT);
  const broken = [];
  let checked = 0;

  for (const file of files) {
    const relFile = relative(ROOT, file).replaceAll('\\', '/');
    const markdown = stripFencedCode(await readFile(file, 'utf8'));

    for (const rawTarget of extractLinks(markdown)) {
      if (isExternal(rawTarget)) continue;

      // 去掉 #锚点、query
      const targetPath = decodeURI(rawTarget.split('#')[0].split('?')[0]);
      if (!targetPath) continue;

      // 绝对路径（/docs/x.md）按仓库根解析，相对路径按当前文件目录解析
      const resolved = targetPath.startsWith('/')
        ? resolve(ROOT, targetPath.slice(1))
        : resolve(dirname(file), targetPath);

      checked += 1;
      if (verbose) console.log(`  ${relFile} -> ${rawTarget}`);

      if (!(await exists(resolved))) {
        broken.push({ file: relFile, target: rawTarget });
      }
    }
  }

  console.log(`\n检查了 ${files.length} 个 Markdown 文件、${checked} 个相对链接。`);

  if (broken.length > 0) {
    console.error(`\n发现 ${broken.length} 个失效链接:`);
    for (const { file, target } of broken) {
      console.error(`  ✗ ${file} -> ${target}`);
    }
    process.exit(1);
  }

  console.log('✓ 所有文档链接均有效。');
}

await main();
