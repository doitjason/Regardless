import { describe, it, expect } from 'vitest';
import { parseKo } from '../../src/core/parse-ko';
import { parse } from '../../src/core/parse';
import { loadSeedLexicon, lookup } from '../../src/core/lexicon';
import { canonicalize, type Constituent } from '../../src/core/ir';
import { syllabify } from '../../src/core/phonology';

const lex = loadSeedLexicon();
const lookupRole = (w: string) => lookup(lex, w)?.defaultRole;
const roleOf = (cs: Constituent[], lemma: string) =>
  cs.find((c) => c.kind === 'concept' && c.lemma === lemma)?.role;

describe('parseKo', () => {
  it('은/는/이/가 는 주체다', () => {
    expect(roleOf(parseKo('나는 너를 사랑해', lex), '나')).toBe('주체');
    expect(roleOf(parseKo('내가 너를 사랑해', lex), '나')).toBe('주체');
  });

  it('을/를 은 대상이다', () => {
    expect(roleOf(parseKo('나는 너를 사랑해', lex), '너')).toBe('대상');
  });

  it('용언은 어미를 떼고 행위가 된다', () => {
    for (const s of ['나는 너를 사랑해', '나는 너를 사랑한다', '나는 너를 사랑했다', '나는 너를 사랑합니다']) {
      expect(roleOf(parseKo(s, lex), '사랑'), s).toBe('행위');
    }
  });

  it('에/에서 는 시간 낱말이면 시간, 아니면 장소다', () => {
    // 오늘(기본 역할 시간) vs 하늘(장소). 시간성 자질이 아니라 기본 역할로 가른다 (I5)
    expect(roleOf(parseKo('오늘에 사랑해', lex), '오늘')).toBe('시간');
    expect(roleOf(parseKo('하늘에서 기다림', lex), '하늘')).toBe('장소');
  });

  it('(으)로 는 방향이다', () => {
    expect(roleOf(parseKo('하늘로 기다림', lex), '하늘')).toBe('방향');
  });

  it('사전에 없는 말은 음소 폴백으로 내려간다', () => {
    const cs = parseKo('루이즈를 사랑해', lex);
    const name = cs.find((c) => c.kind === 'phonetic');
    expect(name).toBeDefined();
    expect(name!.role).toBe('대상');
    expect(name!.kind === 'phonetic' && name!.syllables.length).toBe(3);
  });

  it('조사가 없으면 사전의 기본 역할을 쓴다', () => {
    expect(roleOf(parseKo('사랑 나 너', lex), '나')).toBe('주체');
    expect(roleOf(parseKo('사랑 나 너', lex), '너')).toBe('대상');
    // 이 테스트는 '사랑' 이 나선이 되어도 통과했다 (리뷰 I7). 사랑도 잠근다.
    expect(roleOf(parseKo('사랑 나 너', lex), '사랑')).toBe('행위');
  });

  it('양상 역할을 만들지 않는다 — 6시는 mood 의 자리다', () => {
    for (const c of parseKo('의문 나는 너를 사랑해', lex)) {
      expect(c.role).not.toBe('양상');
    }
  });

  it('어순이 달라도 같은 성분을 낸다 (스펙 6.1)', () => {
    const a = parseKo('나는 너를 사랑해', lex);
    const b = parseKo('너를 나는 사랑해', lex);
    const key = (cs: Constituent[]) => cs.map((c) =>
      c.kind === 'concept' ? `${c.role}|${c.lemma}` : `${c.role}|음소`).sort().join(',');
    expect(key(b)).toBe(key(a));
  });

  it('빈 문장은 빈 배열이다', () => {
    expect(parseKo('   ', lex)).toEqual([]);
  });

  it('결정적이다', () => {
    expect(JSON.stringify(parseKo('나는 너를 사랑해', lex)))
      .toBe(JSON.stringify(parseKo('나는 너를 사랑해', lex)));
  });

  it('공동격 조사를 뗀다', () => {
    expect(roleOf(parseKo('나는 너와 바다를 보았다', lex), '너')).toBe('대상');
    expect(roleOf(parseKo('너랑 가자', lex), '너')).toBe('대상');
  });

  it('과거형 어미를 뗀다', () => {
    const cs = parseKo('나는 바다를 보았다', lex);
    expect(cs.some((c) => c.kind === 'phonetic'), JSON.stringify(cs)).toBe(false);
  });

  it('축약형을 되돌려 사전에서 찾는다', () => {
    // 기다려 = 기다리 + 어. 사전의 표제어는 명사형 '기다림' 하나뿐이다
    // (계획 III 최종 리뷰 C6) — '기다리다' 는 그 별칭이므로, 이 어절을
    // 어떻게 되돌리든 IR 에는 대표 표제어 '기다림' 만 새겨져야 한다.
    const cs = parseKo('너를 기다려', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '기다림'),
      JSON.stringify(cs)).toBe(true);
  });

  it('하다형 용언은 어근으로 찾는다', () => {
    for (const s of ['너를 사랑한다', '우리는 약속했다', '나는 선택했어']) {
      const cs = parseKo(s, lex);
      expect(cs.some((c) => c.kind === 'phonetic'), `${s}: ${JSON.stringify(cs)}`).toBe(false);
    }
  });

  it('일상 문장이 음소 폴백 없이 그려진다', () => {
    const cs = parseKo('나는 너와 함께 바다를 보았다', lex);
    expect(cs.filter((c) => c.kind === 'phonetic'), JSON.stringify(cs)).toHaveLength(0);
    expect(cs).toHaveLength(5);
  });

  it('사람 이름은 여전히 음소 폴백이다 — 되돌리기가 이름을 삼키면 안 된다', () => {
    const cs = parseKo('루이즈를 기다려', lex);
    expect(cs.some((c) => c.kind === 'phonetic' && c.syllables.length === 3)).toBe(true);
  });

  it('짐작한 어간이 엉뚱한 낱말에 걸리지 않는다', () => {
    // 보았다 → 어간 보 → 명사형 봄. 사전의 '봄' 은 계절이다. 계절로 그리느니
    // 모르는 말로 두는 편이 낫다.
    const cs = parseKo('나는 바다를 보았다', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '봄'), JSON.stringify(cs)).toBe(false);
  });

  it('짐작으로 찾은 낱말은 용언만 받는다', () => {
    // 기다림(행위)은 받고, 봄(시간)은 받지 않는다
    const wait = parseKo('너를 기다려', lex);
    expect(wait.some((c) => c.kind === 'concept' && c.lemma === '기다림')).toBe(true);
    // 음성 사례: 꾸 → 꿈(대상) 은 짐작으로 받지 않는다 (리뷰 I7 — 가드를 지우면 여기서 깨진다)
    const dream = parseKo('나는 꾸었다', lex);
    expect(dream.some((c) => c.kind === 'concept' && c.lemma === '꿈'), JSON.stringify(dream)).toBe(false);
  });

  it('어간에 붙어 줄어든 과거형을 되돌린다', () => {
    const cs = parseKo('우리는 어제 만났다', lex);
    // 사전의 표제어는 명사형 '만남' 하나뿐이다 (계획 III 최종 리뷰 C6) —
    // '만나다' 는 그 별칭이므로 IR 에는 대표 표제어만 새겨져야 한다.
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '만남'),
      JSON.stringify(cs)).toBe(true);
  });

  it('직접 찾은 낱말은 역할과 무관하게 그대로 쓴다', () => {
    // 짐작 가드가 평범한 명사 조회까지 막으면 안 된다
    expect(parseKo('봄이 왔다', lex).some((c) => c.kind === 'concept' && c.lemma === '봄')).toBe(true);
    expect(parseKo('오늘 하늘을 보았다', lex).some((c) => c.kind === 'concept' && c.lemma === '하늘')).toBe(true);
  });
});

/** 성분을 `역할:표제어` 로 줄인다. 음소 폴백은 `역할:음소(음절 수)`. */
const brief = (cs: Constituent[]) => cs.map((c) =>
  c.kind === 'concept' ? `${c.role}:${c.lemma}` : `${c.role}:음소(${c.syllables.length})`).join(' ');
const hasLemma = (cs: Constituent[], lemma: string) =>
  cs.some((c) => c.kind === 'concept' && c.lemma === lemma);
const noPhonetic = (cs: Constituent[]) => !cs.some((c) => c.kind === 'phonetic');

describe('계획 III 최종 리뷰 C1 — 자음 어간 뒤의 -ㄴ다/-는다, -아/-어', () => {
  it('받침 ㄴ 으로 녹아붙은 -ㄴ다 를 되돌린다 (본다 → 보다)', () => {
    const cs = parseKo('나는 너를 본다', lex);
    expect(brief(cs)).toBe('주체:나 대상:너 행위:보다');
  });

  it('자음 어간 뒤의 -는다 를 뗀다 (걷는다 → 걷다)', () => {
    const cs = parseKo('우리는 함께 걷는다', lex);
    expect(roleOf(cs, '걷다'), brief(cs)).toBe('행위');
    expect(noPhonetic(cs), brief(cs)).toBe(true);
  });

  it('자음 어간 뒤의 -어 를 뗀다 (먹어 → 먹다)', () => {
    const cs = parseKo('나는 밥을 먹어', lex);
    expect(roleOf(cs, '먹다'), brief(cs)).toBe('행위');
  });

  it('흔한 활용형이 모두 기본형에 닿는다', () => {
    const cases: [string, string][] = [
      ['너를 기다린다', '기다림'], ['고양이가 잔다', '자다'], ['엄마가 나를 안아', '안다'],
      ['나는 집에 간다', '가다'], ['나는 여기 산다', '살다'], ['아이가 운다', '울다'],
      ['나는 너를 믿어', '믿다'], ['나는 너를 잊었다', '잊다'], ['우리는 걸었다', '걷다'],
      ['나는 노래를 들어', '듣다'], ['너를 기다렸어', '기다림'], ['너를 봐요', '보다'],
      ['너를 사랑합니다', '사랑'], ['너를 사랑했어요', '사랑'], ['나는 태어났다', '태어나다'],
      ['너를 만나고', '만남'], ['나는 너를 생각해', '생각'],
    ];
    for (const [s, lemma] of cases) {
      const cs = parseKo(s, lex);
      expect(roleOf(cs, lemma), `${s}: ${brief(cs)}`).toBe('행위');
    }
  });

  it('형용사 어간 + -어하다 도 명사형 표제어에 닿는다', () => {
    expect(roleOf(parseKo('나는 너를 그리워한다', lex), '그리움')).toBe('행위');
    expect(roleOf(parseKo('나는 어둠을 두려워해', lex), '두려움')).toBe('행위');
  });

  it('사전에 없는 하다 용언은 어근을 행위 자리의 나선으로 둔다', () => {
    for (const s of ['나는 행복해', '나는 행복했다', '나는 행복해요']) {
      const cs = parseKo(s, lex);
      const p = cs.find((c) => c.kind === 'phonetic');
      expect(p?.role, `${s}: ${brief(cs)}`).toBe('행위');
      expect(p?.kind === 'phonetic' && p.syllables.length, `${s}: ${brief(cs)}`).toBe(2);
    }
    // 두 음절 명사는 하다 용언으로 읽지 않는다
    expect(parseKo('새해', lex)[0]?.role).toBe('대상');
  });

  it('사전에 없는 동사라도 어미가 분명하면 행위 자리에 둔다', () => {
    // 바라보다 는 사전에 없다. 조사 '보다' 로 쪼개어 '바라다' 에 닿으면 안 된다.
    const cs = parseKo('나는 너를 바라보다', lex);
    expect(hasLemma(cs, '바라다'), brief(cs)).toBe(false);
    expect(cs.find((c) => c.kind === 'phonetic')?.role, brief(cs)).toBe('행위');
    for (const s of ['달이 밝다', '안개가 꼈다', '눈이 내린다']) {
      const c = parseKo(s, lex);
      expect(c[1]?.kind === 'phonetic' && c[1].role, `${s}: ${brief(c)}`).toBe('행위');
    }
  });
});

describe('계획 III 최종 리뷰 C2 — 어절 전체를 먼저 사전에서 찾는다', () => {
  it('가을이 왔다 — 가을 의 을 은 조사가 아니다', () => {
    const cs = parseKo('가을이 왔다', lex);
    expect(roleOf(cs, '가을'), brief(cs)).toBe('주체');
    expect(hasLemma(cs, '가다'), brief(cs)).toBe(false);
    expect(roleOf(cs, '오다'), brief(cs)).toBe('행위');
  });

  it('사랑 한 낱말은 사랑이다', () => {
    expect(brief(parseKo('사랑', lex))).toBe('행위:사랑');
    expect(brief(parseKo('나의 사랑', lex))).toBe('주체수식:나 행위:사랑');
  });

  it('끝 글자가 조사와 같은 표제어가 스스로를 잃지 않는다', () => {
    for (const w of ['가을', '고양이', '아이', '깊이', '많이', '서로']) {
      const cs = parseKo(w, lex);
      expect(brief(cs), w).toBe(`${lookupRole(w)}:${w}`);
    }
  });

  it('조사가 없으면 사전의 기본 역할을 쓴다 — 사랑 도 나선이 아니다', () => {
    expect(brief(parseKo('사랑 나 너', lex))).toBe('행위:사랑 주체:나 대상:너');
  });
});

describe('계획 III 최종 리뷰 C3 — 조사를 뗀 어간에서 동사를 짐작하지 않는다', () => {
  it('살이 쪘다 — 살 은 살다 가 아니다', () => {
    const cs = parseKo('살이 쪘다', lex);
    expect(hasLemma(cs, '살다'), brief(cs)).toBe(false);
    expect(cs[0]?.role, brief(cs)).toBe('주체');
  });

  it('책 안에 있다 — 안 은 안다 가 아니다', () => {
    for (const s of ['책 안에 있다', '마음 안에', '살에', '살을', '마음 안은 따뜻해', '안을 봐']) {
      const cs = parseKo(s, lex);
      expect(hasLemma(cs, '안다') || hasLemma(cs, '살다'), `${s}: ${brief(cs)}`).toBe(false);
    }
  });

  it('조사 없이 홀로 선 받침 있는 명사도 동사로 짐작하지 않는다', () => {
    for (const s of ['살', '안', '잔']) {
      const cs = parseKo(s, lex);
      expect(cs.every((c) => c.kind === 'phonetic'), `${s}: ${brief(cs)}`).toBe(true);
    }
  });

  it('조사와 같은 모양의 관형형 어미는 기본형이 사전에 있을 때만 동사로 읽는다', () => {
    expect(brief(parseKo('사랑하는 사람', lex))).toBe('행위:사랑 대상:사람');
    expect(roleOf(parseKo('너를 기다리는 나', lex), '기다림')).toBe('행위');
    expect(roleOf(parseKo('여기 사는 고양이', lex), '살다')).toBe('행위');
  });

  it('조사 하고 는 앞말이 사전의 비행위 명사일 때만 조사다', () => {
    expect(brief(parseKo('너하고 나', lex))).toBe('대상:너 주체:나');
    expect(roleOf(parseKo('너를 사랑하고', lex), '사랑')).toBe('행위');
  });
});

describe('계획 III 최종 리뷰 I5 — 에 의 시간/장소', () => {
  it('시간 낱말만 시간이다', () => {
    expect(roleOf(parseKo('아침에 너를 만났다', lex), '아침')).toBe('시간');
    expect(roleOf(parseKo('하늘에 별이', lex), '하늘')).toBe('장소');
  });

  it('시간성 자질이 높은 행위 명사는 시간이 아니다', () => {
    for (const [s, lemma] of [['약속에', '약속'], ['기다림에', '기다림'], ['추억에', '추억']] as const) {
      expect(roleOf(parseKo(s, lex), lemma), s).not.toBe('시간');
    }
  });
});

describe('겹친 조사·복수·문장 부호', () => {
  it('보조사 뒤의 격조사를 한 번 더 뗀다', () => {
    expect(roleOf(parseKo('너에게는', lex), '너')).toBe('대상');
    expect(roleOf(parseKo('바다에서도', lex), '바다')).toBe('장소');
  });

  it('문장 부호는 낱말이 아니다', () => {
    expect(brief(parseKo('나는, 너를 사랑해.', lex))).toBe('주체:나 대상:너 행위:사랑');
  });
});

describe('짐작 가드 — 음성 사례', () => {
  it('명사형 짐작은 비행위 명사에 닿지 않는다 (꾸었다 ↛ 꿈)', () => {
    const cs = parseKo('나는 꾸었다', lex);
    expect(hasLemma(cs, '꿈'), brief(cs)).toBe(false);
  });

  it('하 떼기는 사람 명사에 닿지 않는다', () => {
    const cs = parseKo('나는 친구해', lex);
    expect(roleOf(cs, '친구'), brief(cs)).not.toBe('행위');
  });

  it('사전에 없는 명사는 짐작에 걸리지 않고 나선이 된다', () => {
    for (const s of ['잠자리', '사자', '남자', '의자', '모자', '감자', '어머니', '가지']) {
      const cs = parseKo(s, lex);
      expect(cs.every((c) => c.kind === 'phonetic'), `${s}: ${brief(cs)}`).toBe(true);
    }
  });
});

describe('3인칭 대명사와 지시 관형사 — 영어 she/he/they 와 같은 그림', () => {
  it('그녀·그·그들은 사람이다', () => {
    expect(brief(parseKo('그녀가 나를 사랑해', lex))).toBe('주체:사람 대상:나 행위:사랑');
    expect(brief(parseKo('그가 나를 사랑해', lex))).toBe('주체:사람 대상:나 행위:사랑');
    expect(brief(parseKo('나는 그를 사랑해', lex))).toBe('주체:나 대상:사람 행위:사랑');
    expect(brief(parseKo('그녀의 마음', lex))).toBe('주체수식:사람 대상:마음');
    expect(brief(parseKo('그들은 웃었다', lex))).toBe('주체:사람 행위:웃다');
  });

  it('그녀가 나를 사랑해 는 She loves me 와 같은 IR 이다', () => {
    expect(canonicalize(parse('그녀가 나를 사랑해', lex))).toBe(canonicalize(parse('She loves me', lex)));
  });

  it('명사 앞의 홀로 선 그 는 관형사다 — 그리지 않는다', () => {
    expect(brief(parse('그 사람이 나를 사랑해', lex).constituents)).toBe('주체:사람 대상:나 행위:사랑');
    expect(brief(parseKo('이 밤에 너를 기다려', lex))).toBe('시간:밤 대상:너 행위:기다림');
  });

  it('그 로 시작하는 다른 낱말은 사람이 아니다', () => {
    for (const s of ['그림', '그림을 보았다', '그럼에도', '그대가 웃는다', '그리움', '그리고']) {
      const cs = parseKo(s, lex);
      expect(hasLemma(cs, '사람'), `${s}: ${brief(cs)}`).toBe(false);
    }
    expect(parse('그럼에도 불구하고 나는 너를 사랑해', lex).constituents.some(
      (c) => c.kind === 'concept' && c.lemma === '사람')).toBe(false);
  });
});

describe('ㄹ 탈락 현재형 — 안다 는 알다', () => {
  it('Xㄴ다 의 Xㄹ다 가 사전의 용언이면 그것이다', () => {
    expect(brief(parseKo('나는 너를 안다', lex))).toBe('주체:나 대상:너 행위:알다');
    expect(roleOf(parseKo('나는 여기 산다', lex), '살다')).toBe('행위');
    expect(roleOf(parseKo('아이가 운다', lex), '울다')).toBe('행위');
    expect(roleOf(parseKo('나는 너를 알아', lex), '알다')).toBe('행위');
    expect(roleOf(parseKo('너를 아는 사람', lex), '알다')).toBe('행위');
  });

  it('안는다·안아·안았다·안고 는 여전히 안다(포옹)다', () => {
    for (const s of ['엄마가 나를 안는다', '엄마가 나를 안아', '엄마가 나를 안았다', '너를 안고']) {
      const cs = parseKo(s, lex);
      expect(roleOf(cs, '안다'), `${s}: ${brief(cs)}`).toBe('행위');
      expect(hasLemma(cs, '알다'), `${s}: ${brief(cs)}`).toBe(false);
    }
  });

  it('잃다 의 활용형', () => {
    for (const s of ['나는 너를 잃었다', '나는 너를 잃어', '나는 길을 잃었어']) {
      expect(roleOf(parseKo(s, lex), '잃다'), s).toBe('행위');
    }
  });
});

describe('-고 싶다 — 원하다 + 대상', () => {
  it('V고 싶다 는 V 가 대상, 원하다 가 행위다', () => {
    for (const s of ['나는 먹고 싶어', '나는 먹고 싶다', '나는 먹고 싶었다', '나는 먹고 싶어요', '나는 먹고 싶습니다']) {
      expect(brief(parseKo(s, lex)), s).toBe('주체:나 대상:먹다 행위:원하다');
    }
    expect(brief(parseKo('나는 너를 만나고 싶어', lex))).toBe('주체:나 대상:너 대상:만남 행위:원하다');
  });

  it('보고 싶다 는 그리움이다', () => {
    expect(brief(parseKo('나는 너를 보고 싶어', lex))).toBe('주체:나 대상:너 행위:그리움');
    expect(brief(parseKo('보고 싶었다', lex))).toBe('행위:그리움');
  });

  it('싶 이 없으면 -고 는 그냥 연결 어미다', () => {
    expect(brief(parseKo('너를 보고 웃었다', lex))).toBe('대상:너 행위:보다 행위:웃다');
  });
});

describe('심리 서술어 — 이/가 가 대상이 된다', () => {
  it('보고 싶다·그리워·좋아·미워·두려워 앞의 이/가 는 대상, 은/는 은 주체', () => {
    expect(brief(parseKo('나는 네가 보고 싶어', lex))).toBe('주체:나 대상:너 행위:그리움');
    expect(brief(parseKo('나는 네가 그리워', lex))).toBe('주체:나 대상:너 행위:그리움');
    expect(brief(parseKo('나는 네가 좋아', lex))).toBe('주체:나 대상:너 행위:좋아함');
    expect(brief(parseKo('나는 네가 미워', lex))).toBe('주체:나 대상:너 행위:미움');
    expect(brief(parseKo('나는 그가 두려워', lex))).toBe('주체:나 대상:사람 행위:두려움');
    expect(brief(parseKo('네가 좋아', lex))).toBe('대상:너 행위:좋아함');
  });

  it('-어하다 꼴은 타동사다 — 이/가 는 주체로 남는다', () => {
    expect(brief(parseKo('그녀가 너를 좋아해', lex))).toBe('주체:사람 대상:너 행위:좋아함');
    expect(brief(parseKo('네가 나를 그리워해', lex))).toBe('주체:너 대상:나 행위:그리움');
    expect(brief(parseKo('그가 너를 보고 싶어해', lex))).toBe('주체:사람 대상:너 행위:그리움');
  });

  it('좋다 는 좋아함 으로 읽을 근거가 있을 때만 좋아함 이다', () => {
    // 경험자(은/는) 가 있거나 이/가 앞말이 사람일 때만. 날씨가 좋다 는 "좋아한다" 가 아니다
    for (const s of ['날씨가 좋다', '오늘 하늘이 좋아', '꽃이 좋아']) {
      const cs = parseKo(s, lex);
      expect(hasLemma(cs, '좋아함'), `${s}: ${brief(cs)}`).toBe(false);
    }
    expect(brief(parseKo('나는 꽃이 좋아', lex))).toBe('주체:나 대상:꽃 행위:좋아함');
  });

  it('심리 서술어가 아니면 이/가 는 주체 그대로다', () => {
    expect(brief(parseKo('그녀가 나를 사랑해', lex))).toBe('주체:사람 대상:나 행위:사랑');
    expect(brief(parseKo('고양이가 잔다', lex))).toBe('주체:고양이 행위:자다');
    expect(brief(parseKo('그리움이 깊다', lex))).toMatch(/^주체:그리움 /);
  });
});

describe('목걸이 문장', () => {
  it('그럼에도 불구하고 나는 너를 사랑해 — 모든 획이 그대로다', () => {
    const ir = parse('그럼에도 불구하고 나는 너를 사랑해', lex);
    expect(ir.mood).toBe('concessive');
    expect(brief(ir.constituents)).toBe('주체:나 대상:너 행위:사랑');
  });
});

describe('기본형 되찾기', () => {
  it('과거형이 계절이 아니라 동사로 잡힌다', () => {
    const cs = parseKo('나는 바다를 보았다', lex);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '보다'), JSON.stringify(cs)).toBe(true);
    expect(cs.some((c) => c.kind === 'concept' && c.lemma === '봄')).toBe(false);
  });

  it('어간에 녹아붙은 과거형도 기본형으로 돌아온다', () => {
    expect(parseKo('봄이 왔다', lex).some((c) => c.kind === 'concept' && c.lemma === '오다')).toBe(true);
  });

  it('명사는 그대로 명사다 — 기본형 만들기가 명사를 삼키지 않는다', () => {
    expect(parseKo('봄이 왔다', lex).some((c) => c.kind === 'concept' && c.lemma === '봄')).toBe(true);
    expect(parseKo('바다를 보았다', lex).some((c) => c.kind === 'concept' && c.lemma === '바다')).toBe(true);
  });
});

describe('그 는 대명사로 읽히는 조사 앞에서만 사람이다', () => {
  const hasPerson = (s: string) =>
    parseKo(s, lex).some((c) => c.kind === 'concept' && c.lemma === '사람');

  it('그만·그로·그에·그은 은 사람이 아니다', () => {
    for (const s of ['그만', '그만 울어', '그로 인해 슬프다', '그에 따라 변한다', '그은 선']) {
      expect(hasPerson(s), s).toBe(false);
    }
  });

  it('그가·그를·그에게·그들이·그들과 는 사람이다', () => {
    for (const s of ['그가 웃는다', '그를 기다려', '그에게 말해', '그들이 왔다', '그들과 함께']) {
      expect(hasPerson(s), s).toBe(true);
    }
  });
});

describe('쉼표로 나열한 낱말과 이름 접미사 -이', () => {
  const sylOf = (w: string) => JSON.stringify(syllabify(w));
  const phoneticSyls = (cs: Constituent[]) =>
    cs.flatMap((c) => (c.kind === 'phonetic' ? [JSON.stringify(c.syllables)] : []));

  it('쉼표로 나열한 이름은 마지막 이름의 역할을 함께 받는다', () => {
    const cs = parseKo('나는 한별이, 로건이, 로하니를 사랑해', lex);
    expect(roleOf(cs, '나')).toBe('주체');
    expect(roleOf(cs, '사랑')).toBe('행위');
    const names = cs.filter((c) => c.kind === 'phonetic');
    expect(names.map((c) => c.role)).toEqual(['대상', '대상', '대상']);
    expect(phoneticSyls(cs)).toEqual([sylOf('한별'), sylOf('로건'), sylOf('로하니')]);
  });

  it('쉼표 앞뒤 공백이 있든 없든, 전각 쉼표든 같은 나열이다', () => {
    for (const s of [
      '나는 한별이,로건이,로하니를 사랑해',
      '나는 한별이，로건이，로하니를 사랑해',
      '나는 한별이 , 로건이 , 로하니를 사랑해',
    ]) {
      const cs = parseKo(s, lex);
      expect(phoneticSyls(cs), s).toEqual([sylOf('한별'), sylOf('로건'), sylOf('로하니')]);
      expect(cs.filter((c) => c.kind === 'phonetic').map((c) => c.role), s).toEqual(['대상', '대상', '대상']);
      expect(roleOf(cs, '사랑'), s).toBe('행위');
    }
  });

  it('부르는 말 -아/-야 는 이름이 아니다 — 한별아, 로하니야', () => {
    expect(phoneticSyls(parseKo('한별아, 사랑해', lex))).toEqual([sylOf('한별')]);
    expect(phoneticSyls(parseKo('한별아 사랑해', lex))).toEqual([sylOf('한별')]);
    expect(phoneticSyls(parseKo('로하니야 사랑해', lex))).toEqual([sylOf('로하니')]);
  });

  it('사전 낱말은 -아/-야 로 끝나도 자르지 않는다', () => {
    // 시드 사전의 표제어·별칭 중 아/야 로 끝나는 말은 없다 (스캔으로 확인). 그래서
    // 합성 사전으로 잠근다 — 어절 전체 조회가 부르는 말 떼기보다 먼저다.
    const base = lookup(lex, '사랑')!;
    const synth = { ...lex, 코알라: { ...base, lemma: '코알라', defaultRole: '대상' as const, aliases: [] } };
    expect(brief(parseKo('코알라 사랑해', synth))).toBe('대상:코알라 행위:사랑');
  });

  it('받침 있는 이름의 -이 는 어디서나 뗀다 — 한별이를 = 한별이,', () => {
    expect(phoneticSyls(parseKo('한별이를 사랑해', lex))).toEqual([sylOf('한별')]);
    expect(phoneticSyls(parseKo('한별이, 로건이를 사랑해', lex))).toEqual([sylOf('한별'), sylOf('로건')]);
  });

  it('받침 없는 이름은 -이 를 떼지 않는다', () => {
    expect(phoneticSyls(parseKo('로하니를 사랑해', lex))).toEqual([sylOf('로하니')]);
    expect(phoneticSyls(parseKo('미리를 사랑해', lex))).toEqual([sylOf('미리')]);
  });

  it('나열이 아닌 문장은 그대로다', () => {
    expect(brief(parseKo('나는 너를 사랑해', lex))).toBe('주체:나 대상:너 행위:사랑');
    expect(brief(parse('그럼에도 불구하고 나는 너를 사랑해', lex).constituents)).toBe('주체:나 대상:너 행위:사랑');
    expect(parse('그럼에도 불구하고 나는 너를 사랑해', lex).mood).toBe('concessive');
    // 표지어가 지워진 뒤 남은 쉼표는 나열이 아니다
    expect(brief(parse('그럼에도 불구하고, 나는 너를 사랑해', lex).constituents)).toBe('주체:나 대상:너 행위:사랑');
  });

  it('명시 조사가 붙은 항목은 쉼표가 있어도 제 역할을 지킨다', () => {
    expect(brief(parseKo('나는 바다에서, 너를 만났다', lex))).toBe('주체:나 장소:바다 대상:너 행위:만남');
  });

  it('시간 낱말은 쉼표가 있어도 시간이다', () => {
    expect(brief(parseKo('어제, 나는 너를 보았다', lex))).toBe('시간:어제 주체:나 대상:너 행위:보다');
  });

  it('조사 없는 사전 낱말도 나열이 된다 — 고양이, 꽃, 별을', () => {
    expect(brief(parseKo('나는 고양이, 꽃, 별을 사랑해', lex))).toBe('주체:나 대상:고양이 대상:꽃 대상:별 행위:사랑');
    expect(brief(parseKo('나는 바다, 하늘, 별을 사랑해', lex))).toBe('주체:나 대상:바다 대상:하늘 대상:별 행위:사랑');
  });

  it('시간 낱말만 이어진 쉼표는 나열이 아니다 — 가을, 겨울', () => {
    expect(brief(parseKo('가을, 겨울에 사랑해', lex))).toBe('시간:가을 시간:겨울 행위:사랑');
  });

  it('접속어·감탄사·부르는 말 뒤의 쉼표는 나열이 아니다 — 뒤의 주제어 역할을 베끼지 않는다', () => {
    const roleAt = (sentence: string) => parseKo(sentence, lex)[0]?.role;
    for (const w of ['그래서', '응', '있잖아', '철수']) {
      expect(roleAt(`${w}, 나는 너를 사랑해`), w).toBe('대상');   // 기준선 87f2397 과 같다
    }
    expect(brief(parseKo('철수, 나는 너를 사랑해', lex).slice(1))).toBe('주체:나 대상:너 행위:사랑');
  });

  it('용언 뒤 쉼표는 절을 가른다 — 사랑해, 너를', () => {
    expect(brief(parseKo('사랑해, 너를', lex))).toBe('행위:사랑 대상:너');
    expect(brief(parseKo('나는 사랑해, 너를', lex))).toBe('주체:나 행위:사랑 대상:너');
  });

  it('사전 낱말은 -이 를 떼지 않는다', () => {
    expect(brief(parseKo('고양이를 사랑해', lex))).toBe('대상:고양이 행위:사랑');
    expect(brief(parseKo('고양이, 한별이를 사랑해', lex).slice(0, 1))).toBe('대상:고양이');
  });
});
