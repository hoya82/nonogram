import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Cell } from '../nonogram/cell.js';
import { parsePicture, puzzleFromPicture } from '../nonogram/formats/picture.js';
import { puzzleOrThrow } from '../nonogram/puzzle.js';
import { SAMPLE_PICTURES } from '../puzzles/pictures/samples.js';
import { linePropagation, overlapSweep, probing, runHeadless, STRATEGIES } from './index.js';
import { paint } from './steps.js';

const loadJson = (name: string) =>
	puzzleOrThrow(
		JSON.parse(readFileSync(new URL(`../puzzles/${name}.json`, import.meta.url), 'utf8'))
	);

describe('전략 — 그림 예제', () => {
	for (const [id, { picture }] of Object.entries(SAMPLE_PICTURES)) {
		for (const s of STRATEGIES) {
			it(`${s.id} · ${id}: 정답과 어긋난 칸을 쓰지 않는다`, () => {
				const p = puzzleFromPicture(picture);
				const sol = parsePicture(picture).cells;
				const r = runHeadless(p, s);
				expect(r.outcome.status === 'solved' || r.outcome.status === 'stalled').toBe(true);
				r.board.snapshot().forEach((v, i) => {
					if (v === Cell.Filled) expect(sol[i]).toBe(Cell.Filled);
					if (v === Cell.Crossed) expect(sol[i]).toBe(Cell.Crossed);
				});
				if (s !== overlapSweep) expect(r.outcome.status).toBe('solved');
			});
		}
	}
});

describe('전략 — 번들 퍼즐', () => {
	it('줄 전파는 random-30-line 을 푼다', () => {
		expect(runHeadless(loadJson('random-30-line'), linePropagation).outcome.status).toBe('solved');
	});

	it('random-20-probing 은 줄 전파로 막히고 가정 & 모순으로 풀린다', () => {
		const p = loadJson('random-20-probing');
		expect(runHeadless(p, linePropagation).outcome.status).toBe('stalled');
		const r = runHeadless(p, probing);
		expect(r.outcome.status).toBe('solved');
		expect(r.board.memoCount()).toBe(0);
	});

	it('40×40 참고 퍼즐에서 모순 없이 멈춘다 (어려운 판)', () => {
		const r = runHeadless(loadJson('solo-leveling-statue'), linePropagation);
		expect(r.outcome.status).not.toBe('contradiction');
	});
});

describe('즉석 단계 목록', () => {
	it('단계 배열을 그대로 돌린다', () => {
		const p = puzzleFromPicture(['#.', '.#']);
		const r = runHeadless(p, [
			paint([{ x: 0, y: 0, value: Cell.Filled }]),
			paint([{ x: 1, y: 1, value: Cell.Filled }])
		]);
		expect(r.outcome.status).toBe('solved');
		expect(r.steps).toBe(2);
	});
});
