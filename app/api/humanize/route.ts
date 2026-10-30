/**
 * 「改成人话」接口：喂进去一段，吐出来改好的一版。
 *
 * 分工（整个工具的设计核心，改这个文件前先读 lib/xhs/rewrite-prompt.ts 的注释）：
 *
 *   1. 代码扫出所有问题   —— scanDoc（词表 + 额度）+ analyze（9 条 AI 味规则）
 *   2. 模型只负责改写     —— 问题清单作为既成事实塞进提示词，不让它自己判断
 *   3. 代码再验一遍       —— gate()：输出还剩硬违禁词或仍超限就重试一次
 *
 * 不做强制登录：未登录按匿名 uuid 给 3 次/天，登录给 20 次/天。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/account/auth';
import { ZERO_USAGE, addUsage, costCny, type Usage } from '@/lib/account/credits';
import { recordUsage } from '@/lib/account/store';
import { isVid } from '@/lib/analytics/events';
import { AiError, chatJSON } from '@/lib/ai/client';
import { analyze } from '@/lib/aiwei/engine';
import { getAiConfig } from '@/lib/config/ai-config';
import { allow, checkDailyBudget, identify } from '@/lib/ratelimit';
import * as quota from '@/lib/xhs/quota';
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/xhs/rewrite-prompt';
import { gate, validateRewrite, verifiedChanges, type Rewrite } from '@/lib/xhs/rewrite';
import { scanDoc } from '@/lib/xhs/scan';
import { BODY_MAX_CHARS, splitDoc } from '@/lib/xhs/units';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL = 'humanize';
/** 比正文上限留一点余量：用户常常先粘超长的再让工具帮着删 */
const MAX_INPUT = BODY_MAX_CHARS * 3;
const MIN_INPUT = 20;
/** 突发：同一个 IP 10 秒内最多 2 次 */
const BURST = 2;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const vid = isVid(body?.vid) ? body.vid.toLowerCase() : '';
  const raw = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!raw) return fail('请先粘贴要改的文案', 400);
  if (raw.length < MIN_INPUT) return fail('文字太短了，粘一段完整的笔记进来', 400);
  if (raw.length > MAX_INPUT) return fail(`一次最多 ${MAX_INPUT} 字，请分两段改`, 413);

  const ip = identify(req.headers, req.ip);
  if (!(await allow(`${TOOL}-burst`, ip, BURST, 10))) {
    return fail('上一次还没改完，等几秒再点', 429);
  }

  // 标题可以单独传，也可以写成第一行的 `# 标题`
  const parsed = splitDoc(raw);
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : parsed.title;
  const text = title === parsed.title ? parsed.body : raw;

  const user = await currentUser();
  const taken = await quota.take(TOOL, vid, user?.id);
  if (!taken.ok) {
    return fail(
      user
        ? `今天的 ${taken.limit} 次改写用完了，明天再来`
        : `今天的 ${taken.limit} 次免费改写用完了，登录可以每天 ${quota.USER_DAILY} 次`,
      429,
      { quota: taken, needLogin: !user },
    );
  }

  const giveBack = async () => quota.refund(TOOL, vid, user?.id);

  const over = await checkDailyBudget(TOOL, 1, '今天的改写额度全站用完了，明天再试');
  if (over) {
    await giveBack();
    return fail(over.error, over.status);
  }

  // ---- 1. 判断：全部在代码里做完 ----
  const scan = scanDoc(title, text);
  const report = analyze(title ? `${title}\n${text}` : text);

  const cfg = await getAiConfig();
  if (!cfg) {
    await giveBack();
    return fail('改写功能暂未配置，请稍后再试', 503);
  }

  const startedAt = Date.now();

  /**
   * 成本按**实际打到模型的次数**累计，失败也记 —— 重试那一次的 token 一样要付钱，
   * 只记成功的话成本表会系统性偏低。记的全是数字，不含正文。
   */
  let spent: Usage = ZERO_USAGE;
  let requests = 0;
  const record = (ok: boolean) =>
    recordUsage(
      user?.id ?? null,
      {
        ...spent,
        chunks: 1, // 这个工具不切块，一次请求就是一块
        requests, // 真实上游请求数，含重试
        chars: raw.length,
        costCny: costCny(spent),
        credits: 0, // 这个工具走 quota，不走算力
        fails: ok ? 0 : 1,
      },
      ip,
      TOOL,
    );

  try {
    // ---- 2. 模型只负责改写 ----
    // ---- 3. 代码再验一遍，没过就把残留的词告诉它重来一次 ----
    let result: Rewrite | null = null;
    let leftover: string[] | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await chatJSON(cfg, {
        system: SYSTEM_PROMPT,
        user: buildUserPrompt({
          title,
          body: text,
          issues: scan.issues,
          findings: report.findings,
          limits: scan.limits,
          leftover,
        }),
      });

      // 用 chatJSON 报的真实请求数：它内部被 400 拒掉后会去掉参数再打一次，
      // 那一次不计费，但确实是一个请求，循环轮数数不到它
      requests += res.requests;
      spent = addUsage(spent, res.usage);

      const candidate = validateRewrite(res.data);
      if (!candidate) {
        console.warn(`[humanize] 第 ${attempt + 1} 次返回的结构不合法`);
        continue;
      }

      const verdict = gate(candidate);
      result = candidate; // 第二次没过也用它，但要如实告诉前端哪里没改干净
      if (verdict.ok) break;

      leftover = verdict.leftover;
      console.warn(
        `[humanize] 第 ${attempt + 1} 次没过闸门 残留=${verdict.leftover.join('、') || '无'}` +
          ` 超限=${verdict.stillOver.join('、') || '无'}`,
      );
    }

    if (!result) {
      await giveBack();
      await record(false);
      return fail('改写结果无法识别，请重试一次', 502);
    }

    await record(true);

    const verdict = gate(result);
    const after = scanDoc(result.title, result.body);

    console.log(
      `[humanize] 完成 字数=${raw.length} AI味 ${report.score}→${analyze(result.body).score}` +
        ` 命中 ${scan.issues.length}→${after.issues.length} 耗时=${Date.now() - startedAt}ms` +
        ` 用户=${user?.email ?? '未登录'}`,
    );

    return NextResponse.json({
      title: result.title,
      body: result.body,
      note: result.note,
      changes: verifiedChanges(scan.text, result.changes),
      /** 改之前的问题清单（代码扫的，权威） */
      issues: scan.issues,
      findings: report.findings,
      score: report.score,
      /** 改之后还剩什么，如实给出 —— 闸门没拦住的要让用户知道 */
      after: {
        issues: after.issues,
        limits: after.limits,
        score: analyze(result.body).score,
      },
      ...(verdict.ok ? {} : { warning: warningOf(verdict.leftover, verdict.stillOver) }),
      quota: { limit: taken.limit, used: taken.used, left: taken.left, scope: taken.scope },
    });
  } catch (e) {
    await giveBack();
    // 失败的请求拿不到 usage（token 未知），但请求本身要计数，
    // 否则失败率和重试开销在成本表里完全看不见
    if (e instanceof AiError) requests += e.requests;
    if (requests > 0) await record(false);
    if (e instanceof AiError) {
      console.error('[humanize] 失败:', e.message);
      return fail(e.userMessage, 502);
    }
    console.error('[humanize] 未预期的错误:', (e as Error).message);
    return fail('改写失败了，请稍后重试', 500);
  }
}

function warningOf(leftover: string[], stillOver: string[]): string {
  const parts: string[] = [];
  if (leftover.length) parts.push(`这几个必须改的词还在：${leftover.join('、')}`);
  if (stillOver.length) parts.push(stillOver.join('、'));
  return `${parts.join('；')} —— 请手动处理一下`;
}
