/* 사이트 대화 상자·토스트·요청 실패 하나 — 바닐라, 이 파일 하나만 실으면 된다(CSS 도 안에서 넣는다).
 * 2026-10-29 완성도 P3·P4: 기본 alert/confirm/prompt·Swal·옛 Dialog(class.js)·화면마다 따로 만든 토스트 20곳을 이걸로.
 * 화면에 넣는 건 function.php nemo_ui_tag() 한 곳(footer 와 머리줄 없는 화면이 같이 부른다).
 *
 *   nemoDialog.alert(말 | {title, text, ok})                                  → Promise(닫히면)
 *   nemoDialog.confirm(말 | {title, text, ok, cancel, danger})                → Promise(true=확인)
 *   nemoDialog.prompt(말 | {title, text, value, placeholder, maxlength, lines, ok, cancel}) → Promise(글 | null=취소)
 *   nemoDialog.busy(말)   → { close() }   기다리는 동안 막는 상자(단추 없음). 다른 상자를 열면 저절로 닫힌다
 *   nemoToast(말, ms)     아래 탭 위 한 줄, 길면 낱말 단위로 꺾는다. 자리·색은 화면 CSS 의 --nemo-toast-* 변수(:root 나 body.상태)
 *                         (--nemo-toast-top 을 주면 위에, --nemo-toast-bottom 은 아래 여백, -bg·-fg·-border·-radius·-font)
 *   nemoFail(실패, 무엇)  요청 실패 하나 — jqXHR·fetch 오류·Response·{msg}·글을 받아 토스트로.
 *                         서버가 준 말(msg)이 있으면 그 말, 없으면 "무엇 + 까닭"(예: "저장하지 못했어요. 인터넷 연결을 확인해 주세요.")
 *   nemoEmpty(칸, {icon, title, text, action: {label, href | onClick, primary}, tone: 'ok', fail: 실패값, retry: fn, small})
 *                         빈 화면 하나(F4) — 목록이 비었을 때·불러오기에 실패했을 때 칸 안을 바꾼다. 모양은 css/common.css .ne-empty
 *                         (서버가 그리는 칸은 function.php empty_state_html() — 같은 마크업). fail 을 주면 제목 "목록을 불러오지 못했어요",
 *                         설명은 nemoFail 과 같은 까닭, 단추는 "다시 불러오기"(retry). 아이콘은 FA 이름(fa- 빼고)
 *
 * 모양(2026-10-29 시안 승인): 제목 · 설명 한 줄 · 단추 둘(취소 왼쪽, 위험한 동작은 빨강), 그림 없음.
 * 말만 넘기면 그 말이 설명이 된다(제목 없이). 설명의 줄바꿈(\n)은 그대로 꺾는다. html 은 받지 않는다 — 말은 전부 글자로.
 * 상자는 차례로 뜬다(앞 상자가 닫혀야 다음). 열린 Bootstrap 모달이 있으면 그 안에 띄운다(모달의 포커스 가두기에 단추·입력이 막히지 않게).
 */
(function () {
	if (window.nemoDialog) return;
	var EN = /^en/.test(document.documentElement.lang || '');
	var T = EN
		? { ok: 'OK', cancel: 'Cancel', net: 'Check your connection and try again.', later: 'Please try again in a moment.', failed: 'Something went wrong.', loadFail: 'Could not load the list', retry: 'Try again' }
		: { ok: '확인', cancel: '취소', net: '인터넷 연결을 확인해 주세요.', later: '잠시 뒤 다시 해 주세요.', failed: '요청하지 못했어요.', loadFail: '목록을 불러오지 못했어요', retry: '다시 불러오기' };

	var CSS = ''
		+ '.nd-back{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .15s}'
		+ '.nd-back.on{opacity:1}'
		+ '.nd-box{width:100%;max-width:340px;background:#fff;color:#212529;border-radius:12px;padding:22px 20px 16px;box-shadow:0 8px 32px rgba(0,0,0,.2);'
		+ 'font-size:15px;line-height:1.5;word-break:keep-all;overflow-wrap:anywhere;text-align:left;transform:translateY(8px);transition:transform .15s}'
		+ '.nd-back.on .nd-box{transform:none}'
		+ '.nd-title{font-size:17px;font-weight:700;margin:0 0 6px;color:inherit}'
		+ '.nd-text{margin:0;color:#495057;white-space:pre-line}'
		+ '.nd-title+.nd-text{font-size:14px}'
		+ '.nd-input{display:block;width:100%;box-sizing:border-box;margin-top:12px;min-height:44px;padding:10px 12px;font:inherit;font-size:16px;color:#212529;background:#fff;border:1px solid #ced4da;border-radius:8px;resize:vertical}'
		+ '.nd-input:focus{outline:none;border-color:#0d6efd;box-shadow:0 0 0 3px rgba(13,110,253,.2)}'
		+ '.nd-btns{display:flex;gap:8px;margin-top:18px}'
		+ '.nd-btn{flex:1;min-height:44px;padding:8px 12px;border:0;border-radius:8px;font:inherit;font-size:15px;cursor:pointer;background:#f1f3f5;color:#212529}'
		+ '.nd-btn.ok{background:#0d6efd;color:#fff;font-weight:700}'
		+ '.nd-btn.ok.danger{background:#dc3545}'
		+ '.nd-btn:focus-visible{outline:3px solid rgba(13,110,253,.45);outline-offset:2px}'
		+ '.nd-busy{display:flex;align-items:center;gap:12px}'
		+ '.nd-spin{flex:none;width:22px;height:22px;border:3px solid #dee2e6;border-top-color:#0d6efd;border-radius:50%;animation:nd-spin .8s linear infinite}'
		+ '@keyframes nd-spin{to{transform:rotate(360deg)}}'
		+ 'html.dark-mode .nd-box{background:#22262e;color:#ddd;box-shadow:0 8px 32px rgba(0,0,0,.5)}'
		+ 'html.dark-mode .nd-text{color:#bbb}'
		+ 'html.dark-mode .nd-btn{background:#2a2f35;color:#ddd}'
		+ 'html.dark-mode .nd-btn.ok{background:#0d6efd;color:#fff}'
		+ 'html.dark-mode .nd-btn.ok.danger{background:#dc3545}'
		+ 'html.dark-mode .nd-input{background:#2a2f35;color:#ddd;border-color:#555}'
		+ 'html.dark-mode .nd-spin{border-color:#3a3f48;border-top-color:#6ea8fe}'
		+ '.nemo-toast{position:fixed;left:50%;z-index:2200;transform:translate(-50%,8px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;'
		+ 'width:max-content;max-width:min(480px,calc(100vw - 32px));box-sizing:border-box;padding:10px 18px;text-align:center;'
		+ 'font-size:14px;line-height:1.45;word-break:keep-all;overflow-wrap:anywhere;white-space:pre-line;'
		+ 'font-family:var(--nemo-toast-font,inherit);background:var(--nemo-toast-bg,rgba(33,37,41,.94));color:var(--nemo-toast-fg,#fff);'
		+ 'border:var(--nemo-toast-border,0);border-radius:var(--nemo-toast-radius,20px);box-shadow:0 4px 16px rgba(0,0,0,.18)}'
		+ '.nemo-toast.on{opacity:1;transform:translate(-50%,0)}'
		+ 'html.dark-mode .nemo-toast{background:var(--nemo-toast-bg,#3a3f48);color:var(--nemo-toast-fg,#fff)}';

	function style() {
		if (document.getElementById('nemo-ui-css')) return;
		var s = document.createElement('style');
		s.id = 'nemo-ui-css';
		s.textContent = CSS;
		(document.head || document.documentElement).appendChild(s);
	}
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	}
	function opts(o) { return typeof o === 'object' && o ? o : { text: o == null ? '' : String(o) }; }

	// ── 대화 상자 ──
	var queue = Promise.resolve(), busyBox = null, seq = 0;

	function open(kind, o) {
		closeBusy();
		return new Promise(function (resolve) {
			style();
			var id = 'nd' + (++seq);
			var back = el('div', 'nd-back');
			var box = el('div', 'nd-box');
			box.setAttribute('role', kind === 'alert' ? 'dialog' : 'alertdialog');
			box.setAttribute('aria-modal', 'true');
			if (o.title) {
				var h = el('h2', 'nd-title', o.title);
				h.id = id + 't';
				box.setAttribute('aria-labelledby', h.id);
				box.appendChild(h);
			}
			if (o.text) {
				var p = el('p', 'nd-text', o.text);
				p.id = id + 'd';
				box.setAttribute(o.title ? 'aria-describedby' : 'aria-labelledby', p.id);
				box.appendChild(p);
			}
			var input = null;
			if (kind === 'prompt') {
				input = el(o.lines > 1 ? 'textarea' : 'input', 'nd-input');
				if (o.lines > 1) input.rows = o.lines; else input.type = 'text';
				if (o.value != null) input.value = o.value;
				if (o.placeholder) input.placeholder = o.placeholder;
				if (o.maxlength) input.maxLength = o.maxlength;
				input.setAttribute('aria-label', o.title || o.text || '');
				box.appendChild(input);
			}
			var btns = el('div', 'nd-btns'), cancel = null;
			if (kind !== 'alert') {
				cancel = el('button', 'nd-btn', o.cancel || T.cancel);
				cancel.type = 'button';
				btns.appendChild(cancel);
			}
			var ok = el('button', 'nd-btn ok' + (o.danger ? ' danger' : ''), o.ok || T.ok);
			ok.type = 'button';
			btns.appendChild(ok);
			box.appendChild(btns);
			back.appendChild(box);

			var before = document.activeElement;
			var host = document.querySelector('.modal.show') || document.body;
			host.appendChild(back);
			// 다음 그림에서 켜야 나타나는 움직임이 보인다
			requestAnimationFrame(function () { back.classList.add('on'); });
			(input || (o.danger && cancel) || ok).focus();
			if (input && input.select) input.select();

			function done(yes) {
				document.removeEventListener('keydown', onKey, true);
				back.remove();
				if (before && before.focus && document.contains(before)) try { before.focus({ preventScroll: true }); } catch (e) {}
				if (kind === 'confirm') resolve(!!yes);
				else if (kind === 'prompt') resolve(yes ? input.value : null);
				else resolve();
			}
			function onKey(e) {
				if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
				else if (e.key === 'Enter' && !(input && input.tagName === 'TEXTAREA') && !e.isComposing) {
					// 단추에 포커스가 있으면 그 단추의 클릭이 처리한다
					if (document.activeElement === cancel) return;
					e.preventDefault(); e.stopPropagation(); done(true);
				} else if (e.key === 'Tab') {
					// 상자 안에서만 돈다
					var f = [].slice.call(box.querySelectorAll('input,textarea,button'));
					var i = f.indexOf(document.activeElement), n = f.length;
					e.preventDefault();
					f[(i + (e.shiftKey ? n - 1 : 1)) % n].focus();
				}
				e.stopPropagation();
			}
			document.addEventListener('keydown', onKey, true);
			ok.addEventListener('click', function () { done(true); });
			if (cancel) cancel.addEventListener('click', function () { done(false); });
			// 바깥 누르기 = 취소(입력 중엔 실수로 날아가지 않게 막는다)
			back.addEventListener('click', function (e) { if (e.target === back && kind !== 'prompt') done(false); });
		});
	}
	function enqueue(kind, o) {
		var p = queue.then(function () { return open(kind, opts(o)); });
		queue = p.then(null, function () {});
		return p;
	}
	function closeBusy() {
		if (busyBox) { busyBox.remove(); busyBox = null; }
	}

	window.nemoDialog = {
		alert: function (o) { return enqueue('alert', o); },
		confirm: function (o) { return enqueue('confirm', o); },
		prompt: function (o) { return enqueue('prompt', o); },
		busy: function (text) {
			style();
			closeBusy();
			var back = el('div', 'nd-back on'), box = el('div', 'nd-box nd-busy');
			box.setAttribute('role', 'status');
			box.appendChild(el('span', 'nd-spin'));
			box.appendChild(el('p', 'nd-text', text || ''));
			back.appendChild(box);
			(document.querySelector('.modal.show') || document.body).appendChild(back);
			busyBox = back;
			return { close: function () { if (busyBox === back) closeBusy(); } };
		}
	};

	// ── 묻고 나서 가는 링크·폼 — onclick="return confirm(…)" 대신 ──
	// <a href="…" data-nemo-confirm="이 바구니를 지울까요?" data-nemo-text="되돌릴 수 없어요." data-nemo-ok="지우기" data-nemo-danger>
	// <form … data-nemo-confirm="…">  (확인하면 form.submit() — submit 이벤트는 다시 안 난다)
	function askThen(node, go) {
		nemoDialog.confirm({
			title: node.getAttribute('data-nemo-confirm'), text: node.getAttribute('data-nemo-text') || '',
			ok: node.getAttribute('data-nemo-ok') || '', danger: node.hasAttribute('data-nemo-danger')
		}).then(function (yes) { if (yes) go(); });
	}
	document.addEventListener('click', function (e) {
		var a = e.target.closest && e.target.closest('a[data-nemo-confirm]');
		if (!a || e.defaultPrevented) return;
		e.preventDefault();
		askThen(a, function () {
			if (a.target === '_blank') window.open(a.href, '_blank');
			else location.href = a.href;
		});
	});
	document.addEventListener('submit', function (e) {
		var f = e.target;
		if (!f.hasAttribute || !f.hasAttribute('data-nemo-confirm') || e.defaultPrevented) return;
		e.preventDefault();
		askThen(f, function () {
			// 누른 단추의 name=value 를 살린다(submit() 은 단추 값을 안 보낸다)
			var b = e.submitter;
			if (b && b.name) {
				var h = document.createElement('input');
				h.type = 'hidden'; h.name = b.name; h.value = b.value;
				f.appendChild(h);
			}
			HTMLFormElement.prototype.submit.call(f);
		});
	});

	// ── 토스트 ──
	var toastEl = null, toastTimer = 0;
	window.nemoToast = function (text, ms) {
		if (text == null || text === '') return;
		style();
		if (!toastEl) {
			toastEl = el('div', 'nemo-toast');
			toastEl.setAttribute('role', 'status');
			toastEl.setAttribute('aria-live', 'polite');
			document.body.appendChild(toastEl);
		}
		var root = getComputedStyle(document.body);	// body 에서 읽는다 — 화면이 상태 class(body.has-memo 등)로 자리를 바꿀 수 있게
		var top = root.getPropertyValue('--nemo-toast-top').trim();
		if (top) {
			toastEl.style.top = top;
			toastEl.style.bottom = 'auto';
		} else {
			// 휴대폰 아래 탭(.bottom-nav)이 보이면 그 위에
			var nav = document.querySelector('.bottom-nav'), navH = nav && nav.getClientRects().length ? nav.offsetHeight : 0;	// fixed 라 offsetParent 는 늘 null
			var gap = root.getPropertyValue('--nemo-toast-bottom').trim() || '16px';
			toastEl.style.top = 'auto';
			toastEl.style.bottom = 'calc(' + gap + ' + ' + navH + 'px + env(safe-area-inset-bottom, 0px))';
		}
		toastEl.textContent = String(text);
		// 다시 띄울 때도 나타나는 움직임이 보이게
		toastEl.classList.remove('on');
		void toastEl.offsetWidth;
		toastEl.classList.add('on');
		clearTimeout(toastTimer);
		ms = typeof ms === 'object' && ms ? ms.ms : ms;
		toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || Math.min(5000, 1800 + String(text).length * 40));
	};

	// ── 요청 실패 ──
	// 실패값 → { msg: 서버가 준 말, reason: 까닭 한 줄(망 끊김/잠시 뒤) } — 토스트(nemoFail)와 빈 칸(nemoEmpty)이 같이 쓴다
	function failInfo(x) {
		var msg = '', status = -1;
		if (x == null) {
		} else if (typeof x === 'string') {
			msg = x;
		} else if (typeof x.status === 'number' && ('responseText' in x || 'readyState' in x)) {
			// jqXHR·XMLHttpRequest
			status = x.status;
			var j = x.responseJSON;
			if (!j && x.responseText) try { j = JSON.parse(x.responseText); } catch (e) {}
			if (j && typeof j === 'object' && j.msg) msg = String(j.msg);
		} else if (typeof x.status === 'number' && typeof x.ok === 'boolean') {
			status = x.status;	// fetch Response — 본문은 부른 쪽이 이미 읽었을 수 있어 상태만
		} else if (x instanceof TypeError) {
			status = 0;	// fetch 망 실패
		} else if (x.msg) {
			msg = String(x.msg);
		}
		return { msg: msg, reason: status === 0 ? T.net : T.later };
	}
	window.nemoFail = function (x, what) {
		var f = failInfo(x), msg = f.msg || ((what || T.failed) + ' ' + f.reason);
		window.nemoToast(msg);
		return msg;
	};

	// ── 빈 화면 ──
	window.nemoEmpty = function (box, o) {
		box = typeof box === 'string' ? document.querySelector(box) : box;
		if (!box) return;
		o = o || {};
		var failed = 'fail' in o, f = failed ? failInfo(o.fail) : null;
		var wrap = el('div', 'ne-empty' + (failed ? ' fail' : o.tone ? ' ' + o.tone : '') + (o.small ? ' sm' : ''));
		var ic = el('i', 'fas fa-' + (o.icon || (failed ? 'triangle-exclamation' : 'folder-open')) + ' ne-empty-ic');
		ic.setAttribute('aria-hidden', 'true');
		wrap.appendChild(ic);
		wrap.appendChild(el('p', 'ne-empty-t', o.title || (failed ? T.loadFail : '')));
		var text = failed ? (f.msg || f.reason) : o.text;
		if (text) wrap.appendChild(el('p', 'ne-empty-s', text));
		var act = o.action || (failed && o.retry ? { label: T.retry, onClick: o.retry } : null);
		if (act) {
			var b = el(act.href ? 'a' : 'button', 'btn btn-sm ' + (act.primary ? 'btn-primary' : 'btn-outline-secondary'), act.label);
			if (act.href) b.href = act.href; else b.type = 'button';
			if (act.onClick) b.addEventListener('click', function (e) { if (!act.href) e.preventDefault(); act.onClick(e); });
			wrap.appendChild(b);
		}
		box.innerHTML = '';
		box.appendChild(wrap);
		return wrap;
	};
})();
