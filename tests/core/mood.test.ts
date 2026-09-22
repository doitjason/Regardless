import { describe, it, expect } from 'vitest';
import { detectMoodKo, detectMoodEn } from '../../src/core/mood';

describe('detectMoodKo', () => {
  it('평서문이 기본이다', () => {
    expect(detectMoodKo('나는 너를 사랑해').mood).toBe('declarative');
  });

  it('물음표와 의문 어미를 잡는다', () => {
    for (const s of ['나를 사랑해?', '나를 사랑하니', '나를 사랑하나', '사랑입니까']) {
      expect(detectMoodKo(s).mood, s).toBe('interrogative');
    }
  });

  it('부정 표지를 잡는다', () => {
    for (const s of ['나는 너를 안 사랑해', '못 기다려', '사랑하지 않아']) {
      expect(detectMoodKo(s).mood, s).toBe('negative');
    }
  });

  it('의지 표지를 잡는다', () => {
    for (const s of ['너를 기다릴게', '우리 약속하자', '기다리겠다']) {
      expect(detectMoodKo(s).mood, s).toBe('volitional');
    }
  });

  it('양보 표지를 잡는다', () => {
    for (const s of ['그럼에도 불구하고 나는 너를 사랑해', '그래도 사랑해', '그럼에도 사랑해']) {
      expect(detectMoodKo(s).mood, s).toBe('concessive');
    }
  });

  it('표지어를 문장에서 덜어낸다 — 같은 뜻이 두 번 그려지면 안 된다', () => {
    const r = detectMoodKo('그럼에도 불구하고 나는 너를 사랑해');
    expect(r.rest).toBe('나는 너를 사랑해');
    expect(detectMoodKo('나는 너를 안 사랑해').rest).toBe('나는 너를 사랑해');
    expect(detectMoodKo('나를 사랑해?').rest).toBe('나를 사랑해');
  });

  it('양보가 의문·부정보다 앞선다 — 가장 바깥 태도다', () => {
    expect(detectMoodKo('그럼에도 불구하고 안 잊어').mood).toBe('concessive');
  });

  it('결정적이다', () => {
    const a = detectMoodKo('그래도 사랑해');
    expect(detectMoodKo('그래도 사랑해')).toEqual(a);
  });
});

describe('detectMoodEn', () => {
  it('평서문이 기본이다', () => {
    expect(detectMoodEn('I love you').mood).toBe('declarative');
  });

  it('물음표와 의문 조동사를 잡는다', () => {
    for (const s of ['Do you love me?', 'do you love me', 'Is it time?']) {
      expect(detectMoodEn(s).mood, s).toBe('interrogative');
    }
  });

  it('부정을 잡는다', () => {
    for (const s of ["I don't love you", 'I never forget', 'I do not wait']) {
      expect(detectMoodEn(s).mood, s).toBe('negative');
    }
  });

  it('의지를 잡는다', () => {
    for (const s of ["Let's wait", 'I will wait']) {
      expect(detectMoodEn(s).mood, s).toBe('volitional');
    }
  });

  it('양보를 잡는다', () => {
    for (const s of ['Regardless, I love you', 'Nevertheless I love you', 'Even so, I love you']) {
      expect(detectMoodEn(s).mood, s).toBe('concessive');
    }
  });

  it('표지어를 문장에서 덜어낸다', () => {
    expect(detectMoodEn('Regardless, I love you').rest.trim()).toBe('I love you');
    expect(detectMoodEn("I don't love you").rest.trim()).toBe('I love you');
  });

  it('한국어와 영어가 같은 태도를 낸다', () => {
    expect(detectMoodEn('Regardless, I love you').mood)
      .toBe(detectMoodKo('그럼에도 불구하고 나는 너를 사랑해').mood);
  });

  it('짧은 표지가 다른 낱말에 걸리지 않는다', () => {
    expect(detectMoodKo('나는 혼자').mood).toBe('declarative');
    expect(detectMoodKo('오늘은 바다').mood).toBe('declarative');
    expect(detectMoodEn('I wait in the sky').mood).toBe('declarative');
  });
});

describe('자 로 끝나는 낱말', () => {
  it('명사는 의지로 읽지 않는다', () => {
    for (const s of ['나는 혼자', '이것은 감자', '나의 모자', '저기 의자', '그 남자']) {
      expect(detectMoodKo(s).mood, s).toBe('declarative');
    }
  });

  it('아는 동사의 청유형은 의지다', () => {
    for (const s of ['우리 약속하자', '같이 가자', '이제 만나자', '조금 기다리자']) {
      expect(detectMoodKo(s).mood, s).toBe('volitional');
    }
  });
});
