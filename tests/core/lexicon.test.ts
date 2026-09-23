import { describe, it, expect } from 'vitest';
import {
  loadSeedLexicon, lookup, averageFeatures, FEATURE_KEYS, NEUTRAL_FEATURES,
  type SemanticFeatures,
} from '../../src/core/lexicon';

const lex = loadSeedLexicon();

const mid: SemanticFeatures = {
  animacy: 0.5, agency: 0.5, concreteness: 0.5, valence: 0.5,
  intensity: 0.5, temporality: 0.5, boundedness: 0.5, sociality: 0.5,
};
const withF = (o: Partial<SemanticFeatures>): SemanticFeatures => ({ ...mid, ...o });

describe('씨앗 사전', () => {
  it('27항목을 담고 있다', () => {
    // 계획 III 태스크 6 에서 128항목으로 늘었다 — 최소 항목 수는
    // 아래 '자주 쓰는 말이 충분히 들어 있다' 테스트가 별도로 잡는다.
    expect(Object.keys(lex).length).toBeGreaterThanOrEqual(120);
  });

  it('조형 실험에 쓰이는 어휘가 모두 있다', () => {
    for (const w of ['사랑','미움','기다림','그리움','기쁨','슬픔','두려움','용기',
                     '약속','선택','나','너','우리','아이','고양이','개','새',
                     '시간','영원','어제','오늘','여기','하늘','물','빛','깊이','의문']) {
      expect(lookup(lex, w), `${w} 누락`).toBeDefined();
    }
  });

  it('모든 항목이 8개 자질을 0..1 범위로 갖는다', () => {
    for (const [lemma, e] of Object.entries(lex)) {
      const keys = Object.keys(e.features).sort();
      expect(keys, `${lemma} 자질 키`).toEqual([...FEATURE_KEYS].sort());
      for (const k of FEATURE_KEYS) {
        const v = e.features[k];
        expect(typeof v, `${lemma}.${k}`).toBe('number');
        expect(v, `${lemma}.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${lemma}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('모든 항목의 lemma 필드가 키와 일치한다', () => {
    for (const [key, e] of Object.entries(lex)) expect(e.lemma).toBe(key);
  });

  it('모든 항목이 필수 메타데이터를 갖는다', () => {
    for (const [lemma, e] of Object.entries(lex)) {
      expect(e.gloss_en, lemma).toBeTruthy();
      expect(['confirmed', 'provisional'], lemma).toContain(e.status);
      expect(['seed', 'llm'], lemma).toContain(e.source);
      expect(e.addedAt, lemma).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('씨앗 항목은 모두 confirmed / seed 다', () => {
    for (const [lemma, e] of Object.entries(lex)) {
      expect(e.status, lemma).toBe('confirmed');
      expect(e.source, lemma).toBe('seed');
    }
  });

  it('없는 표제어는 undefined를 반환한다', () => {
    expect(lookup(lex, '없는단어')).toBeUndefined();
  });

  it('프로토타입 오염에 반응하지 않는다', () => {
    // lookup 이 hasOwnProperty 없이 인덱싱하면 '__proto__' 나 'toString' 에
    // 엉뚱한 값이 잡힌다.
    expect(lookup(lex, '__proto__')).toBeUndefined();
    expect(lookup(lex, 'toString')).toBeUndefined();
    expect(lookup(lex, 'constructor')).toBeUndefined();
  });

  it('호출마다 다른 객체를 준다', () => {
    // loadLook() 과 대칭이어야 한다 — 임포트한 객체를 그대로 돌려주면
    // 호출자가 값을 바꿀 때 프로세스 전역 상태가 된다.
    expect(loadSeedLexicon()).not.toBe(loadSeedLexicon());
  });

  it('반환값에 쓰면 엄격 모드에서 던진다', () => {
    const l = loadSeedLexicon();
    expect(() => { (l as any).새말 = {} }).toThrow();
  });

  it('항목에 쓰는 것도 엄격 모드에서 던진다', () => {
    const l = loadSeedLexicon();
    expect(() => { (l['사랑'] as any).gloss_en = 'x' }).toThrow();
  });

  it('얼려도 기존 조회는 그대로 된다', () => {
    const l = loadSeedLexicon();
    expect(lookup(l, '사랑')?.gloss_en).toBeTruthy();
  });

  it('자주 쓰는 말이 충분히 들어 있다', () => {
    const lex = loadSeedLexicon();
    expect(Object.keys(lex).length).toBeGreaterThanOrEqual(120);
  });

  it('일상 문장의 낱말이 사전에 있다', () => {
    const lex = loadSeedLexicon();
    for (const w of ['마음', '생각', '말', '사람', '집', '길', '밤', '아침',
                     '바다', '바람', '꽃', '나무', '별', '눈', '비', '노래',
                     '이야기', '웃음', '눈물', '꿈']) {
      expect(lookup(lex, w), w).toBeDefined();
    }
  });

  it('모든 항목이 여덟 자질을 0..1 로 갖는다', () => {
    const lex = loadSeedLexicon();
    for (const [lemma, e] of Object.entries(lex)) {
      for (const k of FEATURE_KEYS) {
        const v = e.features[k];
        expect(Number.isFinite(v), `${lemma}.${k}`).toBe(true);
        expect(v, `${lemma}.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${lemma}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gloss_en 이 겹치지 않는다 — 영어 파서가 한 낱말을 두 표제어로 잇는다', () => {
    const seen = new Map<string, string>();
    for (const e of Object.values(loadSeedLexicon())) {
      const g = e.gloss_en.toLowerCase();
      expect(seen.get(g), `${e.lemma} 와 ${seen.get(g)} 의 gloss 가 같다: ${g}`).toBeUndefined();
      seen.set(g, e.lemma);
    }
  });
});

describe('자질 유일성', () => {
  it('서로 다른 표제어는 서로 다른 자질을 갖는다', () => {
    // 자질이 형태를 결정하므로, 자질이 같으면 두 단어가 같은 그림이 된다.
    // 원칙 2 위반이다.
    const seen = new Map<string, string>();
    for (const [lemma, e] of Object.entries(lex)) {
      const key = FEATURE_KEYS.map((k) => e.features[k].toFixed(4)).join(',');
      const prev = seen.get(key);
      expect(prev, `"${lemma}" 와 "${prev}" 의 자질이 같다`).toBeUndefined();
      seen.set(key, lemma);
    }
  });

  it('사랑과 미움은 정서가만 크게 다르다', () => {
    const love = lookup(lex, '사랑')!.features;
    const hate = lookup(lex, '미움')!.features;
    expect(Math.abs(love.valence - hate.valence)).toBeGreaterThan(0.7);
    // 나머지 자질은 가깝다 — 그래서 형태의 나머지는 닮아야 한다
    for (const k of FEATURE_KEYS) {
      if (k === 'valence') continue;
      expect(Math.abs(love[k] - hate[k]), k).toBeLessThan(0.12);
    }
  });

  it('고양이와 개는 자질이 가깝다', () => {
    const cat = lookup(lex, '고양이')!.features;
    const dog = lookup(lex, '개')!.features;
    for (const k of FEATURE_KEYS) {
      expect(Math.abs(cat[k] - dog[k]), k).toBeLessThan(0.12);
    }
  });
});

describe('averageFeatures', () => {
  it('단일 입력은 그대로 반환한다', () => {
    expect(averageFeatures([mid])).toEqual(mid);
  });

  it('두 값의 평균을 낸다', () => {
    expect(averageFeatures([withF({ valence: 0 }), withF({ valence: 1 })]).valence)
      .toBeCloseTo(0.5, 6);
  });

  it('모든 자질을 평균한다 — 빠뜨리는 자질이 없다', () => {
    const lo = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as unknown as SemanticFeatures;
    const hi = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 1])) as unknown as SemanticFeatures;
    const avg = averageFeatures([lo, hi]);
    for (const k of FEATURE_KEYS) expect(avg[k], k).toBeCloseTo(0.5, 6);
  });

  it('입력을 변경하지 않는다', () => {
    const a = withF({ valence: 0.2 });
    const before = { ...a };
    averageFeatures([a, withF({ valence: 0.8 })]);
    expect(a).toEqual(before);
  });

  it('빈 배열이면 던진다', () => {
    expect(() => averageFeatures([])).toThrow();
  });

  it('결과가 0..1 범위를 벗어나지 않는다', () => {
    const all = Object.values(lex).map((e) => e.features);
    const avg = averageFeatures(all);
    for (const k of FEATURE_KEYS) {
      expect(avg[k], k).toBeGreaterThanOrEqual(0);
      expect(avg[k], k).toBeLessThanOrEqual(1);
    }
  });
});

describe('NEUTRAL_FEATURES', () => {
  it('8개 자질을 0..1 범위로 갖는다', () => {
    for (const k of FEATURE_KEYS) {
      expect(NEUTRAL_FEATURES[k], k).toBeGreaterThanOrEqual(0);
      expect(NEUTRAL_FEATURES[k], k).toBeLessThanOrEqual(1);
    }
  });

  it('씨앗 사전의 어떤 항목과도 같지 않다', () => {
    // 같으면 미등재어가 어떤 등재어와 같은 그림이 된다.
    const key = (f: SemanticFeatures) => FEATURE_KEYS.map((k) => f[k].toFixed(4)).join(',');
    const neutral = key(NEUTRAL_FEATURES);
    for (const [lemma, e] of Object.entries(lex)) {
      expect(key(e.features), lemma).not.toBe(neutral);
    }
  });
});

describe('표제어는 입력에서 닿을 수 있어야 한다', () => {
  it('표제어에 괄호나 주석이 없다', () => {
    // 한국어 파서는 어절에서 조사를 뗀 문자열로 사전을 찾는다. '눈(眼)' 같은
    // 표제어는 어떤 입력으로도 나오지 않아 영원히 그려지지 않는다.
    // 동음이의어는 사전 키가 아니라 별도의 판별 장치로 풀어야 한다.
    for (const lemma of Object.keys(loadSeedLexicon())) {
      expect(/[()（）[\]]/.test(lemma), lemma).toBe(false);
    }
  });
});

describe('한 개념 한 표제어 (계획 III 최종 리뷰 C6)', () => {
  it('한 형태는 한 개념에만 닿는다 — 별칭이 겹치지 않는다', () => {
    const lex = loadSeedLexicon();
    const seen = new Map<string, string>();
    for (const e of Object.values(lex)) {
      for (const f of [e.lemma, ...(e.aliases ?? [])]) {
        expect(seen.get(f), `${f}: ${e.lemma} 와 ${seen.get(f)}`).toBeUndefined();
        seen.set(f, e.lemma);
      }
    }
  });

  it('영어 형태도 한 개념에만 닿는다', () => {
    const seen = new Map<string, string>();
    for (const e of Object.values(loadSeedLexicon())) {
      for (const g of [e.gloss_en, ...(e.glossAliases ?? [])].map((x) => x.toLowerCase())) {
        expect(seen.get(g), `${g}: ${e.lemma} 와 ${seen.get(g)}`).toBeUndefined();
        seen.set(g, e.lemma);
      }
    }
  });

  it('별칭으로 찾아도 대표 표제어가 나온다', () => {
    const lex = loadSeedLexicon();
    expect(lookup(lex, '선택하다')?.lemma).toBe('선택');
    expect(lookup(lex, '기다리다')?.lemma).toBe('기다림');
    expect(lookup(lex, '좋아하다')?.lemma).toBe('좋아함');
  });

  it('연인 문장의 동사가 사전에 있다 — 알다·잃다·좋아함, miss → 그리움', () => {
    const lex = loadSeedLexicon();
    for (const [lemma, gloss] of [['알다', 'know'], ['잃다', 'lose'], ['좋아함', 'like']] as const) {
      expect(lookup(lex, lemma)?.gloss_en, lemma).toBe(gloss);
      expect(lookup(lex, lemma)?.defaultRole, lemma).toBe('행위');
    }
    expect(lookup(lex, '그리움')?.glossAliases).toContain('miss');
    // 좋다 는 "좋다(good)" 와 뜻이 겹치므로 별칭으로 두지 않는다 — 파서가 문맥으로 가른다
    expect(lookup(lex, '좋다')).toBeUndefined();
  });

  it('사실상 같은 개념이 두 항목으로 남아 있지 않다', () => {
    // 자질 거리(L1)가 이보다 가까우면 같은 개념의 중복으로 본다
    const es = Object.values(loadSeedLexicon());
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const d = FEATURE_KEYS.reduce((s, k) => s + Math.abs(es[i]!.features[k] - es[j]!.features[k]), 0);
      expect(d, `${es[i]!.lemma} / ${es[j]!.lemma}`).toBeGreaterThanOrEqual(0.06);
    }
  });
});
