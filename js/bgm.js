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
// =====================================================================

// 音声ファイルの 曲: src は index.html から 見た 場所。gain は 音量の 倍率 (チップチューンと 大きさを そろえる)
const BGM_FILES = {
    // 上乗せ特化ゾーン「おかランプ」(オカピポ): Suno で 作った ラップ入りの 曲 (sound/README.md)
    okapipo: { src: 'sound/okapipo.mp3', fallback: 'dance', gain: 0.85 }
};

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
    const LOOKAHEAD = 0.4;    // 何秒先まで音を予約するか
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
    const files = {};         // 音声ファイルの 曲 { audio, failed }

    // 音声ファイルの 曲を 用意する (はじめて 使う ときに 読み込む)
    function fileOf(name) {
        const def = BGM_FILES[name];
        if (!def) return null;
        if (!files[name]) {
            const audio = new Audio();
            audio.loop = true;
            audio.preload = 'auto';
            const f = { audio, failed: false };
            audio.addEventListener('error', () => {
                f.failed = true;   // ファイルが ない → チップチューンに 切り替える
                if (trackName === name && ctx) nextTime = ctx.currentTime + 0.05;
            });
            audio.src = def.src;
            files[name] = f;
        }
        return files[name];
    }
    // いま 鳴らす チップチューンの 曲の 名前 (音声ファイルの 曲が 鳴って いる ときは null)
    function chipName() {
        const def = BGM_FILES[trackName];
        if (!def) return trackName;
        const f = fileOf(trackName);
        return f && f.failed ? def.fallback : null;
    }
    // 音声ファイルの 曲を 鳴らす・止める (音量・一時停止・タブの 裏も ここで 合わせる)
    function syncFile() {
        for (const [name, f] of Object.entries(files)) {
            const active = name === trackName && !f.failed;
            const audible = active && ctx && enabled && !paused && !hidden;
            if (audible) {
                f.audio.volume = Math.max(0, Math.min(1, volume * BGM_FILES[name].gain));
                if (f.audio.paused && !f.starting) {
                    f.starting = true;
                    f.audio.play().catch(() => { /* まだ 操作の 前 */ }).finally(() => { f.starting = false; });
                }
            } else if (!f.audio.paused) {
                f.audio.pause();
            }
        }
    }

    function frequency(note) {
        const match = /^([A-G]#?)(\d)$/.exec(note);
        const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function applyVolume() {
        if (master) master.gain.setTargetAtTime(enabled && !paused && !hidden ? volume * 0.12 : 0, ctx.currentTime, 0.02);
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
        document.addEventListener('visibilitychange', () => {
            hidden = document.hidden;
            if (hidden) cancelScheduled();
            else if (ctx) nextTime = ctx.currentTime + 0.1;
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
        if (!ctx || !trackName || !enabled || paused || hidden) return;
        scheduled = scheduled.filter(n => n.end > ctx.currentTime);   // 鳴り終わった 音は 忘れる
        const chip = chipName();
        if (!chip) return syncFile();   // 音声ファイルの 曲
        const track = BGM_TRACKS[chip];
        const stepDur = 60 / track.bpm / 2;
        if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
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
    function play(name) {
        if (trackName === name) return;
        cancelScheduled();   // 前の 曲の 予約を 止める (重ならない ように)
        const prev = files[trackName];
        if (prev) {
            prev.audio.pause();
            try { prev.audio.currentTime = 0; } catch (e) { /* まだ 読み込み中 */ }
        }
        trackName = name;
        step = 0;
        fileOf(name);
        if (ctx) nextTime = ctx.currentTime + 0.1;
        syncFile();
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        applyVolume();
    }

    function setEnabled(on) {
        enabled = on;
        if (!on) cancelScheduled();
        if (on && ctx) nextTime = ctx.currentTime + 0.1;
        applyVolume();
    }

    // 一時停止 (ロングフリーズ中は無音にする)
    function setPaused(on) {
        if (on && !paused) cancelScheduled();   // 止める ときは 予約ずみの 音も 止める
        paused = on;
        if (!on && ctx) nextTime = ctx.currentTime + 0.1;
        applyVolume();
    }

    return {
        init, play, setVolume, setEnabled, setPaused,
        get volume() { return volume; },
        get enabled() { return enabled; }
    };
})();
