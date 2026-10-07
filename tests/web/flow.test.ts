import { describe, it, expect } from 'vitest';
import { Flow, type FlowTiming } from '../../web/scenes/flow';

const T: FlowTiming = { bloomSeconds: 4, hintSeconds: 1, stepSeconds: 2, sentenceSeconds: 1 };
const s = (sec: number) => sec * 1000;

describe('Flow', () => {
  it('처음엔 아무것도 없고, arm 하면 눌러서 시작만', () => {
    const f = new Flow([1, 2], T, true);
    expect(f.frame(0)).toMatchObject({ phase: 'idle', prog: 0, showStart: false });
    f.arm();
    expect(f.frame(0)).toMatchObject({ phase: 'waiting', prog: 0, showStart: true, showDecode: false });
  });

  it('누르면 번지고, 번짐이 끝나면 잠시 뒤 해독하기가 뜬다', () => {
    const f = new Flow([1, 2], T, true);
    f.arm();
    f.start(s(10));
    expect(f.frame(s(12)).prog).toBeCloseTo(0.5);
    expect(f.frame(s(12)).phase).toBe('blooming');
    expect(f.frame(s(14.5))).toMatchObject({ phase: 'settled', prog: 1, showDecode: false });
    expect(f.frame(s(15.1))).toMatchObject({ phase: 'settled', showDecode: true });
  });

  it('해독하기 전에는 decode 가 먹지 않는다', () => {
    const f = new Flow([1, 2], T, true);
    f.start(0);
    f.decode(s(2));
    expect(f.frame(s(2)).phase).toBe('blooming');
    f.decode(s(4.5));
    expect(f.frame(s(4.5)).phase).toBe('settled');
  });

  it('해독: 걸음마다 묶음이 빛나고 낱말이 하나씩, 끝나면 문장 전체', () => {
    const f = new Flow([3, 1], T, true);
    f.start(0);
    f.frame(s(6));
    f.decode(s(6));
    expect(f.frame(s(6.5))).toMatchObject({ phase: 'decoding', highlight: 3, labelsShown: 1, showDecode: false });
    expect(f.frame(s(8.5))).toMatchObject({ phase: 'decoding', highlight: 1, labelsShown: 2 });
    expect(f.frame(s(10.5))).toMatchObject({ phase: 'decoding', highlight: -1, labelsShown: 2, showSentence: false });
    expect(f.frame(s(11.1))).toMatchObject({ phase: 'decoded', highlight: -1, labelsShown: 2, showSentence: true });
  });

  it('만드는 화면(allowDecode=false)은 해독하기가 뜨지 않는다', () => {
    const f = new Flow([1], T, false);
    f.start(0);
    expect(f.frame(s(30))).toMatchObject({ phase: 'settled', showDecode: false });
    f.decode(s(30));
    expect(f.frame(s(31)).phase).toBe('settled');
  });

  it('번지는 중이나 끝난 뒤에 start 를 다시 불러도 처음부터 다시 번지지 않는다', () => {
    const f = new Flow([1], T, true);
    f.start(0);
    f.start(s(2));
    expect(f.frame(s(2)).prog).toBeCloseTo(0.5);
  });
});
