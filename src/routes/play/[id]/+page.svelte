<script lang="ts">
	import Player from '#lib/components/Player.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.puzzle.title ?? data.id} · 노노그램</title>
</svelte:head>

{#key data.id}
	<Player puzzle={data.puzzle} id={data.id} />
{/key}
