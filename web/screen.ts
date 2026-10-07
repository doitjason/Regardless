import raw from '../design/screen.json';
import type { ArrivalTiming } from '../src/render/arrival';

const TIMING_KEYS = ['ringSeconds', 'depthSecondsPerUnit', 'flowSpeed', 'jitterSeconds', 'tailSeconds'] as const;
const DECODE_KEYS = ['decodeHintSeconds', 'decodeStepSeconds', 'decodeSentenceSeconds'] as const;
const ALL_KEYS: readonly string[] = [...TIMING_KEYS, ...DECODE_KEYS];
/** 나누는 수라 0 도 안 되는 값 */
const POSITIVE: readonly string[] = ['flowSpeed', 'decodeStepSeconds'];

/** 해독 시간 (화면 경험 설계 3.1). */
export interface DecodeTiming {
  /** 번짐이 끝나고 '해독하기' 가 뜨기까지 */
  hintSeconds: number;
  /** 낱말 하나가 빛나는 시간 */
  stepSeconds: number;
  /** 마지막 낱말 뒤 문장 전체가 뜨기까지 */
  sentenceSeconds: number;
}

/**
 * 화면 전용 수치를 읽는다. `loadLook` 과 같은 계약 — 빠진 키도, 선언되지
 * 않은 숫자 키도 던진다. 문서용 키는 값의 타입(문자열)으로 가려낸다.
 */
export function loadScreen(
  source: Record<string, unknown> = raw as Record<string, unknown>,
): { timing: ArrivalTiming; decode: DecodeTiming } {
  const missing = ALL_KEYS.filter((k) => typeof source[k] !== 'number' || !Number.isFinite(source[k]));
  if (missing.length > 0) throw new Error(`screen.json 에 없거나 숫자가 아닌 값: ${missing.join(', ')}`);
  const extra = Object.keys(source).filter((k) => typeof source[k] === 'number' && !ALL_KEYS.includes(k));
  if (extra.length > 0) throw new Error(`screen.json 에 선언되지 않은 값: ${extra.join(', ')}`);
  for (const k of ALL_KEYS) {
    const v = source[k] as number;
    const positive = POSITIVE.includes(k);
    if (positive ? !(v > 0) : !(v >= 0)) {
      throw new Error(`screen.json 의 ${k} 는 ${positive ? '0 보다 커야' : '0 이상이어야'} 합니다: ${v}`);
    }
  }
  const timing = {} as ArrivalTiming;
  for (const k of TIMING_KEYS) timing[k] = source[k] as number;
  const decode: DecodeTiming = {
    hintSeconds: source.decodeHintSeconds as number,
    stepSeconds: source.decodeStepSeconds as number,
    sentenceSeconds: source.decodeSentenceSeconds as number,
  };
  return { timing, decode };
}
