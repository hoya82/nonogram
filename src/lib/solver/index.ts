/**
 * 솔버 공개 API 와 전략 목록.
 * 새 전략은 strategies/ 에 defineStrategy(...) 로 만들고 아래 STRATEGIES 에 넣으면 화면에 나온다.
 */
import { overlapSweep } from './strategies/overlap.js';
import { linePropagation, overlapThenPropagation } from './strategies/line-propagation.js';
import { probing } from './strategies/probing.js';
import { createGenetic, genetic } from './strategies/genetic.js';
import { backtracking, createBacktracking } from './strategies/backtracking.js';
import type { Strategy } from './types.js';

export * from './types.js';
export * from './steps.js';
export { applyStep, isIdleStep } from './apply.js';
export { runHeadless, type HeadlessResult, type HeadlessOptions } from './headless.js';
export {
	propagate,
	LineQueue,
	linesBySlack,
	crossingLine,
	allLinesSatisfied,
	type LineSolver,
	type PropagateOptions,
	type PropagateResult
} from './propagate.js';

export const STRATEGIES: readonly Strategy[] = [
	overlapSweep,
	linePropagation,
	overlapThenPropagation,
	probing,
	genetic,
	backtracking
];

export function findStrategy(id: string): Strategy | undefined {
	return STRATEGIES.find((s) => s.id === id);
}

export {
	overlapSweep,
	linePropagation,
	overlapThenPropagation,
	probing,
	genetic,
	createGenetic,
	backtracking,
	createBacktracking
};
export type { GeneticStrategyOptions } from './strategies/genetic.js';
export type { BacktrackingStrategyOptions } from './strategies/backtracking.js';
export {
	GeneticSearch,
	buildModel,
	countPlacements,
	lineDistance,
	DEFAULT_GENETIC_OPTIONS,
	type GeneticOptions,
	type GeneticModel,
	type GenerationReport
} from './genetic.js';
export {
	BacktrackSearch,
	GridPropagator,
	LineBuffers,
	countSolutions,
	DEFAULT_BACKTRACK_OPTIONS,
	type BacktrackOptions,
	type SearchEvent,
	type SearchSummary
} from './backtrack.js';
