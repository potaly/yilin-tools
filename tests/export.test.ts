import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSharePages, isTouchDevice, type PageImage } from '@/lib/cards/export';

const pages: PageImage[] = [
  { blob: new Blob(['a'], { type: 'image/png' }), name: '卡片-01.png' },
  { blob: new Blob(['b'], { type: 'image/png' }), name: '卡片-02.png' },
];

function stub(opts: { coarse: boolean; canShare?: boolean | (() => never) }) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('coarse') ? opts.coarse : false,
  }));
  vi.stubGlobal('navigator', {
    canShare:
      opts.canShare === undefined
        ? undefined
        : typeof opts.canShare === 'function'
          ? opts.canShare
          : () => opts.canShare as boolean,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('isTouchDevice', () => {
  it('指针是粗的就当手机', () => {
    stub({ coarse: true });
    expect(isTouchDevice()).toBe(true);
    stub({ coarse: false });
    expect(isTouchDevice()).toBe(false);
  });
});

describe('canSharePages', () => {
  it('手机上支持分享图片时返回 true', () => {
    stub({ coarse: true, canShare: true });
    expect(canSharePages(pages)).toBe(true);
  });

  it('桌面端一律不走分享，直接下载 zip', () => {
    stub({ coarse: false, canShare: true });
    expect(canSharePages(pages)).toBe(false);
  });

  it('浏览器不支持 canShare 时返回 false', () => {
    stub({ coarse: true });
    expect(canSharePages(pages)).toBe(false);
  });

  it('canShare 抛异常也不能让保存崩掉', () => {
    stub({
      coarse: true,
      canShare: () => {
        throw new Error('不支持');
      },
    });
    expect(canSharePages(pages)).toBe(false);
  });

  it('没有图片时返回 false', () => {
    stub({ coarse: true, canShare: true });
    expect(canSharePages([])).toBe(false);
  });
});
