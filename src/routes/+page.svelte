<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { parseAnyPuzzleText } from '#lib/nonogram/formats/nemonemo.js';
	import { describePuzzleError, toPuzzleFile } from '#lib/nonogram/puzzle.js';
	import { CATALOG, CUSTOM_PUZZLE_KEY } from '#lib/puzzles/index.js';

	let text = $state('');
	let errors = $state<string[]>([]);

	function openPasted(e: SubmitEvent) {
		e.preventDefault();
		const r = parseAnyPuzzleText(text);
		if (!r.ok) {
			errors = r.errors.map(describePuzzleError);
			return;
		}
		errors = [];
		try {
			sessionStorage.setItem(CUSTOM_PUZZLE_KEY, JSON.stringify(toPuzzleFile(r.value)));
		} catch {
			errors = ['브라우저 저장소를 쓸 수 없습니다'];
			return;
		}
		goto(resolve('/play/[id]', { id: 'custom' }));
	}
</script>

<svelte:head>
	<title>노노그램 연구실</title>
</svelte:head>

<main>
	<h1>노노그램 연구실</h1>
	<p class="lead">
		판을 손으로 풀거나, 솔버 전략을 골라 한 단계씩 풀리는 모습을 본다. 판에서 개발자 도구 콘솔을
		열면
		<code>nono</code> 객체로 판과 솔버를 함수로 다룰 수 있다.
	</p>

	<section>
		<h2>퍼즐</h2>
		<ul class="list">
			{#each CATALOG as { id, puzzle } (id)}
				<li>
					<a href={resolve('/play/[id]', { id })}>
						<strong>{puzzle.title ?? id}</strong>
						<span class="size">{puzzle.width}×{puzzle.height}</span>
						{#if puzzle.source}<span class="src">{puzzle.source}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>붙여 넣어 열기</h2>
		<form onsubmit={openPasted}>
			<textarea
				bind:value={text}
				rows="6"
				placeholder={'board.html 조각, 사이트 puzzleData({"hhints":…, "vhints":…}), 또는 {"header":{"version":1},"rows":[…],"cols":[…]}'}
			></textarea>
			{#if errors.length}
				<ul class="errors">
					{#each errors as e, i (i)}<li>{e}</li>{/each}
				</ul>
			{/if}
			<button type="submit" disabled={!text.trim()}>열기</button>
		</form>
		<p class="hint">
			목록에 넣으려면: <code
				>bun scripts/import-nemonemo.ts board.html --title "제목" --out src/lib/puzzles/이름.json</code
			>
		</p>
	</section>
</main>

<style>
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 32px 16px 64px;
	}
	h1 {
		margin: 0 0 8px;
		font-size: 1.6rem;
	}
	h2 {
		margin: 32px 0 10px;
		font-size: 1.05rem;
	}
	.lead {
		margin: 0;
		color: var(--muted);
		line-height: 1.6;
	}
	.list {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list a {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		color: inherit;
		text-decoration: none;
	}
	.list a:hover {
		border-color: var(--accent);
	}
	.size {
		font-family: var(--mono);
		color: var(--muted);
		font-size: 0.85rem;
	}
	.src {
		margin-left: auto;
		color: var(--muted);
		font-size: 0.75rem;
	}
	form {
		display: grid;
		gap: 8px;
	}
	textarea {
		width: 100%;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font-family: var(--mono);
		font-size: 0.8rem;
		resize: vertical;
	}
	button {
		justify-self: start;
		padding: 8px 18px;
		border: 0;
		border-radius: 6px;
		background: var(--accent);
		color: var(--accent-fg);
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.errors {
		margin: 0;
		padding-left: 18px;
		color: var(--danger);
		font-size: 0.85rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.8rem;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
	}
</style>
