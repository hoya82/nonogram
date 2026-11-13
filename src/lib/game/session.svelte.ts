/**
 * 한 판의 세션 — 게임·솔버 실행기·화면 상태·설정을 묶고, 화면과 콘솔이 쓰는 명령을 둔다.
 * 컴포넌트는 context 로 받아 쓴다 (getSession).
 */
import { createContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import type { CellWrite, Point } from '../nonogram/board.js';
import { Cell } from '../nonogram/cell.js';
import {
	analyzeLine,
	colRef,
	lineKey,
	overlapLine,
	rowRef,
	settledClues,
	solveLine,
	type LineRef
} from '../nonogram/line.js';
import type { Puzzle } from '../nonogram/puzzle.js';
import {
	createBacktracking,
	createGenetic,
	cross,
	fill,
	findStrategy,
	inspect,
	memoClear,
	memoCommit,
	note,
	paint,
	pause,
	runHeadless,
	STRATEGIES,
	type StepSource,
	type Strategy
} from '../solver/index.js';
import { Game } from './game.svelte.js';
import { paceById, SolverRunner } from './runner.svelte.js';
import type { Settings } from './settings.svelte.js';
import type { Stroke, Tool } from './stroke.js';

/** 판 위 화면 상태 (게임 규칙과 무관) */
export class PlayerUI {
	tool = $state<Tool>('fill');
	memoMode = $state(false);
	/** 스페이스를 누르고 있는 동안 이동 도구 */
	spaceHeld = $state(false);
	panning = $state(false);
	/** 마우스 아래 칸 */
	guide = $state.raw<Point | null>(null);
	/** 그리는 중인 획 */
	stroke = $state.raw<Stroke | null>(null);
	/** 그리는 중 포인터 위치 (툴팁) */
	pointer = $state.raw<{ x: number; y: number } | null>(null);
	settingsOpen = $state(false);
	/** 손으로 지운 단서 숫자 — `${lineKey}:${k}` */
	readonly checkedClues = new SvelteSet<string>();

	effectiveTool: Tool = $derived(this.spaceHeld ? 'move' : this.tool);

	toggleClue(ref: LineRef, k: number): void {
		const key = `${lineKey(ref)}:${k}`;
		if (this.checkedClues.has(key)) this.checkedClues.delete(key);
		else this.checkedClues.add(key);
	}
	isClueChecked(ref: LineRef, k: number): boolean {
		return this.checkedClues.has(`${lineKey(ref)}:${k}`);
	}
}

export class Session {
	readonly puzzle: Puzzle;
	readonly settings: Settings;
	readonly game: Game;
	readonly runner: SolverRunner;
	readonly ui = new PlayerUI();

	constructor(puzzle: Puzzle, settings: Settings) {
		this.puzzle = puzzle;
		this.settings = settings;
		const s = settings.current;
		this.game = new Game(puzzle, { autoCross: s.autoCross });
		this.runner = new SolverRunner(this.game, {
			pace: paceById(s.paceId),
			granularity: s.granularity,
			showIdle: s.showIdle
		});
	}

	get strategy(): Strategy {
		return findStrategy(this.settings.current.strategyId) ?? STRATEGIES[0];
	}

	// ── 판 명령 ──────────────────────────────────────────

	undo(): void {
		this.game.board.undo();
	}
	redo(): void {
		this.game.board.redo();
	}
	reset(): void {
		this.runner.stop();
		this.game.board.reset();
		this.ui.checkedClues.clear();
		this.ui.memoMode = false;
	}
	commitMemo(): void {
		this.game.board.commitMemo();
		this.ui.memoMode = false;
	}
	clearMemo(): void {
		this.game.board.clearMemo();
		this.ui.memoMode = false;
	}
	setAutoCross(on: boolean): void {
		this.settings.set('autoCross', on);
		this.game.board.options.autoCross = on;
	}

	// ── 솔버 명령 ────────────────────────────────────────

	/** 재생/일시정지 — 멈춰 있으면 고른 전략으로 새로 시작 */
	solverToggle(): void {
		const r = this.runner;
		if (r.status === 'running') r.pause();
		else if (r.status === 'paused') r.play();
		else r.start(this.strategy);
	}
	/** 한 단계 — 멈춰 있으면 일시정지 상태로 시작한 뒤 한 단계 */
	solverStep(): void {
		if (!this.runner.active) this.runner.start(this.strategy, { paused: true });
		this.runner.step();
	}
	solverStop(): void {
		this.runner.stop();
	}

	/** 콘솔용 API — window.nono */
	api() {
		const board = this.game.board;
		const resolve = (src: StepSource | string): StepSource => {
			if (typeof src !== 'string') return src;
			const s = findStrategy(src);
			if (!s)
				throw new Error(`전략 없음: ${src} (있는 것: ${STRATEGIES.map((x) => x.id).join(', ')})`);
			return s;
		};
		return {
			session: this,
			game: this.game,
			board,
			runner: this.runner,
			puzzle: this.puzzle,
			strategies: STRATEGIES,
			/** 옵션을 바꾼 유전 알고리즘 — nono.run(nono.genetic({ seed: 7, polish: 0 })) */
			genetic: createGenetic,
			/** 옵션을 바꾼 완전 탐색 — nono.run(nono.backtracking({ maxSolutions: 10 })) */
			backtracking: createBacktracking,
			Cell,
			steps: { paint, fill, cross, inspect, note, pause, memoClear, memoCommit },
			row: rowRef,
			col: colRef,
			lines: { analyzeLine, solveLine, overlapLine, settledClues },
			/** 칸 값 */
			get: (x: number, y: number) => board.get(x, y),
			/** 바로 쓴다 (애니메이션은 되지만 박자 없이 한 번에) */
			set: (x: number, y: number, value: Cell) => board.set(x, y, value, { source: 'api' }),
			paint: (writes: CellWrite[]) => board.paint(writes, { source: 'api' }),
			/** 박자에 맞춰 돌린다 — 전략 id·전략·제너레이터 함수·단계 배열 */
			run: (src: StepSource | string, opts?: { paused?: boolean; name?: string }) =>
				this.runner.start(resolve(src), opts),
			play: () => this.runner.play(),
			pause: () => this.runner.pause(),
			step: (n = 1) => this.runner.step(n),
			stop: () => this.runner.stop(),
			/** 화면 없이 끝까지 (판은 건드리지 않는다) */
			headless: (src: StepSource | string) => runHeadless(this.puzzle, resolve(src)),
			undo: () => board.undo('api'),
			redo: () => board.redo('api'),
			reset: () => this.reset()
		};
	}
}

export type NonoApi = ReturnType<Session['api']>;

export const [getSession, setSession] = createContext<Session>();
