import { describe, it, expect, vi } from 'vitest';
import { loadLook, LOOK_KEYS } from '../../src/render/look';
import { SMOKE_LOOK_KEYS, SMOKE_FS, MASK_FS } from '../../web/smoke/shaders';
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

  it('묶음 번호는 +1 로 저장해 0번(링)이 지워진 배경과 겹치지 않는다', () => {
    expect(MASK_FS).toContain('vTP.y + 1.0');
    expect(SMOKE_FS).toMatch(/float part = .*- 1\.0;/);
  });

  it('덮임이 거의 없는 바깥 픽셀은 더 흐린 단계의 도착 시각으로 대신한다', () => {
    expect(SMOKE_FS).toMatch(/textureLod\(uMask, uvW, 5\.0\)/);
    expect(SMOKE_FS).toMatch(/float arrive = .*bw\.g \/ bw\.r/);
  });
});

describe('SmokeRenderer.create', () => {
  it('WebGL2 가 없으면 null — 호출자가 SVG 로 대신한다. 이유는 경고로 남긴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
      expect(SmokeRenderer.create(canvas, loadLook())).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
