import { describe, it, expect } from 'vitest';
import { fileNameFor } from '../../web/download';

describe('fileNameFor', () => {
  it('문장에서 파일 이름을 만든다', () => {
    expect(fileNameFor('나는 너를 사랑해', 'svg')).toBe('나는-너를-사랑해.svg');
  });

  it('파일 이름에 못 쓰는 글자를 지운다', () => {
    const name = fileNameFor('나를 사랑해? / 정말', 'png');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name.endsWith('.png')).toBe(true);
  });

  it('너무 긴 문장은 자른다', () => {
    expect(fileNameFor('가'.repeat(200), 'svg').length).toBeLessThanOrEqual(64);
  });

  it('빈 문장에도 이름이 있다', () => {
    expect(fileNameFor('   ', 'svg')).toBe('로고그램.svg');
  });
});
