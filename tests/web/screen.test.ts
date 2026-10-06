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
});
