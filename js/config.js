// =====================================================================
// CRこおりくんの大冒険 ～おにおにの野望～  調整用設定ファイル
// ---------------------------------------------------------------------
// ゲームバランス・演出に関わる数値はすべてここで管理する。
// 中身は JSON と同じ形式のデータのみ (index.html を直接開いても読み込めるよう .js にしている)。
// 確率は「1ゲームあたりの当選確率」(例: 1/10 = 0.1)。
// 出玉率は設定1 約97% 〜 設定6 約128% に調整済み。数値を変えたら tools/simulate.html で確認する。
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
            1: { chance: 0.91, castleEntry: 0.94, pointBig: 0.93 },
            2: { chance: 0.96, castleEntry: 0.97, pointBig: 0.97 },
            3: { chance: 1.00, castleEntry: 1.00, pointBig: 1.00 },
            4: { chance: 1.34, castleEntry: 1.25, pointBig: 1.28 },
            5: { chance: 1.90, castleEntry: 1.80, pointBig: 1.65 },
            6: { chance: 3.00, castleEntry: 3.00, pointBig: 2.25 }
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
            chance: 1 / 50
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
            sevenBar: 1 / 500,   // 7・7・BAR: 必ず突入し、最初の相手はおにおに
            chance: 1 / 29
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

    // ----- ダンシングステージ (通常時) -----
    // マップ移動中に rate の確率で突入 (SE城前・リベンジチャンス中・ポイントチャンスやお仲間チャレンジと同じゲームでは起きない)。
    // ダンス会場でこおりくん・仲間・ひびきまくり・おかがっぱが踊る。games の重みでゲーム数を決める (平均7G、残りは表示しない)
    // ステージ中はマップ移動・チャンスポイントの加算・ポイントチャンス・お仲間チャレンジは止まる
    // 1ゲームごとに:
    //   basePoints + pointsByRole[役] のポイントを貯める
    //   zoneRates[役] の確率でチャンスゾーン突入に当選 (当たってもその場では知らせず、最終ゲームで発表)
    // 最終ゲーム: チャンスゾーン突入なら SE城前へ直行 / それ以外は貯めたポイントをチャンスポイントに加算
    dance: {
        rate: 1 / 150,
        games: [
            { games: 4, weight: 1 },
            { games: 6, weight: 1 },
            { games: 8, weight: 1 },
            { games: 10, weight: 1 }
        ],
        basePoints: 3,
        pointsByRole: {
            replay: 2, bell: 3, diamond: 5, cherry: 8, melon: 12, bar: 15, chance: 15, seven: 30
        },
        zoneRates: {
            seven: 1.0, chance: 0.6, bar: 0.5, melon: 0.3, cherry: 0.2, diamond: 0.05, bell: 0.03, replay: 0.02, miss: 0.02
        }
    },

    // ----- お仲間チャレンジ (通常時) -----
    // マップ移動中に challengeRate の確率で発生し、successRate で仲間が加わる。
    // 現れる仲間は weight の重みで抽選 (すでに仲間の人は出ない)。仲間は RASH が終わるか、肩代わりするまで一緒にいる
    //   castleEntry: 城突入チャレンジの突入率の倍率 (仲間全員分を掛け合わせる)
    //   extraDamage: BATTLE でダメージが入るたびに追加で与えるダメージ
    //   saveRate:    「？？」で揃わず RASH が終わるとき、一番強い仲間がこの確率で肩代わり → RASH 継続 (その仲間は離脱)
    //   special:     必殺技の名前 (仲間の追撃でとどめを刺したときにカットイン)
    companions: {
        challengeRate: 1 / 60,
        successRate: 0.20,
        members: [
            { id: 'yasu', name: 'やすさん', weight: 60, castleEntry: 1.15, extraDamage: 2, saveRate: 0.15, special: 'やすパンチ' },
            { id: 'tamu', name: 'たむさん', weight: 30, castleEntry: 1.3, extraDamage: 4, saveRate: 0.25, special: 'たむキック' },
            { id: 'dake', name: 'だけさん', weight: 10, castleEntry: 1.5, extraDamage: 6, saveRate: 0.4, special: 'だけチョップ' }
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
            sevenBar: 1.0,   // 7・7・BAR は必ず突入 (最初の相手はおにおに)
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
        failKeepRate: 0.5,    // 突入失敗時に残すチャンスポイントの割合
        entryCutIn: 'こおりばりきつよい！',   // 突入成功時のこおりくんのカットイン
        chanceBoost: 1.5      // SE城前 (チャレンジ前の待機中) でチャンス目を引いたときの突入率の倍率 (こおりくんが赤いオーラをまとう)
    },

    // ----- おにおにRASH -----
    rash: {
        // continueRate: 目標の継続率 (1セットごと。ガード崩し・ブレイクで勝ちになる分も含めた最終的な値)
        // presetRate:   セット開始時に「勝ちセット」にする確率 (先決め)。
        //               負けセットでもガード崩し・ブレイクで撃破できるぶん、continueRate より低くしてある。
        //               ダメージ・確率・ブレイク率を変えたら、シミュレーションで continueRate に合うよう調整する
        normal: { continueRate: 0.70, presetRate: 0.470 },   // おにおにRASH
        super: { continueRate: 0.93, presetRate: 0.875 },    // SUPERおにおにRASH
        // BATTLE開始時のゲーム数 (重み付き抽選)
        initialGames: [
            { games: 5, weight: 45 },
            { games: 10, weight: 38 },
            { games: 15, weight: 13 },
            { games: 20, weight: 4 }
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

    // ----- リベンジチャンス (RASH 終了後の引き戻し) -----
    // RASH / SUPER が終わって通常時に戻ったあと games ゲームの間にチャンス目を引くと、おにおにRASH に再突入
    revenge: {
        games: 3
    },

    // ----- 宝物庫ゾーン (RASH / SUPER 中のゲーム数上乗せ特化ゾーン) -----
    // BATTLE 中の1ゲームごとに rate の確率で突入 (「？？」のときは突入しない)。games ゲームの間 BATTLE は中断し、
    // lottery の確率で抽選して、揃った柄・チャンス目に応じて gamesByRole のゲーム数を「次の BATTLE」に上乗せする
    // ゾーン中にロングフリーズが当たると、freezeBonusGames を上乗せして SUPER 突入、次の相手はゴールド金面犬
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
            seven: 1 / 80,
            chance: 1 / 15
        },
        gamesByRole: {
            replay: 1,
            bell: 2,
            cherry: 3,
            diamond: 3,
            melon: 5,
            bar: 10,
            sevenBar: 10,
            chance: 15,
            seven: 20
        },
        freezeBonusGames: 50
    },

    // ----- 内定の時ゾーン (RASH / SUPER 中) -----
    // 対戦相手とゲーム数を決める1ゲーム (SELECT) で triggerRoles が揃うと突入。
    // 暗転 →「ここから先」「内定を持たぬものは通す事は出来ない」→ 仲間抽選 → enemy と games ゲームの1対1
    //   companionRates: 突入時の仲間抽選。まだ仲間でない人それぞれが、この確率で加わる
    //   winRates:       突破の抽選。ゾーン中の1ゲームごとに、出目 (役) に応じたこの確率で突破が当たる
    //                   当たると HP に関係なく「とどめだ!!」で撃破。games ゲームで当たらなければ失敗
    //                   ふつうのダメージでは倒しきれない (HP1 でガード)。肩代わりもない
    //                   突破率は lottery.battle と winRates から計算される (約50%、Battle.naiteiWinRate)
    //   おにおにRASH: 突破で SUPER へ / 失敗で RASH 終了 → SE城の城突入チャレンジへ (仲間は残る)
    //   SUPER:        突破で撃破ボーナス / 失敗しても SUPER は継続 (次の相手を決め直す)
    // 突破すると: 暗転 →「内定は」→ 虹色の「こおりがいただいた！」と、虹色に光るこおりくんのドアップ
    // ゾーン中にロングフリーズが当たると突破
    //   winNextBattle: 突破後 (SUPER) の次の BATTLE を勝利確定にする (撃破するまで敵はガードせず、「？？」も必ず揃う)
    naitei: {
        triggerRoles: ['seven', 'sevenBar'],
        games: 10,
        winNextBattle: true,
        winRates: {
            seven: 1.0,
            sevenBar: 1.0,
            chance: 0.55,
            bar: 0.5,
            melon: 0.25,
            cherry: 0.15,
            diamond: 0.05,
            bell: 0.02,
            replay: 0.01,
            miss: 0.01
        },
        companionRates: { yasu: 0.5, tamu: 0.35, dake: 0.2 },
        enemy: {
            id: 'naitei', name: 'シーシャ・ナイテイ・ナイナイ',
            special: '不採用の裁き',   // 突破できなかったときの必殺技
            hp: 200,
            bonus: { type: 'coins', value: 300 }
        },
        timing: {             // ミリ秒
            black: 800,       // 暗転
            text1: 1400,      // 「ここから先」
            text2: 2800,      // 「内定を持たぬものは通す事は出来ない」
            getBlack: 700,    // 突破: 暗転
            getText: 1600,    // 突破:「内定は」
            getRainbow: 3600  // 突破: 虹色の「こおりがいただいた！」とこおりくんのドアップ
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
    // BATTLE 中に rates の役が出たとき、その確率でブレイク状態に。ブレイク中は敵がガードできない
    // (その役の攻撃から有効。今の敵を倒すか RASH が終わるまで続く)
    breakState: {
        rates: {
            cherry: 0.25,     // チェリー揃い
            chance: 0.50      // チャンス目
        }
    },

    // ----- 対戦相手 -----
    // weight: 通常RASHでの出現の重み / superWeight: SUPER中の重み
    // bonus.type: 'coins' (コイン獲得) / 'games' (ゲーム数上乗せ) / 'probUp' (柄揃い確率アップ)
    // special: 必殺技の名前 (「？？」で継続できなかったとき、カットインとともに打ってくる)
    enemies: [
        {
            id: 'okagappa', name: 'おかがっぱ', special: 'おかピポっと光線',
            weight: 50, superWeight: 40, hp: 60,
            bonus: { type: 'coins', value: 35 }
        },
        {
            id: 'hibikimakuri', name: 'ひびきまくり', special: '大音響4DX',
            weight: 30, superWeight: 25, hp: 90,
            bonus: { type: 'games', value: 5 }
        },
        {
            id: 'shibata', name: 'シバター', special: 'シバタードライバー',
            weight: 15, superWeight: 15, hp: 120,
            bonus: { type: 'probUp', value: 1.5, games: 10 }
        },
        {
            id: 'sasaki', name: 'Mr.SASAKI', special: 'ASAスラッシュ',
            weight: 8, superWeight: 12, hp: 150,
            bonus: { type: 'coins', value: 120 }
        },
        {
            id: 'onioni', name: 'おにおに', special: '鬼鬼の金棒',
            weight: 16, superWeight: 15, hp: 200,
            bonus: { type: 'coins', value: 200 },
            requiresUnlock: true          // 撃破数が oniUnlockDefeats に達するまで出ない
        }
    ],

    // ----- ゴールド金面犬 (SUPER中のみ) -----
    goldDog: {
        id: 'goldDog', name: 'ゴールド金面犬', special: 'ゴールドかみまっくす',
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
        // チャンス目ごとの演出 (チャンス目の名前 → 表示)
        chanceEffects: {
            'スイカ崩れ': { text: 'スイカ崩れ!!', sub: 'チャンス目', color: '#5ad05a', duration: 1300 },
            'BAR崩れ': { text: 'BAR崩れ!!', sub: 'チャンス目', color: '#ffffff', duration: 1400 },
            '7崩れ': { text: '7崩れ!!', sub: '激アツ!!', color: '#ff3a3a', duration: 1700 }
        },
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

    // ----- 必殺技 -----
    // こおりくんがとどめを刺したときのカットイン (killRole: 一撃必殺の役 = BAR揃い・7揃い・7・7・BAR、内定の時の 7揃い・7・7・BAR)
    // 敵・仲間の必殺技は enemies / goldDog / naitei.enemy / companions.members の special
    specials: {
        koori: '大腸炎アタック',
        kooriKill: '7つの内定フラッシュ',
        questionWarning: '敵がこうげきしそうだ…！'   // 「？？」の間の表示
    },

    // ----- 設定示唆トロフィー -----
    // RASH (SUPER) が終わると rate の確率で液晶の左下にトロフィーが出る。
    // 色は「設定○以上」を示す (colors のキー = 示す設定。白は設定1以上 = どの設定でも出る、虹は設定6確定)
    //   weights: 設定ごとの、出たときの色の重み。示す設定が台の設定以下の色だけが出る。
    //            台の設定と同じ色 (出せる中でいちばん上の色) を出やすくして示唆を強めにしている
    //   minShow: 最低限表示する時間 (ミリ秒)。これを過ぎて次のレバー ON で消える
    trophy: {
        rate: 0.5,
        weights: {
            1: { 1: 100 },
            2: { 1: 55, 2: 45 },
            3: { 1: 40, 2: 20, 3: 40 },
            4: { 1: 30, 2: 15, 3: 15, 4: 40 },
            5: { 1: 25, 2: 10, 3: 10, 4: 15, 5: 40 },
            6: { 1: 20, 2: 10, 3: 10, 4: 10, 5: 15, 6: 35 }
        },
        colors: {
            1: { name: '白', main: '#f2f2f2', light: '#ffffff', dark: '#a8a8b8' },
            2: { name: '青', main: '#3f8cff', light: '#a8ccff', dark: '#1d4ea8' },
            3: { name: '緑', main: '#3fcf5f', light: '#a8f0b8', dark: '#1d7a33' },
            4: { name: '紫', main: '#a860ff', light: '#d8b8ff', dark: '#5a2a9a' },
            5: { name: '赤', main: '#ff3a3a', light: '#ffb0b0', dark: '#9a1a1a' },
            6: { name: '虹', rainbow: true }
        },
        minShow: 6000
    },

    // ----- データカウンター -----
    //   historySize: 大当たり履歴に残す件数 (新しい順)
    //   historyShown: 画面に表示する件数
    dataCounter: {
        historySize: 50,
        historyShown: 10
    },

    // ----- 図鑑・実績 -----
    // 図鑑 (撃破した敵・見た必殺技・トロフィーの色・記録) と実績は台移動しても残る (リセットすると消える)。
    // 実績は stat の値が value 以上になると解除:
    //   rash / super / naitei / freeze / moves / games: 合計の回数 (RASH・SUPER 突入、内定の時突破、ロングフリーズ、台移動、ゲーム数)
    //   bestCoins / bestDefeats: 1回の RASH での最高 (獲得枚数・撃破数)
    //   defeat:<敵の id>: その敵の撃破数 / trophy:<色>: その色のトロフィーが出た回数
    //   enemyKinds / specialKinds / trophyKinds: 図鑑の埋まった数 (value: 'all' は全部)
    collection: {
        achievements: [
            { id: 'firstRash', name: 'はじめてのRASH', desc: 'おにおにRASHに突入する', stat: 'rash', value: 1 },
            { id: 'firstSuper', name: 'SUPER到達', desc: 'SUPERおにおにRASHに突入する', stat: 'super', value: 1 },
            { id: 'onioni', name: '鬼退治', desc: 'おにおにを撃破する', stat: 'defeat:onioni', value: 1 },
            { id: 'naitei', name: '内定ゲット', desc: '内定の時ゾーンを突破する', stat: 'naitei', value: 1 },
            { id: 'goldDog', name: '黄金の勝利', desc: 'ゴールド金面犬を撃破する', stat: 'defeat:goldDog', value: 1 },
            { id: 'freeze', name: 'フリーズ!!', desc: 'ロングフリーズを引く', stat: 'freeze', value: 1 },
            { id: 'defeats10', name: '10人抜き', desc: '1回のRASHで10体撃破する', stat: 'bestDefeats', value: 10 },
            { id: 'coins1000', name: '千枚突破', desc: '1回のRASHで1,000枚獲得する', stat: 'bestCoins', value: 1000 },
            { id: 'coins3000', name: '大量獲得', desc: '1回のRASHで3,000枚獲得する', stat: 'bestCoins', value: 3000 },
            { id: 'rash10', name: 'RASH常連', desc: 'おにおにRASHに合計10回突入する', stat: 'rash', value: 10 },
            { id: 'rainbow', name: '虹の向こう', desc: '虹のトロフィーを出す', stat: 'trophy:6', value: 1 },
            { id: 'allTrophies', name: 'トロフィーコレクター', desc: 'トロフィーを全色出す', stat: 'trophyKinds', value: 'all' },
            { id: 'allEnemies', name: '全員撃破', desc: 'すべての敵を撃破する', stat: 'enemyKinds', value: 'all' },
            { id: 'allSpecials', name: '必殺技マスター', desc: 'すべての必殺技を見る', stat: 'specialKinds', value: 'all' },
            { id: 'moves5', name: '台選び上手', desc: '台移動を合計5回する', stat: 'moves', value: 5 },
            { id: 'games10000', name: '打ち込み1万G', desc: '合計10,000ゲーム回す', stat: 'games', value: 10000 }
        ]
    },

    // ----- キー割り当ての初期値 -----
    keys: {
        lever: 'Space',
        stop1: 'KeyJ',
        stop2: 'KeyK',
        stop3: 'KeyL'
    }
};
