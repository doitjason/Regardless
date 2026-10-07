import { parse } from '../src/core/parse';
import { loadSeedLexicon } from '../src/core/lexicon';
import { buildStrokes } from '../src/render/compose';
import { arrival } from '../src/render/arrival';
import { loadLook } from '../src/render/look';
import { loadScreen } from './screen';
import { SCENE_PARAMS, loadScene } from './scene/params';
import { SceneRenderer } from './scene/renderer';
import { maskVertices } from './smoke/geometry';

/**
 * 장면 실험실 — 개발용 페이지 (배포 번들에 들어가지 않는다).
 * 화면 전체 장면과 연기 먹을 슬라이더로 고른다. 고른 값은 JSON 으로 내보내
 * 화면 경험 2단계의 기준값이 된다.
 */

const lex = loadSeedLexicon();
const look = loadLook();
const screen = loadScreen();
const STORE = 'regardless-scene-lab';

// ── 파라미터 ──
// 기본값은 design/scene.json (사용자가 고른 기준값).
const DEF: Record<string, number> = loadScene();
const val: Record<string, number> = { ...DEF };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, unknown>;
  for (const k of Object.keys(DEF)) if (typeof saved[k] === 'number') val[k] = saved[k] as number;
} catch { /* 저장소를 못 쓰면 기본값 */ }

// ── 장면 ──
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = SceneRenderer.create(canvas, val, look.pR);
if (!renderer) throw new Error('WebGL2 를 쓸 수 없다');
const bloom = { t0: performance.now(), duration: 1 };

// ── 문장 → 마스크 ──
function draw(text: string): void {
  const ir = parse(text, lex);
  const sk = buildStrokes(ir, lex, look);
  const arr = arrival(sk, look, screen.timing);
  renderer!.setVertices(maskVertices(sk, arr));
  bloom.t0 = performance.now();
  bloom.duration = arr.duration;
}

// ── 크기 ──
function resize(): void { renderer!.resize(); }
new ResizeObserver(resize).observe(canvas);

// ── 루프 ──
const t0 = performance.now();
const fpsEl = document.getElementById('fps')!;
let frames = 0, lastFps = performance.now();
function frame(now: number): void {
  renderer!.draw(3.7 + ((now - t0) / 1000) % 600, Math.min(1, Math.max(0, now - bloom.t0) / 1000 / bloom.duration), -1);
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
SCENE_PARAMS.forEach(([name, rows], gi) => {
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
