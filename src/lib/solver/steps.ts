/** 단계 만들기 도우미 — 콘솔에서 손으로 단계를 만들 때도 쓴다 */
import { Cell, isMemo } from '../nonogram/cell.js';
import type { CellWrite, Point } from '../nonogram/board.js';
import {
	colRef,
	isLineSatisfied,
	lineCoord,
	rowRef,
	type LineDeduction,
	type LineRef
} from '../nonogram/line.js';
import type {
	SolveOutcome,
	SolverContext,
	SolverStep,
	StepGenerator,
	StepSource,
	Strategy
} from './types.js';

export const inspect = (line: LineRef, note?: string): SolverStep => ({
	kind: 'inspect',
	line,
	note
});

export const paint = (writes: readonly CellWrite[], line?: LineRef, note?: string): SolverStep => ({
	kind: 'paint',
	writes,
	line,
	note
});

export const fill = (at: Point, note?: string): SolverStep =>
	paint([{ ...at, value: Cell.Filled }], undefined, note);
export const cross = (at: Point, note?: string): SolverStep =>
	paint([{ ...at, value: Cell.Crossed }], undefined, note);

export const memoClear = (note?: string): SolverStep => ({ kind: 'memo-clear', note });
export const memoCommit = (note?: string): SolverStep => ({ kind: 'memo-commit', note });
export const note = (text: string): SolverStep => ({ kind: 'note', note: text });

/** 줄 풀이 결과 → 칸 쓰기. memo 면 메모 값으로 */
export function deductionsToWrites(
	ref: LineRef,
	deductions: readonly LineDeduction[],
	memo = false
): CellWrite[] {
	return deductions.map((d) => {
		const value = memo ? (d.value === Cell.Filled ? Cell.MemoFilled : Cell.MemoCrossed) : d.value;
		return { ...lineCoord(ref, d.offset), value };
	});
}

export function isStrategy(src: StepSource): src is Strategy {
	return (
		typeof src === 'object' && src !== null && 'solve' in src && typeof src.solve === 'function'
	);
}

/** 무엇이 오든 SolveOutcome 을 돌려주는 제너레이터로 */
export function toGenerator(src: StepSource, ctx: SolverContext): StepGenerator {
	if (isStrategy(src)) return src.solve(ctx);
	if (typeof src === 'function') {
		return (function* (): StepGenerator {
			const r = yield* src(ctx);
			return r ?? finalOutcome(ctx);
		})();
	}
	return (function* (): StepGenerator {
		yield* src;
		return finalOutcome(ctx, '단계 목록 끝');
	})();
}

/** 판이 다 풀렸나 — 모든 줄이 단서와 맞고 메모가 없다 */
export function isBoardSolved(ctx: SolverContext): boolean {
	const { puzzle, board } = ctx;
	for (let y = 0; y < puzzle.height; y++) {
		const line = board.line(rowRef(y));
		if (line.some(isMemo) || !isLineSatisfied(line, puzzle.rows[y])) return false;
	}
	for (let x = 0; x < puzzle.width; x++) {
		if (!isLineSatisfied(board.line(colRef(x)), puzzle.cols[x])) return false;
	}
	return true;
}

/** 끝났을 때의 결과 — 풀렸으면 solved, 아니면 stalled */
export function finalOutcome(ctx: SolverContext, note?: string): SolveOutcome {
	return isBoardSolved(ctx) ? { status: 'solved', note } : { status: 'stalled', note };
}
