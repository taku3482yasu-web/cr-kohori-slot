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
    let startTimers = [];      // リールを少しずつずらして回し始めるタイマー
    let ends = [0, 0, 0];      // 各リールが すべり 終わる 時刻
    let chooser = null;        // STOP を押した位置から 止める コマを 選ぶ (main.js が Lottery.retarget を渡す)
    let lamps = [];            // リールの 上の ランプ (筐体。css/cabinet.css)
    const SLIDE_BASE_MS = 70, SLIDE_FRAME_MS = 32;   // 止まるまでの 時間: すべる コマ数で 長くなる (いちばん 長くて 約 0.7 秒)

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
        lamps = reelEls.map(el => el.parentElement.querySelector('.reel-lamp'));
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
        stopButtons.forEach((btn, i) => setStoppable(i, false));
    }

    // STOP を押せるか (リールそのものも押せる印 .stoppable を付ける)
    function setStoppable(i, on) {
        stopButtons[i].disabled = !on;
        reelEls[i].classList.toggle('stoppable', on);
    }

    // リールの 上の ランプ: state は '' (消灯) / 'spin' / 'reach' / 'push' / 'chance' / 'win'
    function setLamp(i, state) {
        const el = lamps[i];
        if (!el) return;
        el.className = `reel-lamp${state ? ` lamp-${state}` : ''}`;
    }

    // 回転開始。stops の位置で止まり、全リール停止で resolve する
    // onStop(reelIndex, stoppedCount) は各リール停止時に呼ばれる
    // choose(reel, press, fixed): 押した位置 press から 止める コマと すべる 数 { stop, slide } を返す (なければ stops の 位置)
    function spin(stops, staggerMs, onStop, choose = null) {
        clearHighlight();
        targetStops = [...stops];
        onStopCallback = onStop;
        chooser = choose;
        stopped = [false, false, false];
        reelEls.forEach((reel, i) => setLamp(i, 'spin'));
        reelEls.forEach((reel, i) => {
            const strip = reel.querySelector('.reel-strip');
            strip.style.setProperty('--cycle', `-${strips[i].length * symbolHeight()}px`);
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            // 回り始める前に STOP されたリールは回さない
            startTimers[i] = setTimeout(() => {
                if (stopped[i]) return;
                strip.style.animation = 'reel-spin 0.25s linear infinite';
            }, i * staggerMs);
        });
        stopButtons.forEach((btn, i) => setStoppable(i, true));
        return new Promise(resolve => { resolveSpin = resolve; });
    }

    function stop(i) {
        if (stopped[i]) return;
        stopped[i] = true;
        setStoppable(i, false);

        clearTimeout(startTimers[i]);
        const strip = reelEls[i].querySelector('.reel-strip');
        // 押した ときに 見えている 位置 (回転の アニメーションの 途中の 値) を 読んで、そこから すべらせて 止める
        const h = symbolHeight();
        const n = strips[i].length;
        const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
        const y = Math.max(0, -m.m42) % (n * h);
        strip.style.animation = 'none';
        const base = Math.ceil(y / h - 1e-6);          // これから 中段に 来る コマの 位置 (上段の コマ番号)
        const press = (base + 1) % n;                  // 中段に 来ようとしている コマ
        const fixed = targetStops.map((s, r) => (stopped[r] && r !== i ? s : null));
        let slide = (targetStops[i] - press + n) % n;
        if (chooser) {
            const pick = chooser(i, press, fixed);
            targetStops[i] = pick.stop;
            slide = pick.slide;
        }
        const ms = SLIDE_BASE_MS + slide * SLIDE_FRAME_MS + Math.round((base - y / h) * SLIDE_FRAME_MS);
        strip.style.transition = 'none';
        strip.style.transform = `translateY(-${y}px)`;
        void strip.offsetHeight;   // いまの 位置を 先に 決めてから すべらせる
        strip.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.6, 0.35, 1)`;
        strip.style.transform = `translateY(-${(base + slide) * h}px)`;
        // すべり 終わったら、光らせる コマの ある 周 (STOP_OFFSET) の 同じ 位置へ 見た目を 変えずに うつす
        setTimeout(() => {
            if (!stopped[i]) return;
            strip.style.transition = 'none';
            strip.style.transform = `translateY(-${offsetFor(i, targetStops[i])}px)`;
        }, ms + 10);
        setLamp(i, '');
        ends[i] = performance.now() + ms;

        const stoppedCount = stopped.filter(s => s).length;
        if (onStopCallback) onStopCallback(i, stoppedCount);
        if (stoppedCount === 3 && resolveSpin) {
            const resolve = resolveSpin;
            resolveSpin = null;
            setTimeout(resolve, Math.max(Math.max(...ends) - performance.now() + 30, 380)); // いちばん 遅い リールが 止まるのを 待つ
        }
    }

    // いまの 止まり位置 (STOP で 選びなおした あと)
    const stops = () => [...targetStops];

    // STOP ボタンを一時的に押せなくする (ロングフリーズ中)。解除すると止まっていないリールの STOP が押せる
    function lockStops(locked) {
        stopButtons.forEach((btn, i) => setStoppable(i, !locked && !stopped[i]));
    }

    // 画面の向き・幅が変わって1コマの高さが変わったとき、止まっているリールの位置と回転の幅を合わせ直す
    function relayout() {
        reelEls.forEach((reel, i) => {
            const strip = reel.querySelector('.reel-strip');
            strip.style.setProperty('--cycle', `-${strips[i].length * symbolHeight()}px`);
            if (!stopped[i]) return;
            strip.style.transition = 'none';
            strip.style.transform = `translateY(-${offsetFor(i, targetStops[i])}px)`;
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

    return { init, spin, stop, relayout, isSpinning, highlight, clearHighlight, lockStops, setLamp, stops };
})();
