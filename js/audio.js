// =====================================================================
// 効果音 (Web Audio で合成。slot の原型から流用)
// =====================================================================

const Sound = (() => {
    let ctx = null;

    function init() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function tone(freq, type, duration, volume = 0.1) {
        if (!ctx) return;
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
        if (!ctx) return;
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
        if (!ctx) return;
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

    // 必殺技の効果音 (エフェクトの種類ごと)
    const SPECIAL_SOUNDS = {
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
        miss: () => sequence([220, 160], 200, 'sawtooth', 0.4, 0.06)
    };
})();
