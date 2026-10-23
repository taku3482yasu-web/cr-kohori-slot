// =====================================================================
// データの保存 (ブラウザの localStorage)
// ---------------------------------------------------------------------
// 1ゲームの終了時などに state を丸ごと保存し、次に開いたときに続きから遊べるようにする。
// 保存できない環境 (プライベートブラウズなど) では保存せずに遊べる。
// =====================================================================

const SaveData = (() => {
    const KEY = 'koori-save';
    const OPENING_KEY = 'koori-opening';   // 次に開いたときにオープニングを流す印 (リセット・台移動)
    const VERSION = 1;

    function save(state) {
        try {
            const data = { version: VERSION, savedAt: Date.now(), state };
            localStorage.setItem(KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    function clear() {
        try {
            localStorage.removeItem(KEY);
        } catch (e) {
            // 消せない環境では何もしない
        }
    }

    // 保存データを読み込み、初期状態に重ねて返す。読めない・壊れている場合は null
    function load(config) {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(KEY));
        } catch (e) {
            return null;
        }
        if (!data || data.version !== VERSION || !data.state) return null;

        const saved = data.state;
        const state = createInitialState(config);
        // 後から追加した項目は初期値のまま残るよう、項目ごとに重ねる
        for (const key of Object.keys(state)) {
            if (!(key in saved)) continue;
            const value = state[key];
            state[key] = value && typeof value === 'object' && !Array.isArray(value)
                ? { ...value, ...saved[key] }
                : saved[key];
        }
        if (saved.justMoved) state.justMoved = true;   // 台移動の直後 (起動時のメッセージ用)
        state.debugForcePointChance = false;
        state.debugForceDance = false;
        state.debugForceChanceTime = false;
        return isValid(state, config) ? state : null;
    }

    function isValid(state, config) {
        const maps = [...config.map.loop, config.map.castle];
        if (!Object.values(MODES).includes(state.mode)) return false;
        if (!maps.includes(state.normal.map)) return false;
        if (!config.machine.multipliers[state.setting]) return false;
        if (!Object.values(RASH_PHASES).includes(state.rash.phase)) return false;
        if (state.rash.enemyId && !Battle.findEnemy(config, state.rash.enemyId)) return false;
        if (!Array.isArray(state.companions)) return false;
        if (!Array.isArray(state.hitHistory)) state.hitHistory = [];
        if (!Number.isFinite(state.gamesSinceHit)) state.gamesSinceHit = 0;
        state.companions = state.companions.filter(id => config.companions.members.some(m => m.id === id));
        return Number.isFinite(state.coins);
    }

    // 次に開いたときにオープニングを流す
    function requestOpening() {
        try {
            localStorage.setItem(OPENING_KEY, '1');
        } catch (e) {
            // 保存できない環境では流さない
        }
    }

    // オープニングを流す印があるか (読んだら消す)
    function takeOpeningRequest() {
        try {
            const requested = localStorage.getItem(OPENING_KEY) === '1';
            localStorage.removeItem(OPENING_KEY);
            return requested;
        } catch (e) {
            return false;
        }
    }

    function savedAt() {
        try {
            const data = JSON.parse(localStorage.getItem(KEY));
            return data ? data.savedAt : null;
        } catch (e) {
            return null;
        }
    }

    return { save, load, clear, savedAt, requestOpening, takeOpeningRequest };
})();
