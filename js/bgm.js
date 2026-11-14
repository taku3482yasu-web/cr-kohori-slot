// =====================================================================
// BGM (Web Audio で鳴らすチップチューン)
// ---------------------------------------------------------------------
// 曲は 8分音符単位の音名の並び。'.' は休符。メロディ (矩形波) とベース (三角波) の2パート。
// 先の音を少しずつ予約して鳴らすので、画面の描画が重くてもテンポがずれにくい。
// 2026-11-10 (ユーザー指摘: 通常時などで BGM がおかしくなる) の 修正:
//   - 予約を 0.15 秒 → 0.4 秒先までにして、描画が重いときも 音が 途切れにくくした
//   - 曲を 切り替えたとき、前の 曲の 予約ずみの 音を 止める (2 曲が 重なって 鳴らない)
//   - タブが 裏に 回ったら 止める (裏では タイマーが 遅くなり、音が とびとびに なるため)。戻ったら 続きから
// 2026-11-13 (ユーザー指定: おかランプの 曲を Suno で 作った ラップ入りの 曲に): 音声ファイルの 曲 (BGM_FILES) も 流せる。
//   ファイルが ない・読めない ときは fallback の チップチューンを 流す (ファイルを 置くまでは 今までの ダンスの 曲)。
//   <audio> で 鳴らすので、index.html を 直接 開いても (file://) 鳴る
// 2026-11-13 (ユーザー指摘: 通常時や RASH で 回して いると 音が 飛んだり 変な音が 鳴る) の 修正:
//   - 毎ゲームの 終わりの「一時停止を 解除」で、止めて いない のに 予約の 時刻を 今に 戻して いた → 同じ 音が ずれて 二重に 鳴って いた。
//     止めて いない ときは 何も しない ように した
//   - 描画が 重くて 予約が 遅れた ときは、遅れた 拍を とばして 拍子を 保つ (時刻だけ 合わせると リズムが ずれる)
//   - 予約を 0.6 秒 先まで に した
// 2026-11-14 (ユーザー指定: 今の 曲は 消さず、前の 曲か 今の 曲かを 選べる ように): setStyle('new' / 'old')。⚙ SETTINGS で 選ぶ。
//   'new' = 今の 曲 (Suno の 曲。sound/*.mp3)。'old' = 前の 曲 (チップチューン。おかランプだけは 前の Suno の 曲 sound/okapipo-old.mp3)
// =====================================================================

// 音声ファイルの 曲: src は index.html から 見た 場所。gain は 音量の 倍率 (チップチューンと 大きさを そろえる)
// 2026-11-14: ユーザーが Suno で 作った 曲を 入れた。gain は 曲の 大きさ (ラウドネス) を 測って そろえた
// 2026-11-13 (ユーザー指定: ほかの BGM も Suno の 曲に): どの 曲も sound/<曲の 名前>.mp3 を 置けば その 曲に なる。
//   置いて いない 曲は 今までの チップチューン。Suno に 入れる 内容は sound/SUNO.md
// 2026-11-14 (ユーザー指定: 曲に 合わせて 演出を): bpm・offset (曲の 頭から 最初の 拍までの 秒) は 曲を 解析して 測った 値。
//   chorus は 盛り上がる ところ (サビ) の 秒。曲の 大きさを 小節ごとに 測って、最初に いちばん 大きく なる 8 小節の 頭を とった。
//   当たり・復活 などで 曲を 止めた あとは ここから 再開する (Bgm.climax)。ずれて いたら ここの 数字を 直す
//   Bgm.beat() で いまの 拍が わかる (js/lcd/beat-fx.js が 光・動きを 拍に 合わせる)。title は 曲の 頭に 出す 曲名
const BGM_FILES = {
    field: { src: 'sound/field.mp3', title: 'こおりくんの大冒険', fallback: 'field', gain: 0.8 },       // 通常時 (ステージの 曲が ない ときも これ)
    // 通常時の ステージ別の 曲 (2026-11-13 ユーザー指定)。ない ステージは field.mp3 → それも なければ チップチューン (main.js)
    tsugakuro: { src: 'sound/stage-tsugakuro.mp3', bpm: 133.0, offset: 0.169, chorus: 21.82, title: '通学路', fallback: 'field', gain: 0.64 },   // 通学路
    ongagawa: { src: 'sound/stage-ongagawa.mp3', bpm: 111.0, offset: 0.518, chorus: 17.82, title: '遠賀川', fallback: 'field', gain: 0.64 },     // 遠賀川
    ebisucho: { src: 'sound/stage-ebisucho.mp3', bpm: 124.0, offset: 0.141, chorus: 31.11, title: '恵比寿町', fallback: 'field', gain: 0.76 },     // 恵比寿町
    castle: { src: 'sound/castle.mp3', bpm: 121.22, offset: 0.351, chorus: 55.79, title: 'SE城の門', fallback: 'castle', gain: 0.67 },    // SE城前・城突入チャレンジ
    battle: { src: 'sound/battle.mp3', bpm: 174.0, offset: 0.201, chorus: 77.44, title: 'おにおにRASH', fallback: 'battle', gain: 0.79 },   // おにおにRASH
    // おにおにRASH の 曲を 増やした (2026-11-13 ユーザー指定)。RASH に 入る たびに、置いて ある 曲から ランダム (main.js の RASH_SONGS)
    rash2: { src: 'sound/rash2.mp3', bpm: 170.0, offset: 0.015, chorus: 28.25, title: 'こおりばりきつよい！', fallback: 'battle', gain: 0.7 },     // こおりくんの テーマ
    rash3: { src: 'sound/rash3.mp3', bpm: 155.0, offset: 0.016, chorus: 86.73, title: 'SE城 突撃', fallback: 'battle', gain: 0.64 },     // SE城 突撃 (ユーロビート)
    rash4: { src: 'sound/rash4.mp3', bpm: 178.0, offset: 0.014, chorus: 53.95, title: '宿敵おにおに', fallback: 'battle', gain: 0.67 },     // 宿敵おにおに
    battle2: { src: 'sound/battle2.mp3', bpm: 177.76, offset: 0.084, chorus: 10.89, title: 'おにおにRASH (歌あり)', fallback: 'battle', gain: 0.72 }, // おにおにRASH (歌あり)
    super: { src: 'sound/super.mp3', bpm: 164.17, offset: 0.107, chorus: 105.37, title: 'SUPERおにおにRASH', fallback: 'super', gain: 0.8 },      // SUPERおにおにRASH (歌なし)
    super2: { src: 'sound/super2.mp3', bpm: 170.0, offset: 0.162, chorus: 62.28, title: 'SUPERおにおにRASH (歌あり)', fallback: 'super', gain: 0.78 },    // SUPERおにおにRASH (歌あり)。SUPER に 入る たびに super と ランダム
    defeat: { src: 'sound/defeat.mp3', bpm: 72.07, offset: 0.173, chorus: 0, title: '凍える夜', fallback: 'defeat', gain: 0.78 },    // バトル敗北・復活待ち
    dance: { src: 'sound/dance.mp3', bpm: 133.2, offset: 0.3, chorus: 14.71, title: 'ダンシング おにおに', fallback: 'dance', gain: 0.71 },      // ダンシングステージ
    // 上乗せ特化ゾーン「おかランプ」(オカピポ): Suno で 作った ラップ入りの 曲 (sound/README.md)
    // old: 前の 曲を 選んだ ときの ファイル (ない 曲は チップチューン)。前の おかランプの 曲は「おかピポ・ナイト」
    okapipo: { src: 'sound/okapipo.mp3', bpm: 128.42, offset: 0.37, chorus: 37.75, title: 'おかピポ・ナイト', old: 'sound/okapipo-old.mp3', oldGain: 0.85, oldBpm: 128, oldOffset: 0, oldTitle: 'おかピポ・ナイト (前の曲)', oldChorus: 142.5, fallback: 'dance', gain: 0.75 },
    // ほかの 上乗せ特化ゾーン (2026-11-13 ユーザー指定)。ファイルが ない ときは RASH / SUPER の 曲 (main.js の bgmFallback)
    tokkaFire: { src: 'sound/tokka-fire.mp3', bpm: 167.91, offset: 0.342, chorus: 11.78, title: 'こおりファイアー', fallback: 'battle', gain: 0.77 },        // こおりファイアー
    tokkaIkkeki: { src: 'sound/tokka-ikkeki.mp3', bpm: 150.04, offset: 0.017, chorus: 12.81, title: '一撃入魂', fallback: 'battle', gain: 0.7 },    // おにおに一撃入魂
    tokkaAsahara: { src: 'sound/tokka-asahara.mp3', bpm: 100.0, offset: 0.0, chorus: 38.4, title: 'ASAHARA CHANCE', fallback: 'battle', gain: 0.7 }   // ASAHARA CHANCE
};

// チップチューンの 曲名 (曲名の 表示用)
const CHIP_TITLES = { field: 'こおりくんの冒険 (8bit)', castle: 'SE城 (8bit)', battle: 'おにおにRASH (8bit)', defeat: '敗北 (8bit)', dance: 'ダンシング (8bit)', super: 'SUPER RASH (8bit)' };

const BGM_TRACKS = {
    // 通常時: 明るい行進
    field: {
        bpm: 140,
        melody: [
            'E5', 'G5', 'C6', 'G5', 'A5', 'G5', 'E5', '.',
            'F5', 'A5', 'D6', 'A5', 'G5', '.', '.', '.',
            'E5', 'G5', 'C6', 'G5', 'A5', 'C6', 'E6', 'D6',
            'C6', 'G5', 'E5', 'D5', 'C5', '.', '.', '.'
        ],
        bass: [
            'C3', '.', 'G3', '.', 'C3', '.', 'G3', '.',
            'F3', '.', 'C4', '.', 'G3', '.', 'D4', '.',
            'C3', '.', 'G3', '.', 'F3', '.', 'A3', '.',
            'G3', '.', 'G3', '.', 'C3', '.', 'G2', '.'
        ]
    },
    // SE城前・城突入チャレンジ: 不穏
    castle: {
        bpm: 120,
        melody: [
            'A4', '.', 'C5', '.', 'E5', '.', 'D#5', '.',
            'E5', '.', '.', '.', 'B4', '.', '.', '.',
            'A4', '.', 'C5', '.', 'F5', '.', 'E5', '.',
            'D5', '.', 'C5', '.', 'B4', '.', '.', '.'
        ],
        bass: [
            'A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'A2', 'A2',
            'G#2', 'G#2', 'G#2', 'G#2', 'G#2', 'G#2', 'G#2', 'G#2',
            'F2', 'F2', 'F2', 'F2', 'F2', 'F2', 'F2', 'F2',
            'E2', 'E2', 'E2', 'E2', 'E2', 'E2', 'G#2', 'G#2'
        ]
    },
    // おにおにRASH / BATTLE: 速いバトル曲
    battle: {
        bpm: 170,
        melody: [
            'E5', '.', 'E5', 'G5', 'B5', '.', 'A5', 'G5',
            'F#5', '.', 'D5', '.', 'E5', '.', '.', '.',
            'E5', '.', 'E5', 'G5', 'B5', '.', 'D6', 'C6',
            'B5', 'A5', 'F#5', 'D5', 'E5', '.', '.', '.'
        ],
        bass: [
            'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3',
            'D2', 'D3', 'D2', 'D3', 'E2', 'E3', 'E2', 'E3',
            'C2', 'C3', 'C2', 'C3', 'C2', 'C3', 'C2', 'C3',
            'D2', 'D3', 'D2', 'D3', 'E2', 'E3', 'B2', 'B2'
        ]
    },
    // バトル敗北: ゆっくり下がっていく短調 (復活待ちのあいだも流れる)
    defeat: {
        bpm: 72,
        melody: [
            'E5', '.', 'D5', '.', 'C5', '.', 'B4', '.',
            'A4', '.', '.', '.', '.', '.', '.', '.',
            'C5', '.', 'B4', '.', 'A4', '.', 'G#4', '.',
            'A4', '.', '.', '.', '.', '.', '.', '.'
        ],
        bass: [
            'A2', '.', '.', '.', 'E2', '.', '.', '.',
            'F2', '.', '.', '.', 'D2', '.', '.', '.',
            'A2', '.', '.', '.', 'E2', '.', '.', '.',
            'A2', '.', '.', '.', '.', '.', '.', '.'
        ]
    },
    // ダンシングステージ: ディスコ (オクターブで跳ねるベース)
    dance: {
        bpm: 128,
        melody: [
            'A5', '.', 'A5', 'C6', '.', 'A5', 'G5', '.',
            'E5', '.', 'G5', '.', 'A5', '.', '.', '.',
            'A5', '.', 'A5', 'C6', '.', 'D6', 'E6', '.',
            'D6', 'C6', 'A5', 'G5', 'A5', '.', '.', '.'
        ],
        bass: [
            'A2', 'A3', 'A2', 'A3', 'A2', 'A3', 'A2', 'A3',
            'F2', 'F3', 'F2', 'F3', 'G2', 'G3', 'G2', 'G3',
            'A2', 'A3', 'A2', 'A3', 'A2', 'A3', 'A2', 'A3',
            'F2', 'F3', 'G2', 'G3', 'A2', 'A3', 'E2', 'E3'
        ]
    },
    // SUPERおにおにRASH: 勝利のファンファーレ風
    super: {
        bpm: 160,
        melody: [
            'C5', 'E5', 'G5', 'C6', '.', 'G5', 'C6', '.',
            'D6', '.', 'C6', 'B5', 'C6', '.', '.', '.',
            'A5', 'C6', 'F6', '.', 'E6', '.', 'D6', 'C6',
            'B5', 'G5', 'A5', 'B5', 'C6', '.', '.', '.'
        ],
        bass: [
            'C3', 'G3', 'C3', 'G3', 'C3', 'G3', 'C3', 'G3',
            'G2', 'D3', 'G2', 'D3', 'C3', 'G3', 'C3', 'G3',
            'F2', 'C3', 'F2', 'C3', 'C3', 'G3', 'C3', 'G3',
            'G2', 'D3', 'G2', 'D3', 'C3', 'G3', 'C3', '.'
        ]
    }
};

const Bgm = (() => {
    const LOOKAHEAD = 0.6;    // 何秒先まで音を予約するか (リールや 液晶の 描画が 重い ときも 途切れない ように 長め)
    const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

    let ctx = null;
    let master = null;
    let trackName = null;
    let step = 0;
    let nextTime = 0;
    let timer = null;
    let volume = 0.5;
    let enabled = true;
    let paused = false;
    let hidden = false;       // タブが 裏に 回っている
    let scheduled = [];       // 予約した 音 { osc, gain, time } (曲を 切り替えたら 止める)
    const files = {};         // 音声ファイルの 曲 { name, audio, failed }。キーは '<new|old>:<曲の 名前>'
    let style = 'new';        // 'new' = 今の 曲 (Suno)、'old' = 前の 曲 (チップチューン)
    const srcOf = def => (style === 'old' ? def.old : def.src);
    // 2026-11-14 (ユーザー指摘: 効果音が 聞こえない・BGM が 大きい): Suno の 曲は 音圧が 高いので 全体を 下げ、
    //   効果音が 鳴る あいだは さらに 下げる (duck)。曲の 切り替えは フェードアウト、盛り上がる ところでは 止めて サビから (climax)
    const FILE_LEVEL = 0.55;
    const FADE_OUT_MS = 800;     // 曲が 変わる ときの フェードアウト
    const FADE_IN_MS = 180;      // 鳴りはじめ (プツッと ならない ように)
    const STOP_MS = 120;         // 一時停止・盛り上がる ところで 止める ときは すばやく
    const duck = { level: 1, min: 1, until: 0, timer: null };
    let climaxOn = false;        // 盛り上がる 演出の あいだ 曲を 止める
    // 盛り上がる ところの あと、止めて いた 曲を サビから 再開する (曲の 名前。false = しない)
    // 2026-11-14 (ユーザー指定: RASH や 特化ゾーンなどの 曲は 入った ときに いちばん 最初から): サビから に するのは
    //   演出の 前から 鳴って いた 同じ 曲が 再開する ときだけ。新しく 切り替わった 曲は いつも 頭から
    let chorusNext = false;
    let lastFade = 0;
    const chorusOf = def => (style === 'old' ? def.oldChorus : def.chorus);
    const gainOf = def => (style === 'old' ? def.oldGain ?? def.gain : def.gain);

    // 音声ファイルの 曲を 用意する (はじめて 使う ときに 読み込む)
    function fileOf(name) {
        const def = BGM_FILES[name];
        if (!def || !srcOf(def)) return null;   // 前の 曲を 選んで いて、前は チップチューン だった 曲
        const key = style + ':' + name;
        if (!files[key]) {
            const audio = new Audio();
            audio.loop = true;
            audio.preload = 'auto';
            const f = { name, audio, failed: false, level: 0 };
            audio.addEventListener('error', () => {
                f.failed = true;   // ファイルが ない → チップチューンに 切り替える
                if (trackName === name && ctx) nextTime = ctx.currentTime + 0.05;
            });
            audio.src = srcOf(def);
            files[key] = f;
        }
        return files[key];
    }
    // いま 鳴らす チップチューンの 曲の 名前 (音声ファイルの 曲が 鳴って いる ときは null)
    let fallbackName = null;   // play() で 指定した ファイルが ない ときの 曲 (指定が なければ BGM_FILES の fallback)
    function chipName() {
        const def = BGM_FILES[trackName];
        if (!def) return trackName;
        const f = fileOf(trackName);
        return !f || f.failed ? (fallbackName || def.fallback) : null;
    }
    // 音声ファイルの 曲を 鳴らす・止める (音量・一時停止・タブの 裏も ここで 合わせる)。
    // 30 ミリ秒ごとに 呼ばれ、音量を 少しずつ 変えて フェードする (f.level 0〜1)
    function syncFile() {
        const nowMs = performance.now();
        const dt = Math.min(100, lastFade ? nowMs - lastFade : 30);
        lastFade = nowMs;
        const duckTarget = nowMs < duck.until ? duck.min : 1;
        duck.level += (duckTarget - duck.level) * Math.min(1, dt / (duckTarget < duck.level ? 50 : 450));
        const current = fileOf(trackName);
        for (const f of Object.values(files)) {
            const active = f === current && !f.failed;
            const audible = active && ctx && enabled && !paused && !hidden && !climaxOn;
            if (hidden) {   // 裏に 回ったら すぐ 止める
                if (!f.audio.paused) f.audio.pause();
                continue;
            }
            if (audible) {
                if (f.audio.paused && !f.starting) {
                    if (chorusNext) {   // 盛り上がる ところの あと: 同じ 曲なら サビから
                        const same = chorusNext === f.name;
                        chorusNext = false;
                        if (same) {
                            const c = chorusOf(BGM_FILES[f.name]);
                            if (c != null) {
                                try { f.audio.currentTime = c; } catch (e) { /* まだ 読み込み中 */ }
                            }
                            f.level = 0;
                        }
                    }
                    f.starting = true;
                    f.audio.play().catch(() => { /* まだ 操作の 前 */ }).finally(() => { f.starting = false; });
                }
                f.level = Math.min(1, f.level + dt / FADE_IN_MS);
            } else if (f.level > 0) {
                f.level = Math.max(0, f.level - dt / (active ? STOP_MS : FADE_OUT_MS));
            }
            if (!audible && f.level <= 0 && !f.audio.paused) {
                f.audio.pause();
                if (!active) {   // ほかの 曲に 変わった → 次は 頭から
                    try { f.audio.currentTime = 0; } catch (e) { /* まだ 読み込み中 */ }
                }
            }
            f.audio.volume = Math.max(0, Math.min(1, volume * gainOf(BGM_FILES[f.name]) * FILE_LEVEL * f.level * duck.level));
        }
    }

    function frequency(note) {
        const match = /^([A-G]#?)(\d)$/.exec(note);
        const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function applyVolume() {
        const duckNow = performance.now() < duck.until ? duck.min : 1;
        if (master) master.gain.setTargetAtTime(enabled && !paused && !hidden && !climaxOn ? volume * 0.12 * duckNow : 0, ctx.currentTime, 0.03);
        syncFile();
    }

    // 音声の準備 (ユーザー操作のあとで呼ぶ)
    function init(audioContext) {
        if (ctx) return;
        ctx = audioContext;
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        applyVolume();
        timer = setInterval(schedule, 25);
        setInterval(syncFile, 30);   // フェード・効果音の あいだの 音量
        document.addEventListener('visibilitychange', () => {
            if (hidden === document.hidden) return;
            hidden = document.hidden;
            if (hidden) cancelScheduled();
            else resumeAt();
            applyVolume();
        });
    }

    // 予約ずみで まだ 鳴り終わって いない 音を 止める
    function cancelScheduled() {
        if (!ctx) return;
        const now = ctx.currentTime;
        for (const n of scheduled) {
            try {
                if (n.time > now) n.osc.stop();   // まだ 鳴って いない 音
                else {                            // 鳴って いる 音は すぐに 消す
                    n.gain.gain.cancelScheduledValues(now);
                    n.gain.gain.setTargetAtTime(0.0001, now, 0.01);
                    n.osc.stop(now + 0.05);
                }
            } catch (e) { /* もう 止まって いる */ }
        }
        scheduled = [];
    }

    function note(freq, type, time, duration, level) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(level, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(time);
        osc.stop(time + duration + 0.02);
        scheduled.push({ osc, gain, time, end: time + duration + 0.02 });
    }

    function schedule() {
        if (!ctx || !trackName || !enabled || paused || hidden || climaxOn) return;
        scheduled = scheduled.filter(n => n.end > ctx.currentTime);   // 鳴り終わった 音は 忘れる
        const chip = chipName();
        if (!chip) return;   // 音声ファイルの 曲 (syncFile が 鳴らす)
        const track = BGM_TRACKS[chip];
        const stepDur = 60 / track.bpm / 2;
        if (chorusNext) {   // 盛り上がる ところの あと: 同じ 曲なら チップチューンは 曲の 後半から
            if (chorusNext === trackName) step = Math.floor(track.melody.length / 2);
            chorusNext = false;
        }
        // 描画が 重くて 予約が 間に合わなかった ときは、遅れた ぶんの 拍を とばして 拍子を 保つ
        // (前は 時刻だけ 今に 合わせて 拍は そのまま だったので、リズムが ずれて 飛んだように 聞こえた。2026-11-13)
        if (nextTime < ctx.currentTime + 0.02) {
            const missed = Math.ceil((ctx.currentTime + 0.05 - nextTime) / stepDur);
            nextTime += missed * stepDur;
            step += missed;
        }
        while (nextTime < ctx.currentTime + LOOKAHEAD) {
            const m = track.melody[step % track.melody.length];
            const b = track.bass[step % track.bass.length];
            if (m !== '.') note(frequency(m), 'square', nextTime, stepDur * 0.9, 0.35);
            if (b !== '.') note(frequency(b), 'triangle', nextTime, stepDur * 0.95, 0.8);
            nextTime += stepDur;
            step++;
        }
    }

    // 曲を切り替える (同じ曲なら何もしない)
    function play(name, fallback = null) {
        if (trackName === name && fallbackName === fallback) return;
        fallbackName = fallback;
        cancelScheduled();   // 前の 曲の 予約を 止める (重ならない ように)
        // 前の 曲 (音声ファイル) は すぐ 止めずに syncFile が フェードアウトする (2026-11-14 ユーザー指摘: ぶつ切り)
        const changed = trackName !== name;
        trackName = name;
        step = 0;
        // 新しく 入った 曲は いちばん 最初から (前に 鳴らして フェードアウト中・途中で 止めた 曲でも 頭に 戻す)
        chorusNext = false;
        const next = fileOf(name);
        if (changed && next && !next.failed) {
            if (!next.audio.paused) next.audio.pause();
            next.level = 0;
            try { next.audio.currentTime = 0; } catch (e) { /* まだ 読み込み中 */ }
        }
        if (ctx) nextTime = ctx.currentTime + 0.1;
        syncFile();
    }

    // 曲の ファイルを 先に 読み込んで おく (あるか ないかを 早めに 知る ため)
    // 2026-11-14 修正 (ユーザー指摘: RASH の 曲が 頭から 流れ直す): load() は 鳴って いる 曲も 頭に 戻すので、
    //   1 つの ファイルに つき 1 回 だけ、まだ 読み込みを 始めて いない ときだけ 呼ぶ
    function preload(names) {
        names.forEach(name => {
            const f = fileOf(name);
            if (!f || f.failed || f.preloaded) return;
            f.preloaded = true;
            if (f.audio.readyState === 0 && f.audio.paused) f.audio.load();
        });
    }
    // 曲の ファイルが 使えるか: false = ない・読めない、true = 読める、null = まだ わからない
    function fileState(name) {
        const def = BGM_FILES[name];
        if (def && !srcOf(def)) return false;   // 前の 曲を 選んで いる ときは チップチューン
        const f = files[style + ':' + name];
        if (!f) return null;
        if (f.failed) return false;
        return f.audio.readyState > 0 ? true : null;
    }

    // いまの 拍: { beat: 曲の 頭からの 拍 (小数), bpm, name: 鳴って いる 曲, file: 音声ファイルか }。鳴って いない ときは null
    // 音声ファイルは 再生位置から、チップチューンは 予約した 音の 位置から 計る (どちらも 実際の 音と ずれない)
    function beat() {
        if (!ctx || !trackName || !enabled || paused || hidden) return null;
        const def = BGM_FILES[trackName];
        const chip = chipName();
        if (!chip) {
            const f = fileOf(trackName);
            if (!f || f.audio.paused || !(f.audio.currentTime > 0)) return null;
            const old = style === 'old';
            const bpm = (old ? def.oldBpm : def.bpm) || 120;
            const offset = (old ? def.oldOffset : def.offset) || 0;
            return { beat: (f.audio.currentTime - offset) * bpm / 60, bpm, name: trackName, file: true };
        }
        const track = BGM_TRACKS[chip];
        if (!track || !nextTime) return null;
        const stepDur = 60 / track.bpm / 2;
        const pos = step - (nextTime - ctx.currentTime) / stepDur;   // 8分音符 いくつ目
        return { beat: pos / 2, bpm: track.bpm, name: trackName, file: false };
    }
    // 鳴って いる 曲の 名前 (曲名の 表示用): { key: 切り替わりの 目印, title }
    function nowPlaying() {
        if (!ctx || !trackName || !enabled) return null;
        const def = BGM_FILES[trackName];
        const chip = chipName();
        if (!chip && def) {
            const title = style === 'old' ? def.oldTitle : def.title;
            return title ? { key: style + ':' + trackName, title } : null;
        }
        const title = CHIP_TITLES[chip];
        return title ? { key: 'chip:' + chip, title } : null;
    }

    // 前の 曲 ('old') か 今の 曲 ('new') か。鳴って いる 曲も その 場で 切り替える
    function setStyle(next) {
        next = next === 'old' ? 'old' : 'new';
        if (next === style) return;
        cancelScheduled();
        const prev = fileOf(trackName);
        if (prev) {
            prev.audio.pause();
            try { prev.audio.currentTime = 0; } catch (e) { /* まだ 読み込み中 */ }
        }
        style = next;
        step = 0;
        if (trackName) fileOf(trackName);
        resumeAt();
        syncFile();
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        applyVolume();
    }

    // 止めて いた 曲を 鳴らし直す。予約は 止めた ときに 消して いるので、少し 先から 予約し直す
    function resumeAt() {
        if (ctx) nextTime = ctx.currentTime + 0.1;
    }

    function setEnabled(on) {
        if (on === enabled) return applyVolume();
        enabled = on;
        if (!on) cancelScheduled();
        else resumeAt();
        applyVolume();
    }

    // 効果音の あいだ BGM を 下げる (ms ミリ秒、min まで)。js/audio.js が 大きな 効果音で 呼ぶ
    //   2026-11-14 (ユーザー指定: 音楽が 大きく なったり 小さく なったり するので 常に 一定に): 下げない。
    //   BGM は 全体を 下げた (FILE_LEVEL) ままの 一定の 大きさで 鳴らす。呼ぶ 側は そのままで よい
    const DUCK_ENABLED = false;
    function duckFor(ms, min = 0.35) {
        if (!DUCK_ENABLED) return;
        const now = performance.now();
        duck.min = now < duck.until ? Math.min(duck.min, min) : min;
        duck.until = Math.max(duck.until, now + ms);
        applyVolume();
        clearTimeout(duck.timer);
        duck.timer = setTimeout(applyVolume, duck.until - now + 20);   // チップチューンの 音量を 戻す
    }
    // 盛り上がる ところ (当たり・復活 など。2026-11-14 ユーザー指定): 曲を すっと 止めて 告知音を 目立たせ、
    // 演出の あと (endClimax)、同じ 曲が 続く ときは サビから (新しく 切り替わった 曲は 頭から)
    function climax() {
        climaxOn = true;
        // サビから 再開するのは、いま 鳴って いる 曲だけ (このあと 別の 曲に 切り替われば その曲は 頭から)
        const cur = fileOf(trackName);
        chorusNext = trackName && (chipName() || (cur && !cur.audio.paused && cur.audio.currentTime > 0.5)) ? trackName : false;
        cancelScheduled();
        applyVolume();
    }
    function endClimax() {
        if (!climaxOn) return;
        climaxOn = false;
        resumeAt();
        applyVolume();
    }

    // 一時停止 (ロングフリーズ中は無音にする)
    //   2026-11-13 修正: 止めて いない ときに「再開」を 呼ばれても 何も しない。前は 毎ゲームの 終わりに
    //   予約の 時刻を 今に 戻して いたため、予約ずみの 音と 同じ 音が ずれて 二重に 鳴り (変な音)、リズムも 飛んで いた
    function setPaused(on) {
        if (on === paused) return;
        if (on) cancelScheduled();   // 止める ときは 予約ずみの 音も 止める
        paused = on;
        if (!on) resumeAt();
        applyVolume();
    }

    return {
        init, play, setVolume, setEnabled, setPaused, preload, fileState, setStyle, beat, nowPlaying, duck: duckFor, climax, endClimax,
        get climaxing() { return climaxOn; },
        get style() { return style; },
        get track() { return trackName; },
        get volume() { return volume; },
        get enabled() { return enabled; }
    };
})();
