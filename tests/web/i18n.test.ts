import { describe, it, expect } from 'vitest';
import { UI, initialLang, saveLang } from '../../web/i18n';

describe('i18n', () => {
  it('UI.ko 와 UI.en 의 키 집합이 같다', () => {
    expect(Object.keys(UI.en).sort()).toEqual(Object.keys(UI.ko).sort());
  });

  it('모든 글이 비어 있지 않다', () => {
    for (const lang of ['ko', 'en'] as const) {
      for (const [key, v] of Object.entries(UI[lang])) {
        const text = typeof v === 'function' ? (v as (x: never) => string)(3 as never) : v;
        expect(String(text).length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('획·시 표현', () => {
    expect(UI.ko.strokes(3)).toBe('획 3');
    expect(UI.en.strokes(3)).toBe('3 strokes');
    expect(UI.ko.hour(6)).toBe('6시');
    expect(UI.en.hour(6)).toBe("6 o'clock");
  });

  it('기본 문장은 언어에 맞다', () => {
    expect(UI.ko.defaultSentence).toBe('그럼에도 불구하고 나는 너를 사랑한다');
    expect(UI.en.defaultSentence).toBe('Regardless, I love you');
  });

  it('initialLang 은 localStorage 가 없는 노드에서도 던지지 않는다', () => {
    expect(['ko', 'en']).toContain(initialLang());
    expect(() => saveLang('en')).not.toThrow();
  });

  it('저장된 값이 있으면 그것을, 막힌 저장소에서도 던지지 않는다', () => {
    const g = globalThis as Record<string, unknown>;
    const keep = Object.getOwnPropertyDescriptor(g, 'localStorage');
    try {
      const store = new Map<string, string>();
      Object.defineProperty(g, 'localStorage', {
        configurable: true,
        value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
      });
      saveLang('ko');
      expect(initialLang()).toBe('ko');
      saveLang('en');
      expect(initialLang()).toBe('en');
      store.set('regardless-lang', 'fr');   // 알 수 없는 값은 무시하고 브라우저 언어로
      expect(['ko', 'en']).toContain(initialLang());
      Object.defineProperty(g, 'localStorage', {
        configurable: true,
        get() { throw new Error('blocked'); },
      });
      expect(() => initialLang()).not.toThrow();
      expect(() => saveLang('ko')).not.toThrow();
    } finally {
      if (keep) Object.defineProperty(g, 'localStorage', keep); else delete g.localStorage;
    }
  });
});
