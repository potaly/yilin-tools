/**
 * 埋点接口。
 *
 * 只接受 { vid, event, tool } 三个字段，任何一项不合法整条丢掉。
 * 一律返回 204：前端是 sendBeacon 发的，拿不到也不看响应体，
 * 而返回错误详情只会方便别人试探接口。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { parseTrack } from '@/lib/analytics/events';
import { recordEvent } from '@/lib/analytics/store';
import { allow, identify } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/** 一个人正常用一次工具最多发 4 条，给到 60/分钟足够宽松，又拦得住脚本刷 */
const MAX_PER_MINUTE = 60;

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  const input = parseTrack(await req.json().catch(() => null));
  if (!input) return noContent();

  const ip = identify(req.headers, req.ip);
  if (!(await allow('track', ip, MAX_PER_MINUTE, 60))) return noContent();

  await recordEvent(input.vid, input.event, input.tool);
  return noContent();
}
