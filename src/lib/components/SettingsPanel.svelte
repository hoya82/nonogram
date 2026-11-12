<!-- 설정 — 사이트 ⚙️ 패널의 판 관련 항목 + 솔버 실험용 항목 -->
<script lang="ts">
	import { getSession } from '#lib/game/session.svelte.js';
	import type { PlayerSettings, Theme } from '#lib/game/settings.svelte.js';

	let { onclose }: { onclose: () => void } = $props();

	const session = getSession();
	const { settings } = session;

	type BoolKey = {
		[K in keyof PlayerSettings]: PlayerSettings[K] extends boolean ? K : never;
	}[keyof PlayerSettings];

	const ITEMS: { key: BoolKey; label: string }[] = [
		{ key: 'showGuides', label: '가이드 줄 표시' },
		{ key: 'showDragTooltip', label: '끄는 동안 칸 수 표시' },
		{ key: 'rectDrag', label: '사각형으로 칠하기' },
		{ key: 'clueCross', label: '끝난 조각 숫자 지우기' },
		{ key: 'autoCross', label: '줄이 맞으면 남은 칸 자동 X' },
		{ key: 'showContradictions', label: '모순인 줄 빨갛게' },
		{ key: 'animate', label: '애니메이션' }
	];

	function toggle(key: BoolKey, value: boolean) {
		if (key === 'autoCross') session.setAutoCross(value);
		else settings.set(key, value);
	}

	const THEMES: { id: Theme; label: string }[] = [
		{ id: 'system', label: '시스템' },
		{ id: 'light', label: '밝게' },
		{ id: 'dark', label: '어둡게' }
	];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="panel" role="dialog" aria-label="설정">
	{#each ITEMS as item (item.key)}
		<label class="item">
			<input
				type="checkbox"
				checked={settings.current[item.key]}
				onchange={(e) => toggle(item.key, e.currentTarget.checked)}
			/>
			{item.label}
		</label>
	{/each}
	<div class="theme">
		{#each THEMES as t (t.id)}
			<button
				type="button"
				class={[settings.current.theme === t.id && 'on']}
				onclick={() => settings.set('theme', t.id)}>{t.label}</button
			>
		{/each}
	</div>
	<p class="keys">
		단축키 — F/1 칠 · X/2 X · M/3 이동 · N/4 메모 · Space 누른 채 이동 · Ctrl+Z/Y · 우클릭 X ·
		Ctrl+휠 확대 · P 솔버 재생 · . 한 단계 · Esc 끌기 취소
	</p>
</div>

<style>
	.panel {
		position: absolute;
		top: 50px;
		right: 8px;
		z-index: 200;
		width: 260px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		font-size: 0.85rem;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
		cursor: pointer;
	}
	.theme {
		display: flex;
		margin: 6px 0;
	}
	.theme button {
		flex: 1;
		padding: 5px 0;
		border: 1px solid var(--line);
		background: var(--surface);
		cursor: pointer;
	}
	.theme button + button {
		margin-left: -1px;
	}
	.theme button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
	.keys {
		margin: 6px 0 2px;
		color: var(--muted);
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>
