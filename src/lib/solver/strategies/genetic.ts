/**
 * 전략 4 — 유전 알고리즘 (genetic).
 *
 *   0. 확정 칸 — 줄 전파를 끝까지 돌려 퍼즐 규칙상 반드시 칠/비움인 칸을 판에 일반 칠/X 로 칠한다.
 *      이 칸은 진화 내내 불변이다(유전자가 고정 칸과 어긋나는 배치를 갖지 않고, 변이도 건드리지 않는다).
 *      줄 전파만으로 풀리면 진화 없이 끝난다.
 *   1. 스캔 — 행·열마다 지금 판의 확정 칸과 어긋나지 않는 배치 수(경우의 수)를 센다.
 *   2. 축 고르기 — 경우의 수 곱(로그 합)이 작은 축을 유전자 축(주 축)으로 쓴다.
 *   3. 진화 — 유전자 = 주 축 줄마다 "빈칸을 어느 틈에 몇 칸 넣나"(빈칸 삽입), 평가 = 반대 축 줄의 불일치도
 *      (단서에 맞추려면 최소 몇 칸을 뒤집어야 하나의 합). 주 축 줄은 늘 자기 단서를 만족한다.
 *   4. 불일치도가 0 이 되면 풀린 것 — 메모를 확정한다. 세대 한도는 없다: 풀리거나 실행기가 멈출 때까지 진화한다.
 *   5. 불가능한 퍼즐임이 명백하면(단서 합이 다름 / 배치가 없는 줄 / 줄 전파로 모순) 오류로 끝낸다.
 *
 * 화면에서는 세대마다 지금 개체군의 최선 개체를 주황 메모로 그린다. 반대 축 줄의 모순 표시가 곧 불일치다.
 * 진화 계산은 ../genetic.ts (판·단계와 무관한 순수 모듈).
 *
 * 구조 예시: 판 밖에서 큰 계산을 하고, 그 중간 결과를 메모로 그려 보이는 전략.
 * 세대마다 한 단계를 yield 하므로(바뀐 칸이 없어도) 실행기가 박자를 잡고 화면이 멈추지 않는다.
 */
import { Board } from '../../nonogram/board.js';
import { Cell, isMemo } from '../../nonogram/cell.js';
import {
	allLines,
	lineClue,
	lineCoord,
	lineLabel,
	type Axis,
	type LineRef
} from '../../nonogram/line.js';
import { clueSum, type LineClue } from '../../nonogram/puzzle.js';
import {
	buildModel,
	countPlacements,
	fixedMask,
	formatCount,
	GeneticSearch,
	type GeneticOptions,
	type Individual
} from '../genetic.js';
import { runHeadless } from '../headless.js';
import { propagate } from '../propagate.js';
import { finalOutcome, inspect, memoClear, memoCommit, note, paint } from '../steps.js';
import {
	defineStrategy,
	type SolveOutcome,
	type SolverContext,
	type SolverStep,
	type Strategy
} from '../types.js';

export interface GeneticStrategyOptions extends Partial<Omit<GeneticOptions, 'seed'>> {
	/** 난수 씨앗 — 없으면 실행마다 새로 뽑는다(기록에 남는다) */
	readonly seed?: number;
	/** 나아진 게 없어도 이 세대마다 기록을 남긴다 */
	readonly reportEvery?: number;
	/**
	 * 진화 전에 줄 전파로 확정 칸을 계산해 판에 칠한다 (기본 true).
	 * false 면 판에 이미 있는 확정 칸만 지킨다 — 순수 GA 비교·시험용.
	 */
	readonly fixCells?: boolean;
}

type Gen<R> = Generator<SolverStep, R, void>;

interface LineScan {
	readonly ref: LineRef;
	readonly clue: LineClue;
	readonly fixed: Uint8Array;
	readonly count: number;
}

const AXIS_NAME: Record<Axis, string> = { row: '행', col: '열' };
const clueText = (clue: LineClue) => (clue.length ? clue.join(' ') : '0');

/** 로그 합 → 사람이 읽는 경우의 수 */
function formatLog10(log: number): string {
	return log < 9 ? formatCount(Math.round(10 ** log)) : `10^${log.toFixed(1)}`;
}

function* fail(reason: string, line?: LineRef): Gen<SolveOutcome> {
	if (line) yield inspect(line, `불가능: ${reason}`);
	else yield note(`불가능: ${reason}`);
	return { status: 'error', note: `풀 수 없는 퍼즐 — ${reason}` };
}

/** 하위 절차의 단계를 그대로 넘기며, 마지막으로 비춘 줄을 기억한다 (모순 난 줄 찾기) */
function* trackLine<R>(gen: Gen<R>): Gen<{ result: R; line: LineRef | null }> {
	let line: LineRef | null = null;
	for (;;) {
		const r = gen.next();
		if (r.done) return { result: r.value, line };
		const step = r.value;
		if (step.kind === 'inspect' || step.kind === 'paint') line = step.line ?? line;
		yield step;
	}
}

/** 확정 칸(칠/X) 수 */
function solidCount(ctx: SolverContext): number {
	const { board } = ctx;
	let n = 0;
	for (let y = 0; y < board.height; y++) {
		for (let x = 0; x < board.width; x++) {
			const v = board.get(x, y);
			if (v === Cell.Filled || v === Cell.Crossed) n++;
		}
	}
	return n;
}

/** 지금 판에 메모 칸이 있나 */
function hasMemo(ctx: SolverContext): boolean {
	const { board } = ctx;
	for (let y = 0; y < board.height; y++) {
		for (let x = 0; x < board.width; x++) if (isMemo(board.get(x, y))) return true;
	}
	return false;
}

/**
 * 판 복사본에서 줄 전파를 끝까지 돌려 모순이 나는지 본다 — 모순이면 그 줄을 돌려준다 (fixCells: false 일 때).
 * 줄 전파는 건전(sound)하므로 모순 = 해가 없다는 증명이다. 알아낸 칸은 판에 쓰지 않는다.
 */
function propagationContradiction(ctx: SolverContext): LineRef | null {
	const { puzzle, board } = ctx;
	const scratch = new Board(puzzle, undefined, { autoCross: false });
	const cells = new Uint8Array(puzzle.width * puzzle.height);
	for (let y = 0; y < puzzle.height; y++) {
		for (let x = 0; x < puzzle.width; x++) {
			const v = board.get(x, y);
			cells[y * puzzle.width + x] = isMemo(v) ? Cell.Unknown : v;
		}
	}
	scratch.load(cells);
	let last: LineRef | null = null;
	const r = runHeadless(
		puzzle,
		function* (c) {
			const res = yield* propagate(c);
			return { status: res === 'contradiction' ? 'contradiction' : 'stalled' } as const;
		},
		{
			board: scratch,
			onStep: (s) => {
				if (s.kind === 'inspect' || s.kind === 'paint') last = s.line ?? last;
			}
		}
	);
	return r.outcome.status === 'contradiction' ? last : null;
}

export function* solveGenetic(
	ctx: SolverContext,
	opts: GeneticStrategyOptions = {}
): Gen<SolveOutcome> {
	const { puzzle, board } = ctx;
	const reportEvery = opts.reportEvery ?? 250;
	const fixCells = opts.fixCells ?? true;
	const total = puzzle.width * puzzle.height;

	if (hasMemo(ctx)) yield memoClear('기존 메모를 지운다 — 진화 중인 후보를 메모로 그린다');

	// ── 5. 명백한 불가능 (1): 칠할 칸 수가 행·열에서 다르다 ──
	const rowSum = puzzle.rows.reduce((s, c) => s + clueSum(c), 0);
	const colSum = puzzle.cols.reduce((s, c) => s + clueSum(c), 0);
	if (rowSum !== colSum) return yield* fail(`행 단서 합(${rowSum}) ≠ 열 단서 합(${colSum})`);

	// ── 0. 확정 칸: 줄 전파로 반드시 칠/비움인 칸을 판에 칠한다 — 진화 중 불변 ──
	if (fixCells) {
		const before = solidCount(ctx);
		yield note('확정 칸 계산 — 줄 전파로 반드시 칠/X 인 칸을 판에 칠한다 (진화 중 불변)');
		const { result, line } = yield* trackLine(propagate(ctx, { label: '(확정) ' }));
		// 5. 명백한 불가능 (2): 줄 전파만으로 모순
		if (result === 'contradiction') {
			const where = line ? lineLabel(line) : '어느 줄';
			return yield* fail(`줄 전파 중 ${where} 에서 모순`, line ?? undefined);
		}
		const after = solidCount(ctx);
		const fixedText = `확정 칸 ${after}/${total} (줄 전파로 +${after - before})`;
		if (result === 'solved') {
			yield note(`${fixedText} — 줄 전파만으로 다 정해졌다`);
			return finalOutcome(ctx, '줄 전파만으로 풀렸다 — 진화가 필요 없다');
		}
		yield note(`${fixedText} — 진화는 남은 ${total - after}칸만 찾는다`);
	}

	// ── 1. 스캔: 줄마다 경우의 수 ──
	const scans: Record<Axis, LineScan[]> = { row: [], col: [] };
	const log10: Record<Axis, number> = { row: 0, col: 0 };
	for (const ref of allLines(puzzle)) {
		const clue = lineClue(puzzle, ref);
		const fixed = fixedMask(board.line(ref));
		const { count } = countPlacements(fixed, clue);
		// 5. 명백한 불가능 (3): 이 줄에 단서를 놓을 자리가 없다 (fixCells 면 줄 전파가 먼저 잡는다)
		if (!(count > 0)) {
			return yield* fail(`${lineLabel(ref)} [${clueText(clue)}] 를 놓을 자리가 없다`, ref);
		}
		yield inspect(ref, `${lineLabel(ref)} [${clueText(clue)}]: 경우의 수 ${formatCount(count)}`);
		scans[ref.axis].push({ ref, clue, fixed, count });
		log10[ref.axis] += Math.log10(count);
	}

	// ── 2. 경우의 수가 적은 축을 유전자로 ──
	const axis: Axis = log10.row <= log10.col ? 'row' : 'col';
	const other: Axis = axis === 'row' ? 'col' : 'row';
	yield note(
		`경우의 수 — 행 ${formatLog10(log10.row)} · 열 ${formatLog10(log10.col)} → ` +
			`${AXIS_NAME[axis]}의 빈칸 삽입을 유전자로, ${AXIS_NAME[other]}의 불일치도로 평가`
	);

	// ── 5. 명백한 불가능 (2'): 확정 칸을 칠하지 않을 때는 판 복사본에서 줄 전파 모순을 본다 ──
	if (!fixCells) {
		const bad = propagationContradiction(ctx);
		if (bad) return yield* fail(`줄 전파 중 ${lineLabel(bad)} 에서 모순`, bad);
	}

	// ── 3. 진화 ──
	const built = buildModel(
		scans[axis].map((s) => ({ fixed: s.fixed, clue: s.clue })),
		scans[other].map((s) => s.clue)
	);
	if (!built.ok) return yield* fail('배치가 없는 줄', scans[axis][built.line].ref);
	const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
	const search = new GeneticSearch(built.model, { ...opts, seed });
	const o = search.options;
	yield note(
		`진화 시작 — 개체 ${o.populationSize} · 다듬기 ${o.polish} · 정체 한도 ${o.stagnationLimit} · 씨앗 ${seed}`
	);

	// 개체 → 판에 그릴 메모 (판에 이미 확정된 칸은 건드리지 않는다)
	const grid = new Uint8Array(built.model.P * built.model.Q);
	const Q = built.model.Q;
	const display = (ind: Individual) => {
		search.decode(ind, grid);
		const writes = [];
		for (let p = 0; p < scans[axis].length; p++) {
			const { ref } = scans[axis][p];
			for (let q = 0; q < Q; q++) {
				const { x, y } = lineCoord(ref, q);
				const cur = board.get(x, y);
				if (cur === Cell.Filled || cur === Cell.Crossed) continue;
				const want = grid[p * Q + q] ? Cell.MemoFilled : Cell.MemoCrossed;
				if (cur !== want) writes.push({ x, y, value: want });
			}
		}
		return writes;
	};

	yield paint(display(search.current), undefined, `세대 0: 불일치 ${search.current.fitness}`);
	// 세대 한도 없음 — 불일치 0 이 되거나 실행기가 멈출 때까지(정지 버튼, headless 의 maxSteps) 이어 간다
	while (search.current.fitness > 0) {
		const r = search.step();
		let text: string | undefined;
		if (r.restarted) {
			text = `세대 ${r.generation}: ${o.stagnationLimit}세대 정체 → 개체군을 새로 뿌린다 (지금까지 최선 ${r.bestFitness})`;
		} else if (r.improved) {
			text = `세대 ${r.generation}: 불일치 ${r.fitness}`;
		} else if (r.generation % reportEvery === 0) {
			text = `세대 ${r.generation}: 불일치 ${r.fitness} · 평균 ${r.meanFitness.toFixed(1)}`;
		}
		// 바뀐 칸이 없어도 한 단계 — 세대마다 박자를 하나 쓴다
		yield paint(display(search.current), undefined, text);
	}

	// ── 4. 불일치도 0 = 풀렸다 ──
	yield memoCommit(`세대 ${search.generation}: 불일치 0 — 모든 줄이 단서와 맞는다 → 확정`);
	return finalOutcome(
		ctx,
		`세대 ${search.generation} · 재시작 ${search.restarts}번 · 씨앗 ${seed}`
	);
}

/** 옵션을 바꾼 유전 알고리즘 전략을 만든다 (시험·콘솔용: 씨앗 고정, 순수 GA = polish 0 …) */
export function createGenetic(opts: GeneticStrategyOptions = {}): Strategy {
	return defineStrategy({
		id: 'genetic',
		name: '유전 알고리즘',
		description:
			'먼저 줄 전파로 반드시 칠/X 인 칸을 칠해 두고(진화 중 불변), 행·열마다 경우의 수를 세어 적은 축을 유전자로 고른다. 유전자 = 줄마다 빈칸을 어느 틈에 넣나, 평가 = 반대 축 줄의 불일치도(최소 뒤집기 칸 수). 세대마다 최선 후보를 주황 메모로 그리고, 불일치 0 이면 확정한다 — 그때까지 세대 한도 없이 이어 간다(정지 버튼으로 멈춘다). 명백히 불가능한 퍼즐이면 오류로 끝낸다.',
		solve: (ctx) => solveGenetic(ctx, opts)
	});
}

export const genetic = createGenetic();
