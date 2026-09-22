import type { Constituent, Role } from './ir';
import { lookup, type Lexicon } from './lexicon';
import { syllabify } from './phonology';

/**
 * 한국어 → 성분 (설계 문서 7.3).
 *
 * 형태소 분석기를 외부 의존성으로 들이지 않는다. 브라우저에서 돌아야 하고,
 * 결정적이어야 하기 때문이다. 어절을 공백으로 자르고 조사·어미 표에 맞춘다.
 *
 * `mood` 는 여기서 보지 않는다 — `detectMoodKo` 가 먼저 표지어를 덜어낸
 * 문장이 들어온다.
 */

/** 조사 → 역할. 긴 것부터 검사한다 (에서 가 에 보다 먼저). */
const PARTICLES: { suffix: string; role: Role | '에' }[] = [
  { suffix: '에서', role: '장소' },
  { suffix: '에게', role: '대상' },
  { suffix: '한테', role: '대상' },
  { suffix: '으로', role: '방향' },
  { suffix: '로', role: '방향' },
  { suffix: '는', role: '주체' },
  { suffix: '은', role: '주체' },
  { suffix: '가', role: '주체' },
  { suffix: '이', role: '주체' },
  { suffix: '를', role: '대상' },
  { suffix: '을', role: '대상' },
  { suffix: '에', role: '에' },   // 시간/장소 중의 — 자질로 가른다
  { suffix: '의', role: '주체수식' },
  { suffix: '도', role: '주체' },
  { suffix: '만', role: '대상' },
];

/** 용언 어미. 긴 것부터 떼어 낸다. */
const ENDINGS = [
  '합니다', '했습니다', '하겠습니다', '한다', '했다', '하다', '해요', '했어요',
  '하고', '하며', '해서', '하면', '해', '했', '하', '이다', '입니다', '이야',
];

/**
 * 대명사 이형태 → 기본형. 조사 앞에서 형태가 바뀌는 대명사들이다
 * (나+가 → 내가, 너+가 → 네가, 저+가 → 제가). `stripParticle` 이 조사만
 * 떼고 나면 이 이형태가 어간 자리에 남는다.
 *
 * `PARTICLES` 표에 `'내가'` 같은 통짜 항목을 추가하지 않는 이유: 그러면
 * 조사 규칙이 아니라 대명사 하나를 위한 특수 사례가 조사 표에 섞여
 * 들어간다. 조사 분리는 조사 분리대로 하고, 분리 후 어간을 정규화하는
 * 별도의 작은 표로 두는 편이 각 표의 책임을 분명히 한다.
 */
const PRONOUN_VARIANTS: Record<string, string> = {
  '내': '나',
  '네': '너',
  '제': '저',
};

const isHangul = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0xac00 && c <= 0xd7a3;
};

/** 어절에서 조사를 떼어 낸다. 떼지 못하면 role 은 null. */
function stripParticle(word: string): { stem: string; role: Role | '에' | null } {
  for (const { suffix, role } of PARTICLES) {
    if (word.length > suffix.length && word.endsWith(suffix)) {
      return { stem: word.slice(0, -suffix.length), role };
    }
  }
  return { stem: word, role: null };
}

/** 용언 어미를 떼어 낸다. 뗀 적이 있으면 행위 후보다. */
function stripEnding(word: string): { stem: string; verb: boolean } {
  for (const e of ENDINGS) {
    if (word.length > e.length && word.endsWith(e)) {
      return { stem: word.slice(0, -e.length), verb: true };
    }
  }
  return { stem: word, verb: false };
}

export function parseKo(text: string, lex: Lexicon): Constituent[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: Constituent[] = [];

  for (const word of words) {
    // 1) 조사 → 역할
    const { stem: afterParticle, role: particleRole } = stripParticle(word);
    // 2) 조사가 없으면 용언 어미를 본다
    const { stem: strippedStem, verb } = particleRole === null
      ? stripEnding(afterParticle)
      : { stem: afterParticle, verb: false };

    // 3) 조사 뒤에 남은 대명사 이형태를 기본형으로 되돌린다 (내→나, 네→너, 제→저)
    const stem = PRONOUN_VARIANTS[strippedStem] ?? strippedStem;

    const entry = lookup(lex, stem);

    let role: Role;
    if (particleRole === '에') {
      // `에` 의 시간/장소 중의성은 어휘의 시간성 자질로 가른다 (스펙 7.3).
      // 미등재어에는 자질이 없으므로 장소로 기본 처리한다 — 대부분 고유명사이고,
      // 고유명사에 붙는 `에` 는 장소일 가능성이 높다.
      role = entry && entry.features.temporality >= 0.6 ? '시간' : '장소';
    } else if (particleRole !== null) {
      role = particleRole;
    } else if (verb) {
      role = '행위';
    } else if (entry) {
      role = entry.defaultRole;
    } else {
      role = '대상';
    }

    // 파서는 양상 역할을 만들지 않는다 (스펙 6.2). 사전의 기본 역할이 양상이면
    // 대상으로 내린다 — 6시 슬롯은 오직 mood 에서만 채워진다.
    if (role === '양상') role = '대상';

    if (entry) {
      out.push({ kind: 'concept', lemma: stem, role });
      continue;
    }
    const syllables = syllabify(stem);
    if (syllables.length > 0) {
      out.push({ kind: 'phonetic', syllables, role });
    } else if ([...stem].some(isHangul)) {
      // 한글이 섞였는데 음절이 없는 경우는 없다. 방어적으로 건너뛴다.
      continue;
    }
  }

  return out;
}
