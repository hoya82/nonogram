<script lang="ts" module>
	/** 24×24 선 아이콘 (Lucide 모양을 따랐다). 채움이 필요한 것은 fill 표시 */
	const ICONS = {
		back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
		reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
		'zoom-in':
			'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
		'zoom-out': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
		undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
		redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
		settings:
			'<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
		move: '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
		fill: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>',
		cross: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		memo: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
		play: '<path d="M6 3.5v17l14-8.5z" fill="currentColor"/>',
		pause:
			'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
		step: '<path d="M5 4v16"/><path d="M9 4.5v15L20 12z" fill="currentColor"/>',
		stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>',
		solver:
			'<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
	} as const;

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- 고정된 아이콘 문자열만 넣는다 (사용자 입력 없음) -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html ICONS[name]}
</svg>
