/**
 * 노노그램 로컬 스토리지 관리 클래스 (통합 버전)
 * 모든 플레이어(v2, v3 등)가 동일한 저장소를 공유합니다.
 */
var LogicStorage = (function() {
    function LogicStorage() {
        // 버전을 구분하지 않고 공통 접두사 사용
        this.prefix = 'nemo_logic_save_';
    }

    // 현재 날짜 포맷 (YYYY-MM-DD HH:mm:ss)
    function getCurrentDate() {
        var now = new Date();
        var year = now.getFullYear();
        var month = ('0' + (now.getMonth() + 1)).slice(-2);
        var day = ('0' + now.getDate()).slice(-2);
        var hours = ('0' + now.getHours()).slice(-2);
        var minutes = ('0' + now.getMinutes()).slice(-2);
        var seconds = ('0' + now.getSeconds()).slice(-2);
        return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
    }

    // 특정 퀴즈의 스토리지 키 생성
    LogicStorage.prototype.getKey = function(quid) {
        return this.prefix + quid;
    };

    /**
     * 게임 저장
     * @param {object} params - { quid, title, data(상태값), path(플레이어 URL) }
     */
    LogicStorage.prototype.save = function(params) {
        var key = this.getKey(params.quid);
        var savedData = JSON.parse(localStorage.getItem(key) || '[]');

        // 최대 10개 제한 (한 로직당)
        if (savedData.length >= 10) {
            return { success: false, msg: '10개 이상 저장할 수 없습니다.<br>기존 기록을 삭제해 주세요.' };
        }

        var newSave = {
            save_id: new Date().getTime(),
            quid: params.quid,
            title: params.title || '제목 없음',
            val: params.data,
            // 플레이어 경로는 저장 시점의 URL을 따름 (나중에 이어하기 클릭 시 해당 버전 플레이어로 이동)
            path: params.path || window.location.pathname,
            reg_date: getCurrentDate()
        };

        savedData.push(newSave);
        localStorage.setItem(key, JSON.stringify(savedData));

        return { success: true, count: savedData.length };
    };

    /**
     * 특정 퀴즈의 저장 목록 불러오기 (게임 내 리스트용)
     */
    LogicStorage.prototype.getList = function(quid) {
        var key = this.getKey(quid);
        var rows = JSON.parse(localStorage.getItem(key) || '[]');

        // 최신순 정렬
        rows.sort(function(a, b) {
            return new Date(b.reg_date) - new Date(a.reg_date);
        });

        return rows;
    };

    /**
     * 저장 데이터 삭제
     */
    LogicStorage.prototype.delete = function(quid, saveId) {
        var key = this.getKey(quid);
        var savedData = JSON.parse(localStorage.getItem(key) || '[]');

        var newData = savedData.filter(function(item) {
            return String(item.save_id) !== String(saveId);
        });

        localStorage.setItem(key, JSON.stringify(newData));
        return newData;
    };

    /**
     * [Static] 저장 칸 값(val) → { mapState(2차원), startTime } — 읽을 수 없으면 null.
     * Touch·패드는 JSON {mapState, startTime}, 2026-10 에 끝난 레거시·레거시2 는 "0,1,2,…" 1차원 문자열(가로줄부터, 0 빈칸·1 칠함·2 X)로 남겼다.
     * 레거시 공지(bid 1103)가 "Touch 에서 이어서 풀 수 있다"고 했으니 둘 다 읽는다. 크기가 안 맞으면 다른 판의 저장이라 버린다
     */
    LogicStorage.readSlot = function(val, w, h) {
        var ok = function(m) {
            if (!Array.isArray(m) || m.length !== h) return false;
            for (var y = 0; y < h; y++) if (!Array.isArray(m[y]) || m[y].length !== w) return false;
            return true;
        };
        if (typeof val !== 'string' || !/\S/.test(val)) return null;
        if (/^\s*\{/.test(val)) {
            try {
                var d = JSON.parse(val);
                return d && ok(d.mapState) ? { mapState: d.mapState, startTime: d.startTime || null, act: typeof d.act === 'number' ? d.act : null } : null;	// act = 손 쓴 시간(js/play_timer.js)
            } catch (e) { return null; }
        }
        var cells = val.split(',');
        if (cells.length !== w * h) return null;
        var m = [];
        for (var y = 0; y < h; y++) {
            m.push([]);
            for (var x = 0; x < w; x++) {
                var v = parseInt(cells[y * w + x], 10);
                m[y].push(v === 1 || v === 2 ? v : 0);
            }
        }
        return { mapState: m, startTime: null };
    };

    /**
     * [Static] 최근 저장된 모든 게임 가져오기 (메인 페이지용)
     * quid 구분 없이 시간순으로 정렬하여 반환
     */
    LogicStorage.getAllRecentSaves = function(limit) {
        var limitCnt = limit || 5;
        var allSaves = [];
        var prefix = 'nemo_logic_save_'; // 인스턴스 변수와 동일하게 하드코딩

        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    var data = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(data) && data.length > 0) {
                        // 해당 게임(quid)의 가장 최신 기록 1개만 추출
                        data.sort(function(a, b) {
                            return new Date(b.reg_date) - new Date(a.reg_date);
                        });
                        allSaves.push(data[0]);
                    }
                } catch(e) { console.error(e); }
            }
        }

        // 전체 게임 중 최신순 정렬
        allSaves.sort(function(a, b) {
            return new Date(b.reg_date) - new Date(a.reg_date);
        });

        return allSaves.slice(0, limitCnt);
    };

    return LogicStorage;
})();