// =====================================================================
// 抽選ロジック: 状態に応じた確率表で役を決め、その役になるリールの止まり位置を選ぶ
// ---------------------------------------------------------------------
// リールは上段・中段・下段の3つが見え、5ライン (上段・中段・下段・右下がり・右上がり) で判定する。
// リール配列のすべての止まり位置の組み合わせを最初に1回だけ調べて「どの役の出目か」で分類しておき、
// 抽選で決まった役に合う組み合わせをその中から選ぶ。
//   揃い役   … ちょうど1ラインだけその役が揃い、チャンス目にならない出目
//   チャンス目 … どのラインも揃わず、指定のチャンス目が1つだけ出る出目
//   ハズレ   … どのラインも揃わず、チャンス目にもならない出目
//   ロングフリーズ … どのラインも揃わず、左リール中段にチェリー (longFreeze.cells) が出る出目
//   ※ 左リール中段チェリーはロングフリーズ専用なので、それ以外の出目には出さない
// =====================================================================

// 5ライン: 各リール (左・中・右) で見る段 (0:上段 1:中段 2:下段)
const LINES = [
    { name: '上段', rows: [0, 0, 0] },
    { name: '中段', rows: [1, 1, 1] },
    { name: '下段', rows: [2, 2, 2] },
    { name: '右下がり', rows: [0, 1, 2] },
    { name: '右上がり', rows: [2, 1, 0] }
];

const ReelMap = (() => {
    let built = null;

    // 止まり位置 (各リールの中段に来るコマ番号) から 3x3 の出目を作る。grid[リール][段]
    function gridFor(stops, strips) {
        return stops.map((stop, reel) => {
            const strip = strips[reel];
            const n = strip.length;
            return [strip[(stop - 1 + n) % n], strip[stop], strip[(stop + 1) % n]];
        });
    }

    function lineSymbols(grid, line) {
        return line.rows.map((row, reel) => grid[reel][row]);
    }

    function sameList(a, b) {
        return a.every((v, i) => v === b[i]);
    }

    // 出目を調べる: 揃ったライン・特殊な出目・チャンス目・7/BAR のリーチ目
    function classify(grid, config) {
        const wins = [];
        const specials = [];
        const chances = [];
        let reachLike = false;
        LINES.forEach((line, li) => {
            const syms = lineSymbols(grid, line);
            if (syms[0] === syms[1] && syms[1] === syms[2]) wins.push({ line: li, role: syms[0] });
            for (const [role, pattern] of Object.entries(config.reels.specialPatterns)) {
                if (sameList(syms, pattern)) specials.push({ line: li, role });
            }
            config.reels.chancePatterns.forEach(p => {
                if (p.line && sameList(syms, p.line)) chances.push({ name: p.name, cells: line.rows.map((row, reel) => [reel, row]) });
            });
            const pairs = [[0, 1], [0, 2], [1, 2]];
            if (pairs.some(([a, b]) => syms[a] === syms[b] && (syms[a] === 'seven' || syms[a] === 'bar'))) reachLike = true;
        });
        config.reels.chancePatterns.forEach(p => {
            if (p.cells && p.cells.every(([reel, row, sym]) => grid[reel][row] === sym)) {
                chances.push({ name: p.name, cells: p.cells.map(([reel, row]) => [reel, row]) });
            }
        });
        const freeze = config.longFreeze.cells.every(([reel, row, sym]) => grid[reel][row] === sym);
        return { wins, specials, chances, reachLike, freeze };
    }

    function build(config) {
        const strips = config.reels.strips;
        const categories = {};
        const add = (key, entry) => (categories[key] = categories[key] || []).push(entry);
        const [n0, n1, n2] = strips.map(s => s.length);
        for (let a = 0; a < n0; a++) {
            for (let b = 0; b < n1; b++) {
                for (let c = 0; c < n2; c++) {
                    const stops = [a, b, c];
                    const { wins, specials, chances, reachLike, freeze } = classify(gridFor(stops, strips), config);
                    const hits = wins.length + specials.length;
                    if (freeze) {
                        if (hits === 0 && chances.length === 0) add('freeze', { stops });
                    } else if (hits === 1 && chances.length === 0) {
                        const hit = wins[0] || specials[0];
                        add(`hit:${hit.role}`, { stops, winLine: hit.line });
                    } else if (hits === 0 && chances.length === 1) {
                        add(`chance:${chances[0].name}`, { stops, chance: chances[0] });
                    } else if (hits === 0 && chances.length === 0) {
                        add('miss', { stops });
                        if (reachLike) add('missReach', { stops });
                    }
                }
            }
        }
        return categories;
    }

    function categories(config) {
        if (!built) built = build(config);
        return built;
    }

    return { gridFor, categories, classify, lineSymbols };
})();

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

    // 1ゲーム分の抽選結果 (outcome) を返す。ロングフリーズは他の役より先に抽選する
    draw(state, config, rng = Math.random) {
        // 復活待ちのレバー ON (暗転中) は 7揃い確定。演出なので払い出しはなし (noPayout)
        if (StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.REVIVAL) {
            return { ...this.makeOutcome('seven', config, rng), noPayout: true };
        }
        if (rng() < (config.longFreeze.prob[state.mode] || 0)) return this.makeOutcome('longFreeze', config, rng);
        const role = StateMachine.isRashMode(state)
            ? Battle.drawRole(state, config, rng)
            : this.drawRole(this.tableFor(state, config), rng);
        return this.makeOutcome(role, config, rng);
    },

    // 役からリールの止まり位置を選び、outcome を作る
    makeOutcome(role, config, rng = Math.random) {
        const cats = ReelMap.categories(config);
        let key;
        let chanceName = null;
        if (role === 'chance') {
            chanceName = this.weightedPick(config.reels.chancePatterns, p => p.weight, rng).name;
            key = `chance:${chanceName}`;
        } else if (role === 'miss') {
            key = rng() < config.effects.fakeReachRate ? 'missReach' : 'miss';
        } else if (role === 'longFreeze') {
            key = 'freeze';
        } else {
            key = `hit:${role}`;
        }
        const list = cats[key];
        const entry = list[Math.floor(rng() * list.length)];
        const grid = ReelMap.gridFor(entry.stops, config.reels.strips);
        return {
            role,                                   // 'bell' / 'chance' / 'miss' など
            stops: entry.stops,                     // 各リールの止まり位置 (中段のコマ番号)
            grid,                                   // 見えている出目 grid[リール][段]
            winLine: entry.winLine ?? null,         // 揃ったライン (LINES の番号)
            chance: entry.chance || null,           // チャンス目 { name, cells }
            aligned: role !== 'chance' && role !== 'miss' && role !== 'longFreeze',
            isChance: role === 'chance',
            isFreeze: role === 'longFreeze',
            freezeCells: role === 'longFreeze' ? config.longFreeze.cells.map(([reel, row]) => [reel, row]) : null,
            chanceName
        };
    },

    // 2本止まった時点のリーチ: 止まった2本で同じ図柄が並ぶラインを探す
    // 当たるラインなら図柄に関係なく、それ以外は effects.reachSymbols の図柄だけリーチにする
    findReach(outcome, stoppedReels, config) {
        const reachSymbols = config.effects.reachSymbols;
        let best = null;
        LINES.forEach((line, li) => {
            const [a, b] = stoppedReels.map(reel => outcome.grid[reel][line.rows[reel]]);
            if (a !== b) return;
            const isWinLine = li === outcome.winLine;
            if (!isWinLine && !reachSymbols.includes(a)) return;
            const rank = isWinLine ? -1 : reachSymbols.indexOf(a);
            if (!best || rank < best.rank) best = { symbol: a, line: li, lineName: line.name, rank };
        });
        return best;
    },

    // ラインの3マス [[リール, 段], ...]
    lineCells(lineIndex) {
        return LINES[lineIndex].rows.map((row, reel) => [reel, row]);
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

    // 設定ファイルの確認: 確率表の合計が1を超えていないか、どの役にも出目が用意できるか
    validate(config) {
        const errors = [];
        const maxChance = Math.max(...Object.values(config.machine.multipliers).map(m => m.chance));
        for (const [name, table] of Object.entries(config.lottery)) {
            const scaled = name === 'battle' ? table : { ...table, chance: table.chance * maxChance };
            const sum = Object.values(scaled).reduce((a, b) => a + b, 0);
            if (sum > 1) errors.push(`lottery.${name} の確率の合計が1を超えています (${sum.toFixed(3)})`);
        }
        const cats = ReelMap.categories(config);
        const roles = new Set(Object.values(config.lottery).flatMap(t => Object.keys(t)));
        roles.delete('chance');
        for (const role of roles) {
            if (!cats[`hit:${role}`]) errors.push(`リール配列に「${role}」が1ラインだけ揃う出目がありません`);
        }
        for (const p of config.reels.chancePatterns) {
            if (!cats[`chance:${p.name}`]) errors.push(`リール配列にチャンス目「${p.name}」の出目がありません`);
        }
        if (!cats.miss) errors.push('リール配列にハズレの出目がありません');
        if (!cats.missReach) errors.push('リール配列にガセリーチの出目がありません');
        if (!cats.freeze) errors.push('リール配列にロングフリーズの出目がありません');
        return errors;
    }
};
