import { parse } from '../src/core/parse';
import { loadSeedLexicon } from '../src/core/lexicon';
import { render, buildStrokes } from '../src/render/compose';
import { arrival } from '../src/render/arrival';
import { loadLook } from '../src/render/look';
import { encodeShare, decodeShare } from './share';
import { downloadSvg, downloadPng, fileNameFor } from './download';
import { partsOf, partKeyOf, describe as describePart } from './breakdown';
import { maskVertices } from './smoke/geometry';
import { SmokeRenderer } from './smoke/renderer';
import { loadScreen } from './screen';

const lex = loadSeedLexicon();
const look = loadLook();
const screen = loadScreen();

// WebGL2 가 있으면 먹 셰이더, 없으면 SVG 를 그대로 (화면 경험 설계 5절)
const smokeCanvas = document.getElementById('smoke') as HTMLCanvasElement;
const smoke = SmokeRenderer.create(smokeCanvas, look);
smokeCanvas.hidden = smoke === null;

/** 지금 번지는 그림 — 시작 시각(ms), 길이(초), 강조 묶음 */
const bloom = { t0: 0, duration: 1, highlight: -1 };

/** 캔버스의 먹을 비운다 — 빈 입력·오류일 때 지난 그림이 남지 않게. */
function clearSmoke(): void {
  smoke?.setVertices(new Float32Array(0));
  bloom.highlight = -1;
}

/** 마지막으로 그린 SVG — 내려받기 버튼이 쓴다. 그림이 없으면 빈 문자열. */
let lastSvg = '';

/**
 * 문장 하나를 그려 넣는다. 오류는 던지지 않고 화면에 적는다 —
 * 사용자가 무엇을 고쳐야 하는지 알아야 하기 때문이다.
 */
export function renderInto(root: HTMLElement, text: string): void {
  const errorEl = document.getElementById('error') as HTMLParagraphElement;
  const captionEl = document.getElementById('caption') as HTMLElement;
  const glyphEl = document.getElementById('glyph') as HTMLElement;
  const svgEl = document.getElementById('svgGlyph') as HTMLElement;
  const partsEl = document.getElementById('parts') as HTMLUListElement;

  const trimmed = text.trim();
  if (trimmed === '') {
    svgEl.innerHTML = '';
    clearSmoke();
    captionEl.textContent = '';
    partsEl.innerHTML = '';
    errorEl.hidden = true;
    lastSvg = '';
    return;
  }

  try {
    const ir = parse(trimmed, lex);
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

    const words = ir.constituents.length;
    const spelled = ir.constituents.filter((c) => c.kind === 'phonetic').length;
    const moodName: Record<string, string> = {
      declarative: '평서', interrogative: '의문', negative: '부정',
      volitional: '의지', concessive: '양보',
    };
    const parts = [`성분 ${words}개`, `${moodName[ir.mood] ?? ir.mood}문`];
    if (spelled > 0) parts.push(`사전에 없는 말 ${spelled}개는 소리대로 적었습니다`);
    captionEl.textContent = parts.join(' · ');
    errorEl.hidden = true;

    // 분해 보기 — 어느 획이 어느 낱말인지 (스펙 3)
    partsEl.innerHTML = '';
    const paths = [...svgEl.querySelectorAll('path')];
    for (const part of partsOf(result)) {
      const li = document.createElement('li');
      li.textContent = describePart(part);
      li.tabIndex = 0;
      const partIndex = arr.parts.indexOf(part.key);
      const mark = (on: boolean) => {
        li.classList.toggle('on', on);
        if (smoke) { bloom.highlight = on ? partIndex : -1; return; }
        result.strokes.forEach((s, i) => {
          if (partKeyOf(s) !== part.key) return;
          paths[i]?.setAttribute('fill', on ? '#c0563f' : '#16120e');
        });
      };
      li.addEventListener('mouseenter', () => mark(true));
      li.addEventListener('mouseleave', () => mark(false));
      li.addEventListener('focus', () => mark(true));
      li.addEventListener('blur', () => mark(false));
      partsEl.appendChild(li);
    }
  } catch (e) {
    svgEl.innerHTML = '';
    clearSmoke();
    captionEl.textContent = '';
    partsEl.innerHTML = '';
    errorEl.textContent = (e as Error).message;
    errorEl.hidden = false;
    lastSvg = '';
  }
}

const form = document.getElementById('form') as HTMLFormElement;
const input = document.getElementById('text') as HTMLInputElement;
const glyph = document.getElementById('glyph') as HTMLElement;

function show(text: string, pushHash: boolean): void {
  renderInto(glyph, text);
  if (pushHash) {
    const hash = text.trim() === '' ? '' : encodeShare(text.trim());
    // replaceState 를 쓰면 뒤로 가기 기록이 문장마다 쌓이지 않는다
    history.replaceState(null, '', hash === '' ? location.pathname : hash);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  show(input.value, true);
});

// 링크로 들어온 경우 — 주소의 문장을 입력창에 채우고 바로 그린다
const shared = decodeShare(location.hash);
if (shared) {
  input.value = shared.text;
  show(shared.text, false);
}

window.addEventListener('hashchange', () => {
  const next = decodeShare(location.hash);
  if (next && next.text !== input.value) {
    input.value = next.text;
    show(next.text, false);
  }
});

const copyBtn = document.getElementById('copyLink') as HTMLButtonElement;
copyBtn.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}${encodeShare(input.value.trim())}`;
  const old = copyBtn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = '복사됨';
  } catch {
    copyBtn.textContent = '복사 실패 — 주소창을 쓰세요';
  }
  setTimeout(() => { copyBtn.textContent = old; }, 1500);
});

const svgBtn = document.getElementById('saveSvg') as HTMLButtonElement;
const pngBtn = document.getElementById('savePng') as HTMLButtonElement;

svgBtn.addEventListener('click', () => {
  if (lastSvg === '') return;
  downloadSvg(lastSvg, fileNameFor(input.value, 'svg'));
});

pngBtn.addEventListener('click', () => {
  if (lastSvg === '') return;
  void downloadPng(lastSvg, fileNameFor(input.value, 'png'), 1200);
});

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
