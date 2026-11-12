/**
 * 칸 값. 숫자는 참고 사이트(nemonemologic) 의 mapState 와 같게 맞춰 두었다.
 *
 * - `Unknown`     0: 아직 정하지 않은 칸 (사이트의 "빈칸")
 * - `Filled`      1: 칠한 칸
 * - `Crossed`     2: X — 칠하지 않는다고 정한 칸
 * - `MemoFilled`  3: 메모(가정) — 칠한다고 가정 (▲)
 * - `MemoCrossed` 4: 메모(가정) — 비운다고 가정 (/)
 *
 * 줄 판정·줄 풀이에서 메모 칸은 진짜 칸과 똑같이 센다(사이트와 같다). 그래야 가정을 이어 풀다가
 * 줄이 맞는지·모순인지가 보인다. 솔버는 이 성질로 "가정 → 전파 → 모순이면 반대로 확정" 을 그린다.
 */
export const Cell = {
	Unknown: 0,
	Filled: 1,
	Crossed: 2,
	MemoFilled: 3,
	MemoCrossed: 4
} as const;

export type Cell = (typeof Cell)[keyof typeof Cell];

/** 메모가 아닌 확정 값 */
export type SolidCell = typeof Cell.Filled | typeof Cell.Crossed;
/** 메모 값 */
export type MemoCell = typeof Cell.MemoFilled | typeof Cell.MemoCrossed;

/** 칠한 칸으로 센다 (진짜·메모 모두) */
export const isFilled = (v: Cell): boolean => v === Cell.Filled || v === Cell.MemoFilled;
/** X 로 센다 (진짜·메모 모두) */
export const isCrossed = (v: Cell): boolean => v === Cell.Crossed || v === Cell.MemoCrossed;
export const isUnknown = (v: Cell): boolean => v === Cell.Unknown;
export const isMemo = (v: Cell): v is MemoCell => v === Cell.MemoFilled || v === Cell.MemoCrossed;

export function isCell(v: unknown): v is Cell {
	return v === 0 || v === 1 || v === 2 || v === 3 || v === 4;
}

/** 확정 값 ↔ 메모 값 */
export function toMemo(v: SolidCell): MemoCell {
	return v === Cell.Filled ? Cell.MemoFilled : Cell.MemoCrossed;
}
export function toSolid(v: MemoCell): SolidCell {
	return v === Cell.MemoFilled ? Cell.Filled : Cell.Crossed;
}
/** 칠/X 를 뒤집는다 (메모 여부는 유지) */
export function opposite<V extends SolidCell | MemoCell>(v: V): V {
	switch (v) {
		case Cell.Filled:
			return Cell.Crossed as V;
		case Cell.Crossed:
			return Cell.Filled as V;
		case Cell.MemoFilled:
			return Cell.MemoCrossed as V;
		default:
			return Cell.MemoFilled as V;
	}
}

/** CSS 클래스 이름 (참고 사이트와 같은 이름) */
export const CELL_CLASS: Readonly<Record<Cell, string>> = {
	[Cell.Unknown]: '',
	[Cell.Filled]: 'filled',
	[Cell.Crossed]: 'crossed',
	[Cell.MemoFilled]: 'memo-f',
	[Cell.MemoCrossed]: 'memo-x'
};

export const CELL_LABEL: Readonly<Record<Cell, string>> = {
	[Cell.Unknown]: '빈칸',
	[Cell.Filled]: '칠',
	[Cell.Crossed]: 'X',
	[Cell.MemoFilled]: '메모 칠',
	[Cell.MemoCrossed]: '메모 X'
};
