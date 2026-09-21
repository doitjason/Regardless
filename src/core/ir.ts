import { fnv1a } from './hash';

/**
 * 문법 역할. 12슬롯 격자의 각 칸에 대응한다 (설계 문서 8.2).
 * 짝수 슬롯은 주 역할, 홀수 슬롯은 바로 앞 짝수 슬롯의 부속.
 */
export type Role =
  | '행위' | '행위수식'
  | '주체' | '주체수식'
  | '시간' | '시간수식'
  | '양상' | '정도'
  | '대상' | '대상수식'
  | '장소' | '방향';

export interface Syllable {
  /** 초성 음소 id. 빈 초성(ㅇ)은 '' */
  onset: string;
  /** 중성 음소 id */
  nucleus: string;
  /** 종성 음소 id. 없으면 '' */
  coda: string;
}

export type Constituent =
  | { kind: 'concept'; lemma: string; role: Role }
  | { kind: 'phonetic'; syllables: Syllable[]; role: Role };

/**
 * 문장 수준 양상. 6시 양상 슬롯은 오직 이 값에서만 채워지며,
 * 파서는 role이 '양상'인 Constituent를 직접 만들지 않는다 (설계 문서 6.2).
 *
 * `concessive` — 양보 — "그럼에도 불구하고". 문장 전체에 걸리는 태도이므로
 * mood 다. 주체·대상·시간·장소 어디에도 속하지 않는다.
 */
export type Mood = 'declarative' | 'interrogative' | 'negative' | 'volitional' | 'concessive';

export interface IR {
  constituents: Constituent[];
  mood: Mood;
  engineVersion: string;
}

/**
 * 성분의 안정적인 키. 정렬과 서브시드 계산에 쓴다.
 * 음절은 JSON.stringify로 직렬화해 구분자를 이스케이프한다 — 이름에서 순서는 의미를 갖는다.
 */
export function constituentKey(c: Constituent): string {
  if (c.kind === 'concept') return `concept|${c.role}|${c.lemma}`;
  const syls = JSON.stringify(c.syllables.map((s) => [s.onset, s.nucleus, s.coda]));
  return `phonetic|${c.role}|${syls}`;
}

/** 입력 순서와 무관한 고정 순회 순서. 원본을 변경하지 않는다. */
export function sortedConstituents(ir: IR): Constituent[] {
  return [...ir.constituents].sort((a, b) =>
    constituentKey(a) < constituentKey(b) ? -1 : constituentKey(a) > constituentKey(b) ? 1 : 0,
  );
}

/**
 * IR을 정규 문자열로 만든다. 성분을 정렬하므로 어순 정보가 소멸한다.
 * 이것이 `나는 너를 사랑해` == `너를 나는 사랑해` == `I love you`를 성립시키는 지점이다.
 */
export function canonicalize(ir: IR): string {
  const keys = sortedConstituents(ir).map(constituentKey);
  return JSON.stringify({ c: keys, m: ir.mood, v: ir.engineVersion });
}

/** 렌더러 의사난수의 최상위 시드. */
export function seedOf(ir: IR): number {
  return fnv1a(canonicalize(ir));
}

/**
 * 성분별 서브시드. 성분마다 독립된 난수열을 주기 때문에
 * 성분 순회 순서가 결과에 영향을 주지 않는다.
 */
export function subSeed(seed: number, key: string): number {
  return fnv1a(`${seed}|${key}`);
}
