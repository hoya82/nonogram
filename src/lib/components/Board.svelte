<!--
	게임판 — 참고 사이트 board.html 의 격자 구조를 그대로 따른다:
	corner → 열 단서(vhint) → 행마다 [행 단서(hhint) + 칸들]. 5칸마다 굵은 선, 5×5 교차점에 좌표.

	칸은 자기 값만 읽는다 (game.cell(i)). 가이드 줄·솔버가 보는 줄·끌기 미리보기·바뀐 칸 번쩍임은
	칸 클래스가 아니라 "덮개(overlay)" 로 그린다 — 절대 위치 격자 항목이라 배치에 끼어들지 않고,
	마우스가 움직여도 칸 1600개가 다시 계산되지 않는다.
-->
<script lang="ts">
	import type { LineStatus } from '#lib/game/game.svelte.js';
	import { boardInput, viewportInput } from '#lib/game/input.js';
	import { getSession } from '#lib/game/session.svelte.js';
	import { regionSize, strokeRegion } from '#lib/game/stroke.js';
	import { Cell, CELL_CLASS } from '#lib/nonogram/cell.js';
	import { sameLine, type LineRef } from '#lib/nonogram/line.js';

	const session = getSession();
	const { game, ui, runner, settings, puzzle } = session;

	const W = puzzle.width;
	const H = puzzle.height;
	const xs = Array.from({ length: W }, (_, i) => i);
	const ys = Array.from({ length: H }, (_, i) => i);
	const maxRowClues = Math.max(1, ...puzzle.rows.map((c) => c.length));
	const maxColClues = Math.max(1, ...puzzle.cols.map((c) => c.length));

	// 크기 — 사이트 applyZoom 과 같은 식. 칸은 정수 px (소수 px 면 1px 선이 뭉개진다)
	const cellPx = $derived(Math.round(26 * settings.current.zoom));
	const fontPx = $derived(Math.max(9, Math.round(cellPx * 0.5)));
	const hintW = $derived(Math.round((Math.max(50, maxRowClues * 14 + 12) * fontPx) / 11));
	const hintH = $derived(Math.round((Math.max(50, maxColClues * 14 + 10) * fontPx) / 11));

	const thick = (i: number, n: number) => (i + 1) % 5 === 0 && i !== n - 1;

	const PREVIEW_CLASS: Record<Cell, string> = {
		[Cell.Unknown]: 'preview-erase',
		[Cell.Filled]: 'preview-f',
		[Cell.Crossed]: 'preview-x',
		[Cell.MemoFilled]: 'preview-mf',
		[Cell.MemoCrossed]: 'preview-mx'
	};

	/** grid-area: 행 시작 / 열 시작 / 행 끝 / 열 끝 — 칸 (x, y) 는 격자선 x+2, y+2 에서 시작 */
	function lineArea(ref: LineRef): string {
		return ref.axis === 'row'
			? `${ref.index + 2} / 2 / ${ref.index + 3} / -1`
			: `2 / ${ref.index + 2} / -1 / ${ref.index + 3}`;
	}
	function cellArea(index: number): string {
		const x = index % W;
		// 끝 줄을 꼭 적는다 — 절대 위치 격자 항목은 끝이 auto 면 격자 컨테이너 끝까지 늘어난다
		return `${(index - x) / W + 2} / ${x + 2} / span 1 / span 1`;
	}

	function hintClass(st: LineStatus, i: number) {
		const row = st.ref.axis === 'row';
		const guide = row ? ui.guide?.y : ui.guide?.x;
		return [
			'hint',
			row ? 'row' : 'col',
			thick(i, row ? H : W) && (row ? 'thick-b' : 'thick-r'),
			st.satisfied && 'completed',
			settings.current.showGuides && guide === i && 'guide-highlight',
			settings.current.showContradictions && st.contradiction && 'contradiction',
			sameLine(runner.focus, st.ref) && 'focused'
		];
	}

	const region = $derived(ui.stroke ? strokeRegion(ui.stroke) : null);

	// 끌기 툴팁 — S: 시작 ~ E: 끝, 칸 수 (사각형이면 가로 × 세로)
	const tooltip = $derived.by(() => {
		if (!ui.stroke || !ui.pointer || !region || !settings.current.showDragTooltip) return null;
		const size = regionSize(region);
		if (size.count <= 1) return null;
		const { start, end } = ui.stroke;
		return {
			left: ui.pointer.x,
			top: ui.pointer.y,
			range: `S: ${start.x + 1},${start.y + 1} ~ E: ${end.x + 1},${end.y + 1}`,
			accent:
				ui.stroke.rect && size.w > 1 && size.h > 1 ? `${size.w} × ${size.h}` : String(size.count)
		};
	});
</script>

{#snippet clues(st: LineStatus)}
	{#if st.clue.length === 0}
		<span class="hint-span">0</span>
	{:else}
		{#each st.clue as n, k (k)}
			<button
				type="button"
				tabindex="-1"
				class={[
					'hint-span',
					ui.isClueChecked(st.ref, k) && 'checked',
					settings.current.clueCross && st.settled[k] && 'auto-crossed'
				]}
				onclick={() => ui.toggleClue(st.ref, k)}>{n}</button
			>
		{/each}
	{/if}
{/snippet}

<div
	class={['viewport', ui.effectiveTool !== 'move' && 'locked', ui.panning && 'panning']}
	{@attach viewportInput(session)}
>
	<div
		class={['game-board', !settings.current.animate && 'no-anim', game.solved && 'solved']}
		style:--cell-size="{cellPx}px"
		style:--hint-font="{fontPx}px"
		style:grid-template-columns="{hintW}px repeat({W}, {cellPx}px)"
		style:grid-template-rows="{hintH}px repeat({H}, {cellPx}px)"
		style:width="{hintW + W * cellPx}px"
		role="application"
		aria-label="노노그램 {W}×{H}"
		{@attach boardInput(session)}
	>
		<div class="corner"></div>
		{#each game.cols as st, x (x)}
			<div class={hintClass(st, x)}>{@render clues(st)}</div>
		{/each}

		{#each ys as y (y)}
			{@const st = game.rows[y]}
			<div class={hintClass(st, y)}>{@render clues(st)}</div>
			{#each xs as x (x)}
				{@const i = y * W + x}
				<div
					class={[
						'cell',
						CELL_CLASS[game.cell(i)],
						thick(x, W) && 'thick-r',
						thick(y, H) && 'thick-b'
					]}
					data-x={x}
					data-y={y}
				>
					{#if (x + 1) % 5 === 0 && (y + 1) % 5 === 0}
						<span class="cell-coord">{x + 1},{y + 1}</span>
					{/if}
				</div>
			{/each}
		{/each}

		<!-- 덮개들 -->
		{#if settings.current.showGuides && ui.guide && !ui.panning}
			<div class="ov guide" style:grid-area="{ui.guide.y + 2} / 2 / {ui.guide.y + 3} / -1"></div>
			<div class="ov guide" style:grid-area="2 / {ui.guide.x + 2} / -1 / {ui.guide.x + 3}"></div>
		{/if}
		{#if runner.focus}
			<div class="ov focus" style:grid-area={lineArea(runner.focus)}></div>
		{/if}
		{#if ui.stroke && region}
			<div
				class={['ov preview', PREVIEW_CLASS[ui.stroke.mode]]}
				style:grid-area="{region.y0 + 2} / {region.x0 + 2} / {region.y1 + 3} / {region.x1 + 3}"
			></div>
		{/if}
		{#if settings.current.animate}
			{#key runner.flash.seq}
				{#each runner.flash.cells as i (i)}
					<div class="ov flash" style:grid-area={cellArea(i)}></div>
				{/each}
			{/key}
		{/if}
	</div>
</div>

{#if tooltip}
	<div class="drag-tooltip" style:left="{tooltip.left}px" style:top="{tooltip.top}px">
		{tooltip.range}<br /><span class="accent">{tooltip.accent}</span>
	</div>
{/if}

<style>
	.viewport {
		flex: 1;
		min-height: 0;
		overflow: auto;
		position: relative;
		display: flex;
		background: var(--viewport-bg);
		touch-action: pan-x pan-y;
		cursor: grab;
		overscroll-behavior: contain;
	}
	.viewport.locked {
		touch-action: none;
		cursor: crosshair;
	}
	.viewport.panning {
		cursor: grabbing;
	}

	.game-board {
		display: grid;
		position: relative; /* 덮개(절대 위치 격자 항목)의 기준 */
		flex-shrink: 0;
		margin: auto;
		background: var(--board-bg);
		border-top: 1px solid var(--border-light);
		border-left: 1px solid var(--border-light);
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		transition: box-shadow 0.4s;
	}
	.game-board.solved {
		box-shadow:
			0 0 0 3px var(--ok),
			0 0 24px rgba(39, 174, 96, 0.35);
	}

	.hint,
	.cell {
		display: flex;
		justify-content: center;
		align-items: center;
		border-right: 1px solid var(--border-light);
		border-bottom: 1px solid var(--border-light);
	}

	.hint {
		background-color: var(--hint-bg);
		color: var(--hint-fg);
		font-size: var(--hint-font, 11px);
		font-weight: 500;
		line-height: 1;
		transition: background-color 0.2s;
	}
	.hint.col {
		position: sticky;
		top: 0;
		z-index: 10;
		flex-direction: column;
		justify-content: flex-end;
		padding-bottom: 2px;
		border-bottom: 2px solid var(--border-heavy);
	}
	.hint.row {
		position: sticky;
		left: 0;
		z-index: 10;
		flex-direction: row;
		justify-content: flex-end;
		padding-right: 4px;
		border-right: 2px solid var(--border-heavy);
	}
	.corner {
		position: sticky;
		top: 0;
		left: 0;
		z-index: 20;
		background: var(--corner-bg);
		border-right: 2px solid var(--border-heavy);
		border-bottom: 2px solid var(--border-heavy);
	}

	.hint.completed {
		background-color: var(--hint-done-bg);
	}
	.hint.completed .hint-span {
		color: #888;
		opacity: 0.7;
	}
	.hint.guide-highlight {
		background-color: var(--hint-guide-bg);
	}
	.hint.focused {
		background-color: var(--focus-hint-bg);
		box-shadow: inset 0 0 0 2px var(--focus-color);
	}
	.hint.contradiction {
		background-color: var(--contra-bg);
		color: var(--contra-fg);
	}

	.hint-span {
		display: inline-block;
		margin: 0 1px;
		padding: 2px;
		border: 0;
		background: none;
		font: inherit;
		line-height: 1;
		color: inherit;
		cursor: pointer;
	}
	.hint-span.checked,
	.hint-span.auto-crossed {
		text-decoration: line-through;
		color: #999;
		opacity: 0.85;
	}

	.cell {
		position: relative;
		font-size: calc(var(--cell-size) * 0.6);
	}
	.cell.filled {
		background-color: var(--filled-color);
	}
	.cell.crossed {
		color: var(--x-color);
	}
	/* X 는 칸을 가로지르는 두 줄 — SVG 마스크라 칸 크기를 따라 굵어진다 */
	.cell.crossed::after,
	.cell.memo-f::after,
	.cell.memo-x::after {
		content: '';
		position: absolute;
		inset: 22%;
		background-color: currentColor;
		mask: var(--mask) center / 100% 100% no-repeat;
	}
	.cell.crossed::after {
		--mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M1 1L9 9M9 1L1 9' stroke='%23000' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");
	}
	/* 메모(가정) — ▲ 칠한다고 가정, / 비운다고 가정. 주황 한 색 */
	.cell.memo-f::after {
		inset: 24%;
		background-color: var(--memo-color);
		--mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M5 1.5L9 8.5H1Z'/%3E%3C/svg%3E");
	}
	.cell.memo-x::after {
		background-color: var(--memo-color);
		--mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M1 9L9 1' stroke='%23000' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");
	}

	.thick-r {
		border-right: 2px solid var(--border-heavy);
	}
	.thick-b {
		border-bottom: 2px solid var(--border-heavy);
	}

	.cell-coord {
		position: absolute;
		bottom: 1px;
		right: 1px;
		z-index: 5;
		font-size: 8px;
		font-family: var(--mono);
		line-height: 1;
		color: var(--coord-color);
		pointer-events: none;
		transform: scale(0.8);
		transform-origin: bottom right;
	}
	.cell.filled .cell-coord {
		color: rgba(255, 255, 255, 0.45);
	}

	/* ── 칸 바뀜 애니메이션 — 상태 클래스마다 등장 키프레임이 달라 값이 바뀔 때마다 한 번 돈다 ── */
	.cell.filled {
		animation: pop-fill 200ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}
	.cell.crossed::after,
	.cell.memo-x::after {
		animation: pop-mark 180ms ease-out;
	}
	.cell.memo-f::after {
		animation: pop-mark 220ms cubic-bezier(0.2, 0.9, 0.3, 1.4);
	}
	@keyframes pop-fill {
		from {
			transform: scale(0.45);
			filter: brightness(1.6);
		}
		to {
			transform: scale(1);
			filter: none;
		}
	}
	@keyframes pop-mark {
		from {
			transform: scale(0.2) rotate(-40deg);
			opacity: 0;
		}
	}
	.no-anim .cell,
	.no-anim .cell::after {
		animation: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.cell,
		.cell::after {
			animation: none !important;
		}
	}

	/* ── 덮개 ── */
	.ov {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.ov.guide {
		z-index: 6;
		background: var(--guide-bg);
	}
	.ov.preview {
		z-index: 7;
	}
	.ov.preview-f {
		background-color: var(--preview-fill);
	}
	.ov.preview-erase {
		background-color: var(--preview-erase);
	}
	/* X·메모 미리보기는 칸 크기로 되풀이하는 마스크 — 덮개가 칸 경계에서 시작하므로 칸마다 맞는다 */
	.ov.preview-x,
	.ov.preview-mf,
	.ov.preview-mx {
		mask: var(--mask) 0 0 / var(--cell-size) var(--cell-size) repeat;
	}
	.ov.preview-x {
		background-color: var(--preview-cross);
		--mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M27.6 27.6L72.4 72.4M72.4 27.6L27.6 72.4' stroke='%23000' stroke-width='7.8' stroke-linecap='round'/%3E%3C/svg%3E");
	}
	.ov.preview-mf {
		background-color: var(--memo-color);
		opacity: 0.55;
		--mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 31.8L70.8 68.2H29.2Z'/%3E%3C/svg%3E");
	}
	.ov.preview-mx {
		background-color: var(--memo-color);
		opacity: 0.55;
		--mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M27.6 72.4L72.4 27.6' stroke='%23000' stroke-width='7.8' stroke-linecap='round'/%3E%3C/svg%3E");
	}
	.ov.focus {
		z-index: 8;
		background: var(--focus-bg);
		outline: 2px solid var(--focus-color);
		outline-offset: -1px;
	}
	.ov.flash {
		z-index: 9;
		background: var(--flash-bg);
		box-shadow: inset 0 0 0 2px var(--flash-color);
		animation: flash 650ms ease-out forwards;
	}
	@keyframes flash {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	.drag-tooltip {
		position: fixed;
		z-index: 1000;
		transform: translate(-50%, -130%);
		padding: 6px 12px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background-color: rgba(33, 37, 41, 0.95);
		color: white;
		font-size: 0.8rem;
		font-family: var(--mono);
		line-height: 1.4;
		text-align: center;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
	}
	.drag-tooltip .accent {
		color: #f1c40f;
		font-weight: bold;
		font-size: 1rem;
	}
</style>
