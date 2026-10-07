import { parse } from '../src/core/parse';
import { loadSeedLexicon } from '../src/core/lexicon';
import { render, buildStrokes, type RenderResult } from '../src/render/compose';
import { arrival } from '../src/render/arrival';
import { loadLook } from '../src/render/look';
import { encodeShare, decodeShare } from './share';
import { downloadSvg, downloadPng, fileNameFor } from './download';
import { partKeyOf } from './breakdown';
import { detailsOf, type Details } from './details';
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
const decodeBtn = el<HTMLButtonElement>('decodeBtn');
const wordsEl = el<HTMLOListElement>('words');
const sentenceEl = el<HTMLParagraphElement>('sentence');
const shareBtn = el<HTMLButtonElement>('share');
const shareLabelEl = el<HTMLSpanElement>('shareLabel');
const actionsEl = el<HTMLDivElement>('actions');
const detailsBtn = el<HTMLButtonElement>('detailsBtn');
const shareUrlEl = el<HTMLInputElement>('shareUrl');
const sheet = el<HTMLElement>('sheet');
const sheetClose = el<HTMLButtonElement>('sheetClose');
const sheetHandle = el<HTMLDivElement>('sheetHandle');
const sheetSentence = el<HTMLParagraphElement>('sheetSentence');
const moodCard = el<HTMLButtonElement>('moodCard');
const moodNameEl = el<HTMLSpanElement>('moodName');
const moodNoteEl = el<HTMLSpanElement>('moodNote');
const sheetRows = el<HTMLDivElement>('sheetRows');
const spelledNote = el<HTMLParagraphElement>('spelledNote');

const SHARE_LABEL = '공유하기';
/** 입력줄이 비어 있을 때 쓰는 문장 (index.html 의 placeholder 와 같다) */
const DEFAULT_SENTENCE = '그럼에도 불구하고 나는 너를 사랑한다';
const FRIENDLY_ERROR = '이 문장은 아직 그릴 수 없어요. 다른 말로 바꿔 보세요.';
/** 손가락으로 다루는 기기 — 공유 창과 화상 키보드가 있는 쪽 */
const isTouch = (): boolean => window.matchMedia('(pointer: coarse)').matches;

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
/** '자세히' 시트에서 가리킨 묶음 — 흐름이 강조하지 않을 때만 쓴다 */
let hover = -1;
/** 지금 시트가 보여 주는 '문장 종류' 묶음 (없으면 null) */
let sheetMoodPart: number | null = null;
let lastState: FrameState | null = null;
/** SVG 경로에 마지막으로 칠한 강조 — 같은 값이면 DOM 을 건드리지 않는다 */
let painted = -2;

function showError(message: string | null): void {
  errorEl.textContent = message ?? '';
  errorEl.hidden = message === null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 시계 아이콘 — 12시가 위, 시계 방향. 낱말이 놓인 자리에 점 하나. */
function clockIcon(hour: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 30 30');
  svg.setAttribute('class', 'word-clock');
  svg.setAttribute('aria-hidden', 'true');
  const add = (attrs: Record<string, string>) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, v);
    svg.appendChild(c);
  };
  add({ cx: '15', cy: '15', r: '14.5', fill: 'none', stroke: 'rgba(255,255,255,0.35)', 'stroke-width': '1' });
  add({ cx: '15', cy: '4.2', r: '0.9', fill: 'rgba(255,255,255,0.45)' });
  const angle = ((hour % 12) / 12) * Math.PI * 2;
  add({
    cx: (15 + 9 * Math.sin(angle)).toFixed(2), cy: (15 - 9 * Math.cos(angle)).toFixed(2),
    r: '3', fill: 'rgba(255,255,255,0.95)',
  });
  return svg;
}

/** 시트에서 가리킨 묶음을 바꾸고, 시트 안의 강조 표시를 맞춘다 */
function setHover(part: number): void {
  hover = part;
  for (const row of sheetRows.children) row.classList.toggle('on', Number((row as HTMLElement).dataset.part) === part);
  moodCard.classList.toggle('on', sheetMoodPart !== null && part === sheetMoodPart);
}

/**
 * 마우스는 가리키면 켜고 떠나면 끈다. 터치는 누르면 켜고 같은 것을 다시 누르면 끈다
 * (터치에서 흉내 내는 mouseenter 는 떠남이 없어 강조가 남기 때문에 쓰지 않는다).
 */
function bindHighlight(node: HTMLElement, partOf: () => number | null): void {
  const on = () => { const p = partOf(); if (p !== null && !isTouch()) setHover(p); };
  const off = () => { if (partOf() !== null && !isTouch()) setHover(-1); };
  node.addEventListener('mouseenter', on);
  node.addEventListener('focus', on);
  node.addEventListener('mouseleave', off);
  node.addEventListener('blur', off);
  node.addEventListener('click', () => {
    const p = partOf();
    if (p === null || !isTouch()) return;
    setHover(hover === p ? -1 : p);
  });
}
bindHighlight(moodCard, () => sheetMoodPart);

/** '자세히' 시트 — 문장을 새로 그릴 때마다 다시 채운다 */
function fillSheet(d: Details): void {
  sheetSentence.textContent = d.sentence;
  moodNameEl.textContent = d.moodName;
  moodNoteEl.textContent = d.moodNote;
  sheetMoodPart = d.moodPart;
  moodCard.classList.toggle('has-part', d.moodPart !== null);
  moodCard.classList.remove('on');
  spelledNote.hidden = d.spelled <= 0;

  sheetRows.innerHTML = '';
  for (const r of d.rows) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'word-row';
    row.dataset.part = String(r.part);
    row.appendChild(clockIcon(r.hour));
    const mid = document.createElement('span');
    const word = document.createElement('span');
    word.className = 'word-main';
    word.textContent = r.word;
    const sub = document.createElement('span');
    sub.className = 'word-sub';
    sub.textContent = `${r.roleWord} · ${r.hour}시`;
    mid.append(word, sub);
    const strokes = document.createElement('span');
    strokes.className = 'word-strokes';
    strokes.textContent = `획 ${r.strokes}`;
    row.append(mid, strokes);
    bindHighlight(row, () => r.part);
    sheetRows.appendChild(row);
  }
}

/** 장면에서 먹을 지운다 */
function clearInk(): void {
  current = null;
  renderer?.setVertices(new Float32Array(0));
  svgEl.innerHTML = '';
  wordsEl.innerHTML = '';
  sentenceEl.textContent = '';
  sheetRows.innerHTML = '';
  sheetSentence.textContent = '';
  sheetMoodPart = null;
  hover = -1;
  svgEl.setAttribute('aria-label', '로고그램');
  painted = -2;
}

/** 수동 복사용 링크 칸을 다시 숨긴다 */
function hideShareUrl(): void {
  shareUrlEl.hidden = true;
  shareUrlEl.value = '';
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
      li.setAttribute('aria-hidden', 'true');   // 나타나기 전에는 읽어 주지 않는다 (apply 가 푼다)
      wordsEl.appendChild(li);
    }
    sentenceEl.textContent = trimmed;
    // 지워진 <li> 는 mouseleave 를 보내지 않으니 이전 강조 번호가 남지 않게 먼저 푼다
    hover = -1;
    hideShareUrl();
    fillSheet(detailsOf(ir, arr, result, lex, trimmed));
    flow = new Flow(steps.map((s) => s.part), timingFor(arr.duration), allowDecode);
    lastState = null;
    return true;
  } catch (e) {
    console.warn('prepare 실패', e);
    clearInk();
    closeSheet();
    flow = new Flow([], timingFor(1), false);
    lastState = null;
    showError(FRIENDLY_ERROR);
    return false;
  }
}

/** 로고그램이 있을 때만 '공유하기' · '자세히' 줄을 보인다 */
function setHasGlyph(on: boolean): void {
  actionsEl.hidden = !on;
}

/** 그릴 수 없는 문장이다 — 먹도 이전 문장의 링크도 남기지 않고, 쓴 글은 입력줄에 둔다 */
function dropGlyph(text: string): void {
  setHasGlyph(false);
  history.replaceState(null, '', location.pathname);
  input.value = text;
}

/** 링크로 들어왔거나 hash 가 바뀌었다 — 입력줄에 문장을 채우고 바로 번지게 한다 */
function arrive(text: string): void {
  input.value = text;
  if (prepare(text, true)) {
    flow.start(performance.now());
    setHasGlyph(true);
    return;
  }
  // 옛 링크나 손으로 고친 링크 — 막다른 길이 되지 않게 쓴 글을 남기고 오류를 보인다
  dropGlyph(text);
  showError(FRIENDLY_ERROR);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input.value.trim() === '') input.value = DEFAULT_SENTENCE;
  if (!prepare(input.value, false) || !current) {
    // 먹은 지워졌다 — 이전 문장의 링크와 공유 줄이 남지 않게
    dropGlyph(input.value);
    return;
  }
  flow.start(performance.now());
  // replaceState 를 쓰면 뒤로 가기 기록이 문장마다 쌓이지 않는다
  history.replaceState(null, '', encodeShare(current.text));
  setHasGlyph(true);
  if (isTouch()) input.blur();   // 화상 키보드가 번지는 먹을 가리지 않게
});

decodeBtn.addEventListener('click', () => flow.decode(performance.now()));

let shareTimer: number | undefined;
/** 버튼 글자를 잠깐 바꿨다가 되돌린다 — 연달아 눌러도 원래 글자로 돌아온다 */
function flashShare(message: string): void {
  shareLabelEl.textContent = message;
  window.clearTimeout(shareTimer);
  shareTimer = window.setTimeout(() => { shareLabelEl.textContent = SHARE_LABEL; }, 1600);
}

/** 클립보드 API 가 막힌 인앱 브라우저용 — 숨긴 textarea 를 골라 복사 명령을 쓴다 */
function copyWithTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

shareBtn.addEventListener('click', async () => {
  if (!current) return;
  const url = `${location.origin}${location.pathname}${encodeShare(current.text)}`;
  // 1. 공유 창 — 손가락 기기에서만. 데스크톱 브라우저의 공유 창은 어색하다.
  if (typeof navigator.share === 'function' && isTouch()) {
    try {
      await navigator.share({ title: '헵타포드 B', url });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;   // 공유 창을 닫았다
    }
  }
  // 2. 클립보드
  try {
    await navigator.clipboard.writeText(url);
    flashShare('링크를 복사했어요');
    return;
  } catch { /* NotAllowedError 등 — 다음 방법으로 */ }
  // 3. 숨은 textarea + execCommand
  if (copyWithTextarea(url)) {
    flashShare('링크를 복사했어요');
    return;
  }
  // 4. 모두 막혔다 — 링크를 보여 주고 손으로 복사하게 한다
  shareUrlEl.value = url;
  shareUrlEl.hidden = false;
  shareUrlEl.focus();
  shareUrlEl.select();
  flashShare(isTouch() ? '길게 눌러 복사하세요' : '선택해서 복사하세요');
});

el<HTMLButtonElement>('saveSvg').addEventListener('click', () => {
  if (current) downloadSvg(current.svg, fileNameFor(current.text, 'svg'));
});
el<HTMLButtonElement>('savePng').addEventListener('click', () => {
  if (current) void downloadPng(current.svg, fileNameFor(current.text, 'png'), 1200);
});

let sheetCloseTimer: number | undefined;
const sheetIsOpen = (): boolean => sheet.classList.contains('open');

/** 시트를 연다 — hidden 을 풀고 한 프레임 뒤 .open 을 붙여야 미끄러져 들어온다 */
function openSheet(): void {
  if (!current || sheetIsOpen()) return;
  window.clearTimeout(sheetCloseTimer);
  sheet.hidden = false;
  void sheet.offsetHeight;   // 전환의 출발점을 확정
  sheet.classList.add('open');
  document.body.classList.add('sheet-open');
  sheetClose.focus({ preventScroll: true });
}

/** 시트를 닫는다. 전환이 끝난 뒤 hidden 을 다시 건다. */
function closeSheet(): void {
  if (!sheetIsOpen()) return;
  const wasInside = sheet.contains(document.activeElement);
  sheet.classList.remove('open');
  document.body.classList.remove('sheet-open');
  setHover(-1);
  window.clearTimeout(sheetCloseTimer);
  sheetCloseTimer = window.setTimeout(() => { if (!sheetIsOpen()) sheet.hidden = true; }, 400);
  if (wasInside && !actionsEl.hidden) detailsBtn.focus({ preventScroll: true });
}

detailsBtn.addEventListener('click', openSheet);
sheetClose.addEventListener('click', closeSheet);
sheetHandle.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetIsOpen()) closeSheet();
});

// 시트가 열려 있는 동안 로고그램을 시트에 가리지 않는 쪽 가운데로 옮기고 줄인다.
// SceneRenderer 는 scene 객체를 참조로 읽으니 값만 바꾸면 된다. 셰이더 좌표계: 화면 높이가 1,
// 가운데가 원점, y 위쪽이 + (q.y = 0.5 - pxY / innerHeight).
const base = { ...scene };
const wideSheet = window.matchMedia('(min-width: 900px)');
function moveLogo(): void {
  const bx = base.sLogoX ?? 0, by = base.sLogoY ?? 0, bs = base.sLogoSize ?? 1;
  let tx = bx, ty = by, ts = bs;
  if (sheetIsOpen()) {
    const h = window.innerHeight, w = window.innerWidth;
    if (wideSheet.matches) {
      const visW = w - sheet.offsetWidth - 16;   // 시트 왼쪽까지 (전환 중의 transform 은 보지 않는다)
      tx = (visW / 2 - w / 2) / h;
    } else {
      const vis = h - sheet.offsetHeight;        // 시트 위쪽까지
      ty = 0.5 - vis / 2 / h;
      // 셰이더는 세로 화면에서 로고 크기에 min(1, 화면비 * 1.05) 를 곱한다 — 그만큼 보정해 실제 크기를 맞춘다
      ts = Math.min(bs, (0.85 * vis / h) / Math.min(1, (w / h) * 1.05));
    }
  }
  const ease = (v: number, t: number): number => (Math.abs(t - v) < 1e-4 ? t : v + (t - v) * 0.12);
  scene.sLogoX = ease(scene.sLogoX ?? tx, tx);
  scene.sLogoY = ease(scene.sLogoY ?? ty, ty);
  scene.sLogoSize = ease(scene.sLogoSize ?? ts, ts);
}

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
  decodeBtn.hidden = !st.showDecode;
  wordsEl.classList.toggle('live', st.labelsShown > 0);
  [...wordsEl.children].forEach((li, i) => {
    li.setAttribute('aria-hidden', String(!(i < st.labelsShown)));
    li.classList.toggle('shown', i < st.labelsShown);
    li.classList.toggle('now', st.phase === 'decoding' && i === st.labelsShown - 1);
  });
  sentenceEl.hidden = !st.showSentence;
}

const same = (a: FrameState, b: FrameState) =>
  a.phase === b.phase && a.highlight === b.highlight && a.labelsShown === b.labelsShown
  && a.showDecode === b.showDecode && a.showSentence === b.showSentence;

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
  if (glAlive) moveLogo();
  if (!lastState || !same(lastState, st)) apply(st);
  lastState = st;
  const highlight = st.highlight >= 0 ? st.highlight : hover;
  if (glAlive && renderer) renderer.draw(3.7 + (Math.max(0, now - pageT0) / 1000) % 600, st.prog, highlight);
  else paintSvg(highlight);
  requestAnimationFrame(frame);
}

// 언제나 입력 화면 — 링크로 들어왔으면 문장을 채우고 바로 번지게 한다.
const shared = decodeShare(location.hash);
if (shared) arrive(shared.text);

window.addEventListener('hashchange', () => {
  const next = decodeShare(location.hash);
  if (next && next.text !== current?.text) arrive(next.text);
});

requestAnimationFrame(frame);
