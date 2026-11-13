// =====================================================================
// 効果音 (Web Audio で合成。slot の原型から流用)
// =====================================================================

const Sound = (() => {
    let ctx = null;
    let muted = false;   // 違和感演出の 無音 (2026-10-23 A4)

    function init() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // タブを 切りかえて 画面が かくれたら 音を 止め、もどったら 再開する (2026-11-04 ユーザー指定)
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
    });

    function tone(freq, type, duration, volume = 0.1) {
        if (!ctx || muted || document.hidden) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    // ザーッというノイズ (ロングフリーズ)
    function noise(duration, volume = 0.12) {
        if (!ctx || muted || document.hidden) return;
        const length = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buffer;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + duration);
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
    }

    function sequence(notes, interval, type, duration, volume) {
        notes.forEach((freq, i) => setTimeout(() => tone(freq, type, duration, volume), i * interval));
    }

    // 音程が from → to に動く音 (ビーム・振り下ろしなど)
    function sweep(from, to, type, duration, volume = 0.1, delay = 0) {
        if (!ctx || muted || document.hidden) return;
        setTimeout(() => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(from, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        }, delay);
    }

    // ===== 当たりの 音 (2026-11-13 ユーザー指定: 実機の スロットの 音の 感じで) =====
    // 実機の 音を 写したのではなく、よくある 音の 型 (レバー ON の「キュイン」・確定の「キュインキュイン」・
    // 大当たりの 腹に 響く 重低音・突入の ファンファーレ) を ここで 合成した オリジナル。
    // 音が 割れない ように コンプレッサーに 通し、キュイン系は やまびこ (ディレイ) を かける
    let bus = null;    // { comp, echo }
    function busOf() {
        if (bus) return bus;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 8;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        comp.connect(ctx.destination);
        // やまびこ: 0.13 秒 遅れて 少しずつ 小さく くり返す
        const echo = ctx.createDelay(1);
        echo.delayTime.value = 0.13;
        const fb = ctx.createGain();
        fb.gain.value = 0.38;
        const wet = ctx.createGain();
        wet.gain.value = 0.5;
        const hp = ctx.createBiquadFilter();   // やまびこは 高い 音だけ (低音が にごらない ように)
        hp.type = 'highpass';
        hp.frequency.value = 600;
        echo.connect(fb);
        fb.connect(hp);
        hp.connect(echo);
        echo.connect(wet);
        wet.connect(comp);
        bus = { comp, echo };
        return bus;
    }
    const canPlay = () => ctx && !muted && !document.hidden;

    // 1 つの 音を 鳴らす (時刻は いまから の 秒)。o: { type, from, to, at, dur, vol, attack, detune, vib, echo, lp, shape }
    function voice(o) {
        const b = busOf();
        const t0 = ctx.currentTime + (o.at || 0);
        const dur = o.dur;
        const osc = ctx.createOscillator();
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(o.from, t0);
        if (o.to && o.to !== o.from) {
            if (o.linear) osc.frequency.linearRampToValueAtTime(o.to, t0 + (o.glide || dur));
            else osc.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide || dur));
        }
        if (o.detune) osc.detune.value = o.detune;
        // ビブラート (キュインの 尾の ゆれ)
        if (o.vib) {
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = o.vib.rate;
            depth.gain.value = o.vib.depth;
            lfo.connect(depth);
            depth.connect(osc.frequency);
            lfo.start(t0);
            lfo.stop(t0 + dur + 0.05);
        }
        const gain = ctx.createGain();
        const vol = o.vol || 0.08;
        const attack = o.attack || 0.004;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
        if (o.hold) gain.gain.setValueAtTime(vol, t0 + attack + o.hold);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        let node = osc;
        if (o.shape) {   // ひずませる (重低音を 小さい スピーカーでも 聞こえる ように)
            const ws = ctx.createWaveShaper();
            const n = 1024, curve = new Float32Array(n);
            for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * o.shape); }
            ws.curve = curve;
            node.connect(ws);
            node = ws;
        }
        if (o.lp) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(o.lp.from || o.lp, t0);
            if (o.lp.to) lp.frequency.exponentialRampToValueAtTime(o.lp.to, t0 + dur);
            lp.Q.value = o.lp.q || 0.7;
            node.connect(lp);
            node = lp;
        }
        node.connect(gain);
        gain.connect(b.comp);
        if (o.echo) gain.connect(b.echo);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }

    // ドスッ という 打撃の ノイズ (低い ところだけ 残す)
    function thump(at, dur, vol, cutoff) {
        const b = busOf();
        const t0 = ctx.currentTime + at;
        const length = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = cutoff;
        const gain = ctx.createGain();
        gain.gain.value = vol;
        src.connect(lp);
        lp.connect(gain);
        gain.connect(b.comp);
        src.start(t0);
    }

    // 1 回の「キュイン」(下から 上へ 一気に 駆け上がって、上で ふるえる)
    function kyuin(at, from, to, vol, echo = true) {
        voice({ type: 'square', from, to, at, dur: 0.24, glide: 0.07, vol, vib: { rate: 38, depth: to * 0.025 }, echo, lp: 7000 });
        voice({ type: 'triangle', from: from * 2, to: to * 2, at, dur: 0.2, glide: 0.07, vol: vol * 0.6, detune: 8, echo });
    }

    const HIT_SOUNDS = {
        // 先バレ: レバー ON の「キュイン！」(AT 機の レバー ON 先告知の 感じ)。1 発 + 少し 高い 2 発目
        sakibare() {
            kyuin(0, 700, 2300, 0.07);
            kyuin(0.15, 900, 2800, 0.06);
        },
        // 当たり確定: 「キュインキュインキュイン！」(上がりながら 4 回) → 上で キラキラが 残る
        kakutei() {
            [0, 0.13, 0.26, 0.39].forEach((t, i) => kyuin(t, 800 + i * 120, 2600 + i * 260, 0.07));
            [0, 0.07, 0.14, 0.21, 0.28, 0.35].forEach((t, i) =>
                voice({ type: 'triangle', from: [2637, 3136, 3951, 3136, 3951, 4699][i], at: 0.55 + t, dur: 0.35, vol: 0.035, echo: true }));
        },
        // 大当たりの 重低音:「ドゥゥゥン…」(腹に 響く 低い うなり + ドスッ。フリーズ・突入の 瞬間)
        juteion() {
            thump(0, 0.5, 0.9, 180);
            voice({ type: 'sine', from: 62, to: 30, at: 0, dur: 2.2, glide: 1.8, vol: 0.5, attack: 0.01, hold: 0.25 });
            voice({ type: 'sawtooth', from: 124, to: 58, at: 0, dur: 1.6, glide: 1.4, vol: 0.12, shape: 3, lp: { from: 900, to: 120, q: 4 } });
            voice({ type: 'square', from: 41, to: 31, at: 0.02, dur: 1.9, glide: 1.6, vol: 0.06, lp: 160 });
        },
        // 当たり音 (突入の ファンファーレ):「パパパパーン！」(上がる 和音を 刻んで、最後に のばす)
        bonusIn() {
            const chords = [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77]];
            chords.forEach((ch, i) => ch.forEach(f =>
                voice({ type: 'sawtooth', from: f, at: i * 0.12, dur: 0.11, vol: 0.035, lp: 3200 })));
            [698.46, 880, 1046.5, 1396.9].forEach(f =>
                voice({ type: 'sawtooth', from: f, at: 0.4, dur: 1.3, vol: 0.04, attack: 0.02, hold: 0.6, lp: { from: 900, to: 5000 }, vib: { rate: 5.5, depth: 4 } }));
            voice({ type: 'square', from: 87.31, at: 0.4, dur: 1.2, vol: 0.08, lp: 400 });
        },
        // 消灯 (プチュン): 液晶・リールが ふっと 消える ときの 音
        puchun() {
            voice({ type: 'square', from: 1800, to: 120, at: 0, dur: 0.09, glide: 0.08, vol: 0.08 });
            thump(0, 0.08, 0.3, 900);
        }
    };

    // 必殺技の効果音 (エフェクトの種類ごと)
    const SPECIAL_SOUNDS = {
        requiem: () => { sequence([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 110, 'triangle', 0.5, 0.09); sweep(2000, 300, 'sine', 0.9, 0.05, 600); },
        beam: () => { sweep(1400, 300, 'sawtooth', 0.7, 0.07); sweep(700, 150, 'square', 0.7, 0.05); },
        soundwave: () => [0, 150, 300, 450].forEach(d => { sweep(90, 45, 'sawtooth', 0.25, 0.14, d); sweep(1200, 900, 'square', 0.12, 0.04, d); }),
        driver: () => { sweep(200, 900, 'square', 0.3, 0.07); setTimeout(() => { noise(0.4, 0.2); sweep(120, 40, 'sawtooth', 0.4, 0.16); }, 420); },
        slash: () => [0, 120, 240].forEach(d => { sweep(2400, 500, 'sawtooth', 0.12, 0.06, d); setTimeout(() => noise(0.08, 0.1), d); }),
        club: () => { sweep(500, 60, 'sawtooth', 0.4, 0.12); setTimeout(() => { noise(0.5, 0.25); tone(50, 'square', 0.4, 0.15); }, 360); },
        goldbite: () => { sequence([1568, 2093, 1568, 2093, 2637], 50, 'square', 0.08, 0.05); setTimeout(() => { tone(90, 'square', 0.15, 0.18); noise(0.2, 0.15); }, 400); },
        judge: () => { tone(70, 'square', 0.3, 0.18); setTimeout(() => { tone(55, 'sawtooth', 0.5, 0.2); noise(0.3, 0.15); }, 280); },
        iceBurst: () => { sweep(800, 2400, 'triangle', 0.25, 0.08); setTimeout(() => sequence([2637, 3136, 2349], 40, 'triangle', 0.1, 0.06), 200); },
        sevenFlash: () => sequence([523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5], 90, 'square', 0.15, 0.07),
        punch: () => { sweep(300, 120, 'square', 0.15, 0.12); noise(0.1, 0.12); },
        kick: () => { sweep(400, 1400, 'triangle', 0.15, 0.08); setTimeout(() => tone(150, 'square', 0.12, 0.14), 150); },
        chop: () => { sweep(3000, 600, 'sawtooth', 0.1, 0.07); setTimeout(() => tone(110, 'square', 0.15, 0.15), 100); }
    };

    return {
        init,
        setMuted: on => { muted = on; },
        context: () => ctx,
        noise,
        special: (kind) => SPECIAL_SOUNDS[kind] && SPECIAL_SOUNDS[kind](),
        rainbow: () => sequence([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093], 110, 'triangle', 0.5, 0.09),
        spin: () => tone(200, 'sawtooth', 0.1, 0.05),
        talk: () => sequence([988, 1319], 70, 'square', 0.06, 0.05),   // ふるカワが出てくる
        stop: (i) => tone(400 - i * 100, 'square', 0.1, 0.1),
        win: () => sequence([523.25, 659.25, 783.99], 100, 'sine', 0.3, 0.1),
        chance: () => sequence([660, 880, 660, 880], 80, 'square', 0.1, 0.08),
        fanfare: () => sequence([440, 540, 640, 740, 840], 100, 'triangle', 0.2, 0.1),
        hit: () => tone(180, 'square', 0.08, 0.12),
        bigHit: () => sequence([120, 90, 60], 60, 'sawtooth', 0.15, 0.15),
        defeat: () => sequence([523.25, 659.25, 783.99, 1046.5], 120, 'square', 0.25, 0.08),
        miss: () => sequence([220, 160], 200, 'sawtooth', 0.4, 0.06),
        // 期待度の 演出 (2026-10-23 A3): 先バレ音・確定音・PUSH
        zencho: () => { sweep(70, 45, 'sawtooth', 0.8, 0.09); setTimeout(() => sweep(90, 50, 'sawtooth', 0.7, 0.07), 500); },   // 前兆の はじまり (ゴゴゴ)
        // 2026-11-13: 先バレ・確定・重低音・突入の 音を 作り直した (HIT_SOUNDS)
        sakibare: () => canPlay() && HIT_SOUNDS.sakibare(),
        kakutei: () => canPlay() && HIT_SOUNDS.kakutei(),
        juteion: () => canPlay() && HIT_SOUNDS.juteion(),
        bonusIn: () => canPlay() && HIT_SOUNDS.bonusIn(),
        puchun: () => canPlay() && HIT_SOUNDS.puchun(),
        // プレミア: 液晶が ひび割れて おにおに (2026-10-24): ピキッ / バリィン / 咆哮
        premiumCrack: () => { tone(2400, 'square', 0.05, 0.08); setTimeout(() => tone(1800, 'square', 0.05, 0.07), 70); sweep(3000, 900, 'square', 0.08, 0.08, 160); },
        premiumSmash: () => { noise(0.5, 0.15); sweep(80, 40, 'sawtooth', 0.5, 0.14); if (canPlay()) HIT_SOUNDS.juteion(); },
        premiumRoar: () => { sweep(70, 45, 'sawtooth', 1.4, 0.16); sweep(105, 60, 'sawtooth', 1.3, 0.12, 50); sweep(140, 70, 'square', 1.1, 0.08, 100); },
        // レバーの 演出 (2026-10-24): レバーを叩け！・レバブル・遅れ・逆回転
        leverCall: () => { tone(90, 'square', 0.15, 0.14); setTimeout(() => sequence([1175, 1568, 2093], 60, 'square', 0.1, 0.07), 80); },
        leverBuru: () => [0, 90, 180, 270].forEach(d => sweep(70, 50, 'sawtooth', 0.08, 0.08, d)),
        okure: () => tone(60, 'sine', 0.3, 0.12),
        gyaku: () => { sweep(1800, 200, 'sawtooth', 0.9, 0.07); sweep(900, 100, 'square', 0.9, 0.05, 120); },
        pushReady: tier => sequence(tier === 'rainbow' || tier === 'gold' ? [880, 1175, 1568] : [660, 880], 70, 'square', 0.08, 0.06),
        pushHit: tier => (tier === 'rainbow' ? sequence([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 70, 'triangle', 0.35, 0.09)
            : tier === 'gold' ? sequence([659.25, 830.61, 987.77, 1318.5], 70, 'triangle', 0.3, 0.09)
            : sweep(500, 1400, 'square', 0.18, 0.07))
    };
})();
