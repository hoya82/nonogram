import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board } from '../nonogram/board.js';
import { Cell } from '../nonogram/cell.js';
import { parsePicture, puzzleFromPicture } from '../nonogram/formats/picture.js';
import { isLineSatisfied, runsOf } from '../nonogram/line.js';
import { createPuzzle, puzzleOrThrow, type LineClue, type Puzzle } from '../nonogram/puzzle.js';
import { SAMPLE_PICTURES } from '../puzzles/pictures/samples.js';
import {
	buildModel,
	countPlacements,
	decodeGaps,
	Fix,
	fixedMask,
	gapMoves,
	gapsFit,
	GeneticSearch,
	lineDistance,
	mulberry32,
	sampleGaps
} from './genetic.js';
import {
	createGenetic,
	linePropagation,
	overlapSweep,
	runHeadless,
	type SolverStep
} from './index.js';

/** 10×10 — 줄 전파가 58칸을 정하고 멈추는 판 (무작위 그림에서 찾은 예). 해가 여럿일 수 있다 */
const STALLING_10 = [
	'.#.###.##.',
	'##..#####.',
	'##.#.#.#..',
	'#.#.....##',
	'....###.##',
	'##.....###',
	'.###.##.##',
	'.#....##.#',
	'.#..#....#',
	'......#..#'
];

const isSolid = (v: number) => v === Cell.Filled || v === Cell.Crossed;

const loadJson = (name: string) =>
	puzzleOrThrow(
		JSON.parse(readFileSync(new URL(`../puzzles/${name}.json`, import.meta.url), 'utf8'))
	);

/** 길이 n 의 모든 0/1 줄 */
function* allLines01(n: number): Generator<number[]> {
	for (let m = 0; m < 1 << n; m++) yield Array.from({ length: n }, (_, i) => (m >> i) & 1);
}
const sameRuns = (line: number[], clue: readonly number[]) =>
	JSON.stringify(runsOf(line as Cell[])) === JSON.stringify([...clue]);
const fitsFixed = (line: number[], fixed: Uint8Array) =>
	line.every((v, i) => !(fixed[i] === Fix.Fill && v !== 1) && !(fixed[i] === Fix.Empty && v !== 0));

function randomCase(rng: () => number) {
	const n = 1 + Math.floor(rng() * 10);
	const truth = Array.from({ length: n }, () => (rng() < 0.5 ? 1 : 0));
	const clue = runsOf(truth as Cell[]);
	// 정답과 어긋나지 않는 고정 칸 몇 개 + 가끔 어긋나는 칸 (배치 0 경우도 시험)
	const fixed = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const r = rng();
		if (r < 0.2) fixed[i] = truth[i] ? Fix.Fill : Fix.Empty;
		else if (r < 0.25) fixed[i] = truth[i] ? Fix.Empty : Fix.Fill;
	}
	return { n, clue, fixed };
}

describe('경우의 수·표본·거리 — 전수 비교', () => {
	const rng = mulberry32(42);
	const cases = Array.from({ length: 2000 }, () => randomCase(rng));

	it('countPlacements 는 고정 칸과 맞는 배치 수와 같다', () => {
		for (const { n, clue, fixed } of cases) {
			let brute = 0;
			for (const l of allLines01(n)) if (sameRuns(l, clue) && fitsFixed(l, fixed)) brute++;
			expect(countPlacements(fixed, clue).count).toBe(brute);
		}
	});

	it('sampleGaps 는 늘 단서·고정 칸을 만족하는 유전자를 낸다', () => {
		const out = new Uint8Array(16);
		const line = new Uint8Array(16);
		for (const { n, clue, fixed } of cases) {
			const table = countPlacements(fixed, clue);
			const ok = sampleGaps(table, rng, out, 0);
			expect(ok).toBe(table.count > 0);
			if (!ok) continue;
			const slack = n - (clue.reduce((s, c) => s + c, 0) + Math.max(0, clue.length - 1));
			expect([...out.subarray(0, clue.length + 1)].reduce((s, v) => s + v, 0)).toBe(slack);
			expect(gapsFit(out, 0, clue, fixed)).toBe(true);
			decodeGaps(out, 0, clue, n, line);
			const cells = [...line.subarray(0, n)];
			expect(sameRuns(cells, clue)).toBe(true);
			expect(fitsFixed(cells, fixed)).toBe(true);
		}
	});

	it('sampleGaps 는 모든 배치를 고르게 뽑는다', () => {
		const clue = [2, 1];
		const fixed = new Uint8Array(8);
		const table = countPlacements(fixed, clue); // C(5+... ) = 15
		const seen = new Map<string, number>();
		const out = new Uint8Array(3);
		const N = 15_000;
		for (let i = 0; i < N; i++) {
			sampleGaps(table, rng, out, 0);
			const k = out.join(',');
			seen.set(k, (seen.get(k) ?? 0) + 1);
		}
		expect(seen.size).toBe(table.count);
		for (const c of seen.values())
			expect(Math.abs(c - N / table.count)).toBeLessThan(N / table.count / 4);
	});

	it('lineDistance 는 단서를 만족하는 가장 가까운 줄까지의 해밍 거리다', () => {
		const cost = new Int32Array(12 * 12);
		const pre = new Int32Array(12);
		for (const { n, clue } of cases.slice(0, 300)) {
			const valid = [...allLines01(n)].filter((l) => sameRuns(l, clue));
			for (const cells of [...allLines01(n)].filter(() => rng() < 0.15)) {
				let brute = Infinity;
				for (const v of valid) {
					let d = 0;
					for (let i = 0; i < n; i++) d += v[i] === cells[i] ? 0 : 1;
					brute = Math.min(brute, d);
				}
				// 열처럼 띄엄띄엄(step 3) 놓인 칸으로도 같은 값
				const strided = new Uint8Array(n * 3);
				cells.forEach((v, i) => (strided[1 + i * 3] = v));
				expect(lineDistance(strided, 1, 3, n, clue, cost, pre)).toBe(brute);
			}
		}
	});
});

describe('변이 — 고정 칸을 건드리지 않는 이동', () => {
	it('gapMoves 는 빈칸 하나 옮기기 중 고정 칸과 맞는 것을 빠짐없이 낸다 (전수 비교)', () => {
		const rng = mulberry32(7);
		const starts = new Int32Array(16);
		const out = new Int32Array(17 * 17);
		for (let t = 0; t < 3000; t++) {
			const { clue, fixed } = randomCase(rng);
			const table = countPlacements(fixed, clue);
			if (!(table.count > 0)) continue;
			const genes = new Uint8Array(clue.length + 1);
			sampleGaps(table, rng, genes, 0);
			const n = gapMoves(genes, 0, clue, fixed, starts, out);
			const got = [...out.subarray(0, n)].sort((a, b) => a - b);
			const slots = clue.length + 1;
			const want: number[] = [];
			for (let a = 0; a < slots; a++) {
				for (let b = 0; b < slots; b++) {
					if (a === b || genes[a] === 0) continue;
					genes[a]--;
					genes[b]++;
					if (gapsFit(genes, 0, clue, fixed)) want.push(a * slots + b);
					genes[a]++;
					genes[b]--;
				}
			}
			expect(got).toEqual(want.sort((a, b) => a - b));
		}
	});

	it('진화 내내 모든 개체가 고정 칸(불변 칸)을 지킨다', () => {
		const p = puzzleFromPicture(STALLING_10);
		const board = runHeadless(p, linePropagation).board;
		const rows = Array.from({ length: p.height }, (_, y) =>
			fixedMask(board.line({ axis: 'row', index: y }))
		);
		const built = buildModel(
			rows.map((fixed, y) => ({ fixed, clue: p.rows[y] })),
			p.cols
		);
		if (!built.ok) throw new Error('배치 없음');
		const ga = new GeneticSearch(built.model, { seed: 4, populationSize: 30, polish: 100 });
		const grid = new Uint8Array(p.width * p.height);
		let checked = 0;
		for (let gen = 0; gen < 40; gen++) {
			for (const ind of ga.population) {
				ga.decode(ind, grid);
				rows.forEach((fixed, y) =>
					fixed.forEach((f, x) => {
						if (f === Fix.Fill) expect(grid[y * p.width + x]).toBe(1);
						if (f === Fix.Empty) expect(grid[y * p.width + x]).toBe(0);
					})
				);
				checked++;
			}
			if (ga.current.fitness === 0) break;
			ga.step();
		}
		expect(checked).toBeGreaterThan(0);
	});
});

describe('GeneticSearch', () => {
	it('씨앗이 같으면 진화가 같다', () => {
		const p = puzzleFromPicture(SAMPLE_PICTURES.cup.picture);
		const built = buildModel(
			p.rows.map((clue) => ({ fixed: new Uint8Array(p.width), clue })),
			p.cols
		);
		if (!built.ok) throw new Error('배치 없음');
		const run = () => {
			const ga = new GeneticSearch(built.model, { seed: 3, polish: 0 });
			const fs = [];
			for (let i = 0; i < 30; i++) fs.push(ga.step().fitness);
			return fs;
		};
		const a = run();
		expect(run()).toEqual(a);
		// 최선은 나빠지지 않는다 (엘리트 보존)
		for (let i = 1; i < a.length; i++) expect(a[i]).toBeLessThanOrEqual(a[i - 1]);
	});

	it('평가값 0 인 개체는 반대 축 단서를 모두 만족한다', () => {
		const p = puzzleFromPicture(SAMPLE_PICTURES.heart.picture);
		const built = buildModel(
			p.rows.map((clue) => ({ fixed: new Uint8Array(p.width), clue })),
			p.cols
		);
		if (!built.ok) throw new Error('배치 없음');
		const ga = new GeneticSearch(built.model, { seed: 5 });
		while (ga.best.fitness > 0 && ga.generation < 500) ga.step();
		expect(ga.best.fitness).toBe(0);
		const grid = ga.decode(ga.best);
		for (let x = 0; x < p.width; x++) {
			const col = Array.from({ length: p.height }, (_, y) => grid[y * p.width + x]);
			expect(sameRuns(col, p.cols[x])).toBe(true);
		}
	});
});

/** 정답 그림과 판을 비교 */
function expectSolvedAs(board: Board, picture: readonly string[]) {
	const sol = parsePicture(picture).cells;
	expect(board.memoCount()).toBe(0);
	expect([...board.snapshot()]).toEqual([...sol]);
}

const notes = (steps: SolverStep[]) => steps.flatMap((s) => (s.note ? [s.note] : []));

describe('유전 알고리즘 전략', () => {
	for (const [id, { picture }] of Object.entries(SAMPLE_PICTURES)) {
		it(`${id}: 줄 전파로 확정 칸을 칠하다 다 풀리면 진화 없이 끝난다`, () => {
			const p = puzzleFromPicture(picture);
			const steps: SolverStep[] = [];
			const r = runHeadless(p, createGenetic({ seed: 11 }), { onStep: (s) => steps.push(s) });
			expect(r.outcome.status).toBe('solved');
			expect(r.outcome.note).toContain('줄 전파만으로 풀렸다');
			expect(notes(steps).some((n) => n.startsWith('진화 시작'))).toBe(false);
			expectSolvedAs(r.board, picture);
		});

		it(`${id}: 확정 칸 계산 없이(fixCells: false) 진화만으로도 풀고, 정답과 같다`, () => {
			const p = puzzleFromPicture(picture);
			const r = runHeadless(p, createGenetic({ seed: 11, fixCells: false }));
			expect(r.outcome.status).toBe('solved');
			expect(r.outcome.note).toMatch(/^세대 \d+/);
			expectSolvedAs(r.board, picture);
		});
	}

	it('확정 칸을 판에 칠하고, 진화는 그 칸을 바꾸지 않는다', () => {
		const p = puzzleFromPicture(STALLING_10);
		const expected = runHeadless(p, linePropagation).board.snapshot();
		const fixedCount = expected.filter(isSolid).length;
		expect(fixedCount).toBe(58);

		const board = new Board(p);
		let atStart: Uint8Array | null = null;
		const gaWrites: { x: number; y: number }[] = [];
		const steps: SolverStep[] = [];
		const r = runHeadless(p, createGenetic({ seed: 3 }), {
			board,
			onStep: (s) => {
				steps.push(s);
				if (s.kind === 'note' && s.note.startsWith('진화 시작')) atStart = board.snapshot();
				if (atStart && s.kind === 'paint') gaWrites.push(...s.writes);
			}
		});
		expect(r.outcome.status).toBe('solved');
		expect(notes(steps)).toContain(
			`확정 칸 ${fixedCount}/100 (줄 전파로 +${fixedCount}) — 진화는 남은 ${100 - fixedCount}칸만 찾는다`
		);

		// 진화를 시작할 때 판 = 줄 전파 결과 (확정 칸이 칠/X 로 칠해져 있다)
		const start: Uint8Array = atStart!;
		expect([...start]).toEqual([...expected]);
		// 진화 중 후보 그리기는 확정 칸에 한 번도 쓰지 않는다
		expect(gaWrites.length).toBeGreaterThan(0);
		for (const w of gaWrites) expect(isSolid(start[w.y * p.width + w.x])).toBe(false);
		// 끝난 판도 확정 칸은 그대로, 모든 줄이 맞는다
		start.forEach((v, i) => {
			if (isSolid(v)) expect(r.board.at(i)).toBe(v);
		});
		expect(r.board.isSolved()).toBe(true);
	});

	it('행과 열을 모두 스캔하고 경우의 수가 적은 축을 고른다', () => {
		// 집 10×10: 행 10^9.6 > 열 10^8.2 → 열을 유전자로 (줄 전파로 다 풀리므로 확정 칸 계산은 끈다)
		const p = puzzleFromPicture(SAMPLE_PICTURES.house.picture);
		const steps: SolverStep[] = [];
		runHeadless(p, createGenetic({ seed: 1, fixCells: false }), { onStep: (s) => steps.push(s) });
		const scanned = steps.filter((s) => s.kind === 'inspect' && s.note?.includes('경우의 수'));
		expect(scanned).toHaveLength(p.width + p.height);
		expect(notes(steps).some((n) => n.includes('열의 빈칸 삽입을 유전자로'))).toBe(true);

		const heart = puzzleFromPicture(SAMPLE_PICTURES.heart.picture);
		const hs: SolverStep[] = [];
		runHeadless(heart, createGenetic({ seed: 1, fixCells: false }), {
			onStep: (s) => hs.push(s)
		});
		expect(notes(hs).some((n) => n.includes('행의 빈칸 삽입을 유전자로'))).toBe(true);
	});

	it('판에 이미 확정된 칸을 지키며 이어 푼다 (fixCells: false)', () => {
		const { picture } = SAMPLE_PICTURES.cup;
		const p = puzzleFromPicture(picture);
		const first = runHeadless(p, overlapSweep);
		const before = first.board.snapshot();
		expect(before.some((v) => v !== Cell.Unknown)).toBe(true);
		const r = runHeadless(p, createGenetic({ seed: 2, fixCells: false }), { board: first.board });
		expect(r.outcome.status).toBe('solved');
		expectSolvedAs(r.board, picture);
	});

	it('도중에 멈추면(정지) 확정 칸은 남고 후보 메모도 남는다', () => {
		const p = loadJson('random-20-probing');
		const byPropagation = runHeadless(p, linePropagation).board.snapshot();
		// 실행기가 300단계에서 멈춘다 (화면의 정지 버튼과 같다 — 제너레이터를 닫는다)
		const r = runHeadless(p, createGenetic({ seed: 1, polish: 0 }), { maxSteps: 300 });
		expect(r.outcome.note).toContain('단계가 300개를 넘었다');
		r.board.snapshot().forEach((v, i) => {
			if (isSolid(byPropagation[i])) expect(v).toBe(byPropagation[i]);
			else expect(v === Cell.MemoFilled || v === Cell.MemoCrossed).toBe(true);
		});
	});
});

describe('유전 알고리즘 전략 — 불가능한 퍼즐', () => {
	it('줄 전파로 모순이 나면 오류로 끝낸다', () => {
		// 줄 하나하나는 놓을 수 있지만, 1·3행과 1·3열이 꽉 차면 2행 [1] 에 칠한 칸이 둘이 된다
		const p = puzzleOrThrow({ rows: [[3], [1], [3]], cols: [[3], [1], [3]] });
		const steps: SolverStep[] = [];
		const r = runHeadless(p, createGenetic({ seed: 1 }), { onStep: (s) => steps.push(s) });
		expect(r.outcome.status).toBe('error');
		expect(r.outcome.note).toMatch(/^풀 수 없는 퍼즐 — 줄 전파 중 [RC]\d+ 에서 모순$/);
		// 확정 칸 계산(줄 전파) 중에 걸려 스캔·진화로 가지 않는다
		expect(steps.some((s) => s.note?.includes('경우의 수'))).toBe(false);
		expect(r.board.memoCount()).toBe(0);

		// 확정 칸 계산을 끄면 스캔을 끝낸 뒤 판 복사본 검사로 같은 오류
		const off = runHeadless(p, createGenetic({ seed: 1, fixCells: false }));
		expect(off.outcome.status).toBe('error');
		expect(off.outcome.note).toMatch(/^풀 수 없는 퍼즐 — 줄 전파 중 [RC]\d+ 에서 모순$/);
		expect(off.board.countWhere(isSolid)).toBe(0);
	});

	it('판의 확정 칸 때문에 단서를 놓을 자리가 없는 줄이 있으면 오류', () => {
		const { picture } = SAMPLE_PICTURES.heart;
		const p = puzzleFromPicture(picture);
		const board = new Board(p);
		// 3행은 [11] (전부 칠) — 가운데를 X 로
		board.set(5, 2, Cell.Crossed);
		const r = runHeadless(p, createGenetic({ seed: 1 }), { board });
		expect(r.outcome.status).toBe('error');
		expect(r.outcome.note).toContain('줄 전파 중 R3 에서 모순');

		// 확정 칸 계산을 끄면 스캔에서 걸린다
		const b2 = new Board(p);
		b2.set(5, 2, Cell.Crossed);
		const off = runHeadless(p, createGenetic({ seed: 1, fixCells: false }), { board: b2 });
		expect(off.outcome.status).toBe('error');
		expect(off.outcome.note).toContain('R3 [11] 를 놓을 자리가 없다');
	});

	it('행·열 단서 합이 다르면 오류 (검증을 거치지 않은 퍼즐)', () => {
		const run = (n: number) => n as LineClue[number];
		const p: Puzzle = {
			width: 2,
			height: 2,
			rows: [[run(2)], [run(1)]],
			cols: [[run(1)], [run(1)]]
		};
		const r = runHeadless(p, createGenetic({ seed: 1 }));
		expect(r.outcome.status).toBe('error');
		expect(r.outcome.note).toContain('행 단서 합(3) ≠ 열 단서 합(2)');
	});

	it('명백하지 않은 불가능(줄 전파로 안 드러남)은 오류로 끝내지 않고 멈출 때까지 진화한다', () => {
		// 4×4 — 줄 전파로 한 칸도 못 정하고 모순도 없지만 해가 없다 (전수 탐색으로 찾은 예)
		const res = createPuzzle([[2], [2], [2], [1, 1]], [[2], [2], [2], [2]]);
		if (!res.ok) throw new Error('잘못된 퍼즐');
		const steps: SolverStep[] = [];
		const r = runHeadless(res.value, createGenetic({ seed: 1, populationSize: 10, polish: 10 }), {
			maxSteps: 7000,
			onStep: (s) => steps.push(s)
		});
		// 오류도 '막힘'도 아니다 — 스스로 끝나지 않고, 실행기가 7000단계에서 멈췄다
		expect(r.outcome.note).toContain('단계가 7000개를 넘었다');
		// 예전 세대 한도(5,000)를 넘어서도 진화를 이어 갔다 (250세대마다 남는 기록)
		expect(notes(steps).some((n) => n.startsWith('세대 6500:'))).toBe(true);
		expect(r.board.memoCount()).toBe(16);
	});
});

describe('보조 함수', () => {
	it('fixedMask 는 확정 칸만 고정으로 본다 (메모는 자유)', () => {
		expect([
			...fixedMask([Cell.Unknown, Cell.Filled, Cell.Crossed, Cell.MemoFilled, Cell.MemoCrossed])
		]).toEqual([Fix.Free, Fix.Fill, Fix.Empty, Fix.Free, Fix.Free]);
	});

	it('주 축 줄은 늘 자기 단서를 만족한다 (디코드 결과)', () => {
		const p = loadJson('random-20-probing');
		const built = buildModel(
			p.rows.map((clue) => ({ fixed: new Uint8Array(p.width), clue })),
			p.cols
		);
		if (!built.ok) throw new Error('배치 없음');
		const ga = new GeneticSearch(built.model, { seed: 9, populationSize: 20, polish: 50 });
		for (let i = 0; i < 20; i++) ga.step();
		const grid = ga.decode(ga.current);
		for (let y = 0; y < p.height; y++) {
			const row = [...grid.subarray(y * p.width, (y + 1) * p.width)] as Cell[];
			expect(isLineSatisfied(row, p.rows[y])).toBe(true);
		}
	});
});
