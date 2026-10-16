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
    debug: true,

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
            5: { chance: 1.65, castleEntry: 1.28, pointBig: 1.50 },
            6: { chance: 1.95, castleEntry: 1.42, pointBig: 1.75 }
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
    // 各リールは上段・中段・下段の3つの図柄が見える。当たりは5ライン (上段・中段・下段・右下がり・右上がり)
    reels: {
        // 図柄の種類 (ID)
        symbols: ['cherry', 'replay', 'melon', 'bell', 'diamond', 'seven', 'bar'],
        // リール配列 (左・中・右)。上から下へこの順に並び、最後の次は最初に戻る
        // 3本とも同じ並びだと複数の段が同時に揃うので、リールごとに並びを変えている
        strips: [
            ['seven', 'replay', 'bell', 'cherry', 'melon', 'replay', 'bar', 'bell', 'diamond', 'cherry', 'replay',
             'melon', 'bell', 'seven', 'diamond', 'cherry', 'replay', 'bar', 'bell', 'melon', 'diamond'],
            ['bell', 'seven', 'diamond', 'replay', 'cherry', 'melon', 'bell', 'bar', 'replay', 'diamond', 'seven',
             'cherry', 'bell', 'melon', 'replay', 'bar', 'diamond', 'cherry', 'bell', 'replay', 'melon'],
            ['replay', 'cherry', 'seven', 'bell', 'melon', 'diamond', 'replay', 'bar', 'cherry', 'bell', 'melon',
             'seven', 'replay', 'diamond', 'bell', 'bar', 'cherry', 'melon', 'replay', 'diamond', 'bell']
        ],
        // 揃ったときの払い出し枚数
        payouts: {
            replay: 3,   // リプレイ (投入分が戻る)
            bell: 5,
            diamond: 7,
            cherry: 15,
            melon: 30,
            bar: 40,
            seven: 50,
            sevenBar: 0   // 7・7・BAR (BATTLE 中の確定撃破役)
        },
        // 揃い扱いになる特殊な出目 (役ID → ライン上の並び)
        specialPatterns: {
            sevenBar: ['seven', 'seven', 'bar']
        },
        // チャンス目 (揃いではない特別な出目)。抽選で 'chance' に当選すると weight の重みでどれかが出る
        //   line:  5ラインのどれかにこの並びが出る
        //   cells: 指定の位置 ([リール, 段, 図柄]。段は 0:上段 1:中段 2:下段) にこの図柄が出る
        // ※ 左リール中段のチェリーはロングフリーズ専用 (longFreeze.cells)
        chancePatterns: [
            { name: 'スイカ崩れ', weight: 45, line: ['melon', 'cherry', 'melon'] },
            { name: 'BAR崩れ', weight: 35, line: ['bar', 'cherry', 'bar'] },
            { name: '7崩れ', weight: 20, line: ['seven', 'bar', 'seven'] }
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
            chance: 1 / 24
        },
        // RASH / BATTLE 中 (リプレイ多めでコインが減りにくい)
        battle: {
            replay: 1 / 2.2,
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

    // ----- お仲間チャレンジ (通常時) -----
    // マップ移動中に challengeRate の確率で発生し、successRate で仲間が加わる。
    // 現れる仲間は weight の重みで抽選 (すでに仲間の人は出ない)。仲間は RASH が終わるか、肩代わりするまで一緒にいる
    //   castleEntry: 城突入チャレンジの突入率の倍率 (仲間全員分を掛け合わせる)
    //   extraDamage: BATTLE でダメージが入るたびに追加で与えるダメージ
    //   saveRate:    「？？」で揃わず RASH が終わるとき、一番強い仲間がこの確率で肩代わり → RASH 継続 (その仲間は離脱)
    companions: {
        challengeRate: 1 / 60,
        successRate: 0.20,
        members: [
            { id: 'yasu', name: 'やすさん', weight: 60, castleEntry: 1.15, extraDamage: 2, saveRate: 0.15 },
            { id: 'tamu', name: 'たむさん', weight: 30, castleEntry: 1.3, extraDamage: 4, saveRate: 0.25 },
            { id: 'dake', name: 'だけさん', weight: 10, castleEntry: 1.5, extraDamage: 6, saveRate: 0.4 }
        ]
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
            { games: 5, weight: 35 },
            { games: 10, weight: 40 },
            { games: 15, weight: 18 },
            { games: 20, weight: 7 }
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

    // ----- 宝物庫ゾーン (RASH / SUPER 中のゲーム数上乗せ特化ゾーン) -----
    // BATTLE 中の1ゲームごとに rate の確率で突入 (「？？」のときは突入しない)。games ゲームの間 BATTLE は中断し、
    // lottery の確率で抽選して、揃った柄に応じて gamesByRole のゲーム数を「次の BATTLE」に上乗せする
    treasure: {
        rate: 1 / 100,
        games: 5,
        lottery: {
            replay: 1 / 3,
            bell: 1 / 5,
            cherry: 1 / 12,
            diamond: 1 / 15,
            melon: 1 / 20,
            bar: 1 / 40,
            sevenBar: 1 / 100,
            seven: 1 / 80
        },
        gamesByRole: {
            replay: 1,
            bell: 2,
            cherry: 3,
            diamond: 3,
            melon: 5,
            bar: 10,
            sevenBar: 10,
            seven: 20
        }
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
            bonus: { type: 'coins', value: 35 }
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
            bonus: { type: 'coins', value: 120 }
        },
        {
            id: 'onioni', name: 'おにおに',
            weight: 20, superWeight: 15, hp: 200,
            bonus: { type: 'coins', value: 250 },
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

    // ----- ロングフリーズ -----
    // 1ゲームごとに prob[モード] の確率で当選。当選したゲームは左リール中段にチェリー (cells) が止まり、
    // その瞬間に画面が止まる → ノイズ → 暗転 →「こおりいきていける！」(虹色) とこおりくんが虹色に光る
    //   通常時・城突入チャレンジ: おにおにRASH へ (最初の相手はおにおに)
    //   おにおにRASH: 戦闘中の敵を完全撃破 → superRate で SUPER 直行、それ以外は次の相手がおにおに
    //   SUPER: 戦闘中の敵に勝利 → 次の相手がゴールド金面犬
    longFreeze: {
        prob: {
            NORMAL: 1 / 8192,
            CASTLE_CHALLENGE: 1 / 8192,
            RASH: 1 / 8192,
            SUPER_RASH: 1 / 8192
        },
        superRate: 0.75,
        cells: [[0, 1, 'cherry']],
        text: 'こおりいきていける！',
        timing: {             // ミリ秒
            still: 1500,      // 画面が止まる
            noise: 1300,      // ノイズ
            black: 900,       // 暗転
            rainbow: 4000     // 虹色の表示
        }
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
        fakeReachRate: 0.12,  // ハズレのときに 7・BAR のリーチ目 (ガセリーチ) が出る出目を選ぶ確率
        // リーチ演出を出す図柄 (当たるラインのリーチは図柄に関係なく出す)
        reachSymbols: ['seven', 'bar', 'melon'],
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
