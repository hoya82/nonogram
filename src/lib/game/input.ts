/**
 * 입력 처리 — RxJS 파이프라인을 Svelte attachment 로 붙인다 ({@attach boardInput(session)}).
 * 요소가 사라지면 구독을 모두 끊는다.
 *
 * 사이트는 touch*·mouse* 를 따로 받고 전역 플래그(isDrawing, activeTouchId …)로 상태를 맞췄다.
 * 여기서는 Pointer Events 하나로 받고, 상태는 스트림 안에 둔다:
 *   - exhaustMap: 그리는 동안 들어온 다른 포인터(손바닥·두 번째 손가락)는 무시 — 사이트의 activeTouchId
 *   - scan: 획 상태(축 고정·사각형 범위)를 포인터 이동마다 접어 간다
 *   - race(pointerup, Escape): 놓으면 칠하고 Escape 면 취소
 *   - auditTime(animationFrameScheduler): 화면 갱신은 프레임에 한 번
 */
import type { Attachment } from 'svelte/attachments';
import {
	animationFrameScheduler,
	auditTime,
	concat,
	distinctUntilChanged,
	exhaustMap,
	filter,
	finalize,
	fromEvent,
	map,
	merge,
	of,
	race,
	scan,
	shareReplay,
	startWith,
	Subscription,
	take,
	takeUntil,
	tap,
	throttleTime,
	type Observable
} from 'rxjs';
import type { Point } from '../nonogram/board.js';
import type { Session } from './session.svelte.js';
import { beginStroke, moveStroke, samePoint, strokeWrites, type Stroke } from './stroke.js';

type StrokeEvent =
	| {
			readonly type: 'preview';
			readonly stroke: Stroke;
			readonly pointer: { x: number; y: number };
	  }
	| { readonly type: 'commit' | 'cancel'; readonly stroke: Stroke };

/** 화면 좌표 → 판의 칸 (힌트·바깥이면 null) */
function cellAtPoint(board: HTMLElement, clientX: number, clientY: number): Point | null {
	const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-x]');
	if (!el || !board.contains(el)) return null;
	return { x: Number(el.dataset.x), y: Number(el.dataset.y) };
}

const isTypingTarget = (t: EventTarget | null) =>
	t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** 판: 획 그리기 + 가이드 줄 */
export function boardInput(session: Session): Attachment<HTMLElement> {
	return (el) => {
		const { game, ui, settings } = session;
		const subs = new Subscription();

		const down$ = fromEvent<PointerEvent>(el, 'pointerdown');
		const move$ = fromEvent<PointerEvent>(el, 'pointermove');
		const up$ = merge(
			fromEvent<PointerEvent>(el, 'pointerup'),
			fromEvent<PointerEvent>(el, 'pointercancel')
		);
		const escape$ = fromEvent<KeyboardEvent>(document, 'keydown').pipe(
			filter((e) => e.key === 'Escape')
		);

		const strokes$: Observable<StrokeEvent> = down$.pipe(
			filter((e) => (e.button === 0 || e.button === 2) && ui.effectiveTool !== 'move'),
			filter((e) => !(e.target as Element).closest('.hint')),
			map((e) => ({ down: e, cell: cellAtPoint(el, e.clientX, e.clientY) })),
			filter((d): d is { down: PointerEvent; cell: Point } => d.cell !== null),
			exhaustMap(({ down, cell }) => {
				down.preventDefault();
				el.setPointerCapture(down.pointerId);
				const tool = down.button === 2 ? 'cross' : ui.tool === 'cross' ? 'cross' : 'fill';
				const first = beginStroke(game.board, cell, tool, ui.memoMode, settings.current.rectDrag);
				const samePointer = (e: PointerEvent) => e.pointerId === down.pointerId;

				let last = first;
				const finish$ = race(
					up$.pipe(
						filter(samePointer),
						map(() => 'commit' as const)
					),
					escape$.pipe(map(() => 'cancel' as const))
				).pipe(take(1), shareReplay(1));

				const previews$ = move$.pipe(
					filter(samePointer),
					map((e) => ({ cell: cellAtPoint(el, e.clientX, e.clientY), x: e.clientX, y: e.clientY })),
					scan(
						(acc, m) => {
							const stroke =
								m.cell && !samePoint(m.cell, acc.cursor)
									? moveStroke(game.board, acc.stroke, m.cell)
									: acc.stroke;
							return { stroke, cursor: m.cell ?? acc.cursor, pointer: { x: m.x, y: m.y } };
						},
						{ stroke: first, cursor: cell as Point, pointer: { x: down.clientX, y: down.clientY } }
					),
					tap((s) => (last = s.stroke)),
					startWith({ stroke: first, cursor: cell, pointer: { x: down.clientX, y: down.clientY } }),
					auditTime(0, animationFrameScheduler),
					map((s) => ({ type: 'preview' as const, stroke: s.stroke, pointer: s.pointer })),
					takeUntil(finish$)
				);

				return concat(previews$, finish$.pipe(map((type) => ({ type, stroke: last }))));
			})
		);

		subs.add(
			strokes$.subscribe((ev) => {
				if (ev.type === 'preview') {
					ui.stroke = ev.stroke;
					ui.pointer = ev.pointer;
					return;
				}
				if (ev.type === 'commit') {
					game.board.paint(strokeWrites(game.board, ev.stroke), { source: 'user' });
				}
				ui.stroke = null;
				ui.pointer = null;
			})
		);

		// 가이드 줄 — 마우스 아래 행·열
		const guide$ = merge(
			move$.pipe(
				auditTime(0, animationFrameScheduler),
				map((e) => cellAtPoint(el, e.clientX, e.clientY))
			),
			fromEvent(el, 'pointerleave').pipe(map(() => null))
		).pipe(distinctUntilChanged(samePoint));
		subs.add(guide$.subscribe((p) => (ui.guide = p)));

		// 오른쪽 클릭 = X — 메뉴는 막는다
		subs.add(fromEvent(el, 'contextmenu').subscribe((e) => e.preventDefault()));

		return () => subs.unsubscribe();
	};
}

/** 보기 창: 이동 도구·가운데 버튼으로 끌어 옮기기, Ctrl/⌘ + 휠 확대 */
export function viewportInput(session: Session): Attachment<HTMLElement> {
	return (el) => {
		const { ui, settings } = session;
		const subs = new Subscription();
		const sameId = (id: number) => (e: PointerEvent) => e.pointerId === id;

		// 터치는 브라우저 기본 스크롤(touch-action: pan-x pan-y)에 맡긴다
		const pan$ = fromEvent<PointerEvent>(el, 'pointerdown').pipe(
			filter((e) => e.pointerType !== 'touch'),
			filter((e) => e.button === 1 || (e.button === 0 && ui.effectiveTool === 'move')),
			exhaustMap((down) => {
				down.preventDefault();
				el.setPointerCapture(down.pointerId);
				const sx = el.scrollLeft;
				const sy = el.scrollTop;
				ui.panning = true;
				const end$ = merge(
					fromEvent<PointerEvent>(el, 'pointerup'),
					fromEvent<PointerEvent>(el, 'pointercancel')
				).pipe(filter(sameId(down.pointerId)));
				return fromEvent<PointerEvent>(el, 'pointermove').pipe(
					filter(sameId(down.pointerId)),
					map((e) => ({
						left: sx - (e.clientX - down.clientX),
						top: sy - (e.clientY - down.clientY)
					})),
					takeUntil(end$),
					finalize(() => (ui.panning = false))
				);
			})
		);
		subs.add(pan$.subscribe((p) => el.scrollTo(p)));

		// 트랙패드 핀치는 휠 이벤트가 쏟아진다 — 기본 동작은 모두 막고 확대는 50ms 에 한 번
		const zoom$ = fromEvent<WheelEvent>(el, 'wheel', { passive: false }).pipe(
			filter((e) => e.ctrlKey || e.metaKey),
			tap((e) => e.preventDefault()),
			throttleTime(50),
			map((e) => (e.deltaY < 0 ? 0.1 : -0.1))
		);
		subs.add(zoom$.subscribe((d) => settings.zoomBy(d)));

		return () => subs.unsubscribe();
	};
}

/** 단축키 — 문서 전체에서 받는다 */
export function keyboardShortcuts(session: Session): Attachment<HTMLElement> {
	return () => {
		const { ui } = session;
		const subs = new Subscription();
		const keydown$ = fromEvent<KeyboardEvent>(document, 'keydown').pipe(
			filter((e) => !isTypingTarget(e.target))
		);
		const keyup$ = fromEvent<KeyboardEvent>(document, 'keyup');

		subs.add(
			keydown$.subscribe((e) => {
				const mod = e.ctrlKey || e.metaKey;
				const key = e.key.toLowerCase();
				if (mod && key === 'z') {
					e.preventDefault();
					if (e.shiftKey) session.redo();
					else session.undo();
					return;
				}
				if (mod && key === 'y') {
					e.preventDefault();
					session.redo();
					return;
				}
				if (mod || e.altKey) return;
				switch (key) {
					case 'f':
					case '1':
						ui.tool = 'fill';
						break;
					case 'x':
					case '2':
						ui.tool = 'cross';
						break;
					case 'm':
					case '3':
						ui.tool = 'move';
						break;
					case 'n':
					case '4':
						if (!e.repeat) ui.memoMode = !ui.memoMode;
						break;
					case 'p':
						if (!e.repeat) session.solverToggle();
						break;
					case '.':
						session.solverStep();
						break;
				}
			})
		);

		// 스페이스를 누르는 동안 이동 도구 — 떼거나 창이 포커스를 잃으면 돌아온다
		const spaceHold$ = keydown$.pipe(
			filter((e) => e.code === 'Space'),
			tap((e) => e.preventDefault()),
			filter((e) => !e.repeat),
			exhaustMap(() =>
				concat(
					of(true),
					race(keyup$.pipe(filter((e) => e.code === 'Space')), fromEvent(window, 'blur')).pipe(
						take(1),
						map(() => false)
					)
				)
			)
		);
		subs.add(spaceHold$.subscribe((held) => (ui.spaceHeld = held)));

		return () => subs.unsubscribe();
	};
}
