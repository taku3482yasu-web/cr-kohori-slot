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
            // 2026-10-27: 城突入率は 継続率を 上げる 前の 値に 戻した (ユーザー指定)。出玉率は ミニゲーム (config.mini) で 合わせる
            1: { chance: 0.84, castleEntry: 0.95, pointBig: 0.94 },
            //   チャンス目の 倍率 (chance) は、ミニゲームに 入る 抽選にも 効くので 設定2〜6 を 合わせ直した (前は 0.87 / 0.88 / 1.24 / 1.73 / 2.50)
            2: { chance: 0.90, castleEntry: 0.98, pointBig: 0.98 },
            3: { chance: 0.96, castleEntry: 1.00, pointBig: 1.00 },
            4: { chance: 1.15, castleEntry: 1.25, pointBig: 1.28 },
            5: { chance: 1.45, castleEntry: 1.76, pointBig: 1.62 },
            6: { chance: 1.85, castleEntry: 2.55, pointBig: 2.15 }
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
            replay: 1 / 3,      // 2026-10-27: 継続率 約70% に 上げた ぶん、RASH 中の 収支を 下げるため 1/2.2 → 1/3
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
            seven: 150        // 規定値と同じ = 7揃いでSE城前へ直行 (規定値を 150 にしたので合わせた)
        },
        threshold: 150        // この値に達するとSE城前へ移動 (2026-10-23 ユーザー指定: 100→150)
    },

    // ----- ミニゲーム (2026-10-27 ユーザー指定。js/state.js の GameFlow.decideMini / miniGame) -----
    // 城突入チャレンジ (SE城前) へは、ミニゲームに 成功して 行く。チャンスポイントは 液晶では「ゲーム数」として 出し、
    // 1G ごとに +1、チャンス目・柄揃い・ポイントチャンス・ダンシングステージ・こおりチャンスタイム・長押しの チャージで ゲーム数を 足す。
    //   規定の ゲーム数 (chancePoint.threshold 150G) で 確定、early.from (100G) から は 1G ごとに early.rate の 確率 (2026-10-27 ユーザー指定)、
    //   triggers の 役を 引くと (その 確率で) ミニゲームが 決まる。
    //   決まると 液晶の ゲーム数の 数字の 色が 変わり (ミニゲームの 色。虹は 城突入まで 確定)、次の ゲームから ミニゲーム。
    //   kinds: 4 つの ミニゲーム (この 順に 成功しやすい)。games: ゲーム数 / mult: 1G ごとの 成功の 確率 (rates) に かける 倍率
    //     revealAtEnd: games ゲーム 全部 やってから 最後に 結果を 出す (おにおに特訓: 10 秒 耐えきれるか)
    //   rates: 1G ごとの 成功の 確率の もと (役ごと。1 以上は mult に 関係なく 成功)
    //   select: どの ミニゲームに なるか の 重み。count: 規定の ゲーム数 / chance: 役 (チャンス目など)。内部の モード (A / B / C / heaven) ごと
    //   rainbow: 虹 (ミニゲーム 成功 + 城突入 確定) に なる 確率 (count / chance ごと)
    // 数字は Claude が 決めた (出玉率に 合わせた。1 回の 成功率は トイレ探し 約35% < 特訓 約47% < 響かせ 約58% < ふるカワジャッジ 約74%)
    mini: {
        triggers: { chance: 0.35, bar: 0.2, melon: 0.06 },
        early: { from: 100, rate: 0.01 },   // 100G から 150G までの あいだ、1G ごとに ミニゲームに なる 確率 (規定の ゲーム数と 同じ 扱い。数字は Claude が 決めた)
        kinds: {
            toilet: { name: 'こおりくんのトイレ探しチャレンジ', short: 'トイレ探し', color: '#4f9bff', games: 5, mult: 2.6,
                success: 'トイレ発見!!', fail: 'まにあわなかった…', miss: ['ここじゃない…', 'あっちかな…？', 'もれそう…!!'] },
            training: { name: 'おにおに特訓チャレンジ', short: 'おにおに特訓', color: '#3fdf6f', games: 5, mult: 4.1, revealAtEnd: true,
                success: '特訓クリア!!', fail: 'つぶれた…', miss: ['まだまだ!!', 'あと 100 回!!', 'ぐぬぬ…'] },
            hibiki: { name: 'ひびきまくり響かせチャレンジ', short: '響かせ', color: '#c070ff', games: 5, mult: 6.3,
                success: '響いた!!', fail: '響かなかった…', miss: ['響かない…', 'もっと 大きく!!', 'もう一回!!'] },
            judge: { name: 'ふるカワジャッジ', short: 'ふるカワジャッジ', color: '#ff3a3a', games: 5, mult: 10.3,
                success: 'ジャッジ: 合格!!', fail: 'ジャッジ: 不合格…', miss: ['うーん…', 'まだ わからないよ', 'どうしようかな…'] }
        },
        rates: { chance: 1, seven: 1, sevenBar: 1, bar: 0.6, melon: 0.35, cherry: 0.2, diamond: 0.08, bell: 0.03, replay: 0.03, miss: 0.02 },
        select: {
            count: {
                A: { toilet: 30, training: 30, hibiki: 25, judge: 15 },
                B: { toilet: 25, training: 28, hibiki: 27, judge: 20 },
                C: { toilet: 18, training: 25, hibiki: 30, judge: 27 },
                heaven: { toilet: 5, training: 15, hibiki: 35, judge: 45 }
            },
            chance: {
                A: { toilet: 20, training: 30, hibiki: 30, judge: 20 },
                B: { toilet: 15, training: 28, hibiki: 32, judge: 25 },
                C: { toilet: 10, training: 25, hibiki: 35, judge: 30 },
                heaven: { toilet: 5, training: 15, hibiki: 35, judge: 45 }
            }
        },
        rainbow: { count: 0.015, chance: 0.05 }
    },

    // ----- BAR揃いの 恩恵 (2026-10-27 ユーザー指定。数字は Claude が 決めた) -----
    //   normal: 通常時 (マップ) で BAR揃い → castle の 確率で SE城前へ 直行。そのうち sure の 確率で 城突入 確定
    //   castleWait: SE城前で BAR揃い → sure の 確率で 城突入 確定 (7揃いは いつも 確定)
    barBonus: { normal: { castle: 0.2, sure: 0.3 }, castleWait: { sure: 0.3 } },

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

    // ----- 熱いときに 震える 液晶の 枠 (2026-10-24 ユーザー指定)。そのゲームの 熱さ (0〜6) が この値 以上で 赤 / 金 / 虹 -----
    hotFrame: { red: 4, gold: 5, rainbow: 6 },

    // ----- プレミア: 液晶が ひび割れて おにおにが 出てくる (2026-10-24 ユーザー指定)。確定 (熱さ 6) の ゲームの rate で、リールが 回る 前に -----
    premiumCrack: { rate: 0.15 },

    // ----- こおりチャンスタイム (通常時。ユーザー指定 2026-10-23: 通常時が長くなったので演出を増やす) -----
    // 通常時のマップで triggers の役が出たとき、その確率で突入。games ゲームの間、チャンスポイントの加算
    // (1ゲームごと・チャンス目・柄揃い) が multiplier 倍。ふるカワが応援しながら (2026-10-24 ユーザー指定: ともいし → ふるカワ)こおりくんの後ろを付いてくる。
    // SE城前に着く・ダンシングステージに入ると終わる。リベンジチャンス中は入らない
    chanceTime: {
        triggers: { chance: 0.25, bar: 0.2, melon: 0.06, cherry: 0.02 },
        games: 10,
        multiplier: 2,
        // ふるカワの セリフ (2026-10-24 ユーザー指定: いろいろ 出す)。startLines: 入るときの カットイン (1 つ選ぶ) /
        //   cheerLines: 後ろを 付いてくる あいだの 吹き出し (順に 入れかわる)
        startLines: ['こおりくん、チャンスだよ！', '今だよ、こおりくん！', 'ポイント2倍だって！ 急いで！', 'ふるカワが応援してあげる♪', 'ここで一気に稼ごっ！'],
        cheerLines: ['がんばって！', 'いけいけ〜！', 'ポイントざくざく♪', 'こおりくん、ファイト！', 'SE城前まで、あと少し！', 'うちの実家より稼げるかも…？', 'その調子だよ！']
    },

    // ----- 通常時の予告 (ユーザー指定 2026-10-23。キャラとセリフはパチンコ・新作のスロットを参考にした) -----
    // レバー ON で出す。どれを出すかはそのゲームの役で決める (期待度は役しだい。演出だけで、出目や抽選は変えない)。
    // カットインは期待度の演出 (config.hype・js/hype.js) のものを使う (ユーザー指定)。そのカットインが出たゲームでは、この予告は出さない
    // 役の分類: premium (7揃い・7・7・BAR = SE城前へ直行) / hot (チャンス目・BAR = ポイント大量) / warm (スイカ・チェリー) / cold (ほか)
    //   rate:   何かの予告が出る確率 / kinds: 出たときの種類の振り分け
    //   stepUp: ステップアップ予告 (パチンコと同じ)。何段目まで行くか・3段目の文字の色。series はキャラの組 (期待度は同じ)
    //   gun:    群予告 (パチンコと同じ)。ひびきまくり群は hot 以上だけ (チャンス目以上確定)
    notice: {
        classes: { seven: 'premium', sevenBar: 'premium', chance: 'hot', bar: 'hot', melon: 'warm', cherry: 'warm' },
        rate: { premium: 0.6, hot: 0.35, warm: 0.15, cold: 0.02 },
        kinds: {
            premium: { stepUp: 50, gun: 50 },
            hot: { stepUp: 65, gun: 35 },
            warm: { stepUp: 90, gun: 10 },
            cold: { stepUp: 90, gun: 10 }
        },
        stepUp: {
            outcomes: {
                premium: { s3gold: 60, s3red: 30, s3white: 10 },
                hot: { s3gold: 20, s3red: 40, s3white: 25, s2: 15 },
                warm: { s3gold: 2, s3red: 18, s3white: 30, s2: 30, s1: 20 },
                cold: { s3red: 3, s3white: 12, s2: 35, s1: 50 }
            },
            stepMs: 650,
            textColors: { white: '#ffffff', red: '#ff3a3a', gold: '#ffd040' },
            series: [
                [['koori', 'こおりくん、出発！'], ['koori', 'SE城を目指せ！'], ['koori', 'ツラヌケ！！']],
                [['furukawa', 'ふるカワが見てる…'], ['furukawa', 'ふるカワが応援！'], ['furukawa', 'ふるカワ大興奮！！']],
                [['tomoishi', 'ともいし登場'], ['tomoishi', 'お金返しなさい！'], ['tomoishi', '今すぐ返しなさい！！']],
                [['yasu', 'やすさん登場！'], ['tamu', 'たむさんも来た！'], ['dake', 'だけさんで全員集合！！']],
                [['onioni', 'おにおにの気配…'], ['onioni', 'おにおにが怒った！'], ['onioni', 'おにおに激怒！！']]
            ]
        },
        gun: {
            premium: { hibikimakuri: 50, koori: 25, onioni: 25 },
            hot: { hibikimakuri: 30, koori: 35, onioni: 35 },
            warm: { koori: 50, onioni: 50 },
            cold: { koori: 50, onioni: 50 },
            names: { koori: 'こおり群', onioni: 'おにおに群', hibikimakuri: 'ひびきまくり群' },
            ms: 1600
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
        chanceBoost: 1.5,     // SE城前 (チャレンジ前の待機中) でチャンス目を引いたときの突入率の倍率 (こおりくんが赤いオーラをまとう)
        // 仲間・オーラの倍率がこれより小さいときは、この倍率にする (ユーザー指定: 仲間なし・オーラなしの成功率を少し上げる)。
        // 仲間なし・オーラなしの設定1で約28% → 約31% (出玉率を戻すために下げた設定1〜5 のチャンス目の倍率込み)。やすさんだけ (×1.15) も同じになる
        minBoost: 1.3
    },

    // ----- おにおにRASH -----
    rash: {
        // continueRate: 目標の継続率 (1セットごと。撃破役・役での撃破率 UP・仲間の肩代わり・復活で続くぶんも含めた最終的な値)
        // 2026-10-27 から、セットを勝ちにする確率は キャラごとの 撃破率 (enemies の killRate / superKillRate と config.killRate) で決める
        //   (前の 先決めの確率 presetRate 通常 0.330 / SUPER 0.795 の かわり)。数字を変えたら シミュレーションで 出玉率を 合わせ直す
        //   2026-10-27 ユーザー指定: 通常の RASH は 約70% (シミュレーターの セット継続率 70.4%)。SUPER は 撃破率を 少し 下げて 約85% (85.3%)
        normal: { continueRate: 0.70 },   // おにおにRASH
        super: { continueRate: 0.85 },    // SUPERおにおにRASH
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
        // SUPER中はおにおにを常に候補に入れるか
        superOniAlwaysAvailable: true,
        // おにおにの出やすさ (ユーザー指定 2026-10-23: RASH が続くほど出やすく、10連で 50%、それ以降はずっと 50%)
        //   連 = セットを勝った回数 (撃破・「？？」の継続・仲間の肩代わり・復活・内定の時ゾーン突破で1連ずつ。1回の RASH 内で数える)
        //   unlockStreak: この連数で対戦相手の候補に入る (「おにおにが現れる…!?」)。このときは重みどおりの確率 (約13%)
        //   maxStreak・maxRate: そこから maxStreak 連までまっすぐ上げて maxRate にし、それ以降はずっと maxRate (SUPER 中は連数で変わらない)
        oni: { unlockStreak: 3, maxStreak: 10, maxRate: 0.5 }
    },

    // ----- 上乗せ特化ゾーン (ユーザー指定 2026-10-23) -----
    // おにおにの撃破の報酬。ほかの敵の撃破でも trigger の確率で突入する。games ゲームの間 BATTLE は中断し、
    // 1ゲームごとに、出目 (役) に応じて addTable の枚数を上乗せする。終わったら合計をまとめて払い出す。
    //   min: 保障 (合計がこれより少なければ min 枚にする) / max: 上限 (ユーザー指定 2026-10-23: 1000枚)
    //   kinds: 4つの見せ方。突入したらプレイヤーが選ぶ (ユーザー指定: 新作と同じ。前に選んだものを最初に選んでおき、10秒で決まる)。
    //          上乗せの確率はどれも同じで、見せ方だけちがう
    //     fire:    こおりファイアー   1G ごとに上乗せを出す (炎の色で大きさ)
    //     okaLamp: おかランプ         レバーの瞬間、チャンス役でランプが点灯 (7揃い・7・7・BAR は虹色)。止まったら上乗せを出す
    //     ikkeki:  おにおに一撃入魂   上乗せは見せずに溜め、最後のゲームのあとに一撃で合計を出す
    //     asahara: ASAHARA CHANCE    一発告知。合計が tiers に届いたゲームで ASAHARA FLASH → SASAKI・KOTANI が集まる
    //              (どちらか1人で 500枚以上確定、2人そろえば 1000枚以上確定)
    tokka: {
        trigger: { onioni: 1, goldDog: 0.1, naitei: 1, others: 0.02 },   // ナイナイは確定 (ユーザー指定)。金面犬は出玉率を戻すため 30% → 10%
        games: 10,
        min: 300,
        max: 1000,
        kinds: ['fire', 'okaLamp', 'ikkeki', 'asahara'],
        selectMs: 10000,
        names: { fire: 'こおりファイアー', okaLamp: 'おかランプ', ikkeki: 'おにおに一撃入魂', asahara: 'ASAHARA CHANCE' },
        lottery: {
            replay: 1 / 2.5,
            bell: 1 / 6,
            diamond: 1 / 12,
            cherry: 1 / 15,
            melon: 1 / 25,
            bar: 1 / 40,
            seven: 1 / 120,
            sevenBar: 1 / 150,
            chance: 1 / 20
        },
        // 役ごとの上乗せ枚数 (枚: 重み)
        addTable: {
            miss: { 5: 50, 10: 40, 30: 10 },
            replay: { 10: 60, 20: 30, 50: 10 },
            bell: { 10: 50, 20: 35, 50: 15 },
            diamond: { 20: 50, 50: 35, 100: 15 },
            cherry: { 30: 50, 50: 35, 100: 12, 300: 3 },
            melon: { 50: 40, 100: 40, 200: 15, 300: 5 },
            chance: { 50: 40, 100: 40, 200: 15, 500: 5 },
            bar: { 100: 50, 200: 35, 300: 10, 500: 5 },
            seven: { 300: 40, 500: 40, 1000: 20 },
            sevenBar: { 300: 30, 500: 40, 1000: 30 }
        },
        // おかランプが点灯する役 (rainbowRoles は虹色)
        lampRoles: ['diamond', 'cherry', 'melon', 'chance', 'bar', 'seven', 'sevenBar'],
        rainbowRoles: ['seven', 'sevenBar'],
        // ASAHARA CHANCE: 合計がこの枚数に届いたら ASAHARA FLASH (1つ目でどちらか1人、2つ目でもう1人。2人そろえば上限の1000枚)
        tiers: [500, 1000]
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
    // 暗転 →「ここから先」「内定を持たぬものは通す事は出来ない」→ 仲間抽選 → enemy と games ゲームの真剣勝負
    //   companionRates: 突入時の仲間抽選。まだ仲間でない人それぞれが、この確率で加わる
    //   winRates:       突破の抽選。ゾーン中の1ゲームごとに、出目 (役) に応じたこの確率で突破が当たる
    //                   当たると HP に関係なく「とどめだ!!」で撃破。games ゲームで当たらなければ失敗
    //                   ふつうのダメージでは倒しきれない (HP1 でガード)。肩代わりもない
    //                   突破率は lottery.battle と winRates から計算される (約45%、Battle.naiteiWinRate)。
    //                   負けの1割はアルアルの復活で突破になるので (aruaru)、合わせて約50% (アルアル追加前と同じ)
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
            chance: 0.45,
            bar: 0.41,
            melon: 0.2,
            cherry: 0.12,
            diamond: 0.04,
            bell: 0.016,
            replay: 0.008,
            miss: 0.008
        },
        companionRates: { yasu: 0.5, tamu: 0.35, dake: 0.2 },
        enemy: {
            id: 'naitei', name: 'シーシャ・ナイテイ・ナイナイ',
            special: '不採用の裁き',   // 突破できなかったときの必殺技
            lines: { special: 'お前に内定はない！' },
            hp: 200,
            bonus: { type: 'coins', value: 300 }
        },
        // 敗北したときの復活 (ユーザー指定): rate の確率で、兄のシーシャ・ナイテイ・アルアル (王冠) が現れ、
        // 必殺技でナイナイを一撃で倒す。突破と同じ扱い (突破ボーナス・SUPER へ・図鑑の撃破・実績)
        //   ナイナイの必殺技 → 暗転 →「あきらめるな」(赤) →「君には」→ 赤が少しずつ虹色に →「内定がある！！」→ アルアル登場 → 必殺技
        aruaru: { rate: 0.1, id: 'aruaru', name: 'シーシャ・ナイテイ・アルアル', special: '採用の祝福' },
        timing: {             // ミリ秒
            black: 800,       // 暗転
            text1: 1400,      // 「ここから先」
            text2: 2800,      // 「内定を持たぬものは通す事は出来ない」
            getBlack: 700,    // 突破: 暗転
            getText: 1600,    // 突破:「内定は」
            getRainbow: 3600, // 突破: 虹色の「こおりがいただいた！」とこおりくんのドアップ
            aruBlack: 900,    // アルアルの復活: 暗転
            aruGiveUp: 1500,  // 「あきらめるな」(赤)
            aruYou: 1300,     // 「君には」
            aruRainbow: 1600, // 赤が少しずつ虹色に
            aruHave: 2200     // 「内定がある！！」
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

    // ----- 撃破率 (2026-10-27 ユーザー指定。js/battle.js) -----
    // RASH の BATTLE で、そのセットを勝ち (撃破 か「？？」で継続) にする確率。液晶の右上に % で出す。
    //   セットの始めは キャラごとの 値 (enemies の killRate / SUPER は superKillRate。数字は Claude が 決めた)。勝利確定の BATTLE は 100%
    //   add: 役を引いたときに 上がる 量 (強い役・チャンス目ほど 大きい)。'kill' の役 (config.damage) は 100%
    //   breakAdd: ブレイクしたときに 上がる 量。上限は 100%
    //   revivalShow: 復活の 撃破で 出す 撃破率 (表示だけ。7.77 = 777%)
    killRate: {
        add: { diamond: 0.02, cherry: 0.05, melon: 0.08, chance: 0.25 },
        breakAdd: 0.2,
        revivalShow: 7.77,
        // 数字の 色 (2026-10-27 ユーザー指定): 高い ほど 強い 色。白 < 青 < 緑 < 紫 < 赤 < 虹 (虹は 100% = 確定)。min 以上で その 色
        colors: [
            { min: 0, color: '#ffffff' },
            { min: 0.2, color: '#4f9bff' },
            { min: 0.4, color: '#3fdf6f' },
            { min: 0.6, color: '#c070ff' },
            { min: 0.8, color: '#ff3a3a' },
            { min: 1, color: 'rainbow' }
        ],
        splashMs: 1800,   // 敵が 出てきたときの 全画面の「撃破率 〇〇%」の 時間
        // 違和感演出 (2026-10-27 ユーザー指定): 撃破率が 7% か 77% と 出たら 撃破 確定。勝ちの セットの rate で、本当の 値の かわりに values を 見せる。
        //   ふつうの 撃破率が 7% / 77% に なるときは 8% / 78% に ずらす (Battle.safeRate)
        fake: { rate: 0.06, values: [0.07, 0.77] },
        // 敵の 名前の 色 (2026-10-27 ユーザー指定): 撃破が 確定して いる セット (勝ちの セット) だけ、red / gold の 確率で 赤字 / 金字 (撃破率 100% は 金字)。ふだんは 白
        nameColors: { red: 0.25, gold: 0.08 }
    },

    // ----- 長押しの チャージ (2026-10-27 ユーザー指定。js/state.js・battle.js) -----
    // 結果の 前の PUSH が「長押し」に なる ゲームは、ためきる (フルチャージ) と 得を する。ためきれなかったら 何も ない (2026-10-27 ユーザー指定)。
    //   長押しに なるかは 台の 抽選 (rate。js/state.js の GameFlow.drawCharge / battleChargeChance)。シミュレーターは いつも ためきる として 数える
    //   normal: 通常時 (マップ)。その ゲームの チャンスポイントの 加算が mult 倍
    //   castle: 城突入チャレンジ。その ゲームの 突入率が mult 倍
    //   battle: RASH の BATTLE。撃破率が add 上がる
    // 数字は Claude が 決めた
    charge: {
        normal: { rate: 0.03, mult: 2 },
        castle: { rate: 0.1, mult: 1.5 },
        battle: { rate: 0.06, add: 0.15 }
    },

    // ----- ブレイク -----
    // BATTLE 中に rates の役が出たとき、その確率でブレイク状態に (今の敵を倒すか RASH が終わるまで続く)。
    // 2026-10-27 から、ブレイクしたら 撃破率が killRate.breakAdd 上がる (前は 敵が ガードできなく なった)
    breakState: {
        rates: {
            cherry: 0.25,     // チェリー揃い
            chance: 0.50      // チャンス目
        }
    },

    // ----- とどめの一撃 -----
    // BATTLE 中、ガードを崩せない役の攻撃が敵にガードされたとき、rates の確率で「とどめの一撃!」のカットイン。
    // ガードで HP1 残ったところへ、ガード無視の 1 ダメージで撃破する (ユーザー指定。1〜3%)
    finalBlow: {
        rates: {
            replay: 0.01,     // リプレイ
            diamond: 0.02,    // ダイヤ
            melon: 0.03       // スイカ
        }
    },

    // ----- 対戦相手 -----
    // weight: 通常RASHでの出現の重み / superWeight: SUPER中の重み
    // bonus.type: 'coins' (コイン獲得) / 'games' (ゲーム数上乗せ) / 'probUp' (柄揃い確率アップ)
    // special: 必殺技の名前 (「？？」で継続できなかったとき、カットインとともに打ってくる)
    // lines: 吹き出しのセリフ (ユーザー指定)。intro: 出てきたとき / special: 必殺技を打つ前。ないものは言わない
    enemies: [
        {
            id: 'okagappa', name: 'おかがっぱ', special: 'おかピポっと光線',
            lines: { intro: 'ま～だまだ戦わねば！', special: 'おかピポ！イェア！' },
            weight: 50, superWeight: 40, hp: 60, killRate: 0.4, superKillRate: 0.66,
            bonus: { type: 'coins', value: 35 }   // 2026-10-23 A5 で BIG・REG を足して 35 → 20 にしたが、BIG・REG を消したので 35 に戻した
        },
        {
            id: 'hibikimakuri', name: 'ひびきまくり', special: '大音響4DX',
            lines: { intro: '響きです。', special: 'これが４DXだ！' },
            weight: 30, superWeight: 25, hp: 90, killRate: 0.36, superKillRate: 0.61,
            bonus: { type: 'games', value: 5 }
        },
        {
            id: 'shibata', name: 'シバター', special: 'シバタードライバー',
            lines: { intro: 'ぶんぶん！', special: 'バーイ！' },
            weight: 15, superWeight: 15, hp: 120, killRate: 0.32, superKillRate: 0.56,
            bonus: { type: 'probUp', value: 1.5, games: 10 }
        },
        {
            id: 'sasaki', name: 'Mr.SASAKI', special: 'ASAスラッシュ',
            lines: { intro: 'どうも、しご出来です。', special: '締め切り厳守です。' },
            weight: 8, superWeight: 12, hp: 150, killRate: 0.28, superKillRate: 0.51,
            bonus: { type: 'coins', value: 120 }   // 2026-10-23 A5 で 120 → 60 にしたが、BIG・REG を消したので 120 に戻した
        },
        {
            id: 'onioni', name: 'おにおに', special: '鬼鬼の金棒',
            lines: { special: '金返せ！' },
            weight: 16, superWeight: 15, hp: 200, killRate: 0.08, superKillRate: 0.41,
            bonus: { type: 'tokka' },     // 撃破の報酬は上乗せ特化ゾーン (300枚保障。tokka)
            requiresUnlock: true          // 連数が rash.oni.unlockStreak に達するまで出ない (SUPER 中は常に候補)
        }
    ],

    // ----- ゴールド金面犬 (SUPER中のみ) -----
    goldDog: {
        id: 'goldDog', name: 'ゴールド金面犬', special: 'ゴールドかみまっくす',
        lines: { intro: 'ワン！（自信ありげ）', special: 'ワン！（邪悪な笑み）' },
        prob: 1 / 100,        // SUPER中の対戦相手抽選ごとの出現確率
        hp: 250,
        killRate: 0.3, superKillRate: 0.3,   // 撃破率 (ゴールド金面犬は SUPER 中だけ)
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
            enemyTalk: 1100,  // 敵のセリフの吹き出し (出てきたとき・必殺技の前)
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

    // ----- 期待度の演出 (2026-10-23 アップグレード A3。js/hype.js。数字は Claude の 案) -----
    // そのゲームの 熱さ (ふるカワの heat。0〜6) ごとの 出やすさ。配列の 番号が 熱さ。
    // 高い 色・強い 演出ほど 熱い ゲームでしか 出ないので、色の 順に 期待度が 上がる (虹・確定音は 熱さ 6 だけ)
    hype: {
        cutin: {
            // 出たら 熱い (熱さ 4 以上) 割合の 目安: 青 約10%・緑 約25%・赤 約50%・金 約80%・虹 100% (ASO の 案と 同じ)。
            // 熱さ 0〜3 でも ときどき 出る (ガセ)。tools/test.js で 測る
            rates: [0.0144, 0.06, 0.25, 0.5, 0.4, 0.6, 0.85],  // カットインが 出る 確率
            colors: [                                          // 出たときの 色の 重み
                { blue: 36, green: 17, red: 35, gold: 12 },
                { blue: 50, green: 30, red: 20 },
                { blue: 30, green: 40, red: 30 },
                { green: 30, red: 40, gold: 30 },
                { blue: 10, green: 20, red: 45, gold: 25 },
                { red: 35, gold: 65 },
                { gold: 40, rainbow: 60 }
            ],
            colorCodes: { blue: '#2a5ad8', green: '#1a9a4a', red: '#c81828', gold: '#b8860b', rainbow: 'rainbow' },
            duration: 1300
        },
        // カットインに 出る キャラと セリフ (色ごとの 顔ぶれ。ふつうは キャラで 期待度は 変わらない。セリフは 案)
        //   minHeat: その 熱さ 以上の ゲームだけ 出る (2026-10-27 ユーザー指定: こおりくんの「大チャンス!!」は 熱さ 4 以上だけ = 出たら 熱い)
        cast: {
            blue: [{ who: 'koori', text: 'チャンス…？' }, { who: 'yasu', text: 'きてるかも！' }, { who: 'tamu', text: 'いけるで！' }, { who: 'dake', text: 'よっしゃ！' }, { who: 'furukawa', text: 'チャンスだよ！' }],
            green: [{ who: 'koori', text: 'チャンス！' }, { who: 'yasu', text: 'これは いける！' }, { who: 'tamu', text: 'ええ流れや！' }, { who: 'dake', text: 'きたきた！' }, { who: 'furukawa', text: 'いけるいける！' }],
            red: [{ who: 'koori', text: '大チャンス!!', minHeat: 4 }, { who: 'dake', text: 'これは熱い！' }, { who: 'onioni', text: '来るなら来い!!' }, { who: 'tomoishi', text: 'こおり、がんばって！' }],
            gold: [{ who: 'koori', text: '激アツ!!' }, { who: 'onioni', text: 'ぐぬぬ…!!' }, { who: 'tomoishi', text: '内定は まだなの!?' }, { who: 'furukawa', text: '激アツだよ!!' }],
            rainbow: [{ who: 'koori', text: 'こおりいきていける！' }]
        },
        sakibareRates: [0.003, 0.01, 0.03, 0.08, 0.2, 0.4, 0.6],   // 先バレ音 (レバー ON で 鳴る)
        kakuteiRate: 0.35,                                          // 確定音 (熱さ 6 の とき)
        goldRates: [0, 0, 0, 0, 0.02, 0.15, 0.4],                   // 金発光 (筐体が 金色に 光る)
        flash: [                                                    // フラッシュ: none / weak (リール) / strong (液晶と リール)
            { none: 100 },
            { none: 96, weak: 4 },
            { none: 85, weak: 15 },
            { none: 70, weak: 25, strong: 5 },
            { none: 55, weak: 30, strong: 15 },
            { none: 40, weak: 25, strong: 35 },
            { none: 30, weak: 20, strong: 50 }
        ],
        // PUSH ボタン: 全リールが 止まった あと、結果の 前に 出る。色 白 < 青 < 赤 < 金 < 虹。激熱は 飛び出す
        push: {
            rates: [0.004, 0.02, 0.05, 0.1, 0.25, 0.45, 0.6],
            colors: [
                { white: 85, blue: 15 },
                { white: 70, blue: 25, red: 5 },
                { white: 80, blue: 20 },
                { white: 50, blue: 40, red: 10 },
                { white: 20, blue: 35, red: 40, gold: 5 },
                { blue: 15, red: 50, gold: 35 },
                { red: 20, gold: 40, rainbow: 40 }
            ],
            popRates: [0, 0, 0, 0, 0.05, 0.25, 0.5],               // 飛び出す 確率
            modes: { tap: 65, long: 20, mash: 15 },                 // 押し方: 1 回 / 長押し / 連打
            longMs: 900,                                            // 長押しの 長さ
            mashCount: 6,                                           // 連打の 回数
            autoMs: 8000,                                           // 押さなかったら この時間で 進む
            colorCodes: { white: '#f2f2f2', blue: '#3f8cff', red: '#ff3a3a', gold: '#ffd700', rainbow: 'rainbow' }
        },
        // 結果に 合わせた PUSH (2026-10-27 ユーザー指定。Hype.reveal): RASH の BATTLE (撃破するか) と 城突入チャレンジ (突入するか)。
        //   win: 勝つ ときの 色の 重み / reliability: 出たら 勝つ 割合 (赤以上は 80% 以上) / lose: 負ける ときの 残りを 白・青に 分ける 重み
        //   lever: 「レバーを叩け!!」。win: 勝つ ときに PUSH の かわりに 出る 割合、reliability: 出たら 勝つ 割合 (90%)
        //   PUSH が 出るかは 前と 同じ 熱さで 決める (push.rates)。数字は Claude が 決めた (reliability は ユーザー指定)
        reveal: {
            win: { white: 15, blue: 20, red: 35, gold: 20, rainbow: 10 },
            reliability: { red: 0.8, gold: 0.9, rainbow: 1 },
            lose: { white: 65, blue: 35 },
            lever: { win: 0.2, reliability: 0.9 }
        }
    },

    // ----- レバーの 演出 (2026-10-24 ユーザー指定。js/lever.js。数字は Claude が 決めた 案) -----
    //   tataki: 結果の 前の PUSH を「レバーを叩け！」に する。rates は 熱さ 0〜6 ごと (PUSH が 出た ときの 割合)、
    //     rashRate: RASH 中 (確定の 熱さ 6 だけ)、change: はじめ PUSH で、押すと (押さなくても changeMs で) 変わる 割合
    //   buru: レバブル (レバー ON で 金棒が 震える)。rates は 熱さ 0〜6 ごと、ms は 震える 時間
    //   okure: 遅れ (リールが 遅れて 回り出す)。役の 分類 (config.notice.classes) ごと。hot / premium だけ (チャンス目・BAR 以上)
    //   reverse: 逆回転 (リールが しばらく 逆に 回る)。7揃い・7・7・BAR・ロングフリーズ の うち rate
    lever: {
        tataki: { rates: [0, 0, 0, 0.03, 0.12, 0.3, 0.45], rashRate: 0.35, change: 0.4, changeMs: 900 },
        buru: { rates: [0.002, 0.005, 0.02, 0.05, 0.15, 0.3, 0.45], ms: 1200 },
        okure: { rates: { premium: 0.3, hot: 0.2 }, ms: 520 },
        reverse: { rate: 0.25, ms: 1500 },
        // STOP の 色 (2026-10-24 ユーザー指定): 第 3 停止の 前に、のこりの STOP と リールの 上の ランプが 光る。青 < 赤 < 金 < 虹 (虹は 確定の 熱さ 6 だけ)。
        //   rates: 熱さ 0〜6 ごとの 出る 割合、colors: 熱さごとの 色の 重み
        stopTier: {
            rates: [0, 0.02, 0.04, 0.08, 0.25, 0.45, 0.6],
            colors: [{ blue: 80, red: 20 }, { blue: 80, red: 20 }, { blue: 70, red: 30 }, { blue: 50, red: 40, gold: 10 },
                { blue: 20, red: 45, gold: 35 }, { red: 40, gold: 60 }, { red: 15, gold: 45, rainbow: 40 }],
            colorCodes: { blue: '#3f8cff', red: '#ff3a3a', gold: '#ffd700', rainbow: 'rainbow' }
        },
        // 第 3 停止の 長押し (2026-10-24 ユーザー指定): のこりの STOP を 長押しして ためないと 止まらない。ためきって 離すと 止まる。
        //   rates: 熱さ 0〜6 ごと、ms: ためきるまでの 時間
        longStop: { rates: [0, 0, 0, 0.02, 0.1, 0.25, 0.35], ms: 900 },
        // 連続予告「？」(2026-10-24 ユーザー指定): 前兆 (js/zencho.js) の あいだ、レバー ON の たびに「？」が 1 つずつ 増える (4 つまで)。
        //   色は 1 つ目から 白 → 青 → 赤 → 金
        question: { colors: ['#ffffff', '#3f8cff', '#ff3a3a', '#ffd700'], ms: 1500 }
    },

    // ----- モード・ゾーン・天井 (2026-10-23 アップグレード A5。最新のスロット koori-slot の 仕様書から) -----
    // 前回の RASH からの ゲーム数 (gamesSinceHit) で 見る。モードは RASH が 終わったときに 設定ごとの 重みで 抽選 (画面には 出さない)
    //   zones: { at: このゲーム数から zoneLength G (天国は length), hit: SE城前へ 直行する 確率 }。当たりなら ゾーンの どこかの ゲームで 直行
    //   ceiling: ここに 着いたら 城突入 確定 (ナイナイ か アルアル の カットイン)
    modes: {
        weights: {
            1: { A: 50, B: 30, C: 15, heaven: 5 },
            2: { A: 49, B: 30, C: 16, heaven: 5 },
            3: { A: 47, B: 31, C: 17, heaven: 5 },
            4: { A: 43, B: 32, C: 18, heaven: 7 },
            5: { A: 37, B: 32, C: 20, heaven: 11 },
            6: { A: 31, B: 32, C: 22, heaven: 15 }
        },
        zones: {
            A: [{ at: 300, hit: 0.25 }, { at: 600, hit: 0.5 }],
            B: [{ at: 200, hit: 0.35 }, { at: 500, hit: 0.5 }],
            C: [{ at: 100, hit: 0.4 }, { at: 300, hit: 0.6 }],
            heaven: [{ at: 0, length: 100, hit: 1 }]
        },
        zoneLength: 30,
        ceiling: { A: 777, B: 777, C: 400, heaven: 777 },
        heavenCutinRate: 0.25,          // 天国の はじまりに シーシャ・ナイテイの カットイン (出たら 天国 確定)
        aruaruCeilingRate: 0.2,         // 天井で アルアルが 出る 割合 (ほかは ナイナイ)
        hintRate: 0.3,                  // RASH が 終わったとき ふるカワが モードを ほのめかす 確率
        hints: {
            A: ['のんびり いこう！', 'つぎも がんばろうね'],
            B: ['ちょっと 早めに 来るかも？', 'そろそろ 何か ありそう…'],
            C: ['なんだか すぐ 来そうな 気がする！', '早めに チャンスが 来るかも！'],
            heaven: ['すぐに また 会えそう！！', 'まだまだ 終わらないよ！！']
        }
    },

    // ----- 前兆と 違和感演出 (2026-10-23 アップグレード A4。js/zencho.js。数字は Claude の 案) -----
    // 残りの ゲームが minLeft〜startWithin の あいだ、ゲームごとに 本物 (当たりが 決まっている) なら realRate・
    // 外れなら fakeRate で 前兆が 始まる (ガセ前兆)。dance の 最後の ゲームは 発表の ゲームなので minLeft 2
    zencho: {
        dance: { minLeft: 2, startWithin: 4, realRate: 0.55, fakeRate: 0.05 },
        battle: { minLeft: 1, startWithin: 3, realRate: 0.5, fakeRate: 0.08 },
        // 違和感演出: 本前兆の ゲーム real・ガセ前兆の ゲーム fake・前兆なし random の 確率。種類は 重み
        //   noise 液晶に ノイズ / silent 音が 消える / reverse リールが 逆に 回って 始まる / button STOP が 紫に 光る
        iwakan: { real: 0.2, fake: 0.04, random: 0.0008, kinds: { noise: 35, silent: 25, reverse: 20, button: 20 } }
    },

    // ----- 必殺技 -----
    // こおりくんがとどめを刺したときのカットイン (killRole: 一撃必殺の役 = BAR揃い・7揃い・7・7・BAR、内定の時の 7揃い・7・7・BAR)
    // 敵・仲間の必殺技は enemies / goldDog / naitei.enemy / companions.members の special
    specials: {
        koori: '大腸炎アタック',
        kooriKill: '7つの内定フラッシュ',
        kooriNaitei: 'ばりきつよめのレクイエム',   // 内定の時ゾーンを突破したとき (ユーザー指定)
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

    // ----- RASH 終了画面 (設定示唆の1枚絵。ユーザー指定) -----
    // RASH (SUPER) が終わって通常時に戻る前 (内定の時の失敗で SE城前に戻るときも) に、液晶に1枚絵を出す。
    // 絵ごとに出る台の設定が決まっている (min: 設定○以上でだけ出る / parity: 'even' 偶数・'odd' 奇数の設定でだけ出る)。
    // 台の設定で出せる絵の中から weight の重みで選ぶ。こおりくんはどの設定でも出る (示唆なし)
    //   hint: 遊び方・設定推測に出す意味 / showTime: 表示する時間 (ミリ秒)
    endCard: {
        showTime: 3000,
        cards: [
            { id: 'koori', name: 'こおりくん', hint: 'デフォルト', weight: 40 },
            { id: 'yasu', name: 'やすさん', hint: '設定1以上', min: 1, weight: 20 },
            { id: 'tamu', name: 'たむさん', hint: '設定2以上', min: 2, weight: 15 },
            { id: 'dake', name: 'だけさん', hint: '設定3以上', min: 3, weight: 10 },
            { id: 'furukawa', name: 'ふるカワ', hint: '偶数設定', parity: 'even', weight: 10 },
            { id: 'tomoishi', name: 'ともいし', hint: '奇数設定', parity: 'odd', weight: 10 },
            { id: 'onioni', name: 'おにおに', hint: '設定3未満否定', min: 3, weight: 8 },
            { id: 'okagappaHibiki', name: 'おかがっぱ・ひびきまくり', hint: '設定4以上', min: 4, weight: 8 },
            { id: 'sasakiShibata', name: 'Mr.SASAKI・シバター', hint: '設定5以上', min: 5, weight: 8 },
            { id: 'everyone', name: 'みんなの集合絵', hint: '設定6確定', min: 6, weight: 6 },
            { id: 'goldDog', name: 'ゴールド金面犬', hint: '設定6確定', min: 6, weight: 4 }
        ]
    },

    // ----- データカウンター -----
    //   historySize: 大当たり履歴に残す件数 (新しい順)
    //   historyShown: 画面に表示する件数
    dataCounter: {
        historySize: 50,
        historyShown: 10
    },

    // ----- 復活演出 -----
    // 「？？」で揃わず (仲間の肩代わりもなく) RASH が終わるとき、rates[モード] の確率で復活が決まる (ユーザー指定)。
    // 液晶は「RASH終了…」のあと通常時に戻らず暗いまま止まり、次のレバー ON で暗転 → こおりくんが光り輝いて
    // 「こおりまだまえる！」→ 戦っていた敵を撃破して RASH 継続
    revival: {
        rates: { RASH: 0.1, SUPER_RASH: 0.15 },
        text: 'こおりまだまえる！'
    },

    // ----- ふるカワ (液晶の右下に出てきて、吹き出しでしゃべる) -----
    // レバー ON でそのゲームの熱さ (0〜6) を決め、appearRates[熱さ] の確率で出現する (js/furukawa.js)
    //   heat:         熱さの決め方。normal / battle は役ごと、entrySteps は城突入チャレンジの突入率の段階、naiteiSteps は内定の時ゾーンの突破率の段階
    //                 (突入率がいくつ以上の段を超えたか = 熱さ)、questionWin は「？？」で継続するとき
    //   colorWeights: 熱さごとの、吹き出しの文字の色の重み (0:白 1:青 2:緑 3:紫 4:赤 5:金 6:虹)。虹は確定
    //   chanceLines:  色が赤以上のときのセリフ / expectLines: 緑・紫のとき半分の確率で言うセリフ
    //   rashChanceLines / rashExpectLines: RASH 中はこちら (攻めるセリフ)
    //   kindWeights:  それ以外のときのセリフの種類 (hint: ヒント / stage: 今の状況 / setting: 設定示唆)
    //   settingLines: 設定示唆のセリフ。weights は台の設定ごとの重み (0 の設定では言わない = それ以上確定)
    // ----- ともいし (こおりくんのお母さん) -----
    // SUPERおにおにRASH に到達するとカットインで出てくる (図鑑の説明もそこで解禁)
    tomoishi: {
        name: 'ともいし',
        superLines: ['お金返しなさい！', '内定はまだなの？', 'こおり、がんばって！']
    },

    furukawa: {
        name: 'ふるカワ',
        talkTime: 3200,       // 吹き出しを出しておく時間 (ミリ秒)
        appearRates: [0.04, 0.08, 0.15, 0.3, 0.5, 0.7, 1.0],
        heat: {
            normal: { seven: 5, chance: 4, bar: 3, melon: 2, cherry: 1, diamond: 1 },
            revengeChance: 5,
            battle: { sevenBar: 6, seven: 5, bar: 5, chance: 4, melon: 2, cherry: 1, diamond: 1 },
            entrySteps: [0.1, 0.3, 0.5, 0.8, 1.0],
            naiteiSteps: [0.04, 0.12, 0.2, 0.41, 0.45],   // 内定の時ゾーンの突破率の段階 (必ず突破する役は 6)
            danceSteps: [0.05, 0.2, 0.3, 0.5, 0.6],       // ダンシングステージのチャンスゾーン突入率の段階 (確定は 6、突入済みなら 0)
            treasure: { seven: 5, chance: 5, bar: 4, sevenBar: 4, melon: 3, cherry: 2, diamond: 2, bell: 1 },   // 宝物庫ゾーン: 上乗せの多い役ほど熱い
            questionWin: 5
        },
        colorWeights: [
            { 0: 85, 1: 12, 2: 3 },
            { 0: 50, 1: 35, 2: 15 },
            { 0: 30, 1: 30, 2: 30, 3: 10 },
            { 1: 20, 2: 30, 3: 35, 4: 15 },
            { 2: 10, 3: 30, 4: 45, 5: 15 },
            { 3: 10, 4: 45, 5: 45 },
            { 6: 100 }
        ],
        colors: ['#ffffff', '#4f9bff', '#3fdf6f', '#c070ff', '#ff3a3a', '#ffd700', 'rainbow'],
        chanceLines: {
            4: ['チャンス！', 'これは来るかも…！', 'いけるいける！'],
            5: ['激アツだよ！！', 'ここは熱い！！', 'きたきたーっ！！'],
            6: ['すごいのが来る…！！！', 'ぜったい来るよ！！！']
        },
        expectLines: ['なにか来そう…？', 'ちょっと期待していいかも', 'ん…？ なんだか気になる'],
        // RASH 中は攻めるセリフに変わる (ユーザー指定: いけるよ！ / ここがせめどき！)
        rashChanceLines: {
            4: ['いけるよ！', 'ここがせめどき！', 'たたみかけて！'],
            5: ['ここがせめどき！！', 'いけるよ！ いっけー！！', '一気にたおしちゃえ！！'],
            6: ['ぜったいいける！！！', 'もう勝ったも同然！！！']
        },
        rashExpectLines: ['いけるかも…？', 'そろそろせめどき…？'],
        // RASH の対戦相手を決めるゲームと「？？」は、色に関係なくこちら (ユーザー指定)。色が赤以上なら strong / hot
        selectLines: {
            normal: ['誰が来るかな？', 'どんな相手でもがんばろう！'],
            strong: ['強い気配がするよ！', 'すごい相手が来そう…！']
        },
        strongEnemies: ['onioni', 'goldDog'],   // 次の相手に決まっていると「強い気配がするよ！」
        // ダンシングステージ・宝物庫ゾーンも、色に関係なくこちら (ユーザー指定)。色が赤以上なら hot
        danceLines: {
            normal: ['こおりくん、ノリノリだね♪', 'ステップ、なかなかうまいじゃん！', 'ひびきまくりも踊ってる…！', 'おかがっぱ、リズム感あるね'],
            hot: ['チャンスゾーン、来るかも！！', 'いいノリ！ このまま行っちゃえ！']
        },
        treasureLines: {
            normal: ['宝物庫だ！ いっぱい上乗せしよ！', '金貨がいっぱい…うちの実家くらいあるかも♪', '次のBATTLEが長くなるよ！'],
            hot: ['大量上乗せのチャンス！！', 'いっぱいもらっちゃお！！']
        },
        tokkaLines: {   // 上乗せ特化ゾーン (一撃入魂・ASAHARA CHANCE は合計を隠すので、いつも normal)
            normal: ['特化ゾーンだ！ いっぱい上乗せしよ！', '最低でも300枚！ やったね♪', 'どれだけ乗るかな…？'],
            hot: ['大量上乗せのチャンス！！', '最大1000枚、いっちゃえ！！']
        },
        questionLines: {
            normal: ['おねがい！続いて！', '揃って…！', 'まだ終わりたくない…！'],
            hot: ['おねがい！続いて！！', 'いける…いけるよ！']
        },
        // 敵と戦いはじめて1ゲーム目は必ず出てきて、その敵の話 (chatLines.enemies) をする (ユーザー指定)
        //   skipHeat: そのゲームの熱さがこれ以上 (チャンス目・BAR・7揃いなど) なら、ふだんどおりにする / color: 文字の色
        battleIntro: { skipHeat: 4, color: 0 },
        // 敵が出てきたときのセリフ (おにおにはカットインの「来たな…!!」) への返事と、撃破したときのひとこと (ユーザー指定)
        // 液晶の演出の中で必ず言う (レバー ON のときとは別)。eventColor: 文字の色 / replyWait: 返事を言ってから次の演出までの時間 (ミリ秒)
        eventColor: 0,
        replyWait: 1200,
        replies: {
            okagappa: ['まだ何も始まってないよ…？', 'ノリで来たでしょ、ぜったい…'],
            hibikimakuri: ['…うん、響いてるね', '自己紹介、それだけ…？'],
            shibata: ['ぶんぶん…？ おはしばたじゃないの？', 'ぶんぶんって、なに…？'],
            sasaki: ['自分で言っちゃうんだ…', 'しご出来なのに、目の下にクマが…'],
            onioni: ['来ちゃった…！ お金はあとで返すから！', 'こわい…でも負けないよ！'],
            goldDog: ['かわいい…けど、さわっちゃダメ！', 'すっごく自信ありげ…！']
        },
        defeatLines: {
            okagappa: ['おかがっぱ、川にお帰り〜！', 'お皿、割れてないといいね♪'],
            hibikimakuri: ['やっと静かになった…！', '最後まで響いてたね…'],
            shibata: ['シバター、バーイ！', 'いまの、動画にしないでね！'],
            sasaki: ['SASAKIさん、ゆっくり休んでね…', 'すごいです。やばいです。…うつっちゃった'],
            onioni: ['おにおにを倒した！ すごいよ！', 'お金のことは…また今度ね！'],
            goldDog: ['ワンちゃん、金庫にお帰り〜！', '黄金にならなくてよかった…！'],
            naitei: ['こおりくん、内定おめでとう！', 'これで内定持ちだね…ふーん♪'],
            aruaru: ['アルアルさん…かっこいい…！', 'お兄さんのほうは、内定くれるんだ…！']   // アルアルが倒したとき
        },
        finalBlowLines: ['ガードなんて関係ないね！', 'あとちょっとだけ…届いた〜！'],   // とどめの一撃で倒したとき (defeatLines の代わり)
        // RASH 終了 (「○○RASH 終了」の表示中)。super: SUPER まで行った / many: manyDefeats 体以上撃破 / zero: 1体も倒せなかった / normal: それ以外
        rashEndLines: {
            manyDefeats: 5,
            super: ['SUPERまで行けたね！ すごいよ！', 'ともいしさんも、きっと見てたよ！'],
            many: ['すごい！ いっぱい倒したね！', 'こおりくん、今日は絶好調だね！'],
            normal: ['おつかれさま！', 'いい戦いだったね！', 'こおりくん、ちょっとかっこよかったよ♪'],
            zero: ['おつかれさま…次はがんばろ！', 'ドンマイ！ うちの実家のお金で…なんでもない！']
        },
        // SUPER のともいしのカットインのあと、ともいしのセリフへの返事 (tomoishi.superLines と同じ並び)
        tomoishiReplies: [
            ['お金…返したほうがいいよ？', 'お母さんにまで言われてる…'],
            ['内定…まだなんだもんね…', 'こおりくん、目をそらさないの！'],
            ['ともいしさんの声、届いたね！', 'お母さんのためにも、がんばろ！']
        ],
        // エンディングのあと
        endingLines: ['ともいしさん、助けられてよかったね…！', 'でも、お金はちゃんと返そうね♪', '内定も、がんばろうね…！'],
        kindWeights: { hint: 25, stage: 30, setting: 25, chat: 20 },
        hints: [
            'チャンス目はスイカ崩れ・BAR崩れ・7崩れの3つだよ',
            '7・7・BARで突入すると、最初の相手はおにおに！',
            'トロフィーの色で設定がわかるかも？',
            '仲間がいると城突入しやすくなるよ',
            'SE城前でチャンス目を引くと突入率アップ！',
            'BATTLE中のチャンス目はブレイクのチャンス！',
            '設定推測は、データカウンターから見られるよ',
            '図鑑は台移動しても残るよ',
            'RASHが終わったあとはリベンジチャンス！'
        ],
        // キャラクターの話 (図鑑の説明にちなんだセリフ。kindWeights の chat)
        //   normal: 通常時 / companions: その仲間がいるときに加わる / enemies: RASH でその敵と戦っているとき / super: SUPER 中に加わる
        chatLines: {
            normal: [
                'こおりくん、内定まだなの？ ふーん…',
                'うちの実家なら、これくらい余裕だけどね♪',
                'こおりくん、おなか大丈夫？',
                'ともいしさん、元気かなぁ…',
                'おにおにに借りた3万6千円、返したほうがいいよ？',
                'わたしは戦えないから、応援係ね！'
            ],
            companions: {
                yasu: ['やすさん、じゃんけん弱いのかな？'],
                tamu: ['たむさん、音ゲーのときだけ目が本気…'],
                dake: ['だけさん、もっとしゃべっていいんだよ？']
            },
            enemies: {
                okagappa: [
                    '尻子玉をとられないでね！', 'ノリと勢いだけで来てるみたい…',
                    '山グッチのおかピポだって！ 知ってる？', '頭のお皿、乾いてないかな…？',
                    'Xにアップされたら、はずかしいよ〜！', 'DJって、うちの実家のパーティーにも来てたかも♪'
                ],
                hibikimakuri: [
                    '声がすっごく響いてる…！', '4DXみたいにゆれてる…！',
                    'しーっ！ 声が響いちゃう！', '古典妖怪って、何歳なんだろう…',
                    '4DXの特訓中なんだって…', 'うちの実家の大広間のほうが響くけどね♪'
                ],
                shibata: [
                    'いま「んな～」って鳴いた…？', 'おはしばた！',
                    'ユーチューブンの撮影中かな…？', 'プロレス動画、ちゃんと再生されてるのかな…',
                    'シバターもSE城に招待されてたんだね', '小銭稼ぎには負けないよ！'
                ],
                sasaki: [
                    'SASAKIさん、疲れてそう…', '「すごいです。やばいです。」って言ってる…',
                    'SE城をほぼ一人で管理してるんだって…', 'しごできなのに、語彙が死んでる…',
                    'ちゃんと寝てるのかな…？', 'うちの実家の執事にしてあげよっか♪'
                ],
                onioni: [
                    'おにおに、すごく怒ってる…', 'お金のこと、根に持ってるみたい…',
                    '1日17時間も寝てるのに、こわい顔…', '3万6千円、返したら許してくれるかも…？',
                    'こおりくんの顔、ねらわれてるよ！', 'ここで勝てば、ともいしさんに近づける！'
                ],
                goldDog: [
                    'さわられたら黄金になっちゃう！', 'トイレの置物はいやだよ〜！',
                    '金庫から出てきちゃったの！？', '3食昼寝付き…ちょっとうらやましい…',
                    'ふわふわの金色…でもなでたらダメ！', 'うちの実家にも金の置物、あるけどね♪'
                ],
                naitei: [
                    '内定の神さま…！ ここで勝てば内定！',
                    'こおりくん、ここが正念場だよ！', 'モンゴル支部にもいたんだって…',
                    '双子のお兄さんもいるんだって…', 'うちの実家なら、内定くらい用意できるけどね♪'
                ]
            },
            super: ['ともいしさんが見てるよ！', 'お母さんまで、あと少し！']
        },
        // short: 設定推測の材料の一覧に出す短い名前
        settingLines: [
            { text: 'この台、なんだか冷えてる気がする…', short: '冷えてる', weights: { 1: 40, 2: 30, 3: 25, 4: 15, 5: 10, 6: 5 } },
            { text: 'ふつうの台…かな？', short: 'ふつう', weights: { 1: 40, 2: 40, 3: 35, 4: 25, 5: 20, 6: 15 } },
            { text: 'この台、あったかい気がする♪', short: 'あったかい', weights: { 1: 10, 2: 15, 3: 20, 4: 30, 5: 30, 6: 30 } },
            { text: '今日はいい日になりそう！', short: 'いい日', weights: { 1: 0, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15 } },
            { text: 'ここ、高設定のにおいがするよ！', short: '高設定のにおい', weights: { 1: 0, 2: 0, 3: 0, 4: 12, 5: 15, 6: 15 } },
            { text: 'ろく…ろく…！ なんでもない！', short: 'ろく…', weights: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 8 } }
        ]
    },

    // ----- 図鑑・実績 -----
    // 図鑑 (撃破した敵・見た必殺技・トロフィーの色・記録) と実績は台移動しても残る (リセットすると消える)。
    // 実績は stat の値が value 以上になると解除:
    //   rash / super / naitei / freeze / moves / games / ending: 合計の回数 (RASH・SUPER 突入、内定の時突破、ロングフリーズ、台移動、ゲーム数、エンディング)
    //   bestCoins / bestDefeats: 1回の RASH での最高 (獲得枚数・撃破数)
    //   defeat:<敵の id>: その敵の撃破数 / trophy:<色>: その色のトロフィーが出た回数
    //   endCard:<絵の id>: その RASH 終了画面の絵を見た回数
    //   enemyKinds / specialKinds / trophyKinds / endCardKinds / furukawaKinds: 図鑑の埋まった数 (value: 'all' は全部)
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
            { id: 'everyone', name: 'みんなで記念撮影', desc: 'RASH 終了画面で集合絵を見る', stat: 'endCard:everyone', value: 1 },
            { id: 'allEndCards', name: '思い出アルバム', desc: 'RASH 終了画面の絵をすべて見る', stat: 'endCardKinds', value: 'all' },
            { id: 'furukawa30', name: 'ふるカワとおしゃべり', desc: 'ふるカワのセリフを30種類聞く', stat: 'furukawaKinds', value: 30 },
            { id: 'allFurukawa', name: 'ふるカワ博士', desc: 'ふるカワのセリフをすべて聞く', stat: 'furukawaKinds', value: 'all' },
            { id: 'allEnemies', name: '全員撃破', desc: 'すべての敵を撃破する', stat: 'enemyKinds', value: 'all' },
            { id: 'allSpecials', name: '必殺技マスター', desc: 'すべての必殺技を見る', stat: 'specialKinds', value: 'all' },
            { id: 'moves5', name: '台選び上手', desc: '台移動を合計5回する', stat: 'moves', value: 5 },
            { id: 'games10000', name: '打ち込み1万G', desc: '合計10,000ゲーム回す', stat: 'games', value: 10000 },
            { id: 'revival', name: 'こおりまだまえる', desc: '復活して敵を撃破する', stat: 'revival', value: 1 },
            { id: 'ending', name: 'ともいし救出', desc: 'SUPER中におにおにを倒して、エンディングを見る', stat: 'ending', value: 1 },
            { id: 'aruaru', name: '内定がある！！', desc: '内定の時ゾーンで、シーシャ・ナイテイ・アルアルに助けてもらう', stat: 'aruaru', value: 1 },
            { id: 'finalBlow', name: 'ガード無視!!', desc: 'ガードされても、とどめの一撃で敵を撃破する', stat: 'finalBlow', value: 1 },
            // レバーの 演出 (2026-10-24 ユーザー指定)
            { id: 'tatakiRash', name: '叩け確定', desc: 'RASH 中に「レバーを叩け!!」を見る', stat: 'lever:tatakiRash', value: 1 },
            { id: 'gyaku', name: '逆回転', desc: 'リールの逆回転を見る', stat: 'lever:reverse', value: 1 },
            { id: 'longStop', name: 'ためて止めろ', desc: '長押しの STOP でリールを止める', stat: 'lever:longStop', value: 1 },
            { id: 'premiumCrack', name: 'ひび割れ', desc: '液晶が ひび割れて おにおにが 出てくる (プレミア) を見る', stat: 'lever:crack', value: 1 },
            { id: 'allLeverFx', name: 'レバー演出マスター', desc: 'レバーの演出を全種類見る', stat: 'leverKinds', value: 'all' }
        ]
    },

    // ----- キー割り当ての初期値 -----
    keys: {
        lever: 'Space',
        stop1: 'KeyJ',
        stop2: 'KeyK',
        stop3: 'KeyL',
        push: 'KeyB'   // PUSH ボタン (2026-10-23 A3)
    }
};
