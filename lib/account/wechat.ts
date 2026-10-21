/**
 * 微信扫码登录（微信开放平台「网站应用」，scope=snsapi_login）。
 *
 * 前置条件在微信那边，代码这边给不了：
 * 1. 微信开放平台账号 + 开发者资质认证（要营业执照，年费 300 元）
 * 2. 创建网站应用并通过审核，拿到 AppID / AppSecret
 * 3. 在应用里填「授权回调域」，必须和 WECHAT_REDIRECT_URI 的域名一致，且域名要已备案
 *
 * 注意：这套是给电脑端扫码用的。在微信内置浏览器里打开网页时没法自己扫自己，
 * 那个场景要走公众号网页授权（另一个 AppID、另一套资质），以后作为第二个 provider 加。
 */

import 'server-only';

export interface WechatConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function getWechatConfig(): WechatConfig | null {
  const appId = (process.env.WECHAT_APP_ID || '').trim();
  const appSecret = (process.env.WECHAT_APP_SECRET || '').trim();
  const redirectUri = (process.env.WECHAT_REDIRECT_URI || '').trim();
  if (!appId || !appSecret || !redirectUri) return null;
  return { appId, appSecret, redirectUri };
}

export function wechatConfigured(): boolean {
  return getWechatConfig() !== null;
}

/** 扫码授权页地址 */
export function buildAuthUrl(cfg: WechatConfig, state: string): string {
  const params = new URLSearchParams({
    appid: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params}#wechat_redirect`;
}

export interface WechatIdentity {
  /** 优先 unionid：同一主体下多个应用里它是同一个人 */
  key: string;
  openid: string;
  unionid?: string;
  nickname?: string;
  avatar?: string;
}

interface TokenResponse {
  access_token?: string;
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

interface UserInfoResponse {
  nickname?: string;
  headimgurl?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export class WechatError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = 'WechatError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new WechatError(`微信接口 ${res.status}`, '微信登录失败，请重试');
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof WechatError) throw e;
    throw new WechatError(`请求微信失败: ${(e as Error).message}`, '连不上微信服务器，请重试');
  } finally {
    clearTimeout(timer);
  }
}

/** 用回调拿到的 code 换身份 */
export async function exchangeCode(cfg: WechatConfig, code: string): Promise<WechatIdentity> {
  const tokenUrl =
    'https://api.weixin.qq.com/sns/oauth2/access_token?' +
    new URLSearchParams({
      appid: cfg.appId,
      secret: cfg.appSecret,
      code,
      grant_type: 'authorization_code',
    });

  const token = await getJson<TokenResponse>(tokenUrl);
  if (token.errcode || !token.access_token || !token.openid) {
    throw new WechatError(
      `换 token 失败 ${token.errcode}: ${token.errmsg}`,
      '微信授权没通过，请重新扫码',
    );
  }

  // 昵称头像拿不到也不影响登录，所以失败就算了
  let info: UserInfoResponse = {};
  try {
    info = await getJson<UserInfoResponse>(
      'https://api.weixin.qq.com/sns/userinfo?' +
        new URLSearchParams({ access_token: token.access_token, openid: token.openid, lang: 'zh_CN' }),
    );
  } catch (e) {
    console.warn('[wechat] 取用户资料失败:', (e as Error).message);
  }

  const unionid = token.unionid || info.unionid;
  return {
    key: unionid || token.openid,
    openid: token.openid,
    ...(unionid ? { unionid } : {}),
    ...(info.nickname ? { nickname: info.nickname } : {}),
    ...(info.headimgurl ? { avatar: info.headimgurl } : {}),
  };
}
