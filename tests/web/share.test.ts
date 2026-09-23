import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare } from '../../web/share';
import { ENGINE_VERSION } from '../../src/version';

describe('공유 링크', () => {
  it('문장을 해시로 만들고 되읽는다', () => {
    const h = encodeShare('나는 너를 사랑해');
    expect(decodeShare(h)?.text).toBe('나는 너를 사랑해');
  });

  it('엔진 버전을 담는다', () => {
    expect(decodeShare(encodeShare('사랑'))?.version).toBe(ENGINE_VERSION);
  });

  it('한글·공백·물음표가 살아 돌아온다', () => {
    for (const s of ['그럼에도 불구하고 나는 너를 사랑해', '나를 사랑해?', 'I love you']) {
      expect(decodeShare(encodeShare(s))?.text, s).toBe(s);
    }
  });

  it('앞의 # 이 있든 없든 읽는다', () => {
    const h = encodeShare('사랑');
    expect(decodeShare(h.replace(/^#/, ''))?.text).toBe('사랑');
  });

  it('빈 해시나 엉뚱한 해시는 null 이다', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#')).toBeNull();
    expect(decodeShare('#foo=bar')).toBeNull();
  });

  it('해시에 담긴 값이 URL 로 안전하다', () => {
    // 공백과 물음표가 날것으로 남으면 링크를 복사할 때 잘린다
    const h = encodeShare('나를 사랑해?');
    // encodeShare 는 항상 앞에 '#' 를 붙이므로(해시 자체의 표식) 그 뒤만 검사한다
    expect(h.slice(1)).not.toMatch(/[ ?#]/);
  });
});
