/** 단계를 판에 적용한다 — 화면 실행기와 headless 실행기가 함께 쓴다 */
import type { Board, Change, WriteOptions } from '../nonogram/board.js';
import type { SolverStep } from './types.js';

export function applyStep(board: Board, step: SolverStep, opts: WriteOptions): Change[] {
	switch (step.kind) {
		case 'paint':
			return board.paint(step.writes, opts);
		case 'memo-clear':
			return board.clearMemo(opts);
		case 'memo-commit':
			return board.commitMemo(opts);
		case 'inspect':
		case 'note':
		case 'pause':
			return [];
	}
}

/** 판을 바꾸지 않는 단계인가 */
export const isIdleStep = (step: SolverStep): boolean =>
	step.kind === 'inspect' || step.kind === 'note' || step.kind === 'pause';
