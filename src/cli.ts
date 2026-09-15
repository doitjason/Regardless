import { readFileSync, writeFileSync } from 'node:fs';
import { render } from './render/compose';
import { renderForNecklace, validateNecklace, DEFAULT_NECKLACE } from './render/necklace';
import { loadLook } from './render/look';
import { loadSeedLexicon } from './core/lexicon';
import type { IR } from './core/ir';

export interface CliArgs {
  input: string;
  out: string;
  necklace: boolean;
  size?: number;
  minStrokeMm?: number;
}

const USAGE = `
사용법: npm run glyph -- --ir <IR.json> --out <out.svg> [옵션]

옵션:
  --necklace              목걸이 각인용으로 내보낸다 (최소 선폭 보정)
  --size <px>             SVG 좌표계 한 변. 화면용 기본 300, 각인용 기본 600
  --min-stroke-mm <mm>    각인 최소 선폭. 기본 ${DEFAULT_NECKLACE.minStrokeMm}
`.trim();

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get('--ir');
  const out = get('--out');
  if (!input) throw new Error(`--ir 이 필요하다\n\n${USAGE}`);
  if (!out) throw new Error(`--out 이 필요하다\n\n${USAGE}`);
  const sizeRaw = get('--size');
  const mmRaw = get('--min-stroke-mm');
  return {
    input, out,
    necklace: argv.includes('--necklace'),
    ...(sizeRaw !== undefined ? { size: Number(sizeRaw) } : {}),
    ...(mmRaw !== undefined ? { minStrokeMm: Number(mmRaw) } : {}),
  };
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs;
  try { args = parseArgs(argv); }
  catch (e) { console.error((e as Error).message); return 2; }

  let ir: IR;
  try { ir = JSON.parse(readFileSync(args.input, 'utf8')) as IR; }
  catch (e) {
    console.error(`IR 파일을 읽을 수 없다: ${args.input}\n${(e as Error).message}`);
    return 3;
  }

  const lex = loadSeedLexicon();
  const look = loadLook();
  try {
    if (args.necklace) {
      const opts = {
        ...(args.size !== undefined ? { size: args.size } : {}),
        ...(args.minStrokeMm !== undefined ? { minStrokeMm: args.minStrokeMm } : {}),
      };
      const result = renderForNecklace(ir, lex, look, opts);
      const merged = { ...DEFAULT_NECKLACE, ...opts };
      const problems = validateNecklace(result, merged);
      if (problems.length > 0) {
        console.error('각인 가능성 검증 실패:');
        for (const p of problems) console.error(`  - ${p}`);
        return 5;
      }
      writeFileSync(args.out, result.svg, 'utf8');
      console.log(`각인용 SVG를 썼다: ${args.out} (최소 선폭 ${merged.minStrokeMm}mm, 지름 ${merged.diameterMm}mm)`);
    } else {
      const result = render(ir, lex, look, args.size !== undefined ? { size: args.size } : {});
      writeFileSync(args.out, result.svg, 'utf8');
      console.log(`SVG를 썼다: ${args.out} (획 ${result.strokes.length}개, 시드 ${result.seed})`);
    }
  } catch (e) {
    console.error(`렌더 실패: ${(e as Error).message}`);
    return 4;
  }
  return 0;
}

// 직접 실행될 때만 프로세스를 종료시킨다. 테스트는 runCli 를 직접 부른다.
if (process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(await runCli(process.argv.slice(2)));
  }
}
