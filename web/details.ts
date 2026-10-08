import type { IR, Mood, Role } from '../src/core/ir';
import type { Lexicon } from '../src/core/lexicon';
import { detectLanguage } from '../src/core/parse';
import type { Arrival } from '../src/render/arrival';
import type { RenderResult } from '../src/render/compose';
import { ROLE_SLOT } from '../src/render/layout';
import { partKeyOf } from '../src/render/parts';
import { partKeyOfConstituent, wordLabel } from './decode';
import type { Lang } from './i18n';

/** '자세히' 패널의 한 줄 — 낱말 하나가 로고그램의 어디에, 어떻게 놓였는가. */
export interface DetailRow {
  /** `Arrival.parts` 의 색인 — 강조할 묶음 */
  part: number;
  /** 원래 문장의 언어로 된 낱말 (`wordLabel`) */
  word: string;
  /** 역할을 쉬운 말로 */
  roleWord: string;
  /** 역할의 문법 이름 */
  roleName: string;
  /** 로고그램에서의 자리 — 시계 방향 1..12 */
  hour: number;
  /** 획 수 */
  strokes: number;
}

export interface Details {
  sentence: string;
  /** 화면 언어로 — 예: '평서문' | '의문문' | … / 'Statement' | 'Question' | … */
  moodName: string;
  /** 문장 종류가 로고그램에 어떻게 그려지는지 한 줄 */
  moodNote: string;
  /** 문장 종류 표지 묶음 색인 (의문·부정·의지일 때), 없으면 null */
  moodPart: number | null;
  /** 소리로 적은 말 수 */
  spelled: number;
  rows: DetailRow[];
}

type RoleText = { roleWord: string; roleName: string };
type MoodText = { name: string; note: string };

const ROLE_TEXT: Record<Lang, Record<Role, RoleText>> = {
  ko: {
    '행위': { roleWord: '하는 일', roleName: '서술' },
    '행위수식': { roleWord: '어떻게', roleName: '서술 꾸밈' },
    '주체': { roleWord: '누가', roleName: '주체' },
    '주체수식': { roleWord: '어떤 (누가)', roleName: '주체 꾸밈' },
    '시간': { roleWord: '언제', roleName: '시간' },
    '시간수식': { roleWord: '얼마나 자주', roleName: '시간 꾸밈' },
    '정도': { roleWord: '얼마나', roleName: '정도' },
    '대상': { roleWord: '누구를·무엇을', roleName: '대상' },
    '대상수식': { roleWord: '어떤 (누구를)', roleName: '대상 꾸밈' },
    '장소': { roleWord: '어디서', roleName: '장소' },
    '방향': { roleWord: '어디로', roleName: '방향' },
    '양상': { roleWord: '문장의 결', roleName: '양상' },
  },
  en: {
    '행위': { roleWord: 'the action', roleName: 'predicate' },
    '행위수식': { roleWord: 'how', roleName: 'predicate modifier' },
    '주체': { roleWord: 'who', roleName: 'subject' },
    '주체수식': { roleWord: 'which (who)', roleName: 'subject modifier' },
    '시간': { roleWord: 'when', roleName: 'time' },
    '시간수식': { roleWord: 'how often', roleName: 'time modifier' },
    '정도': { roleWord: 'how much', roleName: 'degree' },
    '대상': { roleWord: 'whom / what', roleName: 'object' },
    '대상수식': { roleWord: 'which (whom)', roleName: 'object modifier' },
    '장소': { roleWord: 'where', roleName: 'place' },
    '방향': { roleWord: 'where to', roleName: 'direction' },
    '양상': { roleWord: 'the tone', roleName: 'mood' },
  },
};

const MOOD_TEXT: Record<Lang, Record<Mood, MoodText>> = {
  ko: {
    declarative: { name: '평서문', note: '링이 닫혀 있고 따로 붙는 표지가 없어요.' },
    interrogative: { name: '의문문', note: '6시 방향, 링 끝에서 말려 올라간 갈고리가 물음을 뜻해요.' },
    negative: { name: '부정문', note: '6시 방향, 링을 가로지르는 굵은 막대가 부정을 뜻해요.' },
    volitional: { name: '의지문', note: '6시 방향, 바깥으로 벌어지는 두 갈래가 다짐을 뜻해요.' },
    concessive: { name: '양보문', note: '‘그럼에도’는 링이 닫히지 않고 한 바퀴를 넘어 나선으로 빠지는 것으로 그려요.' },
  },
  en: {
    declarative: { name: 'Statement', note: 'The ring is closed, with no extra mark.' },
    interrogative: { name: 'Question', note: "At 6 o'clock, a hook curling off the ring marks a question." },
    negative: { name: 'Negation', note: "At 6 o'clock, a thick bar across the ring marks negation." },
    volitional: { name: 'Intention', note: "At 6 o'clock, two prongs spreading outward mark intention." },
    concessive: { name: 'Concession', note: '‘Regardless’ is drawn as a ring that never closes, overshooting into a spiral.' },
  },
};

/** 슬롯 번호(0 = 12시) → 시계 방향 1..12. */
const hourOf = (role: Role): number => ROLE_SLOT[role] || 12;

/**
 * '자세히' 패널의 데이터. 화면은 `web/` 이 그리고, 여기서는 순수하게 계산만 한다.
 * `ui` 는 화면 글(역할·문장 종류)의 언어이고, 낱말(`word`)은 늘 문장의 언어를 따른다.
 * 묶음 키는 해독(`decode.ts`)과 같은 함수로 만들어 두 화면이 같은 묶음을 가리킨다.
 */
export function detailsOf(
  ir: IR, arr: Arrival, result: RenderResult, lex: Lexicon, text: string, ui: Lang = 'ko',
): Details {
  const lang = detectLanguage(text);
  const rows: DetailRow[] = [];
  const seen = new Set<number>();
  for (const c of ir.constituents) {
    const key = partKeyOfConstituent(c);
    const part = arr.parts.indexOf(key);
    if (part < 0 || seen.has(part)) continue;   // 같은 묶음은 한 줄만
    seen.add(part);
    rows.push({
      part,
      word: wordLabel(c, lang, lex),
      ...ROLE_TEXT[ui][c.role],
      hour: hourOf(c.role),
      strokes: result.strokes.filter((s) => partKeyOf(s) === key).length,
    });
  }
  // 12시 → 1시 → … → 11시. 같은 자리면 묶음 순서
  const clock = (h: number) => h % 12;
  rows.sort((a, b) => clock(a.hour) - clock(b.hour) || a.part - b.part);

  const mood = MOOD_TEXT[ui][ir.mood];
  const moodPart = arr.parts.indexOf(`양상|${ir.mood}`);
  return {
    sentence: text,
    moodName: mood.name,
    moodNote: mood.note,
    moodPart: moodPart < 0 ? null : moodPart,
    spelled: ir.constituents.filter((c) => c.kind === 'phonetic').length,
    rows,
  };
}
