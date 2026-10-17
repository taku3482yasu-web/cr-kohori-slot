// =====================================================================
// 必殺技のエフェクト (RASH の場面に重ねて描く)
// ---------------------------------------------------------------------
// start(kind) でエフェクトを始め (長さのミリ秒を返す)、液晶の毎フレームで draw(time, pos, groundY) を呼ぶ。
// pos: { kx, ky: こおりくんの中心, ex, ey: 敵の中心あたり }
// =====================================================================

const SpecialFx = (() => {
    const { text, line, burst, ease, fadeOut } = LcdKit;
    let ctx, W, H;

    // 必殺技ごとのエフェクトの種類 (名前は config.js の specials / enemies[].special など)
    const SPECIAL_FX = {
        koori: 'iceBurst',          // 大腸炎アタック
        kooriKill: 'sevenFlash',    // 7つの内定フラッシュ
        kooriNaitei: 'requiem',     // ばりきつよめのレクイエム
        yasu: 'punch',              // やすパンチ
        tamu: 'kick',               // たむキック
        dake: 'chop',               // だけチョップ
        okagappa: 'beam',           // おかピポっと光線
        hibikimakuri: 'soundwave',  // 大音響4DX
        shibata: 'driver',          // シバタードライバー
        sasaki: 'slash',            // ASAスラッシュ
        onioni: 'club',             // 鬼鬼の金棒
        goldDog: 'goldbite',        // ゴールドかみまっくす
        naitei: 'judge'             // 不採用の裁き
    };
    const FX_DURATION = {
        iceBurst: 600, sevenFlash: 1000, requiem: 1300, punch: 500, kick: 500, chop: 500,
        beam: 800, soundwave: 1000, driver: 500, slash: 750, club: 900, goldbite: 900, judge: 1100
    };

    let active = [];   // { kind, start, duration }

    function start(kind) {
        const duration = FX_DURATION[kind] || 600;
        active.push({ kind, start: performance.now(), duration });
        return duration;
    }

    function draw(time, pos, groundY) {
        ({ ctx, W, H } = LcdKit.canvas());
        active = active.filter(f => time - f.start < f.duration);
        for (const f of active) {
            const t = Math.min(1, Math.max(0, (time - f.start) / f.duration));
            const fn = FX_DRAW[f.kind];
            if (!fn) continue;
            ctx.save();
            fn(t, time, pos, groundY);
            ctx.restore();
        }
    }

    const FX_DRAW = {
        // おかピポっと光線: 口から緑の光線がのびて、こおりくんに当たる
        beam(t, time, { kx, ky, ex }, groundY) {
            const sx = ex - 22, sy = groundY - 62;
            const grow = ease(t / 0.35);
            const x1 = sx + (kx - sx) * grow, y1 = sy + (ky - sy) * grow;
            const w = (5 + 2 * Math.sin(time / 25)) * fadeOut(t);
            line(sx, sy, x1, y1, 'rgba(60,255,120,0.55)', w + 8);
            line(sx, sy, x1, y1, '#f0fff0', w);
            ctx.fillStyle = 'rgba(160,255,190,0.9)';
            ctx.beginPath();
            ctx.arc(sx, sy, 4 + 2 * Math.sin(time / 30), 0, Math.PI * 2);
            ctx.fill();
            if (grow >= 1) {
                ctx.globalAlpha = fadeOut(t);
                burst(kx, ky, 14 + 4 * Math.sin(time / 20), 10, '#b0ffc8', 2);
            }
        },
        // 大音響4DX: 音の輪が何重にも広がり、音符が飛ぶ
        soundwave(t, time, { ex }, groundY) {
            const cx = ex - 10, cy = groundY - 50;
            for (let i = 0; i < 5; i++) {
                const p = (t * 1.8 + i * 0.22) % 1;
                ctx.globalAlpha = (1 - p) * fadeOut(t, 0.8);
                ctx.strokeStyle = `hsl(${(280 + i * 40 + time / 5) % 360}, 100%, 65%)`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(cx, cy, 10 + p * 150, Math.PI * 0.72, Math.PI * 1.28);
                ctx.stroke();
            }
            ctx.globalAlpha = fadeOut(t, 0.8);
            for (let i = 0; i < 4; i++) {
                const p = (t * 1.4 + i * 0.25) % 1;
                text(i % 2 ? '♪' : '♫', cx - p * 150, cy - 20 + Math.sin(p * 8 + i) * 14,
                    { color: `hsl(${i * 80}, 100%, 70%)`, size: 14, align: 'center' });
            }
            if (t < 0.6) text('4DX', cx - 40 - t * 30, cy - 46, { color: '#ffe45a', size: 16, align: 'center' });
        },
        // シバタードライバー: 叩きつけた地面から衝撃波と破片
        driver(t, time, { kx }, groundY) {
            const x = kx + 30;
            ctx.globalAlpha = fadeOut(t, 0.5);
            ctx.strokeStyle = '#ffd27a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(x, groundY - 2, 10 + t * 70, 3 + t * 8, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#8a6a4a';
            for (let i = 0; i < 10; i++) {
                const a = Math.PI + (i / 9) * Math.PI;
                const d = t * 50;
                ctx.fillRect(x + Math.cos(a) * d, groundY - 4 + Math.sin(a) * d * 0.8 + t * t * 40, 3, 3);
            }
        },
        // ASAスラッシュ: 青白い斬撃が3本、斜めに走る
        slash(t, time, { kx, ky }) {
            for (let i = 0; i < 3; i++) {
                const p = (t - i * 0.15) / 0.35;
                if (p <= 0) continue;
                const g = ease(p);
                const x0 = kx - 34 + i * 10, y0 = ky - 36 + i * 4;
                const x1 = x0 + 64 * g, y1 = y0 + 58 * g;
                ctx.globalAlpha = fadeOut(t, 0.6);
                line(x0, y0, x1, y1, 'rgba(90,170,255,0.6)', 7);
                line(x0, y0, x1, y1, '#ffffff', 2);
            }
            if (t > 0.3) {
                ctx.globalAlpha = fadeOut(t, 0.6);
                text('ASA', kx, ky - 50, { color: '#9fd0ff', size: 14, align: 'center' });
            }
        },
        // 鬼鬼の金棒: 巨大な金棒が上から振り下ろされる
        club(t, time, { kx, ky }, groundY) {
            const swing = ease(t / 0.4);
            const angle = -1.9 + swing * 2.05;
            const px = kx + 46, py = 6;
            ctx.globalAlpha = fadeOut(t, 0.8);
            ctx.translate(px, py);
            ctx.rotate(angle);
            // 柄 → 太い棒 → 金の鋲
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(-4, -4, 8, 22);
            ctx.fillStyle = '#2a2a34';
            ctx.fillRect(-9, 18, 18, 86);
            ctx.fillStyle = '#4a4a5a';
            ctx.fillRect(-9, 18, 5, 86);
            ctx.fillStyle = '#ffd23a';
            for (let r = 0; r < 6; r++) {
                for (let c = 0; c < 2; c++) ctx.fillRect(-6 + c * 8 + (r % 2) * 2, 24 + r * 13, 3, 3);
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (t > 0.4) {
                const p = (t - 0.4) / 0.6;
                ctx.globalAlpha = 1 - p;
                ctx.fillStyle = '#ffe0a0';
                ctx.beginPath();
                ctx.ellipse(kx, groundY - 2, 20 + p * 50, 4 + p * 6, 0, 0, Math.PI * 2);
                ctx.fill();
                burst(kx, ky, 22 + p * 20, 12, '#ffd23a', 2);
            }
        },
        // ゴールドかみまっくす: 金色の牙が上下から噛みつき、金貨が飛び散る
        goldbite(t, time, { kx, ky }) {
            const close = ease(t / 0.45);
            const top = ky - 44 + close * 34, bottom = ky + 34 - close * 34;
            const w = 64;
            ctx.globalAlpha = fadeOut(t, 0.75);
            ctx.fillStyle = '#ffd23a';
            ctx.strokeStyle = '#8a6a00';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const x = kx - w / 2 + i * (w / 6);
                ctx.beginPath();
                ctx.moveTo(x, top - 10);
                ctx.lineTo(x + w / 6, top - 10);
                ctx.lineTo(x + w / 12, top + 6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x, bottom + 10);
                ctx.lineTo(x + w / 6, bottom + 10);
                ctx.lineTo(x + w / 12, bottom - 6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            ctx.fillRect(kx - w / 2, top - 16, w, 6);
            ctx.fillRect(kx - w / 2, bottom + 10, w, 6);
            if (t > 0.45) {
                const p = (t - 0.45) / 0.55;
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2 + 0.3;
                    const d = p * 60;
                    const x = kx + Math.cos(a) * d, y = ky + Math.sin(a) * d * 0.7 + p * p * 30;
                    ctx.fillStyle = i % 2 ? '#ffe45a' : '#ffb000';
                    ctx.fillRect(x - 2, y - 2, 4, 4);
                }
            }
        },
        // 不採用の裁き: 赤い「不採用」のハンコが画面に叩きつけられる
        judge(t) {
            const s = t < 0.27 ? 3 - 2 * ease(t / 0.27) : 1;
            const alpha = fadeOut(t, 0.85);
            ctx.globalAlpha = alpha * 0.45;
            ctx.fillStyle = '#200008';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = alpha * (t < 0.27 ? t / 0.27 : 1);
            ctx.translate(W / 2, H / 2);
            ctx.rotate(-0.18);
            ctx.scale(s, s);
            ctx.strokeStyle = '#ff1a1a';
            ctx.lineWidth = 4;
            ctx.strokeRect(-62, -24, 124, 48);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-56, -18, 112, 36);
            text('不採用', 0, -14, { color: '#ff1a1a', size: 26, align: 'center', outline: null });
        },
        // 大腸炎アタック: 敵に当たった瞬間、氷のかけらが飛び散る
        iceBurst(t, time, { ex, ey }) {
            ctx.globalAlpha = fadeOut(t, 0.5);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ex, ey, 8 + t * 40, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const d = 10 + ease(t) * 46;
                const x = ex + Math.cos(a) * d, y = ey + Math.sin(a) * d;
                ctx.fillStyle = i % 2 ? '#9fe6ff' : '#e8fbff';
                ctx.beginPath();
                ctx.moveTo(x, y - 4);
                ctx.lineTo(x + 3, y);
                ctx.lineTo(x, y + 4);
                ctx.lineTo(x - 3, y);
                ctx.closePath();
                ctx.fill();
            }
        },
        // 7つの内定フラッシュ: 虹色の光の柱が7本、順に敵を撃ち抜く
        sevenFlash(t, time, { ex, ey }) {
            for (let i = 0; i < 7; i++) {
                const p = t * 9 - i;
                if (p <= 0 || p > 2) continue;
                const a = p < 1 ? 1 : 2 - p;
                const x = ex + (i - 3) * 7;
                ctx.globalAlpha = a;
                ctx.fillStyle = `hsl(${i * 51}, 100%, 60%)`;
                ctx.fillRect(x - 5, 0, 10, H);
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillRect(x - 1, 0, 2, H);
            }
            if (t > 0.75) {
                const p = (t - 0.75) / 0.25;
                ctx.globalAlpha = 1 - p;
                text('内定', ex, ey - 30 - p * 10, { color: '#ffffff', size: 18, align: 'center', outline: '#b8860b' });
            }
        },
        // ばりきつよめのレクイエム: 敵の上に金色の十字の光がそびえ、音符が舞い上がる
        requiem(t, time, { ex, ey }) {
            const grow = ease(t / 0.3);
            ctx.globalAlpha = fadeOut(t, 0.6);
            ctx.fillStyle = 'rgba(255,215,0,0.35)';
            ctx.beginPath();
            ctx.arc(ex, ey - 6, 46 * grow, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff6c0';
            const h = 110 * grow;
            ctx.fillRect(Math.round(ex - 4), Math.round(ey - 6 - h / 2), 8, Math.round(h));
            ctx.fillRect(Math.round(ex - 30 * grow), Math.round(ey - 30), Math.round(60 * grow), 7);
            for (let i = 0; i < 8; i++) {
                const nx = ex + Math.sin(i * 1.7 + time / 200) * 44;
                const ny = ey + 24 - ((t * 90 + i * 14) % 90);
                text(i % 2 ? '♪' : '♫', nx, ny, { color: i % 3 ? '#ffd700' : '#ffffff', size: 12, align: 'center' });
            }
            ctx.globalAlpha = 1;
        },
        // やすパンチ: 大きな拳が飛んでいって、当たると星がはじける
        punch(t, time, { ex, ey }) {
            const p = ease(t / 0.4);
            const x = ex - 60 + p * 50, y = ey + 4;
            ctx.globalAlpha = fadeOut(t, 0.7);
            ctx.fillStyle = '#f0c090';
            ctx.strokeStyle = '#5a3a1a';
            ctx.lineWidth = 1;
            ctx.fillRect(x - 9, y - 8, 18, 16);
            ctx.strokeRect(x - 9, y - 8, 18, 16);
            for (let i = 1; i < 4; i++) line(x + 9, y - 8 + i * 4, x + 3, y - 8 + i * 4, '#5a3a1a', 1);
            ctx.fillStyle = '#3a6ad0';
            ctx.fillRect(x - 17, y - 6, 8, 12);
            if (t > 0.4) burst(ex - 6, ey + 4, 10 + (t - 0.4) * 40, 8, '#ffe45a', 2);
        },
        // たむキック: 弧を描く蹴りの軌跡
        kick(t, time, { ex, ey }) {
            const sweepTo = Math.PI * 0.9 + ease(t / 0.45) * Math.PI * 1.1;
            ctx.globalAlpha = fadeOut(t, 0.6);
            ctx.strokeStyle = 'rgba(255,150,40,0.85)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(ex - 14, ey, 26, Math.PI * 0.9, sweepTo);
            ctx.stroke();
            ctx.strokeStyle = '#fff4d0';
            ctx.lineWidth = 2;
            ctx.stroke();
            if (t > 0.45) burst(ex, ey - 6, 10 + (t - 0.45) * 40, 6, '#ff9a3c', 2);
        },
        // だけチョップ: 上から一直線に振り下ろす手刀の光
        chop(t, time, { ex }, groundY) {
            const g = ease(t / 0.3);
            const y1 = groundY * g;
            ctx.globalAlpha = fadeOut(t, 0.55);
            line(ex, 0, ex, y1, 'rgba(255,140,40,0.6)', 10);
            line(ex, 0, ex, y1, '#ffffff', 3);
            if (t > 0.3) {
                const p = (t - 0.3) / 0.7;
                line(ex - 10 - p * 40, groundY - 44, ex + 10 + p * 40, groundY - 44, '#ffe45a', 2);
            }
        }
    };

    return { KINDS: SPECIAL_FX, start, draw };
})();
