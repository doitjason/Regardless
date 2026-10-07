/**
 * 화면 흐름의 시간 진행 (화면 경험 설계 3.1·3.2). DOM 도 WebGL 도 모른다 —
 * 시각을 받아 지금 무엇을 보여야 하는지만 답한다. 그래서 node 에서 테스트한다.
 */
export type Phase = 'idle' | 'waiting' | 'blooming' | 'settled' | 'decoding' | 'decoded';

export interface FlowTiming {
  /** 번짐 길이 (`Arrival.duration`) */
  bloomSeconds: number;
  /** 번짐이 끝나고 '해독하기' 가 뜨기까지 */
  hintSeconds: number;
  /** 낱말 하나가 빛나는 시간 */
  stepSeconds: number;
  /** 마지막 낱말 뒤 문장 전체가 뜨기까지 */
  sentenceSeconds: number;
}

export interface FrameState {
  phase: Phase;
  /** 번짐 진행 0..1 */
  prog: number;
  /** 빛날 묶음 번호, 없으면 -1 */
  highlight: number;
  /** 보여 줄 낱말 수 (해독 순서 앞에서부터) */
  labelsShown: number;
  showStart: boolean;
  showDecode: boolean;
  showSentence: boolean;
}

export class Flow {
  private phase: Phase = 'idle';
  private bloomT0 = 0;
  private decodeT0 = 0;

  constructor(
    private readonly parts: readonly number[],
    private readonly timing: FlowTiming,
    private readonly allowDecode: boolean,
  ) {}

  /** 받는 화면 — '눌러서 시작' 을 기다린다. */
  arm(): void {
    if (this.phase === 'idle') this.phase = 'waiting';
  }

  /** 번짐을 시작한다. 이미 번지는 중이거나 끝났으면 무시한다. */
  start(nowMs: number): void {
    if (this.phase !== 'idle' && this.phase !== 'waiting') return;
    this.phase = 'blooming';
    this.bloomT0 = nowMs;
  }

  /** 해독을 시작한다. '해독하기' 가 보일 때만 먹는다. */
  decode(nowMs: number): void {
    this.advance(nowMs);
    if (this.phase !== 'settled' || !this.hintReady(nowMs)) return;
    this.phase = 'decoding';
    this.decodeT0 = nowMs;
  }

  frame(nowMs: number): FrameState {
    this.advance(nowMs);
    const steps = this.parts.length;
    let highlight = -1;
    let labelsShown = 0;
    if (this.phase === 'decoding') {
      const k = Math.floor(this.since(this.decodeT0, nowMs) / this.timing.stepSeconds);
      highlight = k < steps ? (this.parts[k] ?? -1) : -1;
      labelsShown = Math.min(k + 1, steps);
    }
    if (this.phase === 'decoded') labelsShown = steps;
    const prog = this.phase === 'idle' || this.phase === 'waiting' ? 0
      : this.phase === 'blooming' ? Math.min(1, this.since(this.bloomT0, nowMs) / this.timing.bloomSeconds)
      : 1;
    return {
      phase: this.phase,
      prog,
      highlight,
      labelsShown,
      showStart: this.phase === 'waiting',
      showDecode: this.phase === 'settled' && this.hintReady(nowMs),
      showSentence: this.phase === 'decoded',
    };
  }

  /** 시간이 지나 저절로 넘어가는 단계를 넘긴다. */
  private advance(nowMs: number): void {
    if (this.phase === 'blooming' && this.since(this.bloomT0, nowMs) >= this.timing.bloomSeconds) {
      this.phase = 'settled';
    }
    if (this.phase === 'decoding') {
      const end = this.parts.length * this.timing.stepSeconds + this.timing.sentenceSeconds;
      if (this.since(this.decodeT0, nowMs) >= end) this.phase = 'decoded';
    }
  }

  private hintReady(nowMs: number): boolean {
    return this.allowDecode
      && this.since(this.bloomT0, nowMs) >= this.timing.bloomSeconds + this.timing.hintSeconds;
  }

  private since(t0: number, nowMs: number): number {
    return Math.max(0, nowMs - t0) / 1000;
  }
}
