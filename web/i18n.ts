/** 화면(UI)의 언어 — 한국어/영어. 로고그램과 해독 낱말은 입력한 문장의 언어를 따르고, 여기서 다루지 않는다. */
export type Lang = 'ko' | 'en';

const KEY = 'regardless-lang';

const isLang = (v: unknown): v is Lang => v === 'ko' || v === 'en';

/**
 * 처음 언어 — 저장해 둔 값이 있으면 그것, 없으면 브라우저 언어가 ko 로 시작할 때만 한국어.
 * 노드(테스트)나 저장소가 막힌 브라우저에서도 던지지 않는다.
 */
export function initialLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(KEY);
      if (isLang(saved)) return saved;
    }
  } catch { /* 저장소가 막혔다 — 브라우저 언어로 */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return typeof nav === 'string' && nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function saveLang(l: Lang): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, l);
  } catch { /* 저장은 편의일 뿐이다 */ }
}

export interface UiText {
  title: string;
  metaDescription: string;
  mark: string;
  noticeLong: string;
  noticeShort: string;
  inputLabel: string;
  create: string;
  defaultSentence: string;
  share: string;
  shareLinkLabel: string;
  copied: string;
  holdToCopy: string;
  selectToCopy: string;
  details: string;
  decode: string;
  sheetLabel: string;
  eyebrow: string;
  close: string;
  wordsAndPlaces: string;
  strokes: (n: number) => string;
  hour: (h: number) => string;
  spelledNote: string;
  savePng: string;
  saveSvg: string;
  /** innerHTML 로 넣는다 — 고정 문자열이다 */
  legal1: string;
  /** innerHTML 로 넣는다 — 고정 문자열이다 */
  legal2: string;
  error: string;
  langLabel: string;
  shareTitle: string;
  glyphLabel: string;
  glyphOf: (text: string) => string;
}

export const UI: Record<Lang, UiText> = {
  ko: {
    title: '헵타포드 B — 문장을 로고그램으로',
    metaDescription: '한국어나 영어 문장을 영화 《컨택트》의 헵타포드 B 양식 로고그램으로 바꿉니다. 팬 창작물입니다.',
    mark: '헵타포드 B',
    noticeLong: '팬 창작물 · Paramount 와 무관 · 로고그램 디자인 Martine Bertrand',
    noticeShort: '팬 창작물 · Paramount 와 무관',
    inputLabel: '문장',
    create: '생성하기',
    defaultSentence: '그럼에도 불구하고 나는 너를 사랑한다',
    share: '공유하기',
    shareLinkLabel: '공유 링크',
    copied: '링크를 복사했어요',
    holdToCopy: '길게 눌러 복사하세요',
    selectToCopy: '선택해서 복사하세요',
    details: '자세히',
    decode: '해독하기',
    sheetLabel: '이 로고그램 자세히',
    eyebrow: '이 로고그램은',
    close: '닫기',
    wordsAndPlaces: '낱말과 자리',
    strokes: (n) => `획 ${n}`,
    hour: (h) => `${h}시`,
    spelledNote: '사전에 없는 말(이름 등)은 소리를 따라 나선으로 적었어요.',
    savePng: '이미지로 저장',
    saveSvg: 'SVG',
    legal1: '팬 창작물이며 Paramount Pictures 및 영화 제작진과 무관합니다. '
      + '원작 로고그램 디자인 <strong>Martine Bertrand</strong>. '
      + '분석 자료 출처 <a href="https://github.com/WolframResearch/Arrival-Movie-Live-Coding" rel="noreferrer">Wolfram Research</a> (CC BY-NC 4.0).',
    legal2: '이 페이지가 그리는 모든 것은 규칙에서 실시간으로 만들어집니다. 원본 이미지를 담고 있지 않습니다.',
    error: '이 문장은 아직 그릴 수 없어요. 다른 말로 바꿔 보세요.',
    langLabel: '언어 바꾸기',
    shareTitle: '헵타포드 B',
    glyphLabel: '로고그램',
    glyphOf: (text) => `${text} 의 로고그램`,
  },
  en: {
    title: 'Heptapod B — sentences into logograms',
    metaDescription: 'Turns Korean or English sentences into logograms in the Heptapod B style from the film Arrival. A fan work.',
    mark: 'Heptapod B',
    noticeLong: 'Fan work · not affiliated with Paramount · logogram design Martine Bertrand',
    noticeShort: 'Fan work · not affiliated with Paramount',
    inputLabel: 'Sentence',
    create: 'Create',
    defaultSentence: 'Regardless, I love you',
    share: 'Share',
    shareLinkLabel: 'Share link',
    copied: 'Link copied',
    holdToCopy: 'Press and hold to copy',
    selectToCopy: 'Select to copy',
    details: 'Details',
    decode: 'Decode',
    sheetLabel: 'About this logogram',
    eyebrow: 'This logogram',
    close: 'Close',
    wordsAndPlaces: 'Words and places',
    strokes: (n) => `${n} strokes`,
    hour: (h) => `${h} o'clock`,
    spelledNote: 'Words not in the dictionary, like names, are written by sound as spirals.',
    savePng: 'Save image',
    saveSvg: 'SVG',
    legal1: 'This is a fan work, not affiliated with Paramount Pictures or the film\'s makers. '
      + 'Original logogram design by <strong>Martine Bertrand</strong>. '
      + 'Analysis data from <a href="https://github.com/WolframResearch/Arrival-Movie-Live-Coding" rel="noreferrer">Wolfram Research</a> (CC BY-NC 4.0).',
    legal2: 'Everything on this page is generated live from rules. It contains no original images.',
    error: 'This sentence can\'t be drawn yet. Try different words.',
    langLabel: 'Change language',
    shareTitle: 'Heptapod B',
    glyphLabel: 'Logogram',
    glyphOf: (text) => `Logogram of ${text}`,
  },
};
