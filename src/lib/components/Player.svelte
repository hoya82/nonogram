<!--
	한 판 플레이어 — 머리줄(되돌리기·확대·설정), 판, 아래 도구줄(이동·칠·X·메모), 메모 줄, 솔버 패널.
	퍼즐이 바뀌면 부모가 {#key} 로 새로 만든다 (세션은 판 하나에 하나).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { keyboardShortcuts } from '#lib/game/input.js';
	import { Session, setSession } from '#lib/game/session.svelte.js';
	import { getSettings } from '#lib/game/settings.svelte.js';
	import type { Tool } from '#lib/game/stroke.js';
	import type { Puzzle } from '#lib/nonogram/puzzle.js';
	import Board from './Board.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SolverPanel from './SolverPanel.svelte';

	let { puzzle, id }: { puzzle: Puzzle; id: string } = $props();

	const settings = getSettings();
	// 세션은 처음 받은 퍼즐로 한 번 만든다 — 퍼즐이 바뀌면 부모가 이 컴포넌트를 새로 만든다
	// svelte-ignore state_referenced_locally
	const session = setSession(new Session(puzzle, settings));
	const { game, ui, runner } = session;

	// 콘솔에서 판을 다룰 수 있게 — window.nono
	$effect(() => {
		const w = window as unknown as { nono?: unknown };
		w.nono = session.api();
		console.info(
			'%cnono%c 콘솔 API 준비 — nono.run("line-propagation"), nono.step(), nono.set(x, y, nono.Cell.Filled) …',
			'background:#2c3e50;color:#fff;padding:1px 6px;border-radius:3px',
			''
		);
		return () => {
			if (w.nono && (w.nono as { session?: unknown }).session === session) delete w.nono;
		};
	});

	const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
		{ tool: 'move', icon: 'move', label: '이동', key: 'M' },
		{ tool: 'fill', icon: 'fill', label: '칠하기', key: 'F' },
		{ tool: 'cross', icon: 'cross', label: 'X', key: 'X' }
	];

	function confirmReset() {
		if (game.knownCount === 0 || confirm('처음부터 다시 할까요? 칠한 칸이 모두 지워집니다.')) {
			session.reset();
		}
	}
</script>

<div class="player" {@attach keyboardShortcuts(session)}>
	<header>
		<a class="icon-btn back" href={resolve('/')} aria-label="목록으로"><Icon name="back" /></a>
		<div class="title">
			<strong>{puzzle.title ?? id}</strong>
			<span class="meta">
				{puzzle.width}×{puzzle.height}
				{#if game.solved}
					<span class="solved"><Icon name="check" size={14} /> 완성</span>
				{:else}
					· {Math.round((game.knownCount / (puzzle.width * puzzle.height)) * 100)}%
				{/if}
			</span>
		</div>
		<div class="btn-group">
			<button type="button" class="icon-btn" onclick={confirmReset} title="처음부터">
				<Icon name="reset" />
			</button>
			<button type="button" class="icon-btn" onclick={() => settings.zoomBy(-0.1)} title="축소">
				<Icon name="zoom-out" />
			</button>
			<button type="button" class="icon-btn" onclick={() => settings.zoomBy(0.1)} title="확대">
				<Icon name="zoom-in" />
			</button>
			<button
				type="button"
				class="icon-btn"
				onclick={() => session.undo()}
				disabled={!game.canUndo}
				title="되돌리기 (Ctrl+Z)"
			>
				<Icon name="undo" />
			</button>
			<button
				type="button"
				class="icon-btn"
				onclick={() => session.redo()}
				disabled={!game.canRedo}
				title="다시 하기 (Ctrl+Y)"
			>
				<Icon name="redo" />
			</button>
			<button
				type="button"
				class={['icon-btn', ui.settingsOpen && 'on']}
				onclick={() => (ui.settingsOpen = !ui.settingsOpen)}
				title="설정"
			>
				<Icon name="settings" />
			</button>
			<button
				type="button"
				class={[
					'icon-btn',
					settings.current.solverOpen && 'on',
					runner.status === 'running' && 'busy'
				]}
				onclick={() => settings.set('solverOpen', !settings.current.solverOpen)}
				title="솔버 패널"
			>
				<Icon name="solver" />
			</button>
		</div>
		{#if ui.settingsOpen}
			<SettingsPanel onclose={() => (ui.settingsOpen = false)} />
		{/if}
	</header>

	<div class="main">
		<div class="stage">
			<Board />

			{#if game.memoCount > 0}
				<div class="memo-bar">
					<span>메모 {game.memoCount}칸</span>
					<button
						type="button"
						class={['memo-btn commit', game.allSatisfied && 'ready']}
						onclick={() => session.commitMemo()}>확정</button
					>
					<button type="button" class="memo-btn clear" onclick={() => session.clearMemo()}>
						지우기
					</button>
				</div>
			{/if}

			<nav class="toolbar" aria-label="도구">
				{#each TOOLS as t (t.tool)}
					<button
						type="button"
						class={['tool-btn', ui.effectiveTool === t.tool && 'active']}
						onclick={() => (ui.tool = t.tool)}
						title="{t.label} ({t.key})"
						aria-pressed={ui.tool === t.tool}
					>
						<Icon name={t.icon} size={20} />
					</button>
				{/each}
				<button
					type="button"
					class={['tool-btn memo', ui.memoMode && 'memo-on']}
					onclick={() => (ui.memoMode = !ui.memoMode)}
					title="메모(가정) (N)"
					aria-pressed={ui.memoMode}
				>
					<Icon name="memo" size={20} />
				</button>
			</nav>
		</div>

		{#if settings.current.solverOpen}
			<SolverPanel />
		{/if}
	</div>
</div>

<style>
	.player {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		overscroll-behavior: none;
	}

	header {
		position: relative;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 48px;
		flex-shrink: 0;
		padding: 0 10px;
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}
	.title {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		line-height: 1.2;
	}
	.title strong {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 0.95rem;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--muted);
		font-size: 0.72rem;
		font-family: var(--mono);
	}
	.solved {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--ok);
		font-weight: 700;
		font-family: var(--font);
	}
	.btn-group {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.icon-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.icon-btn.on {
		background: var(--surface-2);
		border-color: var(--muted);
	}
	.icon-btn.busy {
		color: var(--focus-color);
		border-color: var(--focus-color);
	}
	.back {
		border: 0;
	}

	.main {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.stage {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.toolbar {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 6px;
		height: 52px;
		flex-shrink: 0;
		padding: 0 16px env(safe-area-inset-bottom);
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: blur(8px);
		border-top: 1px solid var(--line);
	}
	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		transition: all 0.15s;
	}
	.tool-btn.active {
		color: var(--text);
		background: color-mix(in srgb, var(--text) 10%, transparent);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--text) 30%, transparent);
	}
	.tool-btn.memo {
		margin-left: 8px;
		color: var(--memo-color);
	}
	.tool-btn.memo-on {
		background: rgba(240, 140, 0, 0.12);
		box-shadow: 0 0 0 2px var(--memo-color);
	}

	/* 메모가 있을 때만 도구줄 위에 떠 있다 — 자리를 차지하지 않아 판이 움직이지 않는다 */
	.memo-bar {
		position: absolute;
		left: 50%;
		bottom: 62px;
		z-index: 150;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 4px 4px 12px;
		border: 1px solid var(--memo-color);
		border-radius: 18px;
		background: var(--surface);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.memo-btn {
		padding: 5px 12px;
		border: 0;
		border-radius: 14px;
		cursor: pointer;
	}
	.memo-btn.commit {
		background: var(--memo-color);
		color: #fff;
		font-weight: bold;
	}
	.memo-btn.clear {
		background: var(--surface-2);
	}
	.memo-btn.commit.ready {
		animation: memo-pulse 1.4s ease-in-out infinite;
	}
	@keyframes memo-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(240, 140, 0, 0.55);
		}
		50% {
			box-shadow: 0 0 0 9px rgba(240, 140, 0, 0);
		}
	}

	@media (max-width: 900px) {
		.main :global(.solver) {
			position: absolute;
			top: 48px;
			right: 0;
			bottom: 0;
			z-index: 120;
			max-width: 92vw;
			box-shadow: -4px 0 16px rgba(0, 0, 0, 0.2);
		}
	}
</style>
