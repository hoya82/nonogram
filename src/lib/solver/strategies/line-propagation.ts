/**
 * 전략 2 — 줄 전파 (완전 줄 풀이 + 대기열).
 *
 * 줄 하나만 보고 알 수 있는 것은 전부 찾는 DP 줄 풀이를, 바뀐 칸을 지나는 줄만 다시 보는
 * 대기열로 돌린다. "줄 풀이로 풀리는(line-solvable)" 판은 모두 푼다.
 *
 * 구조 예시: 하위 절차 propagate 를 `yield*` 로 그대로 위임하는 전략.
 */
import { overlapLine } from '../../nonogram/line.js';
import { propagate } from '../propagate.js';
import { finalOutcome } from '../steps.js';
import { defineStrategy, type SolveOutcome, type StepGenerator } from '../types.js';
import type { SolverContext } from '../types.js';

function* run(ctx: SolverContext, quick: boolean): StepGenerator {
	if (quick) {
		// 싼 겹치기로 먼저 한 번 돌리고, 그다음 완전 DP — 같은 결과, 다른 순서(애니메이션 비교용)
		const r = yield* propagate(ctx, { lineSolver: overlapLine, label: '(겹치기) ' });
		if (r === 'contradiction') return { status: 'contradiction' } satisfies SolveOutcome;
	}
	const r = yield* propagate(ctx);
	if (r === 'contradiction') return { status: 'contradiction' };
	return finalOutcome(ctx);
}

export const linePropagation = defineStrategy({
	id: 'line-propagation',
	name: '줄 전파',
	description:
		'줄마다 가능한 모든 배치를 DP 로 따져 확정 칸을 찾고, 바뀐 칸을 지나는 줄을 대기열에 넣어 다시 본다. 줄 풀이로 풀리는 판은 모두 푼다.',
	solve: (ctx) => run(ctx, false)
});

export const overlapThenPropagation = defineStrategy({
	id: 'overlap-then-propagation',
	name: '겹치기 → 줄 전파',
	description:
		'겹치기만으로 대기열 전파를 먼저 끝까지 돌리고, 막히면 완전 DP 전파로 넘어간다. 두 줄 풀이 함수를 같은 전파 절차에 바꿔 끼우는 예시.',
	solve: (ctx) => run(ctx, true)
});
