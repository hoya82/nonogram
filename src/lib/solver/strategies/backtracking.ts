/**
 * 전략 5 — 완전 탐색 (backtracking).
 *
 *   1. 줄 전파 — 반드시 칠/X 인 칸을 판에 칠한다.
 *   2. 가정 & 모순(탐침)을 고정점까지 — 여기까지 정해진 칸도 모든 해에 공통이라 판에 칠/X 로 칠한다.
 *   3. 깊이 우선 탐색 — 칸 하나를 칠 / X 로 나눠 내려가며 노드마다 전파·탐침한다. 지금 가지의 가정과 그 결과를
 *      주황 메모로 그린다. 모순이 난 가지는 버리고 되돌아간다(메모가 걷힌다).
 *   4. 해를 찾으면 칠/X 로 보여 주고(판이 "완성") 실행기를 일시정지한다. 계속하면 그 해를 다시 메모로 돌리고
 *      남은 가지에서 다음 해를 찾는다 — 해마다 앞 해와 다른 칸을 기록한다. 해 수 한도는 없다(기본).
 *   5. 가지를 다 보면 끝 — 마지막에 찾은 해를 판에 남긴다. 해를 보여 주는 중에 정지하면 그 해가 남는다.
 *
 * 결과: 유일해 / 해가 여럿(정확한 수, 한도를 주었으면 "한도까지") → solved, 해 없음(모든 가지가 모순) → contradiction.
 * 버린 가지마다 모순이라는 증명이 있으므로 이 판정은 확률이 아니라 증명이다.
 *
 * 판에 이미 있는 칠/X 는 주어진 조건으로 본다 — 잘못 칠한 칸이 있으면 "해 없음" 이 나온다. 메모는 지우고 시작한다.
 * 탐색 계산은 ../backtrack.ts (판·단계와 무관한 순수 모듈).
 *
 * 구조 예시: 되돌아가는 탐색을 메모 차이(diff)로 그리고, `pause` 단계로 결과를 보여 주며 기다리는 전략.
 * 계산이 길어지면 빈 단계를 내서 박자를 돌려준다.
 */
import type { CellWrite } from '../../nonogram/board.js';
import { Cell, isMemo } from '../../nonogram/cell.js';
import { clueSum } from '../../nonogram/puzzle.js';
import { BacktrackSearch, type BacktrackOptions, type SearchSummary } from '../backtrack.js';
import { propagate } from '../propagate.js';
import { finalOutcome, memoClear, note, paint, pause } from '../steps.js';
import {
	defineStrategy,
	type SolveOutcome,
	type SolverContext,
	type SolverStep,
	type Strategy
} from '../types.js';

export interface BacktrackingStrategyOptions extends Partial<BacktrackOptions> {
	/**
	 * 계산이 이 시간(ms)보다 오래 이어지면 빈 단계를 하나 낸다 — 실행기가 프레임을 넘길 기회 (기본 25).
	 * Infinity 면 내지 않는다 — 단계 수가 시각과 무관해진다(시험용).
	 */
	readonly breatheMs?: number;
	/** 해를 찾을 때마다 실행기를 일시정지한다 (기본 true). 계속하면 다음 해를 찾는다. headless 는 무시 */
	readonly pauseOnSolution?: boolean;
}

type Gen<R> = Generator<SolverStep, R, void>;

/** 앞 해와 다른 칸을 기록에 몇 개까지 적나 */
const DIFF_LIST = 12;

/** 지금 판에 메모 칸이 있나 */
function hasMemo(ctx: SolverContext): boolean {
	const { board } = ctx;
	for (let y = 0; y < board.height; y++) {
		for (let x = 0; x < board.width; x++) if (isMemo(board.get(x, y))) return true;
	}
	return false;
}

export function* solveBacktracking(
	ctx: SolverContext,
	opts: BacktrackingStrategyOptions = {}
): Gen<SolveOutcome> {
	const { puzzle, board } = ctx;
	const W = puzzle.width;
	const N = puzzle.width * puzzle.height;
	const at = (i: number) => `(${(i % W) + 1},${Math.floor(i / W) + 1})`;
	const breatheMs = opts.breatheMs ?? 25;
	const pauseOnSolution = opts.pauseOnSolution ?? true;

	if (hasMemo(ctx)) yield memoClear('기존 메모를 지운다 — 탐색 중인 가정을 메모로 그린다');

	const rowSum = puzzle.rows.reduce((s, c) => s + clueSum(c), 0);
	const colSum = puzzle.cols.reduce((s, c) => s + clueSum(c), 0);
	if (rowSum !== colSum) {
		yield note(`행 단서 합(${rowSum}) ≠ 열 단서 합(${colSum})`);
		return {
			status: 'contradiction',
			note: `해 없음 — 행 단서 합(${rowSum}) ≠ 열 단서 합(${colSum})`
		};
	}

	// ── 1. 줄 전파 ──
	yield note('1. 줄 전파 — 반드시 칠/X 인 칸을 칠한다');
	const lp = yield* propagate(ctx, { label: '(확정) ' });
	if (lp === 'contradiction')
		return { status: 'contradiction', note: '해 없음 — 줄 전파에서 모순' };
	if (lp === 'solved') return finalOutcome(ctx, '유일해 — 줄 전파만으로 모든 칸이 정해졌다');

	// ── 2~5. 탐침 + 깊이 우선 탐색 (순수 모듈) ──
	/** 모든 해에 공통인 칸 (주어진 칸 + 줄 전파 + 뿌리 탐침) — 탐색 내내 손대지 않는다 */
	const fixed = new Uint8Array(N);
	const start = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		const v = board.get(i % W, Math.floor(i / W));
		if (v === Cell.Filled || v === Cell.Crossed) {
			start[i] = v;
			fixed[i] = 1;
		}
	}
	const search = new BacktrackSearch(puzzle, {
		...opts,
		maxSolutions: opts.maxSolutions ?? Infinity
	});
	const { maxSolutions } = search.options;
	const it = search.run(start);

	/** 판(공통 칸 제외)을 격자 g 에 맞추는 쓰기 — 가정은 메모로, solid 면 해를 칠/X 로 */
	const display = (g: Uint8Array, solid = false): CellWrite[] => {
		const writes: CellWrite[] = [];
		for (let i = 0; i < N; i++) {
			if (fixed[i]) continue;
			let want: Cell = Cell.Unknown;
			if (g[i] === Cell.Filled) want = solid ? Cell.Filled : Cell.MemoFilled;
			else if (g[i] === Cell.Crossed) want = solid ? Cell.Crossed : Cell.MemoCrossed;
			const x = i % W;
			const y = Math.floor(i / W);
			if (board.get(x, y) !== want) writes.push({ x, y, value: want });
		}
		return writes;
	};

	let last: Uint8Array | null = null;
	let branched = false;
	let computeMs = 0;
	let lastYield = performance.now();
	/** 한 단계를 내고, 돌아온 시각을 기록한다 */
	function* emit(step: SolverStep): Gen<void> {
		yield step;
		lastYield = performance.now();
	}

	let summary: SearchSummary;
	for (;;) {
		const t0 = performance.now();
		const r = it.next();
		computeMs += performance.now() - t0;
		if (r.done) {
			summary = r.value;
			break;
		}
		const e = r.value;
		switch (e.kind) {
			case 'tick':
				if (performance.now() - lastYield >= breatheMs) yield* emit(paint([]));
				break;

			case 'root': {
				if (!e.grid) break;
				const writes: CellWrite[] = [];
				for (let i = 0; i < N; i++) {
					if (fixed[i] || e.grid[i] === Cell.Unknown) continue;
					fixed[i] = 1;
					writes.push({ x: i % W, y: Math.floor(i / W), value: e.grid[i] as Cell });
				}
				const text = `2. (확정) 가정 & 모순으로 +${writes.length}칸 — 모든 해에 공통 · ${e.known}/${N}칸`;
				yield* emit(writes.length ? paint(writes, undefined, text) : note(text));
				if (e.known < N)
					yield* emit(note(`3. 깊이 우선 탐색 — 남은 ${N - e.known}칸을 가정으로 나눈다`));
				break;
			}

			case 'assume': {
				branched = true;
				const label = `깊이 ${e.depth}: ${at(e.cell)} = ${e.value === Cell.Filled ? '칠' : 'X'}`;
				if (!e.grid) {
					// 부모 격자에 가정한 칸만 얹어 보인다 — 다음 단계에서 걷힌다
					const g = e.parent.slice();
					g[e.cell] = e.value;
					yield* emit(paint(display(g), undefined, `${label} 가정 → 모순, 버린다`));
				} else {
					yield* emit(paint(display(e.grid), undefined, `${label} 가정 → ${e.known}/${N}칸`));
				}
				break;
			}

			case 'solution': {
				const k = e.index + 1;
				let text = `해 ${k} — 모든 줄이 단서와 맞는다`;
				if (last) {
					const diff: number[] = [];
					for (let i = 0; i < N; i++) if (last[i] !== e.grid[i]) diff.push(i);
					const list =
						diff.slice(0, DIFF_LIST).map(at).join(' ') + (diff.length > DIFF_LIST ? ' …' : '');
					text += ` · 앞 해와 ${diff.length}칸이 다르다: ${list}`;
				}
				last = e.grid;
				yield* emit(paint(display(e.grid, true), undefined, text));
				// 가정 없이 풀렸으면(유일해) 또는 한도에 닿았으면 탐색이 곧 끝난다 — 기다릴 것이 없다
				if (pauseOnSolution && branched && k < maxSolutions) {
					yield* emit(pause(`해 ${k} 에서 멈춤 — 계속하면 남은 가지에서 다음 해를 찾는다`));
				}
				break;
			}
		}
	}

	const stats = `노드 ${summary.nodes} · 탐침 ${summary.probes} · 최대 깊이 ${summary.maxDepth} · 계산 ${(computeMs / 1000).toFixed(1)}초`;
	const found = summary.solutions.length;

	if (!last) {
		if (hasMemo(ctx)) yield memoClear('모든 가지가 모순 → 가정을 지운다');
		return { status: 'contradiction', note: `해 없음 — 모든 가지가 모순 · ${stats}` };
	}

	// 해를 찾은 뒤에도 탐색이 다른 가지를 그렸다 — 마지막 해를 다시 보인다
	const writes = display(last, true);
	if (writes.length) yield paint(writes, undefined, `판은 해 ${found}`);

	let verdict: string;
	if (maxSolutions === 1) verdict = '해를 찾았다 (유일한지는 보지 않았다)';
	else if (found === 1) verdict = '유일해 — 다른 가지는 모두 모순';
	else if (summary.complete) verdict = `해가 여럿 — 해 ${found}개를 모두 찾았다. 판은 해 ${found}`;
	else verdict = `해가 여럿 — 한도(${maxSolutions})까지 해 ${found}개를 찾았다. 판은 해 ${found}`;
	return finalOutcome(ctx, `${verdict} · ${stats}`);
}

/** 옵션을 바꾼 완전 탐색 전략을 만든다 (콘솔·시험용: 해 수 한도, 해마다 멈추지 않기, 탐침 끄기 …) */
export function createBacktracking(opts: BacktrackingStrategyOptions = {}): Strategy {
	return defineStrategy({
		id: 'backtracking',
		name: '완전 탐색',
		description:
			'줄 전파와 가정 & 모순으로 정할 수 있는 칸을 다 칠한 뒤, 남으면 칸 하나를 칠/X 로 나눠 깊이 우선으로 내려간다(지금 가지의 가정을 주황 메모로). 모순이 난 가지는 버리고 되돌아간다. 해를 찾을 때마다 보여 주고 일시정지한다 — 계속하면 다음 해를 찾는다. 가지를 다 보면 유일해인지·해가 몇 개인지·해가 없는지를 증명으로 알려 준다.',
		solve: (ctx) => solveBacktracking(ctx, opts)
	});
}

export const backtracking = createBacktracking();
