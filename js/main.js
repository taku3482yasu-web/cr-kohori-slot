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
    const fsBuyButton = document.getElementById('fs-buy-button');
    const stopButtons = [1, 2, 3].map(n => document.getElementById(`stop-button-${n}`));
    const reelElements = [1, 2, 3].map(n => document.getElementById(`reel${n}`));
    // 筐体 (css/cabinet.css): 払い出しの 7 セグと、当たった ラインの 番号ランプ
    const payoutDisplay = document.getElementById('cab-payout');
    const lineLamps = [...document.querySelectorAll('.cab-line')];
    const setPayout = n => { if (payoutDisplay) payoutDisplay.textContent = n; };
    const lightLine = line => lineLamps.forEach(el => el.classList.toggle('on', line !== null && Number(el.dataset.line) === line));
    let debugNextRole = null;   // デバッグ: 次のゲームの役を指定
    let debugEndCard = -1;      // デバッグ: 最後に見た RASH 終了画面の絵の番号

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
        if (StateMachine.isRashMode(s) && s.rash.phase === RASH_PHASES.REVIVAL) return 'defeat';   // 復活待ちは負けたように見せる
        if (s.mode === MODES.SUPER_RASH) return 'super';
        if (s.mode === MODES.RASH) return 'battle';
        if (s.mode === MODES.CASTLE_CHALLENGE || s.normal.map === config.map.castle) return 'castle';
        if (s.normal.dance) return 'dance';
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
        // オープニング中のレバーはスキップ
        if (Lcd.storyActive()) {
            Lcd.skipStory();
            return;
        }
        const cost = config.coins.spinCost;
        if (state.coins < cost) {
            Lcd.showMessage('NO COINS!', '#ff8080');
            buyCoinsButton.classList.add('attention');
            fsBuyButton.classList.add('attention');
            refresh();
            return;
        }

        spinButton.disabled = true;
        state.coins -= cost;
        setPayout(0);
        lightLine(null);
        Lcd.clearMessage();
        Lcd.hideTrophy();
        Lcd.hideFurukawa();
        // 復活待ちでレバー ON: 画面が暗転し、BGM も止まる (復活演出で鳴り直す)
        if (StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.REVIVAL) {
            Lcd.revivalBlackout();
            Bgm.setPaused(true);
        }
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

        // ふるカワ: そのゲームの熱さに応じて出てきて、しゃべる
        const talk = Furukawa.talk(state, outcome, config);
        if (talk) Lcd.showFurukawa(talk);
        if (talk) Collection.hearFurukawa(state, talk.text, config);   // 図鑑のふるカワの説明・セリフ
        if (talk && talk.settingLine != null) SettingEstimate.countFurukawa(state, talk.settingLine);

        // 期待度の 演出 (2026-10-23 A3。js/hype.js): 熱さに 合わせて カットイン・先バレ音・確定音・金発光・フラッシュ・PUSH
        const heat = talk ? talk.heat : Furukawa.canAppear(state, config) ? Furukawa.heat(state, outcome, config) : 0;
        const hype = Hype.plan(heat, config);
        playHypeAtLever(hype);
        // 前兆と 違和感演出 (2026-10-23 A4。js/zencho.js)
        const zc = Zencho.beforeGame(state, config);
        if (!zc.zencho && state.mode === MODES.NORMAL && state.normal.zone) zc.zencho = 'zone';   // モードの ゾーン (A5)
        playZencho(zc);

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
                    Reels.setLamp(remaining, 'reach');
                    Lcd.reach(reach.symbol, reach.lineName);
                    Sound.chance();
                } else if (outcome.isChance && Math.random() < effects.pushRate) {
                    stopButtons[remaining].classList.add('push');
                    Reels.setLamp(remaining, 'push');
                    Lcd.push();
                }
            }
        };
        spinSound = setInterval(Sound.spin, 200);
        // 押した 位置から 引き込む (取りこぼしなし。Lottery.retarget)
        await Reels.spin(outcome.stops, effects.timing.reelSpinStagger, onStop, (i, press, fixed) => Lottery.retarget(outcome, i, press, fixed, config, { keepLine: Boolean(reach) }),
            { reverse: zc.iwakan === 'reverse' });
        if (freezePlaying) await freezePlaying;
        clearInterval(spinSound);
        stopButtons.forEach(btn => btn.classList.remove('reach', 'push'));
        Lcd.stopPreview();

        // 揃ったライン・チャンス目の図柄を光らせる
        if (outcome.winLine !== null) Reels.highlight(Lottery.lineCells(outcome.winLine), 'win');
        lightLine(outcome.winLine);
        // リールの 上の ランプ: 揃ったら 金、チャンス目は ピンク、ロングフリーズは 虹
        const lamp = outcome.isFreeze ? 'freeze' : outcome.winLine !== null ? 'win' : outcome.isChance ? 'chance' : '';
        [0, 1, 2].forEach(i => Reels.setLamp(i, lamp));
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
        // PUSH ボタン: 結果の 前に 押す
        if (hype.push) await PushButton.wait(hype.push);

        const coinsBefore = state.coins;
        const events = GameFlow.onGameEnd(state, outcome, config);
        setPayout(Math.max(0, state.coins - coinsBefore));
        if (config.debug) console.log('outcome', outcome, 'events', events);
        refresh();
        // バトルに負けたときは、演出のあいだ敗北の BGM
        const defeated = events.some(e => (e.type === 'questionResult' && !e.continued) || (e.type === 'naiteiResult' && !e.win));
        if (defeated) Bgm.play('defeat');
        await Lcd.playEvents(events);
        endIwakan();
        if (Zencho.afterGame(state) || !(state.mode === MODES.NORMAL && state.normal.zone)) setZenchoView(Zencho.active());
        Bgm.setPaused(false);
        refresh();
        UI.showAchievements(events);
        SaveData.save(state);

        setTimeout(() => { spinButton.disabled = false; }, 300);
    }

    // 前兆 (黒い 靄・筐体の 紫の 光) と 違和感演出
    function setZenchoView(kind) {
        Lcd.setZencho(kind);
        document.body.classList.toggle('zencho', Boolean(kind));
        document.body.dataset.zencho = kind || '';
    }
    function playZencho(zc) {
        setZenchoView(zc.zencho);
        if (zc.started) Sound.zencho();
        if (zc.iwakan === 'noise') {
            Lcd.noiseFx(700);
            Sound.noise(0.35, 0.08);
        }
        if (zc.iwakan === 'silent') {
            Sound.setMuted(true);
            Bgm.setPaused(true);
        }
        if (zc.iwakan === 'button') stopButtons.forEach(btn => btn.classList.add('iwakan'));
    }
    function endIwakan() {
        Sound.setMuted(false);
        stopButtons.forEach(btn => btn.classList.remove('iwakan'));
    }

    // レバー ON の 演出 (期待度。js/hype.js)
    function playHypeAtLever(hype) {
        document.body.classList.toggle('cab-gold', hype.gold || hype.kakutei);
        if (hype.kakutei) Sound.kakutei();
        else if (hype.sakibare) Sound.sakibare();
        if (hype.cutin) Lcd.chanceCutIn(hype.cutin, hype.cutinWho);
        if (hype.flash !== 'none') {
            const cls = `reel-flash-${hype.flash}`;
            document.body.classList.add(cls);
            setTimeout(() => document.body.classList.remove(cls), hype.flash === 'strong' ? 900 : 500);
            if (hype.flash === 'strong') Lcd.startFlash('#ffffff', 500);
        }
    }

    function buyCoins() {
        state.totalSpent += config.coins.packagePrice;
        state.coins += config.coins.packageAmount;
        buyCoinsButton.classList.remove('attention');
        fsBuyButton.classList.remove('attention');
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
    PushButton.init(config);   // PUSH ボタン (2026-10-23 A3)
    Layout.init();   // パソコンでの表示 (一覧 / 全画面)

    spinButton.addEventListener('click', playGame);
    buyCoinsButton.addEventListener('click', buyCoins);
    fsBuyButton.addEventListener('click', buyCoins);   // 全画面のときの BUY
    // STOP は指・マウスが触れた瞬間に止める (離したときの click を待たない)。
    // キーボード・支援技術からの click でも止められるよう両方受け付ける (2回目は無視される)
    // スマホでは回っているリールそのものを押しても止められる (STOP より大きくて押しやすい)。
    // 指で止めたときは短く震わせる (対応している端末だけ)
    const stopByPointer = (e, i) => {
        if (e.button !== 0 || stopButtons[i].disabled) return;
        e.preventDefault();
        Reels.stop(i);
        if (e.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(15);
    };
    stopButtons.forEach((btn, i) => {
        btn.addEventListener('pointerdown', (e) => stopByPointer(e, i));
        btn.addEventListener('click', () => Reels.stop(i));
    });
    reelElements.forEach((reel, i) => {
        reel.addEventListener('pointerdown', (e) => stopByPointer(e, i));
    });
    // 画面の向きが変わると1コマの高さが変わるので、リールの位置を合わせ直す
    window.addEventListener('resize', () => Reels.relayout());

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
        aruaru: debugAction(() => DebugState.forceAruaru(state)),
        finalBlow: debugAction(() => DebugState.forceFinalBlow(state)),
        dance: debugAction(() => DebugState.forceDance(state)),
        revenge: debugAction(() => DebugState.startRevenge(state, config)),
        allCompanions: debugAction(() => DebugState.allCompanions(state, config)),
        revival: debugAction(() => DebugState.toRevival(state, config)),
        opening: () => { if (!Reels.isSpinning() && !spinButton.disabled) Lcd.playOpening(); },
        ending: debugAction(() => [{ type: 'ending' }]),
        endCard: () => {   // RASH 終了画面の絵を、押すたびに次の絵へ
            if (Reels.isSpinning() || spinButton.disabled) return;
            const cards = config.endCard.cards;
            debugEndCard = (debugEndCard + 1) % cards.length;
            Lcd.showMessage(cards[debugEndCard].name, '#fff', 1000);
            Lcd.showEndCard(cards[debugEndCard].id);
        },
        setting: (s) => { DebugState.setSetting(state, s); refresh(); SaveData.save(state); },
        forceGold: debugAction(() => DebugState.forceEnemy(state, config.goldDog.id)),
        coins: debugAction(() => { state.coins += 1000; }),
        bonusBig: debugAction(() => DebugState.startBonus(state, 'big', config)),
        bonusReg: debugAction(() => DebugState.startBonus(state, 'reg', config)),
        bonusEpisode: debugAction(() => DebugState.startBonus(state, 'episode', config)),
        nearCeiling: debugAction(() => DebugState.nearCeiling(state, config)),
        heaven: debugAction(() => DebugState.toHeaven(state, config))
    });
    document.querySelectorAll('[data-next-role]').forEach(btn => {
        btn.addEventListener('click', () => { debugNextRole = btn.dataset.nextRole; });
    });

    // オープニング: はじめて遊ぶとき (保存データがないとき)・リセットしたあと・台移動したあとに流す。液晶かレバーを押すとスキップ
    document.getElementById('lcd').addEventListener('click', () => Lcd.skipStory());   // オープニング・エンディング
    const openingRequested = SaveData.takeOpeningRequest();
    const opening = !savedState || openingRequested ? Lcd.playOpening() : Promise.resolve();

    refresh();
    if (state.justMoved) {
        // 台移動の直後 (オープニングのあとに表示)
        delete state.justMoved;
        SaveData.save(state);
        opening.then(() => Lcd.showMessage(`${state.machineNo}番台に移動!`, '#7fffd4', 2500));
    } else if (savedState) {
        opening.then(() => Lcd.showMessage('CONTINUE!', '#9fe6ff', 2000));
    }
    // ゲームが更新されていたら、アップデート情報を表示する (はじめて遊ぶとき・表示しない設定のときは出さない。updates.js)
    const updates = UpdateNotes.takePending(!savedState);
    opening.then(() => UI.showUpdates(updates));

    // ホーム画面に追加したときにネットなしでも遊べるようにする (sw.js)。
    // 公開先 (https) だけで動かす: ファイルを直接開いたときは使えず、
    // 手元のサーバー (http://localhost) では版番号を付け直す前の js が古いまま残って紛らわしいため
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('サービスワーカーを登録できません:', err));
    }

    // テスト・デバッグ用に公開
    window.__game = { state, config };
})();
