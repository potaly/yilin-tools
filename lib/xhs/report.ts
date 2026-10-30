/**
 * 把检查结果抄成纯文本，给「复制检查报告」按钮用。
 *
 * 做这个是因为它能被截图外发 —— 零成本的传播位。正因为会外传，这里**不给分数**：
 * 页面上刻意没有「AI味指数 N/100」，报告里更不能有。一个分数被截图传出去，
 * 就成了「这篇 95 分，能发」的凭据，而词表命中和平台判违规本来就是两回事。
 *
 * 口径要和页面一致：三组都要在，词表那组的免责话必须跟着走，否则报告
 * 比页面更像一纸结论。末行只放站点名和路径，不放二维码、联系方式这类会限流的东西。
 */

import { SITE } from '@/lib/site';
import type { Report } from '@/lib/aiwei/types';
import type { ScanResult } from './scan';
import { BODY_MAX_CHARS, TITLE_MAX_UNITS } from './units';

export function checkReport(scan: ScanResult, report: Report): string {
  const lines: string[] = [];
  const { limits } = scan;

  lines.push('发布前检查');
  lines.push('');

  // 1. 需人工核实的用词
  if (scan.issues.length === 0) {
    lines.push('需人工核实的用词：词表一条都没命中。');
  } else {
    lines.push(`需人工核实的用词 ${scan.issues.length} 处：`);
    for (const i of scan.issues) {
      const hits = i.hits.map((w) => `「${w}」`).join('、');
      lines.push(`· ${i.label}${hits ? `：${hits}` : ''}`);
    }
  }
  lines.push('');

  // 2. 文字表达提示
  if (report.findings.length === 0) {
    lines.push('文字表达提示：9 条规则一条都没命中。');
  } else {
    lines.push(`文字表达提示 ${report.findings.length} 处：`);
    for (const f of report.findings) {
      lines.push(`· ${f.label}（${f.detail}）`);
    }
  }
  lines.push('');

  // 3. 格式与长度
  lines.push('格式与长度：');
  lines.push(
    `· 标题 ${limits.titleUnits}/${TITLE_MAX_UNITS} 单位` +
      (limits.titleOver > 0 ? `，超 ${limits.titleOver}` : ''),
  );
  lines.push(
    `· 正文 ${limits.bodyChars}/${BODY_MAX_CHARS} 字符` +
      (limits.tagChars > 0 ? `，其中标签 ${limits.tagChars}` : '') +
      (limits.bodyOver > 0 ? `，超 ${limits.bodyOver}` : ''),
  );
  lines.push('');

  lines.push(`全文 ${report.stats.charCount} 字，${report.stats.paraCount} 段`);
  lines.push('');
  // 这句必须跟着报告走：截图传出去的时候，口径不能掉在原页面上
  lines.push('命中词表不等于平台判违规，没命中也不等于安全。');
  lines.push(`规则公开、不调 AI：${SITE.name} /tools/check`);

  return lines.join('\n');
}
