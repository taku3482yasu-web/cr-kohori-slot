// =====================================================================
// 自動テスト (Node.js)
// ---------------------------------------------------------------------
// ゲームのロジック (config / state / lottery / battle / save) をブラウザなしで読み込み、
// 自動プレイしながら「壊れていないか」を確かめる。演出 (lcd.js など) は対象外。
// 乱数は種 (seed) を固定しているので、同じコードなら毎回同じ結果になる。
//
// 使い方 (koori フォルダで):
//   node tools/test.js                 すべてのテスト
//   node tools/test.js --games 2000000 自動プレイのゲーム数を変える (初期値 400000)
//   node tools/test.js --seed 42       乱数の種を変える
//
// 失敗したテストがあると、終了コード 1 で終わる。
// =====================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const GAME_FILES = ['config.js', 'state.js', 'lottery.js', 'battle.js', 'save.js', 'furukawa.js', 'updates.js'];

// ----- 引数 -----
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : fallback;
};
const GAMES = argValue('--games', 400000);
const SEED = argValue('--seed', 20261017);

// ----- 種を固定した乱数 (mulberry32) -----
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ブラウザの localStorage の代わり
function memoryStorage() {
    const data = new Map();
    return {
        getItem: k => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: k => data.delete(k)
    };
}

// ゲームのスクリプトを1つのグローバル環境に読み込む (Math.random は種を固定したものに差し替える)
function loadGame(seed) {
    const seededMath = Object.create(Math);
    seededMath.random = seededRandom(seed);
    const context = { console, Math: seededMath, localStorage: memoryStorage() };
    context.window = context;
    vm.createContext(context);
    for (const file of GAME_FILES) {
        vm.runInContext(fs.readFileSync(path.join(JS_DIR, file), 'utf8'), context, { filename: file });
    }
    const game = vm.runInContext(
        '({ createInitialState, Lottery, ReelMap, GameFlow, Battle, MachineMove, SaveData, SettingEstimate, Collection, Furukawa, EndCard, UpdateNotes, UPDATES, DebugState, StateMachine, MODES, RASH_PHASES })', context);
    game.config = context.GAME_CONFIG;
    game.config.dataCounter.historySize = Infinity;   // 履歴の件数を数えるため、すべて残す
    return game;
}

// ----- テストの枠組み -----
const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, ok: true });
    } catch (e) {
        results.push({ name, ok: false, message: e.message });
    }
}
function assert(cond, message) {
    if (!cond) throw new Error(message);
}
function assertEqual(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message}: ${JSON.stringify(actual)} (期待値 ${JSON.stringify(expected)})`);
}
function assertBetween(value, min, max, message) {
    if (!(value >= min && value <= max)) throw new Error(`${message}: ${value.toFixed(4)} (範囲 ${min}〜${max})`);
}
const pct = v => (v * 100).toFixed(1) + '%';

// ----- 自動プレイして、テストに使う記録を集める -----
function play(setting, games, seed) {
    const game = loadGame(seed);
    const { createInitialState, Lottery, GameFlow, Furukawa, SettingEstimate, Collection, MODES, RASH_PHASES, config } = game;
    const state = createInitialState(config);
    state.setting = setting;
    const log = {
        normalGames: 0,
        aruaru: { revived: 0, lost: 0, won: 0, notSuper: 0 },   // 内定の時ゾーン: アルアルの復活・負け・ふつうの突破
        rashEnds: [],            // { coinsWon, defeatCount, wasSuper, trophy, hit }
        trophies: { shown: 0, total: 0, byLevel: {} },
        chanceBreak: { eligible: 0, broke: 0 },   // BATTLE 中のチャンス目 (ブレイク前) とブレイクした数
        finalBlow: { guarded: {}, blows: {}, wrong: 0 },   // とどめの一撃: 役ごとのガードされた数・とどめの一撃の数、決まり方がおかしい数
        guaranteed: { started: 0, won: 0, lost: 0 },
        naiteiWins: 0,
        afterNaiteiWin: 0,       // 内定の時突破のあと、勝利確定で始まった BATTLE
        defeats: 0,
        finishMissing: 0,        // 撃破したのに finishBy がないダメージ
        finishWrong: 0,          // finishBy が仲間なのに、その仲間の追撃がない
        killNotKoori: 0,         // 一撃必殺の役なのに finishBy がこおりくんでない
        companionFinishes: 0,
        enemyIdMissing: 0,       // 「？？」の失敗・肩代わりに敵の id がない
        questionFails: 0,
        revenge: { success: 0, toSuper: 0, fromSuper: 0, carried: 0, wrong: 0 },
        oniUnlockInSuper: 0,
        ending: { count: 0, notSuperOni: 0, twiceInSet: 0, supers: 0 },   // エンディング (SUPER 中のおにおに撃破で、SUPER 1回につき1回)     // SUPER 中に「おにおにが現れる…!?」が出た回数 (出てはいけない)
        joined: new Set(),       // 仲間になった仲間の id
        revival: { pending: 0, revived: 0, ends: 0, notPending: 0, noDefeat: 0, notSeven: 0, paid: 0 },
        furukawa: { talks: 0, byHeat: {}, byColor: {}, lines: new Set(), rashLines: new Set(), phaseLines: {}, rainbowNotSure: 0, sureSilent: 0, empty: 0, intro: { games: 0, said: 0, wrong: 0, hot: 0, hotIntroLine: 0, naitei: 0 }, events: { reply: 0, defeat: 0, naitei: 0, rashEnd: 0, super: 0, ending: 0, rashEndLines: new Set(), missing: 0, wrong: 0, repeat: 0, lastByKey: {} }, lastText: null, sameInRow: 0 }
    };
    let pendingGuaranteed = false;
    let endingInSet = false;   // この RASH でエンディングが出たか
    for (let g = 0; g < games; g++) {
        const mode = state.mode;
        if (mode === MODES.NORMAL || mode === MODES.CASTLE_CHALLENGE) log.normalGames++;
        const rash = state.rash;
        const wasBattle = (mode === MODES.RASH || mode === MODES.SUPER_RASH) && rash.phase === RASH_PHASES.BATTLE;
        const breakBefore = rash.breakActive;
        const guaranteedBefore = wasBattle && rash.winGuaranteed;
        const outcome = Lottery.draw(state, config);
        const carry = state.normal.revengeCarry;
        // ふるカワ (レバー ON の直後、状態を更新する前に呼ぶ)
        const f = log.furukawa;
        const canTalk = Furukawa.canAppear(state, config);
        const heat = canTalk ? Furukawa.heat(state, outcome, config) : null;
        const talk = Furukawa.talk(state, outcome, config);
        if (talk) Collection.hearFurukawa(state, talk.text, config);   // main.js と同じ
        // ふるカワのセリフが2回続けて同じにならない (レバー ON・演出の中。候補が1つしかないもの・設定示唆は除く)
        if (talk) {
            if (talk.text === log.furukawa.lastText && talk.settingLine == null && !/\d/.test(talk.text) && !talk.text.startsWith('次の相手は')) log.furukawa.sameInRow++;
            log.furukawa.lastText = talk.text;
        }
        if (talk && talk.settingLine != null) SettingEstimate.countFurukawa(state, talk.settingLine);
        if (talk) {
            f.talks++;
            f.byHeat[talk.heat] = (f.byHeat[talk.heat] || 0) + 1;
            f.byColor[talk.color] = (f.byColor[talk.color] || 0) + 1;
            (mode === MODES.RASH || mode === MODES.SUPER_RASH ? f.rashLines : f.lines).add(talk.text);
            if (mode === MODES.RASH || mode === MODES.SUPER_RASH) (f.phaseLines[rash.phase] = f.phaseLines[rash.phase] || new Set()).add(talk.text);
            if (mode === MODES.NORMAL && state.normal.dance) (f.phaseLines.dance = f.phaseLines.dance || new Set()).add(talk.text);
            if (talk.color === 6 && talk.heat !== 6) f.rainbowNotSure++;
            if (!talk.text) f.empty++;
        } else if (heat === 6) {
            f.sureSilent++;
        }
        // 戦いはじめの1ゲーム目: 熱い役でなければ必ずその敵の話 / 熱い役ならふだんどおり
        const wasNaitei = (mode === MODES.RASH || mode === MODES.SUPER_RASH) && rash.phase === RASH_PHASES.NAITEI;
        if ((wasBattle || wasNaitei) && rash.battleIntro) {
            const enemyLines = config.furukawa.chatLines.enemies[rash.enemyId] || [];
            const saidEnemy = Boolean(talk) && enemyLines.includes(talk.text);
            if (heat < config.furukawa.battleIntro.skipHeat) {
                f.intro.games++;
                if (saidEnemy) f.intro.said++;
                else if (enemyLines.length) f.intro.wrong++;
                if (saidEnemy && wasNaitei) f.intro.naitei++;
            } else {
                f.intro.hot++;
                if (saidEnemy && talk.color === config.furukawa.battleIntro.color) f.intro.hotIntroLine++;
            }
        }
        const events = GameFlow.onGameEnd(state, outcome, config);

        if (wasBattle && outcome.role === 'chance' && !breakBefore && !outcome.isFreeze) {
            log.chanceBreak.eligible++;
            if (events.some(e => e.type === 'break')) log.chanceBreak.broke++;
        }
        // ふるカワの返事 (敵が出てきたとき)・撃破のひとこと: 言うセリフがあれば必ず付く
        for (const e of events) {
            const fc = config.furukawa;
            const tomoIndex = e.type === 'superStart' ? config.tomoishi.superLines.indexOf(e.tomoishiLine) : -1;
            const lines = e.type === 'battleStart' ? fc.replies[e.enemyId]
                : e.type === 'defeat' ? (events.some(d => d.type === 'damage' && d.finalBlow) ? fc.finalBlowLines : fc.defeatLines[e.enemyId])
                : e.type === 'naiteiResult' && e.win ? fc.defeatLines[e.aruaru ? config.naitei.aruaru.id : config.naitei.enemy.id]
                : e.type === 'rashEnd' || (e.type === 'naiteiResult' && e.toCastle) ? Furukawa.rashEndLines(e, config)
                : e.type === 'superStart' ? fc.tomoishiReplies[tomoIndex] || []
                : e.type === 'ending' ? fc.endingLines : null;
            if (!lines) continue;
            const ev = log.furukawa.events;
            const kind = { battleStart: 'reply', defeat: 'defeat', rashEnd: 'rashEnd', superStart: 'super', ending: 'ending' }[e.type]
                || (e.win ? 'naitei' : 'rashEnd');
            if (!e.furukawa) ev.missing++;
            else if (!lines.includes(e.furukawa.text)) ev.wrong++;
            else {
                ev[kind] = (ev[kind] || 0) + 1;
                if (kind === 'rashEnd') ev.rashEndLines.add(e.furukawa.text);
            }
            if (e.furukawa) log.furukawa.lastText = e.furukawa.text;   // 演出の中のセリフも続けて同じか数える
            // 同じ候補 (同じ敵への返事など) から続けて同じセリフを選んでいない
            if (e.furukawa && lines.length > 1) {
                const key = lines.join();
                if (ev.lastByKey[key] === e.furukawa.text) ev.repeat++;
                ev.lastByKey[key] = e.furukawa.text;
            }
        }
        // 復活: 「？？」の負けで決まったら RASH のまま復活待ち、次のゲームで敵を撃破
        for (const e of events) {
            if (e.type === 'questionResult' && !e.continued) {
                if (e.revival) {
                    log.revival.pending++;
                    if (state.rash.phase !== RASH_PHASES.REVIVAL) log.revival.notPending++;
                } else {
                    log.revival.ends++;
                }
            }
            // リベンジ成功: 撃破数を引き継ぎ、SUPER だったら SUPER に戻る
            if (e.type === 'revengeSuccess') {
                log.revenge.success++;
                if (carry && carry.wasSuper) log.revenge.fromSuper++;
                if (state.mode === MODES.SUPER_RASH) log.revenge.toSuper++;
                if (carry && carry.defeatCount > 0) log.revenge.carried++;
                const wantMode = carry && carry.wasSuper ? MODES.SUPER_RASH : MODES.RASH;
                if (!carry || state.rash.defeatCount !== carry.defeatCount || state.mode !== wantMode) log.revenge.wrong++;
            }
            if (e.type === 'companionChallenge' && e.success) log.joined.add(e.memberId);
            if (e.type === 'naiteiResult') {
                if (e.aruaru) {
                    log.aruaru.revived++;
                    // 突破と同じ扱い: おにおにRASH なら SUPER へ
                    if (mode === MODES.RASH && !events.some(x => x.type === 'superStart')) log.aruaru.notSuper++;
                } else if (e.win) log.aruaru.won++;
                else log.aruaru.lost++;
            }
            if (e.type === 'oniUnlocked' && mode === MODES.SUPER_RASH) log.oniUnlockInSuper++;
            if (e.type === 'superStart') log.ending.supers++;
            if (e.type === 'ending') {
                log.ending.count++;
                if (mode !== MODES.SUPER_RASH || !events.some(d => d.type === 'defeat' && d.enemyId === 'onioni')) log.ending.notSuperOni++;
                if (endingInSet) log.ending.twiceInSet++;
                endingInSet = true;
            }
            if (e.type === 'rashStart' || e.type === 'rashEnd') endingInSet = false;
            if (e.type === 'revival') {
                log.revival.revived++;
                if (outcome.role !== 'seven' || !outcome.aligned) log.revival.notSeven++;
                if (events.some(p => p.type === 'payout' && p.amount > 0)) log.revival.paid++;
                if (!events.some(d => d.type === 'defeat' && d.enemyId === e.enemyId)) log.revival.noDefeat++;
            }
        }
        for (const e of events) {
            if (e.type === 'rashEnd' || (e.type === 'naiteiResult' && e.toCastle)) {
                log.rashEnds.push({ ...e, hit: { ...state.hitHistory[0] } });
                log.trophies.total++;
                if (e.trophy != null) {
                    log.trophies.shown++;
                    log.trophies.byLevel[e.trophy] = (log.trophies.byLevel[e.trophy] || 0) + 1;
                }
            }
            if (e.type === 'naiteiResult' && e.win) {
                log.naiteiWins++;
                pendingGuaranteed = e.winNextBattle;
            }
            if (e.type === 'battleStart' && e.winGuaranteed) {
                log.guaranteed.started++;
                if (pendingGuaranteed) log.afterNaiteiWin++;
                pendingGuaranteed = false;
            }
            if (guaranteedBefore && e.type === 'defeat') log.guaranteed.won++;
            if (guaranteedBefore && (e.type === 'companionSave' || (e.type === 'questionResult' && !e.continued))) log.guaranteed.lost++;
            if (e.type === 'damage' && wasBattle && e.guarded) {
                const fb = log.finalBlow;
                fb.guarded[e.role] = (fb.guarded[e.role] || 0) + 1;
                if (e.finalBlow) {
                    fb.blows[e.role] = (fb.blows[e.role] || 0) + 1;
                    if (e.hp !== 0 || e.finishBy !== 'koori' || (e.companionHits || []).length) fb.wrong++;
                    if (!events.some(d => d.type === 'defeat')) fb.wrong++;
                }
            }
            if (e.type === 'damage' && e.hp === 0 && !e.freeze) {
                log.defeats++;
                if (!e.finishBy) log.finishMissing++;
                else if (e.finishBy !== 'koori') {
                    log.companionFinishes++;
                    if (!(e.companionHits || []).some(h => h.id === e.finishBy && h.amount > 0)) log.finishWrong++;
                }
                if (e.finishKill && e.finishBy !== 'koori') log.killNotKoori++;
            }
            if (e.type === 'companionSave' || (e.type === 'questionResult' && !e.continued)) {
                log.questionFails++;
                if (!e.enemyId) log.enemyIdMissing++;
            }
        }
    }
    return { game, state, log };
}

// ===== テスト =====
const started = Date.now();
console.log(`自動テスト (${GAMES.toLocaleString()} ゲーム × 設定1〜6, seed ${SEED})\n`);

const base = loadGame(SEED);

test('config.js: どの役にも出目が用意できる (Lottery.validate)', () => {
    const errors = base.Lottery.validate(base.config);
    assert(errors.length === 0, errors.join(' / '));
});

test('リールの引き込み: どこで STOP を押しても 役は変わらず (取りこぼしなし)、たいてい 4 コマ以内で止まる (Lottery.retarget)', () => {
    const { config, Lottery, ReelMap } = base;
    const strips = config.reels.strips;
    const roles = ['miss', 'replay', 'bell', 'diamond', 'cherry', 'melon', 'bar', 'seven', 'sevenBar', 'chance', 'longFreeze'];
    let presses = 0, within4 = 0, maxSlide = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const role of roles) {
        for (let t = 0; t < 60; t++) {
            const o = Lottery.makeOutcome(role, config, rnd);
            const key = o.key;
            let line = null;
            const order = [[0, 1, 2], [2, 1, 0], [1, 0, 2]][t % 3];
            const fixed = [null, null, null];
            for (const r of order) {
                const press = Math.floor(rnd() * strips[r].length);
                const keepLine = line !== null;   // リーチを 見せた ことに する (2 本 止まったら)
                const pick = Lottery.retarget(o, r, press, fixed, config, { keepLine: keepLine && t % 2 === 0 });
                fixed[r] = pick.stop;
                if (fixed.filter(x => x !== null).length === 2 && t % 2 === 0) line = o.winLine;   // リーチを 見せたら ラインは 変わらない
                presses++;
                if (pick.slide <= 4) within4++;
                maxSlide = Math.max(maxSlide, pick.slide);
                assertEqual((pick.stop - press + strips[r].length) % strips[r].length, pick.slide, `${role}: すべる コマ数`);
            }
            assertEqual(fixed.join(','), o.stops.join(','), `${role}: 止まった 位置と 出目`);
            assert(ReelMap.categories(config)[key].some(e => e.stops.join() === o.stops.join()), `${role}: 出目が 同じ 種類 (${key}) の 中`);
            if (line !== null) assertEqual(o.winLine, line, `${role}: リーチの あとは 揃う ラインが 変わらない`);
            const c = ReelMap.classify(ReelMap.gridFor(o.stops, strips), config);
            if (role === 'chance') assertEqual(c.chances.length, 1, 'チャンス目は 1 つ');
            if (role === 'miss') assertEqual(c.wins.length + c.specials.length, 0, 'ハズレは 揃わない');
        }
    }
    assert(within4 / presses > 0.7,   // ハズレ・ベルは ほとんど 4 コマ以内。7・BAR は 1 本に 2 つなので 遠いと 長く すべる
    `4 コマ以内: ${pct(within4 / presses)} (最大 ${maxSlide} コマ)`);
    console.log(`  引き込み: 4 コマ以内 ${pct(within4 / presses)}・いちばん すべって ${maxSlide} コマ`);
});

test('config.js: 確率表の合計が 1 以下', () => {
    for (const [name, table] of Object.entries(base.config.lottery)) {
        const sum = Object.values(table).reduce((a, b) => a + b, 0);
        assert(sum <= 1, `lottery.${name} の合計が ${sum}`);
    }
});

test('config.js: トロフィーの色の重みは、台の設定以下の色だけ', () => {
    for (const [setting, weights] of Object.entries(base.config.trophy.weights)) {
        for (const level of Object.keys(weights)) {
            assert(Number(level) <= Number(setting), `設定${setting} に「${level}以上」の色がある`);
            assert(base.config.trophy.colors[level], `色 ${level} の定義がない`);
        }
    }
});

test('config.js: 敵のセリフは出てきたとき (intro)・必殺技の前 (special) だけで、文字がある', () => {
    const { config } = base;
    for (const enemy of [...config.enemies, config.goldDog, config.naitei.enemy]) {
        if (!enemy.lines) continue;
        for (const [key, line] of Object.entries(enemy.lines)) {
            assert(key === 'intro' || key === 'special', `${enemy.name} のセリフの種類「${key}」`);
            assert(typeof line === 'string' && line.length > 0, `${enemy.name} の ${key} が空`);
        }
    }
    assert(config.enemies.every(e => e.lines && e.lines.special), '必殺技の前のセリフがない敵がいる');
});

test('config.js: 敵・仲間に必殺技の名前がある', () => {
    const c = base.config;
    for (const e of [...c.enemies, c.goldDog, c.naitei.enemy]) assert(e.special, `${e.name} の special がない`);
    for (const m of c.companions.members) assert(m.special, `${m.name} の special がない`);
    assert(c.specials.koori && c.specials.kooriKill, 'specials.koori / kooriKill がない');
});

const runs = [];
for (let setting = 1; setting <= 6; setting++) runs.push({ setting, ...play(setting, GAMES, SEED + setting) });

test('大当たり履歴: 件数が RASH 回数と一致し、当選までのゲーム数の合計が通常時のゲーム数と一致', () => {
    for (const { setting, state, log } of runs) {
        assertEqual(state.hitHistory.length, state.rashCount, `設定${setting} の履歴の件数`);
        const sum = state.hitHistory.reduce((a, h) => a + h.games, 0) + state.gamesSinceHit;
        assertEqual(sum, log.normalGames, `設定${setting} の当選までのゲーム数の合計`);
        assert(state.hitHistory.filter(h => h.active).length <= 1, `設定${setting} で進行中の履歴が2件以上`);
    }
});

test('大当たり履歴: RASH 終了時の獲得枚数・撃破数・SUPER・トロフィーが記録される', () => {
    for (const { setting, log } of runs) {
        assert(log.rashEnds.length > 0, `設定${setting} で RASH が終わっていない`);
        for (const e of log.rashEnds) {
            const h = e.hit;
            assert(!h.active, `設定${setting}: 終了後も進行中のまま`);
            assertEqual(h.coins, e.coinsWon, `設定${setting} の獲得枚数`);
            assertEqual(h.defeats, e.defeatCount, `設定${setting} の撃破数`);
            assertEqual(h.super, Boolean(e.wasSuper), `設定${setting} の SUPER 到達`);
            assertEqual(h.trophy, e.trophy, `設定${setting} のトロフィー`);
        }
    }
});

test('設定示唆トロフィー: 出現率が約50%、台の設定より上の色は出ない、白以外も出る', () => {
    const rate = base.config.trophy.rate;
    for (const { setting, log } of runs) {
        const t = log.trophies;
        assertBetween(t.shown / t.total, rate - 0.08, rate + 0.08, `設定${setting} の出現率`);
        for (const level of Object.keys(t.byLevel)) assert(Number(level) <= setting, `設定${setting} で「${level}以上」が出た`);
        if (setting >= 2) assert(t.byLevel[setting] > 0, `設定${setting} で設定と同じ色が出ていない`);
    }
});

test('RASH 終了画面: 毎回出て、台の設定の条件に合う絵だけ・6確定の絵は設定6でだけ出る', () => {
    const { EndCard, config } = base;
    for (const { setting, log } of runs) {
        const seen = {};
        for (const e of log.rashEnds) {
            assert(e.endCard, `設定${setting}: 終了画面の絵が決まっていない`);
            const card = EndCard.find(config, e.endCard);
            assert(card && EndCard.allows(card, setting), `設定${setting} で「${card ? card.name : e.endCard}」が出た`);
            seen[e.endCard] = (seen[e.endCard] || 0) + 1;
        }
        assert(seen[setting % 2 ? 'tomoishi' : 'furukawa'] > 0, `設定${setting} で偶数・奇数の示唆が出ていない`);
        if (setting === 6) assert(seen.everyone > 0 && seen.goldDog > 0, '設定6 で6確定の絵が出ていない');
        // 設定推測の材料に数えた回数と合う
        const counted = Object.values(runs.find(r => r.setting === setting).state.estimate.endCards).reduce((a, b) => a + b, 0);
        assert(counted > 0, `設定${setting}: 設定推測に数えていない`);
    }
    for (const setting of [1, 2, 3, 4, 5, 6]) {
        const total = config.endCard.cards.reduce((a, c) => a + base.SettingEstimate.endCardRate(config, setting, c.id), 0);
        assertBetween(total, 0.9999, 1.0001, `設定${setting} の絵の確率の合計`);
    }
    const names = EndCard.available(config, 1).map(c => c.id).join();
    assertEqual(names, 'koori,yasu,tomoishi', '設定1 で出る絵');
});

test('ブレイク: BATTLE 中のチャンス目で約50%ブレイクする', () => {
    const total = runs.reduce((a, r) => ({ e: a.e + r.log.chanceBreak.eligible, b: a.b + r.log.chanceBreak.broke }), { e: 0, b: 0 });
    assert(total.e > 200, `対象のチャンス目が少ない (${total.e})`);
    const expected = base.config.breakState.rates.chance;
    assertBetween(total.b / total.e, expected - 0.06, expected + 0.06, 'ブレイク率');
});

test('とどめの一撃: ガードされたリプレイ・ダイヤ・スイカで 1〜3% 起きて撃破し、ほかの役では起きない', () => {
    const rates = base.config.finalBlow.rates;
    const sum = (key, role) => runs.reduce((a, r) => a + (r.log.finalBlow[key][role] || 0), 0);
    for (const role of Object.keys(rates)) {
        const guarded = sum('guarded', role);
        assert(guarded > 1000, `${role} のガードが少ない (${guarded})`);
        const sd = Math.sqrt(rates[role] * (1 - rates[role]) / guarded);
        assertBetween(sum('blows', role) / guarded, rates[role] - 4 * sd, rates[role] + 4 * sd, `${role} のとどめの一撃の割合`);
    }
    const others = runs.reduce((a, r) => a + Object.entries(r.log.finalBlow.blows)
        .filter(([role]) => !(role in rates)).reduce((b, [, n]) => b + n, 0), 0);
    assertEqual(others, 0, 'ほかの役でのとどめの一撃');
    assertEqual(runs.reduce((a, r) => a + r.log.finalBlow.wrong, 0), 0, '撃破にならない・こおりくん以外・仲間の追撃ありのとどめの一撃');
    // 図鑑の記録・実績・ふるカワのひとこと
    for (const { setting, state, log } of runs) {
        const blows = Object.values(log.finalBlow.blows).reduce((a, b) => a + b, 0);
        const c = state.collection;
        assertEqual(c.records.finalBlow || 0, blows, `設定${setting} の図鑑のとどめの一撃の回数`);
        assertEqual(c.achievements.finalBlow != null, blows > 0, `設定${setting} の実績「ガード無視!!」`);
    }
    const heard = runs.reduce((a, r) => a + base.config.furukawa.finalBlowLines.filter(t => r.state.collection.furukawaLines[t]).length, 0);
    assert(heard > 0, 'とどめの一撃のふるカワのひとことが図鑑に入っていない');
});

test('デバッグ「次:とどめの一撃」: 次のリプレイ・ダイヤ・スイカで、HP やセットに関係なくとどめの一撃になる', () => {
    const g = loadGame(7);
    const { createInitialState, Lottery, GameFlow, DebugState, StateMachine, RASH_PHASES, config } = g;
    const state = createInitialState(config);
    DebugState.forceFinalBlow(state);
    assert(StateMachine.isRashMode(state), 'RASH に入っていない');
    let blow = null;
    for (let i = 0; i < 3000 && !blow; i++) {
        const battle = state.rash.phase === RASH_PHASES.BATTLE;
        if (battle) state.rash.setWillWin = true;   // 勝ちセットでも起きる
        const events = GameFlow.onGameEnd(state, Lottery.draw(state, config), config);
        if (!StateMachine.isRashMode(state)) DebugState.toRash(state);
        blow = events.find(e => e.type === 'damage' && e.finalBlow);
        if (blow) assert(events.some(e => e.type === 'defeat'), 'とどめの一撃で撃破していない');
    }
    assert(blow, '3000 ゲームでとどめの一撃が起きない');
    assert(blow.role in config.finalBlow.rates, `対象でない役 (${blow.role}) でとどめの一撃`);
    assertEqual(state.rash.debugForceFinalBlow, false, '1回起きたあともデバッグの印が残っている');
});

test('内定の時: 突破後の次の BATTLE は勝利確定で、必ず撃破する', () => {
    const naiteiWins = runs.reduce((a, r) => a + r.log.naiteiWins, 0);
    const g = runs.reduce((a, r) => ({
        started: a.started + r.log.guaranteed.started, won: a.won + r.log.guaranteed.won,
        lost: a.lost + r.log.guaranteed.lost, after: a.after + r.log.afterNaiteiWin
    }), { started: 0, won: 0, lost: 0, after: 0 });
    assert(naiteiWins > 0, '内定の時の突破が1回もない (--games を増やす)');
    assert(g.started > 0, '勝利確定の BATTLE が1回もない');
    assertEqual(g.lost, 0, '勝利確定の BATTLE で負けた回数');
    assertEqual(g.after, g.started, '内定の時突破の直後以外で勝利確定になった (勝利確定の BATTLE の数)');
});

test('必殺技: 撃破したダメージには、とどめを刺した人 (finishBy) が入る', () => {
    for (const { setting, log } of runs) {
        assert(log.defeats > 0, `設定${setting} で撃破がない`);
        assertEqual(log.finishMissing, 0, `設定${setting} の finishBy がない撃破`);
        assertEqual(log.finishWrong, 0, `設定${setting} の追撃していない仲間がとどめ`);
        assertEqual(log.killNotKoori, 0, `設定${setting} の一撃必殺なのにこおりくん以外がとどめ`);
    }
    const companion = runs.reduce((a, r) => a + r.log.companionFinishes, 0);
    assert(companion > 0, '仲間がとどめを刺したことが1回もない');
});

test('必殺技: 「？？」で継続できなかったとき (肩代わりも含む) は敵の id が入る', () => {
    const fails = runs.reduce((a, r) => a + r.log.questionFails, 0);
    assert(fails > 0, '「？？」の失敗がない');
    for (const { setting, log } of runs) assertEqual(log.enemyIdMissing, 0, `設定${setting} の敵の id がないイベント`);
});

test('設定推測: 通常時のチャンス目の出現率が計算値と合う', () => {
    for (const { setting, state, game } of runs) {
        const e = state.estimate;
        const p = game.SettingEstimate.chanceRate(game.config, setting);
        const sd = Math.sqrt(p * (1 - p) / e.normalGames);
        assertBetween(e.normalChance / e.normalGames, p - 4 * sd, p + 4 * sd, `設定${setting} のチャンス目の出現率`);
    }
});

test('設定推測: 城突入チャレンジの成功率が計算値と合う', () => {
    for (const { setting, state, game } of runs) {
        const challenges = Object.entries(state.estimate.challenges);
        assert(challenges.length > 0, `設定${setting} で城突入チャレンジがない`);
        for (const [boost, c] of challenges) {
            if (c.tries < 200) continue;
            const p = game.SettingEstimate.challengeRate(game.config, setting, Number(boost));
            const sd = Math.sqrt(p * (1 - p) / c.tries);
            assertBetween(c.wins / c.tries, p - 4 * sd, p + 4 * sd, `設定${setting} (突入率の倍率 ${boost}) の成功率`);
        }
    }
});

test('SE城前のチャンス目: 突入率UP (オーラ) のチャレンジがあり、成功率が上がる', () => {
    for (const { setting, state, game } of runs) {
        const boosted = state.estimate.challenges[String(game.config.castle.chanceBoost)];
        const plain = state.estimate.challenges[String(game.config.castle.minBoost)];   // 仲間なし・オーラなし (底上げの倍率)
        assert(boosted && boosted.tries > 0, `設定${setting} で突入率UPのチャレンジがない`);
        // 理論値はオーラのほうが高く、実際の成功率もばらつきの範囲で低くない (設定6 は差が小さい)
        const rate = boost => game.SettingEstimate.challengeRate(game.config, setting, boost);
        assert(rate(game.config.castle.chanceBoost) > rate(game.config.castle.minBoost), `設定${setting} で突入率UPの理論値が低い`);
        const pb = boosted.wins / boosted.tries, pp = plain.wins / plain.tries;
        const sd = Math.sqrt(pb * (1 - pb) / boosted.tries + pp * (1 - pp) / plain.tries);
        assert(pb - pp > -3 * sd, `設定${setting} で突入率UPのほうが成功率が低い`);
    }
});

test('設定推測: ふるカワの設定示唆のセリフの割合が計算値と合い、言わないはずのセリフは数えられていない', () => {
    for (const { setting, state, game } of runs) {
        const counts = state.estimate.furukawa;
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        assert(total > 100, `設定${setting} で設定示唆のセリフが少ない: ${total}`);
        game.config.furukawa.settingLines.forEach((line, i) => {
            const p = game.SettingEstimate.furukawaRate(game.config, setting, i);
            const n = counts[i] || 0;
            if (p === 0) return assertEqual(n, 0, `設定${setting} で「${line.short}」`);
            const sd = Math.sqrt(p * (1 - p) / total);
            assertBetween(n / total, p - 4 * sd, p + 4 * sd, `設定${setting} の「${line.short}」の割合`);
        });
    }
});

test('設定推測: 何も見ていないときは台の設定の抽選の重みどおり、長く打つと台の設定がいちばん高い', () => {
    const { SettingEstimate, createInitialState, config } = base;
    const weights = config.machine.weights;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const first = SettingEstimate.probabilities(createInitialState(config), config);
    for (const s of Object.keys(weights)) assertBetween(first[s], weights[s] / total - 1e-9, weights[s] / total + 1e-9, `設定${s} の最初の可能性`);
    for (const { setting, state, game } of runs) {
        const probs = game.SettingEstimate.probabilities(state, game.config);
        const sum = Object.values(probs).reduce((a, b) => a + b, 0);
        assertBetween(sum, 1 - 1e-9, 1 + 1e-9, `設定${setting} の可能性の合計`);
        const best = Object.keys(probs).reduce((a, b) => (probs[b] > probs[a] ? b : a));
        assertEqual(Number(best), setting, `設定${setting} の台で可能性がいちばん高い設定`);
    }
});

test('図鑑・実績: 記録・トロフィー・RASH 終了画面が数えられ、解除した実績は条件を満たしている', () => {
    for (const { setting, state, log, game } of runs) {
        const c = state.collection;
        const { Collection, config } = game;
        assertEqual(c.records.games, GAMES, `設定${setting} の合計ゲーム数`);
        assertEqual(c.records.rash, state.rashCount, `設定${setting} の RASH 突入`);
        assertEqual(c.records.super, state.superCount, `設定${setting} の SUPER 突入`);
        const trophies = Object.values(c.trophies).reduce((a, b) => a + b, 0);
        assertEqual(trophies, log.trophies.shown, `設定${setting} のトロフィーの回数`);
        const endCards = Object.values(c.endCards).reduce((x, y) => x + y, 0);
        assertEqual(endCards, log.rashEnds.length, `設定${setting} の RASH 終了画面を見た回数`);
        assertEqual(c.endCards.everyone > 0, c.achievements.everyone != null, `設定${setting} の実績「みんなで記念撮影」`);
        const best = Math.max(...log.rashEnds.map(e => e.coinsWon));
        assertEqual(c.records.bestCoins, best, `設定${setting} の最高獲得枚数`);
        const ids = Collection.entries(config);
        for (const id of Object.keys(c.defeats)) assert(ids.enemies.some(e => e.id === id), `設定${setting}: 図鑑にない敵 ${id}`);
        for (const id of Object.keys(c.specials)) assert(ids.specials.some(s => s.id === id), `設定${setting}: 図鑑にない必殺技 ${id}`);
        for (const a of config.collection.achievements) {
            const done = c.achievements[a.id] != null;
            assertEqual(done, Collection.stat(c, a.stat) >= Collection.target(config, a), `設定${setting} の実績「${a.name}」`);
        }
    }
    const all = base.Collection.entries(base.config);
    const six = runs[5].state.collection;
    assertEqual(Object.keys(six.defeats).length, all.enemies.length, '設定6で全員撃破');
    assertEqual(Object.keys(six.specials).length, all.specials.length, '設定6ですべての必殺技');
});

test('ふるカワ: たまに出てきて、虹は確定のときだけ、設定示唆のセリフは台の設定で言わないものを言わない', () => {
    for (const { setting, log, game } of runs) {
        const f = log.furukawa;
        const cfg = game.config.furukawa;
        assertBetween(f.talks / GAMES, 1 / 40, 1 / 8, `設定${setting} の出現率`);
        assertEqual(f.rainbowNotSure, 0, `設定${setting} で確定でないのに虹`);
        assertEqual(f.sureSilent, 0, `設定${setting} で確定なのに出てこない`);
        assertEqual(f.empty, 0, `設定${setting} で空のセリフ`);
        for (const line of cfg.settingLines) {
            if (!line.weights[setting]) assert(!f.lines.has(line.text), `設定${setting} で「${line.text}」を言った`);
        }
        for (let c = 0; c <= 5; c++) assert(f.byColor[c] > 0, `設定${setting} で色 ${c} が一度も出ない`);
        assert(f.byColor[6] > 0, `設定${setting} で虹が一度も出ない`);
        assert([...f.lines].some(t => t.startsWith('次は')), `設定${setting} で次のステージを言わない`);
        // RASH 中は攻めるセリフ (通常時のチャンスのセリフは言わない)
        assert(f.rashLines.has('いけるよ！') && f.rashLines.has('ここがせめどき！'), `設定${setting} の RASH で「いけるよ！」「ここがせめどき！」を言わない`);
        const normalChance = [...Object.values(cfg.chanceLines).flat(), ...cfg.expectLines];
        assert(!normalChance.some(t => f.rashLines.has(t)), `設定${setting} の RASH で通常時のチャンスのセリフを言った`);
        // 対戦相手を決めるゲームと「？？」は専用のセリフだけ
        const select = f.phaseLines[base.RASH_PHASES.SELECT];
        const question = f.phaseLines[base.RASH_PHASES.QUESTION];
        assert(select.has('誰が来るかな？') && select.has('強い気配がするよ！'), `設定${setting} の相手を決めるゲームで「誰が来るかな？」「強い気配がするよ！」を言わない`);
        assert(question.has('おねがい！続いて！'), `設定${setting} の「？？」で「おねがい！続いて！」を言わない`);
        const selectAll = [...Object.values(cfg.selectLines).flat()];
        assert([...select].every(t => selectAll.includes(t) || t.startsWith('次の相手は')), `設定${setting} の相手を決めるゲームでほかのセリフ`);
        const questionAll = [...Object.values(cfg.questionLines).flat()];
        assert([...question].every(t => questionAll.includes(t)), `設定${setting} の「？？」でほかのセリフ`);
        // ダンシングステージ・宝物庫ゾーンも専用のセリフだけ (ふだんのセリフと熱いときのセリフの両方が出る)
        for (const [key, lines] of [['dance', cfg.danceLines], [base.RASH_PHASES.TREASURE, cfg.treasureLines]]) {
            const said = f.phaseLines[key] || new Set();
            assert(lines.normal.some(t => said.has(t)) && lines.hot.some(t => said.has(t)), `設定${setting} の ${key} でふるカワが出ない`);
            assert([...said].every(t => [...lines.normal, ...lines.hot].includes(t)), `設定${setting} の ${key} でほかのセリフ`);
        }
    }
});

test('図鑑の解禁: ともいしは SUPER 到達、仲間は仲間になる、ふるカワは出てくる、敵は撃破で説明が見られる', () => {
    for (const { setting, state, log, game } of runs) {
        const { Collection, config } = game;
        const c = state.collection;
        const unlocked = id => Collection.isUnlocked(c, id, config);
        assert(unlocked('koori'), `設定${setting}: こおりくんが解禁されていない`);
        assertEqual(unlocked('tomoishi'), state.superCount > 0, `設定${setting}: ともいしの解禁`);
        assertEqual(Boolean(c.met.tomoishi), state.superCount > 0, `設定${setting}: ともいしに会った記録`);
        assertEqual(unlocked('furukawa'), log.furukawa.talks > 0, `設定${setting}: ふるカワの解禁`);
        for (const m of config.companions.members) assertEqual(unlocked(m.id), log.joined.has(m.id), `設定${setting}: ${m.name}の解禁`);
        for (const e of Collection.entries(config).enemies) assertEqual(unlocked(e.id), (c.defeats[e.id] || 0) > 0, `設定${setting}: ${e.name}の解禁`);
    }
    // 会った記録のない古いデータでも、SUPER の記録・仲間の必殺技から解禁される
    const { Collection, config, createInitialState } = base;
    const old = createInitialState(config).collection;
    delete old.met;
    assert(!Collection.isUnlocked(old, 'tomoishi', config) && !Collection.isUnlocked(old, 'yasu', config), '古いデータで最初から解禁されている');
    old.records.super = 1;
    old.specials.yasu = 1;
    assert(Collection.isUnlocked(old, 'tomoishi', config) && Collection.isUnlocked(old, 'yasu', config), '古いデータで解禁されない');
});

test('ふるカワ: 敵と戦いはじめて1ゲーム目 (内定の時ゾーンも) は、熱い役でなければ必ずその敵の話をする', () => {
    for (const { setting, log } of runs) {
        const i = log.furukawa.intro;
        assert(i.games > 0 && i.said > 0, `設定${setting} で戦いはじめの話をしない`);
        assertEqual(i.wrong, 0, `設定${setting} で戦いはじめにその敵の話をしなかった`);
        assert(i.hot > 0, `設定${setting} で戦いはじめに熱い役が一度もない`);
        assert(i.hotIntroLine < i.hot, `設定${setting} で熱い役なのに戦いはじめの話ばかり`);
        assert(i.naitei > 0, `設定${setting} で内定の時ゾーンのはじめに話をしない`);
        // 内定の時ゾーンの中 (2ゲーム目以降も) に出てくる
        assert(log.furukawa.phaseLines[base.RASH_PHASES.NAITEI].size > 2, `設定${setting} で内定の時ゾーンにふるカワが出ない`);
    }
});

test('ふるカワ: 敵・ともいしへの返事、撃破・RASH 終了・エンディングのひとことが必ず付く', () => {
    for (const { setting, log, game } of runs) {
        const ev = log.furukawa.events;
        assert(ev.reply > 0 && ev.defeat > 0 && ev.naitei > 0 && ev.rashEnd > 0 && ev.super > 0 && ev.ending > 0, `設定${setting} で返事・ひとことがない (${JSON.stringify(ev)})`);
        // RASH 終了は結果に合わせて4種類とも出る
        const end = game.config.furukawa.rashEndLines;
        for (const kind of ['super', 'many', 'normal', 'zero']) assert(end[kind].some(t => ev.rashEndLines.has(t)), `設定${setting} で RASH 終了の ${kind} のセリフが出ない`);
        assertEqual(ev.missing, 0, `設定${setting} で返事・撃破のひとことが付いていない`);
        assertEqual(ev.wrong, 0, `設定${setting} でほかの敵のセリフ`);
        assertEqual(ev.repeat, 0, `設定${setting} で同じ敵への返事・ひとことが続けて同じ`);
        assertEqual(log.furukawa.sameInRow, 0, `設定${setting} でふるカワのセリフが2回続けて同じ`);
    }
});

test('ふるカワのセリフ図鑑: 図鑑に載るセリフだけ数え、実績の数と合う', () => {
    for (const { setting, state, game } of runs) {
        const { Furukawa, Collection, config } = game;
        const groups = Furukawa.catalog(config);
        const all = groups.flatMap(g => g.lines);
        assertEqual(new Set(all).size, all.length, '図鑑のセリフが重複している');
        assert(groups.every(g => g.lines.length > 0), '空の分類がある');
        assert(!all.some(t => /\d/.test(t) && t.includes('G')), '数字の入るセリフが図鑑に載っている');
        const heard = state.collection.furukawaLines;
        const keys = Object.keys(heard);
        assert(keys.every(t => all.includes(t)), `設定${setting} で図鑑に載らないセリフを数えた`);
        assertBetween(keys.length / all.length, 0.8, 1, `設定${setting} で聞いたセリフの割合`);
        assert(config.furukawa.replies.shibata.some(t => heard[t]) && config.furukawa.defeatLines.naitei.some(t => heard[t]), `設定${setting} で返事・撃破のひとことが図鑑に入っていない`);
        assertEqual(Collection.stat(state.collection, 'furukawaKinds'), keys.length, `設定${setting} のセリフの種類の数`);
        const six = config.furukawa.settingLines.find(l => !l.weights[5]).text;
        assertEqual(Boolean(heard[six]), setting === 6, `設定${setting} で「${six}」`);
    }
});

test('ふるカワ: キャラクターの話をする (通常時・仲間・戦っている敵・SUPER のともいし)', () => {
    for (const { setting, log, game } of runs) {
        const chat = game.config.furukawa.chatLines;
        const f = log.furukawa;
        assert(chat.normal.some(t => f.lines.has(t)), `設定${setting} の通常時にキャラクターの話をしない`);
        assert(Object.values(chat.companions).flat().some(t => f.lines.has(t)), `設定${setting} で仲間の話をしない`);
        for (const id of ['okagappa', 'onioni']) assert(chat.enemies[id].some(t => f.rashLines.has(t)), `設定${setting} で ${id} の話をしない`);
        assert(chat.super.some(t => f.rashLines.has(t)), `設定${setting} の SUPER でともいしの話をしない`);
    }
});

test('復活: 「？？」の負けの一部で復活が決まり、次のゲームは 7揃い (払い出しなし) で戦っていた敵を撃破して RASH 継続', () => {
    for (const { setting, state, log } of runs) {
        const r = log.revival;
        assert(r.pending > 0, `設定${setting} で復活が一度もない`);
        assertBetween(r.pending / (r.pending + r.ends), 0.07, 0.18, `設定${setting} の復活の割合`);
        assertEqual(r.notPending, 0, `設定${setting} で復活が決まったのに復活待ちになっていない`);
        assert(r.revived === r.pending || r.revived === r.pending - 1, `設定${setting} で復活待ちのあと復活していない`);
        assertEqual(r.noDefeat, 0, `設定${setting} で復活したのに敵を撃破していない`);
        assertEqual(r.notSeven, 0, `設定${setting} で復活のゲームが 7揃いでない`);
        assertEqual(r.paid, 0, `設定${setting} で復活の 7揃いに払い出しがある`);
        assertEqual(state.collection.records.revival, r.revived, `設定${setting} の図鑑の復活の回数`);
    }
});

test('おにおに出現: SUPER 中は常に候補に入っているので「おにおにが現れる…!?」は出ない', () => {
    for (const { setting, log } of runs) assertEqual(log.oniUnlockInSuper, 0, `設定${setting} の SUPER 中のおにおに出現`);
});

test('エンディング: SUPER 中におにおにを撃破したときだけ、SUPER 1回につき1回流れ、図鑑の回数が合う', () => {
    for (const { setting, state, log } of runs) {
        const e = log.ending;
        assert(e.count > 0, `設定${setting} でエンディングが一度もない`);
        assertEqual(e.notSuperOni, 0, `設定${setting} で SUPER 中のおにおに撃破以外のエンディング`);
        assertEqual(e.twiceInSet, 0, `設定${setting} で1回の RASH にエンディングが2回`);
        assertEqual(state.collection.records.ending, e.count, `設定${setting} の図鑑のエンディングの回数`);
    }
});

test('リベンジチャンス: 成功すると前の RASH の撃破数を引き継ぎ、SUPER だったら SUPER に戻る', () => {
    for (const { setting, log } of runs) {
        const r = log.revenge;
        assert(r.success > 0 && r.carried > 0, `設定${setting} で撃破数を引き継いだリベンジがない`);
        assert(r.fromSuper > 0, `設定${setting} で SUPER のあとのリベンジ成功がない`);
        assertEqual(r.toSuper, r.fromSuper, `設定${setting} で SUPER に戻った回数`);
        assertEqual(r.wrong, 0, `設定${setting} で引き継ぎがおかしいリベンジ`);
    }
});

test('台移動: コイン・投資額・獲得枚数は持ち越し、台の設定・進行状況・データカウンターは新しい台', () => {
    const { state } = runs[5];
    const { MachineMove, MODES, config } = runs[5].game;
    const next = MachineMove.next(state, config);
    assertEqual(next.coins, state.coins, 'コイン');
    assertEqual(next.totalSpent, state.totalSpent, '投資額');
    assertEqual(next.totalCoinsWon, state.totalCoinsWon, '獲得枚数');
    assertEqual(next.machineNo, (state.machineNo || 1) + 1, '台番号');
    assertEqual(next.mode, MODES.NORMAL, 'モード');
    assertEqual(next.totalGames, 0, '総ゲーム数');
    assertEqual(next.rashCount, 0, 'RASH 回数');
    assertEqual(next.hitHistory.length, 0, '大当たり履歴');
    assertEqual(next.companions.length, 0, '仲間');
    assertEqual(next.estimate.normalGames, 0, '設定推測の材料');
    assertEqual(next.collection, state.collection, '図鑑・実績は引き継ぐ');
    assert(config.machine.multipliers[next.setting], `台の設定が不正: ${next.setting}`);
    // 設定は抽選し直し (同じ設定になることもあるが、何度か移れば変わる)
    const settings = new Set(Array.from({ length: 50 }, () => MachineMove.next(state, config).setting));
    assert(settings.size > 1, '台の設定が抽選し直されていない');
});

test('保存データ: 保存して読み込むと、コイン・履歴・台番号・台移動の印が戻る', () => {
    const { state } = runs[2];
    const { SaveData, MachineMove, config } = runs[2].game;
    const moved = MachineMove.next(state, config);
    moved.justMoved = true;
    assert(SaveData.save(state), '保存できない');
    const loaded = SaveData.load(config);
    assert(loaded, '読み込めない');
    assertEqual(loaded.coins, state.coins, 'コイン');
    assertEqual(loaded.hitHistory.length, state.hitHistory.length, '履歴の件数');
    assertEqual(loaded.setting, state.setting, '台の設定');
    assert(SaveData.save(moved), '台移動後を保存できない');
    const loadedMoved = SaveData.load(config);
    assertEqual(loadedMoved.machineNo, moved.machineNo, '台番号');
    assertEqual(loadedMoved.justMoved, true, '台移動の印');
    assertEqual(JSON.stringify(loadedMoved.collection), JSON.stringify(moved.collection), '図鑑・実績');
    assertEqual(JSON.stringify(loadedMoved.estimate), JSON.stringify(moved.estimate), '設定推測の材料');
});

test('保存データ: 以前の形式 (履歴・台番号なし) も読み込める', () => {
    const { SaveData, createInitialState, config } = base;
    const old = createInitialState(config);
    delete old.hitHistory;
    delete old.gamesSinceHit;
    delete old.machineNo;
    delete old.estimate;
    delete old.collection;
    SaveData.save(old);
    const loaded = SaveData.load(config);
    assert(loaded, '読み込めない');
    assert(Array.isArray(loaded.hitHistory) && loaded.hitHistory.length === 0, '履歴が空の配列になっていない');
    assertEqual(loaded.machineNo, 1, '台番号');
    assertEqual(loaded.collection.records.games, 0, '図鑑・実績が初期値');
    assertEqual(loaded.estimate.normalGames, 0, '設定推測の材料が初期値');
});

test('アップデート情報: 更新されたときだけ1回表示し、はじめて遊ぶとき・表示しない設定のときは出さない', () => {
    const ids = loadGame(1).UPDATES.map(u => u.id);
    assertEqual(new Set(ids).size, ids.length, 'id が重複している');
    // はじめて遊ぶ: 出さずに見たことにする → 次に開いても出ない
    let g = loadGame(1);
    assertEqual(g.UpdateNotes.takePending(true).length, 0, 'はじめて遊ぶときに表示した');
    assertEqual(g.UpdateNotes.takePending(false).length, 0, '同じ版で2回表示した');
    // この仕組みより前から遊んでいる人 (見た記録がない): いちばん新しい1件だけ
    g = loadGame(1);
    const first = g.UpdateNotes.takePending(false);
    assertEqual(first.length, 1, '前から遊んでいる人に出す件数');
    assertEqual(first[0].id, ids[0], 'いちばん新しい更新を出していない');
    assertEqual(g.UpdateNotes.takePending(false).length, 0, '見たあとにまた表示した');
    // 2回分たまっていたら、新しい順に2件
    assertEqual(g.UpdateNotes.newerThan(g.UPDATES, ids[2]).map(u => u.id).join(), [ids[0], ids[1]].join(), '見ていない分');
    // 表示しない設定: 出さないが見たことにする
    g = loadGame(1);
    g.UpdateNotes.setEnabled(false);
    assertEqual(g.UpdateNotes.takePending(false).length, 0, '表示しない設定なのに表示した');
    g.UpdateNotes.setEnabled(true);
    assertEqual(g.UpdateNotes.takePending(false).length, 0, '表示に戻したら、たまった分を出した');
});

// 出玉シミュレーター: 少ないゲーム数で実際に動かす (ゲームの処理が新しいファイルを使うようになったのに、
// シミュレーターが読み込んでいないと動かなくなる。ブラウザ版の simulate.html も同じファイルを読み込んでいるか確かめる)
test('内定の時ゾーン: 負けの約1割でアルアルが復活して突破と同じ扱いになり、図鑑・実績に記録される', () => {
    for (const { setting, state, log, game } of runs) {
        const a = log.aruaru;
        assert(a.revived > 0, `設定${setting} でアルアルが一度も出ない`);
        assertBetween(a.revived / (a.revived + a.lost), 0.04, 0.18, `設定${setting} のアルアルの割合 (負けのうち)`);
        assertEqual(a.notSuper, 0, `設定${setting} でアルアルのあと SUPER にならない`);
        const c = state.collection;
        const id = game.config.naitei.aruaru.id;
        assertEqual(c.records.aruaru, a.revived, `設定${setting} のアルアルの回数`);
        assertEqual(c.specials[id], a.revived, `設定${setting} の「採用の祝福」の回数`);
        assertEqual(c.records.naitei, a.won + a.revived, `設定${setting} の内定の時の突破の回数 (アルアルも含む)`);
        assert(game.Collection.isUnlocked(c, id, game.config), `設定${setting} でアルアルの説明が解禁されない`);
        assert(c.achievements.aruaru != null, `設定${setting} で実績「内定がある！！」が解除されない`);
    }
});

test('出玉シミュレーター: Node.js 版が動いて出玉率を出し、ブラウザ版も同じファイルを読み込んでいる', () => {
    const { spawnSync } = require('child_process');
    const sim = path.join(__dirname, 'simulate.js');
    const res = spawnSync(process.execPath, [sim, '--games', '20000', '--settings', '1,6', '--json'], { encoding: 'utf8', timeout: 60000 });
    assertEqual(res.status, 0, `simulate.js が失敗した (${(res.stderr || res.stdout || '').trim().split('\n').pop()})`);
    const rows = JSON.parse(res.stdout);
    assertEqual(rows.map(r => r.setting).join(), '1,6', 'シミュレーターの設定');
    for (const r of rows) {
        // 2万ゲームなのでぶれが大きい (設定6 は 約1.3 だが、まれに 1.6 を超える)。動いているかを見るための範囲
        assertBetween(r.rtp, 0.7, 2.0, `シミュレーターの設定${r.setting} の出玉率`);
        assert(r.rashOdds > 0 && r.entryRate > 0, `シミュレーターの設定${r.setting} で RASH・城突入がない`);
    }
    // ブラウザ版: simulate.js が読み込むゲームのファイルを、simulate.html もすべて読み込む
    const files = fs.readFileSync(sim, 'utf8').match(/const GAME_FILES = \[([^\]]*)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
    const html = fs.readFileSync(path.join(__dirname, 'simulate.html'), 'utf8');
    for (const file of files) assert(html.includes(`src="../js/${file}`), `simulate.html が ${file} を読み込んでいない`);
});

// ----- 結果 -----
for (const r of results) console.log(`${r.ok ? '  ✔' : '  ✘'} ${r.name}${r.ok ? '' : `\n      → ${r.message}`}`);
const failed = results.filter(r => !r.ok).length;
const summary = runs.map(r => `設定${r.setting}: RASH ${r.state.rashCount}回 / トロフィー ${pct(r.log.trophies.shown / r.log.trophies.total)} / SUPER ${r.log.ending.supers}回・エンディング ${r.log.ending.count}回`).join('  ');
console.log(`\n${summary}`);
console.log(`\n${results.length - failed} / ${results.length} 成功 (${((Date.now() - started) / 1000).toFixed(1)} 秒)`);
process.exit(failed ? 1 : 0);
