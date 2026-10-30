/**
 * 端到端判据。第二个用例是整套规则的生死线：
 * 真人写的文案如果被判成一堆 AI 味，这个工具就没人信了。
 */

import { describe, expect, it } from 'vitest';
import { analyze } from '@/lib/aiwei/engine';
import { SAMPLE as AI_SAMPLE } from '@/lib/aiwei/sample';
import { SAMPLE as HUMAN_SAMPLE } from '@/lib/cards/sample';

describe('analyze', () => {
  it('典型 AI 文案命中 ≥4 条', () => {
    const report = analyze(AI_SAMPLE);
    expect(report.findings.length).toBeGreaterThanOrEqual(4);
    expect(report.score).toBeGreaterThan(45);
  });

  it('真人写的文案命中 ≤1 条', () => {
    const report = analyze(HUMAN_SAMPLE);
    expect(report.findings.length).toBeLessThanOrEqual(1);
    expect(report.level).toBe('clean');
  });

  it('空文本不报错，也不命中', () => {
    const report = analyze('');
    expect(report.findings).toHaveLength(0);
    expect(report.score).toBe(0);
  });

  it('命中项按严重度降序', () => {
    const { findings } = analyze(AI_SAMPLE);
    const severities = findings.map((f) => f.severity);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
  });

  it('每个 span 都落在文本范围内', () => {
    const report = analyze(AI_SAMPLE);
    for (const f of report.findings) {
      for (const s of f.spans) {
        expect(s.start).toBeGreaterThanOrEqual(0);
        expect(s.end).toBeLessThanOrEqual(AI_SAMPLE.length);
        expect(s.end).toBeGreaterThan(s.start);
      }
    }
  });
});
