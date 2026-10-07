# 우주선 안 장면을 사이트로 (화면 경험 2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장면 실험실의 셰이더를 사이트 화면 전체로 옮기고, 받는 흐름(눌러서 시작 → 번짐 → 해독 → 나도 만들기)과 만드는 흐름(생성하기 → 링크 보내기, 자세히)을 만든다.

**Architecture:** 실험실 코드(`web/lab-shader.ts`, `web/lab.ts` 의 WebGL 부분)를 `web/scene/` 모듈(파라미터·셰이더·렌더러)로 옮겨 실험실과 사이트가 함께 쓴다. 해독 순서와 낱말(`web/decode.ts`), 화면 흐름의 시간 진행(`web/scenes/flow.ts`)은 순수 함수·클래스로 만들어 node 에서 테스트한다. `web/main.ts` 는 이것들을 DOM 에 잇기만 한다.

**Tech Stack:** TypeScript 5 (strict, `noUncheckedIndexedAccess`), Vite 5 (root `web/`), Vitest (environment `node`), WebGL2. 라이브러리 추가 없음.

**상위 문서:** `docs/superpowers/specs/2026-09-29-screen-experience-design.md` — 3절(흐름), 3.3(해독 순서·낱말), 4.4(장면), 5절(대비책), 6.1(실험실에서 정한 것).

## Global Constraints

- 커밋 메시지는 한국어, 마지막 줄은 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (자기 모델 이름으로 바꾸지 않는다)
- `git add -A` 금지 — 파일을 이름으로 더한다
- `src/core` 는 `src/render` 를 임포트하지 않는다. `src/`·`web/` 에 Node 전용 API(`fs`, `path`, `process` 등)를 쓰지 않는다
- 장면 수치는 `design/scene.json`, 시간 수치는 `design/screen.json` 에만. 셰이더 안의 노이즈 상수는 예외
- 결정성: 같은 문장 → 같은 해독 순서. 순수 함수에 `Math.random`·`Date` 를 쓰지 않는다
- 영화 이미지·로고·음원·글꼴을 쓰지 않는다. 팬 창작물 고지를 페이지에 둔다
- 사용자에게 보이는 글은 한국어. 버튼 이름: `생성하기`, `눌러서 시작`, `해독하기`, `나도 만들기`, `링크 보내기`, `자세히`
- 기존 테스트(현재 524개)는 약해지지 않는다 — 계약이 바뀐 테스트만 고치고, 고친 이유를 보고한다
- 목걸이 컷 파일(`npx tsx src/cli.ts --text "그럼에도 불구하고 나는 너를 사랑해" --necklace --cut --out <tmp>`)의 SHA256 은 `6D099527ADBCD2350587DA4997B515C7151B358F32C78B9CB6AF04CA1990F75F` 그대로
- 소리는 이 계획에 없다 (3단계)

## File Structure

| 파일 | 책임 |
|---|---|
| `web/scene/params.ts` (새) | 장면 파라미터 목록(이름·범위·기본값)과 `design/scene.json` 로더 |
| `web/scene/shaders.ts` (새, `web/lab-shader.ts` 에서 이동) | `NOISE_FS`, `NOISE_SIZE`, `SCENE_FS` |
| `web/scene/renderer.ts` (새) | WebGL2 자원 — 노이즈 굽기, 마스크, 한 프레임 그리기 |
| `web/lab.ts` (수정) | 실험실 UI 만 남기고 그리기는 `SceneRenderer` 로 |
| `web/lab-shader.ts` (삭제) | `web/scene/` 으로 옮김 |
| `src/core/phonology.ts` (수정) | `composeHangul` — 음절을 한글 글자로 되돌림 |
| `design/screen.json`, `web/screen.ts` (수정) | 해독 시간 수치 |
| `web/decode.ts` (새) | 해독 순서와 낱말 |
| `web/scenes/flow.ts` (새) | 대기·번짐·해독의 시간 진행 |
| `web/index.html`, `web/style.css`, `web/main.ts` (다시 씀) | 화면 전체 장면 위의 UI |
| `web/smoke/renderer.ts` (삭제), `web/smoke/shaders.ts` (수정) | 1단계 렌더러는 `SceneRenderer` 로 대체. 마스크 셰이더와 `SMOKE_VS` 만 남긴다 |

---

### Task 1: 장면 모듈 — 실험실 셰이더를 사이트가 쓸 수 있게

**Files:**
- Create: `web/scene/params.ts`, `web/scene/shaders.ts`, `web/scene/renderer.ts`
- Modify: `web/lab.ts`
- Delete: `web/lab-shader.ts`
- Test: `tests/web/scene.test.ts`

**Interfaces:**
- Consumes: `MASK_VS`, `MASK_FS`, `SMOKE_VS` (`web/smoke/shaders.ts`), `FLOATS_PER_VERTEX` (`web/smoke/geometry.ts`), `P_SPAN` (`src/render/compose.ts`)
- Produces:
  - `type SceneParam = readonly [key: string, label: string, min: number, max: number, step: number, fallback: number]`, `SCENE_PARAMS: readonly (readonly [string, readonly SceneParam[]])[]`, `SCENE_KEYS: readonly string[]`, `JS_ONLY_KEYS: ReadonlySet<string>` — `web/scene/params.ts`
  - `loadScene(source?: Record<string, unknown>): Record<string, number>` — 키 집합이 `SCENE_KEYS` 와 정확히 같아야 한다
  - `NOISE_SIZE`, `NOISE_FS`, `SCENE_FS` — `web/scene/shaders.ts`
  - `class SceneRenderer { static create(canvas: HTMLCanvasElement, params: Record<string, number>, ringR: number): SceneRenderer | null; setVertices(data: Float32Array): void; draw(timeSec: number, prog: number, highlight: number): void; resize(): void }` — `params` 는 참조로 들고 있다가 그릴 때마다 읽는다 (실험실의 슬라이더가 바로 반영되게)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/web/scene.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { loadScene, SCENE_KEYS, JS_ONLY_KEYS, SCENE_PARAMS } from '../../web/scene/params';
import { SCENE_FS, NOISE_FS } from '../../web/scene/shaders';
import { SceneRenderer } from '../../web/scene/renderer';

describe('loadScene', () => {
  it('design/scene.json 의 값을 모두 읽는다', () => {
    const s = loadScene();
    expect(Object.keys(s).sort()).toEqual([...SCENE_KEYS].sort());
    for (const k of SCENE_KEYS) expect(Number.isFinite(s[k]), k).toBe(true);
  });

  it('빠진 키, 선언되지 않은 숫자 키는 던지고 문서용 문자열은 무시한다', () => {
    const full: Record<string, unknown> = { _: '설명' };
    for (const k of SCENE_KEYS) full[k] = 0.5;
    expect(loadScene(full).sBright).toBe(0.5);
    const { sBright: _drop, ...missing } = full;
    expect(() => loadScene(missing)).toThrow(/sBright/);
    expect(() => loadScene({ ...full, bogus: 1 })).toThrow(/bogus/);
  });

  it('파라미터 목록의 키가 겹치지 않는다', () => {
    const keys = SCENE_PARAMS.flatMap(([, rows]) => rows.map((r) => r[0]));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...SCENE_KEYS].sort());
  });
});

describe('scene shaders', () => {
  it('셰이더용 키는 모두 uniform 으로 선언돼 있다', () => {
    for (const k of SCENE_KEYS) {
      if (JS_ONLY_KEYS.has(k)) continue;
      expect(new RegExp(`uniform float[^;]*\\b${k}\\b`).test(SCENE_FS), k).toBe(true);
    }
  });

  it('마스크의 묶음 번호는 1 을 빼서 읽고, 먼 연기는 넓은 밉맵에서 도착 시각을 읽는다', () => {
    expect(SCENE_FS).toMatch(/float part = .*- 1\.0;/);
    expect(SCENE_FS).toMatch(/bw\.g \/ bw\.r/);
    expect(NOISE_FS).toMatch(/uniform float uSize/);
  });
});

describe('SceneRenderer.create', () => {
  it('WebGL2 가 없으면 경고를 남기고 null — 호출자가 SVG 로 대신한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
      expect(SceneRenderer.create(canvas, loadScene(), 0.44)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/web/scene.test.ts`
Expected: FAIL — `Cannot find module '../../web/scene/params'`

- [ ] **Step 3: 파라미터와 셰이더를 옮긴다**

`web/scene/shaders.ts` 를 만들고 `web/lab-shader.ts` 의 `NOISE_SIZE`, `NOISE_FS`, `SCENE_FS` 를 **글자 그대로** 옮긴다 (파일 머리의 설명 주석도 함께). `web/lab-shader.ts` 의 `LabParam`, `LabGroup`, `LAB_PARAMS`, `JS_ONLY_KEYS` 는 아래 `params.ts` 로 이름만 바꿔 옮긴다 — **목록의 행(키·라벨·범위·기본값)은 한 글자도 바꾸지 않는다.** 그다음 `web/lab-shader.ts` 를 지운다 (`git rm web/lab-shader.ts`).

`web/scene/params.ts`:

```ts
import raw from '../../design/scene.json';

/**
 * 장면 파라미터 — [키, 라벨, 최소, 최대, 간격, 예비값]. 키는 곧 셰이더의 uniform 이름이다.
 * 실제 값은 `design/scene.json` (사용자가 장면 실험실에서 고른 기준값).
 * 예비값은 실험실 슬라이더의 처음 위치로만 쓰고, 사이트는 scene.json 을 읽는다.
 */
export type SceneParam = readonly [key: string, label: string, min: number, max: number, step: number, fallback: number];
export type SceneGroup = readonly [name: string, rows: readonly SceneParam[]];

export const SCENE_PARAMS: readonly SceneGroup[] = [
  // ← web/lab-shader.ts 의 LAB_PARAMS 배열 내용을 그대로 옮긴다
];

/** uniform 으로 넘기지 않는 키 (자바스크립트가 쓰는 값). */
export const JS_ONLY_KEYS: ReadonlySet<string> = new Set(['sResScale']);

export const SCENE_KEYS: readonly string[] = SCENE_PARAMS.flatMap(([, rows]) => rows.map((r) => r[0]));

/**
 * 장면 기준값을 읽는다. `loadLook` 과 같은 계약 — 빠진 키도, 선언되지 않은
 * 숫자 키도 던진다. 문서용 키는 값의 타입(문자열)으로 가려낸다.
 */
export function loadScene(source: Record<string, unknown> = raw as Record<string, unknown>): Record<string, number> {
  const missing = SCENE_KEYS.filter((k) => typeof source[k] !== 'number' || !Number.isFinite(source[k]));
  if (missing.length > 0) throw new Error(`scene.json 에 없거나 숫자가 아닌 값: ${missing.join(', ')}`);
  const extra = Object.keys(source).filter((k) => typeof source[k] === 'number' && !SCENE_KEYS.includes(k));
  if (extra.length > 0) throw new Error(`scene.json 에 선언되지 않은 값: ${extra.join(', ')}`);
  const out: Record<string, number> = {};
  for (const k of SCENE_KEYS) out[k] = source[k] as number;
  return out;
}
```

- [ ] **Step 4: 렌더러를 쓴다**

`web/scene/renderer.ts` — `web/lab.ts` 37~176행의 WebGL 코드를 클래스로 옮긴 것이다. 다른 점: uniform 위치를 만들 때 한 번만 찾는다, 실패하면 경고를 남기고 null, `params` 를 참조로 읽는다.

```ts
import { P_SPAN } from '../../src/render/compose';
import { MASK_VS, MASK_FS, SMOKE_VS } from '../smoke/shaders';
import { FLOATS_PER_VERTEX } from '../smoke/geometry';
import { SCENE_FS, NOISE_FS, NOISE_SIZE } from './shaders';
import { SCENE_KEYS, JS_ONLY_KEYS } from './params';

/** 마스크 텍스처 한 변 */
const MASK_SIZE = 1024;
/** 기기 픽셀 비율 상한 — 셰이더가 픽셀마다 무겁다 */
const MAX_DPR = 1.5;

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

function texture(gl: WebGL2RenderingContext, size: number, mip: boolean, repeat: boolean): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('텍스처를 만들 수 없다');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}

/**
 * 우주선 안 장면을 화면 전체에 그린다 (화면 경험 설계 6.1).
 *
 * 노이즈는 만들 때 한 번 텍스처로 굽고, 문장이 바뀔 때마다 획을 마스크에
 * 그린다. `create` 가 null 이면 WebGL2 를 쓸 수 없다 — 호출자가 SVG 로 대신한다.
 */
export class SceneRenderer {
  private vertexCount = 0;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly params: Record<string, number>,
    private readonly ringR: number,
    private readonly maskProg: WebGLProgram,
    private readonly sceneProg: WebGLProgram,
    private readonly maskTex: WebGLTexture,
    private readonly noiseTex: WebGLTexture,
    private readonly fbo: WebGLFramebuffer,
    private readonly geoBuf: WebGLBuffer,
    private readonly quadBuf: WebGLBuffer,
    private readonly loc: {
      maskHalf: WebGLUniformLocation | null; maskV: number; sceneA: number;
      uMask: WebGLUniformLocation | null; uNoise: WebGLUniformLocation | null; uRes: WebGLUniformLocation | null;
      uT: WebGLUniformLocation | null; uHalf: WebGLUniformLocation | null; uProg: WebGLUniformLocation | null;
      uHighlight: WebGLUniformLocation | null; uRingR: WebGLUniformLocation | null;
      params: (readonly [string, WebGLUniformLocation | null])[];
    },
  ) {}

  static create(canvas: HTMLCanvasElement, params: Record<string, number>, ringR: number): SceneRenderer | null {
    const gl = canvas.getContext('webgl2', { antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) {
      console.warn('SceneRenderer: WebGL2 를 쓸 수 없어 SVG 로 대신한다');
      return null;
    }
    try {
      const maskProg = link(gl, MASK_VS, MASK_FS);
      const sceneProg = link(gl, SMOKE_VS, SCENE_FS);
      const maskTex = texture(gl, MASK_SIZE, true, false);
      const fbo = gl.createFramebuffer();
      const geoBuf = gl.createBuffer();
      const quadBuf = gl.createBuffer();
      if (!fbo || !geoBuf || !quadBuf) throw new Error('버퍼를 만들 수 없다');
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, maskTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      // 노이즈 텍스처 — 한 번 굽고 읽기만 한다
      const noiseTex = texture(gl, NOISE_SIZE, false, true);
      const nfbo = gl.createFramebuffer();
      if (!nfbo) throw new Error('버퍼를 만들 수 없다');
      gl.bindFramebuffer(gl.FRAMEBUFFER, nfbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, noiseTex, 0);
      gl.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
      const noiseProg = link(gl, SMOKE_VS, NOISE_FS);
      gl.useProgram(noiseProg);
      gl.uniform1f(gl.getUniformLocation(noiseProg, 'uSize'), NOISE_SIZE);
      const na = gl.getAttribLocation(noiseProg, 'a');
      gl.enableVertexAttribArray(na);
      gl.vertexAttribPointer(na, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(nfbo);
      gl.deleteProgram(noiseProg);

      const U = (n: string) => gl.getUniformLocation(sceneProg, n);
      const loc = {
        maskHalf: gl.getUniformLocation(maskProg, 'uHalf'),
        maskV: gl.getAttribLocation(maskProg, 'aV'),
        sceneA: gl.getAttribLocation(sceneProg, 'a'),
        uMask: U('uMask'), uNoise: U('uNoise'), uRes: U('uRes'), uT: U('uT'), uHalf: U('uHalf'),
        uProg: U('uProg'), uHighlight: U('uHighlight'), uRingR: U('uRingR'),
        params: SCENE_KEYS.filter((k) => !JS_ONLY_KEYS.has(k)).map((k) => [k, U(k)] as const),
      };
      const r = new SceneRenderer(canvas, gl, params, ringR, maskProg, sceneProg, maskTex, noiseTex, fbo, geoBuf, quadBuf, loc);
      r.resize();
      return r;
    } catch (e) {
      console.warn('SceneRenderer: 셰이더를 준비하지 못해 SVG 로 대신한다', e);
      return null;
    }
  }

  /** 새 골격을 마스크에 그리고 밉맵을 만든다. 문장이 바뀔 때 한 번. 빈 배열이면 먹이 없는 장면. */
  setVertices(data: Float32Array): void {
    const gl = this.gl;
    this.vertexCount = data.length / FLOATS_PER_VERTEX;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, MASK_SIZE, MASK_SIZE);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.vertexCount > 0) {
      gl.useProgram(this.maskProg);
      gl.uniform1f(this.loc.maskHalf, P_SPAN);
      gl.enableVertexAttribArray(this.loc.maskV);
      gl.vertexAttribPointer(this.loc.maskV, FLOATS_PER_VERTEX, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 한 프레임. `timeSec` 은 장면 시계, `prog` 는 번짐 진행(0..1), `highlight` 는 묶음 번호 또는 -1. */
  draw(timeSec: number, prog: number, highlight: number): void {
    const gl = this.gl, l = this.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.sceneProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(l.sceneA);
    gl.vertexAttribPointer(l.sceneA, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(l.uMask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(l.uNoise, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(l.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(l.uT, timeSec);
    gl.uniform1f(l.uHalf, P_SPAN);
    gl.uniform1f(l.uProg, prog);
    gl.uniform1f(l.uHighlight, highlight);
    gl.uniform1f(l.uRingR, this.ringR);
    for (const [k, u] of l.params) gl.uniform1f(u, this.params[k] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** 캔버스의 CSS 크기와 `sResScale` 에 맞춰 그리기 버퍼를 맞춘다. */
  resize(): void {
    const scale = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR) * (this.params.sResScale ?? 0.6);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }
}
```

- [ ] **Step 5: 실험실이 렌더러를 쓰게 한다**

`web/lab.ts` 에서:
- 임포트를 바꾼다: `lab-shader` 와 `sceneJson` 임포트, `MASK_VS`/`MASK_FS`/`SMOKE_VS`, `FLOATS_PER_VERTEX`, `P_SPAN` 임포트를 지우고 다음을 넣는다:
  ```ts
  import { SCENE_PARAMS, loadScene } from './scene/params';
  import { SceneRenderer } from './scene/renderer';
  import { maskVertices } from './smoke/geometry';
  ```
- 파라미터 기본값(`DEF`)은 `loadScene()` 의 결과로 한다: `const DEF: Record<string, number> = loadScene();`
- 37~132행(WebGL 준비, 노이즈 굽기, uniform 위치, `draw(text)` 안의 GL 호출)을 지우고 다음으로 바꾼다:
  ```ts
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = SceneRenderer.create(canvas, val, look.pR);
  if (!renderer) throw new Error('WebGL2 를 쓸 수 없다');
  const bloom = { t0: performance.now(), duration: 1 };

  function draw(text: string): void {
    const ir = parse(text, lex);
    const sk = buildStrokes(ir, lex, look);
    const arr = arrival(sk, look, screen.timing);
    renderer!.setVertices(maskVertices(sk, arr));
    bloom.t0 = performance.now();
    bloom.duration = arr.duration;
  }
  ```
- `resize()` 는 `renderer!.resize()` 를 부르게 하고(`new ResizeObserver(() => renderer!.resize()).observe(canvas)`, 해상도 슬라이더 입력 때도 `renderer!.resize()`), `frame(now)` 안의 GL 호출은 다음 한 줄로 바꾼다:
  ```ts
  renderer!.draw(3.7 + ((now - t0) / 1000) % 600, Math.min(1, Math.max(0, now - bloom.t0) / 1000 / bloom.duration), -1);
  ```
- 패널을 만드는 부분의 `LAB_PARAMS` 를 `SCENE_PARAMS` 로 바꾼다.

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `npx vitest run tests/web/scene.test.ts && npm test && npm run typecheck && npm run build`
Expected: 모두 통과, `dist/assets/index-*.js` 이름이 바뀌지 않음 (사이트 번들은 아직 그대로다)

- [ ] **Step 7: 커밋**

```bash
git add web/scene/params.ts web/scene/shaders.ts web/scene/renderer.ts web/lab.ts tests/web/scene.test.ts
git rm web/lab-shader.ts
git commit -m "refactor: 장면 셰이더와 렌더러를 web/scene 으로 — 실험실과 사이트가 함께 쓴다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 해독 — 어떤 순서로 어떤 낱말을 띄우는가

**Files:**
- Modify: `src/core/phonology.ts`, `design/screen.json`, `web/screen.ts`, `tests/web/screen.test.ts`
- Create: `web/decode.ts`
- Test: `tests/core/phonology.test.ts` (있으면 추가, 없으면 새로), `tests/web/decode.test.ts`

**Interfaces:**
- Consumes: `IR`, `Constituent`, `Mood` (`src/core/ir.ts`), `lookup`, `Lexicon` (`src/core/lexicon.ts`), `detectLanguage(text): 'ko' | 'en'` (`src/core/parse.ts`), `Arrival` (`src/render/arrival.ts` — `parts[0]` 은 링, 나머지는 먹이 처음 닿은 순서)
- Produces:
  - `composeHangul(s: Syllable): string` — `src/core/phonology.ts`
  - `loadScreen(source?): { timing: ArrivalTiming; decode: DecodeTiming }`, `interface DecodeTiming { hintSeconds: number; stepSeconds: number; sentenceSeconds: number }` — `web/screen.ts`
  - `interface DecodeStep { part: number; label: string }`, `decodeSteps(ir: IR, arr: Arrival, lex: Lexicon, text: string): DecodeStep[]` — `web/decode.ts`

**규칙 (설계 3.3):** 해독 순서는 먹이 닿은 차례(`arr.parts` 순서, 링 제외). 낱말은 원래 문장의 언어로 — 한국어면 표제어, 영어면 `gloss_en`. 소리로 적은 말(음소 폴백)은 한글로 되돌린다. 문장 종류 표지는 이름으로: 한국어 `물음`·`아님`·`다짐`, 영어 `question`·`not`·`will`.

**묶음 키:** 획의 묶음 키는 `역할|라벨` 이다. 개념은 라벨이 표제어, 소리로 적은 말은 라벨이 음절 로마자를 이어 붙인 것(`onset+nucleus+coda` 를 음절마다), 문장 종류 표지는 `양상|<mood>` 이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/core/phonology.test.ts` 에 (없으면 파일을 만들고 `import { describe, it, expect } from 'vitest';` 와 함께):

```ts
import { syllabify, composeHangul } from '../../src/core/phonology';

describe('composeHangul', () => {
  it('음절을 한글 글자로 되돌린다 — syllabify 의 역', () => {
    const text = '루이즈를사랑해닭값';
    expect(syllabify(text).map(composeHangul).join('')).toBe(text);
  });
  it('모르는 자모면 빈 문자열', () => {
    expect(composeHangul({ onset: 'x', nucleus: 'a', coda: '' })).toBe('');
  });
});
```

`tests/web/decode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon, lookup } from '../../src/core/lexicon';
import { loadLook } from '../../src/render/look';
import { buildStrokes } from '../../src/render/compose';
import { arrival } from '../../src/render/arrival';
import { loadScreen } from '../../web/screen';
import { decodeSteps } from '../../web/decode';

const lex = loadSeedLexicon();
const look = loadLook();
const { timing } = loadScreen();
const stepsOf = (s: string) => {
  const ir = parse(s, lex);
  const arr = arrival(buildStrokes(ir, lex, look), look, timing);
  return { steps: decodeSteps(ir, arr, lex, s), arr };
};

describe('decodeSteps', () => {
  it('먹이 닿은 차례대로, 링은 빼고', () => {
    const { steps, arr } = stepsOf('그럼에도 불구하고 나는 너를 사랑해');
    expect(steps.map((s) => s.part)).toEqual(arr.parts.map((_, i) => i).slice(1));
  });

  it('한국어 문장은 표제어로', () => {
    const { steps } = stepsOf('그럼에도 불구하고 나는 너를 사랑해');
    expect([...steps.map((s) => s.label)].sort()).toEqual(['나', '너', '사랑'].sort());
  });

  it('영어 문장은 영어 뜻으로', () => {
    const { steps } = stepsOf('Regardless, I love you');
    const want = ['나', '너', '사랑'].map((l) => lookup(lex, l)!.gloss_en);
    expect([...steps.map((s) => s.label)].sort()).toEqual([...want].sort());
  });

  it('같은 뜻이면 같은 차례 — 언어가 달라도', () => {
    const ko = stepsOf('그럼에도 불구하고 나는 너를 사랑해').steps.map((s) => s.part);
    const en = stepsOf('Regardless, I love you').steps.map((s) => s.part);
    expect(en).toEqual(ko);
  });

  it('소리로 적은 말은 한글로, 문장 종류 표지는 이름으로', () => {
    expect(stepsOf('루이즈를 기다려').steps.map((s) => s.label)).toContain('루이즈');
    expect(stepsOf('나를 사랑하니?').steps.map((s) => s.label)).toContain('물음');
    expect(stepsOf('do you love me?').steps.map((s) => s.label)).toContain('question');
  });
});
```

`tests/web/screen.test.ts` 를 고친다 — 해독 시간이 필요한 키가 되므로 `ok` 객체들에 세 키를 더한다 (계약이 바뀐 것이지 약해지는 것이 아니다). 두 군데의 `const ok = { ... }` 를 각각 다음으로:

```ts
    const ok = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8,
      decodeHintSeconds: 1.5, decodeStepSeconds: 1.6, decodeSentenceSeconds: 1.0 };
```

그리고 같은 파일 끝에 테스트를 더한다:

```ts
  it('해독 시간을 읽고, 음수면 키 이름을 알려 준다', () => {
    const { decode } = loadScreen();
    expect(decode.stepSeconds).toBeGreaterThan(0);
    expect(decode.hintSeconds).toBeGreaterThanOrEqual(0);
    expect(decode.sentenceSeconds).toBeGreaterThanOrEqual(0);
    const ok = { ringSeconds: 3, depthSecondsPerUnit: 6, flowSpeed: 0.4, jitterSeconds: 0.2, tailSeconds: 0.8,
      decodeHintSeconds: 1.5, decodeStepSeconds: 1.6, decodeSentenceSeconds: 1.0 };
    expect(() => loadScreen({ ...ok, decodeStepSeconds: 0 })).toThrow(/decodeStepSeconds/);
    expect(() => loadScreen({ ...ok, decodeHintSeconds: -1 })).toThrow(/decodeHintSeconds/);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/core/phonology.test.ts tests/web/decode.test.ts tests/web/screen.test.ts`
Expected: FAIL — `composeHangul` / `web/decode` 가 없다, `decode` 가 undefined

- [ ] **Step 3: 구현한다**

`src/core/phonology.ts` 의 `syllabify` 아래에:

```ts
/** 음절 하나를 한글 글자로 되돌린다 (`decomposeHangul` 의 역). 모르는 자모면 빈 문자열. */
export function composeHangul(s: Syllable): string {
  const o = (ONSETS as readonly string[]).indexOf(s.onset);
  const n = (NUCLEI as readonly string[]).indexOf(s.nucleus);
  const c = (CODAS as readonly string[]).indexOf(s.coda);
  if (o < 0 || n < 0 || c < 0) return '';
  return String.fromCodePoint(HANGUL_BASE + o * 588 + n * 28 + c);
}
```

`design/screen.json` 에 세 키를 더한다 (그리고 `_` 설명을 "1단계 번짐 시간, 2단계 해독 시간. 소리(3단계) 값이 여기 더해진다." 로 고친다):

```json
  "decodeHintSeconds": 1.5,
  "decodeStepSeconds": 1.6,
  "decodeSentenceSeconds": 1.0
```

`web/screen.ts` 를 다음으로 바꾼다:

```ts
import raw from '../design/screen.json';
import type { ArrivalTiming } from '../src/render/arrival';

const TIMING_KEYS = ['ringSeconds', 'depthSecondsPerUnit', 'flowSpeed', 'jitterSeconds', 'tailSeconds'] as const;
const DECODE_KEYS = ['decodeHintSeconds', 'decodeStepSeconds', 'decodeSentenceSeconds'] as const;
const ALL_KEYS: readonly string[] = [...TIMING_KEYS, ...DECODE_KEYS];
/** 나누는 수라 0 도 안 되는 값 */
const POSITIVE: readonly string[] = ['flowSpeed', 'decodeStepSeconds'];

/** 해독 시간 (화면 경험 설계 3.1). */
export interface DecodeTiming {
  /** 번짐이 끝나고 '해독하기' 가 뜨기까지 */
  hintSeconds: number;
  /** 낱말 하나가 빛나는 시간 */
  stepSeconds: number;
  /** 마지막 낱말 뒤 문장 전체가 뜨기까지 */
  sentenceSeconds: number;
}

/**
 * 화면 전용 수치를 읽는다. `loadLook` 과 같은 계약 — 빠진 키도, 선언되지
 * 않은 숫자 키도 던진다. 문서용 키는 값의 타입(문자열)으로 가려낸다.
 */
export function loadScreen(
  source: Record<string, unknown> = raw as Record<string, unknown>,
): { timing: ArrivalTiming; decode: DecodeTiming } {
  const missing = ALL_KEYS.filter((k) => typeof source[k] !== 'number' || !Number.isFinite(source[k]));
  if (missing.length > 0) throw new Error(`screen.json 에 없거나 숫자가 아닌 값: ${missing.join(', ')}`);
  const extra = Object.keys(source).filter((k) => typeof source[k] === 'number' && !ALL_KEYS.includes(k));
  if (extra.length > 0) throw new Error(`screen.json 에 선언되지 않은 값: ${extra.join(', ')}`);
  for (const k of ALL_KEYS) {
    const v = source[k] as number;
    const positive = POSITIVE.includes(k);
    if (positive ? !(v > 0) : !(v >= 0)) {
      throw new Error(`screen.json 의 ${k} 는 ${positive ? '0 보다 커야' : '0 이상이어야'} 합니다: ${v}`);
    }
  }
  const timing = {} as ArrivalTiming;
  for (const k of TIMING_KEYS) timing[k] = source[k] as number;
  const decode: DecodeTiming = {
    hintSeconds: source.decodeHintSeconds as number,
    stepSeconds: source.decodeStepSeconds as number,
    sentenceSeconds: source.decodeSentenceSeconds as number,
  };
  return { timing, decode };
}
```

`web/decode.ts`:

```ts
import type { IR, Constituent, Mood } from '../src/core/ir';
import { lookup, type Lexicon } from '../src/core/lexicon';
import { composeHangul } from '../src/core/phonology';
import { detectLanguage } from '../src/core/parse';
import type { Arrival } from '../src/render/arrival';

/** 해독의 한 걸음 — 이 묶음의 획이 빛나고 이 낱말이 떠오른다. */
export interface DecodeStep {
  /** `Arrival.parts` 의 색인 */
  part: number;
  label: string;
}

/** 문장 종류 표지의 이름. 평서문은 표지가 없고, 양보문은 링이 닫히지 않는 것으로 드러난다. */
const MOOD_LABEL: Record<'ko' | 'en', Partial<Record<Mood, string>>> = {
  ko: { interrogative: '물음', negative: '아님', volitional: '다짐' },
  en: { interrogative: 'question', negative: 'not', volitional: 'will' },
};

/** 획의 묶음 키와 같은 규칙 — 역할|라벨 (`src/render/parts.ts`, `compose.ts` 의 라벨). */
function keyOf(c: Constituent): string {
  if (c.kind === 'concept') return `${c.role}|${c.lemma}`;
  return `${c.role}|${c.syllables.map((s) => `${s.onset}${s.nucleus}${s.coda}`).join('')}`;
}

/**
 * 해독 순서와 낱말 (화면 경험 설계 3.3).
 *
 * 순서는 먹이 처음 닿은 차례다 — 시계 방향 같은 고정 순서를 쓰면 없앤 '읽는
 * 방향' 이 되살아난다. 낱말은 원래 문장의 언어로 띄운다.
 */
export function decodeSteps(ir: IR, arr: Arrival, lex: Lexicon, text: string): DecodeStep[] {
  const lang = detectLanguage(text);
  const labels = new Map<string, string>();
  for (const c of ir.constituents) {
    const label = c.kind === 'phonetic'
      ? c.syllables.map(composeHangul).join('')
      : lang === 'ko' ? c.lemma : (lookup(lex, c.lemma)?.gloss_en ?? c.lemma);
    labels.set(keyOf(c), label);
  }
  const mood = MOOD_LABEL[lang][ir.mood];
  if (mood) labels.set(`양상|${ir.mood}`, mood);

  const steps: DecodeStep[] = [];
  arr.parts.forEach((key, i) => {
    if (i === 0) return;                       // 링은 해독 대상이 아니다
    const label = labels.get(key);
    if (label !== undefined) steps.push({ part: i, label });
  });
  return steps;
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npx vitest run tests/core/phonology.test.ts tests/web/decode.test.ts tests/web/screen.test.ts && npm test && npm run typecheck`
Expected: 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add src/core/phonology.ts design/screen.json web/screen.ts web/decode.ts tests/core/phonology.test.ts tests/web/decode.test.ts tests/web/screen.test.ts
git commit -m "feat: 해독 순서와 낱말 — 먹이 닿은 차례로, 원래 문장의 언어로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 흐름 — 대기·번짐·해독의 시간 진행

**Files:**
- Create: `web/scenes/flow.ts`
- Test: `tests/web/flow.test.ts`

**Interfaces:**
- Consumes: 없음 (순수)
- Produces:
  - `type Phase = 'idle' | 'waiting' | 'blooming' | 'settled' | 'decoding' | 'decoded'`
  - `interface FlowTiming { bloomSeconds: number; hintSeconds: number; stepSeconds: number; sentenceSeconds: number }`
  - `interface FrameState { phase: Phase; prog: number; highlight: number; labelsShown: number; showStart: boolean; showDecode: boolean; showSentence: boolean }`
  - `class Flow { constructor(parts: readonly number[], timing: FlowTiming, allowDecode: boolean); arm(): void; start(nowMs: number): void; decode(nowMs: number): void; frame(nowMs: number): FrameState }` — `parts[k]` 는 k 번째 해독 걸음에서 빛날 묶음 번호

**동작:**
- `idle`: 아무것도 없다 (만드는 화면에서 문장을 넣기 전). `arm()` → `waiting`: '눌러서 시작' 만.
- `start(now)` (idle 또는 waiting 에서만) → `blooming`: `prog` 가 0 에서 1 로. `bloomSeconds` 가 지나면 `settled`.
- `settled`: `allowDecode` 이고 번짐 끝에서 `hintSeconds` 가 지나면 `showDecode`.
- `decode(now)` (`showDecode` 일 때만) → `decoding`: `stepSeconds` 마다 다음 묶음이 빛나고 낱말이 하나씩 더 보인다. 마지막 걸음 뒤 `sentenceSeconds` 가 지나면 `decoded` — 강조 없음, 낱말 모두, 문장 전체.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/web/flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Flow, type FlowTiming } from '../../web/scenes/flow';

const T: FlowTiming = { bloomSeconds: 4, hintSeconds: 1, stepSeconds: 2, sentenceSeconds: 1 };
const s = (sec: number) => sec * 1000;

describe('Flow', () => {
  it('처음엔 아무것도 없고, arm 하면 눌러서 시작만', () => {
    const f = new Flow([1, 2], T, true);
    expect(f.frame(0)).toMatchObject({ phase: 'idle', prog: 0, showStart: false });
    f.arm();
    expect(f.frame(0)).toMatchObject({ phase: 'waiting', prog: 0, showStart: true, showDecode: false });
  });

  it('누르면 번지고, 번짐이 끝나면 잠시 뒤 해독하기가 뜬다', () => {
    const f = new Flow([1, 2], T, true);
    f.arm();
    f.start(s(10));
    expect(f.frame(s(12)).prog).toBeCloseTo(0.5);
    expect(f.frame(s(12)).phase).toBe('blooming');
    expect(f.frame(s(14.5))).toMatchObject({ phase: 'settled', prog: 1, showDecode: false });
    expect(f.frame(s(15.1))).toMatchObject({ phase: 'settled', showDecode: true });
  });

  it('해독하기 전에는 decode 가 먹지 않는다', () => {
    const f = new Flow([1, 2], T, true);
    f.start(0);
    f.decode(s(2));
    expect(f.frame(s(2)).phase).toBe('blooming');
    f.decode(s(4.5));
    expect(f.frame(s(4.5)).phase).toBe('settled');
  });

  it('해독: 걸음마다 묶음이 빛나고 낱말이 하나씩, 끝나면 문장 전체', () => {
    const f = new Flow([3, 1], T, true);
    f.start(0);
    f.frame(s(6));
    f.decode(s(6));
    expect(f.frame(s(6.5))).toMatchObject({ phase: 'decoding', highlight: 3, labelsShown: 1, showDecode: false });
    expect(f.frame(s(8.5))).toMatchObject({ phase: 'decoding', highlight: 1, labelsShown: 2 });
    expect(f.frame(s(10.5))).toMatchObject({ phase: 'decoding', highlight: -1, labelsShown: 2, showSentence: false });
    expect(f.frame(s(11.1))).toMatchObject({ phase: 'decoded', highlight: -1, labelsShown: 2, showSentence: true });
  });

  it('만드는 화면(allowDecode=false)은 해독하기가 뜨지 않는다', () => {
    const f = new Flow([1], T, false);
    f.start(0);
    expect(f.frame(s(30))).toMatchObject({ phase: 'settled', showDecode: false });
    f.decode(s(30));
    expect(f.frame(s(31)).phase).toBe('settled');
  });

  it('번지는 중이나 끝난 뒤에 start 를 다시 불러도 처음부터 다시 번지지 않는다', () => {
    const f = new Flow([1], T, true);
    f.start(0);
    f.start(s(2));
    expect(f.frame(s(2)).prog).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `npx vitest run tests/web/flow.test.ts`
Expected: FAIL — `Cannot find module '../../web/scenes/flow'`

- [ ] **Step 3: 구현한다**

`web/scenes/flow.ts`:

```ts
/**
 * 화면 흐름의 시간 진행 (화면 경험 설계 3.1·3.2). DOM 도 WebGL 도 모른다 —
 * 시각을 받아 지금 무엇을 보여야 하는지만 답한다. 그래서 node 에서 테스트한다.
 */
export type Phase = 'idle' | 'waiting' | 'blooming' | 'settled' | 'decoding' | 'decoded';

export interface FlowTiming {
  /** 번짐 길이 (`Arrival.duration`) */
  bloomSeconds: number;
  /** 번짐이 끝나고 '해독하기' 가 뜨기까지 */
  hintSeconds: number;
  /** 낱말 하나가 빛나는 시간 */
  stepSeconds: number;
  /** 마지막 낱말 뒤 문장 전체가 뜨기까지 */
  sentenceSeconds: number;
}

export interface FrameState {
  phase: Phase;
  /** 번짐 진행 0..1 */
  prog: number;
  /** 빛날 묶음 번호, 없으면 -1 */
  highlight: number;
  /** 보여 줄 낱말 수 (해독 순서 앞에서부터) */
  labelsShown: number;
  showStart: boolean;
  showDecode: boolean;
  showSentence: boolean;
}

export class Flow {
  private phase: Phase = 'idle';
  private bloomT0 = 0;
  private decodeT0 = 0;

  constructor(
    private readonly parts: readonly number[],
    private readonly timing: FlowTiming,
    private readonly allowDecode: boolean,
  ) {}

  /** 받는 화면 — '눌러서 시작' 을 기다린다. */
  arm(): void {
    if (this.phase === 'idle') this.phase = 'waiting';
  }

  /** 번짐을 시작한다. 이미 번지는 중이거나 끝났으면 무시한다. */
  start(nowMs: number): void {
    if (this.phase !== 'idle' && this.phase !== 'waiting') return;
    this.phase = 'blooming';
    this.bloomT0 = nowMs;
  }

  /** 해독을 시작한다. '해독하기' 가 보일 때만 먹는다. */
  decode(nowMs: number): void {
    this.advance(nowMs);
    if (this.phase !== 'settled' || !this.hintReady(nowMs)) return;
    this.phase = 'decoding';
    this.decodeT0 = nowMs;
  }

  frame(nowMs: number): FrameState {
    this.advance(nowMs);
    const steps = this.parts.length;
    let highlight = -1;
    let labelsShown = 0;
    if (this.phase === 'decoding') {
      const k = Math.floor(this.since(this.decodeT0, nowMs) / this.timing.stepSeconds);
      highlight = k < steps ? (this.parts[k] ?? -1) : -1;
      labelsShown = Math.min(k + 1, steps);
    }
    if (this.phase === 'decoded') labelsShown = steps;
    const prog = this.phase === 'idle' || this.phase === 'waiting' ? 0
      : this.phase === 'blooming' ? Math.min(1, this.since(this.bloomT0, nowMs) / this.timing.bloomSeconds)
      : 1;
    return {
      phase: this.phase,
      prog,
      highlight,
      labelsShown,
      showStart: this.phase === 'waiting',
      showDecode: this.phase === 'settled' && this.hintReady(nowMs),
      showSentence: this.phase === 'decoded',
    };
  }

  /** 시간이 지나 저절로 넘어가는 단계를 넘긴다. */
  private advance(nowMs: number): void {
    if (this.phase === 'blooming' && this.since(this.bloomT0, nowMs) >= this.timing.bloomSeconds) {
      this.phase = 'settled';
    }
    if (this.phase === 'decoding') {
      const end = this.parts.length * this.timing.stepSeconds + this.timing.sentenceSeconds;
      if (this.since(this.decodeT0, nowMs) >= end) this.phase = 'decoded';
    }
  }

  private hintReady(nowMs: number): boolean {
    return this.allowDecode
      && this.since(this.bloomT0, nowMs) >= this.timing.bloomSeconds + this.timing.hintSeconds;
  }

  private since(t0: number, nowMs: number): number {
    return Math.max(0, nowMs - t0) / 1000;
  }
}
```

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `npx vitest run tests/web/flow.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/scenes/flow.ts tests/web/flow.test.ts
git commit -m "feat: 화면 흐름 — 대기, 번짐, 해독하기, 낱말 하나씩, 문장 전체

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 화면 — 장면 위의 받는 화면과 만드는 화면

**Files:**
- Rewrite: `web/index.html`, `web/style.css`, `web/main.ts`
- Delete: `web/smoke/renderer.ts`, `tests/web/smoke-renderer.test.ts`
- Modify: `web/smoke/shaders.ts` (`SMOKE_FS`, `SMOKE_LOOK_KEYS` 를 지우고 `MASK_VS`, `MASK_FS`, `SMOKE_VS` 만 남긴다 — 장면 셰이더 테스트가 그 검사를 대신한다)

**Interfaces:**
- Consumes: `SceneRenderer`, `loadScene` (Task 1), `decodeSteps`, `DecodeStep`, `loadScreen().decode` (Task 2), `Flow`, `FrameState` (Task 3), `encodeShare`/`decodeShare` (`web/share.ts`), `downloadSvg`/`downloadPng`/`fileNameFor` (`web/download.ts`), `partsOf`/`partKeyOf`/`describe` (`web/breakdown.ts`), `maskVertices` (`web/smoke/geometry.ts`), `render`/`buildStrokes` (`src/render/compose.ts`), `arrival` (`src/render/arrival.ts`)
- Produces: 사이트 화면

- [ ] **Step 1: `web/index.html` 을 다시 쓴다**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>헵타포드 B — 문장을 로고그램으로</title>
  <meta name="description" content="한국어나 영어 문장을 영화 《컨택트》의 헵타포드 B 양식 로고그램으로 바꿉니다. 팬 창작물입니다.">
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <canvas id="scene" aria-hidden="true"></canvas>
  <div id="svgGlyph" role="img" aria-label="로고그램"></div>

  <h1 class="mark">헵타포드 B</h1>
  <p class="notice-line">팬 창작물 · Paramount 와 무관</p>

  <button type="button" id="start" class="veil-btn" hidden>눌러서 시작</button>

  <div id="decodeArea" aria-live="polite">
    <ol id="words"></ol>
    <p id="sentence" hidden></p>
    <button type="button" id="decodeBtn" class="veil-btn" hidden>해독하기</button>
    <button type="button" id="again" class="veil-btn" hidden>나도 만들기</button>
  </div>

  <p id="error" class="error" role="alert" hidden></p>

  <div id="dock">
    <form id="form" autocomplete="off">
      <label for="text" class="sr-only">문장</label>
      <input id="text" name="text" type="text" maxlength="120" placeholder="그럼에도 불구하고 나는 너를 사랑해">
      <button type="submit">생성하기</button>
    </form>
    <div class="row">
      <button type="button" id="share" hidden>링크 보내기</button>
      <details id="more">
        <summary>자세히</summary>
        <p id="caption"></p>
        <ul id="parts" class="parts" aria-label="획 분해"></ul>
        <p class="actions">
          <button type="button" id="saveSvg">SVG 받기</button>
          <button type="button" id="savePng">PNG 받기</button>
        </p>
        <footer>
          <p>팬 창작물이며 Paramount Pictures 및 영화 제작진과 무관합니다.
             원작 로고그램 디자인 <strong>Martine Bertrand</strong>.
             분석 자료 출처 <a href="https://github.com/WolframResearch/Arrival-Movie-Live-Coding" rel="noreferrer">Wolfram Research</a> (CC BY-NC 4.0).</p>
          <p>이 페이지가 그리는 모든 것은 규칙에서 실시간으로 만들어집니다. 원본 이미지를 담고 있지 않습니다.</p>
        </footer>
      </details>
    </div>
  </div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: `web/style.css` 를 다시 쓴다**

```css
:root {
  --ink: #101416;
  --glass: rgba(12, 16, 18, 0.55);
  --glass-line: rgba(255, 255, 255, 0.14);
  --on-glass: #e8eeee;
  --safe-b: env(safe-area-inset-bottom, 0px);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body {
  background: #9aa4a6;
  color: var(--ink);
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
}
#scene { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; display: block; }

/* WebGL2 가 없거나 잃었을 때 — 안개 비슷한 고정 배경 위에 SVG */
body.no-gl { background: radial-gradient(ellipse at 50% 35%, #e6ebeb 0%, #b9c2c3 55%, #7d8789 100%); }
body.no-gl #scene { display: none; }
#svgGlyph { position: fixed; left: 50%; top: 44%; transform: translate(-50%, -50%); width: min(78vmin, 640px); display: none; }
body.no-gl #svgGlyph { display: block; }
#svgGlyph svg { width: 100%; height: auto; display: block; }

.mark, .notice-line {
  position: fixed; margin: 0; color: #fff; mix-blend-mode: difference; opacity: 0.55;
  pointer-events: none;
}
.mark { top: 14px; left: 18px; font-size: 12px; font-weight: 500; letter-spacing: 0.3em; }
.notice-line { top: 14px; right: 18px; font-size: 10px; letter-spacing: 0.08em; }

.veil-btn {
  padding: 12px 26px; border-radius: 999px; border: 1px solid var(--glass-line);
  background: var(--glass); color: var(--on-glass); font-size: 15px; letter-spacing: 0.08em;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); cursor: pointer;
}
#start { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); }

#decodeArea {
  position: fixed; left: 0; right: 0; bottom: calc(140px + var(--safe-b));
  display: grid; justify-items: center; gap: 14px; text-align: center; pointer-events: none;
}
#decodeArea button { pointer-events: auto; }
#words { list-style: none; margin: 0; padding: 0 16px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 20px; }
#words li {
  opacity: 0; transform: translateY(6px); transition: opacity 0.8s ease, transform 0.8s ease;
  font-size: 18px; letter-spacing: 0.12em;
}
#words li.shown { opacity: 0.55; transform: none; }
#words li.now { opacity: 1; }
#sentence {
  margin: 0 16px; font-size: clamp(18px, 4.6vw, 28px); letter-spacing: 0.04em;
  animation: rise 1.6s ease both;
}
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

#dock {
  position: fixed; left: 50%; bottom: calc(16px + var(--safe-b)); transform: translateX(-50%);
  width: min(560px, calc(100vw - 32px)); display: grid; gap: 8px;
}
body.receive #dock { display: none; }
#form { display: flex; gap: 8px; }
#form input, #form button, .row > button, #more {
  border-radius: 10px; border: 1px solid var(--glass-line); background: var(--glass); color: var(--on-glass);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
#form input { flex: 1; min-width: 0; padding: 12px 14px; font-size: 16px; }
#form input::placeholder { color: rgba(232, 238, 238, 0.5); }
#form button, .row > button { padding: 10px 16px; font-size: 14px; cursor: pointer; }
.row { display: flex; gap: 8px; align-items: flex-start; }
#more { flex: 1; padding: 9px 12px; font-size: 13px; max-height: 50vh; overflow: auto; }
#more summary { cursor: pointer; }
#more button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--glass-line); background: transparent; color: inherit; cursor: pointer; }
#more a { color: inherit; }
#more footer p { font-size: 11px; opacity: 0.8; }
.parts { list-style: none; padding: 0; margin: 6px 0; }
.parts li { padding: 2px 6px; border-radius: 4px; }
.parts li.on { background: rgba(192, 86, 63, 0.4); }

.error {
  position: fixed; top: 44px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 32px);
  margin: 0; padding: 8px 12px; border-radius: 8px; background: rgba(120, 30, 20, 0.85); color: #fff; font-size: 13px;
}
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```

- [ ] **Step 3: `web/main.ts` 를 다시 쓴다**

```ts
import { parse } from '../src/core/parse';
import { loadSeedLexicon } from '../src/core/lexicon';
import type { IR } from '../src/core/ir';
import { render, buildStrokes, type RenderResult } from '../src/render/compose';
import { arrival } from '../src/render/arrival';
import { loadLook } from '../src/render/look';
import { encodeShare, decodeShare } from './share';
import { downloadSvg, downloadPng, fileNameFor } from './download';
import { partsOf, partKeyOf, describe as describePart } from './breakdown';
import { maskVertices } from './smoke/geometry';
import { SceneRenderer } from './scene/renderer';
import { loadScene } from './scene/params';
import { loadScreen } from './screen';
import { decodeSteps } from './decode';
import { Flow, type FlowTiming, type FrameState } from './scenes/flow';

const lex = loadSeedLexicon();
const look = loadLook();
const screen = loadScreen();
const scene = loadScene();

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('scene');
const svgEl = el<HTMLDivElement>('svgGlyph');
const form = el<HTMLFormElement>('form');
const input = el<HTMLInputElement>('text');
const errorEl = el<HTMLParagraphElement>('error');
const startBtn = el<HTMLButtonElement>('start');
const decodeBtn = el<HTMLButtonElement>('decodeBtn');
const againBtn = el<HTMLButtonElement>('again');
const wordsEl = el<HTMLOListElement>('words');
const sentenceEl = el<HTMLParagraphElement>('sentence');
const shareBtn = el<HTMLButtonElement>('share');
const captionEl = el<HTMLParagraphElement>('caption');
const partsEl = el<HTMLUListElement>('parts');

// WebGL2 가 있으면 장면 셰이더, 없거나 잃으면 SVG (화면 경험 설계 5절)
const renderer = SceneRenderer.create(canvas, scene, look.pR);
let glAlive = renderer !== null;
document.body.classList.toggle('no-gl', !glAlive);

/** 지금 그려진 문장 */
interface Current { text: string; svg: string; strokes: RenderResult['strokes']; partKeys: string[] }
let current: Current | null = null;

const timingFor = (bloomSeconds: number): FlowTiming => ({
  bloomSeconds,
  hintSeconds: screen.decode.hintSeconds,
  stepSeconds: screen.decode.stepSeconds,
  sentenceSeconds: screen.decode.sentenceSeconds,
});
let flow = new Flow([], timingFor(1), false);
/** '자세히' 의 분해 목록에서 가리킨 묶음 — 흐름이 강조하지 않을 때만 쓴다 */
let hover = -1;
let lastState: FrameState | null = null;
/** SVG 경로에 마지막으로 칠한 강조 — 같은 값이면 DOM 을 건드리지 않는다 */
let painted = -2;

function showError(message: string | null): void {
  errorEl.textContent = message ?? '';
  errorEl.hidden = message === null;
}

/** '자세히' — 성분 요약과 분해 목록 */
function fillDetails(ir: IR, result: RenderResult, partKeys: string[]): void {
  const moodName: Record<string, string> = {
    declarative: '평서', interrogative: '의문', negative: '부정', volitional: '의지', concessive: '양보',
  };
  const spelled = ir.constituents.filter((c) => c.kind === 'phonetic').length;
  const bits = [`성분 ${ir.constituents.length}개`, `${moodName[ir.mood] ?? ir.mood}문`];
  if (spelled > 0) bits.push(`사전에 없는 말 ${spelled}개는 소리대로 적었습니다`);
  captionEl.textContent = bits.join(' · ');

  partsEl.innerHTML = '';
  for (const part of partsOf(result)) {
    const li = document.createElement('li');
    li.textContent = describePart(part);
    li.tabIndex = 0;
    const index = partKeys.indexOf(part.key);
    const mark = (on: boolean) => { li.classList.toggle('on', on); hover = on ? index : -1; };
    li.addEventListener('mouseenter', () => mark(true));
    li.addEventListener('mouseleave', () => mark(false));
    li.addEventListener('focus', () => mark(true));
    li.addEventListener('blur', () => mark(false));
    partsEl.appendChild(li);
  }
}

/** 장면에서 먹을 지운다 */
function clearInk(): void {
  current = null;
  renderer?.setVertices(new Float32Array(0));
  svgEl.innerHTML = '';
  wordsEl.innerHTML = '';
  sentenceEl.textContent = '';
  painted = -2;
}

/** 문장을 그릴 준비 — 마스크(또는 SVG), 해독 순서, '자세히'. 실패하면 오류를 보이고 false. */
function prepare(text: string, allowDecode: boolean): boolean {
  const trimmed = text.trim();
  showError(null);
  if (trimmed === '') return false;
  try {
    const ir = parse(trimmed, lex);
    const result = render(ir, lex, look, { size: 640 });
    const sk = buildStrokes(ir, lex, look);
    const arr = arrival(sk, look, screen.timing);
    const steps = decodeSteps(ir, arr, lex, trimmed);

    current = { text: trimmed, svg: result.svg, strokes: result.strokes, partKeys: arr.parts };
    painted = -2;
    if (glAlive && renderer) {
      renderer.setVertices(maskVertices(sk, arr));
      svgEl.innerHTML = '';
    } else {
      svgEl.innerHTML = result.svg;
    }
    svgEl.setAttribute('aria-label', `${trimmed} 의 로고그램`);

    wordsEl.innerHTML = '';
    for (const step of steps) {
      const li = document.createElement('li');
      li.textContent = step.label;
      wordsEl.appendChild(li);
    }
    sentenceEl.textContent = trimmed;
    fillDetails(ir, result, arr.parts);
    flow = new Flow(steps.map((s) => s.part), timingFor(arr.duration), allowDecode);
    lastState = null;
    return true;
  } catch (e) {
    clearInk();
    showError((e as Error).message);
    return false;
  }
}

/** 받는 화면 — 링크로 들어왔다 */
function enterReceive(text: string): void {
  document.body.classList.add('receive');
  document.body.classList.remove('make');
  input.value = text;
  if (prepare(text, true)) flow.arm();
}

/** 만드는 화면 — '나도 만들기' 를 눌렀거나 그냥 들어왔다 */
function enterMake(): void {
  document.body.classList.add('make');
  document.body.classList.remove('receive');
  history.replaceState(null, '', location.pathname);
  clearInk();
  flow = new Flow([], timingFor(1), false);
  lastState = null;
  shareBtn.hidden = true;
  input.value = '';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!prepare(input.value, false) || !current) return;
  flow.start(performance.now());
  // replaceState 를 쓰면 뒤로 가기 기록이 문장마다 쌓이지 않는다
  history.replaceState(null, '', encodeShare(current.text));
  shareBtn.hidden = false;
});

startBtn.addEventListener('click', () => flow.start(performance.now()));
decodeBtn.addEventListener('click', () => flow.decode(performance.now()));
againBtn.addEventListener('click', () => enterMake());

shareBtn.addEventListener('click', async () => {
  if (!current) return;
  const url = `${location.origin}${location.pathname}${encodeShare(current.text)}`;
  const old = shareBtn.textContent;
  try {
    if (navigator.share) {
      await navigator.share({ title: '헵타포드 B', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = '링크를 복사했어요';
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;   // 공유 창을 닫았다
    shareBtn.textContent = '복사하지 못했어요 — 주소창을 쓰세요';
  }
  setTimeout(() => { shareBtn.textContent = old; }, 1600);
});

el<HTMLButtonElement>('saveSvg').addEventListener('click', () => {
  if (current) downloadSvg(current.svg, fileNameFor(current.text, 'svg'));
});
el<HTMLButtonElement>('savePng').addEventListener('click', () => {
  if (current) void downloadPng(current.svg, fileNameFor(current.text, 'png'), 1200);
});

// 폰에서 앱을 바꾸거나 인앱 브라우저가 컨텍스트를 빼앗으면 gl 호출이 조용히
// 아무 일도 하지 않는다. 복구는 시도하지 않고 SVG 로 대신한다.
canvas.addEventListener('webglcontextlost', () => {
  if (!glAlive) return;
  glAlive = false;
  document.body.classList.add('no-gl');
  if (current) svgEl.innerHTML = current.svg;
  painted = -2;
});
new ResizeObserver(() => renderer?.resize()).observe(canvas);

/** 흐름 상태를 DOM 에 옮긴다 — 바뀐 프레임에서만 부른다 */
function apply(st: FrameState): void {
  startBtn.hidden = !st.showStart;
  decodeBtn.hidden = !st.showDecode;
  againBtn.hidden = !(document.body.classList.contains('receive') && st.phase === 'decoded');
  [...wordsEl.children].forEach((li, i) => {
    li.classList.toggle('shown', i < st.labelsShown);
    li.classList.toggle('now', st.phase === 'decoding' && i === st.labelsShown - 1);
  });
  sentenceEl.hidden = !st.showSentence;
}

const same = (a: FrameState, b: FrameState) =>
  a.phase === b.phase && a.highlight === b.highlight && a.labelsShown === b.labelsShown
  && a.showStart === b.showStart && a.showDecode === b.showDecode && a.showSentence === b.showSentence;

/** SVG 로 그릴 때의 강조 */
function paintSvg(highlight: number): void {
  if (!current || highlight === painted) return;
  painted = highlight;
  const key = highlight >= 0 ? current.partKeys[highlight] : undefined;
  const paths = [...svgEl.querySelectorAll('path')];
  current.strokes.forEach((s, i) => {
    paths[i]?.setAttribute('fill', key !== undefined && partKeyOf(s) === key ? '#c0563f' : '#16120e');
  });
}

// 장면 시계는 페이지가 열린 뒤로 흐른다 — 문장을 보낼 때마다 되감기지 않는다.
// 600초로 감아 셰이더 sin 해시의 정밀도를 지킨다.
const pageT0 = performance.now();
function frame(now: number): void {
  const st = flow.frame(now);
  if (!lastState || !same(lastState, st)) apply(st);
  lastState = st;
  const highlight = st.highlight >= 0 ? st.highlight : hover;
  if (glAlive && renderer) renderer.draw(3.7 + (Math.max(0, now - pageT0) / 1000) % 600, st.prog, highlight);
  else paintSvg(highlight);
  requestAnimationFrame(frame);
}

// 링크로 들어온 경우 — 받는 화면. 아니면 만드는 화면.
const shared = decodeShare(location.hash);
if (shared) enterReceive(shared.text);
else document.body.classList.add('make');

window.addEventListener('hashchange', () => {
  const next = decodeShare(location.hash);
  if (next && next.text !== current?.text) enterReceive(next.text);
});

requestAnimationFrame(frame);
```

- [ ] **Step 4: 1단계 렌더러를 지운다**

```bash
git rm web/smoke/renderer.ts tests/web/smoke-renderer.test.ts
```

`web/smoke/shaders.ts` 에서 `SMOKE_LOOK_KEYS`, `SMOKE_FS` 와 그 설명 주석을 지운다. `MASK_VS`, `MASK_FS`, `SMOKE_VS` 는 남긴다. 다른 파일이 지운 것을 임포트하지 않는지 확인한다: `grep -rn "SMOKE_FS\|SMOKE_LOOK_KEYS\|smoke/renderer" web src tests` → 결과 없음.

- [ ] **Step 5: 확인**

Run: `npm test && npm run typecheck && npm run build`
Expected: 모두 통과. 지운 테스트 파일의 수만큼 테스트 수가 줄고 Task 1~3 이 더한 만큼 늘었는지 보고한다.

목걸이 해시: `npx tsx src/cli.ts --text "그럼에도 불구하고 나는 너를 사랑해" --necklace --cut --out <scratchpad>/cut-stage2.svg` (3분 넘게 걸린다) → SHA256 이 Global Constraints 의 값과 같다.

- [ ] **Step 6: 커밋 (push 하지 않는다 — 컨트롤러가 브라우저로 확인한 뒤 올린다)**

```bash
git add web/index.html web/style.css web/main.ts web/smoke/shaders.ts
git commit -m "feat: 화면 전체가 우주선 안 — 받는 화면(눌러서 시작, 해독)과 만드는 화면(생성하기, 링크 보내기)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: 브라우저 확인 (컨트롤러)**

개발 서버(`preview_start` name `web`)로:
1. 그냥 들어오면 만드는 화면: 장면만 있고 아래에 입력줄과 '생성하기'. 콘솔 오류 없음.
2. 문장을 넣고 '생성하기' → 먹이 번지고, '링크 보내기' 가 보이고, 주소에 `#t=` 가 붙는다. '자세히' 를 열면 분해·받기·고지.
3. 그 주소로 새로 들어오면 받는 화면: '눌러서 시작' 만 → 누르면 번짐 → 잠시 뒤 '해독하기' → 누르면 낱말이 하나씩 빛나며 떠오르고 마지막에 문장 전체 → '나도 만들기' → 만드는 화면, 주소의 `#t=` 가 지워짐.
4. 영어 문장 링크는 영어 낱말로 해독된다.
5. 폰 크기(`resize_window` mobile)에서 입력줄·버튼이 화면 안에 있고 로고그램이 잘리지 않는다.

- [ ] **Step 8: 올리고 사용자 확인 (2단계 체크포인트)**

`git push origin main` → Vercel 배포 확인(사이트 HTML 의 `assets/index-*.js` 이름이 로컬 빌드와 같은지). 사용자에게 폰으로 링크를 열어 처음부터 끝까지 보게 하고, 폰에서의 속도(버벅임·발열)를 물어본다.
