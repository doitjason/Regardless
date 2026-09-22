import { readFileSync, writeFileSync } from 'node:fs';
import { render } from './render/compose';
import { renderForNecklace, renderCutFile, validateNecklace, DEFAULT_NECKLACE } from './render/necklace';
import { loadLook } from './render/look';
import { loadSeedLexicon } from './core/lexicon';
import { parse } from './core/parse';
import type { IR } from './core/ir';

export interface CliArgs {
  /** IR JSON 경로. `text` 와 정확히 하나만 준다. */
  input?: string;
  /** 문장. `input` 과 정확히 하나만 준다. */
  text?: string;
  out: string;
  necklace: boolean;
  /** 잘라 낼 모양 그대로 내보낸다 (제작용 정리 거침) */
  cut: boolean;
  size?: number;
  minStrokeMm?: number;
  minGapMm?: number;
}

const USAGE = `
사용법: npm run glyph -- (--text "문장" | --ir <IR.json>) --out <out.svg> [옵션]

옵션:
  --necklace              목걸이 각인용으로 내보낸다 (최소 선폭 보정)
  --cut                   투각용 컷 파일. 제작 가능하도록 정리한 모양의
                          윤곽선을 내보낸다 — 내보낸 파일이 곧 잘릴 모양이다
  --size <px>             SVG 좌표계 한 변. 화면용 기본 300, 각인용 기본 600
  --min-stroke-mm <mm>    각인 최소 선폭. 기본 ${DEFAULT_NECKLACE.minStrokeMm}
  --min-gap-mm <mm>       최소 틈. 기본 ${DEFAULT_NECKLACE.minGapMm}
`.trim();

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get('--ir');
  const text = get('--text');
  const out = get('--out');
  if (input !== undefined && text !== undefined) {
    throw new Error(`--ir 과 --text 는 둘 중 하나만 준다\n\n${USAGE}`);
  }
  if (input === undefined && text === undefined) {
    throw new Error(`--ir 또는 --text 가 필요하다\n\n${USAGE}`);
  }
  if (!out) throw new Error(`--out 이 필요하다\n\n${USAGE}`);
  const sizeRaw = get('--size');
  const mmRaw = get('--min-stroke-mm');
  const gapRaw = get('--min-gap-mm');
  let size: number | undefined;
  if (sizeRaw !== undefined) {
    size = Number(sizeRaw);
    if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(size) || size < 16) {
      throw new Error(`--size 는 16 이상의 정수여야 한다: "${sizeRaw}"\n\n${USAGE}`);
    }
  }
  let minStrokeMm: number | undefined;
  if (mmRaw !== undefined) {
    minStrokeMm = Number(mmRaw);
    if (!Number.isFinite(minStrokeMm) || minStrokeMm <= 0) {
      throw new Error(`--min-stroke-mm 은 0보다 큰 수여야 한다: "${mmRaw}"\n\n${USAGE}`);
    }
  }
  let minGapMm: number | undefined;
  if (gapRaw !== undefined) {
    minGapMm = Number(gapRaw);
    if (!Number.isFinite(minGapMm) || minGapMm <= 0) {
      throw new Error(`--min-gap-mm 은 0보다 큰 수여야 한다: "${gapRaw}"\n\n${USAGE}`);
    }
  }
  return {
    ...(input !== undefined ? { input } : {}),
    ...(text !== undefined ? { text } : {}),
    out,
    necklace: argv.includes('--necklace'),
    cut: argv.includes('--cut'),
    ...(size !== undefined ? { size } : {}),
    ...(minStrokeMm !== undefined ? { minStrokeMm } : {}),
    ...(minGapMm !== undefined ? { minGapMm } : {}),
  };
}

export async function runCli(argv: string[]): Promise<number> {
  let args: CliArgs;
  try { args = parseArgs(argv); }
  catch (e) { console.error((e as Error).message); return 2; }

  const lex = loadSeedLexicon();

  let ir: IR;
  if (args.text !== undefined) {
    try { ir = parse(args.text, lex); }
    catch (e) { console.error((e as Error).message); return 6; }
  } else {
    try { ir = JSON.parse(readFileSync(args.input!, 'utf8')) as IR; }
    catch (e) {
      console.error(`IR 파일을 읽을 수 없다: ${args.input}\n${(e as Error).message}`);
      return 3;
    }
  }

  const look = loadLook();
  try {
    if (args.cut) {
      const opts = {
        ...(args.size !== undefined ? { size: args.size } : {}),
        ...(args.minStrokeMm !== undefined ? { minStrokeMm: args.minStrokeMm } : {}),
        ...(args.minGapMm !== undefined ? { minGapMm: args.minGapMm } : {}),
      };
      const merged = { ...DEFAULT_NECKLACE, ...opts };
      // renderCutFile 은 정리 후에도 위반이 남으면 스스로 던진다 — 자기 검사를
      // 통과하지 못한 컷 파일은 쓰지 않는다.
      const { svg, cleaned, report } = renderCutFile(ir, lex, opts);
      writeFileSync(args.out, svg, 'utf8');
      console.log(`컷 파일을 썼다: ${args.out} (지름 ${merged.diameterMm}mm, 최소 선폭 ` +
        `${merged.minStrokeMm}mm, 최소 틈 ${merged.minGapMm}mm, 고리 ${cleaned.rings.length}개, ` +
        `조각 ${report.components}개, 위반 ${report.violations.length}건)`);
    } else if (args.necklace) {
      const opts = {
        ...(args.size !== undefined ? { size: args.size } : {}),
        ...(args.minStrokeMm !== undefined ? { minStrokeMm: args.minStrokeMm } : {}),
        ...(args.minGapMm !== undefined ? { minGapMm: args.minGapMm } : {}),
      };
      const result = renderForNecklace(ir, lex, opts);
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
