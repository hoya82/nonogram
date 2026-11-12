import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Cell } from '../nonogram/cell.js';
import { puzzleFromPicture } from '../nonogram/formats/picture.js';
import { linePropagation } from '../solver/index.js';
import { paint } from '../solver/steps.js';
import { Game } from './game.svelte.js';
import { SolverRunner, type Budget } from './runner.svelte.js';

/** 가짜 박자 — tick(n) 하면 그 프레임에 n 단계 */
function fakeClock() {
	const frames = new Subject<Budget>();
	return { clock: () => frames, tick: (steps = 1) => frames.next({ steps }) };
}

const P = puzzleFromPicture(['###', '...', '#.#']);

describe('SolverRunner', () => {
	it('박자마다 한 단계씩 적용하고 끝나면 finished', () => {
		const game = new Game(P);
		const { clock, tick } = fakeClock();
		const runner = new SolverRunner(game, { clock });
		runner.start(linePropagation);
		expect(runner.status).toBe('running');
		expect(game.knownCount).toBe(3); // 처음 판: [0] 행만 X

		tick();
		expect(runner.steps).toBe(1);
		for (let i = 0; i < 50 && runner.status === 'running'; i++) tick();
		expect(runner.status).toBe('finished');
		expect(runner.outcome?.status).toBe('solved');
		expect(game.solved).toBe(true);
	});

	it('일시정지 중엔 박자를 무시하고, step() 으로만 나아간다', () => {
		const game = new Game(P);
		const { clock, tick } = fakeClock();
		const runner = new SolverRunner(game, { clock });
		runner.start(linePropagation, { paused: true });
		tick(10);
		expect(runner.steps).toBe(0);
		runner.step();
		expect(runner.steps).toBe(1);
		expect(runner.status).toBe('paused');
	});

	it("'cell' 단위면 칠하기 단계를 칸 하나씩 나눈다", () => {
		const game = new Game(P, { autoCross: false });
		const { clock, tick } = fakeClock();
		const runner = new SolverRunner(game, { clock, granularity: 'cell' });
		runner.start([paint([0, 1, 2].map((x) => ({ x, y: 0, value: Cell.Filled })))]);
		tick();
		expect(game.knownCount).toBe(1);
		tick();
		tick();
		expect(game.knownCount).toBe(3);
	});

	it('솔버 실행 하나는 되돌리기 한 번으로 돌아간다', () => {
		const game = new Game(P);
		const { clock, tick } = fakeClock();
		const runner = new SolverRunner(game, { clock });
		runner.start(linePropagation);
		for (let i = 0; i < 50 && runner.status === 'running'; i++) tick();
		expect(game.solved).toBe(true);
		game.board.undo();
		expect(game.knownCount).toBe(3);
		expect(game.canUndo).toBe(false);
	});
});
