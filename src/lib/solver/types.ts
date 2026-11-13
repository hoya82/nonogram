/**
 * 솔버 추상화.
 *
 * 전략(Strategy)은 제너레이터다. 판을 직접 바꾸지 않고 "할 일"(SolverStep)을 yield 하면,
 * 실행기(runner)가 그 단계를 판에 적용한 뒤에 다음 next() 를 부른다. 그래서
 *
 *   - yield 와 yield 사이에 ctx.board 를 다시 읽으면 늘 최신 상태다(자동 X·사용자 손질까지 반영).
 *   - 속도·일시정지·한 단계씩은 실행기가 정한다 — 전략은 박자를 모른다.
 *   - 같은 전략을 화면(애니메이션)과 headless(시험·벤치마크)에서 그대로 돌린다.
 *   - 하위 절차는 `yield*` 로 합성한다 (예: probe 전략이 propagate 를 메모 모드로 부른다).
 *
 * 전략 계약:
 *   1. 칸을 바꾸는 일은 반드시 'paint' / 'memo-*' 단계로 yield 한다.
 *   2. 판단 근거는 yield 직후 다시 읽는다 — 이전에 복사해 둔 줄은 낡았을 수 있다.
 *   3. 끝나면 SolveOutcome 을 return 한다.
 */
import type { BoardReader, CellWrite } from '../nonogram/board.js';
import type { LineRef } from '../nonogram/line.js';
import type { Puzzle } from '../nonogram/puzzle.js';

export interface SolverContext {
	readonly puzzle: Puzzle;
	/** 살아 있는 판 — yield 뒤마다 최신 */
	readonly board: BoardReader;
}

export type SolverStep =
	/** 줄을 살펴봤지만 바꿀 것이 없다 — 화면에서 줄만 비춘다(설정에 따라 건너뛴다) */
	| { readonly kind: 'inspect'; readonly line: LineRef; readonly note?: string }
	/** 칸을 쓴다. line 이 있으면 그 줄을 비춘다 */
	| {
			readonly kind: 'paint';
			readonly writes: readonly CellWrite[];
			readonly line?: LineRef;
			readonly note?: string;
	  }
	/** 메모(가정)를 모두 지운다 */
	| { readonly kind: 'memo-clear'; readonly note?: string }
	/** 메모(가정)를 모두 확정한다 */
	| { readonly kind: 'memo-commit'; readonly note?: string }
	/** 판은 그대로, 기록만 */
	| { readonly kind: 'note'; readonly note: string }
	/**
	 * 판은 그대로, 실행기에 일시정지를 청한다 — 화면에서 결과(예: 찾은 해)를 보여 주고 기다릴 때.
	 * 계속하면 다음 단계부터 이어 간다. headless 실행기는 무시한다
	 */
	| { readonly kind: 'pause'; readonly note?: string };

export type SolverStepKind = SolverStep['kind'];

export type SolveStatus = 'solved' | 'stalled' | 'contradiction' | 'stopped' | 'error';

export interface SolveOutcome {
	readonly status: SolveStatus;
	readonly note?: string;
}

/** 전략의 제너레이터 타입. R 은 return 값 (하위 절차는 다른 값을 돌려줄 수 있다) */
export type StepGenerator<R = SolveOutcome> = Generator<SolverStep, R, void>;

export interface Strategy {
	/** 고유 id (kebab-case) */
	readonly id: string;
	readonly name: string;
	readonly description: string;
	solve(ctx: SolverContext): StepGenerator;
}

/** 타입 추론용 항등 함수 */
export function defineStrategy<const S extends Strategy>(strategy: S): S {
	return strategy;
}

/** 실행기가 받는 것 — 등록된 전략, 즉석 제너레이터 함수, 또는 단계 목록 */
export type StepSource =
	| Strategy
	| ((ctx: SolverContext) => Generator<SolverStep, SolveOutcome | void, void>)
	| Iterable<SolverStep>;
