import { describe as group, it, expect } from 'vitest';
import { partsOf, describe as describePart } from '../../web/breakdown';
import { parse } from '../../src/core/parse';
import { render } from '../../src/render/compose';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';

const lex = loadSeedLexicon();
const look = loadLook();
const resultOf = (text: string) => render(parse(text, lex), lex, look, { size: 300 });

group('partsOf', () => {
  it('획을 낱말별로 묶는다', () => {
    const parts = partsOf(resultOf('나는 너를 사랑해'));
    const labels = parts.map((p) => p.label).sort();
    expect(labels).toContain('사랑');
    expect(labels).toContain('나');
    expect(labels).toContain('너');
  });

  it('링을 따로 센다', () => {
    const parts = partsOf(resultOf('나는 너를 사랑해'));
    expect(parts.some((p) => p.role === 'ring')).toBe(true);
  });

  it('묶인 획 수를 센다', () => {
    for (const p of partsOf(resultOf('나는 너를 사랑해'))) {
      expect(p.count).toBeGreaterThan(0);
    }
  });

  it('같은 낱말이 다른 역할이면 따로 센다', () => {
    const parts = partsOf(resultOf('너는 너를 사랑해'));
    const yous = parts.filter((p) => p.label === '너');
    expect(yous.length).toBeGreaterThan(1);
  });

  it('설명 문장에 낱말과 역할이 들어간다', () => {
    const parts = partsOf(resultOf('나는 너를 사랑해'));
    const love = parts.find((p) => p.label === '사랑')!;
    const line = describePart(love);
    expect(line).toContain('사랑');
    expect(line).toContain('행위');
  });

  it('링 설명은 낱말이 아니라 링이라고 말한다', () => {
    const ring = partsOf(resultOf('사랑')).find((p) => p.role === 'ring')!;
    expect(describePart(ring)).toContain('링');
  });
});

group('링 묶음', () => {
  it('링의 획은 라벨이 달라도 한 줄로 나온다', () => {
    // 겹선·양보의 지나침이 따로 나오면 링이 둘인 것처럼 읽힌다
    for (const s of ['나는 너를 사랑해', '그럼에도 불구하고 나는 너를 사랑해']) {
      expect(partsOf(resultOf(s)).filter((p) => p.role === 'ring'), s).toHaveLength(1);
    }
  });

  it('링 묶음이 링의 획을 전부 센다', () => {
    const r = resultOf('나는 너를 사랑해');
    const ring = partsOf(r).find((p) => p.role === 'ring')!;
    expect(ring.count).toBe(r.strokes.filter((s) => String(s.role) === 'ring').length);
  });
});
