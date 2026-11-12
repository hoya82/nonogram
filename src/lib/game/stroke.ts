/**
 * 획(stroke) — 누르고 끌어서 놓을 때까지 한 번의 칠하기. 순수 함수 (사이트 handleDrawStart·previewCells·applyPreview).
 *
 * - 쓸 값(mode)은 누른 칸으로 정한다: 칠 도구로 칠한 칸을 누르면 지우기, 아니면 칠하기 (X 도 같다).
 * - 줄 모드: 처음 벗어난 방향(가로/세로)으로 고정하고 시작 칸~지금 칸의 한 줄.
 * - 사각형 모드: 시작~지금 칸 사각형 전체. 범위 안이 이미 전부 그 값이면 지우기, 아니면 칠하기 — 범위가 바뀔 때마다 다시 정한다.
 * - 메모 획은 빈칸·메모 칸만 건드린다 (칠한 칸·X 는 가정과 상관없이 정한 칸).
 */
import type { Board, CellWrite, Point } from '../nonogram/board.js';
import { Cell, isMemo } from '../nonogram/cell.js';

export type DrawTool = 'fill' | 'cross';
export type Tool = DrawTool | 'move';

export interface Stroke {
	readonly start: Point;
	/** 실제 끝 칸 (줄 모드면 축에 맞춘 칸) */
	readonly end: Point;
	readonly axis: 'x' | 'y' | null;
	readonly tool: DrawTool;
	readonly memo: boolean;
	readonly rect: boolean;
	/** 쓸 값 — Unknown 이면 지우기 */
	readonly mode: Cell;
}

export interface Region {
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
}

function targetValue(tool: DrawTool, memo: boolean): Cell {
	if (memo) return tool === 'cross' ? Cell.MemoCrossed : Cell.MemoFilled;
	return tool === 'cross' ? Cell.Crossed : Cell.Filled;
}

export function canDraw(board: Board, memo: boolean, x: number, y: number): boolean {
	if (!memo) return true;
	const v = board.get(x, y);
	return v === Cell.Unknown || isMemo(v);
}

export function strokeRegion(s: Stroke): Region {
	return {
		x0: Math.min(s.start.x, s.end.x),
		y0: Math.min(s.start.y, s.end.y),
		x1: Math.max(s.start.x, s.end.x),
		y1: Math.max(s.start.y, s.end.y)
	};
}

export function regionSize(r: Region): { w: number; h: number; count: number } {
	const w = r.x1 - r.x0 + 1;
	const h = r.y1 - r.y0 + 1;
	return { w, h, count: w * h };
}

function rectMode(board: Board, s: Omit<Stroke, 'mode'>): Cell {
	const target = targetValue(s.tool, s.memo);
	const r = strokeRegion({ ...s, mode: target });
	for (let y = r.y0; y <= r.y1; y++) {
		for (let x = r.x0; x <= r.x1; x++) {
			if (canDraw(board, s.memo, x, y) && board.get(x, y) !== target) return target;
		}
	}
	return Cell.Unknown;
}

export function beginStroke(
	board: Board,
	start: Point,
	tool: DrawTool,
	memo: boolean,
	rect: boolean
): Stroke {
	const base = { start, end: start, axis: null, tool, memo, rect } as const;
	if (rect) return { ...base, mode: rectMode(board, base) };
	const target = targetValue(tool, memo);
	return { ...base, mode: board.get(start.x, start.y) === target ? Cell.Unknown : target };
}

export function moveStroke(board: Board, s: Stroke, cursor: Point): Stroke {
	if (s.rect) {
		const next = { ...s, end: cursor };
		return { ...next, mode: rectMode(board, next) };
	}
	let axis = s.axis;
	if (axis === null) {
		if (cursor.x !== s.start.x) axis = 'x';
		else if (cursor.y !== s.start.y) axis = 'y';
	}
	const end =
		axis === 'x'
			? { x: cursor.x, y: s.start.y }
			: axis === 'y'
				? { x: s.start.x, y: cursor.y }
				: s.start;
	return { ...s, axis, end };
}

export function strokeWrites(board: Board, s: Stroke): CellWrite[] {
	const r = strokeRegion(s);
	const out: CellWrite[] = [];
	for (let y = r.y0; y <= r.y1; y++) {
		for (let x = r.x0; x <= r.x1; x++) {
			if (canDraw(board, s.memo, x, y)) out.push({ x, y, value: s.mode });
		}
	}
	return out;
}

export const samePoint = (a: Point | null, b: Point | null): boolean =>
	a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
