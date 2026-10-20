#!/usr/bin/env node
/**
 * 原型自检：中英词条 key 一致性 + app.js 里引用的 key 是否都存在。
 *
 * 用法: node check-i18n.mjs
 * 退出码: 0 通过 / 1 失败
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const I18N = require(join(here, 'i18n.js'));
const studioCopy = require(join(here, 'pdf-course-i18n.js'));
Object.assign(I18N.en, studioCopy.en);
Object.assign(I18N.zh, studioCopy.zh);
const appSrc = ['app.js', 'pdf-course.js'].map((file) => readFileSync(join(here, file), 'utf8')).join('\n');

const enKeys = Object.keys(I18N.en).sort();
const zhKeys = Object.keys(I18N.zh).sort();

const problems = [];

// 1) 两种语言的 key 集合必须完全一致
const missingInZh = enKeys.filter((k) => !I18N.zh[k]);
const missingInEn = zhKeys.filter((k) => !I18N.en[k]);
if (missingInZh.length) problems.push(`zh 缺少 ${missingInZh.length} 个 key: ${missingInZh.join(', ')}`);
if (missingInEn.length) problems.push(`en 缺少 ${missingInEn.length} 个 key: ${missingInEn.join(', ')}`);

// 2) app.js 中静态引用的 t('...') 必须都能在词条里找到
//    （像 t('roles.' + u.role) 这种拼接只留下前缀，要按前缀排除，家族成员在第 3 步单独核对）
const literalKeys = new Set();
const literalRe = /\bt\(\s*'([^']+)'/g;
let m;
while ((m = literalRe.exec(appSrc)) !== null) literalKeys.add(m[1]);

// 3) 动态拼接的 key 家族，逐个家族核对成员是否齐全
const families = [
  ['studio.topic.', ['requirements', 'agents', 'testing']],
  ['studio.level.', ['beginner', 'intermediate']],
  ['studio.generating', ['0', '1', '2']],
  ['roles.', ['admin', 'teacher', 'student']],
  ['interview.job.', ['frontend', 'backend', 'data', 'product', 'marketing']],
  ['interview.experience.', ['student', 'earlyCareer', 'careerChange']],
  ['interview.q.skills.', ['frontend', 'backend', 'data', 'product', 'marketing']],
  ['interview.q.scenario.', ['frontend', 'backend', 'data', 'product', 'marketing']],
  ['interview.q.growth.', ['student', 'earlyCareer', 'careerChange']],
  ['courseStatus.', ['draft', 'published', 'archived']],
  ['enrollStatus.', ['apply', 'pending', 'enrolled', 'rejected', 'full', 'closed']],
  ['catalog.policy', ['Open', 'Approval', 'Closed']],
  ['manage.tab', ['Info', 'Materials', 'Members', 'Applications']],
  ['audit.', ['actLogin', 'actRegister', 'actApply', 'actApprove', 'actReject', 'actWithdraw',
    'actUpload', 'actDeleteMat', 'actAddMember', 'actRemoveMember', 'actDisable', 'actEnable',
    'actRole', 'actResetPwd', 'actArchive', 'actCreateCourse', 'actUpdateCourse']],
  ['errors.', ['forbidden', 'notFound']],
  ['toast.', ['applied', 'withdrawn', 'approved', 'rejected', 'memberAdded', 'memberRemoved',
    'memberExists', 'userNotFound', 'materialUploaded', 'materialDeleted', 'courseUpdated',
    'userDisabled', 'userEnabled', 'roleChanged', 'loggedOut', 'notPdf', 'tooLarge', 'noFile']],
];

const familyPrefixes = families.map(([p]) => p);
const isDynamicPrefix = (key) => key.endsWith('.') || familyPrefixes.some((p) => p === key || p.startsWith(key) || key.startsWith(p));

const unknown = [...literalKeys].filter((k) => !I18N.en[k] && !isDynamicPrefix(k)).sort();
if (unknown.length) problems.push(`app.js 引用了未定义的 key: ${unknown.join(', ')}`);

families.forEach(([prefix, members]) => {
  members.forEach((member) => {
    const key = prefix + member;
    if (!I18N.en[key]) problems.push(`动态 key 缺失: ${key} (en)`);
    if (!I18N.zh[key]) problems.push(`动态 key 缺失: ${key} (zh)`);
  });
});

// 4) 统计（供参考）
const dynamicCovered = enKeys.filter((k) => familyPrefixes.some((p) => k.startsWith(p)));
const unused = enKeys.filter((k) => !literalKeys.has(k) && !familyPrefixes.some((p) => k.startsWith(p)));

console.log(`en key 数: ${enKeys.length} | zh key 数: ${zhKeys.length}`);
console.log(`app.js 静态引用: ${literalKeys.size} | 动态家族覆盖: ${dynamicCovered.length} | 未被直接引用: ${unused.length}`);
if (process.argv.includes('--verbose') && unused.length) console.log('未被直接引用: ' + unused.join(', '));

if (problems.length) {
  console.error('\n✗ 发现问题:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\n✓ 词条检查通过：中英 key 完全一致，且 app.js 引用的 key 全部存在。');
