import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAnyPuzzleText, parseBoardHtml } from './nemonemo.js';

const html = readFileSync(
	new URL('../../../../docs/references/board.html', import.meta.url),
	'utf8'
);

describe('참고 사이트 board.html', () => {
	it('40×40 단서를 뽑는다 (스크린샷과 같은 값)', () => {
		const r = parseBoardHtml(html);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const p = r.value;
		expect([p.width, p.height]).toEqual([40, 40]);
		expect(p.rows[0]).toEqual([34]);
		expect(p.rows[1]).toEqual([1, 1, 5, 5, 1, 1]);
		expect(p.cols[0]).toEqual([7, 19]);
		expect(p.cols[1]).toEqual([1, 2, 3, 1]);
		expect(p.rows[39]).toEqual([4, 1, 10, 1, 4]);
	});

	it('사이트 puzzleData({hhints, vhints}) 도 읽는다', () => {
		const r = parseAnyPuzzleText(JSON.stringify({ hhints: [[1], [0]], vhints: [[1], [0]] }));
		expect(r.ok && r.value.rows).toEqual([[1], []]);
	});

	it('조각난 html 은 실패로 알린다', () => {
		expect(parseBoardHtml('<div>nothing</div>').ok).toBe(false);
	});
});
