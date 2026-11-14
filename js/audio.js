// =====================================================================
// 効果音 (Web Audio で合成。slot の原型から流用)
// =====================================================================

const Sound = (() => {
    let ctx = null;
    let muted = false;   // 違和感演出の 無音 (2026-10-23 A4)

    function init() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            loadHeso();
            loadSeFiles();
        }
    }

    // ユーザーが 用意した 効果音の ファイル (2026-11-14 ユーザー指定)。sound/se/ に 置く (.gitignore で GitHub には 上げない)。
    //   sound_01.wav = 当たった ときの 一発告知音 / sound_01.mp3・sound_02.mp3 = 当たり確定音 (この 2 つも 一発告知音に 使う)
    //   ファイルが ない (GitHub Pages など) ときは 今までの 音。<audio> で 鳴らすので index.html を 直接 開いても 鳴る
    //   vol: 音量 (曲の 大きさを 測って そろえた)・max: 長い 音は ここで フェードアウトして 止める (秒)
    const SE_FILES = {
        hit: { src: 'sound/se/sound_01.wav', vol: 0.55, max: 3.5 },
        kakutei1: { src: 'sound/se/sound_01.mp3', vol: 0.75, max: 3.6 },
        kakutei2: { src: 'sound/se/sound_02.mp3', vol: 0.6, max: 3.2 }
    };
    const seFiles = {};   // name → { audio, ok }
    function loadSeFiles() {
        if (typeof Audio === 'undefined') return;
        for (const [name, def] of Object.entries(SE_FILES)) {
            const audio = new Audio();
            audio.preload = 'auto';
            const f = { audio, ok: false };
            audio.addEventListener('canplaythrough', () => { f.ok = true; }, { once: true });
            audio.addEventListener('error', () => { f.ok = false; });
            audio.src = def.src;
            seFiles[name] = f;
        }
    }
    const seReady = names => names.filter(n => seFiles[n] && seFiles[n].ok);
    function playSe(name) {
        const def = SE_FILES[name];
        const a = seFiles[name].audio.cloneNode();
        a.volume = def.vol;
        a.play().catch(() => { /* まだ 操作の 前 */ });
        const fadeAt = (def.max - 0.4) * 1000;
        setTimeout(() => {   // 最後の 0.4 秒で フェードアウトして 止める
            const t0 = performance.now();
            const iv = setInterval(() => {
                const k = (performance.now() - t0) / 400;
                if (k >= 1 || a.paused) { clearInterval(iv); a.pause(); return; }
                a.volume = def.vol * (1 - k);
            }, 30);
        }, fadeAt);
        return true;
    }

    // パチンコの 先バレ音 (ユーザーの 録音。js/sound-heso.js) を 読み込む。一発告知で 鳴らす (2026-11-14 ユーザー指定)
    //   鳴らす ところ (秒) と 大きさは パチンコと 同じ (koori-pachinko の config.show.voice: 1.3〜3.5 秒・4 倍)
    const HESO = { start: 1.3, end: 3.5, gain: 4 };
    let hesoBuffer = null;
    function loadHeso() {
        if (typeof HESO_SOUND === 'undefined') return;
        try {
            const bin = atob(HESO_SOUND.split(',')[1]);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            ctx.decodeAudioData(bytes.buffer).then(buf => { hesoBuffer = buf; }, () => { hesoBuffer = null; });
        } catch (e) { hesoBuffer = null; }
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
    let lastJuteion = -1e9;

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

    // バチッ という 電気の 火花 (高い ところだけ 残した 短い ノイズ)。hp: これより 高い 音だけ
    function spark(at, dur, vol, hp = 2500) {
        const b = busOf();
        const t0 = ctx.currentTime + at;
        const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.25) * (1 - i / length);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = hp;
        const gain = ctx.createGain();
        gain.gain.value = vol;
        src.connect(f);
        f.connect(gain);
        gain.connect(b.comp);
        src.start(t0);
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

    const HIT_SOUNDS = {
        // 大当たりの 重低音 → 2026-11-14 作り直し (ユーザー指摘:「ブウううん」が かっこ悪い → 機械が 負荷に 耐えられず 落ちた ような 音):
        //   1) 過負荷: 高い うなりが ぐんぐん 上がり、ゆれ (不安定さ) が 増えていく (0〜0.7 秒)
        //   2) 落ちる: うなりが 一気に 下へ 落ちていき (キュウウゥゥン…)、ショートの バチバチ が はじける (0.7〜1.8 秒)
        //   3) 電源が 切れる: ブツッ と 低い 衝撃 + 一瞬の ノイズで ぷつりと 消える (1.8 秒)
        juteion() {
            const b = busOf();
            const off = 1.8;
            // うなり (のこぎり波 2 本を 少し ずらして 厚く)。上がって → 落ちる
            [0, 7].forEach((det, i) => {
                const t0 = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.detune.value = det;
                osc.frequency.setValueAtTime(220, t0);
                osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.7);
                osc.frequency.setValueAtTime(880, t0 + 0.72);
                osc.frequency.exponentialRampToValueAtTime(38, t0 + off);
                // ゆれ: だんだん 速く 深く (機械が がたつく)
                const lfo = ctx.createOscillator(), depth = ctx.createGain();
                lfo.frequency.setValueAtTime(6, t0);
                lfo.frequency.linearRampToValueAtTime(28, t0 + off);
                depth.gain.setValueAtTime(4, t0);
                depth.gain.linearRampToValueAtTime(60, t0 + 0.7);
                depth.gain.linearRampToValueAtTime(8, t0 + off);
                lfo.connect(depth);
                depth.connect(osc.frequency);
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.Q.value = 6;
                lp.frequency.setValueAtTime(1200, t0);
                lp.frequency.exponentialRampToValueAtTime(5200, t0 + 0.7);
                lp.frequency.exponentialRampToValueAtTime(140, t0 + off);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t0);
                g.gain.exponentialRampToValueAtTime(i ? 0.05 : 0.07, t0 + 0.6);
                g.gain.setValueAtTime(i ? 0.05 : 0.07, t0 + off - 0.02);
                g.gain.linearRampToValueAtTime(0, t0 + off);   // ぷつりと 切れる
                osc.connect(lp);
                lp.connect(g);
                g.connect(b.comp);
                osc.start(t0); lfo.start(t0);
                osc.stop(t0 + off + 0.05); lfo.stop(t0 + off + 0.05);
            });
            // 下で 鳴り続ける 電源の ハム (落ちる ときに いっしょに 下がって 切れる)
            voice({ type: 'square', from: 60, to: 30, at: 0, dur: off, glide: off, vol: 0.05, attack: 0.05, hold: off - 0.1, lp: 300 });
            // ショートの バチバチ (落ちて いく あいだ だんだん 多く)
            for (let i = 0; i < 16; i++) {
                const at = 0.6 + Math.pow(Math.random(), 0.7) * (off - 0.65);
                spark(at, 0.012 + Math.random() * 0.03, 0.25 + Math.random() * 0.35);
            }
            // 電源が 切れる: ブツッ (低い 衝撃) + 一瞬の 白い ノイズ
            thump(off, 0.45, 1, 160);
            spark(off, 0.06, 0.8, 600);
            voice({ type: 'sine', from: 70, to: 32, at: off, dur: 0.5, glide: 0.4, vol: 0.45, attack: 0.003 });
        },
        // 一発告知 (2026-11-14 ユーザー指定: 当たり・復活 など 盛り上がる ところで 曲を 止めて 鳴らす)
        //   2026-11-14 作り直し (ユーザー指摘: 前より 劣化・情けない → パチンコの 先バレ音を 参考に):
        //   パチンコの 先バレ音 (ユーザーの 録音) を 鳴らし、高い 音に だけ やまびこを かけて 広がりを 出す。腹に 響く ドスッ も
        //   2026-11-14 (ユーザー指定): sound/se/ の 音が あれば それ (sound_01.wav を 半分、sound_01.mp3・sound_02.mp3 を 4 分の 1 ずつ)
        kokuchi() {
            thump(0, 0.35, 0.8, 220);
            const se = seReady(['hit', 'kakutei1', 'kakutei2']);
            if (se.length) {
                const name = se.includes('hit') && (se.length === 1 || Math.random() < 0.5) ? 'hit'
                    : se.filter(n => n !== 'hit')[Math.floor(Math.random() * se.filter(n => n !== 'hit').length)];
                playSe(name);
                return;
            }
            // 公開版 (sound/se/ が ない とき) は パチンコの 先バレ音の 録音 (2026-11-15 ユーザー指定で 元に 戻した)
            if (!hesoBuffer) {   // まだ 読み込めて いない ときは 前の 虹の 音
                sequence([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093], 110, 'triangle', 0.5, 0.09);
                return;
            }
            const b = busOf();
            const src = ctx.createBufferSource();
            const gain = ctx.createGain();
            src.buffer = hesoBuffer;
            gain.gain.value = HESO.gain;
            src.connect(gain);
            gain.connect(b.comp);
            gain.connect(b.echo);
            src.start(ctx.currentTime, HESO.start, HESO.end - HESO.start);
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

    // 大きな 効果音の あいだは BGM を 下げて 効果音を 聞こえやすく (2026-11-14 ユーザー指摘: 効果音が 聞こえない)
    const duck = (ms, min) => { if (typeof Bgm !== 'undefined' && Bgm.duck) Bgm.duck(ms, min); };
    const ducked = (fn, ms, min = 0.35) => (...args) => { duck(ms, min); return fn(...args); };

    const api = {
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
        // 2026-11-14 (ユーザー指摘: 当たり音が 前より 劣化・情けない): 先バレ・確定・突入は 11-13 に 作り直す 前の 音に 戻した。
        //   重低音 (ブウううん) と プチュンは そのまま
        sakibare: () => { sweep(900, 1900, 'square', 0.16, 0.06); sweep(900, 1900, 'square', 0.16, 0.06, 170); },
        // 2026-11-14 (ユーザー指定): sound/se/ の sound_01.mp3・sound_02.mp3 が あれば その どちらか (ない ときは 前の 音)
        kakutei: () => {
            const se = seReady(['kakutei1', 'kakutei2']);
            if (se.length) { if (canPlay()) playSe(se[Math.floor(Math.random() * se.length)]); return; }
            [0, 180, 360].forEach(d => sweep(1200, 2600, 'triangle', 0.2, 0.08, d));
        },
        // 重低音 (機械が 落ちる 音) は 続けて 呼ばれても 2.5 秒は 重ねない (一発告知と 演出の 両方から 呼ばれる ため)
        juteion: () => {
            if (!canPlay()) return;
            const now = performance.now();
            if (now - lastJuteion < 2500) return;
            lastJuteion = now;
            HIT_SOUNDS.juteion();
        },
        // 突入: 前と 同じ ファンファーレを 2 回 (はじめと 0.5 秒 あと)
        bonusIn: () => { if (!canPlay()) return; api.fanfare(); setTimeout(() => api.fanfare(), 500); },
        puchun: () => canPlay() && HIT_SOUNDS.puchun(),
        // 一発告知の 重低音 (2026-11-14 ユーザー指定: 初めの うにょうにょ 音を なくす): 機械が 落ちる 音の うなり (ゆれる 音) は 鳴らさず、
        //   腹に 響く 衝撃と 低い 落ちる 音だけ
        kokuchiBoom: () => {
            if (!canPlay()) return;
            thump(0, 0.6, 1, 160);
            voice({ type: 'sine', from: 90, to: 32, at: 0, dur: 0.9, glide: 0.7, vol: 0.5, attack: 0.003 });
            voice({ type: 'square', from: 110, to: 40, at: 0, dur: 0.5, glide: 0.4, vol: 0.06, attack: 0.003, lp: 400 });
        },
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
    // BGM を 下げる 効果音 (ミリ秒は 鳴って いる 長さの めやす)
    const DUCK = { sakibare: 900, kakutei: 3600, juteion: 2300, bonusIn: 1900, kokuchi: 2200, rainbow: 1100, fanfare: 800, win: 600,
        chance: 600, defeat: 800, miss: 600, special: 1200, bigHit: 500, talk: 300, pushReady: 400, leverCall: 600, zencho: 1400,
        premiumCrack: 600, premiumSmash: 1200, premiumRoar: 1600, gyaku: 1000 };
    for (const [name, ms] of Object.entries(DUCK)) if (api[name]) api[name] = ducked(api[name], ms);
    api.kokuchi = ducked(() => canPlay() && HIT_SOUNDS.kokuchi(), 3600, 0.2);
    return api;
})();
