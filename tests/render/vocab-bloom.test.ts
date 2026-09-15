import { describe, it, expect } from 'vitest';
import { bloomStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { conceptParams } from '../../src/render/mapping';
import { loadSeedLexicon, lookup, FEATURE_KEYS, NEUTRAL_FEATURES } from '../../src/core/lexicon';
import { strokeMinRadius } from '../../src/render/stroke';
import { mulberry32 } from '../../src/core/hash';

const look = loadLook();
const lex = loadSeedLexicon();
const sp = conceptParams(lookup(lex, '사랑')!.features);
const r = () => mulberry32(11);
const ctx = (o = {}) => ({ angle: 0.4, depth: 0, n: 1, label: '사랑', role: '행위' as const, ...o });

describe('bloomStrokes', () => {
  it('획을 여러 개 낸다', () => {
    expect(bloomStrokes(look, sp, ctx(), r()).length).toBeGreaterThan(look.cLayers);
  });

  it('중심선과 굵기 배열의 길이가 같다', () => {
    for (const s of bloomStrokes(look, sp, ctx(), r())) {
      expect(s.widths).toHaveLength(s.pts.length);
    }
  });

  it('모든 획이 개념의 라벨과 역할을 갖는다', () => {
    for (const s of bloomStrokes(look, sp, ctx(), r())) {
      expect(s.label).toBe('사랑');
      expect(s.role).toBe('행위');
    }
  });

  it('링 안쪽으로 넘어오지 않는다', () => {
    // 이 프로젝트에서 가장 자주 깨졌던 제약이다.
    const floor = look.pR - look.pRingBase;
    for (const depth of [0, 1, 2, 5, 9]) {
      for (const s of bloomStrokes(look, sp, ctx({ depth }), r())) {
        expect(strokeMinRadius(s), `depth=${depth} ${s.label}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('깊이가 깊을수록 바깥으로 간다 — 안쪽이 아니다', () => {
    const inner = Math.min(...bloomStrokes(look, sp, ctx({ depth: 0 }), r()).map(strokeMinRadius));
    const outer = Math.min(...bloomStrokes(look, sp, ctx({ depth: 3 }), r()).map(strokeMinRadius));
    expect(outer).toBeGreaterThan(inner);
  });

  it('복잡도 예산 — 개념이 많으면 획 수가 줄어든다', () => {
    const one = bloomStrokes(look, sp, ctx({ n: 1 }), r()).length;
    const many = bloomStrokes(look, sp, ctx({ n: 10 }), r()).length;
    expect(many).toBeLessThan(one);
  });

  it('반점 수가 0이면 반점 획을 만들지 않는다', () => {
    // 확정 조형은 cSpeck 0 이다.
    const s = bloomStrokes(look, sp, ctx(), r());
    expect(s.some((x) => x.label.includes('반점'))).toBe(false);
  });

  it('가시 개수를 0으로 하면 덩어리 층만 남는다', () => {
    const bare = bloomStrokes({ ...look, cFringe: 0, cWhisker: 0 }, sp, ctx(), r());
    expect(bare.length).toBeLessThan(bloomStrokes(look, sp, ctx(), r()).length);
    expect(bare.length).toBeGreaterThanOrEqual(1);
  });

  it('가시 끝이 뭉툭하다 — 끝 굵기가 0이 아니다', () => {
    const all = bloomStrokes(look, sp, ctx(), r());
    const hairs = all.filter((s) => s.pts.length <= 10 && s.widths.length <= 10);
    expect(hairs.length).toBeGreaterThan(0);
    for (const h of hairs) {
      expect(h.widths[h.widths.length - 1]!).toBeGreaterThan(0.0004);
    }
  });

  it('결정적이다', () => {
    expect(bloomStrokes(look, sp, ctx(), r())).toEqual(bloomStrokes(look, sp, ctx(), r()));
  });

  it('각도를 바꾸면 결과가 달라진다', () => {
    const a = bloomStrokes(look, sp, ctx({ angle: 0.4 }), r());
    const b = bloomStrokes(look, sp, ctx({ angle: 2.1 }), r());
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('어느 자질을 바꿔도 획이 달라진다 — 자질이 기하까지 닿는다 (원칙 2)', () => {
    // mapping 테스트는 배수만 본다. 배수가 기하에 닿지 않으면 그 자질은 죽는다.
    for (const key of FEATURE_KEYS) {
      const lo = bloomStrokes(look, conceptParams({ ...NEUTRAL_FEATURES, [key]: 0.02 }), ctx(), mulberry32(7));
      const hi = bloomStrokes(look, conceptParams({ ...NEUTRAL_FEATURES, [key]: 0.98 }), ctx(), mulberry32(7));
      expect(JSON.stringify(hi), key).not.toBe(JSON.stringify(lo));
    }
  });

  it('사랑과 미움은 같은 시드에서도 다른 그림이다 — 정서가가 감김으로 드러난다', () => {
    const lex = loadSeedLexicon();
    const love = bloomStrokes(look, conceptParams(lookup(lex, '사랑')!.features), ctx(), mulberry32(7));
    const hate = bloomStrokes(look, conceptParams(lookup(lex, '미움')!.features), ctx(), mulberry32(7));
    expect(JSON.stringify(love)).not.toBe(JSON.stringify(hate));
  });

  it('긍정은 가시가 한쪽으로, 부정은 반대쪽으로 쏠린다', () => {
    // 가시(뿌리→끝)의 접선 방향 성분 평균: 반경 방향에 대한 회전 부호
    const sweep = (valence: number) => {
      const ss = bloomStrokes(look, conceptParams({ ...NEUTRAL_FEATURES, valence }), ctx(), mulberry32(7))
        .filter((s) => s.pts.length <= 8);          // 가시 (bezPts 7 → 8점)
      let acc = 0;
      for (const s of ss) {
        const a = s.pts[0]!, t = s.pts[s.pts.length - 1]!;
        acc += a[0] * (t[1] - a[1]) - a[1] * (t[0] - a[0]);   // 외적 z: +면 반시계
      }
      return acc / ss.length;
    };
    expect(Math.sign(sweep(0.98))).not.toBe(Math.sign(sweep(0.02)));
  });

  it('극단 자질과 실제 최대 깊이에서도 캔버스 반경 0.9 안에 머문다', () => {
    // 균등 배치에서 최대 깊이는 ceil(10/5)-1 = 1 이다. 여유를 두고 3까지 본다.
    for (const key of FEATURE_KEYS) for (const v of [0, 1]) for (let depth = 0; depth <= 3; depth++) {
      for (const s of bloomStrokes(look, conceptParams({ ...NEUTRAL_FEATURES, [key]: v }), ctx({ depth }), mulberry32(3))) {
        s.pts.forEach((p, i) => {
          expect(Math.hypot(p[0], p[1]) + (s.widths[i] ?? 0) / 2, `${key}=${v} d=${depth}`).toBeLessThanOrEqual(0.9);
        });
      }
    }
  });
});
