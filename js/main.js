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

    // ロングフリーズ: STOP を押せなくし、BGM を止めて液晶の演出を流す
    async function playLongFreeze(stopSpinSound) {
        stopSpinSound();
        Reels.lockStops(true);
        Bgm.setPaused(true);
        await Lcd.longFreeze();
        Bgm.setPaused(false);
        Reels.lockStops(false);
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

        // 先読み予告 (レバーON で雪が降る)
        const previewRate = effects.preview[outcome.role] || 0;
        if (Math.random() < previewRate) {
            const gold = outcome.role !== 'miss' && Math.random() < effects.preview.goldRate;
            Lcd.startPreview(gold ? 2 : 1);
        }

        const stopOrder = [];
        let reach = null;
        let freezePlaying = null;
        let spinSound = null;
        const onStop = (i, count) => {
            Sound.stop(i);
            stopOrder.push(i);
            // ロングフリーズ: 左リール中段にチェリーが止まった瞬間に発生
            if (i === 0 && outcome.isFreeze) {
                freezePlaying = playLongFreeze(() => clearInterval(spinSound));
                return;
            }
            if (count === 2 && !outcome.isFreeze) {
                const remaining = [0, 1, 2].find(k => !stopOrder.includes(k));
                reach = Lottery.findReach(outcome, stopOrder, config);
                if (reach) {
                    stopButtons[remaining].classList.add('reach');
                    Lcd.reach(reach.symbol, reach.lineName);
                    Sound.chance();
                } else if (outcome.isChance && Math.random() < effects.pushRate) {
                    stopButtons[remaining].classList.add('push');
                    Lcd.push();
                }
            }
        };
        spinSound = setInterval(Sound.spin, 200);
        await Reels.spin(outcome.stops, effects.timing.reelSpinStagger, onStop);
        if (freezePlaying) await freezePlaying;
        clearInterval(spinSound);
        stopButtons.forEach(btn => btn.classList.remove('reach', 'push'));
        Lcd.stopPreview();

        // 揃ったライン・チャンス目の図柄を光らせる
        if (outcome.winLine !== null) Reels.highlight(Lottery.lineCells(outcome.winLine), 'win');
        if (outcome.chance) Reels.highlight(outcome.chance.cells, 'chance-cell');
        if (outcome.isFreeze) Reels.highlight(outcome.freezeCells, 'freeze-cell');

        // リーチの結果
        if (reach) {
            // リーチしたラインが揃えば GET!!、別のラインで揃った・チャンス目のときはそれぞれの表示
            const result = reach.line === outcome.winLine ? 'get' : outcome.isChance ? 'chance' : 'no';
            await Lcd.reachResult(result);
        }

        if (outcome.aligned) Sound.win();
        // チャンス目ごとの演出
        if (outcome.isChance) await Lcd.playChanceEffect(outcome.chanceName);

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
    // STOP は指・マウスが触れた瞬間に止める (離したときの click を待たない)。
    // キーボード・支援技術からの click でも止められるよう両方受け付ける (2回目は無視される)
    stopButtons.forEach((btn, i) => {
        btn.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || btn.disabled) return;
            e.preventDefault();
            Reels.stop(i);
        });
        btn.addEventListener('click', () => Reels.stop(i));
    });

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
        companion: debugAction(() => DebugState.forceCompanion(state)),
        treasure: debugAction(() => DebugState.forceTreasure(state)),
        naitei: debugAction(() => DebugState.forceNaitei(state)),
        revenge: debugAction(() => DebugState.startRevenge(state, config)),
        allCompanions: debugAction(() => DebugState.allCompanions(state, config)),
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
