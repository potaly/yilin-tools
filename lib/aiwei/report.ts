/**
 * 报告转纯文本，给「复制报告」按钮用。
 *
 * 做这个是因为它能被截图外发 —— 零成本的传播位。
 * 末行是署名，只放站点名和路径，不放二维码、联系方式这类会限流的东西。
 */

import { SITE } from '@/lib/site';
import { LEVEL_TEXT } from './score';
import type { Report } from './types';

export function toPlainText(report: Report): string {
  const lines: string[] = [];

  lines.push(`AI味指数 ${report.score} / 100 —— ${LEVEL_TEXT[report.level]}`);
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('9 条规则一条都没命中。');
  } else {
    lines.push(`命中 ${report.findings.length} 项：`);
    for (const f of report.findings) {
      lines.push(`· ${f.label}（${f.detail}）`);
    }
  }

  lines.push('');
  lines.push(`全文 ${report.stats.charCount} 字，${report.stats.paraCount} 段`);
  lines.push('');
  lines.push(`检测规则公开，不调 AI：${SITE.name} /tools/ai-flavor`);

  return lines.join('\n');
}
