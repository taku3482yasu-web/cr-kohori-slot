// =====================================================================
// チャンス目の演出 (スイカ崩れ・BAR崩れ・7崩れごとの画面)
// ---------------------------------------------------------------------
// start(name, onShake) で始め (長さのミリ秒を返す。演出がなければ 0)、液晶の毎フレームで draw(time) を呼ぶ。
// =====================================================================

const ChanceFx = (() => {
    const { text } = LcdKit;
    let ctx, W, H, config;
    let chanceFx = null;   // { name, fx, start, duration, particles, onShake }

    // onShake: BAR崩れで板が落ちたときに画面を揺らす (液晶から渡す)
    function start(name, onShake) {
        ({ config } = LcdKit.canvas());
        const fx = config.effects.chanceEffects[name];
        if (!fx) return 0;
        const now = performance.now();
        const particles = [];
        for (let i = 0; i < 40; i++) {
            particles.push({
                angle: Math.random() * Math.PI * 2,
                speed: 40 + Math.random() * 90,
                color: name === 'スイカ崩れ' ? (i % 3 ? '#ff3a4a' : '#3ab03a') : name === '7崩れ' ? (i % 2 ? '#ff3a3a' : '#ffd23a') : (i % 2 ? '#ffffff' : '#222222'),
                size: 2 + (i % 3)
            });
        }
        chanceFx = { name, fx, start: now, duration: fx.duration, particles, onShake };
        return fx.duration;
    }

    function draw(time) {
        if (!chanceFx) return;
        ({ ctx, W, H, config } = LcdKit.canvas());
        const t = (time - chanceFx.start) / chanceFx.duration;
        if (t >= 1) {
            chanceFx = null;
            return;
        }
        const { name, fx, particles } = chanceFx;
        const cx = W / 2, cy = 66;
        const elapsed = (time - chanceFx.start) / 1000;

        if (name === 'スイカ崩れ') {
            // 大きなスイカが跳ねて、果汁が飛び散る
            ctx.fillStyle = 'rgba(0,40,0,0.45)';
            ctx.fillRect(0, 0, W, H);
            const bounce = Math.abs(Math.sin(elapsed * 9)) * 12 * (1 - t);
            ctx.drawImage(Symbols.canvas('melon'), cx - 36, cy - 44 - bounce, 72, 72);
            particles.forEach(p => {
                const d = p.speed * elapsed;
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(cx + Math.cos(p.angle) * d), Math.round(cy - 8 + Math.sin(p.angle) * d + 60 * elapsed * elapsed), p.size, p.size);
            });
        } else if (name === 'BAR崩れ') {
            // 白黒の点滅と、上から落ちてくる BAR の板
            ctx.fillStyle = Math.floor(time / 90) % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, W, H);
            [0, 1, 2].forEach(i => {
                const delay = i * 0.12;
                const k = Math.min(1, Math.max(0, (elapsed - delay) / 0.25));
                const y = -40 + (cy - 30 + i * 6 + 40) * k;
                ctx.drawImage(Symbols.canvas('bar'), cx - 84 + i * 56, y, 56, 56);
            });
            if (elapsed > 0.2 && elapsed < 0.6) chanceFx.onShake();
        } else {
            // 7崩れ: 赤い光の筋と脈打つ大きな 7
            ctx.fillStyle = 'rgba(40,0,0,0.6)';
            ctx.fillRect(0, 0, W, H);
            ctx.save();
            ctx.translate(cx, cy - 6);
            ctx.rotate(elapsed * 1.5);
            for (let i = 0; i < 10; i++) {
                ctx.rotate(Math.PI / 5);
                ctx.fillStyle = i % 2 ? 'rgba(255,60,40,0.35)' : 'rgba(255,210,60,0.3)';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(170, -16);
                ctx.lineTo(170, 16);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            const pulse = 1 + 0.12 * Math.sin(elapsed * 14);
            const size = Math.round(76 * pulse);
            ctx.drawImage(Symbols.canvas('seven'), cx - size / 2, cy - 6 - size / 2, size, size);
            particles.forEach(p => {
                const d = p.speed * elapsed * 1.3;
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(cx + Math.cos(p.angle) * d), Math.round(cy - 6 + Math.sin(p.angle) * d), p.size, p.size);
            });
        }

        // 文字
        const appear = Math.min(1, t / 0.15);
        const size = Math.round(20 + 8 * (1 - appear));
        text(fx.text, cx, H - 46, { color: fx.color, size, align: 'center', outline: '#000' });
        text(fx.sub, cx, H - 22, { color: name === '7崩れ' ? '#ffd23a' : '#ffffff', size: 12, align: 'center' });
    }

    return { start, draw };
})();
