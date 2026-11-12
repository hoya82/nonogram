/**
 * 참고 사이트 board.html (또는 puzzleData JSON) → 퍼즐 파일(v1 JSON).
 *
 *   bun scripts/import-nemonemo.ts <board.html> [--title "제목"] [--out src/lib/puzzles/이름.json]
 *
 * --out 이 없으면 표준 출력으로 낸다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseAnyPuzzleText } from '../src/lib/nonogram/formats/nemonemo.ts';
import {
	describePuzzleError,
	stringifyPuzzleFile,
	toPuzzleFile
} from '../src/lib/nonogram/puzzle.ts';

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: { title: { type: 'string' }, out: { type: 'string' } },
	allowPositionals: true
});

const input = positionals[0];
if (!input) {
	console.error('사용법: bun scripts/import-nemonemo.ts <board.html> [--title 제목] [--out 파일]');
	process.exit(1);
}

const result = parseAnyPuzzleText(readFileSync(input, 'utf8'), {
	...(values.title && { title: values.title })
});
if (!result.ok) {
	console.error('읽지 못했습니다:\n  ' + result.errors.map(describePuzzleError).join('\n  '));
	process.exit(1);
}

const p = result.value;
const json = stringifyPuzzleFile(toPuzzleFile(p));
if (values.out) {
	writeFileSync(values.out, json);
	console.error(`${values.out}: ${p.width}×${p.height}`);
} else {
	process.stdout.write(json);
}
