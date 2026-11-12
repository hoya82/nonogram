/**
 * 화면 없이 끝까지 돌린다 — 시험·벤치마크·전략 비교용.
 * 화면 실행기와 같은 Board 규칙(applyStep)을 쓰므로 결과가 같다.
 */
import { Board, type BoardOptions } from '../nonogram/board.js';
import type { Puzzle } from '../nonogram/puzzle.js';
import { applyStep, isIdleStep } from './apply.js';
import { toGenerator } from './steps.js';
import type { SolveOutcome, SolverStep, StepSource } from './types.js';

export interface HeadlessOptions {
	/** 이 판에서 이어 푼다 (기본: 새 판) */
	readonly board?: Board;
	readonly boardOptions?: Partial<BoardOptions>;
	/** 이보다 많이 yield 하면 멈춘다 (무한 루프 방지) */
	readonly maxSteps?: number;
	/** 단계마다 불린다 */
	readonly onStep?: (step: SolverStep, index: number) => void;
}

export interface HeadlessResult {
	readonly outcome: SolveOutcome;
	readonly board: Board;
	/** yield 된 단계 수 (살펴보기 포함) */
	readonly steps: number;
	/** 판을 바꾼 단계 수 */
	readonly activeSteps: number;
	readonly ms: number;
}

export function runHeadless(
	puzzle: Puzzle,
	source: StepSource,
	opts: HeadlessOptions = {}
): HeadlessResult {
	const board = opts.board ?? new Board(puzzle, undefined, opts.boardOptions);
	const maxSteps = opts.maxSteps ?? 5_000_000;
	const it = toGenerator(source, { puzzle, board });
	const t0 = performance.now();
	let steps = 0;
	let activeSteps = 0;
	for (;;) {
		const r = it.next();
		if (r.done) {
			return { outcome: r.value, board, steps, activeSteps, ms: performance.now() - t0 };
		}
		opts.onStep?.(r.value, steps);
		applyStep(board, r.value, { source: 'solver', record: false });
		steps++;
		if (!isIdleStep(r.value)) activeSteps++;
		if (steps >= maxSteps) {
			it.return({ status: 'stopped' });
			return {
				outcome: { status: 'error', note: `단계가 ${maxSteps}개를 넘었다` },
				board,
				steps,
				activeSteps,
				ms: performance.now() - t0
			};
		}
	}
}
