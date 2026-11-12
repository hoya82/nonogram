/**
 * 그림(정답) → 단서. 시험용·예제 퍼즐용.
 *   '#'·'■'·'1'·'X' 는 칠한 칸, 나머지('.', ' ', '0' …)는 빈칸.
 */
import { Cell } from '../cell.js';
import { createPuzzle, type Puzzle, type PuzzleMeta } from '../puzzle.js';
import { runsOf } from '../line.js';

const FILLED = new Set(['#', '■', '1', 'X', 'x', '@']);

export interface Picture {
	readonly width: number;
	readonly height: number;
	/** 행 우선 칸 값 — Filled 또는 Crossed */
	readonly cells: Uint8Array;
}

export function parsePicture(lines: readonly string[]): Picture {
	const rows = lines.map((l) => [...l.replace(/\s+$/, '')]);
	const width = Math.max(...rows.map((r) => r.length));
	const height = rows.length;
	const cells = new Uint8Array(width * height).fill(Cell.Crossed);
	rows.forEach((r, y) =>
		r.forEach((ch, x) => {
			if (FILLED.has(ch)) cells[y * width + x] = Cell.Filled;
		})
	);
	return { width, height, cells };
}

export function cluesOfPicture(pic: Picture): { rows: number[][]; cols: number[][] } {
	const enc = (runs: number[]) => (runs.length ? runs : [0]);
	const rows: number[][] = [];
	const cols: number[][] = [];
	for (let y = 0; y < pic.height; y++) {
		rows.push(
			enc(runsOf(pic.cells.subarray(y * pic.width, (y + 1) * pic.width) as unknown as Cell[]))
		);
	}
	for (let x = 0; x < pic.width; x++) {
		const col: Cell[] = [];
		for (let y = 0; y < pic.height; y++) col.push(pic.cells[y * pic.width + x] as Cell);
		cols.push(enc(runsOf(col)));
	}
	return { rows, cols };
}

/** 그림으로 퍼즐을 만든다 (그림은 항상 규칙을 만족하므로 실패하지 않는다) */
export function puzzleFromPicture(lines: readonly string[], meta: PuzzleMeta = {}): Puzzle {
	const { rows, cols } = cluesOfPicture(parsePicture(lines));
	const r = createPuzzle(rows, cols, meta);
	if (!r.ok) throw new Error('그림에서 퍼즐을 만들지 못했습니다');
	return r.value;
}
