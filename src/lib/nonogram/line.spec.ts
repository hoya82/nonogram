import { describe, expect, it } from 'vitest';
import { Cell } from './cell.js';
import {
	analyzeLine,
	isLineSatisfied,
	overlapLine,
	runsOf,
	settledClues,
	solveLine
} from './line.js';
import type { LineClue } from './puzzle.js';

/** '_' 빈칸, '#' 칠, 'x' X, '^' 메모 칠, '/' 메모 X */
function L(s: string): Cell[] {
	const map: Record<string, Cell> = {
		_: Cell.Unknown,
		'#': Cell.Filled,
		x: Cell.Crossed,
		'^': Cell.MemoFilled,
		'/': Cell.MemoCrossed
	};
	return [...s].map((ch) => map[ch]);
}
const C = (...n: number[]) => n as unknown as LineClue;

/** 가능한 모든 칠하기를 나열하는 기준 구현 */
function brute(line: Cell[], clue: LineClue) {
	const n = line.length;
	const canFill = new Array<number>(n).fill(0);
	const canCross = new Array<number>(n).fill(0);
	let feasible = false;
	for (let mask = 0; mask < 1 << n; mask++) {
		const arr: Cell[] = [];
		let ok = true;
		for (let i = 0; i < n; i++) {
			const f = (mask >> i) & 1;
			arr.push(f ? Cell.Filled : Cell.Crossed);
			if ((line[i] === Cell.Filled || line[i] === Cell.MemoFilled) && !f) ok = false;
			if ((line[i] === Cell.Crossed || line[i] === Cell.MemoCrossed) && f) ok = false;
		}
		if (!ok || !isLineSatisfied(arr, clue)) continue;
		feasible = true;
		arr.forEach((v, i) => (v === Cell.Filled ? (canFill[i] = 1) : (canCross[i] = 1)));
	}
	return { feasible, canFill, canCross };
}

function rng(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
}

describe('runsOf / isLineSatisfied', () => {
	it('메모 칠도 칠로 센다', () => {
		expect(runsOf(L('##_^#x#'))).toEqual([2, 2, 1]);
		expect(isLineSatisfied(L('##_^#x#'), C(2, 2, 1))).toBe(true);
		expect(isLineSatisfied(L('____'), C())).toBe(true);
		expect(isLineSatisfied(L('_#__'), C())).toBe(false);
	});
});

describe('analyzeLine', () => {
	it('무작위 줄에서 모든 배치를 나열한 결과와 같다', () => {
		const r = rng(42);
		for (let t = 0; t < 3000; t++) {
			const n = 1 + Math.floor(r() * 10);
			const sol = Array.from({ length: n }, () => (r() < 0.5 ? Cell.Filled : Cell.Crossed));
			let clue = runsOf(sol);
			if (r() < 0.2) clue = clue.map((v) => v + (r() < 0.3 ? 1 : 0));
			const cells = sol.map((v): Cell => {
				const q = r();
				if (q < 0.55) return Cell.Unknown;
				if (q < 0.85) return v;
				if (q < 0.92) return v === Cell.Filled ? Cell.MemoFilled : Cell.MemoCrossed;
				return v === Cell.Filled ? Cell.Crossed : Cell.Filled;
			});
			const a = analyzeLine(cells, clue as unknown as LineClue);
			const b = brute(cells, clue as unknown as LineClue);
			expect(a.feasible).toBe(b.feasible);
			if (b.feasible) {
				expect([...a.canFill]).toEqual(b.canFill);
				expect([...a.canCross]).toEqual(b.canCross);
			}
		}
	});

	it('숫자마다 시작 가능한 칸을 구한다', () => {
		const a = analyzeLine(L('_____'), C(3));
		expect(a.starts).toEqual([[0, 1, 2]]);
	});
});

describe('solveLine', () => {
	it('겹치는 칸을 칠한다', () => {
		const d = solveLine(L('__________'), C(8));
		expect(d?.filter((x) => x.value === Cell.Filled).map((x) => x.offset)).toEqual([
			2, 3, 4, 5, 6, 7
		]);
	});
	it('모순이면 null', () => {
		expect(solveLine(L('#x#'), C(3))).toBeNull();
	});
	it('빈 단서는 모두 X', () => {
		expect(solveLine(L('___'), C())?.every((d) => d.value === Cell.Crossed)).toBe(true);
	});
});

describe('overlapLine', () => {
	it('solveLine 이 찾은 것의 부분집합이다 (건전하다)', () => {
		const r = rng(7);
		for (let t = 0; t < 2000; t++) {
			const n = 1 + Math.floor(r() * 12);
			const sol = Array.from({ length: n }, () => (r() < 0.5 ? Cell.Filled : Cell.Crossed));
			const clue = runsOf(sol) as unknown as LineClue;
			const cells = sol.map((v) => (r() < 0.6 ? Cell.Unknown : v));
			const full = new Map(solveLine(cells, clue)!.map((d) => [d.offset, d.value]));
			for (const d of overlapLine(cells, clue)!) expect(full.get(d.offset)).toBe(d.value);
		}
	});
});

describe('settledClues (사이트 끝난 조각 숫자 지우기)', () => {
	it('2 2 2 줄 _##_____## → 앞 2·뒤 2 지움, 가운데는 모름', () => {
		expect(settledClues(L('_##_____##'), C(2, 2, 2))).toEqual([true, false, true]);
	});
	it('모순 줄은 하나도 지우지 않는다', () => {
		expect(settledClues(L('###'), C(1))).toEqual([false]);
	});
});
