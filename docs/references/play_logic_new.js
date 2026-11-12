const STORAGE_KEY = 'nonogram_progress_' + QUID;

const storageManager = new LogicStorage();

const board = document.getElementById('game-board');
const viewport = document.getElementById('viewport');
const tooltip = document.getElementById('drag-tooltip');

const BASE_CELL_SIZE = 26;
let currentZoom = 1.0;

let maxHCount = 0;
if(puzzleData.hhints) puzzleData.hhints.forEach(r => maxHCount = Math.max(maxHCount, r.length));

let maxVCount = 0;
if(puzzleData.vhints) puzzleData.vhints.forEach(c => maxVCount = Math.max(maxVCount, c.length));

const HINT_W_PX = Math.max(50, maxHCount * 14 + 12);
const HINT_H_PX = Math.max(50, maxVCount * 14 + 10);

const W = puzzleData.vhints.length;
const H = puzzleData.hhints.length;

let mapState = Array(H).fill().map(() => Array(W).fill(0));
let historyStack = [], redoStack = [];
let currentTool = 'fill';
let startTime = Date.now();

// 메모(가정) — 칸 값 3 = 칠한다고 가정(▲), 4 = 비운다고 가정(/). 0 빈칸·1 칠함·2 X 와 같은 판에 넣어
// 되돌리기·자동 저장·저장 슬롯이 그대로 메모를 담는다. 메모가 남은 판은 제출하지 않는다
const MEMO_F = 3, MEMO_X = 4;
let memoMode = false;
let memoRoot = null;        // 메모가 하나도 없을 때 처음 찍은 칸 {x, y, v} — 지울 때 "처음 가정" 칸으로 알려 준다
let strokeMemo = false, memoCountBefore = 0;

let isDrawing = false, startCell = null, dragAxis = null, drawMode = 0, drawTool = 'fill';
let isPanning = false, panStartX = 0, panStartY = 0, panScrollLeft = 0, panScrollTop = 0;

let gameCompleted = false;
let lastGuideX = -1;
let lastGuideY = -1;

// classic = 클래식 색(레거시 옛 주소로 온 기기는 legacy_player_redirect.php 가 처음 한 번 켜 둔다), zoom = 마지막 확대 배율(기기마다).
// null = 고른 적 없음 → 저장하지 않는다. 확대만 해도 classic:false 가 박히면 레거시 쪽 자동 켜기가 막힌다
// rectDrag = 사각형으로 칠하기(레거시2 방식, 레거시2 옛 주소로 온 기기는 legacy_player_redirect.php 가 처음 한 번 켜 둔다) — 꺼져 있으면 한 줄씩
// clueCrossOff = 끝난 조각 숫자 지우기(js/nono_clue_rules.js)를 끈 사람만 true — 기본은 켬. 패드와 같은 키라 한 기기에서 함께.
// 처음 배포(기본 끔)의 clueCross 키는 다른 설정만 바꿔도 false 가 저장됐다 — 그 값은 읽지 않는다
var playerSettings = { showGuides: true, showDragTooltip: true, darkMode: null, classic: null, rectDrag: null, zoom: null, clueCrossOff: null };
try {
    var _ps = localStorage.getItem('nonogram_player_settings');
    if (_ps) {
        var _parsed = JSON.parse(_ps);
        if (typeof _parsed.showGuides === 'boolean') playerSettings.showGuides = _parsed.showGuides;
        if (typeof _parsed.showDragTooltip === 'boolean') playerSettings.showDragTooltip = _parsed.showDragTooltip;
        if (typeof _parsed.darkMode === 'boolean') playerSettings.darkMode = _parsed.darkMode;
        if (typeof _parsed.classic === 'boolean') playerSettings.classic = _parsed.classic;
        if (typeof _parsed.rectDrag === 'boolean') playerSettings.rectDrag = _parsed.rectDrag;
        if (typeof _parsed.clueCrossOff === 'boolean') playerSettings.clueCrossOff = _parsed.clueCrossOff;
        if (typeof _parsed.zoom === 'number') playerSettings.zoom = _parsed.zoom;
    }
} catch(e) {}
if (playerSettings.darkMode === null) playerSettings.darkMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
if (playerSettings.darkMode) document.body.classList.add('dark-mode');
// 다크 모드(사이트 전체)와 클래식 색(이 플레이어 판)은 따로 켠다 — 클래식이면 다크여도 판은 같고 판 밖만 어둡다
if (playerSettings.classic === true) document.body.classList.add('classic');
if (playerSettings.zoom >= 0.5 && playerSettings.zoom <= 2.0) currentZoom = playerSettings.zoom;

// 같은 키를 사이트 전체(head.php·다른 게임)가 쓴다 — 통째로 덮어쓰지 말고 이 플레이어 값만 합친다
function savePlayerSettings() {
    try {
        var ps = JSON.parse(localStorage.getItem('nonogram_player_settings') || '{}');
        for (var k in playerSettings) if (playerSettings[k] !== null) ps[k] = playerSettings[k];
        localStorage.setItem('nonogram_player_settings', JSON.stringify(ps));
    } catch(e) {}
}

function toggleSettings(e) {
    if (e) e.stopPropagation();
    var panel = document.getElementById('settings-panel');
    panel.classList.toggle('show');
}

document.addEventListener('click', function(e) {
    var panel = document.getElementById('settings-panel');
    var btn = document.getElementById('btn-settings');
    if (panel && !panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('show');
    }
});

function onSettingChange() {
    playerSettings.showGuides = document.getElementById('chk-guides').checked;
    playerSettings.showDragTooltip = document.getElementById('chk-tooltip').checked;
    playerSettings.darkMode = document.getElementById('chk-dark').checked;
    playerSettings.classic = document.getElementById('chk-classic').checked;
    playerSettings.rectDrag = document.getElementById('chk-rect').checked;
    const clueCross = document.getElementById('chk-clue-cross').checked;
    if (clueCross !== (playerSettings.clueCrossOff !== true)) {
        playerSettings.clueCrossOff = !clueCross;
        if (typeof gtag === 'function') gtag('event', clueCross ? 'clue_cross_on' : 'clue_cross_off', { player_version: 'new' });
    }
    document.body.classList.toggle('dark-mode', playerSettings.darkMode);
    document.body.classList.toggle('classic', playerSettings.classic);
    savePlayerSettings();
    if (!playerSettings.showGuides) clearGuides();
    refreshClueCross();
}

function initSettingsUI() {
    document.getElementById('chk-guides').checked = playerSettings.showGuides;
    document.getElementById('chk-tooltip').checked = playerSettings.showDragTooltip;
    document.getElementById('chk-dark').checked = playerSettings.darkMode;
    document.getElementById('chk-classic').checked = playerSettings.classic === true;
    document.getElementById('chk-rect').checked = playerSettings.rectDrag === true;
    document.getElementById('chk-clue-cross').checked = playerSettings.clueCrossOff !== true;
}

function __(key) {
    return (typeof LANG_DATA !== 'undefined' && LANG_DATA[key]) ? LANG_DATA[key] : key;
}

function getReturnParams() {
    let params = `quid=${QUID}`;
    if (typeof PAGE !== 'undefined') params += `&page=${PAGE}`;
    if (typeof SIZE !== 'undefined') params += `&size=${SIZE}`;
    if (typeof LID !== 'undefined')  params += `&lid=${LID}`;
    return params;
}

function goBack() {
    if (PREVIEW) {
        // 제작 화면이 새 탭으로 열었으니 닫으면 돌아간다. 닫히지 않으면(직접 연 탭) 뒤로
        window.close();
        window.history.back();
        return;
    }
    if (!gameCompleted) {
        var filled = 0;
        for (var y = 0; y < H; y++)
            for (var x = 0; x < W; x++)
                if (mapState[y][x] === 1) filled++;
        gtag('event', 'game_abandon', {
            'game_type': 'nonogram',
            'puzzle_id': QUID,
            'puzzle_size': W + 'x' + H,
            'elapsed_seconds': Math.round((Date.now() - startTime) / 1000),
            'progress_percent': Math.round(filled / (W * H) * 100)
        });
    }
    phBack();	// 사이트 안에서 왔으면 뒤로, 바로 들어왔으면 노노그램 목록(player_header.php)
}

function changeZoom(delta) {
    currentZoom = Math.round(Math.min(Math.max(0.5, currentZoom + delta), 2.0) * 10) / 10;
    applyZoom();
    playerSettings.zoom = currentZoom;
    savePlayerSettings();
}

// 칸은 정수 px 로 — 28.6px 같은 소수 칸은 윈도 배율 125% 에서 1px 선이 뭉개져 칠한 칸 개수를 못 셌다.
// 힌트 숫자도 칸을 따라 커진다(예전엔 11px 고정이라 확대하면 칸만 커졌다). 힌트 칸 크기는 11px 기준으로 잰 값을 같은 비율로 늘린다
function applyZoom() {
    const cell = Math.round(BASE_CELL_SIZE * currentZoom);
    const font = Math.max(9, Math.round(cell * 0.5));
    const hintW = Math.round(HINT_W_PX * font / 11);
    const hintH = Math.round(HINT_H_PX * font / 11);
    document.documentElement.style.setProperty('--cell-size', `${cell}px`);
    document.documentElement.style.setProperty('--hint-font', `${font}px`);

    board.style.gridTemplateColumns = `${hintW}px repeat(${W}, ${cell}px)`;
    board.style.gridTemplateRows = `${hintH}px repeat(${H}, ${cell}px)`;
    board.style.width = `${hintW + W * cell}px`;
}

// 미리 풀기는 고칠 때마다 다른 그림이라 이어 풀지 않는다 — 저장도 불러오기도 하지 않는다
function loadProgress() {
    if (PREVIEW) return;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            mapState = data.mapState;
            startTime = data.startTime || Date.now();
            PlayTimer.resume(data.act);	// 손 쓴 시간(js/play_timer.js) — 이 장치 전 저장이면 모름
            memoRoot = data.memoRoot || null;
            refreshView();
            checkLineCompletion();
        }
    } catch (e) {
        console.error('Failed to load progress:', e);
    }
}

function saveProgress() {
    if (PREVIEW) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            mapState: mapState,
            startTime: startTime,
            act: PlayTimer.seconds(),
            memoRoot: memoRoot,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('Failed to save progress:', e);
    }
}

function saveSnapshot() {
    if (PREVIEW) return;    // 미리 풀기엔 슬롯이 없다
    gtag('event', 'game_save', {
        'game_type': 'nonogram',
        'puzzle_id': QUID,
        'puzzle_size': W + 'x' + H,
        'player_version': 'new'
    });
    const list = storageManager.getList(QUID);

    if (list.length >= 10) {
        const oldest = list[list.length - 1];
        storageManager.delete(QUID, oldest.save_id);
    }

    const dataStr = JSON.stringify({
        mapState: mapState,
        startTime: startTime,
        act: PlayTimer.seconds()
    });

    const res = storageManager.save({
        quid: QUID,
        title: (typeof TITLE !== 'undefined' ? TITLE : 'Puzzle #' + QUID),
        data: dataStr,
        path: window.location.pathname
    });

    if (res.success) {
        nemoToast("💾 " + __('msg_saved'));
    } else {
        nemoToast(__('msg_save_fail') + res.msg);
    }
}

function openLoadModal() {
    const list = storageManager.getList(QUID);
    const container = document.getElementById('load-list');
    container.innerHTML = '';

    if (list.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">' + __('msg_no_save') + '</div>';
    } else {
        list.forEach(item => {
            const el = document.createElement('div');
            el.className = 'load-item';

            el.innerHTML = `
                <div class="load-info" onclick="loadSnapshot(${item.save_id})">
                    <span class="load-date">${item.reg_date}</span>
                    <span class="load-meta">${__('msg_tap_load')}</span>
                </div>
                <button class="btn-delete-save" onclick="deleteSnapshot(event, ${item.save_id})">${__('btn_delete')}</button>
            `;
            container.appendChild(el);
        });
    }

    document.getElementById('load-modal').style.display = 'flex';
}

function closeLoadModal() {
    document.getElementById('load-modal').style.display = 'none';
}

function loadSnapshot(saveId) {
    const list = storageManager.getList(QUID);
    const target = list.find(item => item.save_id == saveId);

    if (target) {
        try {
            const data = LogicStorage.readSlot(target.val, W, H);    // 레거시 "0,1,2,…" 저장도 읽는다
            if (!data) throw new Error('slot');
            mapState = data.mapState;
            if (data.startTime) startTime = data.startTime;
            PlayTimer.resume(data.act);
            memoRoot = null;    // 슬롯엔 처음 가정 칸이 없다

            refreshView();
            checkLineCompletion();
            closeLoadModal();
            nemoToast("📂 " + __('msg_loaded'));
            gtag('event', 'game_load', {
                'game_type': 'nonogram',
                'puzzle_id': QUID,
                'puzzle_size': W + 'x' + H,
                'player_version': 'new'
            });

            saveProgress();
        } catch(e) {
            console.error(e);
            nemoDialog.alert(__('msg_data_corrupt'));
        }
    }
}

function deleteSnapshot(e, saveId) {
    e.stopPropagation();
    nemoDialog.confirm({ text: __('msg_confirm_delete'), ok: __('btn_delete'), danger: true }).then(function (ok) {
        if (!ok) return;
        storageManager.delete(QUID, saveId);
        openLoadModal();
    });
}


function resetGame() {
    const msg = (typeof LANG_DATA !== 'undefined' && LANG_DATA['msg_reset_confirm'])
        ? LANG_DATA['msg_reset_confirm']
        : 'Reset the game? All progress will be lost.';

    // 말 파일 문구는 "질문<br>결과" — 앞은 제목, 뒤는 설명
    const parts = msg.split(/<br\s*\/?>/);
    nemoDialog.confirm({ title: parts[0], text: parts.slice(1).join('\n'), danger: true }).then(function (ok) {
        if (!ok) return;
        mapState = Array(H).fill().map(() => Array(W).fill(0));

        puzzleData.hhints.forEach((hints, y) => {
            if (hints.length === 1 && hints[0] === 0) {
                for(let x=0; x<W; x++) mapState[y][x] = 2;
            }
        });
        puzzleData.vhints.forEach((hints, x) => {
            if (hints.length === 1 && hints[0] === 0) {
                for(let y=0; y<H; y++) mapState[y][x] = 2;
            }
        });

        historyStack = [];
        redoStack = [];
        updateUndoRedoButtons();
        memoRoot = null;

        document.querySelectorAll('.hint.completed').forEach(el => {
            el.classList.remove('completed');
        });
        document.querySelectorAll('.hint-span.checked').forEach(el => {
            el.classList.remove('checked');
        });

        if (typeof clearGuides === 'function') clearGuides();

        startTime = Date.now();
        PlayTimer.reset();
        refreshView();
        checkLineCompletion();
        saveProgress();

        const resetMsg = (typeof LANG_DATA !== 'undefined' && LANG_DATA['msg_reset_done'])
            ? LANG_DATA['msg_reset_done'] : "Game has been reset.";
        nemoToast("🔄 " + resetMsg);
    });
}

function initGame() {
    startTime = Date.now();     // 판 앞 광고 시간은 풀이 시간에서 뺀다 — 이어 풀면 loadProgress 가 저장된 시작 시각으로 되돌린다
    PlayTimer.reset();
    gtag('event', 'game_start', {
        'game_type': 'nonogram',
        'puzzle_id': QUID,
        'puzzle_size': W + 'x' + H,
        'player_version': 'new'
    });

    puzzleData.hhints.forEach((hints, y) => {
        if (hints.length === 1 && hints[0] === 0) {
            for(let x=0; x<W; x++) mapState[y][x] = 2;
        }
    });
    puzzleData.vhints.forEach((hints, x) => {
        if (hints.length === 1 && hints[0] === 0) {
            for(let y=0; y<H; y++) mapState[y][x] = 2;
        }
    });

    applyZoom();

    const cornerEl = document.createElement('div');
    cornerEl.className = 'corner';
    board.appendChild(cornerEl);

    puzzleData.vhints.forEach((hints, idx) => {
        const el = document.createElement('div');
        el.className = 'hint col';
        el.id = `vhint-${idx}`;
        if ((idx + 1) % 5 === 0 && idx !== W - 1) el.classList.add('thick-r');
        hints.forEach(num => el.appendChild(createHintSpan(num)));
        board.appendChild(el);
    });

    for (let y = 0; y < H; y++) {
        const hintEl = document.createElement('div');
        hintEl.className = 'hint row';
        hintEl.id = `hhint-${y}`;
        if ((y + 1) % 5 === 0 && y !== H - 1) hintEl.classList.add('thick-b');
        if (puzzleData.hhints[y]) {
            puzzleData.hhints[y].forEach(num => hintEl.appendChild(createHintSpan(num)));
        }
        board.appendChild(hintEl);

        for (let x = 0; x < W; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;

            if ((x + 1) % 5 === 0 && x !== W - 1) cell.classList.add('thick-r');
            if ((y + 1) % 5 === 0 && y !== H - 1) cell.classList.add('thick-b');

            if ((x + 1) % 5 === 0 && (y + 1) % 5 === 0) {
                const coord = document.createElement('span');
                coord.className = 'cell-coord';
                coord.innerText = `${x+1},${y+1}`;
                cell.appendChild(coord);
            }
            board.appendChild(cell);
        }
    }

    loadProgress();
    bindEvents();
    initSettingsUI();

    setInterval(saveProgress, 30000);

    // 동접자 heartbeat: 진입 즉시 1회 + 5분마다 갱신 + 다시 보일 때 1회. 안 보이는 탭은 세션만 늘리고 동접엔 안 넣는다(visible=0)
    function sendHeartbeat() {
        fetch('data.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: 'request=heartbeat&visible=' + (document.visibilityState === 'hidden' ? 0 : 1)
        }).catch(function() {});
    }
    sendHeartbeat();
    setInterval(sendHeartbeat, 300000);
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') sendHeartbeat(); });

    window.addEventListener('beforeunload', function(e) {
        if (gameCompleted) return;
        var hasProgress = mapState.some(function(row) {
            return row.some(function(v) { return v === 1; });
        });
        if (hasProgress) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    function updateTimer() {
        if (gameCompleted) return;
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        var h = Math.floor(elapsed / 3600);
        var m = Math.floor((elapsed % 3600) / 60);
        var s = elapsed % 60;
        var display = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
        if (h > 0) display = h + ':' + display;
        var el = document.getElementById('game-timer');
        if (el) el.textContent = display;
    }
    setInterval(updateTimer, 1000);
    updateTimer();
}

function createHintSpan(num) {
    const span = document.createElement('span');
    span.className = 'hint-span';
    span.innerText = num;
    span.onclick = (e) => {
        e.stopPropagation();
        span.classList.toggle('checked');
    };
    return span;
}

function saveHistory() {
    const snapshot = JSON.parse(JSON.stringify(mapState));
    historyStack.push(snapshot);
    if(historyStack.length > 40) historyStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
    saveProgress();
}

function undo() {
    if (historyStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(mapState)));
    mapState = historyStack.pop();
    refreshView();
    updateUndoRedoButtons();
    checkLineCompletion();
    saveProgress();
}

function redo() {
    if (redoStack.length === 0) return;
    historyStack.push(JSON.parse(JSON.stringify(mapState)));
    mapState = redoStack.pop();
    refreshView();
    updateUndoRedoButtons();
    checkLineCompletion();
    saveProgress();
}

function updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = (historyStack.length === 0);
    document.getElementById('btn-redo').disabled = (redoStack.length === 0);
}

function refreshView() {
    document.querySelectorAll('.cell').forEach(cell => {
        paintCell(cell, mapState[parseInt(cell.dataset.y)][parseInt(cell.dataset.x)]);
    });
}

function paintCell(cell, val) {
    cell.classList.remove('filled', 'crossed', 'memo-f', 'memo-x');
    if (val === 1) cell.classList.add('filled');
    else if (val === 2) cell.classList.add('crossed');
    else if (val === MEMO_F) cell.classList.add('memo-f');
    else if (val === MEMO_X) cell.classList.add('memo-x');
}

function checkLineCompletion() {
    let autoFilled = false;

    for (let y = 0; y < H; y++) {
        if(puzzleData.hhints[y]) {
            const isValid = validateLine(mapState[y], puzzleData.hhints[y]);
            const el = document.getElementById(`hhint-${y}`);
            if(el) {
                if (isValid) {
                    el.classList.add('completed');
                    // 메모 칠(가정)로 맞은 줄이면 나머지도 가정 — X 대신 메모 X 로 채운다
                    const xVal = mapState[y].includes(MEMO_F) ? MEMO_X : 2;
                    for(let x=0; x<W; x++) {
                        if(mapState[y][x] === 0) {
                            mapState[y][x] = xVal;
                            autoFilled = true;
                        }
                    }
                } else {
                    el.classList.remove('completed');
                }
            }
        }
    }
    for (let x = 0; x < W; x++) {
        const col = [];
        for (let y = 0; y < H; y++) col.push(mapState[y][x]);
        if(puzzleData.vhints[x]) {
            const isValid = validateLine(col, puzzleData.vhints[x]);
            const el = document.getElementById(`vhint-${x}`);
            if(el) {
                if (isValid) {
                    el.classList.add('completed');
                    const xVal = col.includes(MEMO_F) ? MEMO_X : 2;
                    for(let y=0; y<H; y++) {
                        if(mapState[y][x] === 0) {
                            mapState[y][x] = xVal;
                            autoFilled = true;
                        }
                    }
                } else {
                    el.classList.remove('completed');
                }
            }
        }
    }

    if(autoFilled) {
        refreshView();
    }
    refreshClueCross();
    refreshSolvedCue(updateMemoBar() > 0);
}

// 끝난 조각 숫자 지우기 — 켠 사람만. 손으로 지운 숫자(.checked)와는 따로 단다
function refreshClueCross() {
    const on = playerSettings.clueCrossOff !== true && typeof NonoClueRules !== 'undefined';
    const mark = (el, line, hints) => {
        if (!el) return;
        const flags = on ? NonoClueRules.crossed(line, hints) : [];
        el.querySelectorAll('.hint-span').forEach((s, i) => s.classList.toggle('auto-crossed', !!flags[i]));
    };
    for (let y = 0; y < H; y++) {
        if (puzzleData.hhints[y]) mark(document.getElementById(`hhint-${y}`), mapState[y], puzzleData.hhints[y]);
    }
    for (let x = 0; x < W; x++) {
        if (puzzleData.vhints[x]) mark(document.getElementById(`vhint-${x}`), mapState.map(row => row[x]), puzzleData.vhints[x]);
    }
}

// 모든 행·열이 힌트와 맞으면 다 푼 것 — 제출 버튼을 못 찾는 일이 없도록 알린다 (패드 방식과 같다)
// 메모로 맞은 판은 제출을 받지 않으니 제출 대신 메모 확정을 알린다
let solvedCueShown = false;
function refreshSolvedCue(hasMemo) {
    const btn = document.getElementById('btn-submit');
    if (!btn) return;
    const done = !gameCompleted && document.querySelectorAll('.hint.completed').length >= W + H;
    btn.classList.toggle('ready', done && !hasMemo);
    document.getElementById('btn-memo-commit').classList.toggle('ready', done && hasMemo);
    if (done && !solvedCueShown) {
        solvedCueShown = true;
        nemoToast('🎉 ' + __(hasMemo ? 'msg_memo_solved' : 'msg_solved_hint'));
    }
    if (!done) solvedCueShown = false;
}

// 메모 칠도 칠한 칸으로 센다 — 가정을 이어 풀 때 줄이 맞는지·모순인지 보이게
function validateLine(data, hints) {
    let runs = [], curr = 0;
    for (let v of data) {
        if (v === 1 || v === MEMO_F) curr++;
        else {
            if (curr > 0) runs.push(curr);
            curr = 0;
        }
    }
    if (curr > 0) runs.push(curr);

    if (hints.length === 1 && hints[0] === 0) {
        return runs.length === 0;
    }

    if (runs.length !== hints.length) return false;
    return runs.every((val, i) => val === hints[i]);
}

function handleDrawStart(x, y, forcedTool = null) {
    isDrawing = true;
    startCell = {x, y};
    dragAxis = null;

    const currentVal = mapState[y][x];
    const tool = forcedTool || currentTool;
    drawTool = tool;
    strokeMemo = memoMode;

    if (strokeMemo) {
        memoCountBefore = countMemo();
        if (tool === 'fill') drawMode = (currentVal === MEMO_F) ? 0 : MEMO_F;
        else if (tool === 'cross') drawMode = (currentVal === MEMO_X) ? 0 : MEMO_X;
    }
    else if (tool === 'fill') drawMode = (currentVal === 1) ? 0 : 1;
    else if (tool === 'cross') drawMode = (currentVal === 2) ? 0 : 2;

    saveHistory();
    previewCells(x, y);
}

// 메모는 빈칸과 메모 칸에만 — 칠한 칸·X 칸은 가정과 상관없이 정한 칸이라 메모 획이 건드리지 않는다
function canDraw(x, y) {
    return !strokeMemo || mapState[y][x] === 0 || mapState[y][x] >= MEMO_F;
}

function previewClass(mode) {
    if (mode === 1) return 'preview-f';
    if (mode === 2) return 'preview-x';
    if (mode === MEMO_F) return 'preview-mf';
    if (mode === MEMO_X) return 'preview-mx';
    return 'preview-erase';
}

function previewCells(currX, currY) {
    document.querySelectorAll('.drag-target').forEach(el => {
        el.classList.remove('preview-f', 'preview-x', 'preview-mf', 'preview-mx', 'preview-erase', 'drag-target');
    });
    if (!startCell) return 0;

    if (playerSettings.rectDrag === true) return previewRect(currX, currY);

    if (dragAxis === null) {
        if (currX !== startCell.x) dragAxis = 'x';
        else if (currY !== startCell.y) dragAxis = 'y';
    }
    let tX = currX, tY = currY;
    if (dragAxis === 'x') tY = startCell.y;
    else if (dragAxis === 'y') tX = startCell.x;

    const cells = getCellsBetween(startCell.x, startCell.y, tX, tY);
    const cls = previewClass(drawMode);
    cells.forEach(pos => {
        const cell = getCellEl(pos.x, pos.y);
        if (!cell || !canDraw(pos.x, pos.y)) return;
        cell.classList.add('drag-target', cls);
    });
    return cells.length;
}

/* 사각형으로 칠하기(레거시2 방식): 시작~지금 칸 사각형 전체. 칠할지 지울지는 누른 칸이 아니라 범위로 —
   전부 이미 칠해져(X 도구면 전부 X) 있으면 지우고, 하나라도 아니면 전부 칠한다. 범위가 바뀔 때마다 다시 정한다 */
function previewRect(currX, currY) {
    const target = strokeMemo ? (drawTool === 'cross' ? MEMO_X : MEMO_F) : (drawTool === 'cross' ? 2 : 1);
    const minX = Math.min(startCell.x, currX), maxX = Math.max(startCell.x, currX);
    const minY = Math.min(startCell.y, currY), maxY = Math.max(startCell.y, currY);
    let allSet = true;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (canDraw(x, y) && mapState[y][x] !== target) allSet = false;
    drawMode = allSet ? 0 : target;
    const cls = previewClass(drawMode);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const cell = getCellEl(x, y);
        if (cell && canDraw(x, y)) cell.classList.add('drag-target', cls);
    }
    return (maxX - minX + 1) * (maxY - minY + 1);
}

function applyPreview() {
    let first = null;
    document.querySelectorAll('.drag-target').forEach(cell => {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        mapState[y][x] = drawMode;
        cell.classList.remove('preview-f', 'preview-x', 'preview-mf', 'preview-mx', 'preview-erase', 'drag-target');
        paintCell(cell, drawMode);
        if (!first) first = {x, y};
    });
    // 메모가 없던 판에 처음 찍은 메모가 처음 가정 칸 — 누른 칸이 칠한 칸이라 건너뛰었으면 획의 첫 칸
    if (strokeMemo && memoCountBefore === 0 && drawMode !== 0 && first) {
        const s = (startCell && mapState[startCell.y][startCell.x] === drawMode) ? startCell : first;
        memoRoot = { x: s.x, y: s.y, v: drawMode };
    }
    checkLineCompletion();
    saveProgress();
}

function countMemo() {
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mapState[y][x] >= MEMO_F) n++;
    return n;
}

// 메모가 있을 때만 도구바 위에 "메모 n칸 [확정] [지우기]" 가 떠 있다
function updateMemoBar() {
    const n = countMemo();
    // 판 밑 스크롤 여유는 한 번 생기면 남긴다 — 메모를 지울 때 빼면 맨 아래를 보던 판이 내려앉는다
    if (n > 0) document.body.classList.add('memo-used');
    document.body.classList.toggle('has-memo', n > 0);
    document.getElementById('memo-bar').classList.toggle('show', n > 0);
    document.getElementById('memo-count').textContent = __('memo_count').replace('%s', n);
    return n;
}

function setMemoMode(on) {
    memoMode = on;
    document.getElementById('btn-memo').classList.toggle('memo-on', on);
}

function toggleMemo() {
    setMemoMode(!memoMode);
    nemoToast(memoMode ? '✏️ ' + __('msg_memo_on') : __('msg_memo_off'));
    if (memoMode) gtag('event', 'memo_on', { 'game_type': 'nonogram', 'puzzle_id': QUID, 'puzzle_size': W + 'x' + H });
}

// 확정 = 메모 칠 → 칠, 메모 X → X. 되돌리기 한 번으로 돌아온다. 끝나면 메모를 끈다
function commitMemo() {
    const n = countMemo();
    if (n === 0) return;
    saveHistory();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (mapState[y][x] === MEMO_F) mapState[y][x] = 1;
        else if (mapState[y][x] === MEMO_X) mapState[y][x] = 2;
    }
    memoRoot = null;
    setMemoMode(false);
    refreshView();
    nemoToast('✔ ' + __('msg_memo_committed').replace('%s', n));
    solvedCueShown = false;     // 다 맞은 판이면 "제출을 누르세요" 가 확정 알림을 덮는다
    checkLineCompletion();
    saveProgress();
    gtag('event', 'memo_commit', { 'game_type': 'nonogram', 'puzzle_id': QUID, 'puzzle_size': W + 'x' + H });
}

// 지우기 = 메모를 모두 빈칸으로. 가정이 틀렸으면 처음 칸이 반대라는 뜻이라 그 칸을 알려 준다(정하는 건 사용자)
function clearMemo() {
    const n = countMemo();
    if (n === 0) return;
    const root = (memoRoot && mapState[memoRoot.y] && mapState[memoRoot.y][memoRoot.x] === memoRoot.v) ? memoRoot : null;
    saveHistory();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mapState[y][x] >= MEMO_F) mapState[y][x] = 0;
    memoRoot = null;
    setMemoMode(false);
    refreshView();
    checkLineCompletion();
    saveProgress();
    if (root) {
        nemoToast(__('msg_memo_cleared_root').replace('%1$s', root.x + 1).replace('%2$s', root.y + 1)
            .replace('%3$s', root.v === MEMO_F ? '▲' : '/'), 4000);
    } else {
        nemoToast(__('msg_memo_cleared'));
    }
    gtag('event', 'memo_clear', { 'game_type': 'nonogram', 'puzzle_id': QUID, 'puzzle_size': W + 'x' + H });
}

function showTooltip(currX, currY, count) {
    if (count <= 1) { hideTooltip(); return; }
    if (!playerSettings.showDragTooltip) return;
    tooltip.style.display = 'block';
    const sx = startCell.x + 1;
    const sy = startCell.y + 1;
    const ex = currX + 1;
    const ey = currY + 1;
    // 사각형이면 칸 수(39) 대신 가로 × 세로(13 × 3) — 줄마다 단서와 맞춰 보게. 한 줄이면 지금처럼 칸 수
    let accent = count;
    if (playerSettings.rectDrag === true && sx !== ex && sy !== ey) accent = `${Math.abs(ex - sx) + 1} × ${Math.abs(ey - sy) + 1}`;
    tooltip.innerHTML = `S: ${sx},${sy} ~ E: ${ex},${ey}<br><span class="tooltip-accent">${accent}</span>`;
}

function updateTooltipPos(clientX, clientY) {
    if (!isDrawing) return;
    tooltip.style.left = clientX + 'px';
    tooltip.style.top = clientY + 'px';
}

function hideTooltip() { tooltip.style.display = 'none'; }

function clearGuides() {
    document.querySelectorAll('.guide-highlight').forEach(el => el.classList.remove('guide-highlight'));
    lastGuideX = -1;
    lastGuideY = -1;
}

function updateGuides(x, y) {
    if (!playerSettings.showGuides) return;
    if (x === lastGuideX && y === lastGuideY) return;

    clearGuides();
    lastGuideX = x;
    lastGuideY = y;

    if (x === null || isNaN(x) || y === null || isNaN(y)) return;

    const rowHint = document.getElementById(`hhint-${y}`);
    if (rowHint) rowHint.classList.add('guide-highlight');
    document.querySelectorAll(`.cell[data-y="${y}"]`).forEach(el => el.classList.add('guide-highlight'));

    const colHint = document.getElementById(`vhint-${x}`);
    if (colHint) colHint.classList.add('guide-highlight');
    document.querySelectorAll(`.cell[data-x="${x}"]`).forEach(el => el.classList.add('guide-highlight'));
}

/* 그리는 동안 따라갈 접점 하나를 고정한다.
   아이패드처럼 화면이 크면 그리는 중에 손바닥이나 다른 손가락이 함께 닿는 일이 흔한데,
   예전엔 touches[0] 을 그냥 읽어서 두 번째 접점이 드래그 시작점을 가로채고 앞부분이 잘렸다. */
let activeTouchId = null;

function findTouch(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
}

function resetStroke() {
    isDrawing = false; startCell = null; activeTouchId = null;
    hideTooltip(); clearGuides();
}

function finishStroke() {
    if (isDrawing) { applyPreview(); }
    resetStroke();
}

function bindEvents() {
    board.addEventListener('touchstart', (e) => {
        if (e.target.closest('.hint')) return;
        if (currentTool === 'move') return;
        e.preventDefault();
        if (activeTouchId !== null) return;   // 이미 그리는 중 — 덧대어 닿은 접점은 무시
        const t = e.changedTouches[0];
        if (!t) return;
        activeTouchId = t.identifier;
        updateTooltipPos(t.clientX, t.clientY);
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el?.classList.contains('cell')) {
            const cx = parseInt(el.dataset.x);
            const cy = parseInt(el.dataset.y);
            updateGuides(cx, cy);
            handleDrawStart(cx, cy);
        }
    }, {passive: false});

    board.addEventListener('touchmove', (e) => {
        if (currentTool === 'move') return;
        e.preventDefault();
        const t = activeTouchId === null ? e.changedTouches[0] : findTouch(e.touches, activeTouchId);
        if (!t) return;
        updateTooltipPos(t.clientX, t.clientY);
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el?.classList.contains('cell')) {
            const cx = parseInt(el.dataset.x);
            const cy = parseInt(el.dataset.y);
            updateGuides(cx, cy);
            if(isDrawing) {
                const count = previewCells(cx, cy);
                showTooltip(cx, cy, count);
            }
        }
    }, {passive: false});

    window.addEventListener('touchend', (e) => {
        // 손바닥 등 다른 접점이 떨어진 것이면 그리던 획을 끝내지 않는다
        if (activeTouchId !== null && !findTouch(e.changedTouches, activeTouchId)) return;
        finishStroke();
    });

    // iOS/iPadOS 는 시스템 제스처(멀티태스킹 스와이프·손바닥 인식·알림)로 터치를 취소할 때
    // touchend 대신 touchcancel 을 보낸다. 이걸 안 받으면 isDrawing 이 true 로 갇혀
    // 툴팁이 화면에 남고 이후 입력이 어긋난다.
    window.addEventListener('touchcancel', () => { finishStroke(); });

    viewport.addEventListener('mousedown', (e) => {
        if (currentTool === 'move' && e.button !== 2) {
            isPanning = true; panStartX = e.clientX; panStartY = e.clientY;
            panScrollLeft = viewport.scrollLeft; panScrollTop = viewport.scrollTop;
            viewport.style.cursor = 'grabbing'; return;
        }

        if (e.target.classList.contains('cell')) {
            if (e.button === 0 || e.button === 2) {
                updateTooltipPos(e.clientX, e.clientY);
                const effectiveTool = (e.button === 2) ? 'cross' : currentTool;
                handleDrawStart(parseInt(e.target.dataset.x), parseInt(e.target.dataset.y), effectiveTool);
            }
        }
    });

    board.addEventListener('mouseleave', () => {
        clearGuides();
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            viewport.scrollLeft = panScrollLeft - (e.clientX - panStartX);
            viewport.scrollTop = panScrollTop - (e.clientY - panStartY);
            return;
        }

        if (e.target.classList.contains('cell')) {
            const cx = parseInt(e.target.dataset.x);
            const cy = parseInt(e.target.dataset.y);
            updateGuides(cx, cy);

            if (isDrawing) {
                updateTooltipPos(e.clientX, e.clientY);
                const count = previewCells(cx, cy);
                showTooltip(cx, cy, count);
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) { isPanning = false; viewport.style.cursor = ''; }
        if (isDrawing) { applyPreview(); }
        isDrawing = false; startCell = null; hideTooltip();
    });

    // 키보드 단축키
    var spacePressed = false, prevToolBeforeSpace = null;

    document.addEventListener('keydown', function(e) {
        if (document.getElementById('load-modal').style.display === 'flex') return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveSnapshot();
            return;
        }

        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.key === 'f' || e.key === '1') setTool('fill');
            if (e.key === 'x' || e.key === '2') setTool('cross');
            if (e.key === 'm' || e.key === '3') setTool('move');
            if ((e.key === 'n' || e.key === '4') && !e.repeat) toggleMemo();
        }

        if (e.code === 'Space' && !spacePressed && !e.repeat) {
            spacePressed = true;
            prevToolBeforeSpace = currentTool;
            setTool('move');
            e.preventDefault();
        }
    });

    document.addEventListener('keyup', function(e) {
        if (e.code === 'Space' && spacePressed) {
            spacePressed = false;
            if (prevToolBeforeSpace) setTool(prevToolBeforeSpace);
            prevToolBeforeSpace = null;
        }
    });

    // 휠 줌 (Ctrl/Cmd + 휠)
    viewport.addEventListener('wheel', function(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            changeZoom(e.deltaY < 0 ? 0.1 : -0.1);
        }
    }, { passive: false });
}

function getCellsBetween(x1, y1, x2, y2) {
    const list = [];
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    if (y1 === y2) for(let i=minX; i<=maxX; i++) list.push({x:i, y:y1});
    else for(let i=minY; i<=maxY; i++) list.push({x:x1, y:i});
    return list;
}

function getCellEl(x, y) { return document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`); }

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    var target = document.querySelector('.tool-btn[data-tool="' + tool + '"]');
    if (target) target.classList.add('active');
    if (tool === 'move') viewport.classList.remove('locked');
    else viewport.classList.add('locked');
}

function submitGame() {
    if (countMemo() > 0) {
        nemoDialog.alert({ title: __('memo_submit_title'), text: __('memo_submit_text') });
        return;
    }
    const answerArray = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            answerArray.push(mapState[y][x]);
        }
    }

    const answerStr = answerArray.join(',').replace(/2/g, '0');
    const sanswer = md5(answerStr);

    if (PREVIEW) {
        // DB 에 없는 퍼즐 — 기록 없이 여기서 끝낸다
        if (sanswer !== puzzleData.squiz) {
            nemoDialog.alert({ title: __('wrong_title') });	// 미리 풀기엔 결과 화면이 없다 — 포기 없이 알리기만
            return;
        }
        gameCompleted = true;
        const sec = Math.round((Date.now() - startTime) / 1000);
        playReveal('다 풀었습니다 · ' + Math.floor(sec / 60) + '분 ' + (sec % 60) + '초',
            [{ label: '탭 닫기', onClick: goBack }]);
        return;
    }

    if (sanswer === puzzleData.squiz) {
        onPuzzleComplete(answerStr);
    } else {
        askWrong();
    }
}

function onPuzzleComplete(answerStr) {
    gameCompleted = true;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    gtag('event', 'game_complete', {
        'game_type': 'nonogram',
        'puzzle_id': QUID,
        'puzzle_size': W + 'x' + H,
        'elapsed_seconds': elapsed,
        'player_version': 'new'
    });
    localStorage.removeItem(STORAGE_KEY);

    // 기록은 연출과 함께 바로 보낸다 — 연출을 보다 창을 닫아도 클리어가 남게. 버튼은 기록이 끝나면 넘어간다
    const recorded = fetch('data.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: `request=clear_game&quid=${QUID}&answer=${answerStr}&elapsed=${elapsed}&active=${PlayTimer.seconds()}`
    }).then(r => r.json()).catch(() => null);

    const stage = playReveal(__('msg_answer_is'), [{
        label: __('btn_go_result'),
        onClick: (btn) => {
            btn.disabled = true;
            recorded.then(() => { window.location.href = `play_logic_result.php?${getReturnParams()}`; });
        }
    }], 96);
    // 응답이 오면 그림 아래에 "+N 경험치"·게이지 (js/pic_viewer.js)
    recorded.then(res => PicViewer.reward(stage, res, xpLabels(__)));
}

// 경험치 줄 문구 — 터치·패드가 같은 lang/play_logic js_data 를 쓴다
function xpLabels(t) {
    return { gain: t('xp_gain'), to_next: t('xp_to_next'), level_up: t('xp_level_up'), already: t('xp_already'),
             guest: t('xp_guest'), login: t('xp_login'), login_url: 'member_login.php' };
}

// 정답 연출 — 숏폼처럼 힌트·격자·X 를 걷어 그림만 남기고 가운데로 키운다 (js/pic_viewer.js)
function playReveal(kicker, buttons, reserve) {
    clearGuides();
    board.classList.add('revealing');
    const style = getComputedStyle(board);
    const fill = (style.getPropertyValue('--reveal-fill') || style.getPropertyValue('--filled-color')).trim();
    const title = PREVIEW ? (puzzleData.title || '제목 없음') : document.getElementById('header-title').textContent;
    return PicViewer.reveal({
        from: () => {
            const a = board.querySelector('.cell[data-x="0"][data-y="0"]').getBoundingClientRect();
            const b = board.querySelector(`.cell[data-x="${W - 1}"][data-y="${H - 1}"]`).getBoundingClientRect();
            return { left: a.left, top: a.top, width: b.right - a.left, height: b.bottom - a.top };
        },
        w: W,
        h: H,
        colorAt: (x, y) => mapState[y][x] === 1 ? fill : null,
        empty: style.backgroundColor,
        kicker: kicker,
        title: title + '!',
        buttons: buttons,
        reserve: reserve || 0
    });
}

// 틀렸을 때 — 사이트 상자 하나(Pad·컬러·스도쿠와 같다). 포기가 빨강이고 Esc·바깥·Enter 는 계속 풀기(2026-10-29 완성도 F2).
// 틀린 칸은 알려 주지 않는다
function askWrong() {
    nemoDialog.confirm({ title: __('wrong_title'), text: __('wrong_text'), ok: __('btn_wrong_giveup'), cancel: __('btn_wrong_keep'), danger: true })
        .then(function (ok) { if (ok) forceGoResult(); });
}

function forceGoResult() {
    gameCompleted = true;
    window.location.href = `play_logic_result.php?${getReturnParams()}`;
}

// 여는 순간 광고 놀거리 값을 낸다 — 광고가 뜨면 닫힌 뒤에 판을 그린다. 미리 풀기엔 광고가 없다
if (PREVIEW || typeof NemoAds === 'undefined') initGame();
else NemoAds.open('logic', QUID, AD_VALUE_SEC, initGame);
