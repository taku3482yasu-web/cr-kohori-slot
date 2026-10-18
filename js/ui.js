// =====================================================================
// UI: ステータス表示・キーボード操作・設定画面・デバッグパネル
// (キー割り当てと設定画面は slot の原型から流用)
// =====================================================================

const UI = (() => {
    const KEY_STORAGE_KEY = 'koori-key-bindings';
    const AUDIO_STORAGE_KEY = 'koori-audio';
    const KEY_ACTION_LABELS = {
        lever: 'レバー（回転開始）',
        stop1: '左リール STOP',
        stop2: '中リール STOP',
        stop3: '右リール STOP'
    };

    let config;
    let els = {};
    let keyActions = {};       // actionId → ボタン要素
    let keyBindings = {};
    let capturingAction = null;
    let showProfit = false;
    let settingRevealed = false;
    let gameState = null;

    function $(id) {
        return document.getElementById(id);
    }

    function init(cfg, actionButtons) {
        config = cfg;
        keyActions = actionButtons;
        els = {
            coins: $('coin-display'),
            spentLabel: $('status-label-spent'),
            spent: $('spending-display'),
            games: $('game-display'),
            mode: $('mode-display'),
            modal: $('settings-modal'),
            settingsButton: $('settings-button'),
            closeSettings: $('close-settings-button'),
            keyList: $('key-binding-list'),
            resetKeys: $('reset-keys-button'),
            debugPanel: $('debug-panel'),
            debugState: $('debug-state'),
            currentSetting: $('current-setting'),
            settingDetail: $('setting-detail'),
            revealSetting: $('reveal-setting-button'),
            bgmEnabled: $('bgm-enabled'),
            bgmVolume: $('bgm-volume'),
            saveInfo: $('save-info'),
            resetData: $('reset-data-button'),
            resetButton: $('reset-button'),
            resetModal: $('reset-modal'),
            resetConfirm: $('reset-confirm-button'),
            resetCancel: $('reset-cancel-button'),
            moveButton: $('move-button'),
            moveModal: $('move-modal'),
            moveConfirm: $('move-confirm-button'),
            moveCancel: $('move-cancel-button'),
            moveWarning: $('move-warning'),
            dcMachine: $('dc-machine'),
            spinButton: $('spin-button'),
            dcTotal: $('dc-total'),
            dcCurrent: $('dc-current'),
            dcRash: $('dc-rash'),
            dcSuper: $('dc-super'),
            dcOdds: $('dc-odds'),
            dcGraph: $('dc-graph'),
            dcHistory: $('dc-history'),
            dcEmpty: $('dc-empty'),
            collectionButton: $('collection-button'),
            collectionModal: $('collection-modal'),
            collectionClose: $('close-collection-button'),
            colAchievementCount: $('col-achievement-count'),
            colAchievements: $('col-achievements'),
            colAllies: $('col-allies'),
            profileModal: $('profile-modal'),
            profileCanvas: $('profile-canvas'),
            profileName: $('profile-name'),
            profileTitle: $('profile-title'),
            profileFacts: $('profile-facts'),
            profileText: $('profile-text'),
            profileClose: $('close-profile-button'),
            colEnemyCount: $('col-enemy-count'),
            colEnemies: $('col-enemies'),
            colSpecialCount: $('col-special-count'),
            colSpecials: $('col-specials'),
            colTrophyCount: $('col-trophy-count'),
            colTrophies: $('col-trophies'),
            colRecords: $('col-records'),
            colEndCardCount: $('col-endcard-count'),
            colEndCards: $('col-endcards'),
            colFurukawaCount: $('col-furukawa-count'),
            colFurukawaLines: $('col-furukawa-lines'),
            endCardModal: $('endcard-modal'),
            endCardCanvas: $('endcard-canvas'),
            endCardName: $('endcard-name'),
            endCardDetail: $('endcard-detail'),
            endCardClose: $('close-endcard-button'),
            achievementToast: $('achievement-toast'),
            dcEstimate: $('dc-estimate'),
            dcEstimateBars: $('dc-estimate-bars'),
            dcEstimateFacts: $('dc-estimate-facts'),
            updatesModal: $('updates-modal'),
            updatesList: $('updates-list'),
            updatesHideRow: $('updates-hide-row'),
            updatesHide: $('updates-hide'),
            updatesClose: $('close-updates-button'),
            updatesEnabled: $('updates-enabled'),
            showUpdates: $('show-updates-button')
        };
        initAudioSettings();
        initDataReset();
        initMachineMove();
        initCollection();
        initUpdates();
        els.dcEstimate.addEventListener('toggle', () => {
            if (gameState) renderEstimate(gameState);
        });
        els.revealSetting.addEventListener('click', () => {
            settingRevealed = !settingRevealed;
            renderSetting();
        });

        keyBindings = loadKeyBindings();
        updateKeyHints();

        els.spentLabel.addEventListener('click', () => {
            showProfit = !showProfit;
        });
        els.settingsButton.addEventListener('click', openSettings);
        els.closeSettings.addEventListener('click', closeSettings);
        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal) closeSettings();
        });
        els.resetKeys.addEventListener('click', () => {
            keyBindings = { ...config.keys };
            capturingAction = null;
            saveKeyBindings();
            updateKeyHints();
            renderKeyBindings();
        });
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', (e) => {
            if (!isDialogOpen() && Object.values(keyBindings).includes(e.code)) e.preventDefault();
        });

        els.debugPanel.hidden = !config.debug;
    }

    // ----- ステータス表示 -----
    function update(state) {
        gameState = state;
        els.coins.textContent = state.coins;
        els.games.textContent = state.totalGames;
        // 復活待ちは RASH が終わったように見せる (次のレバー ON で復活演出)
        const reviving = StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.REVIVAL;
        const shownMode = reviving ? MODES.NORMAL : state.mode;
        els.mode.textContent = MODE_LABELS[shownMode];
        document.body.dataset.mode = shownMode;   // モードに応じたボタン・筐体の光り方 (CSS)
        document.body.dataset.phase = StateMachine.isRashMode(state) && !reviving ? state.rash.phase : '';
        document.body.dataset.revenge = state.mode === MODES.NORMAL && state.normal.revengeGames > 0 ? 'on' : '';
        if (showProfit) {
            const coinValue = config.coins.packagePrice / config.coins.packageAmount;
            const profit = Math.floor(state.totalCoinsWon * coinValue - state.totalSpent);
            els.spentLabel.textContent = 'PROFIT:';
            els.spent.textContent = (profit > 0 ? '+' : '') + profit.toLocaleString();
        } else {
            els.spentLabel.textContent = 'TOTAL SPENT:';
            els.spent.textContent = state.totalSpent.toLocaleString();
        }
        renderDataCounter(state);
        renderEstimate(state);
        if (config.debug) els.debugState.textContent = JSON.stringify(state, null, 2);
    }

    // ----- データカウンター・大当たり履歴 -----
    const TRIGGER_LABELS = {
        castle: '城突入',
        sevenBar: '7・7・BAR',
        freeze: 'ロングフリーズ',
        revenge: 'リベンジ'
    };
    let dataCounterKey = '';

    function renderDataCounter(state) {
        const inRash = StateMachine.isRashMode(state);
        const shown = state.hitHistory.slice(0, config.dataCounter.historyShown);
        const liveCoins = inRash ? state.rash.coinsWon : 0;
        const key = JSON.stringify([state.totalGames, state.gamesSinceHit, state.rashCount, state.superCount,
            state.mode, liveCoins, inRash ? state.rash.defeatCount : 0, shown]);
        if (key === dataCounterKey) return;
        dataCounterKey = key;

        els.dcMachine.textContent = `${state.machineNo}番台`;
        els.dcTotal.textContent = state.totalGames.toLocaleString();
        els.dcCurrent.textContent = inRash ? (state.mode === MODES.SUPER_RASH ? 'SUPER中' : 'RASH中') : state.gamesSinceHit;
        els.dcRash.textContent = state.rashCount;
        els.dcSuper.textContent = state.superCount;
        els.dcOdds.textContent = state.rashCount ? `1/${Math.round(state.totalGames / state.rashCount)}` : '-';

        // 当選までのゲーム数のグラフ (左が古い)
        const maxGames = Math.max(100, ...shown.map(h => h.games));
        els.dcGraph.innerHTML = [...shown].reverse().map(h => {
            const height = Math.max(4, Math.round(h.games / maxGames * 100));
            const kind = h.active ? 'active' : h.super ? 'super' : 'rash';
            return `<div class="dc-bar dc-bar-${kind}" title="${h.no}回目 ${h.games}G"><span>${h.games}</span><i style="height:${height}%"></i></div>`;
        }).join('');

        els.dcEmpty.hidden = shown.length > 0;
        els.dcHistory.innerHTML = shown.map(h => {
            const coins = h.active ? liveCoins : h.coins;
            const defeats = h.active ? state.rash.defeatCount : h.defeats;
            const kind = h.active
                ? `<span class="dc-live">${state.mode === MODES.SUPER_RASH ? 'SUPER' : 'RASH'}中</span>`
                : h.super ? '<span class="dc-gold">SUPER</span>' : '<span class="dc-red">RASH</span>';
            return `<tr><td>${h.no}</td><td>${h.games}G</td><td>${TRIGGER_LABELS[h.trigger] || '-'}</td>` +
                `<td>${kind}</td><td>${coins.toLocaleString()}枚</td><td>${defeats}体</td><td>${trophyCell(h)}</td></tr>`;
        }).join('');
    }

    // ----- 設定推測 (開いているときだけ計算する) -----
    let estimateKey = '';

    function renderEstimate(state) {
        if (!els.dcEstimate.open) return;
        const e = state.estimate;
        const key = JSON.stringify([state.machineNo, e]);
        if (key === estimateKey) return;
        estimateKey = key;

        const probs = SettingEstimate.probabilities(state, config);
        const best = Math.max(...Object.values(probs));
        els.dcEstimateBars.innerHTML = Object.entries(probs).map(([s, p]) => {
            const width = Math.max(p > 0 ? 1 : 0, p * 100);
            const label = p >= 0.999 ? '99.9%+' : p < 0.001 ? '0.1%未満' : `${(p * 100).toFixed(1)}%`;
            return `<div class="dc-est-row${p === best ? ' dc-est-best' : ''}"><span class="dc-est-name">設定${s}</span>` +
                `<span class="dc-est-track"><i style="width:${width}%"></i></span><span class="dc-est-value">${label}</span></div>`;
        }).join('');

        // 材料: 見た数と、設定1・設定6の目安
        const settings = Object.keys(config.machine.multipliers).map(Number);
        const low = settings[0];
        const high = settings[settings.length - 1];
        const odds = p => `1/${(1 / p).toFixed(1)}`;
        const chanceSeen = e.normalChance ? odds(e.normalChance / e.normalGames) : '-';
        const tries = Object.values(e.challenges).reduce((a, c) => a + c.tries, 0);
        const wins = Object.values(e.challenges).reduce((a, c) => a + c.wins, 0);
        const challengeRate = s => `${Math.round(SettingEstimate.challengeRate(config, s, 1) * 100)}%`;
        const furukawaSeen = e.furukawa || {};
        const furukawa = config.furukawa.settingLines.map((line, i) => [line, furukawaSeen[i]])
            .filter(([, n]) => n).map(([line, n]) => `「${line.short}」×${n}`).join(' ');
        const trophies = Object.keys(config.trophy.colors).filter(level => e.trophies[level])
            .map(level => `${trophySwatch(Number(level))}${config.trophy.colors[level].name}×${e.trophies[level]}`).join(' ');
        const endCardsSeen = e.endCards || {};
        const endCards = config.endCard.cards.filter(card => endCardsSeen[card.id])
            .map(card => `${card.name}×${endCardsSeen[card.id]}`).join(' ');
        els.dcEstimateFacts.innerHTML = [
            `<li><b>チャンス目（通常時）</b> ${e.normalChance}回 / ${e.normalGames.toLocaleString()}G（${chanceSeen}）` +
                `<span class="dc-note">目安 設定${low} ${odds(SettingEstimate.chanceRate(config, low))} 〜 設定${high} ${odds(SettingEstimate.chanceRate(config, high))}</span></li>`,
            `<li><b>城突入チャレンジ</b> ${wins} / ${tries}回成功${tries ? `（${Math.round(wins / tries * 100)}%）` : ''}` +
                `<span class="dc-note">目安 設定${low} ${challengeRate(low)} 〜 設定${high} ${challengeRate(high)}（仲間なし）</span></li>`,
            `<li><b>トロフィー</b> ${trophies || 'まだ出ていません'}</li>`,
            `<li><b>RASH 終了画面</b> ${endCards || 'まだ見ていません'}</li>`,
            `<li><b>ふるカワ</b> ${furukawa || 'まだ設定のことは言っていません'}</li>`
        ].join('');
    }

    function trophySwatch(level) {
        const color = config.trophy.colors[level];
        const style = color.rainbow ? '' : ` style="background:${color.main}"`;
        return `<span class="dc-trophy${color.rainbow ? ' dc-trophy-rainbow' : ''}"${style}></span>`;
    }

    // 履歴のトロフィー欄: 色の見本と「○以上」(出なかったときは -)
    function trophyCell(hit) {
        const color = hit.trophy && config.trophy.colors[hit.trophy];
        if (!color) return '-';
        const label = hit.trophy === 1 ? color.name : hit.trophy === 6 ? `${color.name} 6確定` : `${color.name} ${hit.trophy}以上`;
        return trophySwatch(hit.trophy) + label;
    }

    // ----- キー割り当て -----
    function loadKeyBindings() {
        const bindings = { ...config.keys };
        try {
            const saved = JSON.parse(localStorage.getItem(KEY_STORAGE_KEY));
            if (saved && typeof saved === 'object') {
                for (const id of Object.keys(bindings)) {
                    if (typeof saved[id] === 'string') bindings[id] = saved[id];
                }
            }
        } catch (e) {
            // 保存データが読めない場合は初期設定を使う
        }
        return bindings;
    }

    function saveKeyBindings() {
        try {
            localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(keyBindings));
        } catch (e) {
            // 保存できない環境ではこのセッション中のみ有効
        }
    }

    function formatKey(code) {
        const names = {
            Space: 'SPACE', Enter: 'ENTER', Backspace: 'BS', Tab: 'TAB',
            ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
            ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
            AltLeft: 'L-ALT', AltRight: 'R-ALT'
        };
        if (names[code]) return names[code];
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
        return code.toUpperCase();
    }

    // 同じキーが他のアクションに割り当て済みなら入れ替える
    function assignKey(actionId, code) {
        const other = Object.keys(keyBindings).find(id => id !== actionId && keyBindings[id] === code);
        if (other) keyBindings[other] = keyBindings[actionId];
        keyBindings[actionId] = code;
        saveKeyBindings();
        updateKeyHints();
    }

    function updateKeyHints() {
        document.querySelectorAll('.key-hint').forEach(hint => {
            hint.textContent = formatKey(keyBindings[hint.dataset.action]);
        });
    }

    function onKeyDown(e) {
        // スライダーなどの入力欄を操作しているときはゲームのキーとして扱わない
        if (!capturingAction && e.target instanceof HTMLElement && e.target.matches('input, select, textarea')) return;
        if (capturingAction) {
            e.preventDefault();
            if (e.code !== 'Escape') assignKey(capturingAction, e.code);
            capturingAction = null;
            renderKeyBindings();
            return;
        }
        // ダイアログを開いている間はゲーム操作を受け付けない (Esc で閉じる)
        if (!els.updatesModal.hidden) {
            if (e.code === 'Escape') closeUpdates();
            return;
        }
        if (!els.resetModal.hidden) {
            if (e.code === 'Escape') closeResetDialog();
            return;
        }
        if (!els.moveModal.hidden) {
            if (e.code === 'Escape') closeMoveDialog();
            return;
        }
        if (!els.profileModal.hidden) {
            if (e.code === 'Escape') closeProfile();
            return;
        }
        if (!els.endCardModal.hidden) {
            if (e.code === 'Escape') closeEndCard();
            return;
        }
        if (!els.collectionModal.hidden) {
            if (e.code === 'Escape') closeCollection();
            return;
        }
        if (!els.modal.hidden) {
            if (e.code === 'Escape') closeSettings();
            return;
        }
        const actionId = Object.keys(keyBindings).find(id => keyBindings[id] === e.code);
        if (!actionId) return;
        e.preventDefault();
        if (e.repeat) return;
        // オープニング・エンディング中のレバーはスキップ (演出中でレバーが押せなくても)
        if (actionId === 'lever' && Lcd.storyActive()) {
            Lcd.skipStory();
            return;
        }
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
        const button = keyActions[actionId];
        if (button && !button.disabled) button.click();
    }

    // ----- 設定画面 -----
    function renderKeyBindings() {
        els.keyList.innerHTML = '';
        Object.keys(KEY_ACTION_LABELS).forEach(actionId => {
            const row = document.createElement('div');
            row.className = 'key-binding-row';
            const label = document.createElement('span');
            label.textContent = KEY_ACTION_LABELS[actionId];
            const keyButton = document.createElement('button');
            keyButton.className = 'key-button';
            if (capturingAction === actionId) {
                keyButton.classList.add('capturing');
                keyButton.textContent = 'キーを押して…';
            } else {
                keyButton.textContent = formatKey(keyBindings[actionId]);
            }
            keyButton.addEventListener('click', () => {
                capturingAction = actionId;
                renderKeyBindings();
            });
            row.append(label, keyButton);
            els.keyList.appendChild(row);
        });
    }

    // ----- サウンド (BGM のオン・オフと音量。ブラウザに保存) -----
    function initAudioSettings() {
        let prefs = { enabled: true, volume: 0.5 };
        try {
            const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY));
            if (saved) prefs = { ...prefs, ...saved };
        } catch (e) {
            // 読めない場合は初期値
        }
        Bgm.setEnabled(prefs.enabled);
        Bgm.setVolume(prefs.volume);
        els.bgmEnabled.checked = prefs.enabled;
        els.bgmVolume.value = Math.round(prefs.volume * 100);

        const store = () => {
            try {
                localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ enabled: Bgm.enabled, volume: Bgm.volume }));
            } catch (e) {
                // 保存できない環境ではこのセッション中のみ有効
            }
        };
        els.bgmEnabled.addEventListener('change', () => {
            Bgm.setEnabled(els.bgmEnabled.checked);
            store();
        });
        els.bgmVolume.addEventListener('input', () => {
            Bgm.setVolume(Number(els.bgmVolume.value) / 100);
            store();
        });
    }

    // ----- リセット (確認ダイアログで「リセットする」を押したときだけ) -----
    function isDialogOpen() {
        return !els.modal.hidden || !els.resetModal.hidden || !els.moveModal.hidden || !els.collectionModal.hidden || !els.profileModal.hidden ||
            !els.updatesModal.hidden || !els.endCardModal.hidden;
    }

    function openResetDialog() {
        // リールの回転中・演出中はリセットしない
        if (els.spinButton.disabled) return;
        if (!els.modal.hidden) closeSettings();
        els.resetModal.hidden = false;
        els.resetCancel.focus();
    }

    function closeResetDialog() {
        els.resetModal.hidden = true;
        els.resetButton.blur();
    }

    function initDataReset() {
        els.resetButton.addEventListener('click', openResetDialog);
        els.resetData.addEventListener('click', openResetDialog);
        els.resetCancel.addEventListener('click', closeResetDialog);
        els.resetModal.addEventListener('click', (e) => {
            if (e.target === els.resetModal) closeResetDialog();
        });
        // 保存データだけを消して読み込み直す (キー割り当て・サウンドの設定は別に保存しているので残る)
        els.resetConfirm.addEventListener('click', () => {
            SaveData.clear();
            SaveData.requestOpening();
            location.reload();
        });
    }

    // ----- アップデート情報 (文章と「前に見た更新」の記録は updates.js) -----
    function initUpdates() {
        els.updatesEnabled.checked = UpdateNotes.isEnabled();
        els.updatesEnabled.addEventListener('change', () => UpdateNotes.setEnabled(els.updatesEnabled.checked));
        els.updatesHide.addEventListener('change', () => {
            UpdateNotes.setEnabled(!els.updatesHide.checked);
            els.updatesEnabled.checked = !els.updatesHide.checked;
        });
        els.showUpdates.addEventListener('click', () => showUpdates(UpdateNotes.all(), false));
        els.updatesClose.addEventListener('click', closeUpdates);
        els.updatesModal.addEventListener('click', (e) => {
            if (e.target === els.updatesModal) closeUpdates();
        });
    }

    // updates: 表示する更新 (新しい順)。atStartup のときは「次から表示しない」を出す (設定画面から開いたときは出さない)
    function showUpdates(updates, atStartup = true) {
        if (!updates.length) return;
        if (!els.modal.hidden) closeSettings();
        els.updatesList.innerHTML = '';
        updates.forEach(update => {
            const section = document.createElement('section');
            section.className = 'updates-entry';
            const head = document.createElement('h3');
            head.textContent = update.title;
            const date = document.createElement('span');
            date.className = 'updates-date';
            date.textContent = update.date;
            head.appendChild(date);
            const list = document.createElement('ul');
            update.items.forEach(text => {
                const li = document.createElement('li');
                li.textContent = text;
                list.appendChild(li);
            });
            section.append(head, list);
            els.updatesList.appendChild(section);
        });
        els.updatesHideRow.hidden = !atStartup;
        els.updatesHide.checked = !UpdateNotes.isEnabled();
        els.updatesModal.hidden = false;
        els.updatesClose.focus({ preventScroll: true });
        els.updatesModal.querySelector('.modal-content').scrollTop = 0;
    }

    function closeUpdates() {
        els.updatesModal.hidden = true;
    }

    // ----- 図鑑: RASH 終了画面の絵を大きく見る (開いている間はキャラクターが動く) -----
    let endCardFrame = 0;

    function openEndCard(card, n) {
        const hint = card.hint === 'デフォルト' ? '示唆なし' : card.hint;
        els.endCardName.textContent = card.name;
        els.endCardDetail.textContent = `${hint}　見た回数 ${n.toLocaleString()}回`;
        els.endCardModal.hidden = false;
        els.endCardClose.focus();
        const start = performance.now();
        const loop = (time) => {
            if (els.endCardModal.hidden) return;
            EndCardView.renderTo(els.endCardCanvas, card.id, time - start + 600);
            endCardFrame = requestAnimationFrame(loop);
        };
        loop(start);
    }

    function closeEndCard() {
        cancelAnimationFrame(endCardFrame);
        els.endCardModal.hidden = true;
    }

    // ----- 図鑑・実績 -----
    function initCollection() {
        els.collectionButton.addEventListener('click', openCollection);
        els.collectionClose.addEventListener('click', closeCollection);
        els.collectionModal.addEventListener('click', (e) => {
            if (e.target === els.collectionModal) closeCollection();
        });
        els.profileClose.addEventListener('click', closeProfile);
        els.endCardClose.addEventListener('click', closeEndCard);
        els.endCardModal.addEventListener('click', (e) => {
            if (e.target === els.endCardModal) closeEndCard();
        });
        els.profileModal.addEventListener('click', (e) => {
            if (e.target === els.profileModal) closeProfile();
        });
    }

    function openCollection() {
        if (!gameState) return;
        if (!els.modal.hidden) closeSettings();
        renderCollection(gameState.collection);
        els.collectionModal.hidden = false;
        // 一番下の「閉じる」にフォーカスしても、表示は上から
        els.collectionClose.focus({ preventScroll: true });
        els.collectionModal.querySelector('.modal-content').scrollTop = 0;
    }

    function closeCollection() {
        els.collectionModal.hidden = true;
        els.collectionButton.blur();
    }

    function renderCollection(c) {
        const entries = Collection.entries(config);
        const count = (seen, total) => `${seen} / ${total}`;

        // 実績: 解除したものは ★、まだのものは ☆ と進み具合
        const achievements = config.collection.achievements;
        const unlocked = achievements.filter(a => c.achievements[a.id] != null);
        els.colAchievementCount.textContent = count(unlocked.length, achievements.length);
        els.colAchievements.innerHTML = achievements.map(a => {
            const done = c.achievements[a.id] != null;
            const target = Collection.target(config, a);
            const progress = done || target === 1 ? '' : `<span class="col-progress">${Math.min(Collection.stat(c, a.stat), target).toLocaleString()} / ${target.toLocaleString()}</span>`;
            return `<li class="${done ? 'col-done' : ''}"><span class="col-star">${done ? '★' : '☆'}</span>` +
                `<span class="col-name">${a.name}</span><span class="col-desc">${a.desc}</span>${progress}</li>`;
        }).join('');

        // キャラクター (こおりくん・ともいし・仲間・ふるカワ): 会ったキャラクターは押すと説明、まだのキャラクターはシルエット
        els.colAllies.innerHTML = '';
        for (const ally of allies()) {
            const unlocked = Collection.isUnlocked(c, ally.id, config);
            els.colAllies.append(characterCard(ally.id, unlocked ? ally.name : '？？？', !unlocked));
        }

        // 敵: 撃破した敵はドット絵と撃破数、まだの敵はシルエット。押すと説明
        const defeated = entries.enemies.filter(e => c.defeats[e.id]);
        els.colEnemyCount.textContent = count(defeated.length, entries.enemies.length);
        els.colEnemies.innerHTML = '';
        for (const enemy of entries.enemies) {
            const n = c.defeats[enemy.id] || 0;
            const unlocked = Collection.isUnlocked(c, enemy.id, config);
            els.colEnemies.append(characterCard(enemy.id, unlocked ? `${enemy.name} ×${n.toLocaleString()}` : '？？？', !unlocked));
        }

        // 必殺技: 見た技は名前と回数、まだの技は ？？？ (誰の技かは出す)
        const seenSpecials = entries.specials.filter(s => c.specials[s.id]);
        els.colSpecialCount.textContent = count(seenSpecials.length, entries.specials.length);
        els.colSpecials.innerHTML = entries.specials.map(s => {
            const n = c.specials[s.id] || 0;
            return `<li class="${n ? '' : 'col-unknown'}"><span class="col-who">${s.who}</span>` +
                `<span class="col-name">${n ? s.name : '？？？'}</span><span class="col-times">${n ? `×${n.toLocaleString()}` : ''}</span></li>`;
        }).join('');

        // トロフィー: 出た色と回数
        const seenTrophies = entries.trophies.filter(level => c.trophies[level]);
        els.colTrophyCount.textContent = count(seenTrophies.length, entries.trophies.length);
        els.colTrophies.innerHTML = entries.trophies.map(level => {
            const n = c.trophies[level] || 0;
            const color = config.trophy.colors[level];
            return `<div class="col-trophy${n ? '' : ' col-unknown'}">${n ? trophySwatch(level) : '<span class="dc-trophy"></span>'}` +
                `<span>${n ? `${color.name} ×${n.toLocaleString()}` : '？'}</span></div>`;
        }).join('');

        // RASH 終了画面: 見た絵は小さく描いて名前と回数 (押すと大きく見られる)、まだの絵は ？
        const seenCards = c.endCards || {};
        els.colEndCardCount.textContent = count(entries.endCards.filter(id => seenCards[id]).length, entries.endCards.length);
        els.colEndCards.innerHTML = '';
        for (const card of config.endCard.cards) {
            const n = seenCards[card.id] || 0;
            const item = document.createElement(n ? 'button' : 'div');
            item.className = `col-endcard${n ? '' : ' col-unknown'}`;
            if (n) {
                const canvas = document.createElement('canvas');
                EndCardView.renderTo(canvas, card.id);
                item.append(canvas);
                item.addEventListener('click', () => openEndCard(card, n));
            } else {
                const blank = document.createElement('span');
                blank.className = 'col-endcard-blank';
                blank.textContent = '？';
                item.append(blank);
            }
            const label = document.createElement('span');
            label.textContent = n ? `${card.name} ×${n.toLocaleString()}` : '？？？';
            item.append(label);
            els.colEndCards.append(item);
        }

        // ふるカワのセリフ: 分類ごとに折りたたみ。聞いたセリフは回数、まだのセリフは ？？？
        const heard = c.furukawaLines || {};
        const groups = Furukawa.catalog(config);
        const allLines = groups.flatMap(g => g.lines);
        els.colFurukawaCount.textContent = count(allLines.filter(t => heard[t]).length, allLines.length);
        els.colFurukawaLines.innerHTML = groups.map(g => {
            const items = g.lines.map(t => {
                const n = heard[t] || 0;
                return `<li class="${n ? '' : 'col-unknown'}"><span class="col-name">${n ? escapeHtml(t) : '？？？'}</span>` +
                    `<span class="col-times">${n ? `×${n.toLocaleString()}` : ''}</span></li>`;
            }).join('');
            const seen = g.lines.filter(t => heard[t]).length;
            return `<details class="col-lines"><summary>${g.name} <span class="col-count">${count(seen, g.lines.length)}</span></summary>` +
                `<ul class="col-specials">${items}</ul></details>`;
        }).join('');

        const r = c.records;
        const records = [
            ['合計ゲーム数', `${(r.games || 0).toLocaleString()}G`],
            ['RASH 突入', `${r.rash || 0}回`],
            ['SUPER 突入', `${r.super || 0}回`],
            ['内定の時 突破', `${r.naitei || 0}回`],
            ['ロングフリーズ', `${r.freeze || 0}回`],
            ['台移動', `${r.moves || 0}回`],
            ['復活', `${r.revival || 0}回`],
            ['エンディング', `${r.ending || 0}回`],
            ['1回の RASH の最高獲得', `${(r.bestCoins || 0).toLocaleString()}枚`],
            ['1回の RASH の最多撃破', `${r.bestDefeats || 0}体`]
        ];
        els.colRecords.innerHTML = records.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    }

    // ----- 図鑑: キャラクターの説明 -----
    // こおりくん・ともいし・仲間・ふるカワ (図鑑の「キャラクター」の欄の並び)
    function allies() {
        return [
            { id: 'koori', name: 'こおりくん' },
            { id: 'tomoishi', name: config.tomoishi.name },
            ...config.companions.members.map(m => ({ id: m.id, name: m.name })),
            { id: 'furukawa', name: config.furukawa.name }
        ];
    }

    // キャラクターのドット絵を scale 倍で描いた canvas (silhouette: まだ説明が見られないキャラクター)
    function characterCanvas(id, scale, silhouette = false) {
        const canvas = document.createElement('canvas');
        const sprite = { koori: 'walk1', tomoishi: 'idle', furukawa: 'idle' }[id];
        if (sprite) {
            const rows = SPRITES[id].frames[sprite];
            canvas.width = rows[0].length * scale;
            canvas.height = rows.length * scale;
            const g = canvas.getContext('2d');
            drawSprite(g, SPRITES[id], sprite, 0, 0, scale);
            if (silhouette) {
                // 描いたところだけを影の色で塗りつぶす (敵・仲間のシルエットと同じ色)
                g.globalCompositeOperation = 'source-in';
                g.fillStyle = '#101018';
                g.fillRect(0, 0, canvas.width, canvas.height);
            }
            return canvas;
        }
        const size = Characters.size(id);
        canvas.width = size.w * scale;
        canvas.height = size.h * scale;
        const draw = Characters.isCompanion(id) ? Characters.drawCompanion : Characters.drawEnemy;
        draw(canvas.getContext('2d'), id, canvas.width / 2, canvas.height, { scale, silhouette });
        return canvas;
    }

    // 図鑑のカード (押すと説明)
    function characterCard(id, label, unknown) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'col-enemy' + (unknown ? ' col-unknown' : '');
        const name = document.createElement('span');
        name.textContent = label;
        card.append(characterCanvas(id, 2, unknown), name);   // 2倍で描いて、CSS で枠に収まる大きさに縮める
        card.addEventListener('click', () => openProfile(id, unknown));
        return card;
    }

    function openProfile(id, unknown) {
        const c = gameState.collection;
        const enemies = [...config.enemies, config.goldDog, config.naitei.enemy];
        const enemy = enemies.find(e => e.id === id);
        const member = config.companions.members.find(m => m.id === id);
        const ally = allies().find(a => a.id === id);
        const profile = (window.CHARACTER_PROFILES || {})[id] || {};

        // ドット絵 (大きく)
        const canvas = characterCanvas(id, 4, unknown);
        els.profileCanvas.width = canvas.width;
        els.profileCanvas.height = canvas.height;
        els.profileCanvas.getContext('2d').drawImage(canvas, 0, 0);

        els.profileName.textContent = unknown ? '？？？' : (enemy ? enemy.name : ally.name);
        els.profileTitle.textContent = unknown ? '' : (profile.title || '');
        els.profileTitle.hidden = unknown || !profile.title;

        // 名前以外の情報: 必殺技・撃破数など (config.js から)
        const facts = [];
        if (id === 'koori') {
            facts.push(['必殺技', [config.specials.koori, config.specials.kooriKill, config.specials.kooriNaitei].join(' / ')]);
        } else if (member) {
            facts.push(['必殺技', member.special]);
            facts.push(['仲間の力', `城突入率 ×${member.castleEntry}・追撃 +${member.extraDamage}`]);
        } else if (enemy && !unknown) {
            facts.push(['必殺技', enemy.special]);
            facts.push(['HP', String(enemy.hp)]);
            facts.push(['撃破数', `${(c.defeats[id] || 0).toLocaleString()}回`]);
        }
        els.profileFacts.innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
        els.profileFacts.hidden = facts.length === 0;

        // 説明 (空行で段落を分ける)
        const textBody = unknown ? unlockHint(id) : (profile.text || '説明はまだありません。');
        els.profileText.innerHTML = textBody.split(/\n\s*\n/)
            .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
        els.profileText.classList.toggle('profile-empty', unknown || !profile.text);

        els.profileModal.hidden = false;
        els.profileClose.focus();
    }

    // まだ説明が見られないキャラクターの、解禁のしかた
    function unlockHint(id) {
        if (id === 'tomoishi') return 'SUPERおにおにRASHに到達すると説明が見られます。';
        if (id === 'furukawa') return `${config.furukawa.name}に会うと説明が見られます。`;
        if (config.companions.members.some(m => m.id === id)) return '仲間になると説明が見られます。';
        return '撃破すると説明が見られます。';
    }

    function closeProfile() {
        els.profileModal.hidden = true;
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    // 実績解除の通知 (液晶の演出が終わってから、1つずつ順に)
    const toastQueue = [];
    let toastTimer = null;

    function showAchievements(events) {
        for (const e of events) if (e.type === 'achievement') toastQueue.push(e.name);
        if (!toastTimer) nextToast();
    }

    function nextToast() {
        const name = toastQueue.shift();
        if (!name) {
            els.achievementToast.hidden = true;
            toastTimer = null;
            return;
        }
        els.achievementToast.innerHTML = `<span class="toast-label">★ 実績解除</span>${name}`;
        els.achievementToast.hidden = false;
        // 同じ要素を出し直すとアニメーションが最初から流れないので、一度外して付け直す
        els.achievementToast.classList.remove('show');
        void els.achievementToast.offsetWidth;
        els.achievementToast.classList.add('show');
        Sound.win();
        toastTimer = setTimeout(nextToast, 2800);
    }

    // ----- 台移動 (コインなどはそのままに、設定を抽選し直した新しい台へ) -----
    function openMoveDialog() {
        // リールの回転中・演出中は移動しない
        if (els.spinButton.disabled || !gameState) return;
        if (!els.modal.hidden) closeSettings();
        const lost = moveLosses(gameState);
        els.moveWarning.hidden = !lost;
        els.moveWarning.textContent = lost ? `${lost}中です！ 移動すると、この台の${lost}は終わります` : '';
        els.moveModal.hidden = false;
        els.moveCancel.focus();
    }

    // 移動すると失うもの (RASH・城突入チャレンジなどの途中経過)
    function moveLosses(state) {
        if (state.mode === MODES.SUPER_RASH) return 'SUPERおにおにRASH';
        if (state.mode === MODES.RASH) return 'おにおにRASH';
        if (state.mode === MODES.CASTLE_CHALLENGE) return '城突入チャレンジ';
        if (state.normal.dance) return 'ダンシングステージ';
        if (state.normal.revengeGames > 0) return 'リベンジチャンス';
        if (state.normal.map === config.map.castle) return 'SE城前';
        return null;
    }

    function closeMoveDialog() {
        els.moveModal.hidden = true;
        els.moveButton.blur();
    }

    function initMachineMove() {
        els.moveButton.addEventListener('click', openMoveDialog);
        els.moveCancel.addEventListener('click', closeMoveDialog);
        els.moveModal.addEventListener('click', (e) => {
            if (e.target === els.moveModal) closeMoveDialog();
        });
        // 新しい台を保存して読み込み直す (保存できない環境ではコインを失わないよう移動しない)
        els.moveConfirm.addEventListener('click', () => {
            const next = MachineMove.next(gameState, config);
            next.justMoved = true;
            if (!SaveData.save(next)) {
                closeMoveDialog();
                alert('この環境ではデータを保存できないため、台移動できません');
                return;
            }
            SaveData.requestOpening();
            location.reload();
        });
    }

    function renderSaveInfo() {
        const time = SaveData.savedAt();
        els.saveInfo.textContent = time
            ? `最後に保存: ${new Date(time).toLocaleString('ja-JP')}（1ゲームごとに自動保存）`
            : 'まだ保存されていません（1ゲームごとに自動保存）';
    }

    // 台の設定 (「表示する」を押すまで隠す)
    function renderSetting() {
        if (!gameState || !settingRevealed) {
            els.currentSetting.textContent = '？';
            els.settingDetail.hidden = true;
            els.revealSetting.textContent = '表示する';
            return;
        }
        const m = config.machine.multipliers[gameState.setting];
        els.currentSetting.textContent = `設定 ${gameState.setting}`;
        els.settingDetail.textContent = `チャンス目 ×${m.chance} / 城突入率 ×${m.castleEntry} / ポイントチャンス(多) ×${m.pointBig}`;
        els.settingDetail.hidden = false;
        els.revealSetting.textContent = '隠す';
    }

    function openSettings() {
        capturingAction = null;
        settingRevealed = false;
        renderSetting();
        renderSaveInfo();
        renderKeyBindings();
        els.modal.hidden = false;
        els.closeSettings.focus();
    }

    function closeSettings() {
        capturingAction = null;
        els.modal.hidden = true;
        els.settingsButton.blur();
    }

    // ----- デバッグパネル -----
    function bindDebugActions(handlers) {
        document.querySelectorAll('[data-debug]').forEach(btn => {
            btn.addEventListener('click', () => handlers[btn.dataset.debug]());
        });
        document.querySelectorAll('[data-setting]').forEach(btn => {
            btn.addEventListener('click', () => handlers.setting(Number(btn.dataset.setting)));
        });
    }

    return { init, update, bindDebugActions, showAchievements, showUpdates };
})();
