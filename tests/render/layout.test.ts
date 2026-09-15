import { describe, it, expect } from 'vitest';
import { ROLE_SLOT, slotAngle, layout, MAX_WORDS } from '../../src/render/layout';
import { loadLook } from '../../src/render/look';
import { ENGINE_VERSION } from '../../src/version';
import type { IR, Constituent } from '../../src/core/ir';

const look = loadLook();
const ir = (cs: Constituent[], mood: IR['mood'] = 'declarative'): IR =>
  ({ constituents: cs, mood, engineVersion: ENGINE_VERSION });
const C = (lemma: string, role: Constituent['role']): Constituent =>
  ({ kind: 'concept', lemma, role });

describe('역할 지도', () => {
  it('3축 대칭이다 — 짝인 역할이 6슬롯 떨어져 있다', () => {
    expect(Math.abs(ROLE_SLOT['행위'] - ROLE_SLOT['양상'])).toBe(6);
    expect(Math.abs(ROLE_SLOT['주체'] - ROLE_SLOT['대상'])).toBe(6);
    expect(Math.abs(ROLE_SLOT['시간'] - ROLE_SLOT['장소'])).toBe(6);
  });

  it('주 역할은 짝수, 부속은 홀수 슬롯이다', () => {
    for (const r of ['행위','주체','시간','양상','대상','장소'] as const) {
      expect(ROLE_SLOT[r] % 2, r).toBe(0);
    }
    for (const r of ['행위수식','주체수식','시간수식','정도','대상수식','방향'] as const) {
      expect(ROLE_SLOT[r] % 2, r).toBe(1);
    }
  });

  it('부속 슬롯은 자기 주 역할 바로 다음 칸이다', () => {
    expect(ROLE_SLOT['행위수식']).toBe(ROLE_SLOT['행위'] + 1);
    expect(ROLE_SLOT['주체수식']).toBe(ROLE_SLOT['주체'] + 1);
    expect(ROLE_SLOT['시간수식']).toBe(ROLE_SLOT['시간'] + 1);
    expect(ROLE_SLOT['정도']).toBe(ROLE_SLOT['양상'] + 1);
    expect(ROLE_SLOT['대상수식']).toBe(ROLE_SLOT['대상'] + 1);
    expect(ROLE_SLOT['방향']).toBe(ROLE_SLOT['장소'] + 1);
  });

  it('12개 슬롯이 모두 정확히 한 번씩 쓰인다', () => {
    expect(Object.values(ROLE_SLOT).sort((a, b) => a - b))
      .toEqual([0,1,2,3,4,5,6,7,8,9,10,11]);
  });

  it('슬롯 0은 12시, 슬롯 6은 6시다', () => {
    expect(slotAngle(0, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(slotAngle(6, 0)).toBeCloseTo(-Math.PI / 2, 9);
  });
});

describe('layout', () => {
  const three = ir([C('사랑','행위'), C('나','주체'), C('너','대상')]);

  it('성분마다 배치를 하나씩 낸다', () => {
    expect(layout(three, look).placements).toHaveLength(3);
    expect(layout(three, look).total).toBe(3);
  });

  it('성분 순서가 달라도 같은 배치를 낸다', () => {
    const a = layout(three, look).placements;
    const b = layout(ir([C('너','대상'), C('사랑','행위'), C('나','주체')]), look).placements;
    expect(b).toEqual(a);
  });

  it('역할이 뒤바뀌면 배치가 달라진다', () => {
    const a = layout(three, look).placements;
    const b = layout(ir([C('사랑','행위'), C('너','주체'), C('나','대상')]), look).placements;
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('덩어리 수가 겹쳐 쌓는 깊이를 정한다', () => {
    // 성분이 덩어리 수보다 많으면 남는 것들이 깊이로 쌓여야 한다.
    // 개념마다 자기 덩어리를 만들면 깊이가 전부 0이 되고 원형 윤곽이 깨진다.
    const n = 8;
    const many = ir(Array.from({ length: n }, (_, i) =>
      ({ kind: 'concept', lemma: `w${i}`, role: '행위' } as Constituent)));
    // 사전에 없는 표제어여도 layout 은 자질을 보지 않으므로 동작한다
    const zones = Math.max(1, Math.min(Math.round(look.cZones), n));
    const depths = layout(many, look).placements.map((p) => p.depth);
    expect(Math.max(...depths)).toBe(Math.ceil(n / zones) - 1);
    // 덩어리마다 깊이가 0부터 시작한다
    expect(depths.filter((d) => d === 0)).toHaveLength(zones);
  });

  it('단어 상한을 넘으면 잘라낸다', () => {
    const over = ir(Array.from({ length: MAX_WORDS + 6 }, (_, i) =>
      ({ kind: 'concept', lemma: `w${i}`, role: '행위' } as Constituent)));
    expect(layout(over, look).placements.length).toBeLessThanOrEqual(MAX_WORDS);
  });

  it('깊이는 0 이상이다', () => {
    for (const p of layout(three, look).placements) expect(p.depth).toBeGreaterThanOrEqual(0);
  });

  it('성분이 없으면 던진다', () => {
    expect(() => layout(ir([]), look)).toThrow();
  });
});
