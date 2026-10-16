// =====================================================================
// 抽選ロジック: 状態に応じた確率表で役を決め、リールの出目を作る
// =====================================================================

const Lottery = {
    // 状態に応じた確率表を返す (通常時・城突入チャレンジは設定でチャンス目の確率が変わる)
    tableFor(state, config) {
        if (StateMachine.isRashMode(state)) return config.lottery.battle;
        const base = state.mode === MODES.CASTLE_CHALLENGE ? config.lottery.castleChallenge : config.lottery.normal;
        const mult = MachineSetting.multipliers(state, config).chance;
        return { ...base, chance: base.chance * mult };
    },

    // 確率表から役を1つ選ぶ。どれにも当たらなければ 'miss'
    drawRole(table, rng = Math.random) {
        let rand = rng();
        for (const [role, prob] of Object.entries(table)) {
            if (rand < prob) return role;
            rand -= prob;
        }
        return 'miss';
    },

    // 役からリールの出目を作る
    resultsFor(role, config, rng = Math.random) {
        const symbols = config.reels.symbols;
        if (role === 'chance') {
            const patterns = config.reels.chancePatterns;
            return [...patterns[Math.floor(rng() * patterns.length)]];
        }
        const special = config.reels.specialPatterns[role];
        if (special) return [...special];
        if (role === 'miss') {
            // 3つともバラバラの柄 (揃い・チャンス目にならない)
            const pool = [...symbols];
            return [0, 1, 2].map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        }
        return [role, role, role];
    },

    // 1ゲーム分の抽選結果 (outcome) を返す
    draw(state, config, rng = Math.random) {
        const role = StateMachine.isRashMode(state)
            ? Battle.drawRole(state, config, rng)
            : this.drawRole(this.tableFor(state, config), rng);
        return this.makeOutcome(role, config, rng);
    },

    makeOutcome(role, config, rng = Math.random) {
        return {
            role,                                   // 'bell' / 'chance' / 'miss' など
            results: this.resultsFor(role, config, rng),
            aligned: role !== 'chance' && role !== 'miss',
            isChance: role === 'chance'
        };
    },

    // ガセリーチの最後のリールに止める柄: リーチ柄以外で、揃い・チャンス目・特殊な出目にならないもの
    missSymbol(results, reelIndex, config, rng = Math.random) {
        const patterns = [...config.reels.chancePatterns, ...Object.values(config.reels.specialPatterns)];
        const reachSymbol = results.find((_, i) => i !== reelIndex);
        const candidates = config.reels.symbols.filter(symbol => {
            if (symbol === reachSymbol) return false;
            const trial = results.map((s, i) => (i === reelIndex ? symbol : s));
            return !patterns.some(p => p.every((s, i) => s === trial[i]));
        });
        return candidates[Math.floor(rng() * candidates.length)];
    },

    // 重み付き抽選: items の中から weightOf(item) の重みで1つ選ぶ
    weightedPick(items, weightOf, rng = Math.random) {
        const total = items.reduce((sum, item) => sum + weightOf(item), 0);
        let rand = rng() * total;
        for (const item of items) {
            rand -= weightOf(item);
            if (rand < 0) return item;
        }
        return items[items.length - 1];
    },

    // 設定ファイルの確率表の合計が 1 を超えていないか確認する (設定で最も倍率が高い場合も含む)
    validate(config) {
        const errors = [];
        const maxChance = Math.max(...Object.values(config.machine.multipliers).map(m => m.chance));
        for (const [name, table] of Object.entries(config.lottery)) {
            const scaled = name === 'battle' ? table : { ...table, chance: table.chance * maxChance };
            const sum = Object.values(scaled).reduce((a, b) => a + b, 0);
            if (sum > 1) errors.push(`lottery.${name} の確率の合計が1を超えています (${sum.toFixed(3)})`);
        }
        return errors;
    }
};
