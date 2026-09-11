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

describe('loadLook — 잘못된 입력', () => {
  const valid = (): Record<string, unknown> => {
    const o: Record<string, unknown> = { _: '설명' };
    for (const k of LOOK_KEYS) o[k] = 1;
    return o;
  };

  it('파라미터가 빠지면 던지고 이름을 말한다', () => {
    const bad = valid();
    delete bad['pR'];
    expect(() => loadLook(bad)).toThrow(/pR/);
  });

  it('파라미터가 숫자가 아니면 던진다', () => {
    expect(() => loadLook({ ...valid(), pR: '0.52' })).toThrow(/pR/);
  });

  it('NaN 과 Infinity 를 거부한다', () => {
    expect(() => loadLook({ ...valid(), pR: NaN })).toThrow(/pR/);
    expect(() => loadLook({ ...valid(), pR: Infinity })).toThrow(/pR/);
  });

  it('선언되지 않은 숫자 파라미터가 있으면 던지고 이름을 말한다', () => {
    expect(() => loadLook({ ...valid(), pNewSlider: 0.3 })).toThrow(/pNewSlider/);
  });

  it("'_' 로 시작해도 숫자면 선언되지 않은 것으로 잡는다", () => {
    // 이름이 아니라 값의 타입으로 문서용 키를 가려내야 한다.
    expect(() => loadLook({ ...valid(), _pTest: 0.3 })).toThrow(/_pTest/);
  });

  it('문자열 문서용 키는 몇 개든 허용한다', () => {
    expect(() => loadLook({ ...valid(), _메모: '아무 설명', _출처: '룩 랩' })).not.toThrow();
  });

  it('정상 입력은 선언된 파라미터를 모두 낸다', () => {
    const out = loadLook(valid());
    for (const k of LOOK_KEYS) expect(out[k], k).toBe(1);
  });
});
