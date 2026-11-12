/**
 * 전략 1 — 겹치기 훑기 (LR overlap sweep).
 *
 * 사람 손풀이의 첫걸음: 줄마다 숫자의 가장 왼쪽·가장 오른쪽 자리를 놓아 보고 겹치는 칸을 칠하고,
 * 어느 숫자도 닿지 않는 칸은 X. 행 1 → 행 H → 열 1 → 열 W 순서로 훑고, 한 바퀴 동안
 * 아무것도 못 바꾸면 멈춘다. 완전한 줄 풀이보다 약해서 못 푸는 판이 있다 — 비교 기준선.
 *
 * 구조 예시: 대기열 없이 고정 순서로 도는 "훑기" 전략.
 */
import { allLines, lineClue, overlapLine } from '../../nonogram/line.js';
import { describeDeductions } from '../propagate.js';
import { deductionsToWrites, finalOutcome, inspect, paint } from '../steps.js';
import { defineStrategy } from '../types.js';

export const overlapSweep = defineStrategy({
	id: 'overlap-sweep',
	name: '겹치기 훑기',
	description:
		'줄마다 숫자의 왼쪽 끝·오른쪽 끝 배치를 겹쳐 확실한 칸을 칠하고, 닿지 않는 칸을 X 로. 행→열 순서로 바뀌는 게 없을 때까지 훑는다. 완전한 줄 풀이보다 약한 기준선.',
	*solve(ctx) {
		const { puzzle, board } = ctx;
		for (let pass = 1; ; pass++) {
			let changed = false;
			for (const ref of allLines(puzzle)) {
				const deductions = overlapLine(board.line(ref), lineClue(puzzle, ref));
				if (deductions === null) {
					return { status: 'contradiction', note: `${pass}바퀴째 모순` };
				}
				if (deductions.length === 0) {
					yield inspect(ref);
					continue;
				}
				yield paint(
					deductionsToWrites(ref, deductions),
					ref,
					describeDeductions(ref, deductions, `[${pass}] `)
				);
				changed = true;
			}
			if (!changed) return finalOutcome(ctx, `${pass}바퀴`);
		}
	}
});
