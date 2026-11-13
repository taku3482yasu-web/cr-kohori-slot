// =====================================================================
// おかランプ (オカピポ) の 一発告知: イケメン風の おかがっぱ (2026-11-13 ユーザー指定)
// ---------------------------------------------------------------------
// 上乗せ特化ゾーン「おかランプ」で、1 ゲームの 上乗せが config.tokka.ikemen.minAdd 枚 以上 (強い 上乗せ) に
// 決まった ときに 流す。当たりの 虹色の 背景 (バラ・キラキラ・集中線) に、流し目の おかがっぱの 顔の アップ。
// 「おかピポ…イェア。」→ 金の「+N枚!!」。上乗せが 決まった あとで 流すので、告知は かならず 当たる (結果は 変えない)。
//
// 絵は ドット絵だけ (characters.js の おかがっぱを 大きくして、目・まゆ・バラを 描き足す)。
//   2026-11-13 ユーザー指定: PNG での 差しかえは 使わない (読み込みの 仕組みを 消した)
// Lcd が start(add) で 始め、active() の あいだ draw(time) を 呼ぶ。描く 先は LcdKit.canvas()
// =====================================================================

const OkaIkemenView = (() => {
    let view = null;          // { add, start, ms }
    function start(add, config) {
        const cfg = config.tokka.ikemen;
        view = { add, start: performance.now(), ms: cfg.ms };
        return new Promise(resolve => setTimeout(() => { view = null; resolve(); }, cfg.ms));
    }

    function active() {
        return Boolean(view);
    }

    // 当たりの 背景 (2026-11-13 ユーザー指定: 虹色): 回る 虹の 光・まんなかの 白い 光・集中線・バラ・キラキラ
    function drawBackground(ctx, W, H, k, time) {
        const cx = W * 0.68, cy = H * 0.45;
        const turn = time / 1500;
        // 虹の 帯が 顔の まわりを 回る
        for (let i = 0; i < 24; i++) {
            const a0 = (i / 24) * Math.PI * 2 + turn, a1 = a0 + Math.PI * 2 / 24 + 0.01;
            ctx.fillStyle = `hsl(${(i * 15 + time / 6) % 360}, 95%, 60%)`;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, 320, a0, a1);
            ctx.closePath();
            ctx.fill();
        }
        // まんなかは 白く 光る
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, W * 0.6);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // 集中線 (ゆっくり 回る)
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 48; i++) {
            const a = i / 48 * Math.PI * 2 + time / 4000;
            const r0 = 40 + (i % 3) * 10;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * 260, cy + Math.sin(a) * 260);
            ctx.stroke();
        }
        ctx.restore();
        // バラ (上から ふわふわ 落ちる)
        for (let i = 0; i < 9; i++) {
            const x = (i * 37 + 11) % W;
            const y = ((time / 18 + i * 29) % (H + 20)) - 10;
            drawRose(ctx, x, y, 2 + (i % 2), i % 3 === 0 ? '#ff2a5a' : '#ff5a8a');
        }
        // キラキラ
        for (let i = 0; i < 14; i++) {
            const tw = (Math.sin(time / 140 + i * 1.7) + 1) / 2;
            if (tw < 0.4) continue;
            const x = (i * 53 + 7) % W, y = (i * 31 + 13) % H;
            const s = 1 + Math.round(tw * 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - s, y, s * 2 + 1, 1);
            ctx.fillRect(x, y - s, 1, s * 2 + 1);
        }
        // 入りの 暗転が あける
        if (k < 0.12) {
            ctx.fillStyle = `rgba(0,0,0,${1 - k / 0.12})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    function drawRose(ctx, x, y, s, color) {
        ctx.fillStyle = '#2f8a3a';
        ctx.fillRect(Math.round(x - s * 2), Math.round(y + s), s * 2, s);
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x - s), Math.round(y - s), s * 3, s * 3);
        ctx.fillStyle = '#b0103a';
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }

    // ドット絵の 顔の アップ。(x, bottom) は 絵の 足もと、s は 1 ドットの 大きさ。
    // characters.js の おかがっぱ (32x40) の 頭を 大きく 描き、流し目・きりっとした まゆ・まつげ・口の バラを 描き足す
    function drawPixelFace(ctx, x, bottom, s, time) {
        const px = (dx, dy, w, h, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(Math.round(x - 16 * s + dx * s), Math.round(bottom - 40 * s + dy * s), Math.ceil(w * s), Math.ceil(h * s));
        };
        Characters.drawEnemy(ctx, 'okagappa', x, bottom, { scale: s, frame: 0 });
        // 流し目: 白目の 上を まぶたで 半分 かくし、黒目を 左へ
        px(11, 10, 3, 1, '#2f6a2f');
        px(18, 10, 3, 1, '#2f6a2f');
        px(11, 11, 3, 2, '#ffffff');
        px(18, 11, 3, 2, '#ffffff');
        px(11, 11, 2, 2, '#111111');
        px(18, 11, 2, 2, '#111111');
        // 目の ハイライト (ときどき キラッ)
        const glint = Math.floor(time / 220) % 4 === 0;
        px(11, 11, 1, 1, glint ? '#ffffff' : '#c8f0ff');
        px(18, 11, 1, 1, glint ? '#ffffff' : '#c8f0ff');
        // きりっと した まゆ (外がわが 上がる)
        px(10, 9, 2, 1, '#1a3a1a');
        px(12, 8, 2, 1, '#1a3a1a');
        px(19, 8, 2, 1, '#1a3a1a');
        px(21, 9, 2, 1, '#1a3a1a');
        // まつげ
        px(14, 10, 1, 1, '#1a3a1a');
        px(21, 10, 1, 1, '#1a3a1a');
        // ほっぺの 赤み
        px(9, 13, 2, 1, '#ff8aa0');
        px(21, 13, 2, 1, '#ff8aa0');
        // くちばしに くわえた バラ
        px(18, 15, 5, 1, '#2f8a3a');
        px(22, 13, 3, 3, '#ff2a5a');
        px(23, 14, 1, 1, '#b0103a');
    }

    function draw(time) {
        if (!view) return;
        const { ctx, W, H } = LcdKit.canvas();
        const { text, textWidth } = LcdKit;
        const e = time - view.start;
        const k = Math.min(1, e / view.ms);
        drawBackground(ctx, W, H, k, time);

        // 顔が 右から すべりこむ (0.1〜0.3)
        const slideK = LcdKit.ease((k - 0.1) / 0.2);
        const slide = (1 - slideK) * 140;
        // 顔 (絵の 10 ドット目) を (W*0.7, H*0.45) に。足もとは 液晶の 下より 下 (肩から 上だけ 見える)
        const s = 5;
        const bob = Math.sin(time / 260) * 1.5;
        ctx.save();
        ctx.translate(W * 0.7 + slide, H * 0.45);
        ctx.rotate(-0.08);
        drawPixelFace(ctx, 0, 30 * s + bob, s, time);
        ctx.restore();

        // 名前と ひとこと (0.3〜)
        if (k > 0.3) {
            const a = Math.min(1, (k - 0.3) / 0.08);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = 'rgba(40,0,50,0.7)';
            ctx.fillRect(0, 16, 120, 18);
            text('おかがっぱ', 8, 18, { color: '#ffe0f4', size: 14, outline: '#5a0a5a' });
            ctx.restore();
        }
        if (k > 0.38) {
            const lines = ['「おかピポ…', '    イェア。」'];
            const shown = Math.floor((e - view.ms * 0.38) / 70);
            let left = shown;
            lines.forEach((ln, i) => {
                const part = ln.slice(0, Math.max(0, left));
                left -= ln.length;
                if (part) text(part, 10, 42 + i * 16, { color: '#ffffff', size: 13, outline: '#6a0a5a' });
            });
        }
        // 金の「+N枚!!」(0.58〜。大きく 出て から 落ちつく)
        if (k > 0.58) {
            const pk = Math.min(1, (k - 0.58) / 0.08);
            const size = Math.round(28 - 8 * LcdKit.ease(pk));
            const label = `+${view.add}枚!!`;
            const color = `hsl(${(time / 4) % 360}, 95%, 65%)`;
            const tx = 10, ty = 84;
            ctx.save();
            ctx.globalAlpha = Math.min(1, pk * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(tx - 4, ty - 2, textWidth(label, size) + 8, size + 6);
            text(label, tx, ty, { color: Math.floor(time / 120) % 2 ? '#ffe45a' : color, size, outline: '#5a3a00' });
            ctx.restore();
        }
        // 終わりは 白く 抜ける
        if (k > 0.92) {
            ctx.fillStyle = `rgba(255,255,255,${(k - 0.92) / 0.08})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    return { start, active, draw };
})();
