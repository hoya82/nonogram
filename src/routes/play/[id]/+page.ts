import { error } from '@sveltejs/kit';
import { parsePuzzleFile, type Puzzle } from '#lib/nonogram/puzzle.js';
import { CUSTOM_PUZZLE_KEY, findPuzzle } from '#lib/puzzles/index.js';
import type { PageLoad } from './$types';

// 판은 브라우저에서만 그린다 — 설정(localStorage)·붙여 넣은 퍼즐(sessionStorage)을 읽고, 콘솔 API 를 단다
export const ssr = false;

export const load: PageLoad = ({ params }) => {
	if (params.id === 'custom') {
		let puzzle: Puzzle | null = null;
		try {
			const raw = sessionStorage.getItem(CUSTOM_PUZZLE_KEY);
			const r = raw ? parsePuzzleFile(JSON.parse(raw)) : null;
			if (r?.ok) puzzle = r.value;
		} catch {
			// 깨진 값 — 아래에서 404
		}
		if (!puzzle) error(404, '붙여 넣은 퍼즐이 없습니다. 목록에서 다시 붙여 넣어 주세요.');
		return { id: params.id, puzzle };
	}
	const entry = findPuzzle(params.id);
	if (!entry) error(404, `퍼즐 없음: ${params.id}`);
	return { id: entry.id, puzzle: entry.puzzle };
};
