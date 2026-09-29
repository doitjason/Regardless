# 연기 렌더러 + 번짐 (화면 경험 1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹앱의 로고그램을 룩랩의 WebGL2 먹 셰이더로 그리고, 링 위의 한 점에서 먹이 양쪽으로 번져 나오게 한다.

**Architecture:** 순수 함수 `arrival()` 이 엔진 골격(`buildStrokes`)의 점마다 도착 시각과 묶음 번호를 계산한다. `maskVertices()` 가 이를 삼각형 정점 `[x, y, t, part]` 로 만들고, `SmokeRenderer` 가 그것을 마스크 텍스처(R=덮임, G=도착 시각, B=묶음 번호)에 그린 뒤 룩랩 셰이더로 먹을 칠한다. WebGL2 가 없으면 지금의 SVG 를 그대로 둔다.

**Tech Stack:** TypeScript 5 (strict, `noUncheckedIndexedAccess`), Vite 5 (root `web/`), Vitest (environment `node`), WebGL2 (GLSL ES 3.00). 라이브러리 추가 없음.

**상위 문서:** `docs/superpowers/specs/2026-09-29-screen-experience-design.md` (4.1, 4.2, 5, 6-1단계), `docs/superpowers/specs/2026-09-11-heptapod-b-design.md` 9.5절.

## Global Constraints

- 커밋 메시지는 한국어, 마지막 줄은 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- `git add -A` 금지 — 파일을 이름으로 더한다
- `src/core` 는 `src/render` 를 임포트하지 않는다. `src/core`·`src/render`·`web` 에 Node 전용 API(`fs`, `path`, `process` 등)를 쓰지 않는다
- 조형 수치는 `design/look-v3.json` 에만, 번짐 시간 수치는 `design/screen.json` 에만 둔다. 코드에 수치를 박지 않는다 (셰이더 안의 노이즈 상수처럼 룩랩에서 그대로 옮긴 것은 예외)
- 결정성: `arrival`·`maskVertices` 에 `Math.random`, `Date`, `performance` 를 쓰지 않는다. 난수는 `mulberry32(subSeed(seed, …))` 로만
- 영화 이미지·로고·음원·글꼴을 쓰지 않는다
- 기존 테스트(현재 501개)는 한 줄도 약해지지 않는다. 목걸이 컷 파일(`npx tsx src/cli.ts --text "그럼에도 불구하고 나는 너를 사랑해" --necklace --cut --out <tmp>`)은 이 계획 전후로 바이트 단위로 같다
- 사용자에게 보이는 글은 한국어

## File Structure

| 파일 | 책임 |
|---|---|
| `src/render/parts.ts` (새) | 획 → 묶음 키. 분해 보기와 번짐 시간표가 같은 규칙을 쓴다 |
| `src/render/arrival.ts` (새) | 번짐 시간표 — 점마다 도착 시각, 획마다 묶음 번호, 묶음 순서 |
| `web/breakdown.ts` (수정) | `partKeyOf` 를 `src/render/parts.ts` 에서 가져와 다시 내보낸다 |
| `web/smoke/geometry.ts` (새) | 골격 + 시간표 → 마스크용 삼각형 정점 |
| `web/smoke/shaders.ts` (새) | GLSL 소스 문자열 4개와 셰이더가 읽는 룩 키 목록 |
| `web/smoke/renderer.ts` (새) | WebGL2 자원 관리 — 마스크 그리기, 한 프레임 그리기 |
| `design/screen.json` (새) | 번짐 시간 수치 (화면 전용) |
| `web/screen.ts` (새) | `screen.json` 을 읽고 검증한다 |
| `web/main.ts`, `web/index.html`, `web/style.css` (수정) | 캔버스를 붙이고, 번짐을 돌리고, WebGL2 가 없으면 SVG |

---

### Task 1: 번짐 시간표

**Files:**
- Create: `src/render/parts.ts`, `src/render/arrival.ts`
- Modify: `web/breakdown.ts:35-45`
- Test: `tests/render/arrival.test.ts`

**Interfaces:**
- Consumes: `buildStrokes(ir, lex, look): SkeletonResult` (`src/render/compose.ts` — `{ strokes: Stroke[]; seed: number; total: number }`), `Stroke` (`src/render/stroke.ts` — `{ pts: Pt[]; widths: number[]; label: string; role: Role | 'ring' }`), `subSeed(seed: number, key: string): number` (`src/core/ir`), `mulberry32(seed: number): () => number` (`src/core/hash`), `LookParams` 의 `pR` (링 반경)
- Produces:
  - `partKeyOf(s: { role: unknown; label: string }): string` — `src/render/parts.ts`
  - `interface ArrivalTiming { ringSeconds: number; depthSecondsPerUnit: number; flowSpeed: number; jitterSeconds: number; tailSeconds: number }`
  - `interface StrokeArrival { times: number[]; part: number }` — `times.length === stroke.pts.length`, 초 단위
  - `interface Arrival { origin: number; duration: number; strokes: StrokeArrival[]; parts: string[] }` — `strokes[i]` 는 `sk.strokes[i]` 와 짝, `parts[0] === 'ring|링'`, 나머지는 첫 도착 순
  - `angularDistance(a: number, b: number): number` (0..π), `ringTimeAt(theta: number, origin: number, timing: ArrivalTiming): number`
  - `arrival(sk: SkeletonResult, look: LookParams, timing: ArrivalTiming): Arrival`

- [ ] **Step 1: `partKeyOf` 를 엔진 쪽으로 옮긴다**

`src/render/parts.ts`:

```ts
/**
 * 획 하나가 어느 묶음에 속하는지 (분해 보기·번짐·해독이 같은 규칙을 쓴다).
 *
 * 링의 획들(본체·겹선·양보의 지나침)은 라벨이 달라도 한 묶음이다. 보는
 * 사람에게는 모두 "링" 이고, 두 줄로 나오면 링이 둘인 것처럼 읽힌다.
 * 같은 낱말이라도 역할이 다르면 다른 자리에 그려지므로 다른 묶음이다.
 */
export function partKeyOf(s: { role: unknown; label: string }): string {
  const role = String(s.role);
  return role === 'ring' ? 'ring|링' : `${role}|${s.label}`;
}
```

`web/breakdown.ts` 에서 기존 `partKeyOf` 함수 정의(주석 포함, 35~45행)를 지우고 파일 맨 위 임포트 옆에 넣는다:

```ts
import { partKeyOf } from '../src/render/parts';
export { partKeyOf };
```

Run: `npx vitest run tests/web/breakdown.test.ts`
Expected: PASS (동작이 같으므로 기존 테스트 그대로 통과)

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/render/arrival.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes, type SkeletonResult } from '../../src/render/compose';
import { arrival, ringTimeAt, angularDistance, type ArrivalTiming } from '../../src/render/arrival';
import { partKeyOf } from '../../src/render/parts';

const lex = loadSeedLexicon();
const look = loadLook();
const T: ArrivalTiming = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8 };
const skOf = (s: string) => buildStrokes(parse(s, lex), lex, look);
const KEY = '그럼에도 불구하고 나는 너를 사랑해';

describe('angularDistance / ringTimeAt', () => {
  it('각거리는 0..π 이고 방향과 무관하다', () => {
    expect(angularDistance(0.1, 0.1)).toBeCloseTo(0);
    expect(angularDistance(0, Math.PI)).toBeCloseTo(Math.PI);
    expect(angularDistance(0.2, -0.2)).toBeCloseTo(0.4);
    expect(angularDistance(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0);
  });

  it('링의 먹은 시작점에서 양쪽으로 같은 속도로 번진다 — 시계 방향 쓸기가 없다', () => {
    const o = 1.234;
    expect(ringTimeAt(o, o, T)).toBeCloseTo(0);
    expect(ringTimeAt(o + Math.PI, o, T)).toBeCloseTo(T.ringSeconds);
    for (const d of [0.1, 0.7, 1.5, 2.9]) {
      expect(ringTimeAt(o + d, o, T)).toBeCloseTo(ringTimeAt(o - d, o, T), 12);
    }
    expect(ringTimeAt(o + 0.5, o, T)).toBeLessThan(ringTimeAt(o + 1.0, o, T));
  });
});

describe('arrival', () => {
  it('같은 문장이면 같은 시간표다 — 언어가 달라도', () => {
    const a = arrival(skOf(KEY), look, T);
    expect(arrival(skOf(KEY), look, T)).toEqual(a);
    expect(arrival(skOf('Regardless, I love you'), look, T)).toEqual(a);
  });

  it('시작점은 문장마다 다르다', () => {
    const a = arrival(skOf(KEY), look, T).origin;
    const b = arrival(skOf('나는 바다를 보았다'), look, T).origin;
    expect(a).not.toBeCloseTo(b, 6);
  });

  it('점마다 시각이 있고, 전체 길이는 마지막 도착 뒤 여운까지다', () => {
    const sk = skOf(KEY);
    const a = arrival(sk, look, T);
    expect(a.strokes.length).toBe(sk.strokes.length);
    let max = 0;
    a.strokes.forEach((s, i) => {
      expect(s.times.length).toBe(sk.strokes[i]!.pts.length);
      for (const t of s.times) { expect(t).toBeGreaterThanOrEqual(0); max = Math.max(max, t); }
    });
    expect(a.duration).toBeCloseTo(max + T.tailSeconds, 9);
  });

  it('링이 아닌 획은 링의 선두가 뿌리에 닿은 뒤에 번지고, 뿌리에서 끝으로 흐른다', () => {
    const sk = skOf(KEY);
    const a = arrival(sk, look, T);
    sk.strokes.forEach((s, i) => {
      if (s.role === 'ring' || s.pts.length < 2) return;
      const times = a.strokes[i]!.times;
      const r = times.indexOf(Math.min(...times));
      const rp = s.pts[r]!;
      expect(times[r]!).toBeGreaterThanOrEqual(ringTimeAt(Math.atan2(rp[1], rp[0]), a.origin, T) - 1e-9);
      for (let k = r + 1; k < times.length; k++) expect(times[k]!).toBeGreaterThanOrEqual(times[k - 1]!);
      for (let k = r - 1; k >= 0; k--) expect(times[k]!).toBeGreaterThanOrEqual(times[k + 1]!);
    });
  });

  it('바깥 층일수록 늦게 번진다', () => {
    const line = (r0: number, r1: number) => ({
      pts: [[r0, 0], [r1, 0]] as [number, number][], widths: [0.01, 0.01], label: 'x', role: '대상' as const,
    });
    const sk: SkeletonResult = { seed: 7, total: 2, strokes: [line(look.pR + 0.02, 0.8), line(look.pR + 0.2, 0.9)] };
    const a = arrival(sk, look, { ...T, jitterSeconds: 0 });
    expect(a.strokes[1]!.times[0]!).toBeGreaterThan(a.strokes[0]!.times[0]!);
  });

  it('묶음: 링이 0번, 나머지는 첫 도착 순, 같은 키는 같은 번호', () => {
    const sk = skOf(KEY);
    const a = arrival(sk, look, T);
    expect(a.parts[0]).toBe('ring|링');
    sk.strokes.forEach((s, i) => expect(a.parts[a.strokes[i]!.part]).toBe(partKeyOf(s)));
    const first = a.parts.map((k) => Math.min(...sk.strokes.flatMap((s, i) =>
      partKeyOf(s) === k ? a.strokes[i]!.times : [])));
    for (let k = 2; k < first.length; k++) expect(first[k]!).toBeGreaterThanOrEqual(first[k - 1]!);
    expect(new Set(a.parts).size).toBe(a.parts.length);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/render/arrival.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/arrival'`

- [ ] **Step 4: 구현한다**

`src/render/arrival.ts`:

```ts
import { mulberry32 } from '../core/hash';
import { subSeed } from '../core/ir';
import type { Pt } from './geometry';
import type { SkeletonResult } from './compose';
import type { LookParams } from './look';
import { partKeyOf } from './parts';

/**
 * 번짐 시간표 (화면 경험 설계 4.1).
 *
 * 먹은 링 위의 한 점(시작점)에서 **양쪽으로 동시에** 번진다. 시계 방향으로
 * 쓸면 설계 문서 6.1 에서 없앤 '읽는 방향' 이 애니메이션으로 되살아난다
 * (9.5.2). 그래서 링의 도착 시각은 시작점으로부터의 각거리만의 함수다.
 *
 * 시작점은 IR 시드에서 정한다 — 같은 문장이면 늘 같은 곳에서 번진다.
 * 수치는 호출자가 `timing` 으로 넘긴다 (`design/screen.json`). 이 파일에
 * 시간 수치를 박지 않는다.
 */
export interface ArrivalTiming {
  /** 링의 먹 선두가 시작점 반대편까지 가는 시간 (초) */
  ringSeconds: number;
  /** 링 바깥으로 p 거리 1 만큼 떨어질 때마다 늦어지는 시간 (초) */
  depthSecondsPerUnit: number;
  /** 획을 따라 먹이 흐르는 속도 (p 단위/초) */
  flowSpeed: number;
  /** 획마다 도착 시각을 흩는 최대 폭 (초) */
  jitterSeconds: number;
  /** 마지막 점이 칠해진 뒤 번짐이 끝나기까지 (초) */
  tailSeconds: number;
}

export interface StrokeArrival {
  /** 점마다 도착 시각 (초). `pts` 와 길이가 같다 */
  times: number[];
  /** `Arrival.parts` 의 색인 */
  part: number;
}

export interface Arrival {
  /** 시작점 각도 (라디안, 0..2π) */
  origin: number;
  /** 번짐 전체 길이 (초) */
  duration: number;
  /** `sk.strokes` 와 같은 순서·같은 길이 */
  strokes: StrokeArrival[];
  /** 묶음 키. 0번은 링, 나머지는 먹이 처음 닿은 순서 — 해독 순서다 */
  parts: string[];
}

const TAU = Math.PI * 2;
const RING_KEY = 'ring|링';

/** 두 각의 차이 (0..π). 방향을 가리지 않는다. */
export function angularDistance(a: number, b: number): number {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? TAU - d : d;
}

/** 링 위 각도 `theta` 에 먹이 닿는 시각. 시작점 기준 대칭이다. */
export function ringTimeAt(theta: number, origin: number, timing: ArrivalTiming): number {
  return (timing.ringSeconds * angularDistance(theta, origin)) / Math.PI;
}

const angleOf = (p: Pt) => Math.atan2(p[1], p[0]);
const radiusOf = (p: Pt) => Math.hypot(p[0], p[1]);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function arrival(sk: SkeletonResult, look: LookParams, timing: ArrivalTiming): Arrival {
  const rnd = mulberry32(subSeed(sk.seed, 'arrival'));
  const origin = rnd() * TAU;

  const raw: number[][] = sk.strokes.map((s) => {
    if (s.pts.length === 0) return [];
    // 링(본체·겹선·양보의 지나침)은 각도만으로 정한다
    if (s.role === 'ring') return s.pts.map((p) => ringTimeAt(angleOf(p), origin, timing));

    // 뿌리 = 링에 가장 가까운 점. 먹은 링에서 뿌리로 건너가 거기서 양 끝으로 흐른다.
    let root = 0;
    for (let i = 1; i < s.pts.length; i++) {
      if (radiusOf(s.pts[i]!) < radiusOf(s.pts[root]!)) root = i;
    }
    const rp = s.pts[root]!;
    const t0 = ringTimeAt(angleOf(rp), origin, timing)
      + Math.max(0, radiusOf(rp) - look.pR) * timing.depthSecondsPerUnit
      + rnd() * timing.jitterSeconds;

    const times = new Array<number>(s.pts.length).fill(0);
    times[root] = t0;
    for (let i = root + 1; i < s.pts.length; i++) {
      times[i] = times[i - 1]! + dist(s.pts[i - 1]!, s.pts[i]!) / timing.flowSpeed;
    }
    for (let i = root - 1; i >= 0; i--) {
      times[i] = times[i + 1]! + dist(s.pts[i + 1]!, s.pts[i]!) / timing.flowSpeed;
    }
    return times;
  });

  // 묶음: 링은 0번, 나머지는 첫 도착 순 (같으면 키의 코드 단위 순 — 로캘 비교 금지)
  const first = new Map<string, number>();
  sk.strokes.forEach((s, i) => {
    const k = partKeyOf(s);
    const m = raw[i]!.length > 0 ? Math.min(...raw[i]!) : Infinity;
    first.set(k, Math.min(first.get(k) ?? Infinity, m));
  });
  const others = [...first.keys()].filter((k) => k !== RING_KEY).sort((a, b) =>
    (first.get(a)! - first.get(b)!) || (a < b ? -1 : a > b ? 1 : 0));
  const parts = [RING_KEY, ...others];
  const index = new Map(parts.map((k, i) => [k, i]));

  let last = 0;
  for (const ts of raw) for (const t of ts) last = Math.max(last, t);

  return {
    origin,
    duration: last + timing.tailSeconds,
    strokes: sk.strokes.map((s, i) => ({ times: raw[i]!, part: index.get(partKeyOf(s))! })),
    parts,
  };
}
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npx vitest run tests/render/arrival.test.ts tests/web/breakdown.test.ts`
Expected: PASS

Run: `npm test && npm run typecheck`
Expected: 모두 통과 (기존 501개 + 새 테스트)

- [ ] **Step 6: 커밋**

```bash
git add src/render/parts.ts src/render/arrival.ts web/breakdown.ts tests/render/arrival.test.ts
git commit -m "feat: 번짐 시간표 — 링의 한 점에서 양쪽으로 번지는 도착 시각

시작점은 IR 시드에서 정하고, 링의 도착 시각은 시작점으로부터의
각거리만의 함수다 — 시계 방향 쓸기가 없다. 묶음 키 규칙은 분해 보기와
공유하도록 src/render/parts.ts 로 옮겼다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 마스크용 삼각형 정점

**Files:**
- Create: `web/smoke/geometry.ts`
- Test: `tests/web/smoke-geometry.test.ts`

**Interfaces:**
- Consumes: `SkeletonResult` (Task 1 의 입력과 같음), `Arrival` (Task 1)
- Produces:
  - `const FLOATS_PER_VERTEX = 4`
  - `maskVertices(sk: SkeletonResult, arr: Arrival): Float32Array` — 정점마다 `[x, y, t, part]`. `x, y` 는 p 공간, `t = 도착 시각 / arr.duration` (0..1), `part` 는 묶음 번호(정수). 점이 2개 미만인 획은 건너뛴다. 점 n 개인 획은 삼각형 `2(n-1)` 개 = 정점 `6(n-1)` 개

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/web/smoke-geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes, type SkeletonResult } from '../../src/render/compose';
import { arrival, type Arrival } from '../../src/render/arrival';
import { maskVertices, FLOATS_PER_VERTEX } from '../../web/smoke/geometry';

const lex = loadSeedLexicon();
const look = loadLook();
const T = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8 };

describe('maskVertices', () => {
  it('곧은 획 하나: 정점 6개, 폭만큼 벌어지고, 시각은 정규화된다', () => {
    const sk: SkeletonResult = { seed: 1, total: 1, strokes: [
      { pts: [[0.5, 0], [0.7, 0]], widths: [0.02, 0.02], label: 'x', role: '대상' },
    ] };
    const arr: Arrival = { origin: 0, duration: 4, parts: ['ring|링', '대상|x'],
      strokes: [{ times: [1, 3], part: 1 }] };
    const v = maskVertices(sk, arr);
    expect(v.length).toBe(6 * FLOATS_PER_VERTEX);
    const ys = [0, 1, 2, 3, 4, 5].map((k) => v[k * 4 + 1]!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.02, 6);
    const ts = [0, 1, 2, 3, 4, 5].map((k) => v[k * 4 + 2]!);
    expect(Math.min(...ts)).toBeCloseTo(0.25, 6);
    expect(Math.max(...ts)).toBeCloseTo(0.75, 6);
    for (let k = 0; k < 6; k++) expect(v[k * 4 + 3]).toBe(1);
  });

  it('점이 2개 미만인 획은 건너뛴다', () => {
    const sk: SkeletonResult = { seed: 1, total: 1, strokes: [
      { pts: [[0.5, 0]], widths: [0.02], label: 'x', role: '대상' },
    ] };
    const arr: Arrival = { origin: 0, duration: 1, parts: ['ring|링', '대상|x'], strokes: [{ times: [0], part: 1 }] };
    expect(maskVertices(sk, arr).length).toBe(0);
  });

  it('실제 문장: 정점 수가 맞고 시각은 0..1, 묶음은 정수', () => {
    const sk = buildStrokes(parse('그럼에도 불구하고 나는 너를 사랑해', lex), lex, look);
    const arr = arrival(sk, look, T);
    const v = maskVertices(sk, arr);
    const want = sk.strokes.reduce((n, s) => n + (s.pts.length >= 2 ? 6 * (s.pts.length - 1) : 0), 0);
    expect(v.length).toBe(want * FLOATS_PER_VERTEX);
    for (let k = 0; k < v.length; k += FLOATS_PER_VERTEX) {
      expect(v[k + 2]!).toBeGreaterThanOrEqual(0);
      expect(v[k + 2]!).toBeLessThanOrEqual(1);
      expect(Number.isInteger(v[k + 3]!)).toBe(true);
      expect(v[k + 3]!).toBeLessThan(arr.parts.length);
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/web/smoke-geometry.test.ts`
Expected: FAIL — `Cannot find module '../../web/smoke/geometry'`

- [ ] **Step 3: 구현한다**

`web/smoke/geometry.ts`:

```ts
import type { SkeletonResult } from '../../src/render/compose';
import type { Arrival } from '../../src/render/arrival';

/** 정점 하나 = [x, y, t, part] */
export const FLOATS_PER_VERTEX = 4;

/**
 * 골격 + 번짐 시간표 → 마스크 텍스처에 그릴 삼각형 정점.
 *
 * 획마다 중심선의 양옆으로 반폭만큼 벌린 띠를 만든다 (룩랩 `strip` 과 같은
 * 방식). 좌표는 p 공간 그대로다 — 화면 배율은 셰이더의 `uHalf` 가 맡는다.
 * `t` 는 전체 길이로 나눈 0..1 이어서 8비트 텍스처 채널에 담을 수 있다.
 */
export function maskVertices(sk: SkeletonResult, arr: Arrival): Float32Array {
  const out: number[] = [];
  sk.strokes.forEach((s, si) => {
    const n = s.pts.length;
    if (n < 2) return;
    const a = arr.strokes[si]!;
    const part = a.part;
    const L: [number, number][] = [];
    const R: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const h = s.widths[i]! / 2;
      const pv = s.pts[Math.max(i - 1, 0)]!;
      const nx = s.pts[Math.min(i + 1, n - 1)]!;
      let dx = nx[0] - pv[0], dy = nx[1] - pv[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const p = s.pts[i]!;
      L.push([p[0] - dy * h, p[1] + dx * h]);
      R.push([p[0] + dy * h, p[1] - dx * h]);
    }
    const t = (i: number) => Math.min(1, Math.max(0, a.times[i]! / arr.duration));
    const v = (q: [number, number], i: number) => out.push(q[0], q[1], t(i), part);
    for (let i = 0; i < n - 1; i++) {
      v(L[i]!, i); v(R[i]!, i); v(L[i + 1]!, i + 1);
      v(R[i]!, i); v(R[i + 1]!, i + 1); v(L[i + 1]!, i + 1);
    }
  });
  return new Float32Array(out);
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npx vitest run tests/web/smoke-geometry.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/smoke/geometry.ts tests/web/smoke-geometry.test.ts
git commit -m "feat: 마스크용 삼각형 정점 — 위치와 도착 시각, 묶음 번호

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 셰이더와 WebGL2 렌더러

**Files:**
- Create: `web/smoke/shaders.ts`, `web/smoke/renderer.ts`
- Test: `tests/web/smoke-renderer.test.ts`

**Interfaces:**
- Consumes: `LookParams`, `LOOK_KEYS` (`src/render/look.ts`), `P_SPAN` (`src/render/compose.ts`, = 0.9), `FLOATS_PER_VERTEX` (Task 2)
- Produces:
  - `SMOKE_LOOK_KEYS: readonly LookKey[]` — 셰이더가 `uniform float` 으로 읽는 룩 키
  - `MASK_VS`, `MASK_FS`, `SMOKE_VS`, `SMOKE_FS: string`
  - `class SmokeRenderer { static create(canvas: HTMLCanvasElement, look: LookParams): SmokeRenderer | null; setVertices(data: Float32Array): void; draw(timeSec: number, prog: number, highlight: number): void; resize(): void }` — `create` 는 WebGL2 가 없거나 셰이더가 실패하면 `null`. `prog` 0..1 (1 = 다 번짐), `highlight` 는 묶음 번호 또는 `-1`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/web/smoke-renderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadLook, LOOK_KEYS } from '../../src/render/look';
import { SMOKE_LOOK_KEYS, SMOKE_FS } from '../../web/smoke/shaders';
import { SmokeRenderer } from '../../web/smoke/renderer';

describe('smoke shaders', () => {
  it('셰이더가 읽는 룩 키는 모두 룩 JSON 에 있고, 셰이더에 선언돼 있다', () => {
    for (const k of SMOKE_LOOK_KEYS) {
      expect((LOOK_KEYS as readonly string[]).includes(k), k).toBe(true);
      expect(new RegExp(`uniform float[^;]*\\b${k}\\b`).test(SMOKE_FS), k).toBe(true);
    }
  });

  it('룩랩의 고정 분사 각도와 종이 모드는 쓰지 않는다', () => {
    expect(SMOKE_FS).not.toMatch(/pSprayAng|pPaper|pProg/);
  });
});

describe('SmokeRenderer.create', () => {
  it('WebGL2 가 없으면 null — 호출자가 SVG 로 대신한다', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(SmokeRenderer.create(canvas, loadLook())).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/web/smoke-renderer.test.ts`
Expected: FAIL — `Cannot find module '../../web/smoke/shaders'`

- [ ] **Step 3: 셰이더를 쓴다**

`web/smoke/shaders.ts` — 룩랩(`spikes/look-lab.html` 77~237행)의 셰이더를 옮기되 다음이 다르다: 정점이 `[x, y, t, part]` 이다 / 마스크는 p 공간의 정사각형(`±uHalf`)이다 / 도착 시각은 룩랩의 각도 공식 대신 마스크 G 채널에서 읽는다 / 격자·마스크 보기·종이 모드를 뺀다 / 강조 묶음을 빛낸다.

```ts
import type { LookKey } from '../../src/render/look';

/** 셰이더가 `uniform float` 으로 읽는 룩 키. 값은 `design/look-v3.json`. */
export const SMOKE_LOOK_KEYS = [
  'pSharp', 'pSoft', 'pDScale', 'pErode', 'pContrast', 'pFloor', 'pCore',
  'pGrainAmp', 'pGrainA', 'pGrainX', 'pInkWarp', 'pInkWarpF', 'pInkWarpS',
  'pFray', 'pFrayFall', 'pWisp', 'pWispFall', 'pPlume', 'pPlumeFall', 'pGate',
  'pDissolve', 'pTopFade', 'pInk', 'pInkCore', 'pBgTop', 'pBgMid', 'pBgBot',
  'pFog', 'pGrain', 'pVig', 'pLeadTurb', 'pFrontSoft',
] as const satisfies readonly LookKey[];

/** 1단계: 골격 삼각형을 마스크 텍스처(R=덮임, G=도착 시각, B=묶음/255)에 그린다. */
export const MASK_VS = `#version 300 es
in vec4 aV;
uniform float uHalf;
out vec2 vTP;
void main(){ vTP = aV.zw; gl_Position = vec4(aV.xy / uHalf, 0.0, 1.0); }`;

export const MASK_FS = `#version 300 es
precision highp float;
in vec2 vTP;
out vec4 o;
void main(){ o = vec4(1.0, vTP.x, vTP.y / 255.0, 1.0); }`;

/** 2단계: 화면 전체 삼각형 하나. */
export const SMOKE_VS = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export const SMOKE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform float uT, uHalf, uProg, uHighlight;

uniform float pSoft, pErode, pContrast, pFloor, pCore, pGrainAmp, pGrainA, pGrainX, pDScale;
uniform float pInkWarp, pInkWarpF, pInkWarpS, pSharp;
uniform float pFray, pFrayFall, pWisp, pWispFall, pPlume, pPlumeFall, pGate, pDissolve, pTopFade;
uniform float pInk, pInkCore, pBgTop, pBgMid, pBgBot, pFog, pGrain, pVig;
uniform float pLeadTurb, pFrontSoft;

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i+vec2(0,0)), f-vec2(0,0)), dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
             mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)), dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p, int oct){
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*gnoise(p); p = m*p; a *= 0.5; }
  return s;
}
float n01(float v){ return clamp(v * 1.9 + 0.5, 0.0, 1.0); }
float mask(vec2 uv, float lod){ return textureLod(uMask, uv, lod).r; }

void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  // p 공간: 화면의 짧은 변이 ±uHalf 에 맞는다. 마스크도 같은 정사각형이다.
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) * (2.0 * uHalf);
  vec2 uv = p / (2.0 * uHalf) + 0.5;

  // 먹물 자체의 일렁임 — 마스크를 읽는 좌표를 아주 약하게 워프한다 (9.5.1a)
  vec2 wq = vec2(fbm(p*pInkWarpF + vec2(5.0, 9.0) + uT*pInkWarpS, 3),
                 fbm(p*pInkWarpF + vec2(23.0, 3.0) - uT*pInkWarpS*0.85, 3));
  vec2 uvW = uv + wq * pInkWarp;

  float m0 = mask(uvW, 0.0);
  float m1 = mask(uvW, 1.7);
  float m3 = mask(uvW, 3.6);
  float m5 = mask(uvW, 5.8);

  float d = (0.5 - m1) * pDScale;
  float od = max(0.0, d);

  // 번짐: 도착 시각은 마스크 G 에 있다. 흐린 단계에서 G/R 을 읽으면
  // 획 바깥 가장자리도 가까운 먹의 평균 도착 시각을 얻는다.
  vec4 b = textureLod(uMask, uvW, 2.0);
  float arrive = b.r > 0.02 ? b.g / b.r : 1.0;
  float front = uProg * (1.0 + pFrontSoft);
  float reveal = smoothstep(front, front - pFrontSoft, arrive);
  float lead = exp(-pow((arrive - front + pFrontSoft*0.5) / max(pFrontSoft*0.55, 0.02), 2.0))
             * step(0.001, uProg) * step(uProg, 0.999);

  // 획의 결 방향 — 흐린 마스크의 기울기에서 접선을 얻는다
  vec2 tx = 1.0 / vec2(textureSize(uMask, 0));
  vec2 g = vec2(mask(uvW + vec2(tx.x*3.0, 0.0), 1.7) - mask(uvW - vec2(tx.x*3.0, 0.0), 1.7),
                mask(uvW + vec2(0.0, tx.y*3.0), 1.7) - mask(uvW - vec2(0.0, tx.y*3.0), 1.7));
  vec2 tang = length(g) > 1e-5 ? normalize(vec2(-g.y, g.x)) : vec2(1.0, 0.0);
  vec2 nr = vec2(-tang.y, tang.x);
  vec2 pa = vec2(dot(p, tang) * pGrainA, dot(p, nr) * pGrainX);

  vec2 w1 = vec2(fbm(p*2.2 + vec2(11.3, 4.1) + uT*0.030, 4),
                 fbm(p*2.2 + vec2(27.7, 19.2) - uT*0.024, 4));
  vec2 w2 = vec2(fbm(p*5.0 + w1*1.1 + vec2(3.1, 51.7) + uT*0.055, 4),
                 fbm(p*5.0 + w1*1.1 + vec2(41.9, 7.3) - uT*0.045, 4));
  float nLow   = fbm(p*2.4 + w1*0.9, 4);
  float nMid   = fbm(p*8.5 + w2*2.2, 5);
  float nHi    = fbm(p*21.0 + w2*3.4, 4);
  float nFil   = fbm(p*15.0 + w2*5.0 + nLow*2.2, 5);
  float nGrain = fbm(pa + w2*2.0, 5);

  float turb = 1.0 + lead * pLeadTurb;

  float interior = smoothstep(0.010, -pSoft, d + (nMid*0.022 + nHi*0.014) * pErode * turb);
  float substance = pow(n01(nGrain * pGrainAmp + nLow * 0.55), pContrast);
  float body = interior * (pFloor + (1.0 - pFloor) * substance);
  float coreInk = smoothstep(-0.004, -0.030, d) * smoothstep(0.34, 0.86, substance);
  // 얇은 세부 — LOD 0 을 직접 섞어야 가시가 살아남는다 (9.5.1c)
  float sharp = smoothstep(0.30, 0.72, m0) * pSharp;

  float fray = pow(smoothstep(0.26, 0.92, n01(nHi)), 1.4) * exp(-od * pFrayFall);
  float wisp = pow(smoothstep(0.38, 0.96, n01(nFil)), 1.45) * exp(-od * pWispFall / turb);
  vec2 dir = normalize(p + vec2(1e-5));
  float gate = n01(fbm(dir*2.3 + vec2(17.0, 5.0), 3));
  float plume = pow(smoothstep(0.44, 1.00, n01(nFil)), 1.2)
              * pow(clamp(m5 * 2.4, 0.0, 1.0), pPlumeFall * 0.22)
              * smoothstep(pGate, pGate + 0.42, gate) * turb;

  float dens = 1.0
    - (1.0 - body)
    * (1.0 - sharp)
    * (1.0 - coreInk * pCore)
    * (1.0 - fray  * pFray)
    * (1.0 - wisp  * pWisp * turb)
    * (1.0 - clamp(plume, 0.0, 1.0) * pPlume)
    * (1.0 - clamp(m3 * 0.55, 0.0, 1.0) * 0.34);
  dens *= 1.0 - smoothstep(0.34, 1.05, p.y) * pTopFade;
  dens *= (1.0 - pDissolve) + pDissolve * n01(fbm(p*1.45 + vec2(41.0, 13.0) + uT*0.018, 3));
  dens *= reveal;

  // 배경 — 1단계는 룩랩의 안개를 그대로 쓴다. 어두운 방·유리벽은 2단계.
  vec3 bg = mix(vec3(pBgTop, pBgTop+0.049, pBgTop+0.055),
                vec3(pBgMid, pBgMid+0.043, pBgMid+0.040), smoothstep(0.04, 0.66, suv.y));
  bg = mix(bg, vec3(pBgBot, pBgBot+0.042, pBgBot+0.044), smoothstep(0.72, 0.99, suv.y));
  bg += fbm(p*1.15 + vec2(7.0, 2.0) + uT*0.02, 4) * pFog;

  vec3 inkC = vec3(pInk, pInk+0.017, pInk+0.021);
  vec3 coreC = vec3(pInkCore, pInkCore+0.010, pInkCore+0.014);
  vec3 ink = mix(inkC, coreC, clamp(coreInk, 0.0, 1.0));

  // 해독 강조 — 이 픽셀의 묶음 번호가 uHighlight 면 먹을 따뜻하게 밝힌다
  ivec2 ts = textureSize(uMask, 0);
  ivec2 ti = clamp(ivec2(uvW * vec2(ts)), ivec2(0), ts - 1);
  float part = floor(texelFetch(uMask, ti, 0).b * 255.0 + 0.5);
  float hl = (uHighlight >= 0.0 && abs(part - uHighlight) < 0.5) ? 1.0 : 0.0;
  ink = mix(ink, vec3(0.75, 0.34, 0.25), hl * 0.85);

  vec3 col = mix(bg, ink, clamp(dens, 0.0, 1.0));
  col *= 1.0 - pVig * smoothstep(0.55, 1.35, length(p * vec2(0.62, 1.0)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453) - 0.5) * pGrain;
  outColor = vec4(col, 1.0);
}`;
```

- [ ] **Step 4: 렌더러를 쓴다**

`web/smoke/renderer.ts`:

```ts
import type { LookParams } from '../../src/render/look';
import { P_SPAN } from '../../src/render/compose';
import { MASK_VS, MASK_FS, SMOKE_VS, SMOKE_FS, SMOKE_LOOK_KEYS } from './shaders';
import { FLOATS_PER_VERTEX } from './geometry';

/** 마스크 텍스처 한 변. 폰에서도 밉맵까지 가볍게 만들 수 있는 크기. */
const MASK_SIZE = 1024;
/** 기기 픽셀 비율 상한 — 셰이더가 픽셀마다 무겁다. */
const MAX_DPR = 1.75;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error('셰이더를 만들 수 없다');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? '셰이더 컴파일 실패');
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('프로그램을 만들 수 없다');
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? '링크 실패');
  return p;
}

/**
 * 룩랩의 먹 셰이더를 화면에 그린다 (화면 경험 설계 4.2).
 *
 * `create` 가 null 을 돌려주면 WebGL2 를 쓸 수 없다는 뜻이다 — 호출자가
 * SVG 를 그대로 보여 준다 (설계 5절). 그 밖의 대비책은 두지 않는다.
 */
export class SmokeRenderer {
  private vertexCount = 0;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly look: LookParams,
    private readonly maskProg: WebGLProgram,
    private readonly smokeProg: WebGLProgram,
    private readonly maskTex: WebGLTexture,
    private readonly fbo: WebGLFramebuffer,
    private readonly geoBuf: WebGLBuffer,
    private readonly quadBuf: WebGLBuffer,
  ) {}

  static create(canvas: HTMLCanvasElement, look: LookParams): SmokeRenderer | null {
    const gl = canvas.getContext('webgl2', { antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    try {
      const maskProg = link(gl, MASK_VS, MASK_FS);
      const smokeProg = link(gl, SMOKE_VS, SMOKE_FS);

      const maskTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MASK_SIZE, MASK_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, maskTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      const geoBuf = gl.createBuffer()!;
      const quadBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      const r = new SmokeRenderer(canvas, gl, look, maskProg, smokeProg, maskTex, fbo, geoBuf, quadBuf);
      r.resize();
      return r;
    } catch {
      return null;
    }
  }

  /** 새 골격을 마스크에 그리고 밉맵을 만든다. 문장이 바뀔 때 한 번. */
  setVertices(data: Float32Array): void {
    const gl = this.gl;
    this.vertexCount = data.length / FLOATS_PER_VERTEX;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, MASK_SIZE, MASK_SIZE);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.maskProg);
    gl.uniform1f(gl.getUniformLocation(this.maskProg, 'uHalf'), P_SPAN);
    const loc = gl.getAttribLocation(this.maskProg, 'aV');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 한 프레임. `timeSec` 은 일렁임 시계, `prog` 는 번짐 진행(0..1). */
  draw(timeSec: number, prog: number, highlight: number): void {
    const gl = this.gl, p = this.smokeProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    const loc = gl.getAttribLocation(p, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(gl.getUniformLocation(p, 'uMask'), 0);
    gl.uniform2f(gl.getUniformLocation(p, 'uRes'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(p, 'uT'), timeSec);
    gl.uniform1f(gl.getUniformLocation(p, 'uHalf'), P_SPAN);
    gl.uniform1f(gl.getUniformLocation(p, 'uProg'), prog);
    gl.uniform1f(gl.getUniformLocation(p, 'uHighlight'), highlight);
    for (const k of SMOKE_LOOK_KEYS) gl.uniform1f(gl.getUniformLocation(p, k), this.look[k]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** 캔버스의 CSS 크기에 맞춰 그리기 버퍼를 맞춘다. */
  resize(): void {
    const dpr = Math.min(MAX_DPR, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }
}
```

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npx vitest run tests/web/smoke-renderer.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add web/smoke/shaders.ts web/smoke/renderer.ts tests/web/smoke-renderer.test.ts
git commit -m "feat: 룩랩 먹 셰이더를 웹앱으로 — 도착 시각은 마스크에서 읽는다

룩랩의 고정 분사 각도 공식 대신 마스크 G 채널의 도착 시각으로 드러내고,
B 채널의 묶음 번호로 해독 강조를 할 수 있게 했다. WebGL2 가 없으면
create 가 null 을 돌려준다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 웹앱에 붙이기 — 번짐, 강조, SVG 대비책

**Files:**
- Create: `design/screen.json`, `web/screen.ts`
- Modify: `web/index.html:24-28`, `web/main.ts`, `web/style.css`
- Test: `tests/web/screen.test.ts`

**Interfaces:**
- Consumes: `buildStrokes`, `render` (`src/render/compose.ts`), `arrival`, `ArrivalTiming` (Task 1), `maskVertices` (Task 2), `SmokeRenderer` (Task 3), `partsOf`, `partKeyOf`, `describe` (`web/breakdown.ts`)
- Produces: `loadScreen(source?: Record<string, unknown>): { timing: ArrivalTiming }` — 2단계(방·유리벽 값)와 3단계(소리 값)가 이 파일과 로더에 키를 더한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/web/screen.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/web/screen.test.ts`
Expected: FAIL — `Cannot find module '../../web/screen'`

- [ ] **Step 3: 설정 파일과 로더를 쓴다**

`design/screen.json`:

```json
{
  "_": "화면 전용 수치 (화면 경험 설계 4.2). 1단계는 번짐 시간만. 방·유리벽(2단계)과 소리(3단계) 값이 여기 더해진다.",
  "ringSeconds": 3.0,
  "depthSecondsPerUnit": 6.0,
  "flowSpeed": 0.35,
  "jitterSeconds": 0.25,
  "tailSeconds": 0.8
}
```

`web/screen.ts`:

```ts
import raw from '../design/screen.json';
import type { ArrivalTiming } from '../src/render/arrival';

const TIMING_KEYS = ['ringSeconds', 'depthSecondsPerUnit', 'flowSpeed', 'jitterSeconds', 'tailSeconds'] as const;

/**
 * 화면 전용 수치를 읽는다. `loadLook` 과 같은 계약 — 빠진 키도, 선언되지
 * 않은 숫자 키도 던진다. 문서용 키는 값의 타입(문자열)으로 가려낸다.
 */
export function loadScreen(source: Record<string, unknown> = raw as Record<string, unknown>): { timing: ArrivalTiming } {
  const missing = TIMING_KEYS.filter((k) => typeof source[k] !== 'number' || !Number.isFinite(source[k]));
  if (missing.length > 0) throw new Error(`screen.json 에 없거나 숫자가 아닌 값: ${missing.join(', ')}`);
  const extra = Object.keys(source).filter(
    (k) => typeof source[k] === 'number' && !(TIMING_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) throw new Error(`screen.json 에 선언되지 않은 값: ${extra.join(', ')}`);
  const timing = {} as ArrivalTiming;
  for (const k of TIMING_KEYS) timing[k] = source[k] as number;
  return { timing };
}
```

Run: `npx vitest run tests/web/screen.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 4: 캔버스 자리를 만든다**

`web/index.html` 의 `<div id="glyph" role="img" aria-label="로고그램"></div>` 를 다음으로 바꾼다:

```html
      <div id="glyph" role="img" aria-label="로고그램">
        <canvas id="smoke" hidden></canvas>
        <div id="svgGlyph"></div>
      </div>
```

`web/style.css` 끝에 더한다:

```css
#smoke { display: block; width: 100%; aspect-ratio: 1; }
#smoke[hidden] { display: none; }
```

- [ ] **Step 5: `web/main.ts` 를 바꾼다**

임포트에 더한다:

```ts
import { buildStrokes } from '../src/render/compose';
import { arrival } from '../src/render/arrival';
import { maskVertices } from './smoke/geometry';
import { SmokeRenderer } from './smoke/renderer';
import { loadScreen } from './screen';
```

`const look = loadLook();` 아래에 더한다:

```ts
const screen = loadScreen();

// WebGL2 가 있으면 먹 셰이더, 없으면 SVG 를 그대로 (화면 경험 설계 5절)
const smokeCanvas = document.getElementById('smoke') as HTMLCanvasElement;
const smoke = SmokeRenderer.create(smokeCanvas, look);
smokeCanvas.hidden = smoke === null;

/** 지금 번지는 그림 — 시작 시각(ms), 길이(초), 강조 묶음 */
const bloom = { t0: 0, duration: 1, highlight: -1 };
```

`renderInto` 안에서 `glyphEl` 을 쓰는 부분을 SVG 전용 자리로 바꾼다. 함수 첫머리의 `const glyphEl = document.getElementById('glyph') as HTMLElement;` 를 다음으로 바꾼다:

```ts
  const glyphEl = document.getElementById('glyph') as HTMLElement;
  const svgEl = document.getElementById('svgGlyph') as HTMLElement;
```

그리고 함수 안의 `glyphEl.innerHTML = '';` (빈 입력·오류 두 곳)과 `glyphEl.innerHTML = result.svg;` 를 모두 `svgEl` 로 바꾼다. 성공 경로(`const result = render(...)` 바로 아래)는 다음이 된다:

```ts
    const result = render(ir, lex, look, { size: 640 });
    lastSvg = result.svg;
    glyphEl.setAttribute('aria-label', `${trimmed} 의 로고그램`);

    // 먹 셰이더가 있으면 번짐을 시작하고 SVG 자리는 비운다
    const sk = buildStrokes(ir, lex, look);
    const arr = arrival(sk, look, screen.timing);
    if (smoke) {
      svgEl.innerHTML = '';
      smoke.setVertices(maskVertices(sk, arr));
      bloom.t0 = performance.now();
      bloom.duration = arr.duration;
      bloom.highlight = -1;
    } else {
      svgEl.innerHTML = result.svg;
    }
```

분해 보기의 `mark` 함수에서 강조가 두 경로를 모두 다루게 바꾼다 (`const paths = [...glyphEl.querySelectorAll('path')];` 는 `svgEl.querySelectorAll('path')` 로):

```ts
      const partIndex = arr.parts.indexOf(part.key);
      const mark = (on: boolean) => {
        li.classList.toggle('on', on);
        if (smoke) { bloom.highlight = on ? partIndex : -1; return; }
        result.strokes.forEach((s, i) => {
          if (partKeyOf(s) !== part.key) return;
          paths[i]?.setAttribute('fill', on ? '#c0563f' : '#16120e');
        });
      };
```

파일 끝에 그리기 루프를 더한다:

```ts
// 번짐과 일렁임 — 문장이 없을 때도 돌지만 마스크가 비어 있어 안개만 보인다.
// 탭이 가려지면 브라우저가 requestAnimationFrame 을 알아서 멈춘다.
if (smoke) {
  new ResizeObserver(() => smoke.resize()).observe(smokeCanvas);
  const frame = (now: number) => {
    const el = (now - bloom.t0) / 1000;
    smoke.draw(3.7 + el, Math.min(1, el / bloom.duration), bloom.highlight);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
```

Run: `npm test && npm run typecheck && npm run build`
Expected: 모두 통과, `dist/` 생성

- [ ] **Step 6: 브라우저에서 확인한다**

`.claude/launch.json` 의 `web` 설정으로 개발 서버를 띄운다 (`preview_start` name `web`). 확인할 것:

1. 콘솔에 셰이더 컴파일 오류가 없다 (`read_console_messages`, onlyErrors)
2. "그럼에도 불구하고 나는 너를 사랑해" 를 그리면 캔버스가 보이고 SVG 자리는 비어 있다
3. `javascript_tool` 로 `performance.now()` 기준 0.5초·2초·끝(길이+0.5초) 시점에 캔버스를 `toDataURL` 로 떠서, 번짐 진행에 따라 먹 픽셀(어두운 픽셀) 수가 늘어나는지 본다. 첫 시점에는 시작점 근처에만 먹이 있어야 한다
4. "Regardless, I love you" 를 그리면 같은 시작점에서 같은 그림으로 번진다
5. 분해 보기 목록에 마우스를 올리면 그 낱말의 획이 붉게 빛난다
6. 가능하면 스크린샷을 남긴다

- [ ] **Step 7: 목걸이 파일이 그대로인지 본다**

Run: `npx tsx src/cli.ts --text "그럼에도 불구하고 나는 너를 사랑해" --necklace --cut --out <tmp>/cut-after.svg` 를 계획 시작 전에 만든 파일과 해시 비교
Expected: 같다

- [ ] **Step 8: 커밋하고 올린다**

```bash
git add design/screen.json web/screen.ts web/index.html web/main.ts web/style.css tests/web/screen.test.ts
git commit -m "feat: 웹앱이 먹 셰이더로 그린다 — 한 점에서 양쪽으로 번지는 로고그램

WebGL2 가 없으면 지금의 SVG 를 그대로 보여 준다. 분해 보기의 강조는
두 경로 모두 동작한다. 번짐 시간 수치는 design/screen.json.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

Vercel 이 자동 배포한다. 배포 후 https://regardless.vercel.app/ 가 새 번들을 내보내는지 확인한다 (로컬 `npm run build` 의 `dist/assets/index-*.js` 이름과 사이트 HTML 의 스크립트 이름이 같은지).

- [ ] **Step 9: 사용자 확인 (1단계 체크포인트)**

사용자에게 폰으로 사이트를 열어 문장을 그려 보게 한다. 확인받을 것: 룩랩에서 고른 먹의 질감이 살아 있는가 / 한 점에서 양쪽으로 번지는가 / 번짐 속도(`design/screen.json`)가 마음에 드는가. 속도·느낌 조정은 `design/screen.json` 수치만 바꿔서 한다.
