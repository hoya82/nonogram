/*
 * 손 쓴 시간 — 판을 실제로 푼 시간. 노노그램 Touch·Pad, 컬러 플레이어가 같이 쓴다(2026-11-06).
 * 창이 보이고(document.hidden 아님) 마지막으로 화면을 만진 지 60초 안일 때만 센다. 창을 닫아 둔 날·딴 탭에 가 있던 때·손 놓고 있던 때는 안 센다.
 * 예전 풀이 시간(브라우저 칸)은 "처음 시작한 시각부터 지금까지"라 며칠 묵힌 판이 120시간으로 찍혔다 — 그 값은 화면 타이머·순위가 그대로 쓰고, 이 값은 풀이 기록이 쓴다.
 *
 *   PlayTimer.reset()      새 판·다시 하기 — 0부터
 *   PlayTimer.resume(s)    저장에서 이어 풀기 — 저장해 둔 손 쓴 시간(초)부터. 숫자가 아니면(이 장치 전의 저장) 처음부터 세지 못했으니 모름(-1)
 *   PlayTimer.seconds()    저장·제출할 값(초). 모르면 -1
 */
(function (w) {
	var IDLE_MS = 60000;	// 마지막으로 만진 뒤 이만큼까지는 생각하는 시간으로 센다
	var STEP_MAX = 5000;	// 한 번에 더하는 최대 — 타이머가 늦게 돌아도(기기 잠듦 등) 몰아 세지 않게
	var ms = 0, known = true, lastInput = 0, prev = Date.now();

	function tick() {
		var now = Date.now(), dt = now - prev;
		prev = now;
		if (dt > 0 && !document.hidden && now - lastInput <= IDLE_MS) ms += Math.min(dt, STEP_MAX);
	}
	function input() { lastInput = Date.now(); }
	function fresh() { lastInput = prev = Date.now(); }

	['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (t) {
		document.addEventListener(t, input, { capture: true, passive: true });
	});
	document.addEventListener('visibilitychange', function () { prev = Date.now(); });
	setInterval(tick, 1000);

	w.PlayTimer = {
		reset: function () { ms = 0; known = true; fresh(); },
		resume: function (s) {
			if (typeof s === 'number' && s >= 0) { ms = s * 1000; known = true; }
			else { ms = 0; known = false; }
			fresh();
		},
		seconds: function () { return known ? Math.round(ms / 1000) : -1; }
	};
})(window);
