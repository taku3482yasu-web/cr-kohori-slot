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
        if (rash.phase === RASH_PHASES.TOKKA) return Lottery.drawRole(config.tokka.lottery, rng);

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
        rash.battleIntro = true;
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
        // おにおには連数で決まる確率で先に抽選し、外れたらほかの敵を重みで選ぶ
        if (rng() < this.oniRate(state, config)) return this.findEnemy(config, 'onioni');
        const others = config.enemies.filter(e => e.id !== 'onioni');
        const weightKey = isSuper ? 'superWeight' : 'weight';
        return Lottery.weightedPick(others, e => e[weightKey], rng);
    },

    // おにおにが相手に選ばれる確率 (ユーザー指定 2026-10-23: RASH が続くほど上がり、10連で 50%、それ以降はずっと 50%)
    //   候補に入っていなければ 0。入った連数 (unlockStreak) では重みどおりの確率 (約13%) で、
    //   そこから maxStreak 連までまっすぐ上げて maxRate にする。SUPER 中は連数で変わらない (ユーザー指定。重みどおりの約14%)
    oniRate(state, config) {
        const rash = state.rash;
        const isSuper = this.isSuper(state);
        const oniAvailable = rash.oniUnlocked || (isSuper && config.rash.superOniAlwaysAvailable);
        if (!oniAvailable) return 0;
        const cfg = config.rash.oni;
        const weightKey = isSuper ? 'superWeight' : 'weight';
        const total = config.enemies.reduce((sum, e) => sum + e[weightKey], 0);
        const base = this.findEnemy(config, 'onioni')[weightKey] / total;
        if (isSuper) return base;
        if (rash.streak >= cfg.maxStreak) return cfg.maxRate;
        if (rash.streak <= cfg.unlockStreak) return base;
        return base + (cfg.maxRate - base) * (rash.streak - cfg.unlockStreak) / (cfg.maxStreak - cfg.unlockStreak);
    },

    // 1連 (セットを勝った): 連数を数え、おにおにの出現を見る
    addStreak(state, config) {
        const rash = state.rash;
        rash.streak++;
        return [{ type: 'streak', streak: rash.streak }, ...this.checkOniUnlock(state, config)];
    },

    damageFor(role, config) {
        return config.damage[role] ?? 0;
    },

    // BATTLE 中の1ゲーム: ダメージ → 撃破 / 残り0Gで「？？」へ
    battleGame(state, outcome, config, rng) {
        const rash = state.rash;
        const events = [];
        rash.battleIntro = false;
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
        let finalBlow = false;
        // デバッグ「次:とどめの一撃」: 対象の役が出たら、HP・セットに関係なくガード → とどめの一撃
        const forceBlow = rash.debugForceFinalBlow && !kill && outcome.role in config.finalBlow.rates;
        if (forceBlow) rash.debugForceFinalBlow = false;
        if (forceBlow || (canGuard && amount >= rash.enemyHp)) {
            guarded = true;
            // とどめの一撃: ガードで HP1 残ったところへ、ガード無視の 1 ダメージ
            finalBlow = forceBlow || rng() < (config.finalBlow.rates[outcome.role] || 0);
            if (finalBlow) companionHits = [];
            amount = finalBlow ? rash.enemyHp : rash.enemyHp - 1;
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
            finalBlow,
            companionHits,
            finishBy: rash.enemyHp <= 0 ? this.finisherOf(kill || finalBlow, damage, companionHits, hpBefore) : null,
            finishKill: kill && rash.enemyHp <= 0,
            breakActive: rash.breakActive,
            hp: rash.enemyHp,
            maxHp: rash.enemyMaxHp,
            gamesRemaining: rash.gamesRemaining,
            probUpGames: rash.probUpGames
        });

        if (rash.enemyHp <= 0) {
            events.push(...this.defeatEnemy(state, config, rng));
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

    // 連数でおにおにが対戦相手の候補に入る
    checkOniUnlock(state, config) {
        const rash = state.rash;
        // SUPER 中はおにおにが常に対戦相手の候補に入っているので、「おにおにが現れる…!?」は出さない
        if (state.mode === MODES.SUPER_RASH && config.rash.superOniAlwaysAvailable) return [];
        if (rash.oniUnlocked || rash.streak < config.rash.oni.unlockStreak) return [];
        rash.oniUnlocked = true;
        return [{ type: 'oniUnlocked' }];
    },

    // 撃破: ボーナス → 連数 (おにおに出現・10連のおにおに確定) → SUPER 移行 → 上乗せ特化ゾーン
    // ゴールド金面犬撃破後はおにおに確定
    defeatEnemy(state, config, rng = Math.random) {
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

        events.push(...this.addStreak(state, config));

        // SUPER 中におにおにを撃破: ともいし救出のエンディング (SUPER 1回につき1回)
        if (enemy.id === 'onioni' && state.mode === MODES.SUPER_RASH && !rash.endingShown) {
            rash.endingShown = true;
            events.push({ type: 'ending' });
        }

        if (enemy.id === 'onioni' && state.mode === MODES.RASH) {
            events.push(StateMachine.transition(state, MODES.SUPER_RASH));
            state.superCount++;
            events.push({ type: 'superStart' });
        }
        events.push(...this.maybeStartTokka(state, config, enemy.id, rng));
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

    // 突入: 仲間抽選 → シーシャ・ナイテイ・ナイナイと games ゲームの真剣勝負。突破は1ゲームごとに出目で抽選 (winRates)
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
        rash.battleIntro = true;
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
        rash.battleIntro = false;
        if (rash.debugForceAruaru) rash.gamesRemaining = 1;   // デバッグ「次の内定の時で復活」: このゲームで負けてアルアルが出る
        rash.gamesRemaining--;
        const finisher = !rash.debugForceAruaru && rng() < (config.naitei.winRates[outcome.role] || 0);
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
        if (rash.enemyHp <= 0) events.push(...this.endNaitei(state, config, true, rng));
        else if (rash.gamesRemaining <= 0) events.push(...this.endNaitei(state, config, false, rng));
        return events;
    },

    // ゾーンの結果
    //   突破: 撃破ボーナス、おにおにRASH なら SUPER へ
    //   失敗: おにおにRASH なら RASH 終了 → 城突入チャレンジ、SUPER なら次の相手を決め直して継続
    endNaitei(state, config, win, rng = Math.random) {
        const rash = state.rash;
        const enemy = config.naitei.enemy;
        // 敗北したときの復活: 兄のアルアルが現れてナイナイを一撃で倒す (突破と同じ扱い)
        const forceAruaru = Boolean(rash.debugForceAruaru);
        rash.debugForceAruaru = false;
        if (!win && (forceAruaru || rng() < config.naitei.aruaru.rate)) {
            rash.enemyHp = 0;
            const events = this.endNaitei(state, config, true, rng);
            events[0].aruaru = true;
            return events;
        }
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
            events.push(...this.addStreak(state, config));
            if (state.mode === MODES.RASH) {
                events.push(StateMachine.transition(state, MODES.SUPER_RASH));
                state.superCount++;
                events.push({ type: 'superStart' });
            }
            events.push(...this.maybeStartTokka(state, config, enemy.id, rng));
            return events;
        }

        const toCastle = state.mode === MODES.RASH;
        const trophy = toCastle ? GameFlow.pickTrophy(state, config, rng) : null;
        const endCard = toCastle ? EndCard.pick(config, state.setting, rng) : null;
        const events = [{
            type: 'naiteiResult', win: false, name: enemy.name, toCastle,
            coinsWon: rash.coinsWon, defeatCount: rash.defeatCount, trophy, endCard
        }];
        if (toCastle) events.push(...GameFlow.returnToCastle(state, config, trophy, endCard));
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
                ...this.endNaitei(state, config, true, rng)
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
            const defeatEvents = this.defeatEnemy(state, config, rng);
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
        // デバッグ「次の？？で復活」: 必ず負けて、肩代わりなしで復活待ちに
        const forceRevival = Boolean(rash.debugForceRevival);
        rash.debugForceRevival = false;
        if (outcome.aligned && !forceRevival) {
            const games = Lottery.weightedPick(config.rash.continueGames, g => g.weight, rng).games;
            rash.gamesRemaining = games;
            rash.setWillWin = rash.winGuaranteed || rng() < this.presetRate(state, config);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'questionResult', continued: true, games }, ...this.addStreak(state, config)];
        }
        // 仲間の肩代わり: RASH を続ける
        const saver = forceRevival ? null : Companions.trySave(state, config, rng);
        if (saver) {
            const games = Lottery.weightedPick(config.rash.continueGames, g => g.weight, rng).games;
            rash.gamesRemaining = games;
            rash.setWillWin = rash.winGuaranteed || rng() < this.presetRate(state, config);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'companionSave', memberId: saver.id, name: saver.name, games, enemyId: rash.enemyId }, ...this.addStreak(state, config)];
        }
        // 復活: 液晶は RASH 終了に見せたまま止まり、次のゲームで戦っていた敵を撃破して継続
        if (forceRevival || rng() < this.revivalRate(state, config)) {
            rash.phase = RASH_PHASES.REVIVAL;
            return [{ type: 'questionResult', continued: false, enemyId: rash.enemyId, revival: true }];
        }
        return [{ type: 'questionResult', continued: false, enemyId: rash.enemyId }, ...GameFlow.endRash(state, config, rng)];
    },

    revivalRate(state, config) {
        return config.revival.rates[state.mode] || 0;
    },

    // 復活のゲーム: 戦っていた敵を撃破して RASH 継続 (出目に関係なく)
    revivalGame(state, config, rng = Math.random) {
        const rash = state.rash;
        const amount = rash.enemyHp;
        rash.enemyHp = 0;
        return [{ type: 'revival', enemyId: rash.enemyId, amount }, ...this.defeatEnemy(state, config, rng)];
    },

    // ----- 上乗せ特化ゾーン (config.tokka) -----
    // 撃破のあとに突入を抽選する (おにおには確定。ほかは trigger の確率)
    maybeStartTokka(state, config, enemyId, rng = Math.random) {
        const trigger = config.tokka.trigger;
        const rate = trigger[enemyId] ?? trigger.others;
        if (rng() >= rate) return [];
        return this.startTokka(state, config, enemyId, rng);
    },

    // 突入: 次のゲームから games ゲーム。終わったら tokkaReturnPhase へ戻る
    // 見せ方 (kind) はプレイヤーが液晶で選ぶ (chooseTokka)。選ぶまでは前に選んだもの (はじめは kinds の先頭) にしておく。
    // choose: 選ぶ画面を出すか (デバッグで見せ方を指定したときは出さない)
    startTokka(state, config, source, rng = Math.random, kind = null) {
        const cfg = config.tokka;
        const rash = state.rash;
        const choose = !kind;
        if (!kind) kind = cfg.kinds.includes(state.tokkaLastKind) ? state.tokkaLastKind : cfg.kinds[0];
        rash.tokkaReturnPhase = rash.phase === RASH_PHASES.BATTLE ? RASH_PHASES.BATTLE : RASH_PHASES.SELECT;
        rash.phase = RASH_PHASES.TOKKA;
        // ASAHARA CHANCE で集まる順 (先に来るのは SASAKI か KOTANI のどちらか)
        const members = rng() < 0.5 ? ['sasaki', 'kotani'] : ['kotani', 'sasaki'];
        rash.tokka = { kind, games: cfg.games, remaining: cfg.games, total: 0, tier: 0, members };
        return [{ type: 'tokkaStart', kind, choose, source, games: cfg.games, min: cfg.min, max: cfg.max, members }];
    },

    // プレイヤーが選んだ見せ方にする (まだ1ゲームも回していないときだけ)。上乗せの確率はどれも同じ
    chooseTokka(state, config, kind) {
        const t = StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.TOKKA ? state.rash.tokka : null;
        if (!t || t.remaining !== t.games || !config.tokka.kinds.includes(kind)) return false;
        t.kind = kind;
        state.tokkaLastKind = kind;
        return true;
    },

    // 1ゲーム: 役に応じて上乗せ (合計は max まで)。ASAHARA CHANCE は合計が tiers に届いたら告知
    tokkaGame(state, outcome, config, rng = Math.random) {
        const cfg = config.tokka;
        const rash = state.rash;
        const t = rash.tokka;
        const table = cfg.addTable[outcome.role] || cfg.addTable.miss;
        const drawn = Number(Lottery.weightedPick(Object.keys(table), k => table[k], rng));
        const add = Math.min(drawn, cfg.max - t.total);
        t.total += add;
        t.remaining--;
        const tier = cfg.tiers.filter(v => t.total >= v).length;
        const flash = t.kind === 'asahara' && tier > t.tier ? { from: t.tier, to: tier, arrive: t.members.slice(t.tier, tier) } : null;
        t.tier = tier;
        const events = [{
            type: 'tokkaGame', kind: t.kind, role: outcome.role, add, total: t.total, remaining: t.remaining,
            max: t.total >= cfg.max, flash, guaranteed: flash ? cfg.tiers[tier - 1] : null
        }];
        if (t.remaining <= 0) events.push(...this.endTokka(state, config));
        return events;
    },

    // 終了: 合計 (min 枚保障) をまとめて払い出し、BATTLE に戻る
    endTokka(state, config) {
        const cfg = config.tokka;
        const rash = state.rash;
        const t = rash.tokka;
        const coins = Math.max(cfg.min, t.total);
        this.applyBonus(state, { type: 'coins', value: coins });
        rash.phase = rash.tokkaReturnPhase || RASH_PHASES.SELECT;
        rash.tokkaReturnPhase = null;
        rash.tokka = null;
        return [{ type: 'tokkaEnd', kind: t.kind, name: cfg.names[t.kind], total: t.total, coins, guaranteed: t.total < cfg.min, members: t.members.slice(0, t.tier) }];
    }
};
