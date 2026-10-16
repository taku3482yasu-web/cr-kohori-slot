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
            spinButton: $('spin-button')
        };
        initAudioSettings();
        initDataReset();
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
        els.mode.textContent = MODE_LABELS[state.mode];
        document.body.dataset.mode = state.mode;   // モードに応じたボタン・筐体の光り方 (CSS)
        document.body.dataset.phase = StateMachine.isRashMode(state) ? state.rash.phase : '';
        if (showProfit) {
            const coinValue = config.coins.packagePrice / config.coins.packageAmount;
            const profit = Math.floor(state.totalCoinsWon * coinValue - state.totalSpent);
            els.spentLabel.textContent = 'PROFIT:';
            els.spent.textContent = (profit > 0 ? '+' : '') + profit.toLocaleString();
        } else {
            els.spentLabel.textContent = 'TOTAL SPENT:';
            els.spent.textContent = state.totalSpent.toLocaleString();
        }
        if (config.debug) els.debugState.textContent = JSON.stringify(state, null, 2);
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
        if (!els.resetModal.hidden) {
            if (e.code === 'Escape') closeResetDialog();
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
        return !els.modal.hidden || !els.resetModal.hidden;
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

    return { init, update, bindDebugActions };
})();
