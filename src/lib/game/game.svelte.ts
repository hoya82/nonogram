/**
 * 화면용 게임 — Board 규칙을 그대로 쓰고 칸 저장소만 Svelte $state 로 바꾼다.
 *
 * - 칸 하나를 바꾸면 그 칸을 읽는 DOM 과, 그 칸이 속한 행·열의 판정(LineStatus)만 다시 계산된다.
 * - 되돌리기 가능 여부처럼 칸이 아닌 상태는 board.events$(RxJS) 를 createSubscriber 로 이어 반응시킨다.
 */
import { createSubscriber } from 'svelte/reactivity';
import { Board, type BoardOptions, type CellStore } from '../nonogram/board.js';
import { Cell, isMemo } from '../nonogram/cell.js';
import {
	analyzeLine,
	colRef,
	isLineSatisfied,
	rowRef,
	settledClues,
	type LineRef
} from '../nonogram/line.js';
import type { LineClue, Puzzle } from '../nonogram/puzzle.js';

/** 칸마다 따로 반응하는 저장소 — $state 배열은 인덱스마다 신호를 둔다 */
export class ReactiveCellStore implements CellStore {
	#cells: Cell[] = $state([]);

	constructor(size: number) {
		this.#cells = new Array<Cell>(size).fill(Cell.Unknown);
	}
	get size(): number {
		return this.#cells.length;
	}
	get(index: number): Cell {
		return this.#cells[index];
	}
	set(index: number, value: Cell): void {
		this.#cells[index] = value;
	}
}

/** 줄 하나의 판정 — 그 줄의 칸이 바뀔 때만 다시 계산된다 */
export class LineStatus {
	readonly ref: LineRef;
	readonly clue: LineClue;
	readonly #board: Board;

	constructor(board: Board, ref: LineRef, clue: LineClue) {
		this.#board = board;
		this.ref = ref;
		this.clue = clue;
	}

	cells = $derived.by(() => this.#board.line(this.ref));
	analysis = $derived.by(() => analyzeLine(this.cells, this.clue));
	/** 단서와 정확히 맞다 (사이트의 .hint.completed) */
	satisfied = $derived.by(() => isLineSatisfied(this.cells, this.clue));
	/** 단서를 놓을 자리가 없다 */
	contradiction = $derived(!this.analysis.feasible);
	/** 숫자마다 끝났나 (사이트의 .hint-span.auto-crossed) */
	settled = $derived.by(() => settledClues(this.cells, this.clue, this.analysis));
}

export class Game {
	readonly puzzle: Puzzle;
	readonly board: Board;
	readonly rows: readonly LineStatus[];
	readonly cols: readonly LineStatus[];

	readonly #events = createSubscriber((update) => {
		const sub = this.board.events$.subscribe(update);
		return () => sub.unsubscribe();
	});

	constructor(puzzle: Puzzle, options: Partial<BoardOptions> = {}) {
		this.puzzle = puzzle;
		this.board = new Board(puzzle, new ReactiveCellStore(puzzle.width * puzzle.height), options);
		this.rows = puzzle.rows.map((clue, y) => new LineStatus(this.board, rowRef(y), clue));
		this.cols = puzzle.cols.map((clue, x) => new LineStatus(this.board, colRef(x), clue));
	}

	/** 칸 값 — 템플릿에서 읽으면 그 칸에만 반응한다 */
	cell(index: number): Cell {
		return this.board.at(index);
	}

	line(ref: LineRef): LineStatus {
		return ref.axis === 'row' ? this.rows[ref.index] : this.cols[ref.index];
	}

	get canUndo(): boolean {
		this.#events();
		return this.board.canUndo;
	}
	get canRedo(): boolean {
		this.#events();
		return this.board.canRedo;
	}

	memoCount = $derived.by(() => this.board.countWhere(isMemo));
	knownCount = $derived.by(() => this.board.countWhere((v) => v !== Cell.Unknown));
	allSatisfied = $derived.by(
		() => this.rows.every((r) => r.satisfied) && this.cols.every((c) => c.satisfied)
	);
	/** 다 풀었다 — 모든 줄이 맞고 메모가 없다 */
	solved = $derived(this.allSatisfied && this.memoCount === 0);
	contradictions = $derived.by(
		() =>
			this.rows.filter((r) => r.contradiction).length +
			this.cols.filter((c) => c.contradiction).length
	);
}
