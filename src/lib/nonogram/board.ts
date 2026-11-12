/**
 * 게임판 모델 — 칸 상태와 게임 규칙(칠하기, 줄 완성 시 자동 X, 메모 확정·지우기, 되돌리기).
 *
 * 칸 저장소(CellStore)는 바꿔 끼울 수 있다:
 *   - ArrayCellStore: Uint8Array — 솔버 시험·벤치마크용 (headless)
 *   - ReactiveCellStore(game/*.svelte.ts): Svelte $state 배열 — 칸 하나하나가 따로 반응한다
 * 규칙 코드는 하나라서 화면에서 본 것과 headless 로 돌린 것이 어긋나지 않는다.
 *
 * 모든 변경은 `events$` 로 흘러나간다(무엇이·누가·어떤 칸을 바꿨나). 화면·로그·저장이 여기를 구독한다.
 */
import { Subject } from 'rxjs';
import { Cell, isFilled, isMemo, toSolid } from './cell.js';
import {
	allLines,
	colRef,
	isLineSatisfied,
	lineClue,
	lineCoord,
	lineLength,
	rowRef,
	type LineRef
} from './line.js';
import type { Puzzle } from './puzzle.js';

export interface CellStore {
	readonly size: number;
	get(index: number): Cell;
	set(index: number, value: Cell): void;
}

export class ArrayCellStore implements CellStore {
	readonly #cells: Uint8Array;
	constructor(size: number) {
		this.#cells = new Uint8Array(size);
	}
	get size(): number {
		return this.#cells.length;
	}
	get(index: number): Cell {
		return this.#cells[index] as Cell;
	}
	set(index: number, value: Cell): void {
		this.#cells[index] = value;
	}
}

export interface Point {
	readonly x: number;
	readonly y: number;
}

/** 칸 하나에 값 하나를 쓴다 */
export interface CellWrite extends Point {
	readonly value: Cell;
}

/** 실제로 바뀐 칸 — 되돌리기와 애니메이션의 단위 */
export interface Change {
	readonly index: number;
	readonly from: Cell;
	readonly to: Cell;
}

/** 누가 바꿨나 */
export type ChangeSource = 'user' | 'solver' | 'api' | 'system';

export type BoardEventKind =
	'paint' | 'memo-commit' | 'memo-clear' | 'reset' | 'undo' | 'redo' | 'load';

export interface BoardEvent {
	readonly kind: BoardEventKind;
	readonly source: ChangeSource;
	readonly changes: readonly Change[];
}

/** 솔버가 읽는 판 — 읽기 전용 */
export interface BoardReader {
	readonly puzzle: Puzzle;
	readonly width: number;
	readonly height: number;
	get(x: number, y: number): Cell;
	/** 줄의 칸 값 복사본 */
	line(ref: LineRef): Cell[];
}

export interface BoardOptions {
	/**
	 * 줄 완성 보조 — 단서와 정확히 맞은 줄의 남은 빈칸을 X 로 채운다(메모 칠이 섞였으면 메모 X).
	 * 처음 판과 처음부터에서는 [0] 줄을 모두 X 로 둔다. 사이트 기본 동작.
	 */
	autoCross: boolean;
	/** 되돌리기 최대 개수 */
	historyLimit: number;
}

export interface WriteOptions {
	readonly source?: ChangeSource;
	/**
	 * 되돌리기 묶음 이름. 맨 위 기록이 같은 이름이면 거기에 덧붙인다 —
	 * 솔버 실행 하나를 되돌리기 한 번으로 돌리는 데 쓴다. 없으면 호출마다 새 기록.
	 */
	readonly historyTag?: string;
	/** false 면 기록하지 않는다 */
	readonly record?: boolean;
}

interface HistoryEntry {
	readonly tag: string | undefined;
	readonly changes: Change[];
}

const DEFAULT_OPTIONS: BoardOptions = { autoCross: true, historyLimit: 200 };

export class Board implements BoardReader {
	readonly puzzle: Puzzle;
	readonly width: number;
	readonly height: number;
	readonly options: BoardOptions;
	readonly events$ = new Subject<BoardEvent>();

	readonly #store: CellStore;
	#undo: HistoryEntry[] = [];
	#redo: HistoryEntry[] = [];

	constructor(puzzle: Puzzle, store?: CellStore, options: Partial<BoardOptions> = {}) {
		this.puzzle = puzzle;
		this.width = puzzle.width;
		this.height = puzzle.height;
		this.options = { ...DEFAULT_OPTIONS, ...options };
		this.#store = store ?? new ArrayCellStore(puzzle.width * puzzle.height);
		if (this.#store.size !== this.width * this.height) {
			throw new Error(`저장소 크기 ${this.#store.size} ≠ ${this.width}×${this.height}`);
		}
		this.#applyInitialMarks();
	}

	// ── 읽기 ──────────────────────────────────────────────

	index(x: number, y: number): number {
		return y * this.width + x;
	}
	coord(index: number): Point {
		return { x: index % this.width, y: Math.floor(index / this.width) };
	}
	inBounds(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}
	get(x: number, y: number): Cell {
		return this.#store.get(y * this.width + x);
	}
	at(index: number): Cell {
		return this.#store.get(index);
	}
	line(ref: LineRef): Cell[] {
		const n = lineLength(this, ref);
		const out = new Array<Cell>(n);
		if (ref.axis === 'row') {
			const base = ref.index * this.width;
			for (let k = 0; k < n; k++) out[k] = this.#store.get(base + k);
		} else {
			for (let k = 0; k < n; k++) out[k] = this.#store.get(k * this.width + ref.index);
		}
		return out;
	}
	/** 전체 칸 값 복사본 */
	snapshot(): Uint8Array {
		const out = new Uint8Array(this.#store.size);
		for (let i = 0; i < out.length; i++) out[i] = this.#store.get(i);
		return out;
	}
	countWhere(pred: (v: Cell) => boolean): number {
		let n = 0;
		for (let i = 0; i < this.#store.size; i++) if (pred(this.#store.get(i))) n++;
		return n;
	}
	memoCount(): number {
		return this.countWhere(isMemo);
	}
	isLineSatisfied(ref: LineRef): boolean {
		return isLineSatisfied(this.line(ref), lineClue(this.puzzle, ref));
	}
	/** 모든 줄이 단서와 맞고 메모가 없다 = 다 풀었다 */
	isSolved(): boolean {
		for (const ref of allLines(this)) if (!this.isLineSatisfied(ref)) return false;
		return this.memoCount() === 0;
	}
	get canUndo(): boolean {
		return this.#undo.length > 0;
	}
	get canRedo(): boolean {
		return this.#redo.length > 0;
	}

	// ── 쓰기 ──────────────────────────────────────────────

	/**
	 * 칸들을 쓴다. 실제로 바뀐 칸(줄 완성 자동 X 포함)을 돌려준다.
	 * 판 밖 좌표·같은 값 쓰기는 무시한다.
	 */
	paint(writes: Iterable<CellWrite>, opts: WriteOptions = {}): Change[] {
		const changes: Change[] = [];
		const touchedRows = new Set<number>();
		const touchedCols = new Set<number>();
		for (const w of writes) {
			if (!this.inBounds(w.x, w.y)) continue;
			const c = this.#write(this.index(w.x, w.y), w.value);
			if (!c) continue;
			changes.push(c);
			touchedRows.add(w.y);
			touchedCols.add(w.x);
		}
		if (changes.length && this.options.autoCross) {
			for (const y of touchedRows) this.#autoCrossLine(rowRef(y), changes);
			for (const x of touchedCols) this.#autoCrossLine(colRef(x), changes);
		}
		this.#commit('paint', changes, opts);
		return changes;
	}

	/** 한 칸 쓰기 — paint 의 줄임 */
	set(x: number, y: number, value: Cell, opts?: WriteOptions): Change[] {
		return this.paint([{ x, y, value }], opts);
	}

	/** 메모 확정 — 메모 칠 → 칠, 메모 X → X */
	commitMemo(opts: WriteOptions = {}): Change[] {
		const changes: Change[] = [];
		for (let i = 0; i < this.#store.size; i++) {
			const v = this.#store.get(i);
			if (isMemo(v)) changes.push(this.#write(i, toSolid(v))!);
		}
		this.#commit('memo-commit', changes, opts);
		return changes;
	}

	/** 메모 지우기 — 메모 칸을 모두 빈칸으로 */
	clearMemo(opts: WriteOptions = {}): Change[] {
		const changes: Change[] = [];
		for (let i = 0; i < this.#store.size; i++) {
			if (isMemo(this.#store.get(i))) changes.push(this.#write(i, Cell.Unknown)!);
		}
		this.#commit('memo-clear', changes, opts);
		return changes;
	}

	/** 처음부터 — 되돌리기 기록도 비운다(사이트와 같다) */
	reset(opts: Pick<WriteOptions, 'source'> = {}): Change[] {
		const changes: Change[] = [];
		for (let i = 0; i < this.#store.size; i++) {
			const c = this.#write(i, Cell.Unknown);
			if (c) changes.push(c);
		}
		changes.push(...this.#applyInitialMarks());
		this.#undo = [];
		this.#redo = [];
		this.#emit('reset', changes, opts.source ?? 'user');
		return changes;
	}

	/** 저장해 둔 칸 값으로 바꾼다 (기록은 비운다) */
	load(cells: ArrayLike<number>, opts: Pick<WriteOptions, 'source'> = {}): Change[] {
		if (cells.length !== this.#store.size) throw new Error('칸 수가 맞지 않습니다');
		const changes: Change[] = [];
		for (let i = 0; i < cells.length; i++) {
			const c = this.#write(i, cells[i] as Cell);
			if (c) changes.push(c);
		}
		this.#undo = [];
		this.#redo = [];
		this.#emit('load', changes, opts.source ?? 'system');
		return changes;
	}

	undo(source: ChangeSource = 'user'): Change[] {
		const entry = this.#undo.pop();
		if (!entry) return [];
		const changes: Change[] = [];
		for (let i = entry.changes.length - 1; i >= 0; i--) {
			const c = entry.changes[i];
			this.#store.set(c.index, c.from);
			changes.push({ index: c.index, from: c.to, to: c.from });
		}
		this.#redo.push(entry);
		this.#emit('undo', changes, source);
		return changes;
	}

	redo(source: ChangeSource = 'user'): Change[] {
		const entry = this.#redo.pop();
		if (!entry) return [];
		for (const c of entry.changes) this.#store.set(c.index, c.to);
		this.#undo.push(entry);
		this.#emit('redo', entry.changes, source);
		return entry.changes;
	}

	// ── 내부 ──────────────────────────────────────────────

	#write(index: number, value: Cell): Change | null {
		const from = this.#store.get(index);
		if (from === value) return null;
		this.#store.set(index, value);
		return { index, from, to: value };
	}

	/** 줄이 완성됐으면 남은 빈칸을 X(메모 칠이 섞였으면 메모 X)로 */
	#autoCrossLine(ref: LineRef, out: Change[]): void {
		const line = this.line(ref);
		if (!isLineSatisfied(line, lineClue(this.puzzle, ref))) return;
		const hasMemoFill = line.some((v) => v === Cell.MemoFilled);
		const mark = hasMemoFill ? Cell.MemoCrossed : Cell.Crossed;
		line.forEach((v, k) => {
			if (v !== Cell.Unknown) return;
			const { x, y } = lineCoord(ref, k);
			out.push(this.#write(this.index(x, y), mark)!);
		});
	}

	/** [0] 줄은 처음부터 X (autoCross 일 때) */
	#applyInitialMarks(): Change[] {
		const changes: Change[] = [];
		if (!this.options.autoCross) return changes;
		for (const ref of allLines(this)) {
			if (lineClue(this.puzzle, ref).length !== 0) continue;
			const n = lineLength(this, ref);
			for (let k = 0; k < n; k++) {
				const { x, y } = lineCoord(ref, k);
				const c = this.#write(this.index(x, y), Cell.Crossed);
				if (c) changes.push(c);
			}
		}
		return changes;
	}

	#commit(kind: BoardEventKind, changes: Change[], opts: WriteOptions): void {
		if (changes.length === 0) return;
		if (opts.record !== false) {
			const top = this.#undo.at(-1);
			if (opts.historyTag !== undefined && top?.tag === opts.historyTag) {
				top.changes.push(...changes);
			} else {
				this.#undo.push({ tag: opts.historyTag, changes: [...changes] });
				if (this.#undo.length > this.options.historyLimit) this.#undo.shift();
			}
			this.#redo = [];
		}
		this.#emit(kind, changes, opts.source ?? 'user');
	}

	#emit(kind: BoardEventKind, changes: readonly Change[], source: ChangeSource): void {
		this.events$.next({ kind, source, changes });
	}
}

/** 칠한 칸 비율 등 간단한 통계 */
export function boardStats(board: Board): {
	known: number;
	filled: number;
	memo: number;
	total: number;
} {
	let known = 0;
	let filled = 0;
	let memo = 0;
	const total = board.width * board.height;
	for (let i = 0; i < total; i++) {
		const v = board.at(i);
		if (v !== Cell.Unknown) known++;
		if (isFilled(v)) filled++;
		if (isMemo(v)) memo++;
	}
	return { known, filled, memo, total };
}
