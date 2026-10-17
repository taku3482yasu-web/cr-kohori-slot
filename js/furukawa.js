// =====================================================================
// ふるカワ: 液晶の右下に出てきて、吹き出しでしゃべるキャラクター
// ---------------------------------------------------------------------
// レバー ON でそのゲームの役が決まった直後に talk() を呼ぶ (先読み予告と同じタイミング)。
// 1. そのゲームの熱さ (0〜6) を役・場面から決める (城突入チャレンジは突入率、RASH の「？？」は継続するか)
// 2. 熱さに応じた確率 (appearRates) で出現する
// 3. 吹き出しの文字の色 (0:白 1:青 2:緑 3:紫 4:赤 5:金 6:虹) を熱さごとの重み (colorWeights) で選ぶ
// 4. 色が赤以上ならチャンスのセリフ、それ以外はヒント・今の状況 (次のステージなど)・設定示唆から選ぶ
// state は読むだけで書き換えない。
// =====================================================================

const Furukawa = {
    // しゃべる内容 { text, color, heat } を返す。出てこないゲームは null
    talk(state, outcome, config, rng = Math.random) {
        const cfg = config.furukawa;
        if (!this.canAppear(state, config)) return null;
        const heat = this.heat(state, outcome, config);
        if (rng() >= cfg.appearRates[heat]) return null;
        const weights = cfg.colorWeights[heat];
        const color = Number(Lottery.weightedPick(Object.keys(weights), c => weights[c], rng));
        return { text: this.line(state, config, color, rng), color, heat };
    },

    // 出てくる場面: 通常時 (ダンシングステージ以外)・SE城前・城突入チャレンジ・RASH の BATTLE / 「？？」 / 対戦相手を決めるゲーム
    canAppear(state, config) {
        if (state.mode === MODES.NORMAL) return !state.normal.dance;
        if (state.mode === MODES.CASTLE_CHALLENGE) return true;
        const phase = state.rash.phase;
        return phase === RASH_PHASES.BATTLE || phase === RASH_PHASES.QUESTION || phase === RASH_PHASES.SELECT;
    },

    // そのゲームの熱さ (0〜6。6 はロングフリーズ・7・7・BAR などの確定)
    heat(state, outcome, config) {
        const heat = config.furukawa.heat;
        const role = outcome.role;
        if (role === 'longFreeze') return 6;
        if (state.mode === MODES.CASTLE_CHALLENGE) {
            if (role === 'sevenBar') return 6;
            // 突入率で決める
            const rate = Math.min(1, (config.castle.entryRate[role] || 0)
                * MachineSetting.multipliers(state, config).castleEntry * GameFlow.castleEntryBoost(state, config));
            return heat.entrySteps.filter(step => rate >= step).length;
        }
        if (StateMachine.isRashMode(state)) {
            // 「？？」: 継続するなら熱い
            if (state.rash.phase === RASH_PHASES.QUESTION) return state.rash.setWillWin ? heat.questionWin : 0;
            return heat.battle[role] || 0;
        }
        // リベンジチャンス中のチャンス目は RASH 復活
        if (state.normal.revengeGames > 0 && role === 'chance') return heat.revengeChance;
        return heat.normal[role] || 0;
    },

    // セリフを選ぶ
    line(state, config, color, rng) {
        const cfg = config.furukawa;
        const pick = list => list[Math.floor(rng() * list.length)];
        // RASH 中は攻めるセリフ (いけるよ！ / ここがせめどき！ など)
        const inRash = StateMachine.isRashMode(state);
        if (color >= 4) return pick((inRash ? cfg.rashChanceLines : cfg.chanceLines)[color]);
        if (color >= 2 && rng() < 0.5) return pick(inRash ? cfg.rashExpectLines : cfg.expectLines);
        const kinds = cfg.kindWeights;
        const kind = Lottery.weightedPick(Object.keys(kinds), k => kinds[k], rng);
        if (kind === 'hint') return pick(cfg.hints);
        if (kind === 'setting') {
            const lines = cfg.settingLines.filter(l => l.weights[state.setting]);
            return Lottery.weightedPick(lines, l => l.weights[state.setting], rng).text;
        }
        return pick(this.stageLines(state, config));
    },

    // 今の状況のセリフ (次のステージ・残りゲーム数など)
    stageLines(state, config) {
        const names = config.map.names;
        if (state.mode === MODES.CASTLE_CHALLENGE) {
            const lines = [`あと${state.challenge.gamesRemaining}G！ チャンス目で突入だよ！`];
            if (state.challenge.chanceBoost) lines.push('オーラで突入率アップ中！');
            if (state.companions.length) lines.push('仲間がいると突入しやすいよ！');
            return lines;
        }
        if (StateMachine.isRashMode(state)) {
            const rash = state.rash;
            if (rash.phase === RASH_PHASES.QUESTION) return ['揃えば継続！ おねがい…！'];
            if (rash.phase === RASH_PHASES.SELECT) {
                const forced = rash.nextForcedEnemy && Battle.findEnemy(config, rash.nextForcedEnemy);
                return [forced ? `次の相手は${forced.name}みたい…！` : '次はだれと戦うのかな？'];
            }
            const enemy = Battle.findEnemy(config, rash.enemyId);
            const lines = [`残り${rash.gamesRemaining}G、がんばれ〜！`];
            if (enemy) lines.push(`${enemy.name}のHPはあと${rash.enemyHp}！`);
            if (rash.breakActive) lines.push('ブレイク中！ 今なら倒せるよ！');
            return lines;
        }
        const normal = state.normal;
        if (normal.map === config.map.castle) return [`城突入まであと${normal.castleWaitRemaining}G！`, 'ここでチャンス目を引くとパワーアップ！'];
        if (normal.revengeGames > 0) return ['チャンス目でRASH復活だよ！'];
        const next = config.map.loop[(normal.loopIndex + 1) % config.map.loop.length];
        const left = config.map.gamesPerMap - normal.gamesInMap;
        return [
            `次は${names[next]}だよ！ あと${left}G`,
            `SE城まで あとCP${Math.max(0, config.chancePoint.threshold - normal.chancePoint)}！`
        ];
    }
};
