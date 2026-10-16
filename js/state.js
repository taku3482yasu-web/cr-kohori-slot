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
    QUESTION: 'QUESTION'  // 残りゲーム数「？？」: 揃えば継続、揃わなければ終了
});

const MODE_LABELS = {
    NORMAL: '通常時',
    CASTLE_CHALLENGE: '城突入チャレンジ',
    RASH: 'おにおにRASH',
    SUPER_RASH: 'SUPERおにおにRASH'
};

// 許可する遷移 (これ以外の遷移はエラーにする)
const ALLOWED_TRANSITIONS = {
    NORMAL: ['CASTLE_CHALLENGE'],
    CASTLE_CHALLENGE: ['RASH', 'NORMAL'],
    RASH: ['SUPER_RASH', 'NORMAL'],
    SUPER_RASH: ['NORMAL']
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

        // 通常時
        normal: {
            map: config.map.loop[0],
            loopIndex: 0,          // ループ内の現在位置 (SE城前から戻るときに使う)
            gamesInMap: 0,
            chancePoint: 0,
            castleWaitRemaining: 0 // SE城前でチャレンジ発生までの残りゲーム数
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
        defeatCount: 0,          // 1回のRASH内の撃破数
        oniUnlocked: false,      // おにおに出現フラグ
        nextForcedEnemy: null,   // 次の対戦相手の確定 (ゴールド金面犬撃破後など)
        goldDogFlag: false,      // ゴールド金面犬と対戦中か
        breakActive: false,      // ブレイク状態 (敵がガードできない)
        probUpGames: 0,          // 柄揃い確率アップの残りゲーム数
        probUpMultiplier: 1,
        bonusGames: 0,           // 次の BATTLE に上乗せするゲーム数 (撃破ボーナス)
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
        const events = [this.applyPayout(state, outcome, config)];
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

        const events = [];
        const cp = config.chancePoint;

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
        if (normal.chancePoint < cp.threshold && (forced || rng() < pc.rate)) {
            const small = pc.small[Math.floor(rng() * pc.small.length)];
            const big = pc.big[Math.floor(rng() * pc.big.length)];
            const bigRate = Math.min(1, (pc.bigRate[outcome.role] ?? 0) * MachineSetting.multipliers(state, config).pointBig);
            const chosen = rng() < bigRate ? 'big' : 'small';
            const amount = chosen === 'big' ? big : small;
            normal.chancePoint = Math.min(cp.threshold, normal.chancePoint + amount);
            events.push({ type: 'pointChance', small, big, chosen, amount, total: normal.chancePoint });
        }

        // 規定値に到達 → SE城前へ
        if (normal.chancePoint >= cp.threshold) {
            events.push(this.changeMap(state, config.map.castle));
            normal.castleWaitRemaining = config.castle.waitGames;
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
        events.push({ type: 'challengeStart', games: config.castle.challengeGames });
        return events;
    },

    // 城突入チャレンジ: 出目ごとの突入率で毎ゲーム判定。成功でRASHへ、規定ゲーム数で失敗なら通常時へ
    handleCastleChallenge(state, outcome, config, rng) {
        const challenge = state.challenge;
        challenge.gamesRemaining--;
        const rate = Math.min(1, (config.castle.entryRate[outcome.role] || 0) * MachineSetting.multipliers(state, config).castleEntry);
        const success = rng() < rate;
        const events = [{ type: 'challengeGame', remaining: challenge.gamesRemaining, role: outcome.role, success }];

        if (success) {
            events.push({ type: 'castleEntry' });
            events.push(StateMachine.transition(state, MODES.RASH));
            state.rash = createRashState();
            state.rashCount++;
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
                return Battle.startBattle(state, config, rng);
            case RASH_PHASES.BATTLE:
                return Battle.battleGame(state, outcome, config, rng);
            case RASH_PHASES.QUESTION:
                return Battle.questionGame(state, outcome, config, rng);
        }
        return [];
    },

    // RASH / SUPER 終了 → 通常時 (ループ中のマップへ戻る)
    endRash(state, config) {
        const rash = state.rash;
        const events = [{ type: 'rashEnd', coinsWon: rash.coinsWon, defeatCount: rash.defeatCount, wasSuper: state.mode === MODES.SUPER_RASH }];
        events.push(StateMachine.transition(state, MODES.NORMAL));
        state.rash = createRashState();
        state.normal.chancePoint = 0;
        state.normal.castleWaitRemaining = 0;
        events.push(this.changeMap(state, config.map.loop[state.normal.loopIndex]));
        return events;
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
        state.normal.map = config.map.loop[state.normal.loopIndex];
        state.normal.gamesInMap = 0;
        state.normal.chancePoint = 0;
        state.normal.castleWaitRemaining = 0;
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
        return [{ type: 'debug', label: '城突入チャレンジへ' }, ...GameFlow.startCastleChallenge(state, config)];
    },
    toRash(state) {
        state.mode = MODES.RASH;
        state.rash = createRashState();
        return [{ type: 'debug', label: 'おにおにRASHへ' }, { type: 'rashStart' }];
    },
    toSuperRash(state) {
        state.mode = MODES.SUPER_RASH;
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
