import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { Cell } from '../nonogram/cell.js';
import { puzzleFromPicture } from '../nonogram/formats/picture.js';
import { backtracking, linePropagation } from '../solver/index.js';
import { paint, pause } from '../solver/steps.js';
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

	it('pause 단계에서 스스로 일시정지하고, 계속하면 이어 간다', () => {
		const game = new Game(P, { autoCross: false });
		const { clock, tick } = fakeClock();
		const runner = new SolverRunner(game, { clock });
		runner.start([
			paint([{ x: 0, y: 0, value: Cell.Filled }]),
			pause('여기서 보세요'),
			paint([{ x: 1, y: 0, value: Cell.Filled }])
		]);
		tick(10); // 한 박자에 10단계를 줘도 멈춤 단계에서 끊는다
		expect(runner.status).toBe('paused');
		expect(runner.steps).toBe(2);
		expect(game.knownCount).toBe(1);
		expect(runner.log[0].text).toBe('여기서 보세요');
		tick(10);
		expect(runner.steps).toBe(2);
		runner.play();
		tick(10);
		expect(runner.status).toBe('finished');
		expect(game.knownCount).toBe(2);
	});

	it('완전 탐색 — 해마다 멈추고, 계속하면 다음 해, 끝나면 마지막 해가 남는다', () => {
		// 2×2 대각선 — 해 2개
		const game = new Game(puzzleFromPicture(['#.', '.#']));
		const { clock, tick } = fakeClock();
		const runner = new SolverRunner(game, { clock });
		const runUntilStop = () => {
			for (let i = 0; i < 100 && runner.status === 'running'; i++) tick();
		};
		runner.start(backtracking);
		runUntilStop();
		expect(runner.status).toBe('paused');
		expect(game.solved).toBe(true); // 해 1 을 칠/X 로 보인다
		const first = game.board.snapshot().join('');

		runner.play();
		runUntilStop();
		expect(runner.status).toBe('paused');
		expect(game.solved).toBe(true);
		const second = game.board.snapshot().join('');
		expect(second).not.toBe(first);

		runner.play();
		runUntilStop();
		expect(runner.status).toBe('finished');
		expect(runner.outcome?.note).toMatch(/^해가 여럿 — 해 2개를 모두 찾았다/);
		expect(game.board.snapshot().join('')).toBe(second);

		// 실행 하나 — 되돌리기 한 번에 처음 판
		game.board.undo();
		expect(game.knownCount).toBe(0);
		expect(game.canUndo).toBe(false);
	});
});
