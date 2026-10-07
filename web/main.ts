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
