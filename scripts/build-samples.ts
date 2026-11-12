/** 예제 그림 → 퍼즐 파일.  bun scripts/build-samples.ts */
import { writeFileSync } from 'node:fs';
import { SAMPLE_PICTURES } from '../src/lib/puzzles/pictures/samples.ts';
import { puzzleFromPicture } from '../src/lib/nonogram/formats/picture.ts';
import { stringifyPuzzleFile, toPuzzleFile } from '../src/lib/nonogram/puzzle.ts';

for (const [id, { title, picture }] of Object.entries(SAMPLE_PICTURES)) {
	const p = puzzleFromPicture(picture, { title, source: 'sample' });
	const out = `src/lib/puzzles/${id}.json`;
	writeFileSync(out, stringifyPuzzleFile(toPuzzleFile(p)));
	console.log(`${out}: ${p.width}×${p.height}`);
}
