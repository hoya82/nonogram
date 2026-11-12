/**
 * 플레이어 설정 — 이 브라우저에만 저장(localStorage). 저장이 막힌 환경에서도 기본값으로 동작한다.
 * 루트 레이아웃이 하나 만들어 context 로 내려 준다 (getSettings).
 */
import { createContext } from 'svelte';

export type Theme = 'system' | 'light' | 'dark';
export type Granularity = 'step' | 'cell';

export interface PlayerSettings {
	/** 마우스 아래 행·열 비추기 */
	showGuides: boolean;
	/** 끄는 동안 칸 수 툴팁 */
	showDragTooltip: boolean;
	/** 사각형으로 칠하기 (꺼져 있으면 한 줄씩) */
	rectDrag: boolean;
	/** 끝난 조각 숫자 지우기 */
	clueCross: boolean;
	/** 줄 완성 시 남은 칸 자동 X */
	autoCross: boolean;
	/** 단서를 놓을 수 없는 줄을 빨갛게 */
	showContradictions: boolean;
	/** 칸 바뀜 애니메이션 */
	animate: boolean;
	theme: Theme;
	/** 0.5 – 2.0 */
	zoom: number;
	/** 솔버 */
	strategyId: string;
	paceId: string;
	granularity: Granularity;
	showIdle: boolean;
	solverOpen: boolean;
}

export const DEFAULT_SETTINGS: Readonly<PlayerSettings> = {
	showGuides: true,
	showDragTooltip: true,
	rectDrag: false,
	clueCross: true,
	autoCross: true,
	showContradictions: true,
	animate: true,
	theme: 'system',
	zoom: 1,
	strategyId: 'line-propagation',
	paceId: 'r10',
	granularity: 'step',
	showIdle: false,
	solverOpen: true
};

const KEY = 'nonogram-lab/settings';

function load(): PlayerSettings {
	const out = { ...DEFAULT_SETTINGS };
	try {
		const raw = globalThis.localStorage?.getItem(KEY);
		if (!raw) return out;
		const saved = JSON.parse(raw) as Record<string, unknown>;
		for (const key of Object.keys(out) as (keyof PlayerSettings)[]) {
			if (typeof saved[key] === typeof out[key]) (out as Record<string, unknown>)[key] = saved[key];
		}
	} catch {
		// 저장소가 막혔거나 깨졌다 — 기본값
	}
	out.zoom = Math.min(2, Math.max(0.5, out.zoom));
	return out;
}

export class Settings {
	#values: PlayerSettings = $state(load());

	get current(): Readonly<PlayerSettings> {
		return this.#values;
	}

	set<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]): void {
		this.#values[key] = value;
		try {
			globalThis.localStorage?.setItem(KEY, JSON.stringify(this.#values));
		} catch {
			// 저장 실패는 조용히 — 이번 세션 동안은 유지된다
		}
	}

	zoomBy(delta: number): void {
		const z = Math.round(Math.min(2, Math.max(0.5, this.#values.zoom + delta)) * 10) / 10;
		if (z !== this.#values.zoom) this.set('zoom', z);
	}
}

export const [getSettings, setSettings] = createContext<Settings>();
