import { describe, it, expect } from 'vitest';
import { bloomStrokes } from '../../src/render/vocab';
import { loadLook } from '../../src/render/look';
import { conceptParams } from '../../src/render/mapping';
import { loadSeedLexicon, lookup } from '../../src/core/lexicon';
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
});
