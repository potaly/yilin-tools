import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY,
  pushSnapshot,
  redoStep,
  snapshot,
  truncate,
  undoStep,
} from '@/lib/cards/history';

const s = (t: string) => snapshot(t);

describe('pushSnapshot', () => {
  it('依次入栈', () => {
    const past = pushSnapshot(pushSnapshot([], s('甲')), s('乙'));
    expect(past.map((p) => p.text)).toEqual(['甲', '乙']);
  });

  it('文字没变就不重复记', () => {
    const past = pushSnapshot(pushSnapshot([], s('甲')), s('甲'));
    expect(past).toHaveLength(1);
  });

  it('超过上限丢掉最旧的', () => {
    let past = [] as ReturnType<typeof s>[];
    for (let i = 0; i < MAX_HISTORY + 10; i++) past = pushSnapshot(past, s(`第${i}步`));
    expect(past).toHaveLength(MAX_HISTORY);
    expect(past[0].text).toBe('第10步');
  });
});

describe('undoStep / redoStep', () => {
  it('撤销回到上一步，当前状态进重做栈', () => {
    const move = undoStep([s('甲')], [], s('乙'));
    expect(move?.snapshot.text).toBe('甲');
    expect(move?.past).toHaveLength(0);
    expect(move?.future.map((f) => f.text)).toEqual(['乙']);
  });

  it('重做再回到后一步', () => {
    const move = redoStep([s('甲')], [s('乙')], s('甲'));
    expect(move?.snapshot.text).toBe('乙');
    expect(move?.past.map((p) => p.text)).toEqual(['甲', '甲']);
    expect(move?.future).toHaveLength(0);
  });

  it('空栈时返回 null', () => {
    expect(undoStep([], [], s('甲'))).toBeNull();
    expect(redoStep([], [], s('甲'))).toBeNull();
  });

  it('撤销会带回当时的光标位置', () => {
    const move = undoStep([{ text: '甲乙丙', selectionStart: 1, selectionEnd: 2 }], [], s('甲'));
    expect(move?.snapshot.selectionStart).toBe(1);
    expect(move?.snapshot.selectionEnd).toBe(2);
  });

  it('连续撤销能一路退回去', () => {
    let past = [s('一'), s('二'), s('三')];
    let future = [] as ReturnType<typeof s>[];
    let current = s('四');
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const move = undoStep(past, future, current)!;
      past = move.past;
      future = move.future;
      current = move.snapshot;
      seen.push(current.text);
    }
    expect(seen).toEqual(['三', '二', '一']);
    expect(undoStep(past, future, current)).toBeNull();
  });
});

describe('truncate', () => {
  it('截断到指定长度', () => {
    expect(truncate([s('一'), s('二'), s('三')], 1).map((p) => p.text)).toEqual(['一']);
  });

  it('越界不报错', () => {
    expect(truncate([s('一')], 9)).toHaveLength(1);
    expect(truncate([s('一')], -3)).toHaveLength(0);
  });
});
