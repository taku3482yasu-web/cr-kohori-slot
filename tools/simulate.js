// =====================================================================
// 出玉シミュレーター (Node.js 版)
// ---------------------------------------------------------------------
// js/config.js の数値で、通常時・城突入・RASH を通しで自動プレイして統計を出す (演出は省略)。
// simulate.html と同じ計算に加えて、RASH のセット継続率も数える。
// 設定ごと・回ごとに別のスレッドで並列に動かすので、ブラウザ版より速い。
//
// 使い方 (koori フォルダで):
//   node tools/simulate.js                      設定1〜6 を 1000万ゲームずつ
//   node tools/simulate.js --games 30000000     ゲーム数を変える
//   node tools/simulate.js --settings 1,3 --runs 3
//                                               設定1と3を3回ずつ計測 (回ごとの値と平均を表示)
//   node tools/simulate.js --set rash.normal.presetRate=0.47 --set machine.multipliers.4.chance=1.4
//                                               config.js を書き換えずに数値を試す (複数指定可)
//   node tools/simulate.js --json               結果を JSON で出力
//
// 出玉率 = 払い出し枚数の合計 ÷ 投入枚数の合計 (RASH 中も1ゲーム3枚投入として計算)
// セット継続率 = BATTLE 中の撃破と「？？」の継続を勝ち、「？？」で揃わない・仲間の肩代わりを負けとして数える
//               (ロングフリーズによる撃破は数えない)
// =====================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const JS_DIR = path.join(__dirname, '..', 'js');
const GAME_FILES = ['config.js', 'state.js', 'lottery.js', 'battle.js'];

// ゲームのスクリプトをブラウザと同じように1つのグローバル環境に読み込む
function loadGame(overrides) {
    const context = { console, Math };
    context.window = context;
    vm.createContext(context);
    for (const file of GAME_FILES) {
        vm.runInContext(fs.readFileSync(path.join(JS_DIR, file), 'utf8'), context, { filename: file });
    }
    const game = vm.runInContext('({ createInitialState, Lottery, GameFlow, MODES, RASH_PHASES })', context);
    game.config = context.GAME_CONFIG;
    for (const [key, value] of overrides) setPath(game.config, key, value);
    return game;
}

function setPath(obj, key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    let target = obj;
    for (const p of parts) {
        if (!(p in target)) throw new Error(`config に ${key} がありません`);
        target = target[p];
    }
    if (!(last in target)) throw new Error(`config に ${key} がありません`);
    target[last] = value;
}

// 設定 setting で games ゲーム自動プレイした統計を返す
function simulate(setting, games, overrides) {
    const { createInitialState, Lottery, GameFlow, MODES, RASH_PHASES, config } = loadGame(overrides);
    const state = createInitialState(config);
    state.setting = setting;
    const cost = config.coins.spinCost;
    const s = {
        setting, games, coinIn: 0, coinOut: 0, normalIn: 0, normalOut: 0,
        rash: 0, challenges: 0, entries: 0, super: 0, pointChances: 0, rashCoins: 0,
        sets: { normal: [0, 0], super: [0, 0] }   // [勝ち, 合計]
    };
    for (let g = 0; g < games; g++) {
        const mode = state.mode;
        const phase = state.rash.phase;
        const before = state.totalCoinsWon;
        const outcome = Lottery.draw(state, config);
        const events = GameFlow.onGameEnd(state, outcome, config);
        const won = state.totalCoinsWon - before;
        s.coinIn += cost;
        s.coinOut += won;
        if (mode === MODES.NORMAL || mode === MODES.CASTLE_CHALLENGE) {
            s.normalIn += cost;
            s.normalOut += won;
        }
        const set = mode === MODES.SUPER_RASH ? s.sets.super : mode === MODES.RASH ? s.sets.normal : null;
        for (const e of events) {
            if (e.type === 'challengeStart') s.challenges++;
            if (e.type === 'castleEntry') s.entries++;
            if (e.type === 'rashStart') s.rash++;
            if (e.type === 'superStart') s.super++;
            if (e.type === 'pointChance') s.pointChances++;
            if (e.type === 'rashEnd') s.rashCoins += e.coinsWon;
            if (e.type === 'naiteiResult' && e.toCastle) s.rashCoins += e.coinsWon;   // 内定の時ゾーンの失敗で終了
            if (!set) continue;
            if (e.type === 'defeat' && phase === RASH_PHASES.BATTLE && !outcome.isFreeze) { set[0]++; set[1]++; }
            if (e.type === 'questionResult') { set[1]++; if (e.continued) set[0]++; }
            if (e.type === 'companionSave') set[1]++;
        }
    }
    return s;
}

function summarize(s) {
    return {
        setting: s.setting,
        games: s.games,
        rtp: s.coinOut / s.coinIn,
        rashOdds: s.rash ? s.games / s.rash : null,
        challengeOdds: s.challenges ? s.games / s.challenges : null,
        entryRate: s.challenges ? s.entries / s.challenges : null,
        rashCoins: s.rash ? s.rashCoins / s.rash : null,
        superRate: s.rash ? s.super / s.rash : null,
        pointChanceOdds: s.pointChances ? s.games / s.pointChances : null,
        normalRtp: s.normalOut / s.normalIn,
        setContinue: s.sets.normal[1] ? s.sets.normal[0] / s.sets.normal[1] : null,
        superSetContinue: s.sets.super[1] ? s.sets.super[0] / s.sets.super[1] : null
    };
}

// ----- 表示 -----
const pct = v => (v == null ? '-' : (v * 100).toFixed(1) + '%');
const odds = v => (v == null ? '-' : '1/' + Math.round(v));
const coins = v => (v == null ? '-' : Math.round(v) + '枚');
const COLUMNS = [
    ['出玉率', r => pct(r.rtp)],
    ['RASH 初当たり', r => odds(r.rashOdds)],
    ['城突入チャレンジ', r => odds(r.challengeOdds)],
    ['突入成功率', r => pct(r.entryRate)],
    ['RASH 平均獲得', r => coins(r.rashCoins)],
    ['SUPER 到達率', r => pct(r.superRate)],
    ['継続率(通常)', r => pct(r.setContinue)],
    ['継続率(SUPER)', r => pct(r.superSetContinue)],
    ['ポイントチャンス', r => odds(r.pointChanceOdds)],
    ['通常時の出玉率', r => pct(r.normalRtp)]
];

// 全角を2文字分として幅をそろえる
const width = str => [...str].reduce((w, c) => w + (c.charCodeAt(0) > 0xff ? 2 : 1), 0);
const pad = (str, w) => ' '.repeat(Math.max(0, w - width(str))) + str;

function printTable(rows) {
    const header = ['設定', ...COLUMNS.map(c => c[0])];
    const body = rows.map(r => [r.label, ...COLUMNS.map(c => c[1](r))]);
    const widths = header.map((h, i) => Math.max(width(h), ...body.map(b => width(b[i]))));
    for (const line of [header, ...body]) console.log(line.map((v, i) => pad(v, widths[i])).join('  '));
}

// 複数回の結果を平均する (null は除く)
function average(results) {
    const avg = { setting: results[0].setting, games: results.reduce((a, r) => a + r.games, 0) };
    for (const key of Object.keys(results[0])) {
        if (key === 'setting' || key === 'games') continue;
        const values = results.map(r => r[key]).filter(v => v != null);
        avg[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    return avg;
}

// ----- 引数 -----
function parseArgs(argv) {
    const opts = { games: 10000000, settings: [1, 2, 3, 4, 5, 6], runs: 1, overrides: [], json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            if (i + 1 >= argv.length) throw new Error(`${arg} の値がありません`);
            return argv[++i];
        };
        if (arg === '--games') opts.games = Number(next());
        else if (arg === '--settings') opts.settings = next().split(',').map(Number);
        else if (arg === '--runs') opts.runs = Number(next());
        else if (arg === '--json') opts.json = true;
        else if (arg === '--set') {
            const [key, value] = next().split('=');
            opts.overrides.push([key, JSON.parse(value)]);
        } else if (arg === '--help' || arg === '-h') {
            // 先頭のコメント (2本の ===== の間) を表示
            const lines = fs.readFileSync(__filename, 'utf8').split(/\r?\n/);
            const end = lines.findIndex((l, n) => n > 0 && l.startsWith('// ====='));
            console.log(lines.slice(1, end).filter(l => !l.startsWith('// ---')).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
            process.exit(0);
        } else throw new Error(`不明な引数: ${arg}`);
    }
    if (!(opts.games > 0) || !(opts.runs > 0)) throw new Error('--games と --runs は1以上の数');
    if (opts.settings.some(s => !(s >= 1 && s <= 6))) throw new Error('--settings は 1〜6');
    return opts;
}

// ----- 実行 -----
if (!isMainThread) {
    const { setting, games, overrides } = workerData;
    parentPort.postMessage(summarize(simulate(setting, games, overrides)));
} else {
    main().catch(e => {
        console.error(e.message);
        process.exit(1);
    });
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    loadGame(opts.overrides);   // --set の項目名を先に確かめる
    const jobs = opts.settings.flatMap(setting => Array.from({ length: opts.runs }, () => setting));
    const threads = Math.max(1, Math.min(jobs.length, os.cpus().length));
    if (!opts.json) {
        console.log(`設定 ${opts.settings.join(',')} を ${opts.games.toLocaleString()} ゲームずつ ${opts.runs} 回 (${threads} スレッド)`);
        for (const [key, value] of opts.overrides) console.log(`  ${key} = ${JSON.stringify(value)}`);
    }
    const started = Date.now();
    const results = [];
    let next = 0;
    const runWorker = () => new Promise((resolve, reject) => {
        const loop = () => {
            if (next >= jobs.length) return resolve();
            const setting = jobs[next++];
            const worker = new Worker(__filename, { workerData: { setting, games: opts.games, overrides: opts.overrides } });
            worker.once('message', r => { results.push(r); loop(); });
            worker.once('error', reject);
        };
        loop();
    });
    await Promise.all(Array.from({ length: threads }, runWorker));

    const rows = [];
    for (const setting of opts.settings) {
        const runs = results.filter(r => r.setting === setting);
        if (opts.runs > 1) runs.forEach((r, i) => rows.push({ ...r, label: `${setting} (${i + 1})` }));
        rows.push({ ...average(runs), label: opts.runs > 1 ? `${setting} 平均` : String(setting) });
    }
    if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }
    printTable(rows);
    console.log(`(${((Date.now() - started) / 1000).toFixed(1)} 秒)`);
}
