import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, runCli } from '../src/cli';

const tmp = mkdtempSync(join(tmpdir(), 'heptapod-cli-'));
const created: string[] = [];
const outPath = (name: string): string => {
  const p = join(tmp, name);
  created.push(p);
  return p;
};
afterEach(() => { for (const p of created.splice(0)) if (existsSync(p)) rmSync(p); });

describe('parseArgs', () => {
  it('필수 인자를 읽는다', () => {
    const a = parseArgs(['--ir', 'a.json', '--out', 'b.svg']);
    expect(a.input).toBe('a.json');
    expect(a.out).toBe('b.svg');
    expect(a.necklace).toBe(false);
  });

  it('--necklace 플래그를 읽는다', () => {
    expect(parseArgs(['--ir','a.json','--out','b.svg','--necklace']).necklace).toBe(true);
  });

  it('--size 와 --min-stroke-mm 을 숫자로 읽는다', () => {
    const a = parseArgs(['--ir','a.json','--out','b.svg','--size','512','--min-stroke-mm','0.8']);
    expect(a.size).toBe(512);
    expect(a.minStrokeMm).toBeCloseTo(0.8, 6);
  });

  it('--ir 이 없으면 던진다', () => {
    expect(() => parseArgs(['--out','b.svg'])).toThrow(/--ir/);
  });

  it('--out 이 없으면 던진다', () => {
    expect(() => parseArgs(['--ir','a.json'])).toThrow(/--out/);
  });

  it('--size 가 숫자가 아니면 던진다', () => {
    expect(() => parseArgs(['--ir','a.json','--out','b.svg','--size','abc'])).toThrow(/--size/);
  });

  it('--size 가 0이면 던진다', () => {
    expect(() => parseArgs(['--ir','a.json','--out','b.svg','--size','0'])).toThrow(/--size/);
  });

  it('--min-stroke-mm 이 음수면 던진다', () => {
    expect(() => parseArgs(['--ir','a.json','--out','b.svg','--min-stroke-mm','-1'])).toThrow(/--min-stroke-mm/);
  });
});

describe('runCli', () => {
  it('화면용 SVG 파일을 쓰고 0을 반환한다', async () => {
    const out = outPath('screen.svg');
    expect(await runCli(['--ir','fixtures/love-louise.ir.json','--out',out])).toBe(0);
    const svg = readFileSync(out, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 300 300"');
  });

  it('--necklace 로 각인용 SVG를 쓴다', async () => {
    const out = outPath('necklace.svg');
    expect(await runCli(['--ir','fixtures/love-louise.ir.json','--out',out,'--necklace'])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('viewBox="0 0 600 600"');
  });

  it('두 번 실행하면 바이트 단위로 같은 파일을 쓴다 — 원칙 1', async () => {
    const a = outPath('det-a.svg'), b = outPath('det-b.svg');
    await runCli(['--ir','fixtures/love-louise.ir.json','--out',a,'--necklace']);
    await runCli(['--ir','fixtures/love-louise.ir.json','--out',b,'--necklace']);
    expect(readFileSync(a,'utf8')).toBe(readFileSync(b,'utf8'));
  });

  it('없는 파일을 주면 0이 아닌 코드를 반환한다', async () => {
    expect(await runCli(['--ir','fixtures/없음.json','--out',outPath('x.svg')])).not.toBe(0);
  });

  it('사전에 없는 표제어가 있으면 0이 아닌 코드를 반환한다', async () => {
    const bad = outPath('bad.ir.json');
    writeFileSync(bad, JSON.stringify({
      constituents: [{ kind: 'concept', lemma: '없는말', role: '행위' }],
      mood: 'declarative', engineVersion: '1.0.0',
    }));
    expect(await runCli(['--ir',bad,'--out',outPath('y.svg')])).not.toBe(0);
  });
});

describe('--text', () => {
  it('문장을 받아 SVG 를 쓴다', async () => {
    const out = outPath('text.svg');
    expect(await runCli(['--text', '나는 너를 사랑해', '--out', out])).toBe(0);
    expect(readFileSync(out, 'utf8').startsWith('<svg')).toBe(true);
  });

  it('같은 뜻의 두 언어가 같은 파일을 낸다', async () => {
    const a = outPath('text-ko.svg'), b = outPath('text-en.svg');
    await runCli(['--text', '나는 너를 사랑해', '--out', a]);
    await runCli(['--text', 'I love you', '--out', b]);
    expect(readFileSync(b, 'utf8')).toBe(readFileSync(a, 'utf8'));
  });

  it('--ir 과 --text 를 함께 주면 던진다', () => {
    expect(() => parseArgs(['--ir', 'a.json', '--text', '사랑', '--out', 'b.svg']))
      .toThrow(/하나/);
  });

  it('둘 다 없으면 던진다', () => {
    expect(() => parseArgs(['--out', 'b.svg'])).toThrow(/--ir|--text/);
  });

  it('그릴 것이 없는 문장은 종료 코드로 알린다', async () => {
    expect(await runCli(['--text', '   ', '--out', outPath('empty.svg')])).not.toBe(0);
  });
});

describe('--cut', () => {
  it('플래그를 읽는다', () => {
    expect(parseArgs(['--ir','a.json','--out','b.svg','--cut']).cut).toBe(true);
    expect(parseArgs(['--ir','a.json','--out','b.svg']).cut).toBe(false);
  });

  it('투각용 컷 파일을 쓴다 — 정리한 모양의 윤곽선이다', async () => {
    const out = outPath('cut.svg');
    expect(await runCli(['--ir','fixtures/regardless.ir.json','--out',out,'--cut'])).toBe(0);
    const svg = readFileSync(out, 'utf8');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('<metadata>');
  });

  it('같은 입력은 같은 컷 파일을 낸다 (원칙 1)', async () => {
    const a = outPath('cut-a.svg'), b = outPath('cut-b.svg');
    await runCli(['--ir','fixtures/regardless.ir.json','--out',a,'--cut']);
    await runCli(['--ir','fixtures/regardless.ir.json','--out',b,'--cut']);
    expect(readFileSync(b, 'utf8')).toBe(readFileSync(a, 'utf8'));
  });
});
