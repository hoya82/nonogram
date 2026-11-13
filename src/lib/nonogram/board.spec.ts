import { describe, expect, it } from 'vitest';
import { Board } from './board.js';
import { Cell } from './cell.js';
import { puzzleOrThrow } from './puzzle.js';

// 3×3, 가운데 행이 [3], 위아래 [0]
const P = puzzleOrThrow({
	header: { version: 1 },
	rows: [[0], [3], [0]],
	cols: [[1], [1], [1]]
});

describe('Board', () => {
	it('처음 판에서 [0] 줄은 X', () => {
		const b = new Board(P);
		expect(b.line({ axis: 'row', index: 0 })).toEqual([2, 2, 2]);
		expect(b.line({ axis: 'row', index: 1 })).toEqual([0, 0, 0]);
	});

	it('줄이 완성되면 남은 빈칸은 X — 메모 칠이 섞이면 메모 X', () => {
		const p = puzzleOrThrow({ header: { version: 1 }, rows: [[1, 1]], cols: [[1], [0], [1]] });
		const b = new Board(p, undefined, { autoCross: false });
		b.options.autoCross = true;
		b.paint([
			{ x: 0, y: 0, value: Cell.Filled },
			{ x: 2, y: 0, value: Cell.MemoFilled }
		]);
		expect(b.get(1, 0)).toBe(Cell.MemoCrossed);
	});

	it('되돌리기 묶음 — 같은 태그는 한 번에 되돌린다', () => {
		const b = new Board(P);
		b.set(0, 1, Cell.Filled, { historyTag: 'run' });
		b.set(1, 1, Cell.Filled, { historyTag: 'run' });
		b.set(2, 1, Cell.Crossed);
		b.undo();
		expect(b.get(2, 1)).toBe(Cell.Unknown);
		b.undo();
		expect(b.line({ axis: 'row', index: 1 })).toEqual([0, 0, 0]);
		expect(b.canUndo).toBe(false);
		b.redo();
		expect(b.get(1, 1)).toBe(Cell.Filled);
	});

	it('되돌리기 묶음 — 같은 칸을 여러 번 바꾸면 처음 값 → 마지막 값 하나로 합친다', () => {
		const b = new Board(P, undefined, { autoCross: false });
		const values = [Cell.MemoFilled, Cell.MemoCrossed] as const;
		// 유전 알고리즘처럼 같은 칸들을 끝없이 다시 그린다
		for (let i = 0; i < 1000; i++) {
			b.paint(
				[
					{ x: 0, y: 1, value: values[i % 2] },
					{ x: 1, y: 1, value: values[(i + 1) % 2] }
				],
				{ historyTag: 'run' }
			);
		}
		b.set(2, 1, Cell.Filled, { historyTag: 'run' });
		b.set(2, 1, Cell.Unknown, { historyTag: 'run' }); // 바뀌었다 돌아온 칸
		const undone = b.undo();
		// 실제로 바뀐 두 칸만, 실행 전 값으로
		expect(undone.map((c) => [c.index, c.to]).sort()).toEqual([
			[3, Cell.Unknown],
			[4, Cell.Unknown]
		]);
		expect(b.line({ axis: 'row', index: 1 })).toEqual([0, 0, 0]);
		const redone = b.redo();
		expect(redone).toHaveLength(2);
		expect(b.line({ axis: 'row', index: 1 })).toEqual([Cell.MemoCrossed, Cell.MemoFilled, 0]);
	});

	it('되돌리기는 기본 1000개까지', () => {
		const b = new Board(P, undefined, { autoCross: false });
		expect(b.options.historyLimit).toBe(1000);
		for (let i = 0; i < 1005; i++) b.set(0, 1, i % 2 ? Cell.Filled : Cell.Crossed);
		let n = 0;
		while (b.canUndo) {
			b.undo();
			n++;
		}
		expect(n).toBe(1000);
	});

	it('메모 확정·지우기', () => {
		const b = new Board(P);
		b.paint([
			{ x: 0, y: 1, value: Cell.MemoFilled },
			{ x: 1, y: 1, value: Cell.MemoCrossed }
		]);
		expect(b.memoCount()).toBe(2);
		b.commitMemo();
		expect(b.get(0, 1)).toBe(Cell.Filled);
		expect(b.get(1, 1)).toBe(Cell.Crossed);
		b.paint([{ x: 2, y: 1, value: Cell.MemoFilled }]);
		b.clearMemo();
		expect(b.get(2, 1)).toBe(Cell.Unknown);
	});

	it('다 풀면 isSolved', () => {
		const b = new Board(P);
		b.paint([0, 1, 2].map((x) => ({ x, y: 1, value: Cell.Filled })));
		expect(b.isSolved()).toBe(true);
	});

	it('모든 변경이 events$ 로 나간다', () => {
		const b = new Board(P);
		const kinds: string[] = [];
		b.events$.subscribe((e) => kinds.push(`${e.kind}:${e.source}:${e.changes.length}`));
		b.set(0, 1, Cell.Filled, { source: 'solver' });
		b.undo();
		expect(kinds).toEqual(['paint:solver:1', 'undo:user:1']);
	});
});
