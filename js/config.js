// =====================================================================
// CRこおりくんの大冒険 ～おにおにの野望～  調整用設定ファイル
// ---------------------------------------------------------------------
// ゲームバランス・演出に関わる数値はすべてここで管理する。
// 中身は JSON と同じ形式のデータのみ (index.html を直接開いても読み込めるよう .js にしている)。
// 確率は「1ゲームあたりの当選確率」(例: 1/10 = 0.1)。
// 出玉率は設定1 約97% 〜 設定6 約112% に調整済み。数値を変えたら tools/simulate.html で確認する。
// =====================================================================
window.GAME_CONFIG = {
    title: 'CRこおりくんの大冒険 ～おにおにの野望～',

    // デバッグパネル (状態の表示・強制遷移ボタン) を表示するか
    debug: false,

    // ----- 台の設定 (1〜6) -----
    // 起動時に weights の重みで設定を抽選する (設定1が最も出やすい)
    // 設定ごとの倍率:
    //   chance:      通常時・城突入チャレンジ中のチャンス目の確率
    //   castleEntry: 城突入チャレンジの突入率 (上限 100%)
    //   pointBig:    ポイントチャンスで「多いポイント」が選ばれる確率 (上限 100%)
    machine: {
        weights: { 1: 40, 2: 25, 3: 15, 4: 10, 5: 6, 6: 4 },
        multipliers: {
            1: { chance: 1.00, castleEntry: 1.00, pointBig: 1.00 },
            2: { chance: 1.10, castleEntry: 1.05, pointBig: 1.10 },
            3: { chance: 1.20, castleEntry: 1.10, pointBig: 1.20 },
            4: { chance: 1.35, castleEntry: 1.15, pointBig: 1.30 },
            5: { chance: 1.60, castleEntry: 1.25, pointBig: 1.50 },
            6: { chance: 1.85, castleEntry: 1.38, pointBig: 1.75 }
        }
    },

    // ----- コイン -----
    coins: {
        spinCost: 3,          // 1ゲームに必要なコイン
        startCoins: 49,       // 開始時のコイン
        packagePrice: 1000,   // コイン購入の金額 (円)
        packageAmount: 49     // コイン購入で増える枚数
    },

    // ----- リール -----
    reels: {
        // リール帯に並ぶ図柄の順番 (ID)
        symbols: ['cherry', 'replay', 'melon', 'bell', 'diamond', 'seven', 'bar'],
        // 揃ったときの払い出し枚数
        payouts: {
            replay: 3,   // リプレイ (投入分が戻る)
            bell: 5,
            diamond: 7,
            cherry: 15,
            melon: 30,
            bar: 40,
            seven: 50,
            sevenBar: 0   // 7️⃣7️⃣BAR (BATTLE 中の確定撃破役)
        },
        // 揃い扱いになる特殊な出目 (役ID → 出目)
        specialPatterns: {
            sevenBar: ['seven', 'seven', 'bar']
        },
        // チャンス目 (揃いではない特定の出目)。抽選で 'chance' に当選するといずれかが出る
        chancePatterns: [
            ['melon', 'cherry', 'melon'],
            ['bar', 'cherry', 'bar'],
            ['seven', 'bar', 'seven']
        ]
    },

    // ----- 抽選確率 -----
    lottery: {
        // 通常時 (マップ移動中・SE城前)
        normal: {
            replay: 1 / 7.3,
            bell: 1 / 10,
            diamond: 1 / 50,
            cherry: 1 / 80,
            melon: 1 / 200,
            bar: 1 / 400,
            seven: 1 / 600,
            chance: 1 / 40
        },
        // 城突入チャレンジ中 (チャンス目が出やすい)
        castleChallenge: {
            replay: 1 / 7.3,
            bell: 1 / 10,
            diamond: 1 / 40,
            cherry: 1 / 50,
            melon: 1 / 100,
            bar: 1 / 150,
            seven: 1 / 300,
            chance: 1 / 19
        },
        // RASH / BATTLE 中 (リプレイ多めでコインが減りにくい)
        battle: {
            replay: 1 / 2,
            bell: 1 / 8,
            diamond: 1 / 15,
            cherry: 1 / 20,
            melon: 1 / 40,
            bar: 1 / 60,
            seven: 1 / 150,
            sevenBar: 1 / 200,
            chance: 1 / 25
        }
    },

    // ----- チャンスポイント -----
    chancePoint: {
        perGame: 1,           // 1ゲームごとの加算
        onChance: 10,         // チャンス目での追加加算
        onAligned: {          // 柄が揃ったときの追加加算
            replay: 0,
            bell: 1,
            diamond: 2,
            cherry: 3,
            melon: 5,
            bar: 10,
            seven: 100        // 規定値と同じ = 7揃いでSE城前へ直行
        },
        threshold: 100        // この値に達するとSE城前へ移動
    },

    // ----- ポイントチャンス (通常時) -----
    // rate の確率で発生。こおりくんが「少ないポイント」「多いポイント」の吹き出しから1つを選ぶ。
    // どちらを選ぶかはそのゲームの出目で決まる (bigRate: 役ごとの「多い」を選ぶ確率)
    pointChance: {
        rate: 1 / 30,
        small: [3, 5, 8],      // 少ないポイントの候補
        big: [15, 20, 30],     // 多いポイントの候補
        bigRate: {
            seven: 1.0,
            chance: 0.9,
            bar: 0.8,
            melon: 0.6,
            cherry: 0.5,
            diamond: 0.35,
            bell: 0.2,
            replay: 0.15,
            miss: 0.1
        }
    },

    // ----- マップ -----
    map: {
        loop: ['tsugakuro', 'ongagawa', 'ebisucho'],   // 通常時のループ順
        castle: 'seCastle',
        names: {
            tsugakuro: '通学路',
            ongagawa: '遠賀川',
            ebisucho: '恵比寿町',
            seCastle: 'SE城前'
        },
        gamesPerMap: 15       // 1つのマップに滞在するゲーム数
    },

    // ----- SE城前・城突入チャレンジ -----
    castle: {
        waitGames: 3,         // SE城前に移動してからチャレンジ発生までのゲーム数
        challengeGames: 5,    // チャレンジのゲーム数
        // 出目ごとの突入率 (チャレンジ中の各ゲームで判定)
        entryRate: {
            chance: 1.0,
            seven: 1.0,
            bar: 0.8,
            melon: 0.5,
            cherry: 0.3,
            diamond: 0.1,
            bell: 0.02,
            replay: 0.02,
            miss: 0.01
        },
        failKeepRate: 0.5     // 突入失敗時に残すチャンスポイントの割合
    },

    // ----- おにおにRASH -----
    rash: {
        // continueRate: 目標の継続率 (1セットごと。ガード崩し・ブレイクで勝ちになる分も含めた最終的な値)
        // presetRate:   セット開始時に「勝ちセット」にする確率 (先決め)。
        //               負けセットでもガード崩し・ブレイクで撃破できるぶん、continueRate より低くしてある。
        //               ダメージ・確率・ブレイク率を変えたら、シミュレーションで continueRate に合うよう調整する
        normal: { continueRate: 0.70, presetRate: 0.550 },   // おにおにRASH
        super: { continueRate: 0.93, presetRate: 0.896 },    // SUPERおにおにRASH
        // BATTLE開始時のゲーム数 (重み付き抽選)
        initialGames: [
            { games: 5, weight: 30 },
            { games: 10, weight: 40 },
            { games: 15, weight: 20 },
            { games: 20, weight: 10 }
        ],
        // 「？？」から継続したときのゲーム数 (重み付き抽選)
        continueGames: [
            { games: 5, weight: 40 },
            { games: 10, weight: 35 },
            { games: 15, weight: 15 },
            { games: 20, weight: 10 }
        ],
        // おにおにが対戦相手の候補に入るのに必要な撃破数 (1回のRASH内で数える)
        oniUnlockDefeats: 3,
        // SUPER中はおにおにを常に候補に入れるか
        superOniAlwaysAvailable: true
    },

    // ----- BATTLE のダメージ -----
    // 'kill' は敵のガードを崩して確実に撃破 (負けセットでも倒せる)。ベルはダメージなし
    damage: {
        replay: 5,
        bell: 0,
        diamond: 10,
        cherry: 15,
        melon: 25,
        chance: 60,           // チャンス目は大ダメージ
        bar: 'kill',          // BAR揃い
        seven: 'kill',        // 7️⃣7️⃣7️⃣
        sevenBar: 'kill'      // 7️⃣7️⃣BAR
    },

    // ----- ブレイク -----
    // 指定の役が揃ったとき rate の確率でブレイク状態に。ブレイク中は敵がガードできない
    // (今の敵を倒すか RASH が終わるまで続く)
    breakState: {
        roles: ['cherry'],
        rate: 0.25
    },

    // ----- 対戦相手 -----
    // weight: 通常RASHでの出現の重み / superWeight: SUPER中の重み
    // bonus.type: 'coins' (コイン獲得) / 'games' (ゲーム数上乗せ) / 'probUp' (柄揃い確率アップ)
    enemies: [
        {
            id: 'okagappa', name: 'おかがっぱ',
            weight: 50, superWeight: 40, hp: 60,
            bonus: { type: 'coins', value: 45 }
        },
        {
            id: 'hibikimakuri', name: 'ひびきまくり',
            weight: 30, superWeight: 25, hp: 90,
            bonus: { type: 'games', value: 5 }
        },
        {
            id: 'shibata', name: 'シバター',
            weight: 15, superWeight: 15, hp: 120,
            bonus: { type: 'probUp', value: 1.5, games: 10 }
        },
        {
            id: 'sasaki', name: 'Mr.SASAKI',
            weight: 8, superWeight: 12, hp: 150,
            bonus: { type: 'coins', value: 150 }
        },
        {
            id: 'onioni', name: 'おにおに',
            weight: 20, superWeight: 15, hp: 200,
            bonus: { type: 'coins', value: 300 },
            requiresUnlock: true          // 撃破数が oniUnlockDefeats に達するまで出ない
        }
    ],

    // ----- ゴールド金面犬 (SUPER中のみ) -----
    goldDog: {
        id: 'goldDog', name: 'ゴールド金面犬',
        prob: 1 / 100,        // SUPER中の対戦相手抽選ごとの出現確率
        hp: 250,
        bonus: { type: 'coins', value: 2000 },
        nextForcedEnemy: 'onioni'   // 撃破後の次の対戦相手
    },

    // ----- 演出 -----
    effects: {
        lcd: { width: 256, height: 144, scale: 2 },   // 液晶の内部解像度と拡大率
        timing: {             // ミリ秒
            reelSpinStagger: 100,
            resultDisplay: 1200,
            mapTransition: 800,
            castleMovie: 3000,
            rashStartMovie: 3000,
            battleIntro: 2000,
            hitStop: 150,
            defeatMovie: 2500,
            questionDisplay: 1500,
            superMovie: 4000
        },
        intensity: {
            shakeSmall: 2,    // 画面揺れの大きさ (px)
            shakeLarge: 6,
            flashCount: 3     // フラッシュの回数
        },
        cutInRate: 0.5,       // 大ダメージ時にカットインを出す確率
        fakeReachRate: 0.12,  // ハズレのときにガセリーチ (NO...) を出す確率
        pushRate: 0.5,        // チャンス目のとき、最後の STOP が金色に光って「押せ!!」が出る確率
        // 先読み予告: レバーON で雪が降る確率 (役ごと)。goldRate は当たり役のときに金色の雪になる割合
        preview: {
            seven: 0.8,
            sevenBar: 0.8,
            bar: 0.6,
            chance: 0.5,
            melon: 0.2,
            cherry: 0.1,
            miss: 0.02,
            goldRate: 0.3
        }
    },

    // ----- キー割り当ての初期値 -----
    keys: {
        lever: 'Space',
        stop1: 'KeyJ',
        stop2: 'KeyK',
        stop3: 'KeyL'
    }
};
