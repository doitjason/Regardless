import raw from '../design/screen.json';
import type { ArrivalTiming } from '../src/render/arrival';

const TIMING_KEYS = ['ringSeconds', 'depthSecondsPerUnit', 'flowSpeed', 'jitterSeconds', 'tailSeconds'] as const;

/**
 * 화면 전용 수치를 읽는다. `loadLook` 과 같은 계약 — 빠진 키도, 선언되지
 * 않은 숫자 키도 던진다. 문서용 키는 값의 타입(문자열)으로 가려낸다.
 */
export function loadScreen(source: Record<string, unknown> = raw as Record<string, unknown>): { timing: ArrivalTiming } {
  const missing = TIMING_KEYS.filter((k) => typeof source[k] !== 'number' || !Number.isFinite(source[k]));
  if (missing.length > 0) throw new Error(`screen.json 에 없거나 숫자가 아닌 값: ${missing.join(', ')}`);
  const extra = Object.keys(source).filter(
    (k) => typeof source[k] === 'number' && !(TIMING_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) throw new Error(`screen.json 에 선언되지 않은 값: ${extra.join(', ')}`);
  const timing = {} as ArrivalTiming;
  for (const k of TIMING_KEYS) timing[k] = source[k] as number;
  return { timing };
}
