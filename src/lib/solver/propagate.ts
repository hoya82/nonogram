/**
 * 줄 전파 — 여러 전략이 함께 쓰는 하위 절차 (`yield* propagate(ctx, …)`).
 *
 * 할 일 줄 대기열에서 줄을 하나씩 꺼내 줄 풀이를 돌리고, 새로 정한 칸이 있으면 칠한 뒤
 * 그 칸을 지나는 반대 방향 줄을 대기열에 넣는다. 대기열이 비면 판 전체를 한 번 더 훑는다 —
 * 전략이 직접 하지 않은 변화(줄 완성 자동 X, 일시정지 중 사람이 고친 칸)까지 놓치지 않으려고.
 */
import { Cell } from '../nonogram/cell.js';
import {
	allLines,
	colRef,
	isLineSatisfied,
	lineClue,
	lineKey,
	lineLabel,
	lineLength,
	rowRef,
	solveLine,
	type LineDeduction,
	type LineRef
} from '../nonogram/line.js';
import { clueMinLength, type LineClue, type Puzzle } from '../nonogram/puzzle.js';
import { deductionsToWrites, inspect, paint } from './steps.js';
import type { SolverContext, SolverStep } from './types.js';

/** 줄 풀이 함수 — 바꿔 끼울 수 있다 (완전 DP, 겹치기, 직접 만든 것 …) */
export type LineSolver = (line: readonly Cell[], clue: LineClue) => LineDeduction[] | null;

export interface PropagateOptions {
	/** 메모(가정) 값으로 쓴다 */
	readonly memo?: boolean;
	/** 줄 풀이 함수 (기본: 완전 DP) */
	readonly lineSolver?: LineSolver;
	/** 처음 대기열 (기본: 모든 줄, 여유가 적은 줄 먼저) */
	readonly initial?: Iterable<LineRef>;
	/** 대기열이 비었을 때 전체를 다시 훑는다 (기본 true) */
	readonly sweep?: boolean;
	/** 기록 앞에 붙일 말 */
	readonly label?: string;
}

export type PropagateResult = 'stable' | 'contradiction' | 'solved';

/** 중복 없는 FIFO 줄 대기열 */
export class LineQueue {
	readonly #items: LineRef[] = [];
	readonly #keys = new Set<string>();
	#head = 0;

	push(ref: LineRef): void {
		const key = lineKey(ref);
		if (this.#keys.has(key)) return;
		this.#keys.add(key);
		this.#items.push(ref);
	}
	shift(): LineRef | undefined {
		if (this.#head >= this.#items.length) return undefined;
		const ref = this.#items[this.#head++];
		this.#keys.delete(lineKey(ref));
		if (this.#head > 256 && this.#head * 2 > this.#items.length) {
			this.#items.splice(0, this.#head);
			this.#head = 0;
		}
		return ref;
	}
	get size(): number {
		return this.#items.length - this.#head;
	}
}

/** 여유(줄 길이 − 최소 길이)가 적은 줄부터 — 처음에 많이 정해지는 줄 */
export function linesBySlack(p: Puzzle): LineRef[] {
	const slack = (ref: LineRef) => lineLength(p, ref) - clueMinLength(lineClue(p, ref));
	return [...allLines(p)].sort((a, b) => slack(a) - slack(b));
}

/** 줄과 칸 위치 → 그 칸을 지나는 반대 방향 줄 */
export function crossingLine(ref: LineRef, offset: number): LineRef {
	return ref.axis === 'row' ? colRef(offset) : rowRef(offset);
}

/** 모든 줄이 단서와 맞나 (메모 칠도 칠로 센다) */
export function allLinesSatisfied(ctx: SolverContext): boolean {
	for (const ref of allLines(ctx.puzzle)) {
		if (!isLineSatisfied(ctx.board.line(ref), lineClue(ctx.puzzle, ref))) return false;
	}
	return true;
}

export function describeDeductions(
	ref: LineRef,
	deductions: readonly LineDeduction[],
	prefix = ''
): string {
	let f = 0;
	let x = 0;
	for (const d of deductions) {
		if (d.value === Cell.Filled) f++;
		else x++;
	}
	const parts = [f && `칠 ${f}`, x && `X ${x}`].filter(Boolean).join(' · ');
	return `${prefix}${lineLabel(ref)}: ${parts}`;
}

export function* propagate(
	ctx: SolverContext,
	opts: PropagateOptions = {}
): Generator<SolverStep, PropagateResult, void> {
	const { puzzle, board } = ctx;
	const solve = opts.lineSolver ?? solveLine;
	const prefix = opts.label ?? (opts.memo ? '(가정) ' : '');
	const queue = new LineQueue();
	for (const ref of opts.initial ?? linesBySlack(puzzle)) queue.push(ref);

	let paintedSinceSweep = false;
	for (;;) {
		const ref = queue.shift();
		if (!ref) {
			if (opts.sweep === false || !paintedSinceSweep) break;
			paintedSinceSweep = false;
			for (const r of allLines(puzzle)) queue.push(r);
			continue;
		}
		const line = board.line(ref);
		const deductions = solve(line, lineClue(puzzle, ref));
		if (deductions === null) {
			yield inspect(ref, `${prefix}${lineLabel(ref)}: 모순 — 단서를 놓을 자리가 없다`);
			return 'contradiction';
		}
		if (deductions.length === 0) {
			yield inspect(ref);
			continue;
		}
		yield paint(
			deductionsToWrites(ref, deductions, opts.memo),
			ref,
			describeDeductions(ref, deductions, prefix)
		);
		paintedSinceSweep = true;
		for (const d of deductions) queue.push(crossingLine(ref, d.offset));
	}
	return allLinesSatisfied(ctx) ? 'solved' : 'stable';
}
