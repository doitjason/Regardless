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
