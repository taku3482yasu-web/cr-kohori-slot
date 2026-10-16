// =====================================================================
// 状態管理: ゲームの状態 (モード・マップ・フラグ) と状態遷移
// ---------------------------------------------------------------------
// 1ゲームの流れ:
//   main.js がリールを回して出目 (outcome) を確定
//   → GameFlow.onGameEnd(state, outcome) が状態を更新し、起きたことを events として返す
//   → lcd.js / ui.js が events を見て演出・表示を行う
// 状態の更新はこのファイル (と battle.js) だけで行い、演出側は state を書き換えない。
// =====================================================================

const MODES = Object.freeze({
    NORMAL: 'NORMAL',                     // 通常時 (通学路 / 遠賀川 / 恵比寿町 / SE城前)
    CASTLE_CHALLENGE: 'CASTLE_CHALLENGE', // 城突入チャレンジ (5ゲーム)
    RASH: 'RASH',                         // おにおにRASH
    SUPER_RASH: 'SUPER_RASH'              // SUPERおにおにRASH
});

// RASH / SUPER_RASH 中のフェーズ
const RASH_PHASES = Object.freeze({
    SELECT: 'SELECT',     // 1ゲーム目: 対戦相手と残りゲーム数を決定
    BATTLE: 'BATTLE',     // BATTLE中
    QUESTION: 'QUESTION', // 残りゲーム数「？？」: 揃えば継続、揃わなければ終了
    TREASURE: 'TREASURE', // 宝物庫ゾーン: BATTLE を中断し、揃った柄で次の BATTLE のゲーム数を上乗せ
    NAITEI: 'NAITEI'      // 内定の時ゾーン: SELECT で 7揃い・7・7・BAR → シーシャ・ナイテイ・ナイナイと1対1
});

const MODE_LABELS = {
    NORMAL: '通常時',
    CASTLE_CHALLENGE: '城突入チャレンジ',
    RASH: 'おにおにRASH',
    SUPER_RASH: 'SUPERおにおにRASH'
};

// 許可する遷移 (これ以外の遷移はエラーにする)
const ALLOWED_TRANSITIONS = {
    NORMAL: ['CASTLE_CHALLENGE', 'RASH'],   // RASH へはロングフリーズで直行
    CASTLE_CHALLENGE: ['RASH', 'NORMAL'],
    RASH: ['SUPER_RASH', 'NORMAL', 'CASTLE_CHALLENGE'],   // 城突入チャレンジへは内定の時ゾーンの失敗で戻る
    SUPER_RASH: ['NORMAL']
};

// 仲間
const Companions = {
    members(state, config) {
        return state.companions.map(id => config.companions.members.find(m => m.id === id)).filter(Boolean);
    },

    castleEntryMultiplier(state, config) {
        return this.members(state, config).reduce((mult, m) => mult * m.castleEntry, 1);
    },

    extraDamage(state, config) {
        return this.members(state, config).map(m => ({ id: m.id, name: m.name, amount: m.extraDamage }));
    },

    // 一番強い仲間 (members の並びで後ろほど強い)
    strongest(state, config) {
        const list = config.companions.members.filter(m => state.companions.includes(m.id));
        return list[list.length - 1] || null;
    },

    // お仲間チャレンジ (通常時のマップ移動中)
    challenge(state, config, rng) {
        const cfg = config.companions;
        const forced = state.debugForceCompanion;
        state.debugForceCompanion = false;
        const candidates = cfg.members.filter(m => !state.companions.includes(m.id));
        if (candidates.length === 0 || !(forced || rng() < cfg.challengeRate)) return [];
        const member = Lottery.weightedPick(candidates, m => m.weight, rng);
        const success = rng() < cfg.successRate;
        if (success) state.companions.push(member.id);
        return [{ type: 'companionChallenge', memberId: member.id, name: member.name, success }];
    },

    // 内定の時ゾーン突入時の仲間抽選: まだ仲間でない人それぞれが companionRates の確率で加わる
    naiteiDraw(state, config, rng) {
        const rates = config.naitei.companionRates;
        return config.companions.members
            .filter(m => !state.companions.includes(m.id))
            .map(m => {
                const success = rng() < (rates[m.id] || 0);
                if (success) state.companions.push(m.id);
                return { memberId: m.id, name: m.name, success };
            });
    },

    // 肩代わり: 一番強い仲間が saveRate で RASH の終了を防ぐ (成功するとその仲間は離脱)
    trySave(state, config, rng) {
        const member = this.strongest(state, config);
        if (!member || rng() >= member.saveRate) return null;
        state.companions = state.companions.filter(id => id !== member.id);
        return member;
    }
};

// 台の設定 (1〜6)
const MachineSetting = {
    pick(config, rng = Math.random) {
        const settings = Object.keys(config.machine.weights).map(Number);
        return Lottery.weightedPick(settings, s => config.machine.weights[s], rng);
    },
    multipliers(state, config) {
        return config.machine.multipliers[state.setting];
    }
};

function createInitialState(config, rng = Math.random) {
    return {
        mode: MODES.NORMAL,
        setting: MachineSetting.pick(config, rng),

        // コイン・統計
        coins: config.coins.startCoins,
        totalSpent: config.coins.packagePrice,
        totalCoinsWon: 0,
        totalGames: 0,
        rashCount: 0,
        superCount: 0,

        // データカウンター
        gamesSinceHit: 0,      // 前回の RASH から (通常時・城突入チャレンジの) ゲーム数
        hitHistory: [],        // 大当たり履歴 (新しい順) { no, games, trigger, totalGames, coins, defeats, super, active }

        // 仲間 (加わった順の id。members の並びが弱い順)
        companions: [],

        // 通常時
        normal: {
            map: config.map.loop[0],
            loopIndex: 0,          // ループ内の現在位置 (SE城前から戻るときに使う)
            gamesInMap: 0,
            chancePoint: 0,
            castleWaitRemaining: 0, // SE城前でチャレンジ発生までの残りゲーム数
            revengeGames: 0,       // リベンジチャンスの残りゲーム数 (RASH 終了後)
            dance: null            // ダンシングステージ { games, gamesRemaining, points, zone }
        },

        // 城突入チャレンジ
        challenge: {
            gamesRemaining: 0
        },

        // RASH / SUPER_RASH
        rash: createRashState()
    };
}

function createRashState() {
    return {
        phase: RASH_PHASES.SELECT,
        enemyId: null,
        enemyHp: 0,
        enemyMaxHp: 0,
        gamesRemaining: 0,
        setWillWin: false,       // このセット (BATTLE開始〜？？) を勝ちにするか (先決め)
        winGuaranteed: false,    // 次の BATTLE (撃破まで) を勝利確定にするか (内定の時ゾーン突破の特典)
        defeatCount: 0,          // 1回のRASH内の撃破数
        oniUnlocked: false,      // おにおに出現フラグ
        nextForcedEnemy: null,   // 次の対戦相手の確定 (ゴールド金面犬撃破後など)
        goldDogFlag: false,      // ゴールド金面犬と対戦中か
        breakActive: false,      // ブレイク状態 (敵がガードできない)
        probUpGames: 0,          // 柄揃い確率アップの残りゲーム数
        probUpMultiplier: 1,
        bonusGames: 0,           // 次の BATTLE に上乗せするゲーム数 (撃破ボーナス・宝物庫ゾーン)
        treasureGames: 0,        // 宝物庫ゾーンの残りゲーム数
        treasureTotal: 0,        // 宝物庫ゾーンで上乗せしたゲーム数の合計
        treasureReturnPhase: null, // 宝物庫ゾーンが終わったら戻るフェーズ
        coinsWon: 0              // このRASHでの獲得枚数
    };
}

const StateMachine = {
    isRashMode(state) {
        return state.mode === MODES.RASH || state.mode === MODES.SUPER_RASH;
    },

    canTransition(from, to) {
        return (ALLOWED_TRANSITIONS[from] || []).includes(to);
    },

    // モードを遷移させ、遷移イベントを返す
    transition(state, to) {
        const from = state.mode;
        if (!this.canTransition(from, to)) {
            throw new Error(`不正な状態遷移: ${from} → ${to}`);
        }
        state.mode = to;
        return { type: 'modeChange', from, to };
    }
};

// 1ゲーム終了時の状態更新。モードごとの処理に振り分ける
const GameFlow = {
    onGameEnd(state, outcome, config, rng = Math.random) {
        state.totalGames++;
        if (!StateMachine.isRashMode(state)) state.gamesSinceHit++;
        const events = [this.applyPayout(state, outcome, config)];
        if (outcome.isFreeze) {
            events.push(...this.longFreeze(state, config, rng));
            return events;
        }
        switch (state.mode) {
            case MODES.NORMAL:
                events.push(...this.handleNormal(state, outcome, config, rng));
                break;
            case MODES.CASTLE_CHALLENGE:
                events.push(...this.handleCastleChallenge(state, outcome, config, rng));
                break;
            case MODES.RASH:
            case MODES.SUPER_RASH:
                events.push(...this.handleRash(state, outcome, config, rng));
                break;
        }
        return events;
    },

    // 通常時: マップループ・チャンスポイント・SE城前
    handleNormal(state, outcome, config, rng) {
        const normal = state.normal;

        // SE城前: 待機ゲーム数を消化したら城突入チャレンジへ
        if (normal.map === config.map.castle) {
            normal.castleWaitRemaining = Math.max(0, normal.castleWaitRemaining - 1);
            const events = [{ type: 'castleWait', remaining: normal.castleWaitRemaining }];
            if (normal.castleWaitRemaining === 0) events.push(...this.startCastleChallenge(state, config));
            return events;
        }

        if (normal.dance) return this.danceGame(state, outcome, config, rng);

        const events = [];
        const cp = config.chancePoint;

        // リベンジチャンス: チャンス目で RASH に再突入
        if (normal.revengeGames > 0) {
            normal.revengeGames--;
            if (outcome.isChance) {
                normal.revengeGames = 0;
                events.push({ type: 'revengeSuccess' });
                events.push(StateMachine.transition(state, MODES.RASH));
                state.rash = createRashState();
                this.recordHit(state, config, 'revenge');
                events.push({ type: 'rashStart' });
                return events;
            }
            events.push({ type: 'revengeGame', remaining: normal.revengeGames });
            if (normal.revengeGames === 0) events.push({ type: 'revengeEnd' });
        }
        const inRevenge = events.some(e => e.type === 'revengeGame');

        // チャンスポイント: 1ゲームごとの加算 + チャンス目・柄揃いの追加加算
        let bonus = 0;
        let reason = null;
        if (outcome.isChance) {
            bonus = cp.onChance;
            reason = 'chance';
        } else if (outcome.aligned) {
            bonus = cp.onAligned[outcome.role] || 0;
            reason = 'aligned';
        }
        normal.chancePoint = Math.min(cp.threshold, normal.chancePoint + cp.perGame + bonus);
        events.push({ type: 'chancePoint', added: cp.perGame + bonus, bonus, reason, total: normal.chancePoint });

        // ポイントチャンス: 「少ない」「多い」のどちらを選ぶかを出目で決める
        const pc = config.pointChance;
        const forced = state.debugForcePointChance;
        state.debugForcePointChance = false;
        let pointChanceHappened = false;
        if (!inRevenge && normal.chancePoint < cp.threshold && (forced || rng() < pc.rate)) {
            pointChanceHappened = true;
            const small = pc.small[Math.floor(rng() * pc.small.length)];
            const big = pc.big[Math.floor(rng() * pc.big.length)];
            const bigRate = Math.min(1, (pc.bigRate[outcome.role] ?? 0) * MachineSetting.multipliers(state, config).pointBig);
            const chosen = rng() < bigRate ? 'big' : 'small';
            const amount = chosen === 'big' ? big : small;
            normal.chancePoint = Math.min(cp.threshold, normal.chancePoint + amount);
            events.push({ type: 'pointChance', small, big, chosen, amount, total: normal.chancePoint });
        }

        // お仲間チャレンジ (ポイントチャンスと同じゲームでは起きない)
        let companionHappened = false;
        if (!inRevenge && !pointChanceHappened && normal.chancePoint < cp.threshold) {
            const challenge = Companions.challenge(state, config, rng);
            companionHappened = challenge.length > 0;
            events.push(...challenge);
        }

        // 規定値に到達 → SE城前へ
        if (normal.chancePoint >= cp.threshold) {
            events.push(this.goToCastle(state, config));
            return events;
        }

        // ダンシングステージ (ポイントチャンス・お仲間チャレンジと同じゲームでは起きない)
        const forcedDance = state.debugForceDance;
        state.debugForceDance = false;
        if (!inRevenge && !pointChanceHappened && !companionHappened && (forcedDance || rng() < config.dance.rate)) {
            events.push(this.startDance(state, config, rng));
            return events;
        }

        // マップループ: 一定ゲーム数ごとに次のマップへ
        normal.gamesInMap++;
        if (normal.gamesInMap >= config.map.gamesPerMap) {
            normal.loopIndex = (normal.loopIndex + 1) % config.map.loop.length;
            events.push(this.changeMap(state, config.map.loop[normal.loopIndex]));
        }
        return events;
    },

    // SE城前へ (チャンスポイントが規定値に到達・ダンシングステージのチャンスゾーン突入)
    goToCastle(state, config) {
        state.normal.castleWaitRemaining = config.castle.waitGames;
        return this.changeMap(state, config.map.castle);
    },

    // ----- ダンシングステージ -----
    startDance(state, config, rng) {
        const games = Lottery.weightedPick(config.dance.games, g => g.weight, rng).games;
        state.normal.dance = { games, gamesRemaining: games, points: 0, zone: false };
        return { type: 'danceStart' };
    },

    // ステージの1ゲーム: ポイントを貯め、チャンスゾーン突入を抽選 (結果は最終ゲームで発表)
    danceGame(state, outcome, config, rng) {
        const normal = state.normal;
        const dance = normal.dance;
        const cfg = config.dance;
        const added = cfg.basePoints + (cfg.pointsByRole[outcome.role] || 0);
        const zoneHit = !dance.zone && rng() < (cfg.zoneRates[outcome.role] || 0);
        dance.points += added;
        if (zoneHit) dance.zone = true;
        dance.gamesRemaining--;
        // hype: 踊りの盛り上がり (0: ふつう / 1: 小役 / 2: レア役 / 3: チャンスゾーン当選のゲーム)
        const hype = zoneHit ? 3 : added >= cfg.basePoints + 8 ? 2 : added > cfg.basePoints ? 1 : 0;
        const events = [{ type: 'danceGame', role: outcome.role, hype, last: dance.gamesRemaining <= 0 }];
        if (dance.gamesRemaining > 0) return events;

        normal.dance = null;
        const cp = config.chancePoint;
        if (dance.zone) {
            normal.chancePoint = cp.threshold;
            events.push({ type: 'danceEnd', zone: true, points: dance.points, total: normal.chancePoint });
            events.push(this.goToCastle(state, config));
            return events;
        }
        normal.chancePoint = Math.min(cp.threshold, normal.chancePoint + dance.points);
        events.push({ type: 'danceEnd', zone: false, points: dance.points, total: normal.chancePoint });
        if (normal.chancePoint >= cp.threshold) events.push(this.goToCastle(state, config));
        return events;
    },

    changeMap(state, to) {
        const from = state.normal.map;
        state.normal.map = to;
        state.normal.gamesInMap = 0;
        return { type: 'mapChange', from, to };
    },

    // 城突入チャレンジ開始
    startCastleChallenge(state, config) {
        const events = [StateMachine.transition(state, MODES.CASTLE_CHALLENGE)];
        state.challenge.gamesRemaining = config.castle.challengeGames;
        events.push({
            type: 'challengeStart',
            games: config.castle.challengeGames,
            companionBoost: Companions.castleEntryMultiplier(state, config)
        });
        return events;
    },

    // 城突入チャレンジ: 出目ごとの突入率で毎ゲーム判定。成功でRASHへ、規定ゲーム数で失敗なら通常時へ
    handleCastleChallenge(state, outcome, config, rng) {
        const challenge = state.challenge;
        challenge.gamesRemaining--;
        const rate = Math.min(1, (config.castle.entryRate[outcome.role] || 0)
            * MachineSetting.multipliers(state, config).castleEntry
            * Companions.castleEntryMultiplier(state, config));
        const success = rng() < rate;
        const events = [{ type: 'challengeGame', remaining: challenge.gamesRemaining, role: outcome.role, success }];

        if (success) {
            // 7・7・BAR で突入したら最初の相手はおにおに
            const oniEntry = outcome.role === 'sevenBar';
            events.push({ type: 'castleEntry', oni: oniEntry });
            events.push(StateMachine.transition(state, MODES.RASH));
            state.rash = createRashState();
            if (oniEntry) state.rash.nextForcedEnemy = 'onioni';
            this.recordHit(state, config, oniEntry ? 'sevenBar' : 'castle');
            state.normal.chancePoint = 0;
            events.push({ type: 'rashStart' });
            return events;
        }

        if (challenge.gamesRemaining <= 0) {
            const kept = Math.floor(state.normal.chancePoint * config.castle.failKeepRate);
            state.normal.chancePoint = kept;
            state.normal.castleWaitRemaining = 0;
            events.push({ type: 'challengeFail', keptCp: kept });
            events.push(StateMachine.transition(state, MODES.NORMAL));
            events.push(this.changeMap(state, config.map.loop[state.normal.loopIndex]));
        }
        return events;
    },

    // RASH / BATTLE: フェーズごとに battle.js へ振り分け
    handleRash(state, outcome, config, rng) {
        switch (state.rash.phase) {
            case RASH_PHASES.SELECT:
                if (Battle.isNaiteiTrigger(state, outcome, config)) return Battle.startNaitei(state, config, rng);
                return Battle.startBattle(state, config, rng);
            case RASH_PHASES.BATTLE:
                return [...Battle.battleGame(state, outcome, config, rng), ...Battle.maybeStartTreasure(state, config, rng)];
            case RASH_PHASES.QUESTION:
                return Battle.questionGame(state, outcome, config, rng);
            case RASH_PHASES.TREASURE:
                return Battle.treasureGame(state, outcome, config);
            case RASH_PHASES.NAITEI:
                return Battle.naiteiGame(state, outcome, config, rng);
        }
        return [];
    },

    // 内定の時ゾーンの失敗 (おにおにRASH 中): RASH 終了 → SE城前の城突入チャレンジへ (仲間は残る)
    returnToCastle(state, config, trophy = null) {
        this.finishHit(state, false, trophy);
        state.rash = createRashState();
        state.normal.chancePoint = 0;
        state.normal.castleWaitRemaining = 0;
        state.normal.revengeGames = 0;
        return [this.changeMap(state, config.map.castle), ...this.startCastleChallenge(state, config)];
    },

    // ロングフリーズの効果
    longFreeze(state, config, rng) {
        if (StateMachine.isRashMode(state)) return Battle.longFreeze(state, config, rng);
        // 通常時・城突入チャレンジ: おにおにRASH へ (最初の相手はおにおに)
        const events = [{ type: 'freezeBonus', kind: 'rash' }];
        events.push(StateMachine.transition(state, MODES.RASH));
        state.rash = createRashState();
        state.rash.nextForcedEnemy = 'onioni';
        this.recordHit(state, config, 'freeze');
        state.normal.chancePoint = 0;
        state.normal.castleWaitRemaining = 0;
        state.normal.revengeGames = 0;
        state.normal.dance = null;
        state.challenge.gamesRemaining = 0;
        events.push({ type: 'rashStart' });
        return events;
    },

    // RASH / SUPER 終了 → 通常時 (ループ中のマップへ戻る)
    endRash(state, config, rng = Math.random) {
        const rash = state.rash;
        const companionNames = Companions.members(state, config).map(m => m.name);
        const trophy = this.pickTrophy(state, config, rng);
        const events = [{
            type: 'rashEnd', coinsWon: rash.coinsWon, defeatCount: rash.defeatCount,
            wasSuper: state.mode === MODES.SUPER_RASH, companionNames, trophy
        }];
        this.finishHit(state, state.mode === MODES.SUPER_RASH, trophy);
        state.companions = [];   // RASH が終わると仲間は帰っていく
        events.push(StateMachine.transition(state, MODES.NORMAL));
        state.rash = createRashState();
        state.normal.chancePoint = 0;
        state.normal.castleWaitRemaining = 0;
        events.push(this.changeMap(state, config.map.loop[state.normal.loopIndex]));
        // 通常時に戻ったらリベンジチャンス
        state.normal.revengeGames = config.revenge.games;
        events.push({ type: 'revengeStart', games: config.revenge.games });
        return events;
    },

    // ----- 大当たり履歴 (データカウンター) -----
    // RASH 突入: 当選までのゲーム数と契機を記録 (trigger: castle / sevenBar / freeze / revenge)
    recordHit(state, config, trigger) {
        state.rashCount++;
        for (const hit of state.hitHistory) hit.active = false;
        state.hitHistory.unshift({
            no: state.rashCount,
            games: state.gamesSinceHit,
            trigger,
            totalGames: state.totalGames,
            coins: 0,
            defeats: 0,
            super: false,
            active: true
        });
        state.hitHistory.length = Math.min(state.hitHistory.length, config.dataCounter.historySize);
        state.gamesSinceHit = 0;
    },

    // RASH 終了: 獲得枚数・撃破数・SUPER 到達・出たトロフィーを記録
    finishHit(state, reachedSuper, trophy) {
        const hit = state.hitHistory[0];
        if (!hit || !hit.active) return;
        hit.coins = state.rash.coinsWon;
        hit.defeats = state.rash.defeatCount;
        hit.super = reachedSuper;
        hit.trophy = trophy;
        hit.active = false;
    },

    // RASH 終了時の設定示唆トロフィー: rate の確率で出て、色 (= 示す設定「○以上」) を weights で選ぶ。出なければ null
    pickTrophy(state, config, rng = Math.random) {
        const cfg = config.trophy;
        if (rng() >= cfg.rate) return null;
        const weights = cfg.weights[state.setting];
        return Number(Lottery.weightedPick(Object.keys(weights), level => weights[level], rng));
    },

    // 払い出し (柄が揃ったとき)
    applyPayout(state, outcome, config) {
        const amount = outcome.aligned ? (config.reels.payouts[outcome.role] || 0) : 0;
        state.coins += amount;
        state.totalCoinsWon += amount;
        if (StateMachine.isRashMode(state)) state.rash.coinsWon += amount;
        return { type: 'payout', amount, role: outcome.role, isChance: outcome.isChance };
    }
};

// デバッグ用: 任意の状態へ強制的に移す (遷移ルールを無視する)
const DebugState = {
    toNormal(state, config) {
        state.mode = MODES.NORMAL;
        state.normal.revengeGames = 0;
        state.normal.map = config.map.loop[state.normal.loopIndex];
        state.normal.gamesInMap = 0;
        state.normal.chancePoint = 0;
        state.normal.castleWaitRemaining = 0;
        state.normal.dance = null;
        state.rash = createRashState();
        return [{ type: 'debug', label: '通常時へ' }];
    },
    // 次のゲームでチャンスポイントが規定値に達する状態にする
    fillChancePoint(state, config) {
        state.normal.chancePoint = config.chancePoint.threshold - config.chancePoint.perGame;
        return [{ type: 'debug', label: 'チャンスポイント満タン' }];
    },
    // 次のゲームでマップが切り替わる状態にする
    nextMap(state, config) {
        state.normal.gamesInMap = config.map.gamesPerMap - 1;
        return [{ type: 'debug', label: '次のマップへ' }];
    },
    toCastleChallenge(state, config) {
        state.mode = MODES.NORMAL;
        state.normal.map = config.map.castle;
        state.normal.chancePoint = config.chancePoint.threshold;
        state.normal.castleWaitRemaining = 0;
        state.normal.dance = null;
        return [{ type: 'debug', label: '城突入チャレンジへ' }, ...GameFlow.startCastleChallenge(state, config)];
    },
    toRash(state) {
        state.mode = MODES.RASH;
        state.normal.dance = null;
        state.rash = createRashState();
        return [{ type: 'debug', label: 'おにおにRASHへ' }, { type: 'rashStart' }];
    },
    toSuperRash(state) {
        state.mode = MODES.SUPER_RASH;
        state.normal.dance = null;
        state.rash.phase = RASH_PHASES.SELECT;
        state.rash.enemyId = null;
        return [{ type: 'debug', label: 'SUPERおにおにRASHへ' }, { type: 'rashStart' }];
    },
    // ブレイク状態にする (BATTLE 中)
    setBreak(state) {
        if (state.rash.phase !== RASH_PHASES.BATTLE) return [{ type: 'debugQuiet' }];
        state.rash.breakActive = true;
        return [{ type: 'break' }];
    },
    // 台の設定を変える
    setSetting(state, setting) {
        state.setting = setting;
        return [{ type: 'debugQuiet' }];
    },
    // リベンジチャンスを始める (通常時)
    startRevenge(state, config) {
        if (state.mode !== MODES.NORMAL) return [{ type: 'debugQuiet' }];
        state.normal.revengeGames = config.revenge.games;
        return [{ type: 'revengeStart', games: config.revenge.games }];
    },
    // 次の BATTLE のゲームのあとに宝物庫ゾーンへ
    forceTreasure(state) {
        state.rash.debugForceTreasure = true;
        return [{ type: 'debugQuiet' }];
    },
    // 次の SELECT のゲームで 7揃いを出して内定の時ゾーンに入る (RASH 中でなければ RASH へ)
    forceNaitei(state) {
        const events = StateMachine.isRashMode(state) ? [{ type: 'debugQuiet' }] : this.toRash(state);
        state.rash.debugForceNaitei = true;
        return events;
    },
    // 次のゲームでお仲間チャレンジを発生させる (通常時)
    // 次のゲームのあとダンシングステージへ (通常時)
    forceDance(state) {
        if (state.mode !== MODES.NORMAL || state.normal.dance) return [{ type: 'debugQuiet' }];
        state.debugForceDance = true;
        return [{ type: 'debugQuiet' }];
    },
    forceCompanion(state) {
        state.debugForceCompanion = true;
        return [{ type: 'debugQuiet' }];
    },
    // 仲間を全員加える
    allCompanions(state, config) {
        state.companions = config.companions.members.map(m => m.id);
        return [{ type: 'debug' }];
    },
    // 次のゲームでポイントチャンスを発生させる (通常時)
    forcePointChance(state, config) {
        state.debugForcePointChance = true;
        return [{ type: 'debugQuiet' }];
    },
    // 次の対戦相手を指定する (RASH 中の SELECT 前に押す)
    forceEnemy(state, enemyId) {
        state.rash.nextForcedEnemy = enemyId;
        return [{ type: 'debugQuiet' }];
    },
    // 次のゲームで残りゲーム数が0になる (「？？」の確認用)
    lastGame(state) {
        if (state.rash.phase === RASH_PHASES.BATTLE) state.rash.gamesRemaining = 1;
        return [{ type: 'debugQuiet' }];
    }
};
