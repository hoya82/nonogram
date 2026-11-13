/**
 * 퍼즐의 해를 완전 탐색으로 센다 — "잘못 출제된 판인가" (해 없음 / 해가 여럿) 를 확인한다.
 *
 *   bun scripts/count-solutions.ts <퍼즐 id 또는 JSON 경로> [한도=2]
 *
 * 한도까지 찾으면 멈춘다. 한도보다 적게 찾았으면 그 수가 정확한 해의 수다(탐색을 끝까지 했다).
 * 해가 여럿이면 찾은 해들 사이에서 값이 바뀌는 칸을 ? 로 그린다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { countSolutions } from '../src/lib/solver/backtrack.ts';
import { puzzleOrThrow } from '../src/lib/nonogram/puzzle.ts';

const [arg, limitArg] = process.argv.slice(2);
if (!arg) {
	console.error('사용법: bun scripts/count-solutions.ts <퍼즐 id 또는 JSON 경로> [한도=2]');
	process.exit(1);
}
const path = existsSync(arg) ? arg : `src/lib/puzzles/${arg}.json`;
const puzzle = puzzleOrThrow(JSON.parse(readFileSync(path, 'utf8')));
const limit = limitArg ? Number(limitArg) : 2;
const { width: W, height: H } = puzzle;

const t0 = performance.now();
const s = countSolutions(puzzle, { maxSolutions: limit });
const ms = performance.now() - t0;
const n = s.solutions.length;

const title = puzzle.title ? `${puzzle.title} ` : '';
console.log(`${title}${W}×${H} — ${path}`);
console.log(
	`노드 ${s.nodes} · 탐침 ${s.probes} · 줄 풀이 ${s.lineSolves} · 최대 깊이 ${s.maxDepth} · ${(ms / 1000).toFixed(2)}초`
);
if (n === 0) console.log('해 없음 — 모든 가지가 모순이다 (잘못 출제된 판)');
else if (n === 1 && s.complete) console.log('유일해');
else
	console.log(
		s.complete ? `해 ${n}개 — 유일하지 않다` : `해가 ${n}개 이상 — 유일하지 않다 (한도 ${limit})`
	);

if (n >= 2) {
	const first = s.solutions[0];
	const vary = new Uint8Array(W * H);
	for (const g of s.solutions) for (let i = 0; i < W * H; i++) if (g[i] !== first[i]) vary[i] = 1;
	console.log(`\n찾은 해 ${n}개 사이에서 값이 바뀌는 칸 ${vary.reduce((a, v) => a + v, 0)}개 (?):`);
	for (let y = 0; y < H; y++) {
		let line = '';
		for (let x = 0; x < W; x++) {
			const i = y * W + x;
			line += vary[i] ? '?' : first[i] === 1 ? '█' : '·';
		}
		console.log(`${String(y + 1).padStart(3)} ${line}`);
	}
}
