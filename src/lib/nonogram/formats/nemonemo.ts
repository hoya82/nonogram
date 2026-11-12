/**
 * 참고 사이트(nemonemologic.com) 게임판에서 단서를 뽑는다. DOM 없이 정규식으로 — Node·브라우저 어디서나.
 *
 * board.html 구조:
 *   <div id="game-board" class="game-board" style="grid-template-columns: 246px repeat(40, 26px); ...">
 *     <div class="corner"></div>
 *     <div class="hint col" id="vhint-0"><span class="hint-span">7</span><span class="hint-span">19</span></div>  ← 열 단서(위→아래)
 *     ...
 *     <div class="hint row" id="hhint-0"><span class="hint-span">34</span></div>                                 ← 행 단서(왼→오)
 *     <div class="cell" data-x="0" data-y="0"></div> ...
 *
 * 페이지 스크립트의 puzzleData({ hhints, vhints }) 를 붙여 넣어도 읽는다 — hhints = 행, vhints = 열.
 */
import {
	createPuzzle,
	parsePuzzleFile,
	type Puzzle,
	type PuzzleError,
	type PuzzleMeta,
	type Result
} from '../puzzle.js';

const HINT_DIV = /<div\b[^>]*\bid\s*=\s*["']([vh])hint-(\d+)["'][^>]*>([\s\S]*?)<\/div>/gi;
const HINT_SPAN = /<span\b[^>]*>\s*(\d+)\s*<\/span>/gi;
const CELL_XY = /data-x\s*=\s*["'](\d+)["'][^>]*data-y\s*=\s*["'](\d+)["']/gi;

export interface RawClues {
	readonly rows: number[][];
	readonly cols: number[][];
}

/** board.html 에서 단서 배열만 뽑는다 (검증 전) */
export function extractBoardHtmlClues(html: string): RawClues | null {
	const rows: number[][] = [];
	const cols: number[][] = [];
	for (const m of html.matchAll(HINT_DIV)) {
		const nums = [...m[3].matchAll(HINT_SPAN)].map((s) => Number(s[1]));
		const index = Number(m[2]);
		if (m[1].toLowerCase() === 'v') cols[index] = nums;
		else rows[index] = nums;
	}
	if (rows.length === 0 || cols.length === 0) return null;

	// 빠진 번호가 있으면(잘린 붙여넣기) 실패로 본다
	const dense = (a: number[][]) => a.length === Object.keys(a).length;
	if (!dense(rows) || !dense(cols)) return null;

	// 칸이 있으면 크기를 맞춰 본다
	let maxX = -1;
	let maxY = -1;
	for (const m of html.matchAll(CELL_XY)) {
		maxX = Math.max(maxX, Number(m[1]));
		maxY = Math.max(maxY, Number(m[2]));
	}
	if (maxX >= 0 && (maxX + 1 !== cols.length || maxY + 1 !== rows.length)) return null;

	// 숫자 없는 줄 = 빈 줄
	return {
		rows: rows.map((r) => (r.length ? r : [0])),
		cols: cols.map((c) => (c.length ? c : [0]))
	};
}

export function parseBoardHtml(html: string, meta: PuzzleMeta = {}): Result<Puzzle, PuzzleError> {
	const raw = extractBoardHtmlClues(html);
	if (!raw) {
		return {
			ok: false,
			errors: [
				{ code: 'shape', message: 'board.html 에서 hhint-N / vhint-N 단서를 찾지 못했습니다' }
			]
		};
	}
	return createPuzzle(raw.rows, raw.cols, { source: 'nemonemologic.com', ...meta });
}

/**
 * 붙여 넣은 글을 알아서 읽는다:
 *   1) 파일 포맷 v1 JSON  { header, rows, cols }
 *   2) 사이트 puzzleData JSON  { hhints, vhints }
 *   3) board.html 조각
 */
export function parseAnyPuzzleText(
	text: string,
	meta: PuzzleMeta = {}
): Result<Puzzle, PuzzleError> {
	const trimmed = text.trim();
	if (trimmed.startsWith('{')) {
		let json: unknown;
		try {
			json = JSON.parse(trimmed);
		} catch (e) {
			return {
				ok: false,
				errors: [{ code: 'shape', message: 'JSON 을 읽지 못했습니다: ' + String(e) }]
			};
		}
		const obj = json as Record<string, unknown>;
		if (Array.isArray(obj.hhints) && Array.isArray(obj.vhints)) {
			return createPuzzle(obj.hhints, obj.vhints, {
				source: 'nemonemologic.com',
				...(typeof obj.title === 'string' && { title: obj.title }),
				...meta
			});
		}
		const r = parsePuzzleFile(json);
		if (r.ok && (meta.title || meta.source)) return { ok: true, value: { ...r.value, ...meta } };
		return r;
	}
	return parseBoardHtml(trimmed, meta);
}
