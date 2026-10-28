import { describe, expect, it } from 'vitest';
import { EVENTS, isEvent, isTool, parseTrack } from '@/lib/analytics/events';

const VID = '3f2b9c1e-4a5d-4e8f-9a1b-2c3d4e5f6a7b';

describe('isEvent / isTool', () => {
  it('只认这 4 个事件', () => {
    expect(EVENTS).toEqual(['open', 'run', 'done', 'take']);
    expect(isEvent('open')).toBe(true);
    expect(isEvent('click')).toBe(false);
    expect(isEvent(1)).toBe(false);
  });

  it('工具名要在注册表里', () => {
    expect(isTool('ai-flavor')).toBe(true);
    expect(isTool('longform-cards')).toBe(true);
    expect(isTool('../../etc/passwd')).toBe(false);
  });
});

describe('parseTrack', () => {
  it('合法的放行', () => {
    expect(parseTrack({ vid: VID, event: 'done', tool: 'ai-flavor' })).toEqual({
      vid: VID,
      event: 'done',
      tool: 'ai-flavor',
    });
  });

  it('大写的 uuid 归一成小写', () => {
    expect(parseTrack({ vid: VID.toUpperCase(), event: 'open', tool: 'ai-flavor' })?.vid).toBe(VID);
  });

  it('vid 格式不对就整条丢掉', () => {
    expect(parseTrack({ vid: 'abc', event: 'open', tool: 'ai-flavor' })).toBeNull();
    expect(parseTrack({ vid: `${VID}; DROP TABLE`, event: 'open', tool: 'ai-flavor' })).toBeNull();
  });

  it('事件名或工具名不在白名单就整条丢掉', () => {
    expect(parseTrack({ vid: VID, event: 'hack', tool: 'ai-flavor' })).toBeNull();
    expect(parseTrack({ vid: VID, event: 'open', tool: 'nope' })).toBeNull();
  });

  it('多余字段不会被带进去', () => {
    const out = parseTrack({ vid: VID, event: 'open', tool: 'ai-flavor', text: '机密正文' });
    expect(out).toEqual({ vid: VID, event: 'open', tool: 'ai-flavor' });
    expect(JSON.stringify(out)).not.toContain('机密');
  });

  it('空值不报错', () => {
    expect(parseTrack(null)).toBeNull();
    expect(parseTrack('open')).toBeNull();
    expect(parseTrack([])).toBeNull();
  });
});
