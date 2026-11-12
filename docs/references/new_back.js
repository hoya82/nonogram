// 뒤로 단추 — 사이트 안에서 넘어왔으면 방금 전 화면으로(브라우저 뒤로와 같다), 바로 들어왔으면(앱 첫 화면·바깥 링크·새 탭) 그 화면의 상위로.
// 상위는 PHP page_back_parent() 가 정해 단추의 href(머리줄) 또는 nemoBack('상위') 인자(머리줄 없는 게임 화면)로 넘긴다.
// 설치한 앱(manifest display: fullscreen)·아이폰 홈 화면 앱엔 브라우저 뒤로 단추가 없어 이 단추가 유일한 길이다
// 뒤로 단추는 모두 이 함수 하나를 부른다 — 한쪽이 location.href 로 앞으로 쌓고 다른 쪽이 history.back 이면 둘 사이를 끝없이 오간다(2026-10-24 미니게임 ↔ 게임 목록)
(function () {
	function fromSite() {
		try {
			return history.length > 1 && document.referrer !== '' && new URL(document.referrer).origin === location.origin;
		} catch (e) { return false; }
	}
	window.nemoBack = function (parent) {
		if (fromSite()) history.back();
		else location.replace(parent || './');	// 지금 화면을 상위로 바꿔 끼운다 — 쌓으면 상위의 뒤로가 다시 이 화면으로 돌아온다
	};
	document.addEventListener('click', function (e) {
		var a = e.target.closest ? e.target.closest('[data-nav-back]') : null;
		if (!a) return;
		e.preventDefault();
		// 화면이 건너뛸 자리를 정했으면(글 저장 직후 — 바로 전 화면이 글쓰기 폼) 이력과 상관없이 그 자리로 바꿔 끼운다
		if (a.hasAttribute('data-nav-replace')) location.replace(a.getAttribute('href'));
		else window.nemoBack(a.getAttribute('href'));
	});
})();
