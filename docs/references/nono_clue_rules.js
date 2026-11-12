(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NonoClueRules = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/**
 * 노노그램 숫자 지우기 규칙 — 순수 모듈(DOM 없음). 터치(play_logic_new.js)·패드(play_logic_pad.js)와
 * 시험(test/nono_clue)이 같이 쓴다. 설정 "끝난 조각 숫자 지우기"를 켠 사람에게만 보인다.
 *
 * 칸 값: 0 빈칸, 1 칠함, 2 X, 3 메모 칠, 4 메모 X (메모도 칠·X 로 센다 — 줄 완료 판정과 같다)
 *
 * 그 줄만 보고 숫자의 자리가 하나로 정해졌고, 그 칸을 다 칠했으면 지운다.
 *   지금 칠한 칸·X 와 어긋나지 않게 숫자를 놓는 방법을 모두 따져(줄 풀이), 그 숫자가 들어갈
 *   시작 칸이 하나뿐이고 그 칸들이 다 칠해져 있을 때만. 칸을 대신 칠하거나 X 를 놓지는 않는다.
 *   예) 2 2 2 줄 _##_____## → 앞 2·뒤 2 지움(앞에 다른 2 가 들어갈 자리가 없다), 가운데 2 는 아직 모름
 * 놓을 방법이 하나도 없으면(모순) 그 줄은 하나도 안 지운다 — 틀렸다고 알리지 않는다.
 * 숫자 0 줄은 줄 완료 표시가 맡는다 — 지우지 않는다.
 */
function isFill(v) { return v === 1 || v === 3; }
function isMark(v) { return v === 2 || v === 4; }

// clues 와 같은 길이의 true/false — true 면 지운다
function crossed(line, clues) {
  var none = clues.map(function () { return false; });
  if (clues.length === 1 && clues[0] === 0) return none;
  var n = line.length, m = clues.length, i, k;

  // i 칸부터 L 칸에 X 가 없나
  function fits(i, L) {
    if (i + L > n) return false;
    for (var j = i; j < i + L; j++) if (isMark(line[j])) return false;
    return true;
  }
  // 숫자 k 를 i 칸에 놓은 뒤 이어서 끝까지 놓을 수 있나 (뒤 칸은 빈칸이어야 하고, 그 뒤는 F)
  function tail(i, k) {
    var e = i + clues[k];
    return e === n ? k + 1 === m : !isFill(line[e]) && F[e + 1][k + 1];
  }

  // F[i][k]: i 칸부터 끝까지 숫자 k.. 를 놓을 수 있다 (칠한 칸은 모두 덮고, X 엔 안 놓는다)
  var F = [];
  for (i = 0; i <= n + 1; i++) { F.push([]); for (k = 0; k <= m; k++) F[i].push(false); }
  for (i = n; i >= 0; i--) {
    for (k = m; k >= 0; k--) {
      if (i === n) { F[i][k] = k === m; continue; }
      F[i][k] = (!isFill(line[i]) && F[i + 1][k]) || (k < m && fits(i, clues[k]) && tail(i, k));
    }
  }
  if (!F[0][0]) return none;

  // G[i][k]: 앞에서부터 숫자 0..k-1 을 놓고 i 칸에 왔다. 여기서 숫자마다 놓일 수 있는 시작 칸을 모은다
  var G = [], starts = clues.map(function () { return []; });
  for (i = 0; i <= n + 1; i++) { G.push([]); for (k = 0; k <= m; k++) G[i].push(false); }
  G[0][0] = true;
  for (i = 0; i < n; i++) {
    for (k = 0; k <= m; k++) {
      if (!G[i][k]) continue;
      if (!isFill(line[i])) G[i + 1][k] = true;
      if (k < m && fits(i, clues[k]) && tail(i, k)) {
        starts[k].push(i);
        if (i + clues[k] < n) G[i + clues[k] + 1][k + 1] = true;
      }
    }
  }

  return clues.map(function (L, k) {
    if (starts[k].length !== 1) return false;
    for (var j = starts[k][0]; j < starts[k][0] + L; j++) if (!isFill(line[j])) return false;
    return true;
  });
}

return { crossed: crossed };
}));
