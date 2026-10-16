// =====================================================================
// 起動と1ゲームの流れ
//   レバーON → コイン投入 → 抽選 → リール回転・停止 → 払い出し → 状態更新 → 演出
// =====================================================================

(() => {
    const config = window.GAME_CONFIG;
    const savedState = SaveData.load(config);
    const state = savedState || createInitialState(config);

    const spinButton = document.getElementById('spin-button');
    const buyCoinsButton = document.getElementById('buy-coins-button');
    const stopButtons = [1, 2, 3].map(n => document.getElementById(`stop-button-${n}`));
    const reelElements = [1, 2, 3].map(n => document.getElementById(`reel${n}`));
    let debugNextRole = null;   // デバッグ: 次のゲームの役を指定

    function refresh() {
        UI.update(state);
        Bgm.play(bgmTrack(state));
    }

    // 場面ごとの BGM
    function bgmTrack(s) {
        if (s.mode === MODES.SUPER_RASH) return 'super';
        if (s.mode === MODES.RASH) return 'battle';
        if (s.mode === MODES.CASTLE_CHALLENGE || s.normal.map === config.map.castle) return 'castle';
        return 'field';
    }

    // 音は最初のユーザー操作のあとでないと鳴らせない
    function startAudio() {
        Sound.init();
        Bgm.init(Sound.context());
    }
    document.addEventListener('pointerdown', startAudio, { once: true });
    document.addEventListener('keydown', startAudio, { once: true });

    async function playGame() {
        startAudio();
        const cost = config.coins.spinCost;
        if (state.coins < cost) {
            Lcd.showMessage('NO COINS!', '#ff8080');
            buyCoinsButton.classList.add('attention');
            refresh();
            return;
        }

        spinButton.disabled = true;
        state.coins -= cost;
        Lcd.clearMessage();
        refresh();

        const outcome = debugNextRole ? Lottery.makeOutcome(debugNextRole, config) : Lottery.draw(state, config);
        debugNextRole = null;
        const effects = config.effects;

        // ガセリーチ: いったん3つとも同じ柄にしておき、2本止まった時点で残りをハズレ柄に差し替える
        if (outcome.role === 'miss' && Math.random() < effects.fakeReachRate) {
            const symbol = config.reels.symbols[Math.floor(Math.random() * config.reels.symbols.length)];
            outcome.results = [symbol, symbol, symbol];
            outcome.fakeReach = true;
        }

        // 先読み予告 (レバーON で雪が降る)
        const previewRate = effects.preview[outcome.role] || 0;
        if (Math.random() < previewRate) {
            const gold = outcome.role !== 'miss' && Math.random() < effects.preview.goldRate;
            Lcd.startPreview(gold ? 2 : 1);
        }

        const stopOrder = [];
        let reachSymbol = null;
        const onStop = (i, count) => {
            Sound.stop(i);
            stopOrder.push(i);
            if (count === 2) {
                const remaining = [0, 1, 2].find(k => !stopOrder.includes(k));
                if (outcome.fakeReach) {
                    outcome.results[remaining] = Lottery.missSymbol(outcome.results, remaining, config);
                }
                const [a, b] = stopOrder.map(k => outcome.results[k]);
                if (a === b) {
                    reachSymbol = a;
                    stopButtons[remaining].classList.add('reach');
                    Lcd.reach(a);
                    Sound.chance();
                } else if (outcome.isChance && Math.random() < effects.pushRate) {
                    stopButtons[remaining].classList.add('push');
                    Lcd.push();
                }
            }
        };
        const spinSound = setInterval(Sound.spin, 200);
        await Reels.spin(outcome.results, effects.timing.reelSpinStagger, onStop);
        clearInterval(spinSound);
        stopButtons.forEach(btn => btn.classList.remove('reach', 'push'));
        Lcd.stopPreview();

        // リーチの結果
        if (reachSymbol) {
            const result = outcome.aligned ? 'get' : outcome.isChance ? 'chance' : 'no';
            await Lcd.reachResult(result);
        }

        if (outcome.aligned) Sound.win();
        else if (outcome.isChance) Sound.chance();

        const events = GameFlow.onGameEnd(state, outcome, config);
        if (config.debug) console.log('outcome', outcome, 'events', events);
        refresh();
        await Lcd.playEvents(events);
        refresh();
        SaveData.save(state);

        setTimeout(() => { spinButton.disabled = false; }, 300);
    }

    function buyCoins() {
        state.totalSpent += config.coins.packagePrice;
        state.coins += config.coins.packageAmount;
        buyCoinsButton.classList.remove('attention');
        Lcd.showMessage('COINS ADDED!');
        refresh();
        SaveData.save(state);
    }

    // ----- 起動 -----
    document.title = config.title;
    document.getElementById('game-title').textContent = config.title;

    const configErrors = Lottery.validate(config);
    if (configErrors.length) {
        configErrors.forEach(err => console.error(err));
        alert('設定ファイルにエラーがあります:\n' + configErrors.join('\n'));
    }

    Lcd.init(document.getElementById('lcd'), config, state);
    Reels.init(config, reelElements, stopButtons);
    UI.init(config, { lever: spinButton, stop1: stopButtons[0], stop2: stopButtons[1], stop3: stopButtons[2] });

    spinButton.addEventListener('click', playGame);
    buyCoinsButton.addEventListener('click', buyCoins);
    stopButtons.forEach((btn, i) => btn.addEventListener('click', () => Reels.stop(i)));

    // デバッグ用の強制遷移
    const debugAction = (fn) => () => {
        if (Reels.isSpinning() || spinButton.disabled) return;
        Lcd.playEvents(fn() || []);
        refresh();
        SaveData.save(state);
    };
    UI.bindDebugActions({
        normal: debugAction(() => DebugState.toNormal(state, config)),
        fillCp: debugAction(() => DebugState.fillChancePoint(state, config)),
        nextMap: debugAction(() => DebugState.nextMap(state, config)),
        challenge: debugAction(() => DebugState.toCastleChallenge(state, config)),
        rash: debugAction(() => DebugState.toRash(state)),
        superRash: debugAction(() => DebugState.toSuperRash(state)),
        lastGame: debugAction(() => DebugState.lastGame(state)),
        setBreak: debugAction(() => DebugState.setBreak(state)),
        forceOni: debugAction(() => DebugState.forceEnemy(state, 'onioni')),
        pointChance: debugAction(() => DebugState.forcePointChance(state, config)),
        setting: (s) => { DebugState.setSetting(state, s); refresh(); SaveData.save(state); },
        forceGold: debugAction(() => DebugState.forceEnemy(state, config.goldDog.id)),
        coins: debugAction(() => { state.coins += 1000; })
    });
    document.querySelectorAll('[data-next-role]').forEach(btn => {
        btn.addEventListener('click', () => { debugNextRole = btn.dataset.nextRole; });
    });

    refresh();
    if (savedState) Lcd.showMessage('CONTINUE!', '#9fe6ff', 2000);

    // テスト・デバッグ用に公開
    window.__game = { state, config };
})();
