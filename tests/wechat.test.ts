import { afterEach, describe, expect, it, vi } from 'vitest';
import { WechatError, buildAuthUrl, exchangeCode, getWechatConfig, wechatConfigured } from '@/lib/account/wechat';

const cfg = { appId: 'wxtest123', appSecret: 'secret', redirectUri: 'https://tools.example.com/api/auth/wechat/callback' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('授权地址', () => {
  it('按官方要求带齐参数', () => {
    const url = new URL(buildAuthUrl(cfg, 'state-abc').replace('#wechat_redirect', ''));
    expect(url.origin + url.pathname).toBe('https://open.weixin.qq.com/connect/qrconnect');
    expect(url.searchParams.get('appid')).toBe('wxtest123');
    expect(url.searchParams.get('scope')).toBe('snsapi_login');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('redirect_uri')).toBe(cfg.redirectUri);
  });

  it('结尾要有 #wechat_redirect，否则微信打不开', () => {
    expect(buildAuthUrl(cfg, 's')).toMatch(/#wechat_redirect$/);
  });
});

describe('配置判断', () => {
  it('三个变量齐了才算配好', () => {
    vi.stubEnv('WECHAT_APP_ID', 'a');
    vi.stubEnv('WECHAT_APP_SECRET', '');
    vi.stubEnv('WECHAT_REDIRECT_URI', 'https://x.com/cb');
    expect(wechatConfigured()).toBe(false);

    vi.stubEnv('WECHAT_APP_SECRET', 'b');
    expect(getWechatConfig()).toEqual({ appId: 'a', appSecret: 'b', redirectUri: 'https://x.com/cb' });
  });
});

describe('用 code 换身份', () => {
  function stubFetch(responses: unknown[]) {
    let i = 0;
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => responses[Math.min(i++, responses.length - 1)],
    }));
  }

  it('有 unionid 时优先用 unionid 当唯一标识', async () => {
    stubFetch([
      { access_token: 't', openid: 'open-1', unionid: 'union-1' },
      { nickname: '小林', headimgurl: 'https://img/1.png' },
    ]);
    const id = await exchangeCode(cfg, 'code');
    expect(id.key).toBe('union-1');
    expect(id.openid).toBe('open-1');
    expect(id.nickname).toBe('小林');
  });

  it('没有 unionid 就退回 openid', async () => {
    stubFetch([{ access_token: 't', openid: 'open-2' }, {}]);
    expect((await exchangeCode(cfg, 'code')).key).toBe('open-2');
  });

  it('微信返回错误码时抛出带中文说明的错误', async () => {
    stubFetch([{ errcode: 40029, errmsg: 'invalid code' }]);
    await expect(exchangeCode(cfg, 'bad')).rejects.toBeInstanceOf(WechatError);
    await expect(exchangeCode(cfg, 'bad')).rejects.toMatchObject({ userMessage: '微信授权没通过，请重新扫码' });
  });

  it('取昵称失败也不影响登录', async () => {
    let call = 0;
    vi.stubGlobal('fetch', async () => {
      call++;
      if (call === 1) return { ok: true, json: async () => ({ access_token: 't', openid: 'open-3' }) };
      throw new Error('网络炸了');
    });
    const id = await exchangeCode(cfg, 'code');
    expect(id.key).toBe('open-3');
    expect(id.nickname).toBeUndefined();
  });
});
