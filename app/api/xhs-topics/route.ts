/**
 * 选题生成接口。
 *
 * 闸门同样用「新生成」那套严口径：选题标题会被用户批量照着写，
 * 一个功效宣称词漏进去，会被复制到十几篇笔记里（topics.md 第七节
 * 「写作边界要写进交付物里，而不是靠每篇临场判断」就是这个意思）。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/account/auth';
import { isVid } from '@/lib/analytics/events';
import { AiError, chatJSON } from '@/lib/ai/client';
import { getAiConfig } from '@/lib/config/ai-config';
import { allow, checkDailyBudget, identify } from '@/lib/ratelimit';
import { gateGenerated, retryHint } from '@/lib/xhs/generate';
import * as quota from '@/lib/xhs/quota';
import { generatedText, validateTopicPlan, type TopicPlan } from '@/lib/xhs/topic-plan';
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/xhs/topics-prompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL = 'xhs-topics';
const MAX_TOPIC = 60;
const MAX_FOCUS = 120;
const BURST = 2;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const vid = isVid(body?.vid) ? body.vid.toLowerCase() : '';
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  const focus = typeof body?.focus === 'string' ? body.focus.trim() : '';

  if (!topic) return fail('请先填一个主题词', 400);
  if (topic.length > MAX_TOPIC) return fail(`主题词太长了，${MAX_TOPIC} 字以内`, 400);
  if (focus.length > MAX_FOCUS) return fail(`细分描述太长了，${MAX_FOCUS} 字以内`, 400);

  const ip = identify(req.headers, req.ip);
  if (!(await allow(`${TOOL}-burst`, ip, BURST, 10))) {
    return fail('上一次还没生成完，等几秒再点', 429);
  }

  const user = await currentUser();
  const taken = await quota.take(TOOL, vid, user?.id);
  if (!taken.ok) {
    return fail(
      user
        ? `今天的 ${taken.limit} 次选题用完了，明天再来`
        : `今天的 ${taken.limit} 次免费选题用完了，登录可以每天 ${quota.USER_DAILY} 次`,
      429,
      { quota: taken, needLogin: !user },
    );
  }

  const giveBack = () => quota.refund(TOOL, vid, user?.id);

  const over = await checkDailyBudget(TOOL, 1, '今天的选题额度全站用完了，明天再试');
  if (over) {
    await giveBack();
    return fail(over.error, over.status);
  }

  const cfg = await getAiConfig();
  if (!cfg) {
    await giveBack();
    return fail('选题功能暂未配置，请稍后再试', 503);
  }

  const startedAt = Date.now();

  try {
    let plan: TopicPlan | null = null;
    let retry: string | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { data } = await chatJSON(cfg, {
        system: SYSTEM_PROMPT,
        user: buildUserPrompt({ topic, focus, retry }),
      });

      const candidate = validateTopicPlan(data);
      if (!candidate) {
        console.warn(`[xhs-topics] 第 ${attempt + 1} 次返回的结构不合法`);
        continue;
      }

      plan = candidate;
      const verdict = gateGenerated(generatedText(candidate));
      if (verdict.ok) break;

      retry = retryHint(verdict);
      console.warn(
        `[xhs-topics] 第 ${attempt + 1} 次没过闸门 hard=${verdict.hard.join('、') || '无'}` +
          ` soft=${verdict.soft.join('、') || '无'}`,
      );
    }

    if (!plan) {
      await giveBack();
      return fail('选题结果无法识别，请重试一次', 502);
    }

    const verdict = gateGenerated(generatedText(plan));

    console.log(
      `[xhs-topics] 完成 主题=${topic} 细分=${focus || '无'} 组数=${plan.groups.length}` +
        ` 条数=${plan.count} 耗时=${Date.now() - startedAt}ms 用户=${user?.email ?? '未登录'}`,
    );

    return NextResponse.json({
      ...plan,
      topic,
      ...(verdict.ok
        ? {}
        : {
            warning:
              `这一版里还留着不该出现在选题里的词：` +
              `${[...verdict.hard, ...verdict.soft].join('、')}，照着写之前先换个说法`,
          }),
      quota: { limit: taken.limit, used: taken.used, left: taken.left, scope: taken.scope },
    });
  } catch (e) {
    await giveBack();
    if (e instanceof AiError) {
      console.error('[xhs-topics] 失败:', e.message);
      return fail(e.userMessage, 502);
    }
    console.error('[xhs-topics] 未预期的错误:', (e as Error).message);
    return fail('选题失败了，请稍后重试', 500);
  }
}
