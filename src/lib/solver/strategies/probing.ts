/**
 * 전략 3 — 가정과 모순 (probing).
 *
 * 줄 전파가 막히면 빈칸 하나를 골라 메모(가정)로 칠해 보고, 메모 모드로 전파한다.
 *   - 모순이 나면 → 가정이 틀렸다 → 반대 값으로 확정
 *   - 둘 다 모순이 없으면 → 두 가정에서 똑같이 정해진 칸은 어느 쪽이든 참 → 확정
 *   - 가정대로 판이 다 맞으면 → 메모 확정
 * 화면에서는 주황 메모(▲, /)가 퍼졌다가 지워지는 모습으로 보인다.
 *
 * 구조 예시: 메모 값으로 "되돌릴 수 있는 가정" 을 그리고, `yield*` 로 하위 절차를 합성하는 전략.
 */
import type { Point } from '../../nonogram/board.js';
import { Cell, isMemo, toSolid } from '../../nonogram/cell.js';
import { colRef, rowRef, type LineRef } from '../../nonogram/line.js';
import { propagate } from '../propagate.js';
import { finalOutcome, memoClear, memoCommit, note, paint } from '../steps.js';
import {
	defineStrategy,
	type SolverContext,
	type SolverStep,
	type StepGenerator
} from '../types.js';

type ProbeResult =
	| { readonly kind: 'progress'; readonly lines: readonly LineRef[] }
	| { readonly kind: 'solved' }
	| { readonly kind: 'none' };

const at = (p: Point) => `(${p.x + 1},${p.y + 1})`;

/** 빈칸을 정해진 이웃이 많은 순서로 — 정해진 칸 가까이가 모순이 빨리 난다 */
export function probeCandidates(ctx: SolverContext): Point[] {
	const { board } = ctx;
	const { width: W, height: H } = board;
	const known = (x: number, y: number) =>
		x < 0 || y < 0 || x >= W || y >= H || board.get(x, y) !== Cell.Unknown;
	const out: { p: Point; score: number }[] = [];
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			if (board.get(x, y) !== Cell.Unknown) continue;
			const score = +known(x - 1, y) + +known(x + 1, y) + +known(x, y - 1) + +known(x, y + 1);
			out.push({ p: { x, y }, score });
		}
	}
	return out.sort((a, b) => b.score - a.score).map((o) => o.p);
}

/** 지금 판의 메모 칸 → (index → 확정 값) */
function memoSnapshot(ctx: SolverContext): Map<number, Cell> {
	const { board } = ctx;
	const out = new Map<number, Cell>();
	for (let y = 0; y < board.height; y++) {
		for (let x = 0; x < board.width; x++) {
			const v = board.get(x, y);
			if (isMemo(v)) out.set(y * board.width + x, toSolid(v));
		}
	}
	return out;
}

function* probeOnce(ctx: SolverContext): Generator<SolverStep, ProbeResult, void> {
	const W = ctx.board.width;
	for (const p of probeCandidates(ctx)) {
		if (ctx.board.get(p.x, p.y) !== Cell.Unknown) continue;
		const branches: Map<number, Cell>[] = [];
		for (const guess of [Cell.MemoFilled, Cell.MemoCrossed] as const) {
			const label = guess === Cell.MemoFilled ? '칠' : 'X';
			yield paint([{ ...p, value: guess }], undefined, `가정: ${at(p)} = ${label}`);
			const r = yield* propagate(ctx, { memo: true, initial: [rowRef(p.y), colRef(p.x)] });

			if (r === 'solved') {
				yield memoCommit(`가정 ${at(p)} = ${label} 로 판이 다 맞았다 → 확정`);
				return { kind: 'solved' };
			}
			if (r === 'contradiction') {
				yield memoClear(`가정 ${at(p)} = ${label} → 모순`);
				const real = guess === Cell.MemoFilled ? Cell.Crossed : Cell.Filled;
				yield paint(
					[{ ...p, value: real }],
					undefined,
					`${at(p)} 는 ${real === Cell.Filled ? '칠' : 'X'} 로 확정 (반대 가정이 모순)`
				);
				return { kind: 'progress', lines: [rowRef(p.y), colRef(p.x)] };
			}
			branches.push(memoSnapshot(ctx));
			yield memoClear(`가정 ${at(p)} = ${label} → 모순 없음`);
		}

		// 두 가정 모두 모순이 없다 — 양쪽에서 같은 값이 된 칸은 참
		const [a, b] = branches;
		const writes = [];
		for (const [index, value] of a) {
			if (b.get(index) !== value) continue;
			writes.push({ x: index % W, y: Math.floor(index / W), value });
		}
		if (writes.length) {
			yield paint(writes, undefined, `${at(p)} 양쪽 가정에서 공통 → ${writes.length}칸 확정`);
			const lines = new Map<string, LineRef>();
			for (const w of writes) {
				lines.set(`r${w.y}`, rowRef(w.y));
				lines.set(`c${w.x}`, colRef(w.x));
			}
			return { kind: 'progress', lines: [...lines.values()] };
		}
	}
	return { kind: 'none' };
}

export const probing = defineStrategy({
	id: 'probing',
	name: '가정 & 모순',
	description:
		'줄 전파가 막히면 빈칸 하나를 메모(가정)로 칠해 보고 메모 모드로 전파한다. 모순이면 반대로 확정, 둘 다 모순이 없으면 양쪽 공통 칸을 확정. 주황 메모가 퍼졌다 지워지는 모습으로 보인다.',
	*solve(ctx): StepGenerator {
		let r = yield* propagate(ctx);
		let probes = 0;
		for (;;) {
			if (r === 'contradiction') return { status: 'contradiction', note: '가정 없이 모순' };
			if (r === 'solved') return finalOutcome(ctx, `가정 ${probes}번`);
			yield note('줄 전파가 막혔다 → 가정 시작');
			const found = yield* probeOnce(ctx);
			probes++;
			if (found.kind === 'none') return finalOutcome(ctx, '더 알아낼 가정이 없다');
			if (found.kind === 'solved') return finalOutcome(ctx, `가정 ${probes}번`);
			r = yield* propagate(ctx, { initial: found.lines });
		}
	}
});
