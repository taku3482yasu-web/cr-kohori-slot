// =====================================================================
// RASH / BATTLE のロジック: 対戦相手の決定・ダメージ計算・「？？」・継続判定・撃破ボーナス
// ---------------------------------------------------------------------
// 状態の更新は GameFlow.handleRash (state.js) から呼び出す。
//
// 継続率は「セット」単位で先に決める (setWillWin)。
//   セット = BATTLE開始 (または「？？」からの継続) から、撃破 or 「？？」の結果まで。
//   勝ちセット: 撃破するか、「？？」で必ず柄が揃う
//   負けセット: 敵がガードしてダメージはHPが1残るまで、「？？」で揃わない
//     ただし 'kill' の役 (BAR揃い・7️⃣7️⃣7️⃣・7️⃣7️⃣BAR) はガードを崩して撃破できる
//     ブレイク状態 (チェリー揃いで一定確率) の間は敵がガードできない
//   → ガード崩し・ブレイクで勝ちになる分を見込んで、先決めの確率 (presetRate) は
//     目標の継続率 (continueRate) より低くしてある
// =====================================================================

const Battle = {
    findEnemy(config, enemyId) {
        if (enemyId === config.goldDog.id) return config.goldDog;
        return config.enemies.find(e => e.id === enemyId) || null;
    },

    isSuper(state) {
        return state.mode === MODES.SUPER_RASH;
    },

    // セット開始時に勝ちセットにする確率 (先決め)
    presetRate(state, config) {
        return this.isSuper(state) ? config.rash.super.presetRate : config.rash.normal.presetRate;
    },

    // ----- 抽選 (lottery.js から呼ばれる) -----
    // RASH 中の確率表 (柄揃い確率アップ中は、リプレイ以外の揃い役の確率を上げる)
    battleTable(state, config) {
        const base = config.lottery.battle;
        const rash = state.rash;
        if (rash.phase !== RASH_PHASES.BATTLE || rash.probUpGames <= 0) return base;
        const table = {};
        for (const [role, prob] of Object.entries(base)) {
            const boosted = role !== 'replay' && role !== 'chance' && role !== 'sevenBar';
            table[role] = boosted ? prob * rash.probUpMultiplier : prob;
        }
        // 合計が1を超える場合は比率を保って縮める
        const sum = Object.values(table).reduce((a, b) => a + b, 0);
        if (sum > 0.98) for (const role of Object.keys(table)) table[role] *= 0.98 / sum;
        return table;
    },

    // RASH 中の役を決める。セットの勝ち負けに合わせて出目を調整する
    drawRole(state, config, rng) {
        const rash = state.rash;
        const table = this.battleTable(state, config);

        if (rash.phase === RASH_PHASES.TREASURE) return Lottery.drawRole(config.treasure.lottery, rng);

        if (rash.phase === RASH_PHASES.QUESTION) {
            if (!rash.setWillWin) return 'miss';
            // 揃う役の中から確率表の比率で選ぶ (撃破役は紛らわしいので除く)
            const aligned = Object.keys(table).filter(role => role !== 'chance' && config.damage[role] !== 'kill');
            return Lottery.weightedPick(aligned, role => table[role], rng);
        }

        return Lottery.drawRole(table, rng);
    },

    // ----- 状態更新 -----
    // RASH の1ゲーム目 (撃破後の次のゲームも): 対戦相手と残りゲーム数を決めて BATTLE 開始
    startBattle(state, config, rng) {
        const rash = state.rash;
        const enemy = this.pickEnemy(state, config, rng);
        const baseGames = Lottery.weightedPick(config.rash.initialGames, g => g.weight, rng).games;
        const bonusGames = rash.bonusGames;
        rash.bonusGames = 0;
        rash.enemyId = enemy.id;
        rash.enemyHp = enemy.hp;
        rash.enemyMaxHp = enemy.hp;
        rash.gamesRemaining = baseGames + bonusGames;
        rash.goldDogFlag = enemy.id === config.goldDog.id;
        rash.breakActive = false;
        rash.setWillWin = rng() < this.presetRate(state, config);
        rash.phase = RASH_PHASES.BATTLE;
        return [{
            type: 'battleStart',
            enemyId: enemy.id,
            name: enemy.name,
            hp: enemy.hp,
            games: rash.gamesRemaining,
            bonusGames,
            isGoldDog: rash.goldDogFlag,
            isSuper: this.isSuper(state)
        }];
    },

    pickEnemy(state, config, rng) {
        const rash = state.rash;
        if (rash.nextForcedEnemy) {
            const forced = this.findEnemy(config, rash.nextForcedEnemy);
            rash.nextForcedEnemy = null;
            if (forced) return forced;
        }
        const isSuper = this.isSuper(state);
        // ゴールド金面犬は SUPER 中のみ、ごくまれに出現
        if (isSuper && rng() < config.goldDog.prob) return config.goldDog;
        const oniAvailable = rash.oniUnlocked || (isSuper && config.rash.superOniAlwaysAvailable);
        const candidates = config.enemies.filter(e => !e.requiresUnlock || oniAvailable);
        const weightKey = isSuper ? 'superWeight' : 'weight';
        return Lottery.weightedPick(candidates, e => e[weightKey], rng);
    },

    damageFor(role, config) {
        return config.damage[role] ?? 0;
    },

    // BATTLE 中の1ゲーム: ダメージ → 撃破 / 残り0Gで「？？」へ
    battleGame(state, outcome, config, rng) {
        const rash = state.rash;
        const events = [];
        rash.gamesRemaining--;
        if (rash.probUpGames > 0) rash.probUpGames--;

        const damage = this.damageFor(outcome.role, config);
        const kill = damage === 'kill';
        // 仲間の追加ダメージ (ダメージが入ったときだけ)
        const companionHits = !kill && damage > 0 ? Companions.extraDamage(state, config) : [];
        const extra = companionHits.reduce((sum, h) => sum + h.amount, 0);
        let amount = kill ? rash.enemyHp : damage + extra;
        // 負けセットでは敵がガードして倒しきれない (撃破役・ブレイク中を除く)
        const canGuard = !rash.setWillWin && !rash.breakActive && !kill;
        let guarded = false;
        if (canGuard && amount >= rash.enemyHp) {
            amount = rash.enemyHp - 1;
            guarded = true;
        }
        rash.enemyHp = Math.max(0, rash.enemyHp - amount);
        events.push({
            type: 'damage',
            role: outcome.role,
            amount,
            kill,
            guardBreak: kill && !rash.setWillWin,   // 本来ガードされるセットで撃破役を引いた
            big: kill || outcome.isChance,
            guarded,
            companionHits,
            breakActive: rash.breakActive,
            hp: rash.enemyHp,
            maxHp: rash.enemyMaxHp,
            gamesRemaining: rash.gamesRemaining,
            probUpGames: rash.probUpGames
        });

        if (rash.enemyHp <= 0) {
            events.push(...this.defeatEnemy(state, config));
            return events;
        }

        // チェリーなどで一定確率でブレイク状態に
        const brk = config.breakState;
        if (!rash.breakActive && brk.roles.includes(outcome.role) && rng() < brk.rate) {
            rash.breakActive = true;
            events.push({ type: 'break' });
        }

        if (rash.gamesRemaining <= 0) {
            rash.phase = RASH_PHASES.QUESTION;
            events.push({ type: 'question' });
        }
        return events;
    },

    // 撃破: ボーナス → おにおに出現 → SUPER 移行 / ゴールド金面犬撃破後はおにおに確定
    defeatEnemy(state, config) {
        const rash = state.rash;
        const enemy = this.findEnemy(config, rash.enemyId);
        rash.defeatCount++;
        rash.phase = RASH_PHASES.SELECT;
        rash.enemyId = null;
        rash.goldDogFlag = false;
        rash.breakActive = false;

        const bonus = this.applyBonus(state, enemy.bonus);
        if (enemy.nextForcedEnemy) rash.nextForcedEnemy = enemy.nextForcedEnemy;
        const forced = rash.nextForcedEnemy ? this.findEnemy(config, rash.nextForcedEnemy) : null;
        const events = [{
            type: 'defeat',
            enemyId: enemy.id,
            name: enemy.name,
            bonus,
            defeatCount: rash.defeatCount,
            nextForcedName: forced ? forced.name : null
        }];

        if (!rash.oniUnlocked && rash.defeatCount >= config.rash.oniUnlockDefeats) {
            rash.oniUnlocked = true;
            events.push({ type: 'oniUnlocked' });
        }

        if (enemy.id === 'onioni' && state.mode === MODES.RASH) {
            events.push(StateMachine.transition(state, MODES.SUPER_RASH));
            state.superCount++;
            events.push({ type: 'superStart' });
        }
        return events;
    },

    // 撃破ボーナスを反映し、内容を返す
    applyBonus(state, bonus) {
        const rash = state.rash;
        switch (bonus.type) {
            case 'coins':
                state.coins += bonus.value;
                state.totalCoinsWon += bonus.value;
                rash.coinsWon += bonus.value;
                break;
            case 'games':
                rash.bonusGames += bonus.value;   // 次の BATTLE のゲーム数に上乗せ
                break;
            case 'probUp':
                rash.probUpGames = bonus.games;
                rash.probUpMultiplier = bonus.value;
                break;
        }
        return { ...bonus };
    },

    // ----- 宝物庫ゾーン -----
    // BATTLE のゲームのあと (撃破して次の相手を決める前も含む) に一定確率で突入。「？？」のときは突入しない
    maybeStartTreasure(state, config, rng) {
        const rash = state.rash;
        const forced = rash.debugForceTreasure;
        rash.debugForceTreasure = false;
        if (rash.phase !== RASH_PHASES.BATTLE && rash.phase !== RASH_PHASES.SELECT) return [];
        if (!forced && rng() >= config.treasure.rate) return [];
        rash.treasureReturnPhase = rash.phase;
        rash.phase = RASH_PHASES.TREASURE;
        rash.treasureGames = config.treasure.games;
        rash.treasureTotal = 0;
        return [{ type: 'treasureStart', games: config.treasure.games }];
    },

    // 宝物庫ゾーンの1ゲーム: 揃った柄に応じて次の BATTLE のゲーム数を上乗せ
    treasureGame(state, outcome, config) {
        const rash = state.rash;
        const added = outcome.aligned ? (config.treasure.gamesByRole[outcome.role] || 0) : 0;
        rash.bonusGames += added;
        rash.treasureTotal += added;
        rash.treasureGames--;
        const events = [{ type: 'treasureGame', role: outcome.role, added, total: rash.treasureTotal, remaining: rash.treasureGames }];
        if (rash.treasureGames <= 0) events.push(...this.endTreasure(state));
        return events;
    },

    endTreasure(state) {
        const rash = state.rash;
        rash.phase = rash.treasureReturnPhase || RASH_PHASES.SELECT;
        rash.treasureReturnPhase = null;
        rash.treasureGames = 0;
        return [{ type: 'treasureEnd', total: rash.treasureTotal, bonusGames: rash.bonusGames }];
    },

    // ロングフリーズ (RASH / SUPER 中)
    //   RASH:  戦闘中の敵を完全撃破 → superRate で SUPER 直行、それ以外は次の相手がおにおに
    //   SUPER: 戦闘中の敵に勝利 → 次の相手がゴールド金面犬
    longFreeze(state, config, rng) {
        const rash = state.rash;
        const wasSuper = this.isSuper(state);
        const events = [{ type: 'freezeBonus', kind: wasSuper ? 'super' : 'rash' }];
        if (rash.phase === RASH_PHASES.TREASURE) events.push(...this.endTreasure(state));

        // 戦闘中なら完全撃破
        let defeat = null;
        if (rash.enemyId) {
            const amount = rash.enemyHp;
            rash.enemyHp = 0;
            events.push({
                type: 'damage', role: 'longFreeze', amount, kill: true, guardBreak: false, big: true, guarded: false,
                freeze: true, breakActive: rash.breakActive, hp: 0, maxHp: rash.enemyMaxHp,
                gamesRemaining: rash.gamesRemaining, probUpGames: rash.probUpGames
            });
            const defeatEvents = this.defeatEnemy(state, config);
            defeat = defeatEvents[0];
            events.push(...defeatEvents);
        }

        // 次の相手を確定させる (撃破時に決まった確定相手より優先)
        const forceNext = (enemyId) => {
            rash.nextForcedEnemy = enemyId;
            const name = this.findEnemy(config, enemyId).name;
            if (defeat) defeat.nextForcedName = name;
            else events.push({ type: 'nextForced', name });
        };

        if (wasSuper) {
            forceNext(config.goldDog.id);
        } else if (state.mode === MODES.RASH) {
            // おにおにを撃破して SUPER に移っていなければ、SUPER 直行の抽選
            if (rng() < config.longFreeze.superRate) {
                events.push(StateMachine.transition(state, MODES.SUPER_RASH));
                state.superCount++;
                events.push({ type: 'superStart' });
            } else {
                forceNext('onioni');
            }
        }
        return events;
    },

    // 「？？」のゲーム: 揃えば継続 (同じ相手・HPのまま新しいセット)、揃わなければ RASH 終了
    questionGame(state, outcome, config, rng) {
        const rash = state.rash;
        if (outcome.aligned) {
            const games = Lottery.weightedPick(config.rash.continueGames, g => g.weight, rng).games;
            rash.gamesRemaining = games;
            rash.setWillWin = rng() < this.presetRate(state, config);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'questionResult', continued: true, games }];
        }
        // 仲間の肩代わり: RASH を続ける
        const saver = Companions.trySave(state, config, rng);
        if (saver) {
            const games = Lottery.weightedPick(config.rash.continueGames, g => g.weight, rng).games;
            rash.gamesRemaining = games;
            rash.setWillWin = rng() < this.presetRate(state, config);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'companionSave', memberId: saver.id, name: saver.name, games }];
        }
        return [{ type: 'questionResult', continued: false }, ...GameFlow.endRash(state, config)];
    }
};
