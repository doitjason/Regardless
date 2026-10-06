import { parse } from '../src/core/parse';
import { loadSeedLexicon } from '../src/core/lexicon';
import { buildStrokes, P_SPAN } from '../src/render/compose';
import { arrival } from '../src/render/arrival';
import { loadLook } from '../src/render/look';
import { maskVertices, FLOATS_PER_VERTEX } from './smoke/geometry';
import { MASK_VS, MASK_FS, SMOKE_VS } from './smoke/shaders';
import { loadScreen } from './screen';
import { LAB_PARAMS, JS_ONLY_KEYS, SCENE_FS } from './lab-shader';

/**
 * 장면 실험실 — 개발용 페이지 (배포 번들에 들어가지 않는다).
 * 화면 전체 장면과 연기 먹을 슬라이더로 고른다. 고른 값은 JSON 으로 내보내
 * 화면 경험 2단계의 기준값이 된다.
 */

const lex = loadSeedLexicon();
const look = loadLook();
const screen = loadScreen();
const MASK_SIZE = 1024;
const STORE = 'regardless-scene-lab';

// ── 파라미터 ──
const DEF: Record<string, number> = {};
for (const [, rows] of LAB_PARAMS) for (const [k, , , , , v] of rows) DEF[k] = v;
const val: Record<string, number> = { ...DEF };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, unknown>;
  for (const k of Object.keys(DEF)) if (typeof saved[k] === 'number') val[k] = saved[k] as number;
} catch { /* 저장소를 못 쓰면 기본값 */ }

// ── WebGL ──
const canvas = document.getElementById('c') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) throw new Error('WebGL2 를 쓸 수 없다');

function compile(type: number, src: string): WebGLShader {
  const s = gl!.createShader(type)!;
  gl!.shaderSource(s, src);
  gl!.compileShader(s);
  if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? '컴파일 실패');
  return s;
}
function link(vs: string, fs: string): WebGLProgram {
  const p = gl!.createProgram()!;
  gl!.attachShader(p, compile(gl!.VERTEX_SHADER, vs));
  gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fs));
  gl!.linkProgram(p);
  if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) throw new Error(gl!.getProgramInfoLog(p) ?? '링크 실패');
  return p;
}

const maskProg = link(MASK_VS, MASK_FS);
const sceneProg = link(SMOKE_VS, SCENE_FS);

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

const U = (n: string) => gl!.getUniformLocation(sceneProg, n);
const uniforms = Object.keys(DEF).filter((k) => !JS_ONLY_KEYS.has(k)).map((k) => [k, U(k)] as const);
const uMask = U('uMask'), uRes = U('uRes'), uT = U('uT'), uHalf = U('uHalf'),
  uProg = U('uProg'), uHighlight = U('uHighlight'), uRingR = U('uRingR');

// ── 문장 → 마스크 ──
const bloom = { t0: performance.now(), duration: 1 };

function draw(text: string): void {
  const ir = parse(text, lex);
  const sk = buildStrokes(ir, lex, look);
  const arr = arrival(sk, look, screen.timing);
  const data = maskVertices(sk, arr);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, geoBuf);
  gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
  gl!.viewport(0, 0, MASK_SIZE, MASK_SIZE);
  gl!.clearColor(0, 0, 0, 1);
  gl!.clear(gl!.COLOR_BUFFER_BIT);
  gl!.useProgram(maskProg);
  gl!.uniform1f(gl!.getUniformLocation(maskProg, 'uHalf'), P_SPAN);
  const loc = gl!.getAttribLocation(maskProg, 'aV');
  gl!.enableVertexAttribArray(loc);
  gl!.vertexAttribPointer(loc, FLOATS_PER_VERTEX, gl!.FLOAT, false, 0, 0);
  gl!.drawArrays(gl!.TRIANGLES, 0, data.length / FLOATS_PER_VERTEX);
  gl!.bindTexture(gl!.TEXTURE_2D, maskTex);
  gl!.generateMipmap(gl!.TEXTURE_2D);
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  bloom.t0 = performance.now();
  bloom.duration = arr.duration;
}

// ── 크기 ──
function resize(): void {
  const scale = Math.min(window.devicePixelRatio || 1, 1.5) * (val.sResScale ?? 0.6);
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
}
new ResizeObserver(resize).observe(canvas);

// ── 루프 ──
const t0 = performance.now();
const fpsEl = document.getElementById('fps')!;
let frames = 0, lastFps = performance.now();
function frame(now: number): void {
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  gl!.viewport(0, 0, canvas.width, canvas.height);
  gl!.useProgram(sceneProg);
  gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
  const a = gl!.getAttribLocation(sceneProg, 'a');
  gl!.enableVertexAttribArray(a);
  gl!.vertexAttribPointer(a, 2, gl!.FLOAT, false, 0, 0);
  gl!.activeTexture(gl!.TEXTURE0);
  gl!.bindTexture(gl!.TEXTURE_2D, maskTex);
  gl!.uniform1i(uMask, 0);
  gl!.uniform2f(uRes, canvas.width, canvas.height);
  gl!.uniform1f(uT, 3.7 + ((now - t0) / 1000) % 600);
  gl!.uniform1f(uHalf, P_SPAN);
  gl!.uniform1f(uProg, Math.min(1, Math.max(0, now - bloom.t0) / 1000 / bloom.duration));
  gl!.uniform1f(uHighlight, -1);
  gl!.uniform1f(uRingR, look.pR);
  for (const [k, loc] of uniforms) gl!.uniform1f(loc, val[k]!);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  frames++;
  if (now - lastFps > 700) {
    fpsEl.textContent = `${Math.round(frames * 1000 / (now - lastFps))} fps · ${canvas.width}×${canvas.height}`;
    frames = 0; lastFps = now;
  }
  requestAnimationFrame(frame);
}

// ── 패널 ──
const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
const out = document.getElementById('out') as HTMLTextAreaElement;
const inputs: Record<string, HTMLInputElement> = {};
function sync(): void {
  out.value = JSON.stringify(val, (_, v) => (typeof v === 'number' ? +v.toFixed(4) : v), 2);
  try { localStorage.setItem(STORE, JSON.stringify(val)); } catch { /* 무시 */ }
}
const groups = document.getElementById('groups')!;
LAB_PARAMS.forEach(([name, rows], gi) => {
  const det = document.createElement('details');
  det.open = gi < 4;
  det.innerHTML = `<summary>${name}</summary>`;
  for (const [k, label, min, max, step] of rows) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label>${label}</label><span class="v" id="v_${k}">${fmt(val[k]!)}</span>`;
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val[k]) });
    inp.addEventListener('input', () => {
      val[k] = +inp.value;
      document.getElementById(`v_${k}`)!.textContent = fmt(val[k]!);
      if (k === 'sResScale') resize();
      sync();
    });
    inputs[k] = inp;
    row.appendChild(inp);
    det.appendChild(row);
  }
  groups.appendChild(det);
});
document.getElementById('copy')!.addEventListener('click', () => { void navigator.clipboard.writeText(out.value); });
document.getElementById('reset')!.addEventListener('click', () => {
  Object.assign(val, DEF);
  for (const k of Object.keys(inputs)) {
    inputs[k]!.value = String(val[k]);
    document.getElementById(`v_${k}`)!.textContent = fmt(val[k]!);
  }
  resize();
  sync();
});
const panel = document.getElementById('panel')!, toggle = document.getElementById('toggle')!;
toggle.addEventListener('click', () => {
  panel.classList.toggle('hide');
  toggle.classList.toggle('alone', panel.classList.contains('hide'));
  toggle.textContent = panel.classList.contains('hide') ? '패널 보이기' : '패널 숨기기';
});

const form = document.getElementById('bar') as HTMLFormElement;
const text = document.getElementById('text') as HTMLInputElement;
form.addEventListener('submit', (e) => { e.preventDefault(); draw(text.value); });

sync();
resize();
draw(text.value);
requestAnimationFrame(frame);
