/**
 * 번들에 넣은 퍼즐 목록 — 이 폴더의 *.json (파일 포맷 v1).
 * 새 퍼즐: scripts/import-nemonemo.ts 로 board.html 을 옮기거나 JSON 을 직접 넣는다.
 */
import { puzzleOrThrow, type Puzzle } from '../nonogram/puzzle.js';

export interface CatalogEntry {
	readonly id: string;
	readonly puzzle: Puzzle;
}

const files = import.meta.glob<unknown>('./*.json', { eager: true, import: 'default' });

export const CATALOG: readonly CatalogEntry[] = Object.entries(files)
	.map(([path, json]) => ({
		id: path.replace(/^\.\//, '').replace(/\.json$/, ''),
		puzzle: puzzleOrThrow(json)
	}))
	.sort((a, b) => a.puzzle.width * a.puzzle.height - b.puzzle.width * b.puzzle.height);

export function findPuzzle(id: string): CatalogEntry | undefined {
	return CATALOG.find((e) => e.id === id);
}

/** 홈에서 붙여 넣은 퍼즐이 머무는 sessionStorage 키 — /play/custom 이 읽는다 */
export const CUSTOM_PUZZLE_KEY = 'nonogram-lab/custom';
