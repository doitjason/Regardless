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

  it('알 수 없는 역할은 조용히 넘어가지 않고 던진다', () => {
    expect(() => layout(ir([C('물', '없는역할' as never)]), look)).toThrow(/없는역할/);
  });

  it('알 수 없는 역할 하나가 이웃의 각도를 망가뜨리지 않는다', () => {
    // 옛 구현은 NaN 각도를 폴백으로 흡수하면서 같은 덩어리의 멀쩡한 성분까지 끌고 갔다
    expect(() => layout(ir([C('사랑','행위'), C('물','없는역할' as never)]), look)).toThrow();
  });

  const slotOf = (p: { item: Constituent }) => ROLE_SLOT[p.item.role];
  const angDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };

  it('덩어리는 역할 지도에서 이웃한 성분끼리 묶인다 — 10개 역할', () => {
    const roles = ['행위','행위수식','주체','주체수식','시간','시간수식','양상','정도','대상','대상수식'] as const;
    // 표제어를 역할 순서와 어긋나게 붙여 canonical 문자열 순서가 링 순서와 다르게 한다
    const lemmas = ['하','파','타','카','차','자','아','사','바','마'];
    const cs = roles.map((r, i) => C(lemmas[i]!, r));
    for (const p of layout(ir(cs), look).placements) {
      expect(angDist(p.angle, slotAngle(slotOf(p), 0.5)), `${p.item.role}`).toBeLessThan(Math.PI / 3);
    }
  });

  it('12시를 가로지르는 이웃도 한 덩어리가 되고 6시로 뒤집히지 않는다', () => {
    // 11시·1시 쪽만 쓰면 두 슬롯이 60°밖에 안 떨어져 있어 원형 평균이 항상
    // 그 60° 안에 남는다 — 라운드로빈이든 아니든 못 어긋난다. 6시(양상)에도
    // 성분을 둬야 canonical 문자열 순서(대상수식류 접두 비교와 무관하게
    // 방향 < 양상 < 행위수식)의 라운드로빈이 12시 이웃을 6시 성분과 섞어
    // 버리는 결함이 드러난다.
    const cs = [
      ...Array.from({ length: 4 }, (_, i) => C(`ㄱ${i}`, '방향')),     // 슬롯 11
      ...Array.from({ length: 2 }, (_, i) => C(`ㄷ${i}`, '양상')),     // 슬롯 6 (6시)
      ...Array.from({ length: 4 }, (_, i) => C(`ㄴ${i}`, '행위수식')), // 슬롯 1
    ];
    for (const p of layout(ir(cs), look).placements) {
      expect(angDist(p.angle, slotAngle(slotOf(p), 0.5)), `${p.item.role}`).toBeLessThan(Math.PI / 3);
    }
  });

  it('구성원이 하나인 덩어리는 자기 슬롯 각도에 놓인다', () => {
    for (const p of layout(three, look).placements) {
      expect(angDist(p.angle, slotAngle(slotOf(p), 0.5))).toBeLessThan(1e-9);
    }
  });

  it('구성원이 정확히 상쇄되는 덩어리도 유한하고 결정적인 각도를 낸다', () => {
    const cs = [
      ...Array.from({ length: 9 }, (_, i) => C(`ㄱ${i}`, '행위')), // 슬롯 0
      C('ㄴ', '양상'),                                              // 슬롯 6
    ];
    const a = layout(ir(cs), look).placements;
    const b = layout(ir([...cs].reverse()), look).placements;
    for (const p of a) expect(Number.isFinite(p.angle)).toBe(true);
    expect(b).toEqual(a);
  });
});
