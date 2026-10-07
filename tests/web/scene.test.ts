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
