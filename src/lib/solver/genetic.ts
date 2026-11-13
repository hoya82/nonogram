/**
 * 유전 알고리즘 핵심 — 판·단계·화면과 무관한 순수 계산 (전략은 strategies/genetic.ts).
 *
 * 용어
 *   - 주 축(primary): 유전자로 삼는 축(행 또는 열). 주 축 줄은 언제나 자기 단서를 만족하는 배치만 갖는다.
 *   - 반대 축(secondary): 평가 축. 개체를 반대 축 줄로 읽어 단서와 얼마나 어긋나는지 잰다.
 *   - 유전자: 주 축 줄 하나의 "틈마다 넣은 여분 빈칸 수" e[0..m].
 *       e[0] = 첫 조각 앞, e[k] = 조각 k−1 과 k 사이(필수 빈칸 1칸 뒤에 더 넣은 수), e[m] = 끝.
 *       Σe = 여유(줄 길이 − 최소 길이). 빈칸 하나를 다른 틈으로 옮기면 그 사이 조각들이 한 칸씩 움직인다.
 *   - 고정 칸: 판에 이미 확정된 칸(칠/X). 주 축 줄의 배치는 고정 칸과 어긋나지 않는 것만 쓴다.
 *   - 불일치도(fitness, 작을수록 좋다): 반대 축 줄마다 "단서를 만족시키려면 최소 몇 칸을 뒤집어야 하나" 의 합.
 *       0 이면 모든 줄이 단서와 맞는다 = 풀렸다.
 */
import { Cell } from '../nonogram/cell.js';

/** 고정 칸 표시 — 0 자유, 1 칠해야 함, 2 비워야 함 */
export const Fix = { Free: 0, Fill: 1, Empty: 2 } as const;

/** 판의 칸 값 → 고정 표시 (메모·빈칸은 자유) */
export function fixedMask(line: ArrayLike<Cell>): Uint8Array {
	const out = new Uint8Array(line.length);
	for (let i = 0; i < line.length; i++) {
		if (line[i] === Cell.Filled) out[i] = Fix.Fill;
		else if (line[i] === Cell.Crossed) out[i] = Fix.Empty;
	}
	return out;
}

/** 단서를 놓는 데 필요한 최소 칸 수 */
export function minLength(clue: readonly number[]): number {
	if (clue.length === 0) return 0;
	let s = clue.length - 1;
	for (const c of clue) s += c;
	return s;
}

// ── 경우의 수 (배치 세기) ────────────────────────────────

/**
 * 줄 배치 세기 DP.
 * ways[i·(m+1) + k] = "i 칸부터 끝까지 조각 k..m−1 을 놓는 방법 수" (i 칸에서 새 조각을 시작할 수 있는 상태).
 * 고정 칸과 어긋나는 배치는 세지 않는다. 수가 크면 근삿값(부동소수)이다.
 */
export interface PlacementTable {
	readonly clue: readonly number[];
	readonly fixed: Uint8Array;
	readonly ways: Float64Array;
	/** 전체 배치 수 (= ways[0]) */
	readonly count: number;
}

export function countPlacements(fixed: Uint8Array, clue: readonly number[]): PlacementTable {
	const n = fixed.length;
	const m = clue.length;
	const W = m + 1;
	// 비워야 하는 칸 누적합 — "i..i+L 에 비워야 하는 칸이 없나" 를 O(1) 로
	const empties = new Int32Array(n + 1);
	for (let i = 0; i < n; i++) empties[i + 1] = empties[i] + (fixed[i] === Fix.Empty ? 1 : 0);

	const ways = new Float64Array((n + 1) * W);
	ways[n * W + m] = 1;
	for (let i = n - 1; i >= 0; i--) {
		for (let k = m; k >= 0; k--) {
			let w = fixed[i] !== Fix.Fill ? ways[(i + 1) * W + k] : 0;
			if (k < m) w += placeWays(fixed, clue, empties, ways, W, i, k);
			ways[i * W + k] = w;
		}
	}
	return { clue, fixed, ways, count: ways[0] };
}

/** 조각 k 를 i 에 놓고 이어 가는 방법 수 */
function placeWays(
	fixed: Uint8Array,
	clue: readonly number[],
	empties: Int32Array,
	ways: Float64Array,
	W: number,
	i: number,
	k: number
): number {
	const n = fixed.length;
	const e = i + clue[k];
	if (e > n || empties[e] !== empties[i]) return 0;
	if (e === n) return ways[n * W + k + 1];
	return fixed[e] !== Fix.Fill ? ways[(e + 1) * W + k + 1] : 0;
}

/** 배치 수를 사람이 읽는 문자열로 (큰 수는 지수 표기) */
export function formatCount(n: number): string {
	if (n < 1e9) return Math.round(n).toLocaleString('en-US');
	return n.toExponential(2).replace('e+', 'e');
}

// ── 유전자 ↔ 칸 ─────────────────────────────────────────

/** 유전자(틈마다 여분 빈칸 수) → 칸(1 칠 / 0 빈칸). out[base + i·step] 에 쓴다 */
export function decodeGaps(
	gaps: ArrayLike<number>,
	gOff: number,
	clue: readonly number[],
	n: number,
	out: Uint8Array,
	base = 0,
	step = 1
): void {
	for (let i = 0; i < n; i++) out[base + i * step] = 0;
	let pos = 0;
	for (let k = 0; k < clue.length; k++) {
		pos += gaps[gOff + k];
		for (let j = 0; j < clue[k]; j++) out[base + (pos + j) * step] = 1;
		pos += clue[k] + 1;
	}
}

/** 유전자가 고정 칸과 어긋나지 않나 */
export function gapsFit(
	gaps: ArrayLike<number>,
	gOff: number,
	clue: readonly number[],
	fixed: Uint8Array
): boolean {
	const n = fixed.length;
	let pos = 0;
	for (let k = 0; k <= clue.length; k++) {
		// 빈칸 구간: 여분 빈칸 + (조각 사이면) 필수 빈칸 1칸
		const blank = gaps[gOff + k] + (k > 0 && k < clue.length ? 1 : 0);
		for (let j = 0; j < blank; j++) if (fixed[pos + j] === Fix.Fill) return false;
		pos += blank;
		if (k === clue.length) break;
		for (let j = 0; j < clue[k]; j++) if (fixed[pos + j] === Fix.Empty) return false;
		pos += clue[k];
	}
	return pos === n;
}

/** 고정 칸과 어긋나지 않는 배치 중 하나를 고르게(uniform) 뽑아 유전자로 쓴다. 배치가 없으면 false */
export function sampleGaps(
	table: PlacementTable,
	rng: () => number,
	out: Uint8Array,
	gOff: number
): boolean {
	const { clue, fixed, ways } = table;
	if (!(table.count > 0)) return false;
	const n = fixed.length;
	const m = clue.length;
	const W = m + 1;
	const empties = new Int32Array(n + 1);
	for (let i = 0; i < n; i++) empties[i + 1] = empties[i] + (fixed[i] === Fix.Empty ? 1 : 0);

	let i = 0;
	let k = 0;
	let run = 0; // 지금 틈에 쌓인 여분 빈칸
	while (k < m) {
		const wEmpty = fixed[i] !== Fix.Fill ? ways[(i + 1) * W + k] : 0;
		const wPlace = placeWays(fixed, clue, empties, ways, W, i, k);
		if (rng() * (wEmpty + wPlace) < wEmpty) {
			run++;
			i++;
		} else {
			out[gOff + k] = run;
			run = 0;
			i += clue[k] + 1; // 조각 + 필수 빈칸 (마지막 조각이면 줄 끝을 넘어갈 수 있다 — 아래에서 보정)
			k++;
		}
	}
	out[gOff + m] = m === 0 ? n : Math.max(0, n - i + 1);
	return true;
}

/**
 * 빈칸 하나 옮기기 중 고정 칸과 어긋나지 않는 것을 모두 out 에 쓰고 개수를 돌려준다. 이동은 `from·(m+1) + to` (틈 번호).
 *
 * 틈 a 의 여분 빈칸 하나를 틈 b 로 옮기면 그 사이 조각들이 한 칸씩 밀린다 — a < b 면 조각 a..b−1 이 왼쪽으로,
 * a > b 면 조각 b..a−1 이 오른쪽으로. 조각 하나가 밀릴 때 바뀌는 칸은 둘(새로 칠해지는 칸, 새로 비는 칸)뿐이라
 * 그 두 칸만 고정 칸과 맞춰 본다. b 를 a 에서 가까운 쪽부터 넓혀 가다 막히면 그 너머도 모두 막힌다.
 * 유전자는 늘 고정 칸과 맞는 상태여야 한다(초기화·교차·변이가 모두 이 불변식을 지킨다).
 * starts 는 조각 수 이상, out 은 (m+1)² 이상 길이의 작업 버퍼.
 */
export function gapMoves(
	gaps: ArrayLike<number>,
	gOff: number,
	clue: readonly number[],
	fixed: Uint8Array,
	starts: Int32Array,
	out: Int32Array
): number {
	const m = clue.length;
	const slots = m + 1;
	let pos = 0;
	for (let k = 0; k < m; k++) {
		pos += gaps[gOff + k];
		starts[k] = pos;
		pos += clue[k] + 1;
	}
	let n = 0;
	for (let a = 0; a < slots; a++) {
		if (gaps[gOff + a] === 0) continue;
		// 오른쪽 틈으로 — 조각 a, a+1, … 이 차례로 왼쪽으로 한 칸 (앞 칸이 칠해지고 끝 칸이 빈다)
		for (let b = a + 1; b < slots; b++) {
			const k = b - 1;
			if (fixed[starts[k] - 1] === Fix.Empty || fixed[starts[k] + clue[k] - 1] === Fix.Fill) break;
			out[n++] = a * slots + b;
		}
		// 왼쪽 틈으로 — 조각 a−1, a−2, … 이 차례로 오른쪽으로 한 칸 (첫 칸이 비고 뒤 칸이 칠해진다)
		for (let b = a - 1; b >= 0; b--) {
			const k = b;
			if (fixed[starts[k]] === Fix.Fill || fixed[starts[k] + clue[k]] === Fix.Empty) break;
			out[n++] = a * slots + b;
		}
	}
	return n;
}

// ── 불일치도 ────────────────────────────────────────────

/**
 * 줄 거리 DP — cells(0/1) 를 단서에 맞추려면 최소 몇 칸을 뒤집어야 하나. O(n·m).
 * 칸은 cells[base + i·step]. 작업 버퍼 cost·pre 는 호출하는 쪽이 재사용한다(길이 (n+1)(m+1), n+1 이상).
 */
export function lineDistance(
	cells: Uint8Array,
	base: number,
	step: number,
	n: number,
	clue: readonly number[],
	cost: Int32Array,
	pre: Int32Array
): number {
	const m = clue.length;
	const W = m + 1;
	const INF = 1 << 29;
	pre[0] = 0;
	for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + cells[base + i * step];
	if (m === 0) return pre[n];

	for (let k = 0; k < m; k++) cost[n * W + k] = INF;
	cost[n * W + m] = 0;
	for (let i = n - 1; i >= 0; i--) {
		const v = cells[base + i * step];
		for (let k = m; k >= 0; k--) {
			let best = v + cost[(i + 1) * W + k];
			if (k < m) {
				const L = clue[k];
				const e = i + L;
				if (e <= n) {
					const zeros = L - (pre[e] - pre[i]);
					const rest =
						e === n ? cost[n * W + k + 1] : cells[base + e * step] + cost[(e + 1) * W + k + 1];
					if (zeros + rest < best) best = zeros + rest;
				}
			}
			cost[i * W + k] = best;
		}
	}
	return cost[0];
}

// ── 문제 모델 ────────────────────────────────────────────

/** 주 축 줄 하나 */
export interface GeneLine {
	readonly clue: readonly number[];
	readonly table: PlacementTable;
	/** 염색체 안에서 이 줄 유전자의 시작 위치 */
	readonly offset: number;
	/** 배치가 둘 이상이라 변이할 수 있다 */
	readonly mutable: boolean;
}

export interface GeneticModel {
	/** 주 축 줄 수 */
	readonly P: number;
	/** 주 축 줄 길이 = 반대 축 줄 수 */
	readonly Q: number;
	readonly lines: readonly GeneLine[];
	readonly secondary: readonly (readonly number[])[];
	/** 염색체 길이 = Σ(조각 수 + 1) */
	readonly geneLength: number;
}

/** 주 축 줄의 고정 표시·단서와 반대 축 단서로 모델을 만든다. 배치가 없는 줄이 있으면 그 번호를 돌려준다 */
export function buildModel(
	primary: readonly { readonly fixed: Uint8Array; readonly clue: readonly number[] }[],
	secondary: readonly (readonly number[])[]
): { ok: true; model: GeneticModel } | { ok: false; line: number } {
	const lines: GeneLine[] = [];
	let offset = 0;
	for (let p = 0; p < primary.length; p++) {
		// 단서는 평범한 배열로 복사한다 — 얼린(frozen) 배열은 안쪽 반복에서 몇 배 느리다
		const clue = [...primary[p].clue];
		const table = countPlacements(primary[p].fixed, clue);
		if (!(table.count > 0)) return { ok: false, line: p };
		lines.push({ clue, table, offset, mutable: table.count > 1 });
		offset += clue.length + 1;
	}
	const Q = primary[0]?.fixed.length ?? 0;
	const sec = secondary.map((c) => [...c]);
	return { ok: true, model: { P: primary.length, Q, lines, secondary: sec, geneLength: offset } };
}

// ── 난수 ────────────────────────────────────────────────

/** 씨앗으로 같은 수열을 내는 난수 (mulberry32) — 시험에서 진화를 재현한다 */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ── 진화 ────────────────────────────────────────────────

export interface GeneticOptions {
	/** 개체 수 */
	readonly populationSize: number;
	/** 그대로 다음 세대로 넘기는 최상위 개체 수 */
	readonly eliteCount: number;
	/** 토너먼트 선택 크기 */
	readonly tournamentSize: number;
	/** 교차 확률 (아니면 부모 하나를 복제) */
	readonly crossoverRate: number;
	/** 교차 방식 — 'uniform': 줄마다 부모를 고른다 / 'two-point': 이어진 줄 묶음을 바꾼다 */
	readonly crossover: 'uniform' | 'two-point';
	/** 줄마다 변이할 확률 (자식마다 적어도 한 줄은 변이한다) */
	readonly mutationRate: number;
	/** 변이 중 줄 하나를 통째로 다시 뽑는 비율 (나머지는 빈칸 하나 옮기기) */
	readonly resampleRate: number;
	/**
	 * 다듬기 — 세대마다 최선 개체에 줄 변이를 이만큼 해 보고, 불일치도가 나빠지지 않는 것만 받아들인다
	 * (메메틱 GA). 0 이면 순수 GA. 20×20 이상에서 큰 차이가 난다 (docs/milestones 의 M1 측정 참고).
	 */
	readonly polish: number;
	/** 이만큼 세대 동안 개체군의 최선이 나아지지 않으면 개체군을 통째로 새로 뿌린다 (0 = 하지 않음) */
	readonly stagnationLimit: number;
	/** 난수 씨앗 */
	readonly seed: number;
}

/** 기본값 — 예제·무작위 판으로 맞춘 값 (docs/milestones/M1 의 측정 참고) */
export const DEFAULT_GENETIC_OPTIONS: GeneticOptions = {
	populationSize: 100,
	eliteCount: 2,
	tournamentSize: 3,
	crossoverRate: 0.9,
	crossover: 'two-point',
	mutationRate: 0.1,
	resampleRate: 0.15,
	polish: 800,
	stagnationLimit: 300,
	seed: 1
};

export interface Individual {
	readonly genes: Uint8Array;
	fitness: number;
}

export interface GenerationReport {
	readonly generation: number;
	/** 지금 개체군의 최선 불일치도 */
	readonly fitness: number;
	/** 지금까지 본 최선 불일치도 (재시작 전 포함) */
	readonly bestFitness: number;
	/** 이번 세대에 개체군의 최선이 나아졌다 */
	readonly improved: boolean;
	/** 이번 세대에 정체로 개체군을 새로 뿌렸다 */
	readonly restarted: boolean;
	/** 개체군 평균 불일치도 */
	readonly meanFitness: number;
}

export class GeneticSearch {
	readonly model: GeneticModel;
	readonly options: GeneticOptions;
	generation = 0;
	restarts = 0;

	readonly #rng: () => number;
	#pop: Individual[] = [];
	#best: Individual;
	#sinceImprove = 0;
	readonly #grid: Uint8Array;
	readonly #cost: Int32Array;
	readonly #pre: Int32Array;
	readonly #mutable: number[];
	// 변이 작업 버퍼
	readonly #starts: Int32Array;
	readonly #moves: Int32Array;
	// 다듬기 작업 버퍼
	readonly #pgrid: Uint8Array;
	readonly #pcol: Int32Array;
	readonly #prow: Uint8Array;
	readonly #psaved: Uint8Array;
	readonly #pchanged: Int32Array;
	readonly #pfresh: Int32Array;

	constructor(model: GeneticModel, options: Partial<GeneticOptions> = {}) {
		this.model = model;
		this.options = { ...DEFAULT_GENETIC_OPTIONS, ...options };
		this.#rng = mulberry32(this.options.seed);
		this.#grid = new Uint8Array(model.P * model.Q);
		const maxM = Math.max(0, ...model.secondary.map((c) => c.length));
		this.#cost = new Int32Array((model.P + 1) * (maxM + 1));
		this.#pre = new Int32Array(model.P + 1);
		this.#mutable = model.lines.flatMap((l, p) => (l.mutable ? [p] : []));
		const maxBlocks = Math.max(0, ...model.lines.map((l) => l.clue.length));
		this.#starts = new Int32Array(Math.max(1, maxBlocks));
		this.#moves = new Int32Array((maxBlocks + 1) ** 2);
		this.#pgrid = new Uint8Array(model.P * model.Q);
		this.#pcol = new Int32Array(model.Q);
		this.#prow = new Uint8Array(model.Q);
		this.#psaved = new Uint8Array(Math.max(1, ...model.lines.map((l) => l.clue.length + 1)));
		this.#pchanged = new Int32Array(model.Q);
		this.#pfresh = new Int32Array(model.Q);
		this.#seed();
		this.#best = this.#pop[0];
	}

	/** 지금 개체군의 최선 */
	get current(): Individual {
		return this.#pop[0];
	}
	/** 지금까지 본 최선 */
	get best(): Individual {
		return this.#best;
	}
	/** 지금 개체군 (불일치도 오름차순) — 읽기만 한다 */
	get population(): readonly Individual[] {
		return this.#pop;
	}

	/** 개체 → 칸(주 축 줄 우선, P×Q, 1 칠 / 0 빈칸) */
	decode(
		ind: Individual,
		out: Uint8Array = new Uint8Array(this.model.P * this.model.Q)
	): Uint8Array {
		const { lines, Q } = this.model;
		for (let p = 0; p < lines.length; p++) {
			decodeGaps(ind.genes, lines[p].offset, lines[p].clue, Q, out, p * Q, 1);
		}
		return out;
	}

	/** 불일치도 — 반대 축 줄마다 최소 뒤집기 수의 합 */
	evaluate(genes: Uint8Array): number {
		const { P, Q, secondary } = this.model;
		this.decode({ genes, fitness: 0 }, this.#grid);
		let sum = 0;
		for (let q = 0; q < Q; q++) {
			sum += lineDistance(this.#grid, q, Q, P, secondary[q], this.#cost, this.#pre);
		}
		return sum;
	}

	/** 한 세대 진화 */
	step(): GenerationReport {
		const o = this.options;
		const prev = this.#pop[0].fitness;
		const next: Individual[] = this.#pop.slice(0, Math.min(o.eliteCount, this.#pop.length));
		while (next.length < o.populationSize) {
			const a = this.#select();
			let genes: Uint8Array;
			if (this.#rng() < o.crossoverRate) genes = this.#crossover(a, this.#select());
			else genes = a.genes.slice();
			this.#mutate(genes);
			next.push({ genes, fitness: this.evaluate(genes) });
		}
		this.#pop = next;
		this.#sort();
		if (o.polish > 0) this.#pop[0] = this.#polish(this.#pop[0], o.polish);
		this.generation++;

		const improved = this.#pop[0].fitness < prev;
		this.#sinceImprove = improved ? 0 : this.#sinceImprove + 1;
		if (this.#pop[0].fitness < this.#best.fitness) this.#best = this.#pop[0];

		let restarted = false;
		if (
			o.stagnationLimit > 0 &&
			this.#sinceImprove >= o.stagnationLimit &&
			this.#best.fitness > 0
		) {
			// 정체 — 개체군을 통째로 새로 뿌린다. 최상위를 남기면 금세 같은 골짜기(지역 최적)로 돌아간다
			this.#seed();
			this.#sinceImprove = 0;
			this.restarts++;
			restarted = true;
		}
		let total = 0;
		for (const ind of this.#pop) total += ind.fitness;
		return {
			generation: this.generation,
			fitness: this.#pop[0].fitness,
			bestFitness: this.#best.fitness,
			improved,
			restarted,
			meanFitness: total / this.#pop.length
		};
	}

	// ── 내부 ──────────────────────────────────────────────

	/**
	 * 다듬기 — 개체 하나에 줄 변이를 tries 번 해 보고, 불일치도가 나빠지지 않으면 받아들인다(같아도 받아들여
	 * 평평한 곳을 걸어 다닌다). 바뀐 줄이 지나는 반대 축 줄만 다시 재는 증분 평가라 싸다.
	 */
	#polish(ind: Individual, tries: number): Individual {
		const { P, Q, lines, secondary } = this.model;
		const mutable = this.#mutable;
		if (mutable.length === 0 || ind.fitness === 0) return ind;
		const genes = ind.genes.slice();
		const grid = this.#pgrid;
		this.decode(ind, grid);
		const colCost = this.#pcol;
		let f = 0;
		for (let q = 0; q < Q; q++) {
			colCost[q] = lineDistance(grid, q, Q, P, secondary[q], this.#cost, this.#pre);
			f += colCost[q];
		}
		const row = this.#prow;
		const saved = this.#psaved;
		const changed = this.#pchanged;
		const fresh = this.#pfresh;
		for (let t = 0; t < tries && f > 0; t++) {
			const p = mutable[Math.floor(this.#rng() * mutable.length)];
			const { offset, clue } = lines[p];
			const end = offset + clue.length + 1;
			for (let g = offset; g < end; g++) saved[g - offset] = genes[g];
			this.#mutateLine(genes, p);
			decodeGaps(genes, offset, clue, Q, row, 0, 1);
			let nChanged = 0;
			for (let q = 0; q < Q; q++) {
				if (grid[p * Q + q] === row[q]) continue;
				grid[p * Q + q] = row[q];
				changed[nChanged++] = q;
			}
			let delta = 0;
			for (let c = 0; c < nChanged; c++) {
				const q = changed[c];
				fresh[c] = lineDistance(grid, q, Q, P, secondary[q], this.#cost, this.#pre);
				delta += fresh[c] - colCost[q];
			}
			if (delta <= 0) {
				for (let c = 0; c < nChanged; c++) colCost[changed[c]] = fresh[c];
				f += delta;
			} else {
				for (let g = offset; g < end; g++) genes[g] = saved[g - offset];
				for (let c = 0; c < nChanged; c++) grid[p * Q + changed[c]] ^= 1;
			}
		}
		return { genes, fitness: f };
	}

	#seed(): void {
		this.#pop = [];
		for (let i = 0; i < this.options.populationSize; i++) this.#pop.push(this.#random());
		this.#sort();
	}

	#random(): Individual {
		const genes = new Uint8Array(this.model.geneLength);
		for (const line of this.model.lines) sampleGaps(line.table, this.#rng, genes, line.offset);
		return { genes, fitness: this.evaluate(genes) };
	}

	#sort(): void {
		this.#pop.sort((a, b) => a.fitness - b.fitness);
	}

	#select(): Individual {
		let best: Individual | null = null;
		for (let t = 0; t < this.options.tournamentSize; t++) {
			const c = this.#pop[Math.floor(this.#rng() * this.#pop.length)];
			if (!best || c.fitness < best.fitness) best = c;
		}
		return best!;
	}

	/** 줄 단위 균등 교차 — 줄마다 어느 부모의 배치를 물려받을지 고른다 (줄은 늘 단서를 만족한다) */
	#crossover(a: Individual, b: Individual): Uint8Array {
		const child = a.genes.slice();
		const P = this.model.P;
		let lo = 0;
		let hi = P;
		if (this.options.crossover === 'two-point') {
			lo = Math.floor(this.#rng() * P);
			hi = lo + 1 + Math.floor(this.#rng() * (P - 1));
		}
		for (let p = 0; p < P; p++) {
			const line = this.model.lines[p];
			if (this.options.crossover === 'two-point') {
				const inside = (p >= lo && p < hi) || p + P < hi;
				if (!inside) continue;
			} else if (this.#rng() < 0.5) continue;
			const end = line.offset + line.clue.length + 1;
			for (let g = line.offset; g < end; g++) child[g] = b.genes[g];
		}
		return child;
	}

	#mutate(genes: Uint8Array): void {
		const mutable = this.#mutable;
		if (mutable.length === 0) return;
		let any = false;
		for (const p of mutable) {
			if (this.#rng() < this.options.mutationRate) {
				this.#mutateLine(genes, p);
				any = true;
			}
		}
		if (!any) this.#mutateLine(genes, mutable[Math.floor(this.#rng() * mutable.length)]);
	}

	/**
	 * 줄 하나 변이 — 빈칸 하나를 다른 틈으로 옮기거나(조각 이동), 줄을 통째로 다시 뽑는다.
	 * 옮기기는 고정 칸(불변 칸)과 어긋나지 않는 이동만 골라 그중 하나를 고르게 뽑는다 — 고정 칸은 변이되지 않는다.
	 * 그런 이동이 없거나 다시 뽑기로 정해지면 고정 칸과 맞는 배치 가운데서 고르게 다시 뽑는다.
	 */
	#mutateLine(genes: Uint8Array, p: number): void {
		const { offset, clue, table } = this.model.lines[p];
		if (clue.length > 0 && this.#rng() >= this.options.resampleRate) {
			const n = gapMoves(genes, offset, clue, table.fixed, this.#starts, this.#moves);
			if (n > 0) {
				const mv = this.#moves[Math.floor(this.#rng() * n)];
				const slots = clue.length + 1;
				genes[offset + Math.floor(mv / slots)]--;
				genes[offset + (mv % slots)]++;
				return;
			}
		}
		sampleGaps(table, this.#rng, genes, offset);
	}
}
