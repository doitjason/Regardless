import { describe, it, expect } from 'vitest';
import { loadScreen } from '../../web/screen';

describe('loadScreen', () => {
  it('design/screen.json 의 번짐 시간을 읽는다', () => {
    const { timing } = loadScreen();
    for (const v of Object.values(timing)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(timing.flowSpeed).toBeGreaterThan(0);
  });

  it('키가 빠지거나 선언되지 않은 숫자 키가 있으면 던진다', () => {
    expect(() => loadScreen({ ringSeconds: 3 })).toThrow(/flowSpeed/);
    const ok = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8 };
    expect(() => loadScreen({ ...ok, bogus: 1 })).toThrow(/bogus/);
    expect(loadScreen({ ...ok, _: '설명' }).timing.ringSeconds).toBe(3);
  });

  it('flowSpeed 는 0 보다 크고 나머지 시간은 0 이상이어야 한다 — 키 이름을 알려 준다', () => {
    const ok = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8 };
    expect(() => loadScreen({ ...ok, flowSpeed: 0 })).toThrow(/flowSpeed/);
    expect(() => loadScreen({ ...ok, flowSpeed: -1 })).toThrow(/flowSpeed/);
    for (const k of ['ringSeconds', 'depthSecondsPerUnit', 'jitterSeconds', 'tailSeconds'] as const) {
      expect(() => loadScreen({ ...ok, [k]: -0.1 }), k).toThrow(new RegExp(k));
      expect(loadScreen({ ...ok, [k]: 0 }).timing[k], k).toBe(0);
    }
  });
});
