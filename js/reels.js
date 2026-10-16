// =====================================================================
// リール制御: リール帯の生成・回転・指定位置での停止・当たり図柄の点灯
// ---------------------------------------------------------------------
// 各リールは上段・中段・下段の3コマが見える。止まり位置 (stop) は中段に来るコマ番号。
// リール配列はリールごとに config.reels.strips で決まる。
// =====================================================================

const Reels = (() => {
    const STRIP_REPEAT = 12;   // リール帯にリール配列を何周分並べるか
    const STOP_OFFSET = 6;     // 停止時に何周目のコマで止めるか

    let strips = [];
    let reelEls = [];
    let stopButtons = [];
    let stopped = [true, true, true];
    let targetStops = [0, 0, 0];
    let onStopCallback = null;
    let resolveSpin = null;
    let litCells = [];

    // 1コマの高さ (リールの窓は3コマ分)
    function symbolHeight() {
        return reelEls[0].clientHeight / 3;
    }

    // 止まり位置 stop のとき、段 row (0:上段 1:中段 2:下段) に見えるコマの要素
    function cellElement(reel, stop, row) {
        const strip = reelEls[reel].querySelector('.reel-strip');
        return strip.children[strips[reel].length * STOP_OFFSET + stop + row - 1];
    }

    function offsetFor(reel, stop) {
        return (strips[reel].length * STOP_OFFSET + stop - 1) * symbolHeight();
    }

    function init(config, reelElements, buttons) {
        strips = config.reels.strips;
        reelEls = reelElements;
        stopButtons = buttons;
        // 最初はハズレの出目で止めておく (当たりに見える並びを避ける)
        const misses = ReelMap.categories(config).miss;
        const initialStops = misses[Math.floor(Math.random() * misses.length)].stops;
        reelEls.forEach((reel, r) => {
            const strip = reel.querySelector('.reel-strip');
            strip.innerHTML = '';
            for (let i = 0; i < STRIP_REPEAT; i++) {
                strips[r].forEach(id => {
                    const div = document.createElement('div');
                    div.className = `symbol symbol-${id}`;
                    const img = document.createElement('img');
                    img.className = 'symbol-img';
                    img.src = Symbols.url(id);
                    img.alt = SYMBOL_GLYPHS[id];
                    div.appendChild(img);
                    strip.appendChild(div);
                });
            }
            strip.style.transform = `translateY(-${offsetFor(r, initialStops[r])}px)`;
        });
        targetStops = [...initialStops];
        stopButtons.forEach(btn => btn.disabled = true);
    }

    // 回転開始。stops の位置で止まり、全リール停止で resolve する
    // onStop(reelIndex, stoppedCount) は各リール停止時に呼ばれる
    function spin(stops, staggerMs, onStop) {
        clearHighlight();
        targetStops = stops;
        onStopCallback = onStop;
        stopped = [false, false, false];
        reelEls.forEach((reel, i) => {
            const strip = reel.querySelector('.reel-strip');
            strip.style.setProperty('--cycle', `-${strips[i].length * symbolHeight()}px`);
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            setTimeout(() => {
                strip.style.animation = 'reel-spin 0.25s linear infinite';
            }, i * staggerMs);
        });
        stopButtons.forEach(btn => btn.disabled = false);
        return new Promise(resolve => { resolveSpin = resolve; });
    }

    function stop(i) {
        if (stopped[i]) return;
        stopped[i] = true;
        stopButtons[i].disabled = true;

        const strip = reelEls[i].querySelector('.reel-strip');
        strip.style.animation = 'none';
        strip.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
        strip.style.transform = `translateY(-${offsetFor(i, targetStops[i])}px)`;

        const stoppedCount = stopped.filter(s => s).length;
        if (onStopCallback) onStopCallback(i, stoppedCount);
        if (stoppedCount === 3 && resolveSpin) {
            const resolve = resolveSpin;
            resolveSpin = null;
            setTimeout(resolve, 500); // 停止アニメーションの完了を待つ
        }
    }

    // STOP ボタンを一時的に押せなくする (ロングフリーズ中)。解除すると止まっていないリールの STOP が押せる
    function lockStops(locked) {
        stopButtons.forEach((btn, i) => {
            btn.disabled = locked || stopped[i];
        });
    }

    function isSpinning() {
        return stopped.some(s => !s);
    }

    // 止まっている図柄を光らせる。cells: [[リール, 段], ...]
    function highlight(cells, className) {
        cells.forEach(([reel, row]) => {
            const el = cellElement(reel, targetStops[reel], row);
            if (!el) return;
            el.classList.add(className);
            litCells.push([el, className]);
        });
    }

    function clearHighlight() {
        litCells.forEach(([el, className]) => el.classList.remove(className));
        litCells = [];
    }

    return { init, spin, stop, isSpinning, highlight, clearHighlight, lockStops };
})();
