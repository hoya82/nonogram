<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { Settings, setSettings } from '#lib/game/settings.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const settings = setSettings(new Settings());

	// 테마는 <html data-theme> 에 — 판 밖(페이지 배경)까지 같은 색 토큰을 쓴다
	$effect(() => {
		const theme = settings.current.theme;
		if (theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = theme;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
