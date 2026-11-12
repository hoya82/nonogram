/* ═══════════════════════════════════════════════
   완성 그림 크게 보기 — 격자 없이 화면에 꽉 차게
   PicViewer.openGrid(w, h, colorAt)  colorAt(x, y) → '#rrggbb' | null(빈칸)
   PicViewer.openImage(img)           칸당 1px 로 저장된 그림(컬러 로직 PNG)
   PicViewer.reveal(opts)             풀이 화면의 정답 연출 (아래 설명)
   PicViewer.reward(stage, res, L)    정답 연출 아래 "+N 경험치"·게이지·LEVEL UP (clear_game 응답)
   ═══════════════════════════════════════════════ */
(function() {
    'use strict';

    var overlay = null;
    var canvas = null;
    var draw = null;    // 열려 있는 그림을 다시 그리는 함수 (화면 회전·크기 변경 대응)

    function build() {
        var style = document.createElement('style');
        style.textContent =
            '.pv-overlay{position:fixed;inset:0;z-index:3000;display:none;align-items:center;justify-content:center;' +
                'background:rgba(0,0,0,.88);cursor:zoom-out;}' +
            '.pv-overlay.open{display:flex;}' +
            '.pv-overlay canvas{display:block;background:#fff;box-shadow:0 6px 30px rgba(0,0,0,.5);image-rendering:pixelated;}' +
            '.pv-close{position:absolute;top:12px;right:12px;width:40px;height:40px;border:0;border-radius:50%;' +
                'background:rgba(255,255,255,.15);color:#fff;font-size:24px;line-height:40px;cursor:pointer;}';
        document.head.appendChild(style);

        overlay = document.createElement('div');
        overlay.className = 'pv-overlay';
        canvas = document.createElement('canvas');
        var btn = document.createElement('button');
        btn.className = 'pv-close';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'close');
        btn.textContent = '×';
        overlay.appendChild(canvas);
        overlay.appendChild(btn);
        document.body.appendChild(overlay);

        // 그림을 포함해 어디를 눌러도 닫힌다
        overlay.addEventListener('click', close);
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') close();
        });
        window.addEventListener('resize', function() {
            if (draw) draw();
        });
    }

    // 기기 픽셀 기준 정수 배율로 그려야 칸 경계가 번지지 않는다
    function fit(w, h) {
        var dpr = window.devicePixelRatio || 1;
        var availW = (window.innerWidth - 32) * dpr;
        var availH = (window.innerHeight - 96) * dpr;
        var cell = Math.max(1, Math.floor(Math.min(availW / w, availH / h)));
        canvas.width = w * cell;
        canvas.height = h * cell;
        canvas.style.width = (canvas.width / dpr) + 'px';
        canvas.style.height = (canvas.height / dpr) + 'px';
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return { ctx: ctx, cell: cell };
    }

    function show(fn) {
        if (!overlay) build();
        draw = fn;
        draw();
        overlay.classList.add('open');
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('open');
        draw = null;
    }

    function openGrid(w, h, colorAt) {
        show(function() {
            var f = fit(w, h);
            for (var y = 0; y < h; y++) {
                for (var x = 0; x < w; x++) {
                    var c = colorAt(x, y);
                    if (!c) continue;
                    f.ctx.fillStyle = c;
                    f.ctx.fillRect(x * f.cell, y * f.cell, f.cell, f.cell);
                }
            }
        });
    }

    function openImage(img) {
        show(function() {
            var f = fit(img.naturalWidth, img.naturalHeight);
            f.ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        });
    }

    // ═══ 정답 연출 ═══════════════════════════════════
    // 숏폼(scripts/shortform/make_short.py)과 같은 순서로 보여준다.
    //  1) 페이지가 판에 클래스를 붙여 힌트·격자·X 를 걷는 동안(FADE_MS) 기다린다 — 칠한 칸이 붙어 그림이 된다
    //  2) 판 위 같은 자리에 격자 없는 그림을 겹쳐 놓고, 화면 가운데 카드로 옮기며 키운다(ZOOM_MS)
    //  3) "정답은 / 제목!" 문구가 튀어나오고 버튼이 뜬다
    // opts: { from() → 칸 영역 {left, top, width, height}, w, h, colorAt(x, y), empty(빈칸 색),
    //         kicker, title, buttons: [{ label, onClick }], reserve(경험치 줄 높이, 선택) } → stage 를 돌려준다
    var FADE_MS = 450;
    var ZOOM_MS = 650;
    var revealStyled = false;

    function styleReveal() {
        if (revealStyled) return;
        revealStyled = true;
        var style = document.createElement('style');
        style.textContent =
            '.pv-stage{position:fixed;inset:0;z-index:3000;display:flex;flex-direction:column;align-items:center;' +
                'justify-content:center;gap:14px;padding:20px;box-sizing:border-box;background:transparent;' +
                'transition:background-color ' + ZOOM_MS + 'ms;font-family:inherit;}' +
            '.pv-stage.zoom{background:#f0f2f5;}' +     // 불투명 — 반투명이면 큰 판(패드)이 카드 둘레로 비친다
            '.pv-stage.dark.zoom{background:#1a1d23;}' +
            '.pv-kicker{font-size:17px;font-weight:600;color:#6e7a91;}' +
            '.pv-title{font-size:30px;font-weight:800;color:#1e2942;text-align:center;max-width:92vw;line-height:1.25;' +
                'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all;}' +
            '.pv-stage.dark .pv-kicker{color:#9aa3b2;}' +
            '.pv-stage.dark .pv-title{color:#eef1f5;}' +
            '.pv-kicker,.pv-title,.pv-actions{opacity:0;}' +
            '.pv-stage.done .pv-kicker,.pv-stage.done .pv-title{animation:pv-pop .45s cubic-bezier(.34,1.56,.64,1) forwards;}' +
            '.pv-stage.done .pv-actions{animation:pv-fade .3s .25s forwards;}' +
            '.pv-card{padding:14px;border-radius:18px;background:transparent;box-shadow:none;' +
                'transition:background-color ' + ZOOM_MS + 'ms,box-shadow ' + ZOOM_MS + 'ms;}' +
            '.pv-stage.zoom .pv-card{background:var(--pv-empty);box-shadow:0 12px 36px rgba(20,40,80,.18);}' +
            '.pv-card canvas{display:block;visibility:hidden;transform-origin:0 0;image-rendering:pixelated;}' +
            '.pv-stage.zoom .pv-card canvas{transition:transform ' + ZOOM_MS + 'ms cubic-bezier(.65,0,.35,1);}' +
            '.pv-actions{display:flex;gap:10px;}' +
            '.pv-actions button{border:0;border-radius:999px;padding:13px 30px;font:inherit;font-size:16px;font-weight:700;' +
                'color:#fff;background:#4a90d9;cursor:pointer;box-shadow:0 4px 14px rgba(74,144,217,.35);}' +
            '.pv-actions button:disabled{opacity:.6;}' +
            '@keyframes pv-pop{from{opacity:0;transform:scale(.6);}to{opacity:1;transform:scale(1);}}' +
            '@keyframes pv-fade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}';
        document.head.appendChild(style);
    }

    function reveal(opts) {
        styleReveal();
        var dark = document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode');

        // 투명한 막부터 깐다 — 연출 중에 판을 건드리지 못하게
        var stage = document.createElement('div');
        stage.className = 'pv-stage' + (dark ? ' dark' : '');
        stage.style.setProperty('--pv-empty', opts.empty);
        var kicker = document.createElement('div');
        kicker.className = 'pv-kicker';
        kicker.textContent = opts.kicker;
        var title = document.createElement('div');
        title.className = 'pv-title';
        title.textContent = opts.title;
        var card = document.createElement('div');
        card.className = 'pv-card';
        var pic = document.createElement('canvas');
        card.appendChild(pic);
        var actions = document.createElement('div');
        actions.className = 'pv-actions';
        (opts.buttons || []).forEach(function(b) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = b.label;
            btn.addEventListener('click', function() { b.onClick(btn); });
            actions.appendChild(btn);
        });
        stage.appendChild(kicker);
        stage.appendChild(title);
        stage.appendChild(card);
        stage.appendChild(actions);
        document.body.appendChild(stage);

        // 최종 그림 — 문구·버튼 자리를 빼고 화면에 맞춘 기기 픽셀 정수 배율
        var dpr = window.devicePixelRatio || 1;
        var availW = Math.min(window.innerWidth - 68, 640) * dpr;
        var availH = (window.innerHeight - 290 - (opts.reserve || 0)) * dpr;   // reserve: 아래 경험치 줄 자리 (PicViewer.reward)
        var cell = Math.max(1, Math.floor(Math.min(availW / opts.w, availH / opts.h)));
        pic.width = opts.w * cell;
        pic.height = opts.h * cell;
        pic.style.width = (pic.width / dpr) + 'px';
        pic.style.height = (pic.height / dpr) + 'px';
        var ctx = pic.getContext('2d');
        ctx.fillStyle = opts.empty;
        ctx.fillRect(0, 0, pic.width, pic.height);
        for (var y = 0; y < opts.h; y++) {
            for (var x = 0; x < opts.w; x++) {
                var c = opts.colorAt(x, y);
                if (!c) continue;
                ctx.fillStyle = c;
                ctx.fillRect(x * cell, y * cell, cell, cell);
            }
        }

        setTimeout(function() {
            // 판 위 같은 자리에서 출발해 카드로 날아간다
            var from = opts.from();
            var to = pic.getBoundingClientRect();
            pic.style.transform = 'translate(' + (from.left - to.left) + 'px,' + (from.top - to.top) + 'px) ' +
                'scale(' + (from.width / to.width) + ',' + (from.height / to.height) + ')';
            pic.style.visibility = 'visible';
            pic.getBoundingClientRect();    // 출발 위치를 먼저 확정해야 transition 이 걸린다
            stage.classList.add('zoom');
            pic.style.transform = '';
            setTimeout(function() { stage.classList.add('done'); }, ZOOM_MS);
        }, FADE_MS);

        return stage;
    }

    // ═══ 경험치 줄 ═══════════════════════════════════
    // 게임 결과 화면처럼 그림 아래에 "+N 경험치"와 게이지를 띄운다. 게이지는 이전 값에서 이후 값으로 차오르고,
    // 레벨이 오르면 끝까지 찼다가 비워지며 LEVEL UP. 게이지 모양은 사이트 경험치 게이지(common.css .xp-*)와 같은 금색 10칸.
    // res: clear_game 응답 { gain, before:{lv,pct,cur,max}, after:{…}, level_up, already, guest_gain }
    // L:   { gain:'+%s 경험치', to_next:'Lv.%1$s까지 %2$s', level_up, already, guest:'…+%s…', login, login_url }
    var xpStyled = false;
    function styleXp() {
        if (xpStyled) return;
        xpStyled = true;
        var style = document.createElement('style');
        style.textContent =
            '.pv-xp{width:min(320px,80vw);display:flex;flex-direction:column;align-items:center;gap:4px;opacity:0;}' +
            '.pv-stage.done .pv-xp{animation:pv-fade .3s .15s forwards;}' +
            '.pv-xp-gain{font-size:19px;font-weight:800;color:#d48a00;}' +
            '.pv-xp-row{width:100%;display:flex;align-items:center;gap:8px;}' +
            '.pv-xp-lv{font-size:13px;font-weight:800;color:#1e2942;white-space:nowrap;}' +
            '.pv-xp-bar{position:relative;flex:1;height:10px;border-radius:2px;background:#dfe4ec;overflow:hidden;}' +
            '.pv-xp-fill{height:100%;background:#ffc107;}' +
            '.pv-xp-fill.go{transition:width .7s cubic-bezier(.3,.7,.4,1);}' +
            '.pv-xp-bar::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),rgba(255,255,255,.85) calc(10% - 1px),rgba(255,255,255,.85) 10%);}' +
            '.pv-xp-next,.pv-xp-note{font-size:13px;color:#6e7a91;}' +
            '.pv-xp-note a{color:#4a90d9;font-weight:700;margin-left:6px;text-decoration:none;}' +
            '.pv-xp-up{font-size:24px;font-weight:900;color:#ffb300;letter-spacing:.5px;text-shadow:0 0 12px rgba(255,193,7,.6);visibility:hidden;}' +
            '.pv-xp-up.on{visibility:visible;animation:pv-pop .45s cubic-bezier(.34,1.56,.64,1) forwards;}' +
            '.pv-stage.dark .pv-xp-gain{color:#ffd54f;}' +
            '.pv-stage.dark .pv-xp-lv{color:#eef1f5;}' +
            '.pv-stage.dark .pv-xp-bar{background:#3a3f48;}' +
            '.pv-stage.dark .pv-xp-bar::after{background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),rgba(0,0,0,.45) calc(10% - 1px),rgba(0,0,0,.45) 10%);}' +
            '.pv-stage.dark .pv-xp-next,.pv-stage.dark .pv-xp-note{color:#9aa3b2;}';
        document.head.appendChild(style);
    }

    function fmt(t, a, b) {
        return String(t).replace('%1$s', a).replace('%2$s', b).replace('%s', a);
    }
    function num(n) { return Number(n).toLocaleString(); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    // 연출의 문구가 다 튀어나온 뒤(done)에 차오르게 — 응답이 먼저 와도, 늦게 와도
    function whenDone(stage, cb) {
        if (stage.classList.contains('done')) setTimeout(cb, 350);
        else setTimeout(function() { whenDone(stage, cb); }, 100);
    }

    function reward(stage, res, L) {
        if (!stage || !res || !stage.parentNode) return;
        styleXp();
        var box = el('div', 'pv-xp');
        if (res.already) {
            box.appendChild(el('div', 'pv-xp-note', L.already));
        } else if (res.guest_gain > 0) {
            var note = el('div', 'pv-xp-note', fmt(L.guest, num(res.guest_gain)));
            var a = el('a', '', L.login);
            a.href = L.login_url || 'member_login.php';
            note.appendChild(a);
            box.appendChild(note);
        } else if (res.gain > 0 && res.before && res.after) {
            var gain = el('div', 'pv-xp-gain', fmt(L.gain, num(res.gain)));
            var up = res.level_up ? el('div', 'pv-xp-up', L.level_up) : null;   // 자리는 처음부터 — 뜰 때 화면이 밀리지 않게
            var row = el('div', 'pv-xp-row');
            var lv = el('span', 'pv-xp-lv', 'Lv.' + res.before.lv);
            var bar = el('div', 'pv-xp-bar');
            var fill = el('div', 'pv-xp-fill');
            fill.style.width = res.before.pct + '%';
            bar.appendChild(fill);
            row.appendChild(lv);
            row.appendChild(bar);
            var toNext = function(s) { return fmt(L.to_next, s.lv + 1, num(Math.max(0, s.max - s.cur))); };
            var next = el('div', 'pv-xp-next', toNext(res.level_up ? res.before : res.after));
            if (up) box.appendChild(up);
            box.appendChild(gain);
            box.appendChild(row);
            box.appendChild(next);
            whenDone(stage, function() {
                fill.getBoundingClientRect();
                fill.classList.add('go');
                if (!res.level_up) {
                    fill.style.width = res.after.pct + '%';
                    return;
                }
                fill.style.width = '100%';
                setTimeout(function() {
                    fill.classList.remove('go');
                    fill.style.width = '0%';
                    lv.textContent = 'Lv.' + res.after.lv;
                    next.textContent = toNext(res.after);
                    up.classList.add('on');
                    fill.getBoundingClientRect();
                    fill.classList.add('go');
                    fill.style.width = res.after.pct + '%';
                }, 750);
            });
        } else {
            return;
        }
        stage.insertBefore(box, stage.querySelector('.pv-actions'));
    }

    window.PicViewer = { openGrid: openGrid, openImage: openImage, close: close, reveal: reveal, reward: reward };
})();
