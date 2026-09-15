import { describe, it, expect } from 'vitest';
import { conceptParams } from '../../src/render/mapping';
import { loadSeedLexicon, lookup, FEATURE_KEYS, type SemanticFeatures } from '../../src/core/lexicon';

const lex = loadSeedLexicon();
const mid: SemanticFeatures = {
  animacy: 0.5, agency: 0.5, concreteness: 0.5, valence: 0.5,
  intensity: 0.5, temporality: 0.5, boundedness: 0.5, sociality: 0.5,
};
const withF = (o: Partial<SemanticFeatures>): SemanticFeatures => ({ ...mid, ...o });

describe('conceptParams — 8개 자질이 모두 조형에 도달한다', () => {
  it('어느 자질을 바꿔도 결과가 달라진다', () => {
    // 자질 하나가 아무 파라미터에도 닿지 않으면 그 의미 차이가 형태에
    // 나타나지 않는다. 원칙 2 위반이다.
    const base = JSON.stringify(conceptParams(mid));
    for (const k of FEATURE_KEYS) {
      const lo = JSON.stringify(conceptParams(withF({ [k]: 0.02 } as Partial<SemanticFeatures>)));
      const hi = JSON.stringify(conceptParams(withF({ [k]: 0.98 } as Partial<SemanticFeatures>)));
      expect(lo, `${k} 가 조형에 도달하지 않는다`).not.toBe(hi);
      expect([lo, hi].includes(base) && lo === hi, k).toBe(false);
    }
  });

  it('구상어가 더 두껍다', () => {
    expect(conceptParams(withF({ concreteness: 0.95 })).thickK)
      .toBeGreaterThan(conceptParams(withF({ concreteness: 0.05 })).thickK);
  });

  it('관계성이 크면 덩어리가 넓게 퍼진다', () => {
    expect(conceptParams(withF({ sociality: 0.95 })).spanK)
      .toBeGreaterThan(conceptParams(withF({ sociality: 0.05 })).spanK);
  });

  it('정서가가 감김 방향의 부호를 정한다', () => {
    expect(conceptParams(withF({ valence: 0.95 })).lean).toBeGreaterThan(0);
    expect(conceptParams(withF({ valence: 0.05 })).lean).toBeLessThan(0);
  });

  it('추상어의 가시가 더 길다', () => {
    expect(conceptParams(withF({ concreteness: 0.05 })).fringeLenK)
      .toBeGreaterThan(conceptParams(withF({ concreteness: 0.95 })).fringeLenK);
  });

  it('생물성이 부속 고리를 켠다', () => {
    expect(conceptParams(withF({ animacy: 0.9 })).loop).toBe(true);
    expect(conceptParams(withF({ animacy: 0.1 })).loop).toBe(false);
  });

  it('시간성이 링 굵기 변화 주파수를 정하고, 정수다', () => {
    const hi = conceptParams(withF({ temporality: 0.95 })).harmonic;
    const lo = conceptParams(withF({ temporality: 0.05 })).harmonic;
    expect(hi).toBeGreaterThan(lo);
    expect(Number.isInteger(hi)).toBe(true);
    expect(Number.isInteger(lo)).toBe(true);
  });

  it('모든 배수가 양수다 — 음수면 획이 뒤집힌다', () => {
    for (const k of FEATURE_KEYS) {
      for (const v of [0, 1]) {
        const p = conceptParams(withF({ [k]: v } as Partial<SemanticFeatures>));
        for (const key of ['thickK', 'spanK', 'outK', 'fringeK', 'fringeLenK', 'speckK', 'doubleK'] as const) {
          expect(p[key], `${k}=${v} → ${key}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('conceptParams — 씨앗 사전에서의 동작', () => {
  it('사랑과 미움은 감김 방향만 반대다', () => {
    const love = conceptParams(lookup(lex, '사랑')!.features);
    const hate = conceptParams(lookup(lex, '미움')!.features);
    expect(Math.sign(love.lean)).not.toBe(Math.sign(hate.lean));
    expect(Math.abs(love.thickK - hate.thickK)).toBeLessThan(0.1);
    expect(Math.abs(love.spanK - hate.spanK)).toBeLessThan(0.1);
  });

  it('고양이와 개는 조형 파라미터가 가깝다', () => {
    const cat = conceptParams(lookup(lex, '고양이')!.features);
    const dog = conceptParams(lookup(lex, '개')!.features);
    for (const k of ['thickK', 'spanK', 'outK', 'fringeK', 'fringeLenK'] as const) {
      expect(Math.abs(cat[k] - dog[k]), k).toBeLessThan(0.15);
    }
    expect(cat.loop).toBe(dog.loop);
  });

  it('사전의 모든 어휘가 유한한 파라미터를 낸다', () => {
    for (const [lemma, e] of Object.entries(lex)) {
      const p = conceptParams(e.features);
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'number') expect(Number.isFinite(v), `${lemma}.${k}`).toBe(true);
      }
    }
  });
});
