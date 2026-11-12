import { describe, expect, it } from 'vitest';
import { parsePuzzleFile, toPuzzleFile } from './puzzle.js';

describe('parsePuzzleFile', () => {
	it('[0] 은 빈 줄로 읽고 되쓸 때 [0] 으로 쓴다', () => {
		const file = { header: { version: 1 }, rows: [[1], [0]], cols: [[1], [0]] };
		const r = parsePuzzleFile(file);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.rows[1]).toEqual([]);
		expect(toPuzzleFile(r.value)).toEqual({
			header: { version: 1 },
			rows: [[1], [0]],
			cols: [[1], [0]]
		});
	});

	it('노노그램 구성 규칙을 검사한다', () => {
		const codes = (input: unknown) => {
			const r = parsePuzzleFile(input);
			return r.ok ? [] : r.errors.map((e) => e.code);
		};
		expect(codes({ header: { version: 2 }, rows: [], cols: [] })).toEqual(['version']);
		expect(codes({ header: { version: 1 }, rows: [], cols: [[1]] })).toEqual(['empty-board']);
		expect(codes({ header: { version: 1 }, rows: [[1.5]], cols: [[1]] })).toEqual(['bad-run']);
		expect(codes({ header: { version: 1 }, rows: [[1, 1]], cols: [[1], [1]] })).toContain(
			'line-overflow'
		);
		expect(codes({ header: { version: 1 }, rows: [[2]], cols: [[1], [0]] })).toEqual([
			'sum-mismatch'
		]);
	});
});
