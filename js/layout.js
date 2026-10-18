// =====================================================================
// 画面の表示モード (パソコン。幅 1100px 以上)
// ---------------------------------------------------------------------
// - ふだん (一覧): ボタン・ステータス・データカウンターまで、スクロールせずに画面に収まるよう
//   ページ全体を拡大・縮小する (body.layout-fit)。小さい画面では縮め、大きい画面では大きくする
// - 全画面: 筐体 (液晶・リール・レバー) だけを、ブラウザの全画面表示で画面いっぱいに出す (body.layout-full)。
//   上の「全画面」ボタンで入り、右上の ✕ か Esc でふだんの表示に戻る
// 拡大・縮小は transform で行う (要素の寸法は変わらないので、リールの位置の計算に影響しない)。
// 幅 1100px 未満 (スマホ・タブレット) は今までどおりのレイアウトで、何もしない。
// =====================================================================

const Layout = (() => {
    const PC = window.matchMedia('(min-width: 1100px)');
    const MAX_SCALE = 1.8;   // 大きい画面でも、これ以上は拡大しない
    const MARGIN = 12;       // 画面の端との余白 (px)
    let full = false;
    let container, machine;

    function init() {
        container = document.querySelector('.game-container');
        machine = document.querySelector('.slot-machine');
        document.getElementById('fullscreen-button').addEventListener('click', () => setFull(true));
        document.getElementById('exit-fullscreen-button').addEventListener('click', () => setFull(false));
        // Esc などでブラウザの全画面表示が終わったら、ふだんの表示に戻す
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && full) setFull(false);
        });
        window.addEventListener('resize', fit);
        PC.addEventListener('change', fit);
        // 大当たり履歴が増える・設定推測を開くなどで中身の大きさが変わったら合わせ直す
        // (transform では要素の寸法が変わらないので、合わせ直しが繰り返されることはない)
        new ResizeObserver(fit).observe(container);
        fit();
    }

    function setFull(on) {
        if (full === on) return;
        full = on;
        document.body.classList.toggle('layout-full', on);
        if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
            // 全画面表示が使えないとき (iPhone の Safari など) も、筐体だけの表示にはする
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (!on && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        fit();
    }

    // 画面の大きさに合わせて拡大・縮小する
    function fit() {
        const body = document.body;
        container.style.transform = '';
        machine.style.transform = '';
        if (full) {
            const scale = Math.min((innerWidth - MARGIN * 2) / machine.offsetWidth, (innerHeight - MARGIN * 2) / machine.offsetHeight);
            machine.style.transform = `scale(${scale})`;
            return;
        }
        body.classList.toggle('layout-fit', PC.matches);
        if (!PC.matches) return;
        const style = getComputedStyle(body);
        const padTop = parseFloat(style.paddingTop);
        const scale = Math.min(MAX_SCALE,
            (innerWidth - MARGIN * 2) / container.offsetWidth,
            (innerHeight - padTop - MARGIN) / container.offsetHeight);
        container.style.transform = `scale(${scale})`;
    }

    return { init, isFull: () => full };
})();
