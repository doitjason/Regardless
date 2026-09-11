import { describe, it, expect } from 'vitest';
import { loadLook, LOOK_KEYS } from '../../src/render/look';

const look = loadLook();

describe('loadLook', () => {
  it('선언된 파라미터를 모두 담고 있다', () => {
    for (const k of LOOK_KEYS) {
      expect(typeof look[k], k).toBe('number');
      expect(Number.isFinite(look[k]), k).toBe(true);
    }
  });

  it('JSON에만 있고 선언되지 않은 파라미터가 없다', () => {
    // 랩에서 슬라이더를 추가했는데 여기 선언을 빠뜨리면 조용히 무시된다.
    expect(Object.keys(look).sort()).toEqual([...LOOK_KEYS].sort());
  });

  it('확정 조형의 핵심 판단이 값에 남아 있다', () => {
    // 이 값들이 바뀌면 조형이 바뀐 것이다. 바뀌었다면 스펙 9.5.1b도 함께 고쳐야 한다.
    expect(look.pWobble).toBe(0);        // 정원. 찌그러짐 없음
    expect(look.cSpeck).toBe(0);         // 흩어진 반점은 쓰지 않는다
    expect(look.cBloomOut).toBe(0);      // 덩어리는 부풀지 않는다
    expect(look.cZones).toBeGreaterThanOrEqual(1);
    expect(look.pR).toBeGreaterThan(0);
    expect(look.pRingBase).toBeGreaterThan(0);
  });

  it('같은 객체를 반복해서 돌려주지 않는다 — 호출자가 고쳐도 원본이 안 바뀐다', () => {
    const a = loadLook();
    a.pR = 999;
    expect(loadLook().pR).not.toBe(999);
  });
});
