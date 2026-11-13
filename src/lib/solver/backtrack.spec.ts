import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board } from '../nonogram/board.js';
import { Cell } from '../nonogram/cell.js';
import { puzzleFromPicture } from '../nonogram/formats/picture.js';
import { allLines, analyzeLine, lineClue, runsOf } from '../nonogram/line.js';
import { createPuzzle, puzzleOrThrow, type LineClue, type Puzzle } from '../nonogram/puzzle.js';
import { SAMPLE_PICTURES } from '../puzzles/pictures/samples.js';
import { BacktrackSearch, countSolutions, LineBuffers } from './backtrack.js';
import { mulberry32 } from './genetic.js';
import { backtracking, createBacktracking, runHeadless, type SolverStep } from './index.js';

const loadJson = (name: string) =>
	puzzleOrThrow(
		JSON.parse(readFileSync(new URL(`../puzzles/${name}.json`, import.meta.url), 'utf8'))
	);

const puzzle = (rows: number[][], cols: number[][]): Puzzle => {
	const r = createPuzzle(rows, cols);
	if (!r.ok) throw new Error('잘못된 퍼즐');
	return r.value;
};

const sameRuns = (line: ArrayLike<number>, clue: readonly number[]) =>
	JSON.stringify(runsOf(Array.from(line) as Cell[])) === JSON.stringify([...clue]);

/** 격자(0/1/2)가 모든 단서를 만족하나 */
function satisfies(p: Puzzle, g: ArrayLike<number>): boolean {
	const W = p.width;
	for (let y = 0; y < p.height; y++) {
		const row = Array.from({ length: W }, (_, x) => g[y * W + x]);
		if (!sameRuns(row, p.rows[y])) return false;
	}
	for (let x = 0; x < W; x++) {
		const col = Array.from({ length: p.height }, (_, y) => g[y * W + x]);
		if (!sameRuns(col, p.cols[x])) return false;
	}
	return true;
}

/** 해의 수 — 행마다 단서에 맞는 줄을 모두 늘어놓고 곱으로 전수 (작은 판만) */
function bruteCount(p: Puzzle): number {
	const W = p.width;
	const options = p.rows.map((clue) => {
		const out: number[][] = [];
		for (let m = 0; m < 1 << W; m++) {
			const line = Array.from({ length: W }, (_, i) => ((m >> i) & 1 ? Cell.Filled : Cell.Crossed));
			if (sameRuns(line, clue)) out.push(line);
		}
		return out;
	});
	let count = 0;
	const grid: number[] = [];
	const go = (y: number) => {
		if (y === p.height) {
			if (satisfies(p, grid)) count++;
			return;
		}
		for (const line of options[y]) {
			grid.splice(y * W, W, ...line);
			go(y + 1);
		}
	};
	go(0);
	return count;
}

function randomPicture(rng: () => number, w: number, h: number, density = 0.5): string[] {
	return Array.from({ length: h }, () =>
		Array.from({ length: w }, () => (rng() < density ? '#' : '.')).join('')
	);
}

const notes = (steps: SolverStep[]) => steps.flatMap((s) => (s.note ? [s.note] : []));

describe('LineBuffers — 할당 없는 줄 풀이', () => {
	it('analyzeLine 과 같은 칸을 정하고, 모순도 같다 (무작위 줄 3,000개, 버퍼 하나를 계속 다시 씀)', () => {
		const rng = mulberry32(7);
		const buf = new LineBuffers(16, 8);
		let infeasible = 0;
		for (let t = 0; t < 3000; t++) {
			const n = 1 + Math.floor(rng() * 16);
			const truth = Array.from({ length: n }, () => (rng() < 0.55 ? 1 : 0));
			const clue = runsOf(truth as Cell[]);
			const line = truth.map((v) => {
				const r = rng();
				if (r < 0.3) return v ? Cell.Filled : Cell.Crossed;
				if (r < 0.34) return v ? Cell.Crossed : Cell.Filled; // 가끔 어긋난 칸 — 모순 경우
				return Cell.Unknown;
			});
			const a = analyzeLine(line, clue as unknown as LineClue);
			buf.cells.set(line);
			const r = buf.solve(n, clue);
			if (!a.feasible) {
				infeasible++;
				expect(r).toBe(-1);
				continue;
			}
			let want = 0;
			for (let i = 0; i < n; i++) {
				let v: number = Cell.Unknown;
				if (line[i] === Cell.Unknown && a.canFill[i] && !a.canCross[i]) v = Cell.Filled;
				if (line[i] === Cell.Unknown && a.canCross[i] && !a.canFill[i]) v = Cell.Crossed;
				if (v !== Cell.Unknown) want++;
				expect(buf.result[i]).toBe(v);
			}
			expect(r).toBe(want);
		}
		expect(infeasible).toBeGreaterThan(100);
	});
});

describe('해의 수 — 전수 비교', () => {
	it('무작위 작은 판(그림에서 만든 판 + 행·열을 섞은 판)에서 해의 수가 전수 탐색과 같다', () => {
		const rng = mulberry32(11);
		let zero = 0;
		let many = 0;
		for (let t = 0; t < 160; t++) {
			const [w, h] = [
				[4, 4],
				[5, 4],
				[5, 5],
				[3, 6]
			][t % 4];
			const a = puzzleFromPicture(randomPicture(rng, w, h));
			// 절반은 다른 그림의 열 단서를 섞는다 — 해가 없는 판도 시험
			const p: Puzzle =
				t % 2 === 0 ? a : { ...a, cols: puzzleFromPicture(randomPicture(rng, w, h)).cols };
			const want = bruteCount(p);
			for (const probe of [true, false]) {
				const s = countSolutions(p, { maxSolutions: Infinity, probe });
				expect(s.complete).toBe(true);
				expect(s.solutions.length).toBe(want);
				for (const g of s.solutions) expect(satisfies(p, g)).toBe(true);
				expect(new Set(s.solutions.map((g) => g.join(''))).size).toBe(want);
			}
			if (want === 0) zero++;
			if (want > 1) many++;
		}
		expect(zero).toBeGreaterThan(10);
		expect(many).toBeGreaterThan(10);
	});

	it('해 한도에 닿으면 멈추고 complete 가 false', () => {
		// 2×2 대각선 — 해 2개
		const p = puzzle([[1], [1]], [[1], [1]]);
		expect(countSolutions(p, { maxSolutions: 10 })).toMatchObject({ complete: true });
		expect(countSolutions(p, { maxSolutions: 10 }).solutions).toHaveLength(2);
		const one = countSolutions(p, { maxSolutions: 1 });
		expect(one.solutions).toHaveLength(1);
		expect(one.complete).toBe(false);
	});

	it('start 의 정해진 칸을 주어진 조건으로 본다', () => {
		const p = puzzle([[1], [1]], [[1], [1]]);
		const s = countSolutions(p, { maxSolutions: 10, start: [Cell.Filled, 0, 0, 0] });
		expect(s.complete).toBe(true);
		expect(Array.from(s.solutions[0])).toEqual([1, 2, 2, 1]);
		expect(s.solutions).toHaveLength(1);
		// 어긋난 조건 — 해 없음
		const bad = countSolutions(p, { start: [Cell.Filled, Cell.Filled, 0, 0] });
		expect(bad).toMatchObject({ complete: true, solutions: [] });
	});

	it('탐침은 줄 전파만 할 때보다 노드를 크게 줄인다 (random-20-probing)', () => {
		const p = loadJson('random-20-probing');
		const withProbe = countSolutions(p);
		const without = countSolutions(p, { probe: false });
		expect(withProbe.solutions).toHaveLength(1);
		expect(without.solutions).toHaveLength(1);
		expect(withProbe.solutions[0]).toEqual(without.solutions[0]);
		expect(withProbe.nodes).toBeLessThan(without.nodes);
	});

	it('같은 입력이면 같은 탐색 (결정적)', () => {
		const p = loadJson('random-20-probing');
		const a = new BacktrackSearch(p, { probe: false });
		const b = new BacktrackSearch(p, { probe: false });
		const ka = [...a.run()].map((e) => e.kind).join();
		const kb = [...b.run()].map((e) => e.kind).join();
		expect(ka).toBe(kb);
		expect(a.nodes).toBe(b.nodes);
	});
});

describe('완전 탐색 전략', () => {
	it('줄 전파로 풀리면 탐색 없이 유일해로 끝난다', () => {
		const p = puzzleFromPicture(SAMPLE_PICTURES.heart.picture);
		const r = runHeadless(p, backtracking);
		expect(r.outcome).toEqual({
			status: 'solved',
			note: '유일해 — 줄 전파만으로 모든 칸이 정해졌다'
		});
	});

	it('random-20-probing — 가정 & 모순으로 확정하고 유일해임을 확인한다', () => {
		const p = loadJson('random-20-probing');
		const steps: SolverStep[] = [];
		const r = runHeadless(p, backtracking, { onStep: (s) => steps.push(s) });
		expect(r.outcome.status).toBe('solved');
		expect(r.outcome.note).toMatch(/^유일해 — /);
		expect(r.board.memoCount()).toBe(0);
		expect(notes(steps).some((n) => n.startsWith('2. (확정) 가정 & 모순으로 +'))).toBe(true);
		// 가정 없이 풀렸다 — 기다릴 것이 없으니 멈추지 않는다
		expect(steps.some((s) => s.kind === 'pause')).toBe(false);
	});

	it('해 없는 4×4 (줄 전파로 안 드러남) — 모든 가지가 모순임을 증명하고 끝난다', () => {
		const p = puzzle([[2], [2], [2], [1, 1]], [[2], [2], [2], [2]]);
		const r = runHeadless(p, backtracking);
		expect(r.outcome.status).toBe('contradiction');
		expect(r.outcome.note).toMatch(/^해 없음 — /);
		expect(r.board.memoCount()).toBe(0);
		expect(r.board.countWhere((v) => v === Cell.Filled || v === Cell.Crossed)).toBe(0);
	});

	it('해가 여럿인 판 — 해마다 칠/X 로 보여 주고 멈추며, 가지를 다 보면 정확한 수', () => {
		// 2×2 대각선 — 해 2개, 네 칸이 모두 다르다
		const p = puzzle([[1], [1]], [[1], [1]]);
		const board = new Board(p);
		const steps: SolverStep[] = [];
		const shown: string[] = [];
		const r = runHeadless(p, backtracking, {
			board,
			onStep: (s) => {
				steps.push(s);
				// onStep 은 적용 전 — 멈춤 단계 때 판은 방금 보인 해다
				if (s.kind !== 'pause') return;
				expect(board.memoCount()).toBe(0);
				expect(satisfies(p, board.snapshot())).toBe(true);
				shown.push(board.snapshot().join(''));
			}
		});
		expect(r.outcome.status).toBe('solved');
		expect(r.outcome.note).toMatch(/^해가 여럿 — 해 2개를 모두 찾았다\. 판은 해 2 · /);
		expect(shown).toHaveLength(2);
		expect(new Set(shown).size).toBe(2);
		expect(notes(steps)).toContain(
			'해 2 — 모든 줄이 단서와 맞는다 · 앞 해와 4칸이 다르다: (1,1) (2,1) (1,2) (2,2)'
		);
		// 끝난 판은 마지막 해
		expect(r.board.snapshot().join('')).toBe(shown[1]);
	});

	it('해가 여럿인 무작위 판 — 모든 해를 하나씩 찾아 멈추고, 수가 전수 탐색과 같다', () => {
		const rng = mulberry32(5);
		let p: Puzzle | null = null;
		let want = 0;
		while (!p) {
			const q = puzzleFromPicture(randomPicture(rng, 5, 5));
			want = bruteCount(q);
			if (want >= 4 && want <= 30) p = q;
		}
		const board = new Board(p);
		const shown = new Set<string>();
		let pauses = 0;
		const r = runHeadless(p, backtracking, {
			board,
			onStep: (s) => {
				if (s.kind !== 'pause') return;
				pauses++;
				expect(satisfies(p, board.snapshot())).toBe(true);
				shown.add(board.snapshot().join(''));
			}
		});
		expect(pauses).toBe(want);
		expect(shown.size).toBe(want);
		expect(r.outcome.note).toMatch(new RegExp(`^해가 여럿 — 해 ${want}개를 모두 찾았다`));
	});

	it('해마다 멈추지 않기 (pauseOnSolution: false) · 해 수 한도', () => {
		const p = puzzle([[1], [1]], [[1], [1]]);
		const steps: SolverStep[] = [];
		runHeadless(p, createBacktracking({ pauseOnSolution: false }), {
			onStep: (s) => steps.push(s)
		});
		expect(steps.some((s) => s.kind === 'pause')).toBe(false);
		// 한도에 닿은 해에서는 멈추지 않는다 — 탐색이 곧 끝난다
		const capped: SolverStep[] = [];
		const r = runHeadless(p, createBacktracking({ maxSolutions: 2 }), {
			onStep: (s) => capped.push(s)
		});
		expect(capped.filter((s) => s.kind === 'pause')).toHaveLength(1);
		expect(r.outcome.note).toMatch(/^해가 여럿 — 한도\(2\)까지 해 2개를 찾았다\. 판은 해 2 · /);
	});

	it('maxSolutions: 1 이면 유일한지 보지 않는다', () => {
		const p = puzzle([[1], [1]], [[1], [1]]);
		const r = runHeadless(p, createBacktracking({ maxSolutions: 1 }));
		expect(r.outcome.status).toBe('solved');
		expect(r.outcome.note).toMatch(/^해를 찾았다 \(유일한지는 보지 않았다\)/);
	});

	it('판에 잘못 칠한 칸이 있으면 해 없음 (판의 칸은 주어진 조건)', () => {
		const p = puzzleFromPicture(SAMPLE_PICTURES.heart.picture);
		const board = new Board(p);
		board.set(5, 2, Cell.Crossed); // 3행은 [11]
		const r = runHeadless(p, backtracking, { board });
		expect(r.outcome).toEqual({ status: 'contradiction', note: '해 없음 — 줄 전파에서 모순' });
	});

	it('그리는 가정은 언제나 모든 줄과 어긋나지 않는다 (모순 표시 직후만 예외)', () => {
		const p = loadJson('random-20-probing');
		const board = new Board(p);
		let prev: SolverStep | null = null;
		let checked = 0;
		// 탐침을 끄면 분기가 많아 되돌아가기가 잦다. onStep 은 그 단계를 판에 적용하기 전 — 판은 앞 단계 뒤
		const r = runHeadless(p, createBacktracking({ probe: false }), {
			board,
			onStep: (s) => {
				if (prev?.kind === 'paint' && !prev.note?.includes('모순')) {
					for (const ref of allLines(p)) {
						expect(analyzeLine(board.line(ref), lineClue(p, ref)).feasible).toBe(true);
					}
					checked++;
				}
				prev = s;
			}
		});
		expect(r.outcome.status).toBe('solved');
		expect(r.outcome.note).toMatch(/^유일해 — /);
		expect(checked).toBeGreaterThan(10);
	});

	it('40×40 석상 — 해가 여럿임을 몇 초 안에 증명한다', { timeout: 60_000 }, () => {
		const p = loadJson('solo-leveling-statue');
		const steps: SolverStep[] = [];
		const r = runHeadless(p, createBacktracking({ maxSolutions: 2 }), {
			onStep: (s) => steps.push(s)
		});
		expect(r.outcome.status).toBe('solved');
		expect(r.outcome.note).toMatch(/^해가 여럿 — 한도\(2\)까지 해 2개를 찾았다/);
		expect(r.board.memoCount()).toBe(0);
		expect(satisfies(p, r.board.snapshot())).toBe(true);
		expect(notes(steps)).toContain(
			'해 2 — 모든 줄이 단서와 맞는다 · 앞 해와 4칸이 다르다: (33,9) (35,9) (33,14) (35,14)'
		);
	});

	it(
		'도중에 멈추면 확정 칸은 모든 해에 공통이고, 나머지는 지금 가지의 메모다',
		{ timeout: 60_000 },
		() => {
			const p = loadJson('solo-leveling-statue');
			// 빈 단계를 끄면 단계 수가 시각과 무관하다 — 다섯 번째 가정 단계에서 멈춘다
			const strategy = createBacktracking({ breatheMs: Infinity, maxSolutions: 2 });
			const at: number[] = [];
			runHeadless(p, strategy, {
				onStep: (s, i) => {
					if (s.note?.startsWith('깊이 ')) at.push(i);
				}
			});
			const r = runHeadless(p, strategy, { maxSteps: at[4] + 1 });
			expect(r.outcome.status).toBe('error'); // 실행기의 단계 한도
			expect(r.board.memoCount()).toBeGreaterThan(0);
			const sols = countSolutions(p, { maxSolutions: 2 }).solutions;
			expect(sols).toHaveLength(2);
			let solid = 0;
			r.board.snapshot().forEach((v, i) => {
				if (v !== Cell.Filled && v !== Cell.Crossed) return;
				solid++;
				for (const s of sols) expect(s[i]).toBe(v);
			});
			expect(solid).toBeGreaterThan(168); // 줄 전파(168칸) + 탐침 확정
		}
	);
});
