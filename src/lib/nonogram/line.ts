/**
 * 한 줄(행 또는 열) 단위의 규칙 — 판정과 줄 풀이. DOM·프레임워크와 무관한 순수 함수.
 *
 * 줄 풀이(analyzeLine) 는 참고 사이트 nono_clue_rules.js 의 DP 를 일반화한 것이다:
 * 지금 칠한 칸·X 와 어긋나지 않게 단서를 놓는 모든 방법을 따져서, 칸마다
 * "칠해질 수 있나 / 비워질 수 있나", 숫자마다 "어디서 시작할 수 있나" 를 구한다.
 * 시간 O(n·m) (n = 줄 길이, m = 단서 개수).
 */
import { Cell, isCrossed, isFilled } from './cell.js';
import type { Axis, LineClue, Puzzle } from './puzzle.js';

export type { Axis };

/** 줄 하나를 가리킨다 */
export interface LineRef {
	readonly axis: Axis;
	readonly index: number;
}

export const rowRef = (index: number): LineRef => ({ axis: 'row', index });
export const colRef = (index: number): LineRef => ({ axis: 'col', index });

export const sameLine = (a: LineRef | null | undefined, b: LineRef | null | undefined): boolean =>
	!!a && !!b && a.axis === b.axis && a.index === b.index;

/** 'R12' / 'C5' — 사람이 읽는 1부터 센 이름 */
export const lineLabel = (ref: LineRef): string =>
	`${ref.axis === 'row' ? 'R' : 'C'}${ref.index + 1}`;

/** 맵·셋 키 */
export const lineKey = (ref: LineRef): string => `${ref.axis === 'row' ? 'r' : 'c'}${ref.index}`;

export function lineClue(p: Puzzle, ref: LineRef): LineClue {
	return ref.axis === 'row' ? p.rows[ref.index] : p.cols[ref.index];
}

export function lineLength(p: Pick<Puzzle, 'width' | 'height'>, ref: LineRef): number {
	return ref.axis === 'row' ? p.width : p.height;
}

/** 줄의 k 번째 칸 좌표 */
export function lineCoord(ref: LineRef, k: number): { x: number; y: number } {
	return ref.axis === 'row' ? { x: k, y: ref.index } : { x: ref.index, y: k };
}

/** 모든 줄 — 행 먼저, 그다음 열 */
export function* allLines(p: Pick<Puzzle, 'width' | 'height'>): Generator<LineRef> {
	for (let y = 0; y < p.height; y++) yield rowRef(y);
	for (let x = 0; x < p.width; x++) yield colRef(x);
}

/** 칠한 조각 길이들 (메모 칠도 칠로 센다) */
export function runsOf(line: ArrayLike<Cell>): number[] {
	const runs: number[] = [];
	let cur = 0;
	for (let i = 0; i < line.length; i++) {
		if (isFilled(line[i])) cur++;
		else if (cur > 0) {
			runs.push(cur);
			cur = 0;
		}
	}
	if (cur > 0) runs.push(cur);
	return runs;
}

/**
 * 줄 완성 — 칠한 조각이 단서와 정확히 같다 (사이트의 validateLine).
 * 남은 빈칸은 비어 있어야 하는 칸이므로, 완성된 줄은 빈칸을 X 로 채워도 된다.
 */
export function isLineSatisfied(line: ArrayLike<Cell>, clue: LineClue): boolean {
	const runs = runsOf(line);
	if (runs.length !== clue.length) return false;
	for (let i = 0; i < runs.length; i++) if (runs[i] !== clue[i]) return false;
	return true;
}

export interface LineAnalysis {
	/** 단서를 놓을 방법이 하나라도 있나 — false 면 이 줄은 모순 */
	readonly feasible: boolean;
	/** canFill[i] = 1: i 칸이 칠해지는 배치가 있다 */
	readonly canFill: Uint8Array;
	/** canCross[i] = 1: i 칸이 비워지는 배치가 있다 */
	readonly canCross: Uint8Array;
	/** starts[k] = k 번째 숫자가 시작할 수 있는 칸들 (오름차순) */
	readonly starts: readonly (readonly number[])[];
}

/**
 * 줄 풀이 DP.
 *
 * 상태 (i, k) = "i 칸 앞까지 숫자 0..k-1 을 다 놓았고 i 칸은 새 조각을 시작할 수 있다".
 * 간선: 빈칸 간선 (i,k)→(i+1,k) — i 칸을 비운다 / 조각 간선 (i,k)→(i+L+1,k+1) — 숫자 k 를 i 에 놓고 뒤 한 칸을 비운다.
 * F = 뒤에서부터 끝까지 갈 수 있나, 앞에서부터는 F 가 참인 간선만 따라가면 "모든 해에 쓰이는 간선" 만 남는다.
 */
export function analyzeLine(line: ArrayLike<Cell>, clue: LineClue): LineAnalysis {
	const n = line.length;
	const m = clue.length;
	const W = m + 1;

	// X 개수 누적합 — fits(i, L) 를 O(1) 로
	const xs = new Int32Array(n + 1);
	for (let i = 0; i < n; i++) xs[i + 1] = xs[i] + (isCrossed(line[i]) ? 1 : 0);
	const fits = (i: number, L: number) => i + L <= n && xs[i + L] === xs[i];

	// F[i][k]: i 칸부터 끝까지 숫자 k..m-1 을 놓을 수 있다
	const F = new Uint8Array((n + 1) * W);
	F[n * W + m] = 1;
	const placeOk = (i: number, k: number): boolean => {
		const L = clue[k];
		if (!fits(i, L)) return false;
		const e = i + L;
		if (e === n) return F[n * W + k + 1] === 1;
		return !isFilled(line[e]) && F[(e + 1) * W + k + 1] === 1;
	};
	for (let i = n - 1; i >= 0; i--) {
		const filled = isFilled(line[i]);
		for (let k = m; k >= 0; k--) {
			F[i * W + k] = (!filled && F[(i + 1) * W + k] === 1) || (k < m && placeOk(i, k)) ? 1 : 0;
		}
	}

	const canFill = new Uint8Array(n);
	const canCross = new Uint8Array(n);
	const starts: number[][] = Array.from({ length: m }, () => []);
	if (F[0] !== 1) return { feasible: false, canFill, canCross, starts };

	// 앞에서부터 — 해에 쓰이는 간선만 따라간다
	const B = new Uint8Array((n + 1) * W);
	B[0] = 1;
	const fillDiff = new Int32Array(n + 1);
	for (let i = 0; i < n; i++) {
		const filled = isFilled(line[i]);
		for (let k = 0; k <= m; k++) {
			if (B[i * W + k] !== 1) continue;
			if (!filled && F[(i + 1) * W + k] === 1) {
				B[(i + 1) * W + k] = 1;
				canCross[i] = 1;
			}
			if (k < m && placeOk(i, k)) {
				const e = i + clue[k];
				starts[k].push(i);
				fillDiff[i]++;
				fillDiff[e]--;
				if (e === n) B[n * W + k + 1] = 1;
				else {
					canCross[e] = 1;
					B[(e + 1) * W + k + 1] = 1;
				}
			}
		}
	}
	let acc = 0;
	for (let i = 0; i < n; i++) {
		acc += fillDiff[i];
		if (acc > 0) canFill[i] = 1;
	}
	return { feasible: true, canFill, canCross, starts };
}

/** 줄 풀이 결과로 새로 정해지는 칸 */
export interface LineDeduction {
	/** 줄 안의 위치 */
	readonly offset: number;
	readonly value: typeof Cell.Filled | typeof Cell.Crossed;
}

/**
 * 아직 빈칸인 칸 중 모든 배치에서 같은 값인 칸을 돌려준다. 모순이면 null.
 * 메모 칸은 이미 정해진 칸으로 본다.
 */
export function deduceFromAnalysis(line: ArrayLike<Cell>, a: LineAnalysis): LineDeduction[] | null {
	if (!a.feasible) return null;
	const out: LineDeduction[] = [];
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== Cell.Unknown) continue;
		const f = a.canFill[i] === 1;
		const c = a.canCross[i] === 1;
		if (f && !c) out.push({ offset: i, value: Cell.Filled });
		else if (c && !f) out.push({ offset: i, value: Cell.Crossed });
	}
	return out;
}

/** 완전한 줄 풀이 — 이 줄만 보고 알 수 있는 것은 모두 찾는다 */
export function solveLine(line: ArrayLike<Cell>, clue: LineClue): LineDeduction[] | null {
	return deduceFromAnalysis(line, analyzeLine(line, clue));
}

/**
 * 좌우 극단 겹치기(LR overlap) — 사람 손풀이의 "겹치기" 와 "닿지 않는 칸 지우기".
 * 숫자 k 가 놓일 수 있는 가장 왼쪽·가장 오른쪽 자리를 구해,
 *   - 두 자리가 겹치는 칸은 칠하고
 *   - 어느 숫자의 범위에도 들지 않는 칸은 X.
 * solveLine 보다 약하다(예: 범위가 겹치는 두 숫자 사이의 칸은 놓친다). 모순이면 null.
 */
export function overlapLine(line: ArrayLike<Cell>, clue: LineClue): LineDeduction[] | null {
	const a = analyzeLine(line, clue);
	if (!a.feasible) return null;
	const n = line.length;
	const verdict = new Int8Array(n); // 1 칠, 2 X, 0 모름
	const reach = new Int32Array(n + 1);
	clue.forEach((L, k) => {
		const left = a.starts[k][0];
		const right = a.starts[k][a.starts[k].length - 1];
		for (let i = right; i < left + L; i++) verdict[i] = 1;
		reach[left]++;
		reach[right + L]--;
	});
	let acc = 0;
	for (let i = 0; i < n; i++) {
		acc += reach[i];
		if (acc === 0) verdict[i] = 2;
	}
	const out: LineDeduction[] = [];
	for (let i = 0; i < n; i++) {
		if (line[i] !== Cell.Unknown || verdict[i] === 0) continue;
		out.push({ offset: i, value: verdict[i] === 1 ? Cell.Filled : Cell.Crossed });
	}
	return out;
}

/**
 * 끝난 조각 숫자 지우기 (사이트 nono_clue_rules.js 의 crossed) — clue 와 같은 길이의 플래그.
 * 숫자의 자리가 하나로 정해졌고 그 칸을 다 칠했으면 true. 모순인 줄은 하나도 지우지 않는다.
 */
export function settledClues(
	line: ArrayLike<Cell>,
	clue: LineClue,
	a: LineAnalysis = analyzeLine(line, clue)
): boolean[] {
	if (!a.feasible) return clue.map(() => false);
	return clue.map((L, k) => {
		if (a.starts[k].length !== 1) return false;
		const s = a.starts[k][0];
		for (let j = s; j < s + L; j++) if (!isFilled(line[j])) return false;
		return true;
	});
}
