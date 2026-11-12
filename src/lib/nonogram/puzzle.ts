/**
 * 퍼즐(단서) 모델.
 *
 * 파일 포맷(v1) — 참고 사이트 board.html 을 옮긴 모양:
 *   { header: { version: 1, title?, source? }, rows: [[34], [1,1,5,5,1,1], ...], cols: [[7,19], ...] }
 *   rows[y] = y 번째 행의 단서(왼쪽 → 오른쪽), cols[x] = x 번째 열의 단서(위 → 아래).
 *   칠할 칸이 없는 줄은 [0] (빈 배열 [] 도 받는다).
 *
 * 메모리 안에서는 검증을 통과한 `Puzzle` 만 다룬다. 단서 숫자는 `Run`(1 이상의 정수) 브랜드 타입이고,
 * 빈 줄은 빈 배열이다. `parsePuzzleFile` 이 노노그램의 구성 규칙을 검사한다:
 *   1. 가로·세로 줄이 하나 이상
 *   2. 단서 숫자는 1 이상의 정수 (빈 줄은 [0] 하나)
 *   3. 한 줄의 최소 길이(숫자 합 + 사이 빈칸 수) ≤ 줄 길이
 *   4. 모든 행 단서의 합 = 모든 열 단서의 합 (칠할 칸 수가 같아야 한다)
 */

declare const RunBrand: unique symbol;
/** 한 줄 안의 연속 칠 조각 길이 — 1 이상의 정수 */
export type Run = number & { readonly [RunBrand]: true };
/** 한 줄의 단서. 빈 배열 = 칠할 칸이 없는 줄 */
export type LineClue = readonly Run[];

export interface PuzzleMeta {
	readonly title?: string;
	readonly source?: string;
}

export interface Puzzle extends PuzzleMeta {
	readonly width: number;
	readonly height: number;
	/** rows[y] — 행 단서 (길이 height) */
	readonly rows: readonly LineClue[];
	/** cols[x] — 열 단서 (길이 width) */
	readonly cols: readonly LineClue[];
}

export interface PuzzleFileHeaderV1 extends PuzzleMeta {
	readonly version: 1;
}

/** 저장·교환용 파일 포맷 v1 */
export interface PuzzleFileV1 {
	readonly header: PuzzleFileHeaderV1;
	readonly rows: readonly (readonly number[])[];
	readonly cols: readonly (readonly number[])[];
}

export type PuzzleFile = PuzzleFileV1;

export type Axis = 'row' | 'col';

export type PuzzleError =
	| { readonly code: 'shape'; readonly message: string }
	| { readonly code: 'version'; readonly version: unknown }
	| { readonly code: 'empty-board' }
	| {
			readonly code: 'bad-run';
			readonly axis: Axis;
			readonly index: number;
			readonly value: unknown;
	  }
	| {
			readonly code: 'line-overflow';
			readonly axis: Axis;
			readonly index: number;
			readonly need: number;
			readonly size: number;
	  }
	| { readonly code: 'sum-mismatch'; readonly rowSum: number; readonly colSum: number };

export type Result<T, E> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly E[] };

export function isRun(n: unknown): n is Run {
	return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

/** 단서를 놓는 데 필요한 최소 칸 수 (숫자 합 + 사이 빈칸) */
export function clueMinLength(clue: LineClue): number {
	if (clue.length === 0) return 0;
	let sum = clue.length - 1;
	for (const r of clue) sum += r;
	return sum;
}

export function clueSum(clue: LineClue): number {
	let sum = 0;
	for (const r of clue) sum += r;
	return sum;
}

/** 줄 단서 하나를 정규화 — [0] → [], 숫자 검사 */
function normalizeClue(
	raw: unknown,
	axis: Axis,
	index: number,
	errors: PuzzleError[]
): LineClue | null {
	if (!Array.isArray(raw)) {
		errors.push({ code: 'bad-run', axis, index, value: raw });
		return null;
	}
	if (raw.length === 1 && raw[0] === 0) return [];
	const out: Run[] = [];
	for (const v of raw) {
		if (!isRun(v)) {
			errors.push({ code: 'bad-run', axis, index, value: v });
			return null;
		}
		out.push(v);
	}
	return out;
}

/** 단서 배열로 퍼즐을 만든다 — 노노그램 구성 규칙을 모두 검사한다 */
export function createPuzzle(
	rawRows: readonly unknown[],
	rawCols: readonly unknown[],
	meta: PuzzleMeta = {}
): Result<Puzzle, PuzzleError> {
	if (rawRows.length === 0 || rawCols.length === 0) {
		return { ok: false, errors: [{ code: 'empty-board' }] };
	}
	const errors: PuzzleError[] = [];
	const height = rawRows.length;
	const width = rawCols.length;
	const rows = rawRows.map((r, y) => normalizeClue(r, 'row', y, errors));
	const cols = rawCols.map((c, x) => normalizeClue(c, 'col', x, errors));
	if (errors.length) return { ok: false, errors };

	const okRows = rows as LineClue[];
	const okCols = cols as LineClue[];
	okRows.forEach((clue, y) => {
		const need = clueMinLength(clue);
		if (need > width)
			errors.push({ code: 'line-overflow', axis: 'row', index: y, need, size: width });
	});
	okCols.forEach((clue, x) => {
		const need = clueMinLength(clue);
		if (need > height)
			errors.push({ code: 'line-overflow', axis: 'col', index: x, need, size: height });
	});
	const rowSum = okRows.reduce((s, c) => s + clueSum(c), 0);
	const colSum = okCols.reduce((s, c) => s + clueSum(c), 0);
	if (rowSum !== colSum) errors.push({ code: 'sum-mismatch', rowSum, colSum });
	if (errors.length) return { ok: false, errors };

	const puzzle: Puzzle = {
		width,
		height,
		rows: Object.freeze(okRows.map((c) => Object.freeze([...c]))),
		cols: Object.freeze(okCols.map((c) => Object.freeze([...c]))),
		...(meta.title !== undefined && { title: meta.title }),
		...(meta.source !== undefined && { source: meta.source })
	};
	return { ok: true, value: Object.freeze(puzzle) };
}

/** 알 수 없는 값(JSON 등)을 파일 포맷 v1 로 보고 검증해 Puzzle 로 만든다 */
export function parsePuzzleFile(input: unknown): Result<Puzzle, PuzzleError> {
	if (typeof input !== 'object' || input === null) {
		return { ok: false, errors: [{ code: 'shape', message: '객체가 아닙니다' }] };
	}
	const obj = input as Record<string, unknown>;
	const header = (obj.header ?? { version: 1 }) as Record<string, unknown>;
	if (header.version !== 1) {
		return { ok: false, errors: [{ code: 'version', version: header.version }] };
	}
	if (!Array.isArray(obj.rows) || !Array.isArray(obj.cols)) {
		return { ok: false, errors: [{ code: 'shape', message: 'rows·cols 배열이 필요합니다' }] };
	}
	return createPuzzle(obj.rows, obj.cols, {
		title: typeof header.title === 'string' ? header.title : undefined,
		source: typeof header.source === 'string' ? header.source : undefined
	});
}

/** 검증 실패면 던진다 — 번들에 넣은 퍼즐처럼 틀릴 리 없는 데이터용 */
export function puzzleOrThrow(input: unknown): Puzzle {
	const r = parsePuzzleFile(input);
	if (!r.ok) throw new Error('잘못된 퍼즐: ' + r.errors.map(describePuzzleError).join(', '));
	return r.value;
}

export function toPuzzleFile(p: Puzzle): PuzzleFileV1 {
	const enc = (c: LineClue) => (c.length === 0 ? [0] : [...c]);
	return {
		header: {
			version: 1,
			...(p.title !== undefined && { title: p.title }),
			...(p.source !== undefined && { source: p.source })
		},
		rows: p.rows.map(enc),
		cols: p.cols.map(enc)
	};
}

/** 한 줄 = 한 배열, 줄 사이만 줄바꿈하는 읽기 쉬운 JSON */
export function stringifyPuzzleFile(file: PuzzleFileV1): string {
	const lines = (arr: readonly (readonly number[])[]) =>
		arr.map((c) => '\t\t' + JSON.stringify(c)).join(',\n');
	return (
		'{\n' +
		`\t"header": ${JSON.stringify(file.header)},\n` +
		`\t"rows": [\n${lines(file.rows)}\n\t],\n` +
		`\t"cols": [\n${lines(file.cols)}\n\t]\n` +
		'}\n'
	);
}

export function describePuzzleError(e: PuzzleError): string {
	const where = (axis: Axis, i: number) => `${axis === 'row' ? '행' : '열'} ${i + 1}`;
	switch (e.code) {
		case 'shape':
			return e.message;
		case 'version':
			return `지원하지 않는 버전: ${String(e.version)}`;
		case 'empty-board':
			return '행·열이 하나 이상 필요합니다';
		case 'bad-run':
			return `${where(e.axis, e.index)}: 잘못된 단서 숫자 ${JSON.stringify(e.value)}`;
		case 'line-overflow':
			return `${where(e.axis, e.index)}: 단서가 ${e.need}칸 필요하지만 줄은 ${e.size}칸`;
		case 'sum-mismatch':
			return `행 단서 합(${e.rowSum}) ≠ 열 단서 합(${e.colSum})`;
	}
}
