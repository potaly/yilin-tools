/**
 * 改写提示词。
 *
 * **这里的分工是整个工具的设计核心：**
 * 判断全部在代码里做完（scan.ts 扫词表、aiwei 跑 9 条规则、units.ts 数额度），
 * 提示词只负责把「哪几处、按哪条手法改」作为**既成事实**交给模型。
 *
 * 不要在这里加「请你检查有没有违禁词」这类话。之前把分行业口径写成文档
 * 交给模型判断，它漏掉了「祛湿」「补气血」「增强免疫力」一整串 ——
 * 模型没有判断权，只有改写权。改完还要再跑一遍 scan 当闸门（见 route）。
 */

import type { Finding } from '@/lib/aiwei/types';
import type { Issue } from './scan';
import type { Limits } from './units';
import { BODY_MAX_CHARS, TITLE_MAX_UNITS } from './units';
import { DOWNGRADE_EXAMPLES } from './words';

export const SYSTEM_PROMPT = `你是帮人把文案改成「像真人写的小红书笔记」的编辑。

你的工作只有一件：按给定的问题清单改写文字。清单是程序扫出来的，已经确定，
不要质疑、不要补充、不要自己再找别的问题。没列进清单的地方尽量别动。

改写时守住这几条（小红书的阅读习惯）：

1. 开头 3 行是信息流预览区。不寒暄、不铺垫，第一句直接给结论、给冲突，或给一个具体场景。
2. 第一人称、口语。「我试了三个月」比「经研究表明」有效。
3. 每段不超过 3 行，段间空行。emoji 当断句符用，每个分点开头一个，不要段中乱撒。
4. 句子不要太齐。人写东西有起伏，敢放一句五个字的短句、半截话。
5. 一个意思只留一个词。「简单、高效、可复制」说的是一个意思，留用户真被戳到的那个。
6. 把「非常、其实、真的」这类副词换成具体动作、数字、场景。
   「很有用」改成「用了一周，早上出门少找了十分钟钥匙」。
7. 结尾引导评论，不是点赞。给一个容易回答的具体问题，比如「你是油皮还是干皮」。
8. 可以在结尾附近承认一处自己也没搞定的地方。全知全能的稿子不可信。

**绝对不许编数字。** 要求具体会直接诱发「为了显得专业而编一个数字」，
而编错的具体建议比空话伤害大得多：读者会照着做，评论区也会有人较真。
原文里没有的数字、品类参数、价格，一个都不要新增。拿不准就降级成不带数字的表述：

${DOWNGRADE_EXAMPLES.map(([bad, good]) => `  ❌ ${bad}\n  ✅ ${good}`).join('\n')}

原文有的事实、数字、经历要保留，这是用户自己的东西。你改的是说法，不是内容。

只输出 JSON，不要任何解释文字：

{
  "title": "改好的标题（原文没有标题就留空字符串）",
  "body": "改好的正文，段间用空行。标签放最后一行，形如 #标签1 #标签2",
  "changes": [
    { "from": "原文里的片段", "to": "改成了什么", "why": "一句话说清为什么" }
  ],
  "note": "一句话说清你这版主要动了什么（可留空）"
}

changes 只列真正改动的地方，最多 8 条，每条 from 必须是原文里真实存在的片段。`;

function describeIssues(issues: Issue[]): string {
  if (!issues.length) return '（词表没扫到问题）';

  return issues
    .map((issue) => {
      const words = issue.hits.map((w) => `「${w}」`).join('、');
      const must = issue.severity === 'hard' ? '必须改' : '建议改';
      return `· ${issue.label}（${must}）\n  命中：${words}\n  原因：${issue.why}\n  手法：${issue.recipe}`;
    })
    .join('\n');
}

function describeFindings(findings: Finding[]): string {
  if (!findings.length) return '（AI 味规则一条都没命中）';
  return findings.map((f) => `· ${f.label}：${f.detail}。改法：${f.hint}`).join('\n');
}

function describeLimits(limits: Limits): string {
  const lines: string[] = [];

  if (limits.titleOver > 0) {
    lines.push(
      `· 标题 ${limits.titleUnits} 单位，超了 ${limits.titleOver} 个（上限 ${TITLE_MAX_UNITS}，` +
        `全角算 1、半角算 0.5）。必须压到 ${TITLE_MAX_UNITS} 以内，否则发布时被截断。`
    );
  }
  if (limits.bodyOver > 0) {
    lines.push(
      `· 正文 ${limits.bodyChars} 字符，超了 ${limits.bodyOver} 个（上限 ${BODY_MAX_CHARS}，` +
        `**标签占用同一额度**，这篇的标签占了 ${limits.tagChars} 字符）。必须删到额度内。`
    );
  }
  if (!lines.length) {
    lines.push(
      `· 都在额度内（标题 ${limits.titleUnits}/${TITLE_MAX_UNITS} 单位，` +
        `正文 ${limits.bodyChars}/${BODY_MAX_CHARS} 字符含标签）。改完也不要超。`
    );
  }

  return lines.join('\n');
}

export interface PromptInput {
  title: string;
  body: string;
  issues: Issue[];
  findings: Finding[];
  limits: Limits;
  /** 第二次尝试时，把上一版仍然残留的硬违规词告诉模型 */
  leftover?: string[];
}

export function buildUserPrompt(input: PromptInput): string {
  const parts: string[] = [];

  parts.push('【原文】');
  parts.push(input.title ? `标题：${input.title}` : '（原文没有标题，不用新编一个）');
  parts.push('正文：');
  parts.push(input.body);
  parts.push('');
  parts.push('【程序扫出来的词表问题 —— 已确定，照着改】');
  parts.push(describeIssues(input.issues));
  parts.push('');
  parts.push('【程序扫出来的 AI 味 —— 已确定，照着改】');
  parts.push(describeFindings(input.findings));
  parts.push('');
  parts.push('【硬约束】');
  parts.push(describeLimits(input.limits));

  if (input.leftover?.length) {
    parts.push('');
    parts.push(
      `【上一版没改干净】这几个词还在：${input.leftover.map((w) => `「${w}」`).join('、')}。` +
        '这类是必须改的，这次一个都不要留。'
    );
  }

  return parts.join('\n');
}
