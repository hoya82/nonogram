/**
 * 완전 탐색 핵심 — 판·단계·화면과 무관한 순수 계산 (전략은 strategies/backtracking.ts).
 *
 * 줄 전파 + 가정 & 모순(탐침) + 깊이 우선 분기.
 *
 *   1. 노드마다 줄 전파를 고정점까지 돌린다.
 *   2. 탐침: 빈칸마다 칠/X 를 각각 가정하고 전파해 본다. 한쪽이 모순이면 반대 값으로 확정, 양쪽에서 같게 정해진
 *      칸도 확정. 더 정해지는 게 없을 때까지 되풀이한다.
 *   3. 그래도 빈칸이 남으면 칸 하나를 골라 칠 / X 두 가지로 나눠 내려간다(깊이 우선). 고르는 칸은 탐침에서
 *      "칠 가정으로 정해지는 칸 수 × X 가정으로 정해지는 칸 수" 가 가장 큰 칸 — 어느 쪽이든 많이 정해진다.
 *
 * 버린 가지에는 모두 "이 안에 해가 없다" 는 증명(모순)이 있다. 그래서 탐색을 끝까지 하면 해의 수가 정확하다:
 * 0 = 해 없음, 1 = 유일해, 2 이상 = 해가 여럿. 탐색 공간(40×40 이면 10^482)을 하나씩 보는 게 아니라 모순으로
 * 가지째 잘라 내므로, 사람이 만든 판은 대개 노드 수십~수천 개로 끝난다. 일반 노노그램은 NP-완전이라 최악은 지수적이다.
 *
 * 격자 값은 Cell 의 확정 값과 같다: 0 미정 · 1 칠 · 2 X. 칸 번호 i = y·width + x.
 */
import { Cell } from '../nonogram/cell.js';
import type { Puzzle } from '../nonogram/puzzle.js';

const UNKNOWN = Cell.Unknown;
const FILLED = Cell.Filled;
const CROSSED = Cell.Crossed;

type Clue = readonly number[];

// ── 줄 풀이 (할당 없음) ──────────────────────────────────

/**
 * 완전 줄 풀이 — line.ts 의 analyzeLine 과 같은 DP 를 미리 잡아 둔 버퍼로 돈다.
 * 탐색은 줄 풀이를 수백만 번 부르므로 호출마다 배열을 만들지 않는다.
 *
 * 쓰는 법: cells[0..n) 에 줄을 채우고 solve(n, clue) → result[0..n) 에 새로 정해진 값(0 = 그대로).
 */
export class LineBuffers {
	/** 입력 줄 — 0 미정 · 1 칠 · 2 X */
	readonly cells: Uint8Array;
	/** 출력 — 0 그대로(이미 정해졌거나 아직 모름) · 1 칠로 정해짐 · 2 X 로 정해짐 */
	readonly result: Uint8Array;
	/** X 개수 누적합 */
	readonly #xs: Int32Array;
	/** reach[i·W + k]: i 칸부터 끝까지 숫자 k..m−1 을 놓을 수 있다 */
	readonly #reach: Uint8Array;
	/** used[i·W + k]: 앞에서부터 해에 쓰이는 상태 */
	readonly #used: Uint8Array;
	readonly #fillDiff: Int32Array;
	readonly #canCross: Uint8Array;

	constructor(maxLength: number, maxClue: number) {
		const W = maxClue + 1;
		this.cells = new Uint8Array(maxLength);
		this.result = new Uint8Array(maxLength);
		this.#xs = new Int32Array(maxLength + 1);
		this.#reach = new Uint8Array((maxLength + 1) * W);
		this.#used = new Uint8Array((maxLength + 1) * W);
		this.#fillDiff = new Int32Array(maxLength + 1);
		this.#canCross = new Uint8Array(maxLength);
	}

	/** 새로 정해진 칸 수. 단서를 놓을 자리가 없으면(모순) −1 */
	solve(n: number, clue: Clue): number {
		const m = clue.length;
		const W = m + 1;
		const cells = this.cells;
		const xs = this.#xs;
		const reach = this.#reach;

		xs[0] = 0;
		for (let i = 0; i < n; i++) xs[i + 1] = xs[i] + (cells[i] === CROSSED ? 1 : 0);

		for (let k = 0; k <= m; k++) reach[n * W + k] = k === m ? 1 : 0;
		for (let i = n - 1; i >= 0; i--) {
			const blank = cells[i] !== FILLED;
			for (let k = m; k >= 0; k--) {
				reach[i * W + k] =
					(blank && reach[(i + 1) * W + k] === 1) || (k < m && this.#placeOk(n, W, clue, i, k))
						? 1
						: 0;
			}
		}
		if (reach[0] !== 1) return -1;

		const used = this.#used;
		const fillDiff = this.#fillDiff;
		const canCross = this.#canCross;
		used.fill(0, 0, (n + 1) * W);
		fillDiff.fill(0, 0, n + 1);
		canCross.fill(0, 0, n);
		used[0] = 1;
		for (let i = 0; i < n; i++) {
			const blank = cells[i] !== FILLED;
			for (let k = 0; k <= m; k++) {
				if (used[i * W + k] !== 1) continue;
				if (blank && reach[(i + 1) * W + k] === 1) {
					used[(i + 1) * W + k] = 1;
					canCross[i] = 1;
				}
				if (k < m && this.#placeOk(n, W, clue, i, k)) {
					const e = i + clue[k];
					fillDiff[i]++;
					fillDiff[e]--;
					if (e === n) used[n * W + k + 1] = 1;
					else {
						canCross[e] = 1;
						used[(e + 1) * W + k + 1] = 1;
					}
				}
			}
		}

		const result = this.result;
		let changed = 0;
		let acc = 0;
		for (let i = 0; i < n; i++) {
			acc += fillDiff[i];
			result[i] = UNKNOWN;
			if (cells[i] !== UNKNOWN) continue;
			const f = acc > 0;
			const c = canCross[i] === 1;
			if (f && !c) {
				result[i] = FILLED;
				changed++;
			} else if (c && !f) {
				result[i] = CROSSED;
				changed++;
			}
		}
		return changed;
	}

	/** 숫자 k 를 i 칸에 놓고(뒤 한 칸 비움) 끝까지 이어 갈 수 있나 */
	#placeOk(n: number, W: number, clue: Clue, i: number, k: number): boolean {
		const e = i + clue[k];
		if (e > n || this.#xs[e] !== this.#xs[i]) return false;
		if (e === n) return this.#reach[n * W + k + 1] === 1;
		return this.cells[e] !== FILLED && this.#reach[(e + 1) * W + k + 1] === 1;
	}
}

// ── 격자 줄 전파 ─────────────────────────────────────────

/**
 * 격자 하나에 줄 전파를 돌리는 엔진. 줄 번호: 행 y → y, 열 x → height + x.
 * 대기열은 줄마다 한 번만 들어가는 고리 버퍼라 크기가 줄 수를 넘지 않는다.
 */
export class GridPropagator {
	readonly width: number;
	readonly height: number;
	readonly size: number;
	readonly rows: readonly Clue[];
	readonly cols: readonly Clue[];
	/** 지금까지 푼 줄 수 */
	lineSolves = 0;

	readonly #line: LineBuffers;
	readonly #queue: Int32Array;
	readonly #queued: Uint8Array;
	#head = 0;
	#count = 0;

	constructor(puzzle: Pick<Puzzle, 'rows' | 'cols'>) {
		this.rows = puzzle.rows;
		this.cols = puzzle.cols;
		this.height = puzzle.rows.length;
		this.width = puzzle.cols.length;
		this.size = this.width * this.height;
		const maxClue = Math.max(
			1,
			...puzzle.rows.map((c) => c.length),
			...puzzle.cols.map((c) => c.length)
		);
		this.#line = new LineBuffers(Math.max(this.width, this.height), maxClue);
		const lines = this.width + this.height;
		this.#queue = new Int32Array(lines);
		this.#queued = new Uint8Array(lines);
	}

	/** 모든 줄을 처음부터 — 새로 정한 칸 수, 모순이면 −1 */
	propagateAll(g: Uint8Array): number {
		const lines: number[] = [];
		for (let l = 0; l < this.width + this.height; l++) lines.push(l);
		return this.propagate(g, lines);
	}

	/** 칸 i 를 지나는 행·열부터 */
	propagateCell(g: Uint8Array, i: number): number {
		const y = Math.floor(i / this.width);
		return this.propagate(g, [y, this.height + (i - y * this.width)]);
	}

	/** g 를 고정점까지 (g 를 직접 바꾼다). 새로 정한 칸 수, 모순이면 −1 (g 는 중간 상태로 남는다) */
	propagate(g: Uint8Array, start: Iterable<number>): number {
		const { width: W, height: H } = this;
		const queue = this.#queue;
		const buf = this.#line;
		this.#head = 0;
		this.#count = 0;
		for (const l of start) this.#push(l);

		let changed = 0;
		while (this.#count > 0) {
			const l = queue[this.#head];
			this.#head = (this.#head + 1) % queue.length;
			this.#count--;
			this.#queued[l] = 0;
			this.lineSolves++;
			if (l < H) {
				const base = l * W;
				for (let x = 0; x < W; x++) buf.cells[x] = g[base + x];
				const r = buf.solve(W, this.rows[l]);
				if (r < 0) return this.#abort();
				if (r === 0) continue;
				for (let x = 0; x < W; x++) {
					const v = buf.result[x];
					if (v === UNKNOWN) continue;
					g[base + x] = v;
					this.#push(H + x);
				}
				changed += r;
			} else {
				const x = l - H;
				for (let y = 0; y < H; y++) buf.cells[y] = g[y * W + x];
				const r = buf.solve(H, this.cols[x]);
				if (r < 0) return this.#abort();
				if (r === 0) continue;
				for (let y = 0; y < H; y++) {
					const v = buf.result[y];
					if (v === UNKNOWN) continue;
					g[y * W + x] = v;
					this.#push(y);
				}
				changed += r;
			}
		}
		return changed;
	}

	#push(l: number): void {
		if (this.#queued[l]) return;
		this.#queued[l] = 1;
		this.#queue[(this.#head + this.#count) % this.#queue.length] = l;
		this.#count++;
	}

	/** 모순으로 그만둘 때 대기열 표시를 지운다 */
	#abort(): -1 {
		const queue = this.#queue;
		for (let n = 0; n < this.#count; n++) this.#queued[queue[(this.#head + n) % queue.length]] = 0;
		this.#count = 0;
		return -1;
	}
}

// ── 탐색 ─────────────────────────────────────────────────

export interface BacktrackOptions {
	/** 해를 이만큼 찾으면 멈춘다 (기본 2 — 해 하나를 찾고 유일한지까지 본다) */
	readonly maxSolutions: number;
	/** 노드마다 탐침(가정 & 모순)을 고정점까지 돌린다 (기본 true). false 면 줄 전파만 — 비교용 */
	readonly probe: boolean;
	/** 탐침을 이만큼 할 때마다 tick 을 낸다 — 화면 전략이 박자를 돌려줄 기회 */
	readonly tickEvery: number;
}

export const DEFAULT_BACKTRACK_OPTIONS: BacktrackOptions = {
	maxSolutions: 2,
	probe: true,
	tickEvery: 32
};

export type SearchEvent =
	/** 뿌리 — 가정 없이 정해진 칸(모든 해에 공통). grid 는 모순이면 null */
	| { readonly kind: 'root'; readonly grid: Uint8Array | null; readonly known: number }
	/**
	 * 가정 하나를 내려가 본 결과. depth = 이 가정을 포함한 가정 수(1부터).
	 * parent = 가정하기 전 격자, grid = 가정 → 전파·탐침 뒤의 격자 (모순이면 null)
	 */
	| {
			readonly kind: 'assume';
			readonly depth: number;
			readonly parent: Uint8Array;
			readonly cell: number;
			readonly value: typeof FILLED | typeof CROSSED;
			readonly grid: Uint8Array | null;
			readonly known: number;
	  }
	/** 해를 찾았다 (index 는 0부터) */
	| { readonly kind: 'solution'; readonly grid: Uint8Array; readonly index: number }
	/** 계산이 길다 — 소비자가 숨을 돌릴 기회 */
	| { readonly kind: 'tick' };

export interface SearchSummary {
	readonly solutions: readonly Uint8Array[];
	/** 탐색 트리를 끝까지 봤다 — 그렇다면 solutions.length 가 정확한 해의 수 */
	readonly complete: boolean;
	readonly nodes: number;
	readonly probes: number;
	readonly lineSolves: number;
	readonly maxDepth: number;
}

/** 탐침 결과: 모순 / 다 정해짐 / 분기할 칸 */
const CONTRADICTION = -2;
const SOLVED = -1;

interface Frame {
	readonly grid: Uint8Array;
	readonly cell: number;
	/** 다음에 해 볼 값의 순번 (0 칠, 1 X, 2 끝) */
	next: number;
}

export class BacktrackSearch {
	readonly engine: GridPropagator;
	readonly options: BacktrackOptions;
	readonly solutions: Uint8Array[] = [];
	nodes = 0;
	probes = 0;
	maxDepth = 0;
	complete = false;

	readonly #a: Uint8Array;
	readonly #b: Uint8Array;
	#sinceTick = 0;

	constructor(puzzle: Pick<Puzzle, 'rows' | 'cols'>, opts: Partial<BacktrackOptions> = {}) {
		this.engine = new GridPropagator(puzzle);
		this.options = { ...DEFAULT_BACKTRACK_OPTIONS, ...opts };
		this.#a = new Uint8Array(this.engine.size);
		this.#b = new Uint8Array(this.engine.size);
	}

	/**
	 * start(0 미정 · 1 칠 · 2 X, 이미 정해진 칸은 주어진 조건)에서 탐색한다.
	 * 해를 maxSolutions 개 찾거나 트리를 다 보면 끝난다.
	 */
	*run(start?: ArrayLike<number>): Generator<SearchEvent, SearchSummary, void> {
		const { engine } = this;
		const root = new Uint8Array(engine.size);
		if (start) root.set(start);

		let r = engine.propagateAll(root) < 0 ? CONTRADICTION : yield* this.#probe(root);
		this.nodes++;
		yield { kind: 'root', grid: r === CONTRADICTION ? null : root, known: countKnown(root) };
		if (r === CONTRADICTION) return this.#finish(true);
		if (r === SOLVED) {
			if (yield* this.#found(root)) return this.#finish(false);
			return this.#finish(true);
		}

		const stack: Frame[] = [{ grid: root, cell: r, next: 0 }];
		while (stack.length) {
			const top = stack[stack.length - 1];
			if (top.next >= 2) {
				stack.pop();
				continue;
			}
			const value = top.next++ === 0 ? FILLED : CROSSED;
			const depth = stack.length;
			const g = top.grid.slice();
			g[top.cell] = value;
			r = engine.propagateCell(g, top.cell) < 0 ? CONTRADICTION : yield* this.#probe(g);
			this.nodes++;
			if (depth > this.maxDepth) this.maxDepth = depth;
			const ok = r !== CONTRADICTION;
			yield {
				kind: 'assume',
				depth,
				parent: top.grid,
				cell: top.cell,
				value,
				grid: ok ? g : null,
				known: ok ? countKnown(g) : 0
			};
			if (!ok) continue;
			if (r === SOLVED) {
				if (yield* this.#found(g)) return this.#finish(false);
				continue;
			}
			stack.push({ grid: g, cell: r, next: 0 });
		}
		return this.#finish(true);
	}

	/** 해를 기록한다. 한도에 닿았으면 true */
	*#found(g: Uint8Array): Generator<SearchEvent, boolean, void> {
		const grid = g.slice();
		this.solutions.push(grid);
		yield { kind: 'solution', grid, index: this.solutions.length - 1 };
		return this.solutions.length >= this.options.maxSolutions;
	}

	#finish(complete: boolean): SearchSummary {
		this.complete = complete;
		return {
			solutions: this.solutions,
			complete,
			nodes: this.nodes,
			probes: this.probes,
			lineSolves: this.engine.lineSolves,
			maxDepth: this.maxDepth
		};
	}

	/**
	 * g(줄 전파 고정점)에 탐침을 고정점까지 돌린다 — g 를 직접 바꾼다.
	 * 반환: CONTRADICTION / SOLVED / 분기할 칸 번호
	 */
	*#probe(g: Uint8Array): Generator<SearchEvent, number, void> {
		const { engine } = this;
		const N = engine.size;
		const a = this.#a;
		const b = this.#b;
		for (;;) {
			let changed = false;
			let unknown = false;
			let best = -1;
			let bestScore = -1;
			for (let i = 0; i < N; i++) {
				if (g[i] !== UNKNOWN) continue;
				unknown = true;
				if (!this.options.probe) {
					// 탐침 없이: 첫 빈칸에서 나눈다
					return i;
				}
				a.set(g);
				a[i] = FILLED;
				const na = engine.propagateCell(a, i);
				b.set(g);
				b[i] = CROSSED;
				const nb = engine.propagateCell(b, i);
				this.probes += 2;
				if (++this.#sinceTick >= this.options.tickEvery) {
					this.#sinceTick = 0;
					yield { kind: 'tick' };
				}
				if (na < 0 && nb < 0) return CONTRADICTION;
				if (na < 0 || nb < 0) {
					// 한쪽이 모순 — 반대쪽이 참. 그쪽 전파 결과가 곧 새 고정점
					g.set(na < 0 ? b : a);
					changed = true;
					continue;
				}
				// 양쪽 모두 살아남았다 — 양쪽에서 같게 정해진 칸은 참
				const lines: number[] = [];
				for (let j = 0; j < N; j++) {
					if (g[j] !== UNKNOWN || a[j] === UNKNOWN || a[j] !== b[j]) continue;
					g[j] = a[j];
					const y = Math.floor(j / engine.width);
					lines.push(y, engine.height + (j - y * engine.width));
				}
				if (lines.length) {
					if (engine.propagate(g, lines) < 0) return CONTRADICTION;
					changed = true;
					continue;
				}
				// na, nb 는 가정한 칸 자신을 포함해 1 이상
				const score = (na + 1) * (nb + 1);
				if (score > bestScore) {
					bestScore = score;
					best = i;
				}
			}
			if (!unknown) return SOLVED;
			if (!changed) return best;
		}
	}
}

export function countKnown(g: Uint8Array): number {
	let n = 0;
	for (let i = 0; i < g.length; i++) if (g[i] !== UNKNOWN) n++;
	return n;
}

/** 해를 limit 개까지 센다 (화면 없이 끝까지) — 시험·스크립트용 */
export function countSolutions(
	puzzle: Pick<Puzzle, 'rows' | 'cols'>,
	opts: Partial<BacktrackOptions> & { readonly start?: ArrayLike<number> } = {}
): SearchSummary {
	const search = new BacktrackSearch(puzzle, opts);
	const it = search.run(opts.start);
	for (;;) {
		const r = it.next();
		if (r.done) return r.value;
	}
}
