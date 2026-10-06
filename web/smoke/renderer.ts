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

/** 프로그램을 링크할 때 한 번 찾아 두는 유니폼·어트리뷰트 위치. 프레임마다 묻지 않는다. */
interface Locations {
  maskHalf: WebGLUniformLocation | null;
  maskV: number;
  smokeA: number;
  uMask: WebGLUniformLocation | null;
  uRes: WebGLUniformLocation | null;
  uT: WebGLUniformLocation | null;
  uHalf: WebGLUniformLocation | null;
  uProg: WebGLUniformLocation | null;
  uHighlight: WebGLUniformLocation | null;
  look: ReadonlyArray<readonly [WebGLUniformLocation | null, (typeof SMOKE_LOOK_KEYS)[number]]>;
}

function locate(gl: WebGL2RenderingContext, maskProg: WebGLProgram, smokeProg: WebGLProgram): Locations {
  const u = (name: string) => gl.getUniformLocation(smokeProg, name);
  return {
    maskHalf: gl.getUniformLocation(maskProg, 'uHalf'),
    maskV: gl.getAttribLocation(maskProg, 'aV'),
    smokeA: gl.getAttribLocation(smokeProg, 'a'),
    uMask: u('uMask'),
    uRes: u('uRes'),
    uT: u('uT'),
    uHalf: u('uHalf'),
    uProg: u('uProg'),
    uHighlight: u('uHighlight'),
    look: SMOKE_LOOK_KEYS.map((k) => [u(k), k] as const),
  };
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
    private readonly loc: Locations,
  ) {}

  static create(canvas: HTMLCanvasElement, look: LookParams): SmokeRenderer | null {
    const gl = canvas.getContext('webgl2', { antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) {
      console.warn('SmokeRenderer: WebGL2 를 쓸 수 없어 SVG 로 대신한다');
      return null;
    }
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

      const loc = locate(gl, maskProg, smokeProg);
      const r = new SmokeRenderer(canvas, gl, look, maskProg, smokeProg, maskTex, fbo, geoBuf, quadBuf, loc);
      r.resize();
      return r;
    } catch (e) {
      console.warn('SmokeRenderer: 셰이더를 준비하지 못해 SVG 로 대신한다', e);
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
    gl.uniform1f(this.loc.maskHalf, P_SPAN);
    gl.enableVertexAttribArray(this.loc.maskV);
    gl.vertexAttribPointer(this.loc.maskV, FLOATS_PER_VERTEX, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 한 프레임. `timeSec` 은 일렁임 시계, `prog` 는 번짐 진행(0..1). */
  draw(timeSec: number, prog: number, highlight: number): void {
    const gl = this.gl, p = this.smokeProg, l = this.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(l.smokeA);
    gl.vertexAttribPointer(l.smokeA, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(l.uMask, 0);
    gl.uniform2f(l.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(l.uT, timeSec);
    gl.uniform1f(l.uHalf, P_SPAN);
    gl.uniform1f(l.uProg, prog);
    gl.uniform1f(l.uHighlight, highlight);
    for (const [at, k] of l.look) gl.uniform1f(at, this.look[k]);
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
