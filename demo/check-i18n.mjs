#!/usr/bin/env node
/**
 * 原型自检：中英词条 key 一致性 + 代码里引用的 key 是否都存在。
 *
 * 词条分两处：i18n.js（主线）与 i18n.interview.js（面试模块，实验性）。
 * 面试模块整体可移除，因此两处都参与检查，但任何一处缺失都会报错。
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

const BASE = require(join(here, 'i18n.js'));
const INTERVIEW = require(join(here, 'i18n.interview.js'));

// 合并成一张表：面试模块的词条覆盖在主线词条之上
const I18N = {
  en: Object.assign({}, BASE.en, INTERVIEW.en),
  zh: Object.assign({}, BASE.zh, INTERVIEW.zh),
};

const sources = {
  'app.js': readFileSync(join(here, 'app.js'), 'utf8'),
  'interview.js': readFileSync(join(here, 'interview.js'), 'utf8'),
};

const enKeys = Object.keys(I18N.en).sort();
const zhKeys = Object.keys(I18N.zh).sort();

const problems = [];

// 1) 两种语言的 key 集合必须完全一致
const missingInZh = enKeys.filter((k) => !I18N.zh[k]);
const missingInEn = zhKeys.filter((k) => !I18N.en[k]);
if (missingInZh.length) problems.push(`zh 缺少 ${missingInZh.length} 个 key: ${missingInZh.join(', ')}`);
if (missingInEn.length) problems.push(`en 缺少 ${missingInEn.length} 个 key: ${missingInEn.join(', ')}`);

// 1b) i18n.interview.js 自身也要中英对齐
const intvEn = Object.keys(INTERVIEW.en).sort();
const intvZh = Object.keys(INTERVIEW.zh).sort();
const intvMissing = intvEn.filter((k) => !INTERVIEW.zh[k]).concat(intvZh.filter((k) => !INTERVIEW.en[k]));
if (intvMissing.length) problems.push(`i18n.interview.js 中英不一致: ${intvMissing.slice(0, 8).join(', ')}`);

// 2) 源码中静态引用的 t('...') 必须都能在词条里找到
//    （像 t('roles.' + u.role) 这种拼接只留下前缀，要按前缀排除，家族成员在第 3 步单独核对）
const literalKeys = new Set();
const literalRe = /\bt\(\s*'([^']+)'/g;
Object.values(sources).forEach((src) => {
  let m;
  while ((m = literalRe.exec(src)) !== null) literalKeys.add(m[1]);
});

// 3) 动态拼接的 key 家族，逐个家族核对成员是否齐全
const families = [
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
if (unknown.length) problems.push(`源码引用了未定义的 key: ${unknown.join(', ')}`);

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

console.log(`en key 数: ${enKeys.length}（主线 ${Object.keys(BASE.en).length} + 面试 ${intvEn.length}）| zh key 数: ${zhKeys.length}`);
console.log(`静态引用: ${literalKeys.size} | 动态家族覆盖: ${dynamicCovered.length} | 未被直接引用: ${unused.length}`);
if (process.argv.includes('--verbose') && unused.length) console.log('未被直接引用: ' + unused.join(', '));

if (problems.length) {
  console.error('\n✗ 发现问题:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\n✓ 词条检查通过：中英 key 完全一致，且源码引用的 key 全部存在。');
