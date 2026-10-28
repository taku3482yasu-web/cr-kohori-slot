// =====================================================================
// RASH / BATTLE のロジック: 対戦相手の決定・ダメージ計算・「？？」・継続判定・撃破ボーナス
// ---------------------------------------------------------------------
// 状態の更新は GameFlow.handleRash (state.js) から呼び出す。
//
// 継続は「セット」単位で決める (setWillWin)。
//   セット = BATTLE開始 (または「？？」からの継続) から、撃破 or 「？？」の結果まで。
//   勝ちセット: 撃破するか、「？？」で必ず柄が揃う
//   負けセット: 敵がガードしてダメージはHPが1残るまで、「？？」で揃わない
// 撃破率 (2026-10-27 ユーザー指定。rash.killRate 0〜1、液晶の右上に出す): セットを勝ちにする確率。
//   セットの始めはキャラごとの値 (enemy.killRate / superKillRate)。勝利確定の BATTLE は 100%。
//   強い役・チャンス目 (config.killRate.add)・ブレイク・長押しのチャージで上がり、'kill' の役 (BAR揃い・7️⃣7️⃣7️⃣・7️⃣7️⃣BAR) で 100%。
//   上がったぶんだけ、負けセットを勝ちセットに変える抽選をする ((新 - 旧) / (1 - 旧))。
//   こうすると、どの時点でも「表示している撃破率 = そのセットを勝つ確率」になる
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

    // セットの始めの撃破率 (キャラごと。SUPER は superKillRate)。勝利確定の BATTLE は 100%
    baseKillRate(state, config, enemy) {
        if (state.rash.winGuaranteed) return 1;
        const rate = this.isSuper(state) ? enemy.superKillRate : enemy.killRate;
        return this.safeRate(Math.max(0, Math.min(1, rate ?? 0)));
    },

    // 7% / 77% は 違和感演出 (撃破 確定) だけで 見せるので、ふつうの 撃破率が そう なるときは 8% / 78% に ずらす
    safeRate(rate) {
        const pct = Math.round(rate * 100);
        return pct === 7 || pct === 77 ? (pct + 1) / 100 : rate;
    },

    // 勝ちの セットに なったときの 見せ方: 違和感演出 (7% / 77%) と 敵の 名前の 色 (赤字 / 金字)
    dressWin(state, config, rng) {
        const rash = state.rash, kr = config.killRate;
        if (rash.killRate >= 1) {
            rash.shownRate = null;
            rash.nameColor = 'gold';
            return;
        }
        if (rash.shownRate == null && rng() < kr.fake.rate) rash.shownRate = kr.fake.values[Math.floor(rng() * kr.fake.values.length)];
        if (rash.nameColor === 'white') {
            const r = rng();
            rash.nameColor = r < kr.nameColors.gold ? 'gold' : r < kr.nameColors.gold + kr.nameColors.red ? 'red' : 'white';
        }
    },

    // 新しいセットを始める: 撃破率をキャラの値にし、その確率で勝ちセットにする
    startSet(state, config, rng) {
        const rash = state.rash;
        rash.killRate = this.baseKillRate(state, config, this.findEnemy(config, rash.enemyId));
        rash.setWillWin = rng() < rash.killRate || rash.killRate >= 1;
        rash.shownRate = null;     // 見せて いる 撃破率 (違和感演出の 7% / 77%。null は 本当の 値)
        rash.nameColor = 'white';  // 敵の 名前の 色
        if (rash.setWillWin) this.dressWin(state, config, rng);
    },

    // 撃破率を to に上げる (上限 100%)。負けセットなら、上がったぶんの確率で勝ちセットに変える。
    //   reason: 上がったわけ (役の名前 / 'break' / 'charge' / 'kill' / 'finalBlow')。上がらなければ null
    raiseKillRate(state, to, reason, rng, config) {
        const rash = state.rash;
        const from = rash.killRate ?? 0;
        to = this.safeRate(Math.min(1, to));
        if (to <= from) return null;
        const won = !rash.setWillWin && (to >= 1 || rng() < (to - from) / (1 - from));
        if (won) rash.setWillWin = true;
        rash.killRate = to;
        if (won || to >= 1) this.dressWin(state, config, rng);
        // shown: 見せる 撃破率 (違和感演出の 7% / 77% の あいだは それ)、nameColor: 敵の 名前の 色
        return { type: 'killRate', from, to, reason, shown: rash.shownRate, nameColor: rash.nameColor || 'white' };
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
        this.startSet(state, config, rng);
        rash.phase = RASH_PHASES.BATTLE;
        return [{
            type: 'battleStart',
            killRate: rash.killRate,
            shown: rash.shownRate,
            nameColor: rash.nameColor,
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

        // チェリー・チャンス目などで一定確率でブレイク状態に (撃破率 UP。2026-10-27 から ガードできない かわりに 撃破率が 上がる)
        const breakRate = config.breakState.rates[outcome.role] || 0;
        const broke = !rash.breakActive && breakRate > 0 && rng() < breakRate;
        if (broke) {
            rash.breakActive = true;
            events.push({ type: 'break' });
        }

        const damage = this.damageFor(outcome.role, config);
        const kill = damage === 'kill';
        // 撃破率 (2026-10-27): 役・ブレイクで上げる。撃破役は 100% (長押しのチャージは PUSH のあと。GameFlow.applyBattleCharge)
        const kr = config.killRate;
        const wasWinning = rash.setWillWin;
        const add = (kr.add[outcome.role] || 0) + (broke ? kr.breakAdd : 0);
        const reason = kill ? 'kill' : broke ? 'break' : outcome.role;
        const up = this.raiseKillRate(state, kill ? 1 : (rash.killRate ?? 0) + add, reason, rng, config);
        if (up) events.push(up);
        // 仲間の追加ダメージ (ダメージが入ったときだけ)
        let companionHits = !kill && damage > 0 ? Companions.extraDamage(state, config) : [];
        const extra = companionHits.reduce((sum, h) => sum + h.amount, 0);
        const hpBefore = rash.enemyHp;
        let amount = kill ? rash.enemyHp : damage + extra;
        // 負けセットでは敵がガードして倒しきれない
        const canGuard = !rash.setWillWin && !kill;
        let guarded = false;
        let finalBlow = false;
        // デバッグ「次:とどめの一撃」: 対象の役が出たら、HP・セットに関係なくガード → とどめの一撃
        const forceBlow = rash.debugForceFinalBlow && !kill && outcome.role in config.finalBlow.rates;
        if (forceBlow) rash.debugForceFinalBlow = false;
        if (forceBlow || (canGuard && amount >= rash.enemyHp)) {
            guarded = true;
            // とどめの一撃: ガードで HP1 残ったところへ、ガード無視の 1 ダメージ
            finalBlow = forceBlow || rng() < (config.finalBlow.rates[outcome.role] || 0);
            if (finalBlow) {
                companionHits = [];
                const fb = this.raiseKillRate(state, 1, 'finalBlow', rng, config);   // とどめの一撃は 撃破率 100%
                if (fb) events.push(fb);
            }
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
            guardBreak: kill && !wasWinning,   // 本来ガードされるセットで撃破役を引いた
            killRate: rash.killRate,
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

    // 宝物庫ゾーンの終わり (2026-10-28 ユーザー指定):
    //   BATTLE に戻って 撃破が 確定して いない (負けセット = このままだと「？？」で RASH が 終わる) ときは、
    //   上乗せした ゲーム数を いまの BATTLE の 残りゲーム数に 足す (now)。
    //   撃破後 (SELECT に戻る)・撃破が 確定 (勝ちセット)・ロングフリーズでの 撃破 は、次の BATTLE の 開始時に 足す
    endTreasure(state) {
        const rash = state.rash;
        rash.phase = rash.treasureReturnPhase || RASH_PHASES.SELECT;
        rash.treasureReturnPhase = null;
        rash.treasureGames = 0;
        const now = rash.phase === RASH_PHASES.BATTLE && rash.enemyId && !rash.setWillWin && rash.bonusGames > 0;
        if (now) {
            rash.gamesRemaining += rash.bonusGames;
            rash.bonusGames = 0;
        }
        return [{ type: 'treasureEnd', total: rash.treasureTotal, bonusGames: rash.bonusGames, now, gamesRemaining: rash.gamesRemaining }];
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
            this.startSet(state, config, rng);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'questionResult', continued: true, games, killRate: rash.killRate, shown: rash.shownRate, nameColor: rash.nameColor }, ...this.addStreak(state, config)];
        }
        // 仲間の肩代わり: RASH を続ける
        const saver = forceRevival ? null : Companions.trySave(state, config, rng);
        if (saver) {
            const games = Lottery.weightedPick(config.rash.continueGames, g => g.weight, rng).games;
            rash.gamesRemaining = games;
            this.startSet(state, config, rng);
            rash.phase = RASH_PHASES.BATTLE;
            return [{ type: 'companionSave', memberId: saver.id, name: saver.name, games, enemyId: rash.enemyId, killRate: rash.killRate, shown: rash.shownRate, nameColor: rash.nameColor }, ...this.addStreak(state, config)];
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
        // 復活の撃破は 撃破率 777% の演出 (2026-10-27 ユーザー指定。表示だけ)
        return [{ type: 'revival', enemyId: rash.enemyId, amount, killRate: config.killRate.revivalShow }, ...this.defeatEnemy(state, config, rng)];
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
