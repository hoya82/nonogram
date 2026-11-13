<!--
	솔버 패널 — 전략 고르기, 재생·일시정지·한 단계·정지, 박자(속도)·단위, 진행 상황과 기록.
-->
<script lang="ts">
	import { PACES, paceById } from '#lib/game/runner.svelte.js';
	import { getSession } from '#lib/game/session.svelte.js';
	import type { Granularity } from '#lib/game/settings.svelte.js';
	import { lineLabel } from '#lib/nonogram/line.js';
	import { STRATEGIES } from '#lib/solver/index.js';
	import Icon from './Icon.svelte';

	const session = getSession();
	const { runner, settings, game, puzzle } = session;

	const total = puzzle.width * puzzle.height;
	const progress = $derived(game.knownCount / total);

	const STATUS_LABEL = {
		idle: '대기',
		running: '실행 중',
		paused: '일시정지',
		finished: '끝'
	} as const;
	const OUTCOME_LABEL = {
		solved: '다 풀었다',
		stalled: '막혔다',
		contradiction: '모순',
		stopped: '멈춤',
		error: '오류'
	} as const;

	// 실행 중에는 고를 수 없다(select disabled) — 다음 실행부터 쓰인다
	function setStrategy(id: string) {
		settings.set('strategyId', id);
	}
	function setPace(id: string) {
		settings.set('paceId', id);
		runner.pace = paceById(id);
	}
	function setGranularity(g: Granularity) {
		settings.set('granularity', g);
		runner.granularity = g;
	}
	function setShowIdle(v: boolean) {
		settings.set('showIdle', v);
		runner.showIdle = v;
	}
</script>

<aside class="solver" aria-label="솔버">
	<header>
		<h2>솔버</h2>
		<span class={['status', runner.status]} title={runner.sourceName}>
			{STATUS_LABEL[runner.status]}{#if runner.status !== 'idle'}&nbsp;· {runner.sourceName}{/if}
		</span>
	</header>

	<label class="field">
		<span>전략</span>
		<select
			value={settings.current.strategyId}
			onchange={(e) => setStrategy(e.currentTarget.value)}
			disabled={runner.active}
		>
			{#each STRATEGIES as s (s.id)}
				<option value={s.id}>{s.name}</option>
			{/each}
		</select>
	</label>
	<p class="desc">{session.strategy.description}</p>

	<div class="controls">
		<button
			type="button"
			class="primary"
			onclick={() => session.solverToggle()}
			title="재생 / 일시정지 (P)"
		>
			<Icon name={runner.status === 'running' ? 'pause' : 'play'} />
			{runner.status === 'running' ? '일시정지' : runner.status === 'paused' ? '계속' : '실행'}
		</button>
		<button type="button" onclick={() => session.solverStep()} title="한 단계 (.)">
			<Icon name="step" /> 한 단계
		</button>
		<button
			type="button"
			onclick={() => session.solverStop()}
			disabled={!runner.active}
			title="정지"
		>
			<Icon name="stop" />
		</button>
	</div>

	<div class="row2">
		<label class="field">
			<span>박자</span>
			<select value={settings.current.paceId} onchange={(e) => setPace(e.currentTarget.value)}>
				{#each PACES as p (p.id)}
					<option value={p.id}>{p.label}</option>
				{/each}
			</select>
		</label>
		<fieldset class="field">
			<legend>단위</legend>
			<div class="seg">
				<button
					type="button"
					class={[settings.current.granularity === 'step' && 'on']}
					onclick={() => setGranularity('step')}>줄</button
				>
				<button
					type="button"
					class={[settings.current.granularity === 'cell' && 'on']}
					onclick={() => setGranularity('cell')}>칸</button
				>
			</div>
		</fieldset>
	</div>
	<label class="check">
		<input
			type="checkbox"
			checked={settings.current.showIdle}
			onchange={(e) => setShowIdle(e.currentTarget.checked)}
		/>
		바뀐 게 없는 줄 검사도 한 박자씩 보기
	</label>

	<dl class="stats">
		<div>
			<dt>진행</dt>
			<dd>
				<span class="bar"><span style:width="{progress * 100}%"></span></span>
				{game.knownCount}/{total}
			</dd>
		</div>
		<div>
			<dt>단계</dt>
			<dd>{runner.steps}<small> · 건너뜀 {runner.skipped}</small></dd>
		</div>
		<div>
			<dt>바뀐 칸</dt>
			<dd>{runner.changed}</dd>
		</div>
		<div>
			<dt>결과</dt>
			<dd>
				{#if runner.outcome}
					<span class={['outcome', runner.outcome.status]}
						>{OUTCOME_LABEL[runner.outcome.status]}</span
					>
				{:else}
					—
				{/if}
				{#if game.contradictions > 0}
					<small class="contra">모순 줄 {game.contradictions}</small>
				{/if}
			</dd>
		</div>
	</dl>

	<ol class="log" aria-label="솔버 기록">
		{#each runner.log as e (e.seq)}
			<li class={e.kind}>
				<span class="n">{e.step}</span>
				{#if e.line}<span class="line">{lineLabel(e.line)}</span>{/if}
				<span class="text">{e.text}</span>
			</li>
		{:else}
			<li class="empty">실행하면 단계마다 기록이 여기에 쌓인다.</li>
		{/each}
	</ol>

	<details class="api">
		<summary>콘솔에서 제어하기 (<code>nono</code>)</summary>
		<pre>{`nono.run('probing')        // 전략 id 로 실행
nono.step(5); nono.pause()
nono.set(0, 0, nono.Cell.Filled)   // 바로 쓰기
nono.run(function* ({ board }) {   // 즉석 전략
  for (let x = 0; x < board.width; x++)
    yield nono.steps.fill({ x, y: 0 })
})
nono.headless('line-propagation') // 화면 없이
nono.run(nono.genetic({ seed: 7, polish: 0 })) // GA 옵션
nono.run(nono.backtracking({ maxSolutions: 10 })) // 해 10개까지 세기`}</pre>
	</details>
</aside>

<style>
	.solver {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 340px;
		flex-shrink: 0;
		padding: 12px 14px;
		overflow-y: auto;
		background: var(--surface);
		border-left: 1px solid var(--line);
		font-size: 0.85rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	.status {
		max-width: 220px;
		overflow: hidden;
		padding: 2px 8px;
		border-radius: 10px;
		background: var(--surface-2);
		color: var(--muted);
		font-size: 0.75rem;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.status.running {
		background: var(--focus-bg);
		color: var(--focus-color);
	}
	.status.paused {
		background: rgba(240, 140, 0, 0.14);
		color: var(--memo-color);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.field > span,
	legend {
		padding: 0;
		color: var(--muted);
		font-size: 0.75rem;
	}
	select {
		padding: 6px 8px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.desc {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.controls {
		display: flex;
		gap: 6px;
	}
	.controls button,
	.seg button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 7px 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		cursor: pointer;
	}
	.controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.controls .primary {
		flex: 1;
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-fg);
		font-weight: 600;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
	}
	.seg {
		display: flex;
	}
	.seg button {
		padding: 6px 12px;
	}
	.seg button:first-child {
		border-radius: 6px 0 0 6px;
	}
	.seg button:last-child {
		border-radius: 0 6px 6px 0;
		margin-left: -1px;
	}
	.seg button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		cursor: pointer;
	}
	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 12px;
		margin: 0;
		padding: 10px;
		border-radius: 8px;
		background: var(--surface-2);
	}
	.stats div:first-child {
		grid-column: 1 / -1;
	}
	dt {
		color: var(--muted);
		font-size: 0.72rem;
	}
	dd {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 2px 0 0;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	dd small {
		color: var(--muted);
		font-weight: 400;
	}
	.bar {
		flex: 1;
		height: 6px;
		border-radius: 3px;
		background: var(--line);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--ok);
		transition: width 0.2s;
	}
	.outcome.solved {
		color: var(--ok);
	}
	.outcome.contradiction,
	.outcome.error,
	.contra {
		color: var(--danger);
	}
	.log {
		flex: 1;
		min-height: 140px;
		margin: 0;
		padding: 6px 0;
		list-style: none;
		overflow-y: auto;
		border-top: 1px solid var(--line);
		font-family: var(--mono);
		font-size: 0.74rem;
	}
	.log li {
		display: flex;
		gap: 6px;
		padding: 2px 0;
		line-height: 1.4;
	}
	.log .n {
		flex-shrink: 0;
		width: 3.5em;
		text-align: right;
		color: var(--muted);
	}
	.log .line {
		flex-shrink: 0;
		color: var(--focus-color);
	}
	.log li.note .text {
		color: var(--memo-color);
	}
	.log li.memo-clear .text,
	.log li.memo-commit .text,
	.log li.pause .text {
		color: var(--memo-color);
		font-weight: 600;
	}
	.log li.end .text {
		font-weight: 700;
	}
	.log li.empty {
		color: var(--muted);
		font-family: var(--font);
	}
	.api summary {
		color: var(--muted);
		cursor: pointer;
	}
	.api pre {
		margin: 6px 0 0;
		padding: 8px;
		border-radius: 6px;
		background: var(--surface-2);
		font-size: 0.72rem;
		white-space: pre-wrap;
	}
</style>
