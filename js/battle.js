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
//     ブレイク状態 (チェリー揃い・チャンス目で一定確率) の間は敵がガードできない
//   → ガード崩し・ブレイクで勝ちになる分を見込んで、先決めの確率 (presetRate) は
//     目標の継続率 (continueRate) より低くしてある
// =====================================================================

const Battle = {
    findEnemy(config, enemyId) {
        if (enemyId === config.goldDog.id) return config.goldDog;
        if (enemyId === config.naitei.enemy.id) return config.naitei.enemy;
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

        // デバッグ「次:内定の時」: 対戦相手を決めるゲームで実際に 7揃いを出して突入させる
        if (rash.phase === RASH_PHASES.SELECT && rash.debugForceNaitei) {
            rash.debugForceNaitei = false;
            return config.naitei.triggerRoles[0];
        }

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
        rash.setWillWin = rash.winGuaranteed || rng() < this.presetRate(state, config);
        rash.phase = RASH_PHASES.BATTLE;
        return [{
            type: 'battleStart',
            winGuaranteed: rash.winGuaranteed,
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

        // チェリー・チャンス目などで一定確率でブレイク状態に (この攻撃からガードできない)
        const breakRate = config.breakState.rates[outcome.role] || 0;
        if (!rash.breakActive && breakRate > 0 && rng() < breakRate) {
            rash.breakActive = true;
            events.push({ type: 'break' });
        }

        const damage = this.damageFor(outcome.role, config);
        const kill = damage === 'kill';
        // 仲間の追加ダメージ (ダメージが入ったときだけ)
        let companionHits = !kill && damage > 0 ? Companions.extraDamage(state, config) : [];
        const extra = companionHits.reduce((sum, h) => sum + h.amount, 0);
        const hpBefore = rash.enemyHp;
        let amount = kill ? rash.enemyHp : damage + extra;
        // 負けセットでは敵がガードして倒しきれない (撃破役・ブレイク中を除く)
        const canGuard = !rash.setWillWin && !rash.breakActive && !kill;
        let guarded = false;
        if (canGuard && amount >= rash.enemyHp) {
            amount = rash.enemyHp - 1;
            guarded = true;
        } else if (!kill && amount > rash.enemyHp) {
            companionHits = this.trimFinishingHits(companionHits, damage, rash.enemyHp);
            amount = rash.enemyHp;
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
            finishBy: rash.enemyHp <= 0 ? this.finisherOf(kill, damage, companionHits, hpBefore) : null,
            finishKill: kill && rash.enemyHp <= 0,
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

        if (rash.gamesRemaining <= 0) {
            rash.phase = RASH_PHASES.QUESTION;
            events.push({ type: 'question' });
        }
        return events;
    },

    // とどめを刺したのは誰か: 'koori' か仲間の id (こおりくん → 仲間の順に攻撃する)
    finisherOf(kill, damage, companionHits, hpBefore) {
        if (kill || damage >= hpBefore) return 'koori';
        const last = companionHits.filter(h => h.amount > 0).pop();
        return last ? last.id : 'koori';
    },

    // とどめ: 残りHPを超える分は切り捨てる (こおりくん → 仲間の順に、残りHPまでしか入らない)
    trimFinishingHits(companionHits, damage, hp) {
        let left = hp - Math.min(damage, hp);
        return companionHits
            .map(h => {
                const hit = { ...h, amount: Math.min(h.amount, left) };
                left -= hit.amount;
                return hit;
            })
            .filter(h => h.amount > 0);
    },

    // 撃破数でおにおにが対戦相手の候補に入る
    checkOniUnlock(state, config) {
        const rash = state.rash;
        if (rash.oniUnlocked || rash.defeatCount < config.rash.oniUnlockDefeats) return [];
        rash.oniUnlocked = true;
        return [{ type: 'oniUnlocked' }];
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
        rash.winGuaranteed = false;

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

        events.push(...this.checkOniUnlock(state, config));

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
        // 揃った柄・チャンス目に応じて上乗せ (ハズレは0)
        const added = config.treasure.gamesByRole[outcome.role] || 0;
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

    // ----- 内定の時ゾーン -----
    // SELECT のゲームで 7揃い・7・7・BAR が揃ったら突入 (対戦相手の抽選より優先。確定済みの次の相手はゾーン後に持ち越す)
    // 揃っていないときは突入しない (デバッグボタンも drawRole で 7揃いを出す)
    isNaiteiTrigger(state, outcome, config) {
        return config.naitei.triggerRoles.includes(outcome.role);
    },

    // 1ゲームあたりの突破の当選確率 (RASH 中の確率表 × 役ごとの winRates)
    naiteiGameWinRate(config) {
        const table = config.lottery.battle;
        const rates = config.naitei.winRates;
        const missProb = 1 - Object.values(table).reduce((a, b) => a + b, 0);
        return Object.entries(table).reduce((sum, [role, p]) => sum + p * (rates[role] || 0), missProb * (rates.miss || 0));
    },

    // ゾーン全体の突破率 (games ゲームのどこかで突破が当たる確率)
    naiteiWinRate(config) {
        return 1 - Math.pow(1 - this.naiteiGameWinRate(config), config.naitei.games);
    },

    // 突入: 仲間抽選 → シーシャ・ナイテイ・ナイナイと games ゲームの1対1。突破は1ゲームごとに出目で抽選 (winRates)
    startNaitei(state, config, rng) {
        const cfg = config.naitei;
        const rash = state.rash;
        const companions = Companions.naiteiDraw(state, config, rng);
        rash.phase = RASH_PHASES.NAITEI;
        rash.enemyId = cfg.enemy.id;
        rash.enemyHp = cfg.enemy.hp;
        rash.enemyMaxHp = cfg.enemy.hp;
        rash.gamesRemaining = cfg.games;
        rash.goldDogFlag = false;
        rash.breakActive = false;
        return [{
            type: 'naiteiStart',
            enemyId: cfg.enemy.id,
            name: cfg.enemy.name,
            hp: cfg.enemy.hp,
            games: cfg.games,
            winRate: this.naiteiWinRate(config),
            companions,
            isSuper: this.isSuper(state)
        }];
    },

    // ゾーンの1ゲーム: 出目に応じて突破を抽選。当たれば HP に関係なく「とどめ」で撃破、
    // 外れればふつうのダメージ (倒しきれる量でも HP1 でガードされる)
    naiteiGame(state, outcome, config, rng) {
        const rash = state.rash;
        rash.gamesRemaining--;
        const finisher = rng() < (config.naitei.winRates[outcome.role] || 0);
        const damage = this.damageFor(outcome.role, config);
        const kill = finisher;
        let companionHits = !finisher && damage !== 'kill' && damage > 0 ? Companions.extraDamage(state, config) : [];
        let amount = finisher ? rash.enemyHp
            : damage === 'kill' ? rash.enemyHp : damage + companionHits.reduce((sum, h) => sum + h.amount, 0);
        let guarded = false;
        if (!finisher && amount >= rash.enemyHp) {
            amount = rash.enemyHp - 1;
            companionHits = [];
            guarded = true;
        }
        rash.enemyHp = Math.max(0, rash.enemyHp - amount);
        const events = [{
            type: 'damage',
            role: outcome.role,
            amount,
            kill,
            guardBreak: false,
            big: kill || outcome.isChance,
            guarded,
            finisher,
            finishBy: finisher ? 'koori' : null,
            finishKill: finisher && damage === 'kill',
            companionHits,
            breakActive: false,
            hp: rash.enemyHp,
            maxHp: rash.enemyMaxHp,
            gamesRemaining: rash.gamesRemaining,
            probUpGames: rash.probUpGames
        }];
        if (rash.enemyHp <= 0) events.push(...this.endNaitei(state, config, true));
        else if (rash.gamesRemaining <= 0) events.push(...this.endNaitei(state, config, false, rng));
        return events;
    },

    // ゾーンの結果
    //   突破: 撃破ボーナス、おにおにRASH なら SUPER へ
    //   失敗: おにおにRASH なら RASH 終了 → 城突入チャレンジ、SUPER なら次の相手を決め直して継続
    endNaitei(state, config, win, rng = Math.random) {
        const rash = state.rash;
        const enemy = config.naitei.enemy;
        rash.phase = RASH_PHASES.SELECT;
        rash.enemyId = null;
        rash.gamesRemaining = 0;
        rash.breakActive = false;

        if (win) {
            rash.defeatCount++;
            rash.winGuaranteed = config.naitei.winNextBattle;
            const bonus = this.applyBonus(state, enemy.bonus);
            const events = [{
                type: 'naiteiResult', win: true, name: enemy.name, bonus, defeatCount: rash.defeatCount,
                winNextBattle: rash.winGuaranteed
            }];
            events.push(...this.checkOniUnlock(state, config));
            if (state.mode === MODES.RASH) {
                events.push(StateMachine.transition(state, MODES.SUPER_RASH));
                state.superCount++;
                events.push({ type: 'superStart' });
            }
            return events;
        }

        const toCastle = state.mode === MODES.RASH;
        const trophy = toCastle ? GameFlow.pickTrophy(state, config, rng) : null;
        const events = [{
            type: 'naiteiResult', win: false, name: enemy.name, toCastle,
            coinsWon: rash.coinsWon, defeatCount: rash.defeatCount, trophy
        }];
        if (toCastle) events.push(...GameFlow.returnToCastle(state, config, trophy));
        return events;
    },

    // ロングフリーズ (RASH / SUPER 中)
    //   RASH:  戦闘中の敵を完全撃破 → superRate で SUPER 直行、それ以外は次の相手がおにおに
    //   SUPER: 戦闘中の敵に勝利 → 次の相手がゴールド金面犬
    //   宝物庫ゾーン中: 戦闘中の敵を完全撃破 → 次の BATTLE +freezeBonusGames、SUPER 突入、次の相手がゴールド金面犬
    //   内定の時ゾーン中: シーシャ・ナイテイ・ナイナイを完全撃破 → 突破
    longFreeze(state, config, rng) {
        const rash = state.rash;
        if (rash.phase === RASH_PHASES.NAITEI) {
            const amount = rash.enemyHp;
            rash.enemyHp = 0;
            return [
                { type: 'freezeBonus', kind: 'naitei', games: 0 },
                {
                    type: 'damage', role: 'longFreeze', amount, kill: true, guardBreak: false, big: true, guarded: false,
                    freeze: true, breakActive: false, hp: 0, maxHp: rash.enemyMaxHp,
                    gamesRemaining: rash.gamesRemaining, probUpGames: rash.probUpGames
                },
                ...this.endNaitei(state, config, true)
            ];
        }
        const wasSuper = this.isSuper(state);
        const inTreasure = rash.phase === RASH_PHASES.TREASURE;
        const events = [{
            type: 'freezeBonus',
            kind: inTreasure ? 'treasure' : wasSuper ? 'super' : 'rash',
            games: inTreasure ? config.treasure.freezeBonusGames : 0
        }];
        if (inTreasure) events.push(...this.endTreasure(state));

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

        if (inTreasure) {
            rash.bonusGames += config.treasure.freezeBonusGames;
            events.push({ type: 'bonusGames', bonusGames: rash.bonusGames });
            if (state.mode === MODES.RASH) {
                events.push(StateMachine.transition(state, MODES.SUPER_RASH));
                state.superCount++;
                events.push({ type: 'superStart' });
            }
            forceNext(config.goldDog.id);
        } else if (wasSuper) {
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
            rash.setWillWin = rash.winGuaranteed || rng() < this.presetRate(state, config);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'questionResult', continued: true, games }];
        }
        // 仲間の肩代わり: RASH を続ける
        const saver = Companions.trySave(state, config, rng);
        if (saver) {
            const games = Lottery.weightedPick(config.rash.continueGames, g => g.weight, rng).games;
            rash.gamesRemaining = games;
            rash.setWillWin = rash.winGuaranteed || rng() < this.presetRate(state, config);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'companionSave', memberId: saver.id, name: saver.name, games, enemyId: rash.enemyId }];
        }
        return [{ type: 'questionResult', continued: false, enemyId: rash.enemyId }, ...GameFlow.endRash(state, config, rng)];
    }
};
