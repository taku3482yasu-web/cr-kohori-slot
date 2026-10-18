// =====================================================================
// ふるカワ: 液晶の右下に出てきて、吹き出しでしゃべるキャラクター
// ---------------------------------------------------------------------
// レバー ON でそのゲームの役が決まった直後に talk() を呼ぶ (先読み予告と同じタイミング)。
// 1. そのゲームの熱さ (0〜6) を役・場面から決める (城突入チャレンジは突入率、内定の時ゾーンは突破率、RASH の「？？」は継続するか)
// 2. 熱さに応じた確率 (appearRates) で出現する
// 3. 吹き出しの文字の色 (0:白 1:青 2:緑 3:紫 4:赤 5:金 6:虹) を熱さごとの重み (colorWeights) で選ぶ
// 4. 色が赤以上ならチャンスのセリフ、それ以外はヒント・今の状況 (次のステージなど)・設定示唆・キャラクターの話から選ぶ
// ただし敵と戦いはじめて1ゲーム目 (内定の時ゾーンも) は、熱い役でなければ必ず出てきてその敵の話をする (battleIntro)
// 敵が出てきたときの返事と撃破したときのひとことは、ゲームの結果のイベントに付ける (attachEventTalks)。
// state は読むだけで書き換えない。
// =====================================================================

const Furukawa = {
    lastText: null,              // 直前に言ったセリフ
    lastByList: new Map(),       // 候補の一覧 (中身) ごとに、前回そこから選んだセリフ

    // しゃべる内容 { text, color, heat, settingLine } を返す。出てこないゲームは null
    // settingLine: 設定示唆のセリフを言ったときは config.furukawa.settingLines の番号 (設定推測の材料。それ以外は null)
    talk(state, outcome, config, rng = Math.random) {
        const cfg = config.furukawa;
        if (!this.canAppear(state, config)) return null;
        const heat = this.heat(state, outcome, config);
        // 戦いはじめの1ゲーム目: その敵の話 (シバターなら「おはしばた！」など)
        const intro = this.introLines(state, config, heat);
        if (intro) return { text: this.choose(intro, rng), settingLine: null, color: cfg.battleIntro.color, heat };
        if (rng() >= cfg.appearRates[heat]) return null;
        const weights = cfg.colorWeights[heat];
        const color = Number(Lottery.weightedPick(Object.keys(weights), c => weights[c], rng));
        return { ...this.line(state, config, color, rng), color, heat };
    },

    // 出てくる場面: 通常時 (ダンシングステージも)・SE城前・城突入チャレンジ・RASH の BATTLE / 「？？」 / 対戦相手を決めるゲーム / 内定の時ゾーン / 宝物庫ゾーン
    canAppear(state, config) {
        if (state.mode === MODES.NORMAL) return true;
        if (state.mode === MODES.CASTLE_CHALLENGE) return true;
        const phase = state.rash.phase;
        return phase === RASH_PHASES.BATTLE || phase === RASH_PHASES.QUESTION || phase === RASH_PHASES.SELECT
            || phase === RASH_PHASES.NAITEI || phase === RASH_PHASES.TREASURE;
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
            // 内定の時ゾーン: 突破率で決める (必ず突破する役は確定の 6)
            if (state.rash.phase === RASH_PHASES.NAITEI) {
                const rate = config.naitei.winRates[role] || 0;
                return rate >= 1 ? 6 : heat.naiteiSteps.filter(step => rate >= step).length;
            }
            // 宝物庫ゾーン: 上乗せの多い役ほど熱い
            if (state.rash.phase === RASH_PHASES.TREASURE) return heat.treasure[role] || 0;
            return heat.battle[role] || 0;
        }
        // ダンシングステージ: チャンスゾーン突入率で決める (もう突入していたら 0)
        if (state.normal.dance) {
            if (state.normal.dance.zone) return 0;
            const rate = config.dance.zoneRates[role] || 0;
            return rate >= 1 ? 6 : heat.danceSteps.filter(step => rate >= step).length;
        }
        // リベンジチャンス中のチャンス目は RASH 復活
        if (state.normal.revengeGames > 0 && role === 'chance') return heat.revengeChance;
        return heat.normal[role] || 0;
    },

    // セリフを選ぶ { text, settingLine }
    line(state, config, color, rng) {
        const cfg = config.furukawa;
        const pick = list => ({ text: this.choose(list, rng), settingLine: null });
        // RASH の対戦相手を決めるゲーム・「？？」は専用のセリフ
        const inRash = StateMachine.isRashMode(state);
        const phase = inRash ? state.rash.phase : null;
        if (phase === RASH_PHASES.SELECT) return pick(this.selectLines(state, config, color));
        if (phase === RASH_PHASES.QUESTION) return pick(color >= 4 ? cfg.questionLines.hot : cfg.questionLines.normal);
        // ダンシングステージ・宝物庫ゾーンも専用のセリフ
        const zoneLines = !inRash && state.normal.dance ? cfg.danceLines : phase === RASH_PHASES.TREASURE ? cfg.treasureLines : null;
        if (zoneLines) return pick(color >= 4 ? zoneLines.hot : zoneLines.normal);
        // RASH 中は攻めるセリフ (いけるよ！ / ここがせめどき！ など)
        if (color >= 4) return pick((inRash ? cfg.rashChanceLines : cfg.chanceLines)[color]);
        if (color >= 2 && rng() < 0.5) return pick(inRash ? cfg.rashExpectLines : cfg.expectLines);
        const kinds = cfg.kindWeights;
        const kind = Lottery.weightedPick(Object.keys(kinds), k => kinds[k], rng);
        if (kind === 'hint') return pick(cfg.hints);
        if (kind === 'chat') return pick(this.chatLines(state, config));
        if (kind === 'setting') {
            const index = Number(Lottery.weightedPick(Object.keys(cfg.settingLines), i => cfg.settingLines[i].weights[state.setting], rng));
            // 設定示唆は設定推測の材料なので、続いても重みどおりに選ぶ (避けない)
            this.lastText = cfg.settingLines[index].text;
            return { text: cfg.settingLines[index].text, settingLine: index };
        }
        return pick(this.stageLines(state, config));
    },

    // 敵と戦いはじめて1ゲーム目 (内定の時ゾーンも) のセリフ (その敵の話)。チャンス目など熱い役のゲームと、話のない敵は null (ふだんどおり)
    introLines(state, config, heat) {
        const rash = state.rash;
        if (!StateMachine.isRashMode(state) || !rash.battleIntro) return null;
        if (rash.phase !== RASH_PHASES.BATTLE && rash.phase !== RASH_PHASES.NAITEI) return null;
        if (heat >= config.furukawa.battleIntro.skipHeat) return null;
        const lines = config.furukawa.chatLines.enemies[rash.enemyId];
        return lines && lines.length ? lines : null;
    },

    // 対戦相手を決めるゲーム: 誰が来るかな？ / 熱いとき・強い相手が決まっているときは「強い気配がするよ！」
    selectLines(state, config, color) {
        const lines = config.furukawa.selectLines;
        const forcedId = state.rash.nextForcedEnemy;
        if (color >= 4 || config.furukawa.strongEnemies.includes(forcedId)) return lines.strong;
        const forced = forcedId && Battle.findEnemy(config, forcedId);
        return forced ? [`次の相手は${forced.name}みたい…！`] : lines.normal;
    },

    // キャラクターの話: RASH 中は戦っている相手 (SUPER ならともいしも)、通常時はこおりくん・仲間・ふるカワ自身
    chatLines(state, config) {
        const chat = config.furukawa.chatLines;
        if (StateMachine.isRashMode(state)) {
            const lines = [...(chat.enemies[state.rash.enemyId] || [])];
            if (state.mode === MODES.SUPER_RASH) lines.push(...chat.super);
            if (lines.length) return lines;
        }
        return [...chat.normal, ...state.companions.flatMap(id => chat.companions[id] || [])];
    },

    // ゲームの結果のイベントに、ふるカワのセリフ { text, color } を e.furukawa として付ける (液晶はそれを出すだけ)
    //   battleStart: 敵が出てきたときのセリフへの返事 (replies)
    //   defeat / 内定の時ゾーンの突破: 撃破したときのひとこと (defeatLines)
    //   rashEnd / 内定の時ゾーンの失敗で RASH 終了: 結果に合わせたひとこと (rashEndLines)
    //   superStart: ともいしのセリフ (e.tomoishiLine) を選び、それへの返事 (tomoishiReplies)
    //   ending: エンディングのあとのひとこと (endingLines)
    attachEventTalks(events, config, rng = Math.random) {
        const cfg = config.furukawa;
        const pick = list => (list && list.length ? { text: this.choose(list, rng), color: cfg.eventColor } : null);
        for (const e of events) {
            let talk = null;
            if (e.type === 'battleStart') talk = pick(cfg.replies[e.enemyId]);
            else if (e.type === 'defeat') talk = pick(cfg.defeatLines[e.enemyId]);
            else if (e.type === 'naiteiResult' && e.win) talk = pick(cfg.defeatLines[config.naitei.enemy.id]);
            else if (e.type === 'rashEnd' || (e.type === 'naiteiResult' && e.toCastle)) talk = pick(this.rashEndLines(e, config));
            else if (e.type === 'ending') talk = pick(cfg.endingLines);
            else if (e.type === 'superStart') {
                const lines = config.tomoishi.superLines;
                const index = Math.floor(rng() * lines.length);
                e.tomoishiLine = lines[index];
                talk = pick(cfg.tomoishiReplies[index]);
            }
            if (talk) e.furukawa = talk;
        }
        return events;
    },

    // 候補から1つ選ぶ。同じセリフが続かないよう、直前に言ったセリフと、この候補から前回選んだセリフは
    // (ほかに候補があれば) 避ける。同じ敵と続けて戦っても、返事・撃破のひとことが毎回同じにならない
    choose(list, rng) {
        // 一覧は毎回作り直すもの (戦っている敵の話など) もあるので、中身で見分ける。
        // 数字の入る一覧 (残りゲーム数など) は場面ごとに中身が変わるので、前回の記録は使わず直前のセリフだけ避ける
        const key = list.join('\n');
        const track = list.length > 1 && !/\d/.test(key);
        const prev = track ? this.lastByList.get(key) : undefined;
        let options = list.filter(t => t !== this.lastText && t !== prev);
        if (!options.length) options = list.filter(t => t !== prev);   // 前回この候補から選んだセリフを避けるほうを優先
        if (!options.length) options = list;
        const text = options[Math.floor(rng() * options.length)];
        this.lastText = text;
        if (track) {
            // 最近使った一覧を後ろへ。増えすぎないよう、いちばん古いものから消す
            this.lastByList.delete(key);
            this.lastByList.set(key, text);
            if (this.lastByList.size > 300) this.lastByList.delete(this.lastByList.keys().next().value);
        }
        return text;
    },

    // RASH 終了のひとこと: SUPER まで行った → いっぱい倒した → 1体も倒せなかった → それ以外 の順に選ぶ
    rashEndLines(e, config) {
        const lines = config.furukawa.rashEndLines;
        if (e.wasSuper) return lines.super;
        if (e.defeatCount >= lines.manyDefeats) return lines.many;
        return e.defeatCount > 0 ? lines.normal : lines.zero;
    },

    // 図鑑の「ふるカワのセリフ」に載せるセリフ [{ name: 分類, lines: [セリフ] }]。数字などが入るセリフ (今の状況・次の相手) は載せない
    catalog(config) {
        const cfg = config.furukawa;
        const chat = cfg.chatLines;
        const enemyIds = [...config.enemies, config.goldDog, config.naitei.enemy].map(e => e.id);
        const byEnemy = map => enemyIds.flatMap(id => map[id] || []);
        const seen = new Set();
        const unique = lines => lines.filter(t => !seen.has(t) && seen.add(t));
        return [
            { name: '敵への返事', lines: byEnemy(cfg.replies) },
            { name: '撃破したとき', lines: byEnemy(cfg.defeatLines) },
            { name: 'RASH 終了', lines: [...cfg.rashEndLines.super, ...cfg.rashEndLines.many, ...cfg.rashEndLines.normal, ...cfg.rashEndLines.zero] },
            { name: 'ともいし・エンディング', lines: [...cfg.tomoishiReplies.flat(), ...cfg.endingLines] },
            { name: 'キャラクターの話', lines: [...chat.normal, ...Object.values(chat.companions).flat(), ...byEnemy(chat.enemies), ...chat.super] },
            { name: 'チャンス', lines: [...cfg.expectLines, ...Object.values(cfg.chanceLines).flat(), ...cfg.rashExpectLines, ...Object.values(cfg.rashChanceLines).flat()] },
            { name: '対戦相手・「？？」', lines: [...Object.values(cfg.selectLines).flat(), ...Object.values(cfg.questionLines).flat()] },
            { name: 'ダンス・宝物庫', lines: [...Object.values(cfg.danceLines).flat(), ...Object.values(cfg.treasureLines).flat()] },
            { name: 'ヒント', lines: cfg.hints },
            { name: '台の設定', lines: cfg.settingLines.map(l => l.text) }
        ].map(group => ({ name: group.name, lines: unique(group.lines) }));
    },

    // catalog のセリフの集まり (config ごとに1回だけ作る)
    catalogSet(config) {
        if (!this._catalog || this._catalog.config !== config) {
            this._catalog = { config, set: new Set(this.catalog(config).flatMap(g => g.lines)) };
        }
        return this._catalog.set;
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
            // 内定の時ゾーンは HP を削っても倒せない (突破の抽選だけ) ので、残りゲーム数だけ
            if (rash.phase === RASH_PHASES.NAITEI) return [`あと${rash.gamesRemaining}G！ 内定をつかみとって！`, `残り${rash.gamesRemaining}G、チャンス目で突破しやすいよ！`];
            const enemy = Battle.findEnemy(config, rash.enemyId);
            const lines = [`残り${rash.gamesRemaining}G、がんばれ〜！`];
            if (enemy) lines.push(`${enemy.name}のHPはあと${rash.enemyHp}！`);
            if (rash.breakActive) lines.push('ブレイク中！ 今なら倒せるよ！');
            return lines;
        }
        const normal = state.normal;
        if (normal.map === config.map.castle) return [`城突入まであと${normal.castleWaitRemaining}G！`, 'ここでチャンス目を引くとパワーアップ！'];
        if (normal.revengeGames > 0) {
            const carry = normal.revengeCarry;
            return [carry && carry.wasSuper ? 'チャンス目でSUPERに戻れるよ！' : 'チャンス目でRASH復活だよ！', 'リベンジチャンス中！ チャンス目を引いて！'];
        }
        const next = config.map.loop[(normal.loopIndex + 1) % config.map.loop.length];
        const left = config.map.gamesPerMap - normal.gamesInMap;
        return [
            `次は${names[next]}だよ！ あと${left}G`,
            `SE城まで あとCP${Math.max(0, config.chancePoint.threshold - normal.chancePoint)}！`
        ];
    }
};
