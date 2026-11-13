/**
 * 유전 알고리즘 벤치마크 — 퍼즐마다 씨앗 여러 개로 진화를 돌려 몇 세대·몇 ms 에 풀리는지 본다.
 *
 *   bun scripts/bench-genetic.ts [퍼즐 id,…|all] [씨앗 수] [최대 세대] [옵션 JSON] [--no-fix]
 *   bun scripts/bench-genetic.ts random-20-probing 20 5000
 *   bun scripts/bench-genetic.ts random-20-probing 5 4000 '{"polish":0}'      # 다듬기 없는 순수 GA
 *   bun scripts/bench-genetic.ts heart,cup 20 3000 '{}' --no-fix              # 확정 칸 계산 없이 진화만
 *
 * 전략(strategies/genetic.ts)과 같이 먼저 줄 전파로 확정 칸을 정해 고정하고(--no-fix 면 생략), 같은 규칙으로 축을 고른 뒤
 * 진화만 잰다(스캔 기록·화면 단계는 뺀다). 줄 전파만으로 풀리는 판은 진화 없이 "줄 전파로 풀림".
 * 출력: `OK@세대(ms,r재시작)` 또는 `f=최선 불일치@세대(…)`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { colRef, rowRef } from '../src/lib/nonogram/line.ts';
import { puzzleOrThrow } from '../src/lib/nonogram/puzzle.ts';
import {
	buildModel,
	countPlacements,
	fixedMask,
	GeneticSearch
} from '../src/lib/solver/genetic.ts';
import { linePropagation, runHeadless } from '../src/lib/solver/index.ts';

const args = process.argv.slice(2).filter((a) => a !== '--no-fix');
const fix = !process.argv.includes('--no-fix');
const [which = 'all', seedsArg = '5', maxGenArg = '3000', optsArg = '{}'] = args;
const seeds = Number(seedsArg);
const maxGen = Number(maxGenArg);
const opts = JSON.parse(optsArg);

const dir = new URL('../src/lib/puzzles/', import.meta.url);
const ids = readdirSync(dir)
	.filter((f) => f.endsWith('.json'))
	.map((f) => f.replace(/\.json$/, ''))
	.filter((id) => which === 'all' || which.split(',').includes(id));

for (const id of ids) {
	const p = puzzleOrThrow(JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8')));
	const pre = runHeadless(p, fix ? linePropagation : []);
	const board = pre.board;
	const fixedCells = board.countWhere((v) => v === 1 || v === 2);
	if (pre.outcome.status === 'solved') {
		console.log(`${id} ${p.width}×${p.height}: 줄 전파로 풀림 (진화 없음)`);
		continue;
	}
	const rows = p.rows.map((clue, y) => ({ fixed: fixedMask(board.line(rowRef(y))), clue }));
	const cols = p.cols.map((clue, x) => ({ fixed: fixedMask(board.line(colRef(x))), clue }));
	const log10 = (ls: typeof rows) =>
		ls.reduce((s, l) => s + Math.log10(countPlacements(l.fixed, l.clue).count), 0);
	const [lr, lc] = [log10(rows), log10(cols)];
	const useRows = lr <= lc;
	const built = useRows ? buildModel(rows, p.cols) : buildModel(cols, p.rows);
	const head = `${id} ${p.width}×${p.height} 고정 ${fixedCells}칸 축=${useRows ? '행' : '열'} (행 10^${lr.toFixed(1)} · 열 10^${lc.toFixed(1)})`;
	if (!built.ok) {
		console.log(`${head}: 배치가 없는 줄 ${built.line + 1}`);
		continue;
	}
	const res: string[] = [];
	let solved = 0;
	for (let seed = 1; seed <= seeds; seed++) {
		const t0 = performance.now();
		const ga = new GeneticSearch(built.model, { ...opts, seed });
		while (ga.best.fitness > 0 && ga.generation < maxGen) ga.step();
		const ms = (performance.now() - t0).toFixed(0);
		if (ga.best.fitness === 0) solved++;
		res.push(
			`${ga.best.fitness === 0 ? 'OK' : `f=${ga.best.fitness}`}@${ga.generation}(${ms}ms,r${ga.restarts})`
		);
	}
	console.log(`${head}: ${solved}/${seeds} — ${res.join(' ')}`);
}
