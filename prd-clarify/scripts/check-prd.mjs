#!/usr/bin/env node
/**
 * PRD 完整度检查脚本（零依赖，Node 18+）。
 *
 * 用法：node check-prd.mjs <PRD 文件路径>
 * 退出码：0 = 通过（可能有警告）；1 = 有错误；2 = 用法错误或文件读不到。
 *
 * 只检查能用规则判断的结构问题；"产品经理是否真的确认过"这类事实无法由脚本判断，
 * 需要人工查看 PRD 的「澄清记录」。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_STATUS = ['草稿', '待补充', '可开发'];

/** 正文（第 1～13 节）禁用的模糊词 */
const VAGUE_WORDS = ['快速', '及时', '友好', '合理', '适当', '尽量', '之类', '大概', '一般情况下', '支持各种'];

/** "等"作为列举省略时才算模糊词；排除 等待/等于/等级/相等/同等 等正常用法 */
const VAGUE_DENG = /(?<![相平同对均初高中次上下优劣])等(?=[。，,；;、\s）)]|$)/;

/** 必须存在的章节标题（按前缀匹配） */
const REQUIRED_SECTIONS = [
  '1. 背景与要解决的问题',
  '2. 目标与成功标准',
  '3. 范围',
  '4. 使用者与入口',
  '5. 主流程',
  '6. 业务规则',
  '7. 边界情况',
  '8. 权限',
  '9. 对现有功能的影响',
  '10. 通知与记录',
  '11. 验收标准',
  '12. 上线方式',
  '13. 待定事项',
  '14. 开发附录',
  '15. 澄清记录',
];

const errors = [];
const warnings = [];

/** 读取 skill 自身版本号（SKILL.md frontmatter 的 metadata.version） */
function readSkillVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const skillMd = readFileSync(join(here, '..', 'SKILL.md'), 'utf8');
    const m = skillMd.match(/^\s+version:\s*["']?([\d.]+)["']?\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** 比较两个 x.y.z 版本号，a<b 返回负数 */
function compareVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 把 markdown 按二级/三级标题切成 { title, level, start, lines } 段落 */
function splitSections(lines) {
  const sections = [];
  let current = null;
  lines.forEach((line, i) => {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) {
      current = { level: m[1].length, title: m[2].trim(), start: i + 1, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push({ no: i + 1, text: line });
    }
  });
  return sections;
}

/** 找到某个二级章节（含其下所有三级子节的内容） */
function findSection(sections, prefix) {
  const idx = sections.findIndex((s) => s.level === 2 && s.title.startsWith(prefix));
  if (idx < 0) return null;
  const merged = { ...sections[idx], lines: [...sections[idx].lines] };
  for (let j = idx + 1; j < sections.length && sections[j].level > 2; j++) {
    merged.lines.push(...sections[j].lines);
  }
  return merged;
}

/** 解析段落里的 markdown 表格数据行（跳过表头和分隔行），返回 { no, cells } */
function tableRows(lineObjs) {
  const rows = [];
  let headerSeen = false;
  for (const { no, text } of lineObjs) {
    const t = text.trim();
    if (!t.startsWith('|')) {
      headerSeen = false;
      continue;
    }
    if (/^\|[\s:|-]+\|$/.test(t)) {
      headerSeen = true; // 分隔行之后才是数据行
      continue;
    }
    if (!headerSeen) continue;
    const cells = t.slice(1, -1).split('|').map((c) => c.trim());
    rows.push({ no, cells });
  }
  return rows;
}

/** 段落去掉空行和表格后是否还有正文 */
function hasProse(lineObjs) {
  return lineObjs.some(({ text }) => text.trim() !== '' && !text.trim().startsWith('|'));
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node check-prd.mjs <PRD 文件路径>');
    process.exit(2);
  }
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`读不到文件：${file}（${e.message}）`);
    process.exit(2);
  }

  // 去掉代码块，避免模板示例或流程图干扰检查
  const lines = content.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, '')).split('\n');
  const sections = splitSections(lines);

  // ---------- 头部信息 ----------
  const headerRows = tableRows(lines.slice(0, 40).map((text, i) => ({ no: i + 1, text })));
  const header = Object.fromEntries(headerRows.map((r) => [r.cells[0], r.cells[1] ?? '']));

  const status = header['状态'];
  if (!status) errors.push('头部缺少「状态」');
  else if (!VALID_STATUS.includes(status)) errors.push(`状态必须是 ${VALID_STATUS.join(' / ')} 之一，当前为「${status}」`);

  const skillVersion = readSkillVersion();
  const prdVersion = header['Skill 版本'];
  if (!prdVersion) errors.push('头部缺少「Skill 版本」');
  else if (skillVersion && /^[\d.]+$/.test(prdVersion) && compareVersion(prdVersion, skillVersion) < 0) {
    warnings.push(`PRD 由旧版 skill（${prdVersion}）生成，当前版本 ${skillVersion}，建议按新版重新自检`);
  }

  // 澄清进度里的待定数
  const progress = header['澄清进度'] ?? '';
  const pendingInProgress = progress.match(/待定\s*(\d+)/);
  if (!pendingInProgress) errors.push('头部「澄清进度」需写成：已确认 n 项 / 不适用 n 项 / 待定 n 项');

  // ---------- 章节齐全 ----------
  for (const prefix of REQUIRED_SECTIONS) {
    if (!findSection(sections, prefix)) errors.push(`缺少章节「## ${prefix}」`);
  }

  // ---------- 未替换的占位符 ----------
  lines.forEach((text, i) => {
    const m = text.match(/<[^<>\n]*[一-龥][^<>\n]*>/);
    if (m) errors.push(`第 ${i + 1} 行有未替换的占位符：${m[0]}`);
  });

  // ---------- 3.2 本次不做 ----------
  const scope = sections.find((s) => s.level === 3 && s.title.startsWith('3.2'));
  if (!scope) errors.push('缺少「### 3.2 本次不做」');
  else if (!scope.lines.some(({ text }) => text.trim() !== '')) errors.push('「3.2 本次不做」为空；确实不排除任何内容也要写"无"并说明原因');

  // ---------- 6 业务规则：每条要有例子 ----------
  const rules = findSection(sections, '6. 业务规则');
  if (rules) {
    const ruleRows = tableRows(rules.lines).filter((r) => /^R\d+/.test(r.cells[0]));
    if (ruleRows.length === 0 && !/不适用/.test(rules.lines.map((l) => l.text).join(''))) {
      errors.push('「6. 业务规则」没有任何 R 编号的规则');
    }
    for (const r of ruleRows) {
      if (!r.cells[1]) errors.push(`第 ${r.no} 行 ${r.cells[0]} 规则内容为空`);
      if (!r.cells[2]) errors.push(`第 ${r.no} 行 ${r.cells[0]} 缺少例子`);
    }
  }

  // ---------- 7 边界情况：D1～D8 都要有答案 ----------
  const edges = findSection(sections, '7. 边界情况');
  if (edges) {
    const edgeRows = tableRows(edges.lines);
    for (let k = 1; k <= 8; k++) {
      const row = edgeRows.find((r) => r.cells[0] === `D${k}`);
      if (!row) errors.push(`「7. 边界情况」缺少 D${k}`);
      else if (!row.cells[2]) errors.push(`第 ${row.no} 行 D${k}（${row.cells[1]}）没有写系统应该怎么做；不适用请写"不适用：理由"`);
    }
  }

  // ---------- 11 验收标准：EARS 句式 ----------
  const ac = findSection(sections, '11. 验收标准');
  if (ac) {
    const acRows = tableRows(ac.lines).filter((r) => /^AC\d+/.test(r.cells[0]));
    if (acRows.length === 0) errors.push('「11. 验收标准」没有任何 AC 编号的验收标准');
    for (const r of acRows) {
      const text = r.cells[1] ?? '';
      if (!/当.+时.*应/.test(text)) errors.push(`第 ${r.no} 行 ${r.cells[0]} 不是"当……时，系统应……"句式`);
      if (!r.cells[2]) warnings.push(`第 ${r.no} 行 ${r.cells[0]} 没有标注对应的规则/边界编号`);
    }
    // 规则与边界的覆盖情况（只警告，不阻断）
    const covered = acRows.map((r) => r.cells[2] ?? '').join(' ');
    const ruleIds = rules ? tableRows(rules.lines).map((r) => r.cells[0]).filter((id) => /^R\d+$/.test(id)) : [];
    for (const id of ruleIds) {
      if (!new RegExp(`\\b${id}\\b`).test(covered)) warnings.push(`规则 ${id} 没有被任何验收标准覆盖`);
    }
    // 标为"不适用"的边界情况不要求覆盖
    const edgeIds = edges
      ? tableRows(edges.lines).filter((r) => /^D\d+$/.test(r.cells[0]) && !/^不适用/.test(r.cells[2] ?? '')).map((r) => r.cells[0])
      : [];
    for (const id of edgeIds) {
      if (!new RegExp(`\\b${id}\\b`).test(covered)) warnings.push(`边界情况 ${id} 没有被任何验收标准覆盖`);
    }
  }

  // ---------- 13 待定事项 与 状态一致 ----------
  const pending = findSection(sections, '13. 待定事项');
  const pendingRows = pending ? tableRows(pending.lines).filter((r) => r.cells.some((c) => c !== '')) : [];
  const pendingCount = pendingInProgress ? Number(pendingInProgress[1]) : null;
  if (status === '可开发') {
    if (pendingRows.length > 0) errors.push(`状态为「可开发」，但「13. 待定事项」还有 ${pendingRows.length} 条`);
    if (pendingCount) errors.push(`状态为「可开发」，但澄清进度里待定为 ${pendingCount} 项`);
  }
  if (status === '待补充' && pendingRows.length === 0 && pendingCount === 0) {
    warnings.push('状态为「待补充」，但没有任何待定项；若确实都已确认，状态应为「可开发」');
  }

  // ---------- 15 澄清记录 不能为空 ----------
  const log = findSection(sections, '15. 澄清记录');
  if (log && tableRows(log.lines).filter((r) => r.cells.some((c) => c !== '')).length === 0) {
    errors.push('「15. 澄清记录」为空；需要记录每轮问题和产品经理的回答，供人工核对');
  }

  // ---------- 正文模糊词（第 1～13 节） ----------
  for (const s of sections) {
    const top = s.title.match(/^(\d+)/);
    if (!top || Number(top[1]) > 13) continue;
    if (s.title.startsWith('13.')) continue; // 待定事项本身允许描述不确定内容
    for (const { no, text } of s.lines) {
      const hits = VAGUE_WORDS.filter((w) => text.includes(w));
      if (VAGUE_DENG.test(text)) hits.push('等');
      if (hits.length) errors.push(`第 ${no} 行含模糊词「${hits.join('、')}」：${text.trim().slice(0, 60)}`);
    }
  }

  // ---------- 必要正文不能只有标题 ----------
  for (const prefix of ['1. 背景与要解决的问题', '2. 目标与成功标准', '5. 主流程', '12. 上线方式']) {
    const s = findSection(sections, prefix);
    if (s && !hasProse(s.lines) && tableRows(s.lines).length === 0) errors.push(`「${prefix}」没有内容`);
  }

  // ---------- 输出 ----------
  console.log(`检查：${file}`);
  console.log(`状态：${status ?? '（未知）'}　Skill 版本：${prdVersion ?? '（未知）'}${skillVersion ? `（当前 ${skillVersion}）` : ''}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (errors.length === 0) {
    console.log(`通过（${warnings.length} 条警告）`);
    console.log('提示：脚本无法判断"产品经理是否真的确认过"，请人工查看「15. 澄清记录」。');
    process.exit(0);
  }
  console.log(`未通过：${errors.length} 个错误，${warnings.length} 条警告`);
  process.exit(1);
}

main();
