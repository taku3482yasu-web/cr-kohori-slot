// =====================================================================
// リール制御: リール帯の生成・回転・指定図柄での停止 (slot の原型から流用)
// =====================================================================

const Reels = (() => {
    const STRIP_REPEAT = 20;   // リール帯に図柄の並びを何周分並べるか
    const STOP_OFFSET = 10;    // 停止時に何周目の図柄で止めるか

    let symbols = [];
    let reelEls = [];
    let stopButtons = [];
    let stopped = [true, true, true];
    let targetResults = null;
    let onStopCallback = null;
    let resolveSpin = null;

    function symbolHeight() {
        return reelEls[0].clientHeight;
    }

    function init(config, reelElements, buttons) {
        symbols = config.reels.symbols;
        reelEls = reelElements;
        stopButtons = buttons;
        reelEls.forEach(reel => {
            const strip = reel.querySelector('.reel-strip');
            strip.innerHTML = '';
            for (let i = 0; i < STRIP_REPEAT; i++) {
                symbols.forEach(id => {
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
        });
        stopButtons.forEach(btn => btn.disabled = true);
    }

    // 回転開始。results の出目で止まり、全リール停止で resolve する
    // onStop(reelIndex, stoppedCount) は各リール停止時に呼ばれる
    function spin(results, staggerMs, onStop) {
        targetResults = results;
        onStopCallback = onStop;
        stopped = [false, false, false];
        const cycle = symbols.length * symbolHeight();
        reelEls.forEach((reel, i) => {
            const strip = reel.querySelector('.reel-strip');
            strip.style.setProperty('--cycle', `-${cycle}px`);
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            setTimeout(() => {
                strip.style.animation = 'reel-spin 0.2s linear infinite';
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
        const index = symbols.indexOf(targetResults[i]);
        const position = (symbols.length * STOP_OFFSET + index) * symbolHeight();
        strip.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
        strip.style.transform = `translateY(-${position}px)`;

        const stoppedCount = stopped.filter(s => s).length;
        if (onStopCallback) onStopCallback(i, stoppedCount);
        if (stoppedCount === 3 && resolveSpin) {
            const resolve = resolveSpin;
            resolveSpin = null;
            setTimeout(resolve, 500); // 停止アニメーションの完了を待つ
        }
    }

    function isSpinning() {
        return stopped.some(s => !s);
    }

    return { init, spin, stop, isSpinning };
})();
