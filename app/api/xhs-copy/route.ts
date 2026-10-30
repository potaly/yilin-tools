/**
 * 文案生成接口。
 *
 * 和「改成人话」同一套骨架，但闸门更严：这里的内容全是**新生成的**，
 * 所以 soft 词（绝对化、功效宣称）也不放过 —— 工具没有理由主动吐出
 * 一个「祛湿」。用户自己的原文才有被原样保留的权利（见 lib/xhs/generate.ts）。
 *
 * 另一个差别：模型报的单位数和核心词位置一律不采信，validateCopy 全部重算。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/account/auth';
import { ZERO_USAGE, addUsage, costCny, type Usage } from '@/lib/account/credits';
import { recordUsage } from '@/lib/account/store';
import { isVid } from '@/lib/analytics/events';
import { AiError, chatJSON } from '@/lib/ai/client';
import { getAiConfig } from '@/lib/config/ai-config';
import { allow, checkDailyBudget, identify } from '@/lib/ratelimit';
import { SYSTEM_PROMPT, buildUserPrompt, formMeta } from '@/lib/xhs/copy-prompt';
import { generatedText, validateCopy, type CopyResult } from '@/lib/xhs/copy';
import { gateGenerated, retryHint } from '@/lib/xhs/generate';
import * as quota from '@/lib/xhs/quota';
import { isTrafficType, type TrafficType } from '@/lib/xhs/title';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL = 'xhs-copy';
const MAX_TOPIC = 60;
const MAX_MATERIAL = 2000;
const BURST = 2;

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const vid = isVid(body?.vid) ? body.vid.toLowerCase() : '';
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  const traffic: TrafficType = isTrafficType(body?.traffic) ? body.traffic : 'search';
  const form = typeof body?.form === 'string' ? body.form : 'knowledge';
  const material = typeof body?.material === 'string' ? body.material.trim() : '';
  // 搜索型才需要核心词；用户没单独填就拿主题词当核心词
  const keyword =
    traffic === 'search'
      ? (typeof body?.keyword === 'string' && body.keyword.trim() ? body.keyword.trim() : topic)
      : '';

  if (!topic) return fail('请先填一个主题词', 400);
  if (topic.length > MAX_TOPIC) return fail(`主题词太长了，${MAX_TOPIC} 字以内`, 400);
  if (material.length > MAX_MATERIAL) return fail(`素材太长了，${MAX_MATERIAL} 字以内`, 413);

  const ip = identify(req.headers, req.ip);
  if (!(await allow(`${TOOL}-burst`, ip, BURST, 10))) {
    return fail('上一次还没生成完，等几秒再点', 429);
  }

  const user = await currentUser();
  const taken = await quota.take(TOOL, vid, user?.id);
  if (!taken.ok) {
    return fail(
      user
        ? `今天的 ${taken.limit} 次生成用完了，明天再来`
        : `今天的 ${taken.limit} 次免费生成用完了，登录可以每天 ${quota.USER_DAILY} 次`,
      429,
      { quota: taken, needLogin: !user },
    );
  }

  const giveBack = () => quota.refund(TOOL, vid, user?.id);

  const over = await checkDailyBudget(TOOL, 1, '今天的生成额度全站用完了，明天再试');
  if (over) {
    await giveBack();
    return fail(over.error, over.status);
  }

  const cfg = await getAiConfig();
  if (!cfg) {
    await giveBack();
    return fail('文案生成暂未配置，请稍后再试', 503);
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
        // keyword 没单独填时会被赋成 topic（见上面的三元），不能再数一遍；
        // traffic 默认就是 search，所以那条路径是常态，不是边角情况
        chars: topic.length + material.length + (keyword && keyword !== topic ? keyword.length : 0),
        costCny: costCny(spent),
        credits: 0, // 这个工具走 quota，不走算力
        fails: ok ? 0 : 1,
      },
      ip,
      TOOL,
    );

  try {
    let result: CopyResult | null = null;
    let retry: string | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await chatJSON(cfg, {
        system: SYSTEM_PROMPT,
        user: buildUserPrompt({ topic, keyword, traffic, form, material, retry }),
      });

      // 用 chatJSON 报的真实请求数：它内部被 400 拒掉后会去掉参数再打一次，
      // 那一次不计费，但确实是一个请求，循环轮数数不到它
      requests += res.requests;
      spent = addUsage(spent, res.usage);

      const candidate = validateCopy(res.data, keyword);
      if (!candidate) {
        console.warn(`[xhs-copy] 第 ${attempt + 1} 次返回的结构不合法`);
        continue;
      }

      result = candidate; // 第二次还没过也用它，但要如实告诉前端
      const verdict = gateGenerated(generatedText(candidate));
      if (verdict.ok) break;

      retry = retryHint(verdict);
      console.warn(
        `[xhs-copy] 第 ${attempt + 1} 次没过闸门 hard=${verdict.hard.join('、') || '无'}` +
          ` soft=${verdict.soft.join('、') || '无'}`,
      );
    }

    if (!result) {
      await giveBack();
      await record(false);
      return fail('生成结果无法识别，请重试一次', 502);
    }

    await record(true);

    const verdict = gateGenerated(generatedText(result));

    console.log(
      `[xhs-copy] 完成 主题=${topic} 策略=${traffic} 形式=${formMeta(form).label}` +
        ` 候选=${result.titles.length} 正文=${result.limits.bodyChars}字符` +
        ` 素材=${material ? '有' : '无'} 耗时=${Date.now() - startedAt}ms` +
        ` 用户=${user?.email ?? '未登录'}`,
    );

    return NextResponse.json({
      ...result,
      traffic,
      keyword,
      ...(verdict.ok
        ? {}
        : {
            warning:
              `这一版里还留着不该出现在新写内容里的词：` +
              `${[...verdict.hard, ...verdict.soft].join('、')}，发之前换个说法`,
          }),
      quota: { limit: taken.limit, used: taken.used, left: taken.left, scope: taken.scope },
    });
  } catch (e) {
    await giveBack();
    // 失败的请求拿不到 usage（token 未知），但请求本身要计数，
    // 否则失败率和重试开销在成本表里完全看不见
    if (e instanceof AiError) requests += e.requests;
    if (requests > 0) await record(false);
    if (e instanceof AiError) {
      console.error('[xhs-copy] 失败:', e.message);
      return fail(e.userMessage, 502);
    }
    console.error('[xhs-copy] 未预期的错误:', (e as Error).message);
    return fail('生成失败了，请稍后重试', 500);
  }
}
