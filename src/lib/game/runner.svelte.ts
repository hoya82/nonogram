/**
 * 솔버 실행기 — 전략 제너레이터를 박자에 맞춰 한 단계씩 판에 적용한다.
 *
 * 박자는 RxJS 로 짠다:
 *
 *   playing$ ─┐
 *             ├─ combineLatest → switchMap(켜졌으면 clock(pace), 꺼졌으면 EMPTY) ─┐
 *   pace$ ────┘                                                                   ├─ merge → takeUntil(stop$) → advance(budget)
 *   manual$ (한 단계 버튼) ─────────────────────────────────────────────────────────┘
 *
 * clock(pace) 는 animationFrames() 위에서 "이번 프레임에 몇 단계" 를 낸다. 초당 N 단계도 프레임에 맞춰
 * 쌓아 두었다가 내므로 화면 갱신과 어긋나지 않고, 속도를 바꾸면 switchMap 이 박자만 갈아 끼운다.
 *
 * 화면이 읽는 상태(status, focus, flash, log …)는 $state 로 둔다.
 */
import {
	animationFrames,
	BehaviorSubject,
	combineLatest,
	EMPTY,
	filter,
	map,
	merge,
	scan,
	Subject,
	switchMap,
	takeUntil,
	type Observable
} from 'rxjs';
import type { LineRef } from '../nonogram/line.js';
import { applyStep } from '../solver/apply.js';
import { isStrategy, toGenerator } from '../solver/steps.js';
import type {
	SolveOutcome,
	SolverStep,
	SolverStepKind,
	StepGenerator,
	StepSource
} from '../solver/types.js';
import type { Game } from './game.svelte.js';
import type { Granularity } from './settings.svelte.js';

export type Pace =
	/** 초당 N 단계 */
	| { readonly kind: 'rate'; readonly perSecond: number }
	/** 프레임마다 N 단계 */
	| { readonly kind: 'frame'; readonly perFrame: number }
	/** 프레임마다 ms 만큼 할 수 있는 데까지 */
	| { readonly kind: 'turbo'; readonly msPerFrame: number };

export interface PaceOption {
	readonly id: string;
	readonly label: string;
	readonly pace: Pace;
}

export const PACES: readonly PaceOption[] = [
	{ id: 'r1', label: '초당 1단계', pace: { kind: 'rate', perSecond: 1 } },
	{ id: 'r3', label: '초당 3단계', pace: { kind: 'rate', perSecond: 3 } },
	{ id: 'r10', label: '초당 10단계', pace: { kind: 'rate', perSecond: 10 } },
	{ id: 'r30', label: '초당 30단계', pace: { kind: 'rate', perSecond: 30 } },
	{ id: 'f1', label: '프레임당 1단계', pace: { kind: 'frame', perFrame: 1 } },
	{ id: 'f4', label: '프레임당 4단계', pace: { kind: 'frame', perFrame: 4 } },
	{ id: 'f16', label: '프레임당 16단계', pace: { kind: 'frame', perFrame: 16 } },
	{ id: 'turbo', label: '최고 속도', pace: { kind: 'turbo', msPerFrame: 12 } }
];

export function paceById(id: string): Pace {
	return (PACES.find((p) => p.id === id) ?? PACES[2]).pace;
}

/** 한 번에 진행할 양 */
export interface Budget {
	readonly steps: number;
	/** 이 시간이 지나면 남은 단계가 있어도 멈춘다 */
	readonly ms?: number;
}

export type Clock = (pace: Pace) => Observable<Budget>;

/** 기본 박자 — requestAnimationFrame 기반 */
export const frameClock: Clock = (pace) => {
	switch (pace.kind) {
		case 'rate': {
			// 지금까지 했어야 할 단계 수(target)와 실제로 낸 수(total)의 차이를 이번 프레임에 낸다.
			// 탭이 숨었다 돌아오면 밀린 양이 폭주하지 않게 한 프레임 몫을 자른다
			const cap = Math.ceil(pace.perSecond / 20) + 1;
			return animationFrames().pipe(
				scan(
					(acc, { elapsed }) => {
						const target = Math.floor((elapsed * pace.perSecond) / 1000) + 1;
						return { due: target - acc.total, total: target };
					},
					{ due: 0, total: 0 }
				),
				filter((s) => s.due > 0),
				map((s) => ({ steps: Math.min(s.due, cap) }))
			);
		}
		case 'frame':
			return animationFrames().pipe(map(() => ({ steps: pace.perFrame })));
		case 'turbo':
			return animationFrames().pipe(map(() => ({ steps: Infinity, ms: pace.msPerFrame })));
	}
};

export type RunStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface RunnerLogEntry {
	readonly seq: number;
	/** 몇 번째 단계에서 */
	readonly step: number;
	readonly kind: SolverStepKind | 'end';
	readonly text: string;
	readonly line?: LineRef;
}

/** 방금 바뀐 칸들 — 화면이 번쩍 표시한다 */
export interface Flash {
	readonly seq: number;
	readonly cells: readonly number[];
}

export interface RunnerOptions {
	readonly pace?: Pace;
	readonly granularity?: Granularity;
	readonly showIdle?: boolean;
	/** 시험에서 가짜 박자를 넣는다 */
	readonly clock?: Clock;
}

const LOG_SIZE = 300;
const FLASH_LIMIT = 800;
/** 보이지 않는 단계(살펴보기)를 한 번에 건너뛸 최대 수 — 끝없이 살펴보기만 하는 전략에 화면이 멈추지 않게 */
const SKIP_LIMIT = 20_000;

export class SolverRunner {
	status = $state<RunStatus>('idle');
	outcome = $state.raw<SolveOutcome | null>(null);
	sourceName = $state('');
	/** 적용한 단계 수 */
	steps = $state(0);
	/** 건너뛴 살펴보기 단계 수 */
	skipped = $state(0);
	/** 바뀐 칸 수 (누적) */
	changed = $state(0);
	/** 지금 보고 있는 줄 */
	focus = $state.raw<LineRef | null>(null);
	flash = $state.raw<Flash>({ seq: 0, cells: [] });

	#granularity = $state<Granularity>('step');
	#showIdle = $state(false);
	#pace = $state.raw<Pace>(PACES[2].pace);

	#logBuf: RunnerLogEntry[] = [];
	#logVersion = $state(0);
	/** 최근 기록 — 새것이 앞 */
	log = $derived.by(() => {
		void this.#logVersion;
		return this.#logBuf.slice(-LOG_SIZE).reverse();
	});

	readonly #game: Game;
	readonly #clock: Clock;
	readonly #pace$: BehaviorSubject<Pace>;
	readonly #playing$ = new BehaviorSubject(false);
	readonly #manual$ = new Subject<Budget>();
	readonly #stop$ = new Subject<void>();

	#it: StepGenerator | null = null;
	#pending: SolverStep[] = [];
	#tag = '';
	#runSeq = 0;
	#logSeq = 0;
	#flashSeq = 0;

	constructor(game: Game, opts: RunnerOptions = {}) {
		this.#game = game;
		this.#clock = opts.clock ?? frameClock;
		this.#pace = opts.pace ?? PACES[2].pace;
		this.#pace$ = new BehaviorSubject(this.#pace);
		this.#granularity = opts.granularity ?? 'step';
		this.#showIdle = opts.showIdle ?? false;
	}

	get pace(): Pace {
		return this.#pace;
	}
	set pace(p: Pace) {
		this.#pace = p;
		this.#pace$.next(p);
	}
	/** 'cell' 이면 칠하기 단계를 칸 하나씩 나눠 보인다 */
	get granularity(): Granularity {
		return this.#granularity;
	}
	set granularity(g: Granularity) {
		this.#granularity = g;
	}
	/** 바꾼 게 없는 살펴보기 단계도 한 박자씩 보인다 */
	get showIdle(): boolean {
		return this.#showIdle;
	}
	set showIdle(v: boolean) {
		this.#showIdle = v;
	}
	/** 실행 중인 제너레이터가 있다 (일시정지 포함) */
	get active(): boolean {
		return this.status === 'running' || this.status === 'paused';
	}

	/** 새로 실행한다. 이미 돌던 것은 멈춘다 */
	start(source: StepSource, opts: { paused?: boolean; name?: string } = {}): void {
		this.stop();
		this.#it = toGenerator(source, { puzzle: this.#game.puzzle, board: this.#game.board });
		this.#pending = [];
		this.#tag = `solver-${++this.#runSeq}`;
		this.#logBuf = [];
		this.#logVersion++;
		this.outcome = null;
		this.steps = 0;
		this.skipped = 0;
		this.changed = 0;
		this.focus = null;
		this.sourceName = opts.name ?? (isStrategy(source) ? source.name : '스크립트');
		this.status = opts.paused ? 'paused' : 'running';
		this.#playing$.next(!opts.paused);

		const auto$ = combineLatest([this.#playing$, this.#pace$]).pipe(
			switchMap(([playing, pace]) => (playing ? this.#clock(pace) : EMPTY))
		);
		merge(auto$, this.#manual$)
			.pipe(takeUntil(this.#stop$))
			.subscribe((budget) => this.#advance(budget));
	}

	play(): void {
		if (this.status !== 'paused') return;
		this.status = 'running';
		this.#playing$.next(true);
	}

	pause(): void {
		if (this.status !== 'running') return;
		this.status = 'paused';
		this.#playing$.next(false);
	}

	/** n 단계 진행 (실행 중이면 먼저 일시정지) */
	step(n = 1): void {
		if (!this.active) return;
		this.pause();
		this.#manual$.next({ steps: n });
	}

	/** 멈추고 제너레이터를 닫는다 */
	stop(): void {
		if (!this.#it) return;
		try {
			this.#it.return({ status: 'stopped' });
		} catch {
			// finally 블록에서 던진 오류는 무시
		}
		this.#finish({ status: 'stopped' });
	}

	// ── 내부 ──────────────────────────────────────────────

	#advance(budget: Budget): void {
		const t0 = performance.now();
		// 이 호출 안에서만 쓰는 임시 집합 — 반응형일 필요가 없다
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const flashed = new Set<number>();
		for (let n = 0; n < budget.steps && this.#it; n++) {
			const r = this.#pull();
			if (r.done) {
				this.#finish(r.value);
				break;
			}
			for (const c of this.#apply(r.value)) if (flashed.size < FLASH_LIMIT) flashed.add(c.index);
			if (budget.ms !== undefined && performance.now() - t0 >= budget.ms) break;
		}
		if (flashed.size) this.flash = { seq: ++this.#flashSeq, cells: [...flashed] };
	}

	/** 다음 보일 단계 — 나눠 둔 칸 단계, 건너뛸 살펴보기, 기록만 하는 단계를 처리한다 */
	#pull(): IteratorResult<SolverStep, SolveOutcome> {
		const queued = this.#pending.shift();
		if (queued) return { done: false, value: queued };
		const it = this.#it!;
		for (let skipped = 0; ;) {
			let r: IteratorResult<SolverStep, SolveOutcome>;
			try {
				r = it.next();
			} catch (e) {
				console.error(e);
				return {
					done: true,
					value: { status: 'error', note: e instanceof Error ? e.message : String(e) }
				};
			}
			if (r.done) return r;
			const step = r.value;
			if (step.kind === 'note') {
				this.#log('note', step.note);
				continue;
			}
			if (step.kind === 'inspect' && !this.#showIdle && !step.note && skipped < SKIP_LIMIT) {
				skipped++;
				this.skipped++;
				continue;
			}
			if (step.kind === 'paint' && this.#granularity === 'cell' && step.writes.length > 1) {
				const [first, ...rest] = step.writes.map((w, i) => ({
					...step,
					writes: [w],
					note: i === 0 ? step.note : undefined
				}));
				this.#pending.push(...rest);
				return { done: false, value: first };
			}
			return r;
		}
	}

	#apply(step: SolverStep) {
		const changes = applyStep(this.#game.board, step, { source: 'solver', historyTag: this.#tag });
		this.steps++;
		this.changed += changes.length;
		if (step.kind === 'inspect' || step.kind === 'paint') this.focus = step.line ?? null;
		else this.focus = null;
		if (step.note) this.#log(step.kind, step.note, 'line' in step ? step.line : undefined);
		return changes;
	}

	#log(kind: RunnerLogEntry['kind'], text: string, line?: LineRef): void {
		this.#logBuf.push({ seq: ++this.#logSeq, step: this.steps, kind, text, line });
		if (this.#logBuf.length > LOG_SIZE * 2) this.#logBuf.splice(0, LOG_SIZE);
		this.#logVersion++;
	}

	#finish(outcome: SolveOutcome): void {
		this.#it = null;
		this.#pending = [];
		this.outcome = outcome;
		this.status = 'finished';
		this.focus = null;
		this.#log('end', `끝 — ${outcome.status}${outcome.note ? ` (${outcome.note})` : ''}`);
		this.#playing$.next(false);
		this.#stop$.next();
	}
}
