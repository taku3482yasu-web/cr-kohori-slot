// =====================================================================
// 曲に 合わせた 液晶の 演出 (2026-11-14 ユーザー指定: Suno の 曲に 合うように 演出・絵・エフェクト・当たり演出を 改良)
// ---------------------------------------------------------------------
// 1. 曲の リズムに 合わせる: Bgm.beat() (曲を 解析して 測った bpm と 再生位置) から いまの 拍を 出し、
//    光・ふち・キャラの はね・おかランプや ダンスの 踊りを 拍に そろえる (musicTime / pulse / bounce)
// 2. 当たり演出: 突入・撃破・SUPER・特化ゾーン などで、拍ごとに 広がる 光の 輪・回る 光の すじ・紙吹雪 (event)
// 3. 場面ごとの 絵と エフェクト: 流れて いる 曲 (場面) ごとに、曲の ふんいきに 合わせた 動く 飾り (drawAmbient)
//    通学路 = 桜の 花びら、遠賀川 = 風と トンボ、恵比寿町 = 提灯、SE城 = 紫の 霧と 稲光、RASH = 曲ごと ほか
// 4. 曲の 頭で 曲名: 曲が 切り替わると 左下に「♪ 曲名」(drawTelop)
// 液晶は 256×144 の ドット絵なので、粒は 1〜2 ドットの 四角で 描く。粒の 位置は 時刻から 計算する (状態を 持たない)
// =====================================================================

const BeatFx = (() => {
    const TELOP_MS = 3600;
    let telop = null;          // { title, start }
    let lastKey = null;
    let keySince = 0;
    let jackpot = null;        // { kind, start, beat0, hue }
    let lastBeat = null;       // 筐体を 拍で 光らせる ため
    let cabTimer = null;

    const info = () => (typeof Bgm !== 'undefined' && Bgm.beat ? Bgm.beat() : null);
    const track = () => (typeof Bgm !== 'undefined' && Bgm.track) || null;
    const frac = x => x - Math.floor(x);
    // 決まった 数から 0〜1 の 値 (粒の 位置を ばらけさせる)
    const rnd = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

    // 拍の 頭で 1、拍の あいだに 0 へ 減る。曲が 鳴って いない ときは fallbackMs (ミリ秒) の 拍で 同じように
    function pulse(time, power = 5, fallbackMs = 0) {
        const b = info();
        if (b) return Math.exp(-frac(b.beat) * power);
        return fallbackMs ? Math.exp(-frac(time / fallbackMs) * power) : 0;
    }
    // 小節の 頭 (4 拍ごと) で 1
    function barPulse(time, power = 4) {
        const b = info();
        return b ? Math.exp(-frac(b.beat / 4) * 4 * power) : 0;
    }
    // 拍で はねる 高さ (ドット)
    function bounce(time, px = 2) {
        return Math.round(pulse(time, 7) * px);
    }
    // 時刻を 曲の 拍に そろえた 時刻に する (beatMs ミリ秒で 1 拍 として 描く 踊りを、曲の 拍に 合わせる)
    function musicTime(time, beatMs) {
        const b = info();
        return b ? b.beat * beatMs : time;
    }

    // ----- 毎フレーム: 曲名の 切り替わり・筐体の 拍 -----
    function tick(time) {
        const now = typeof Bgm !== 'undefined' && Bgm.nowPlaying ? Bgm.nowPlaying() : null;
        const key = now ? now.key : null;
        if (key !== lastKey) {
            lastKey = key;
            keySince = time;
            if (telop && telop.key !== key) telop = null;
        } else if (key && (!telop || telop.key !== key) && time - keySince > 250 && time - keySince < 600) {
            // 少し 続いて から 出す (場面の 切り替えで 一瞬 だけ 鳴った 曲は 出さない)
            telop = { key, title: now.title, start: time };
        }
        // 筐体の ふちを 拍で 光らせる (RASH・SUPER・城突入チャレンジ・特化ゾーン)
        const b = info();
        if (b && typeof document !== 'undefined') {
            const n = Math.floor(b.beat);
            if (n !== lastBeat) {
                lastBeat = n;
                const mode = document.body.dataset.mode;
                if (mode === 'RASH' || mode === 'SUPER_RASH' || mode === 'CASTLE_CHALLENGE') {
                    const cls = n % 4 === 0 ? 'cab-bar' : 'cab-beat';
                    document.body.classList.add(cls);
                    clearTimeout(cabTimer);
                    cabTimer = setTimeout(() => document.body.classList.remove('cab-beat', 'cab-bar'), 110);
                }
            }
        }
    }

    // ----- 曲名の テロップ -----
    function drawTelop(ctx, W, H, time) {
        if (!telop) return;
        const t = time - telop.start;
        if (t > TELOP_MS) {
            telop = null;
            return;
        }
        const label = '♪ ' + telop.title;
        const w = LcdKit.textWidth(label, 8) + 10;
        const slide = t < 260 ? 1 - LcdKit.ease(t / 260) : t > TELOP_MS - 260 ? LcdKit.ease((t - TELOP_MS + 260) / 260) : 0;
        const x = Math.round(-w * slide);
        const y = H - 22;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x, y, w, 12);
        ctx.fillStyle = `hsl(${(time / 8) % 360}, 90%, 60%)`;
        ctx.fillRect(x, y + 11, Math.round(w * Math.min(1, t / 600)), 1);   // 下の 線が のびる
        ctx.fillRect(x + w - 2, y, 2, 12);
        LcdKit.text(label, x + 4, y + 2, { color: '#ffffff', size: 8, outline: null });
    }

    // ----- 場面ごとの 動く 飾り (流れて いる 曲で 決める) -----
    function px(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x), Math.round(y), w, h);
    }
    // 降る・舞う 粒: n 個を、速さ (vx, vy ドット/秒) で 流す。draw(x, y, i, k) で 1 個ずつ 描く
    function drift(ctx, W, H, time, n, vx, vy, draw) {
        for (let i = 0; i < n; i++) {
            const sp = 0.6 + rnd(i + 3) * 0.8;
            const x = ((rnd(i) * (W + 40) + time / 1000 * vx * sp) % (W + 40) + W + 40) % (W + 40) - 20;
            const y = ((rnd(i + 7) * (H + 40) + time / 1000 * vy * sp) % (H + 40) + H + 40) % (H + 40) - 20;
            draw(x, y, i, sp);
        }
    }
    // 画面の ふちの 光 (拍で 強く)
    function edgeGlow(ctx, W, H, color, k) {
        if (k <= 0.02) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k);
        for (let i = 0; i < 4; i++) {
            ctx.globalAlpha = Math.min(1, k) * (1 - i / 4) * 0.8;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(i + 0.5, i + 0.5, W - 1 - i * 2, H - 1 - i * 2);
        }
        ctx.restore();
    }
    // 外から まんなかへ 向かう 集中線 (拍の 頭で 出る)
    function speedLines(ctx, W, H, time, k, color, seed = 0) {
        if (k <= 0.05) return;
        const b = info();
        const n = b ? Math.floor(b.beat) : Math.floor(time / 400);
        ctx.save();
        ctx.globalAlpha = Math.min(1, k) * 0.7;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 18; i++) {
            const a = rnd(i + n * 19 + seed) * Math.PI * 2;
            const r0 = 70 + rnd(i * 3 + n) * 30;
            ctx.moveTo(W / 2 + Math.cos(a) * 200, H / 2 + Math.sin(a) * 200);
            ctx.lineTo(W / 2 + Math.cos(a) * r0 * 1.5, H / 2 + Math.sin(a) * r0);
        }
        ctx.stroke();
        ctx.restore();
    }

    const AMBIENT = {
        // 通学路: 朝の 光と 桜の 花びら
        tsugakuro(ctx, W, H, time, p) {
            drift(ctx, W, H, time, 14, -18, 14, (x, y, i) => {
                const sway = Math.sin(time / 500 + i) * 4;
                px(ctx, x + sway, y, 2, 1, i % 3 ? '#ffc0d8' : '#ffe4ee');
                if (i % 2) px(ctx, x + sway + 1, y + 1, 1, 1, '#ff98bc');
            });
            // 拍で きらっと 光る 朝日
            ctx.save();
            ctx.globalAlpha = 0.18 + p * 0.22;
            ctx.fillStyle = '#fff6c0';
            ctx.beginPath();
            ctx.arc(W - 22, 14, 10 + p * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },
        // 遠賀川: 川風の すじと トンボ
        ongagawa(ctx, W, H, time, p) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            drift(ctx, W, H * 0.7, time, 6, -60, 0, (x, y, i) => px(ctx, x, y, 8 + (i % 3) * 6, 1, '#ffffff'));
            ctx.restore();
            for (let i = 0; i < 2; i++) {
                const t = time / 1000 + i * 7;
                const x = ((t * 22 + i * 120) % (W + 40)) - 20;
                const y = 28 + i * 18 + Math.sin(t * 2.3) * 6 - Math.round(p * 2);
                px(ctx, x, y, 5, 1, '#d84a20');              // 赤とんぼの 体
                const wing = Math.floor(time / 60) % 2;
                px(ctx, x + 1, y - 1 - wing, 3, 1, '#e8f4ff');
                px(ctx, x + 1, y + 1 + wing, 3, 1, '#e8f4ff');
            }
        },
        // 恵比寿町: 上に 提灯が 並び、拍で 明るく ゆれる (ちんどん屋の ふんいき)
        ebisucho(ctx, W, H, time, p) {
            const b = info();
            const swing = b ? Math.sin(b.beat * Math.PI) : Math.sin(time / 300);
            ctx.strokeStyle = '#3a2410';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 3);
            ctx.quadraticCurveTo(W / 2, 11, W, 3);
            ctx.stroke();
            for (let i = 0; i < 6; i++) {
                const x = 66 + i * 32;   // 左上の マップの 札に かからない ように
                const sag = 3 + Math.sin((x / W) * Math.PI) * 6;
                const lx = x + swing * 1.5;
                const glow = 0.25 + p * 0.45;
                ctx.save();
                ctx.globalAlpha = glow;
                ctx.fillStyle = '#ffb040';
                ctx.beginPath();
                ctx.arc(lx + 3, sag + 8, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                px(ctx, lx + 1, sag + 2, 5, 1, '#202020');
                px(ctx, lx, sag + 3, 7, 9, i % 2 ? '#e83828' : '#ffffff');
                px(ctx, lx, sag + 6, 7, 1, i % 2 ? '#a81c14' : '#e8d8c0');
                px(ctx, lx + 1, sag + 12, 5, 1, '#202020');
            }
        },
        // SE城前: 足もとを 流れる 紫の 霧・拍で 暗く 脈打つ・ときどき 稲光
        castle(ctx, W, H, time, p) {
            ctx.save();
            for (let i = 0; i < 3; i++) {
                ctx.globalAlpha = 0.16;
                ctx.fillStyle = '#7a3ab0';
                const y = H - 26 + i * 7;
                for (let x = -20; x < W + 20; x += 6) {
                    const h = 4 + Math.sin(x / 17 + time / (700 + i * 200) + i) * 3;
                    ctx.fillRect(x + ((time / (40 + i * 25)) % 6), y - h, 6, h + 4);
                }
            }
            ctx.globalAlpha = p * 0.18;
            ctx.fillStyle = '#200030';
            ctx.fillRect(0, 0, W, H);
            const b = info();
            if (b) {
                const bar = Math.floor(b.beat / 4);
                const inBar = b.beat / 4 - bar;
                if (bar % 4 === 3 && inBar < 0.12) {   // 4 小節に 1 回 稲光
                    ctx.globalAlpha = (0.12 - inBar) / 0.12 * 0.5;
                    ctx.fillStyle = '#e0d0ff';
                    ctx.fillRect(0, 0, W, H);
                }
            }
            ctx.restore();
            edgeGlow(ctx, W, H, '#b040ff', p * 0.6);
        },
        // おにおにRASH (バトル): 拍の 集中線と 火花
        battle(ctx, W, H, time, p, bp) {
            speedLines(ctx, W, H, time, bp, '#ffffff');
            edgeGlow(ctx, W, H, '#ff3020', p * 0.8);
            drift(ctx, W, H, time, 10, 30, -50, (x, y, i) => px(ctx, x, y, 1, 1, i % 2 ? '#ffd040' : '#ff6020'));
        },
        battle2(ctx, W, H, time, p, bp) {
            // 歌ありの バトル: 上から スポットライトが 拍で 左右に
            const b = info();
            const side = b ? Math.floor(b.beat) % 2 : 0;
            ctx.save();
            ctx.globalAlpha = 0.08 + p * 0.12;
            ctx.fillStyle = '#fff0c0';
            ctx.beginPath();
            const cx = side ? W * 0.3 : W * 0.7;
            ctx.moveTo(cx - 8, 0);
            ctx.lineTo(cx + 8, 0);
            ctx.lineTo(cx + 46, H);
            ctx.lineTo(cx - 46, H);
            ctx.fill();
            ctx.restore();
            AMBIENT.battle(ctx, W, H, time, p, bp);
        },
        // こおりくんの テーマ: 降る 氷の 結晶と 上の オーロラ
        rash2(ctx, W, H, time, p, bp) {
            ctx.save();
            for (let x = 0; x < W; x += 4) {
                const y = 6 + Math.sin(x / 23 + time / 900) * 4 + Math.sin(x / 9 - time / 600) * 2;
                ctx.globalAlpha = 0.12 + p * 0.12;
                ctx.fillStyle = `hsl(${170 + Math.sin(x / 40 + time / 1500) * 40}, 90%, 65%)`;
                ctx.fillRect(x, y, 4, 10);
            }
            ctx.restore();
            drift(ctx, W, H, time, 16, -6, 26, (x, y, i) => {
                const c = i % 3 ? '#cfefff' : '#ffffff';
                px(ctx, x, y - 1, 1, 3, c);
                px(ctx, x - 1, y, 3, 1, c);
            });
            edgeGlow(ctx, W, H, '#60d8ff', p * 0.8);
            speedLines(ctx, W, H, time, bp * 0.8, '#cff4ff', 5);
        },
        // SE城 突撃 (ユーロビート): ネオンの レーザーと 横に 流れる 光
        rash3(ctx, W, H, time, p, bp) {
            const b = info();
            const beat = b ? b.beat : time / 390;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) {
                const a = Math.sin(beat * Math.PI / 2 + i * 2.1) * 0.9;
                ctx.globalAlpha = 0.18 + p * 0.25;
                ctx.strokeStyle = ['#ff40c0', '#40e0ff', '#c0ff40'][i];
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(W / 2 + (i - 1) * 60, -2);
                ctx.lineTo(W / 2 + (i - 1) * 60 + Math.sin(a) * 240, H);
                ctx.stroke();
            }
            ctx.globalAlpha = 0.5;
            drift(ctx, W, H, time, 9, -260, 0, (x, y, i) => px(ctx, x, y, 14 + (i % 3) * 10, 1, ['#ff40c0', '#40e0ff', '#ffffff'][i % 3]));
            ctx.restore();
            edgeGlow(ctx, W, H, '#ff40c0', p * 0.8);
        },
        // 宿敵おにおに (シンフォニックメタル): 赤い 火の粉・赤黒い 脈・小節の 頭に 稲光
        rash4(ctx, W, H, time, p, bp) {
            ctx.save();
            ctx.globalAlpha = 0.1 + p * 0.16;
            const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 150);
            g.addColorStop(0, 'rgba(120,0,0,0)');
            g.addColorStop(1, 'rgba(160,0,10,1)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            drift(ctx, W, H, time, 28, 8, -34, (x, y, i) => px(ctx, x + Math.sin(time / 300 + i) * 3, y, i % 4 ? 1 : 2, 2, i % 3 ? '#ff4020' : '#ffb030'));
            if (bp > 0.6) {
                ctx.save();
                ctx.globalAlpha = (bp - 0.6) * 0.6;
                ctx.fillStyle = '#ffe0e0';
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
            }
            edgeGlow(ctx, W, H, '#ff1010', p);
        },
        // SUPER: 金の 紙吹雪と 小節ごとに 広がる 金の 光
        super(ctx, W, H, time, p, bp) {
            drift(ctx, W, H, time, 26, 10, 30, (x, y, i) => {
                const flip = Math.floor(time / 120 + i) % 2;
                px(ctx, x - 1, y - 1, flip ? 5 : 3, flip ? 3 : 5, 'rgba(60,30,0,0.6)');   // 金の 床でも 見える ように 縁どり
                px(ctx, x, y, flip ? 3 : 1, flip ? 1 : 3, ['#ffffff', '#fff2a0', '#ff60a0', '#60d0ff'][i % 4]);
            });
            if (bp > 0.05) rays(ctx, W / 2, H / 2, time, '#ffe060', bp * 0.22, 12);
            edgeGlow(ctx, W, H, '#ffd700', p);
        },
        super2(...a) { AMBIENT.super(...a); },
        // 敗北・復活待ち: 青い 雨
        defeat(ctx, W, H, time) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            drift(ctx, W, H, time, 22, -20, 160, (x, y) => px(ctx, x, y, 1, 4, '#8ab0e0'));
            ctx.restore();
        },
        // こおりファイアー: 下から 炎の 熱と 火の粉
        tokkaFire(ctx, W, H, time, p, bp) {
            ctx.save();
            for (let x = 0; x < W; x += 3) {
                const h = 6 + Math.abs(Math.sin(x / 7 + time / 120)) * 8 + p * 6;
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = x % 2 ? '#ff6010' : '#ffc020';
                ctx.fillRect(x, H - h, 3, h);
            }
            ctx.restore();
            drift(ctx, W, H, time, 14, 6, -60, (x, y, i) => px(ctx, x, y, 1, 1, i % 2 ? '#ffe060' : '#ff5010'));
            edgeGlow(ctx, W, H, '#ff6010', p);
        },
        // 一撃入魂 (和太鼓): 拍ごとに 太鼓の 衝撃波が 足もとから 広がる
        tokkaIkkeki(ctx, W, H, time, p, bp) {
            const b = info();
            const k = b ? frac(b.beat) : frac(time / 400);
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = (1 - k) * 0.45;
            ctx.beginPath();
            ctx.ellipse(W / 2, H - 20, 20 + k * 150, 6 + k * 40, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            if (bp > 0.3) {   // 小節の 頭の 大太鼓: 上下が 暗く しまる
                ctx.fillStyle = `rgba(0,0,0,${Math.min(0.5, bp * 0.5)})`;
                ctx.fillRect(0, 0, W, 3);
                ctx.fillRect(0, H - 3, W, 3);
            }
            edgeGlow(ctx, W, H, '#ff2030', p);
        },
        // ASAHARA CHANCE (王様の ヒップホップ): 金の コインが 舞い、ふちが 金に 光る
        tokkaAsahara(ctx, W, H, time, p, bp) {
            drift(ctx, W, H, time, 10, 0, 40, (x, y, i) => {
                const spin = Math.abs(Math.sin(time / 150 + i));
                const w = Math.max(1, Math.round(spin * 4));
                px(ctx, x - w / 2, y, w, 4, '#ffd040');
                px(ctx, x - w / 2, y, w, 1, '#fff6c0');
            });
            if (bp > 0.05) rays(ctx, W / 2, 30, time, '#ffd700', bp * 0.2, 10);
            edgeGlow(ctx, W, H, '#ffd700', p * 0.9);
        }
    };
    // まんなかから 回る 光の すじ
    function rays(ctx, cx, cy, time, color, alpha, n = 16) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillStyle = color;
        const rot = time / 1600;
        for (let i = 0; i < n; i++) {
            const a = rot + (i / n) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a - 0.08) * 300, cy + Math.sin(a - 0.08) * 300);
            ctx.lineTo(cx + Math.cos(a + 0.08) * 300, cy + Math.sin(a + 0.08) * 300);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    // ----- RASH の 広間の 絵を 曲ごとに (キャラより 奥に 描く。ground は 床の 高さ) -----
    const BACKDROP = {
        // こおりくんの テーマ: 青く 冷えた 広間・天井から 氷柱・床に 霜
        rash2(ctx, W, H, time, ground, p) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#1050c0';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            for (let i = 0; i < 16; i++) {
                const x = 4 + i * 16 + (i % 3) * 3;
                const len = 6 + Math.round(rnd(i + 30) * 10);
                for (let y = 0; y < len; y++) px(ctx, x + Math.floor(y / len * 2), 10 + y, Math.max(1, 3 - Math.floor(y / len * 3)), 1, y < 2 ? '#ffffff' : '#a8e4ff');
                if (Math.floor(time / 200 + i * 3) % 23 === 0) px(ctx, x, 9, 1, 1, '#ffffff');   // きらり
            }
            for (let x = 0; x < W; x += 5) px(ctx, x + (x % 3), ground + 1 + (x % 2), 3, 1, 'rgba(220,245,255,0.6)');
        },
        // SE城 突撃: 床に ネオンの 線 (奥へ 向かう 道)。拍で 手前へ 流れる
        rash3(ctx, W, H, time, ground, p) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#300040';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 0.55 + p * 0.4;
            ctx.strokeStyle = '#ff40c0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = -6; i <= 6; i++) {
                ctx.moveTo(W / 2 + i * 6, ground);
                ctx.lineTo(W / 2 + i * 50, H);
            }
            ctx.stroke();
            const b = info();
            const f = b ? frac(b.beat) : frac(time / 390);
            ctx.strokeStyle = '#40e0ff';
            ctx.beginPath();
            for (let k = 0; k < 4; k++) {
                const z = (k + f) / 4;
                const y = Math.round(ground + (H - ground) * z * z);
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(W, y + 0.5);
            }
            ctx.stroke();
            ctx.restore();
        },
        // 宿敵おにおに: 赤黒い 広間・奥の 壁に 拍で 光る 鬼の 目
        rash4(ctx, W, H, time, ground, p) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#400008';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 0.35 + p * 0.6;
            const eye = (x) => {
                ctx.fillStyle = '#ff2020';
                ctx.beginPath();
                ctx.moveTo(x - 14, 42);
                ctx.lineTo(x + 14, 36);
                ctx.lineTo(x + 8, 46);
                ctx.closePath();
                ctx.fill();
                px(ctx, x + 1, 40, 3, 3, '#ffe060');
            };
            eye(W / 2 - 26);
            ctx.save();
            ctx.translate(W, 0);
            ctx.scale(-1, 1);
            eye(W / 2 - 26);
            ctx.restore();
            ctx.restore();
        },
        // SUPER: 金の 壁が 拍で きらめく
        super(ctx, W, H, time, ground, p) {
            const b = info();
            const n = b ? Math.floor(b.beat) : Math.floor(time / 370);
            for (let i = 0; i < 14; i++) {
                const x = Math.round(rnd(i + n * 13) * W);
                const y = Math.round(rnd(i * 7 + n) * (ground - 20)) + 14;
                const s = p > 0.5 ? 2 : 1;
                px(ctx, x - s, y, s * 2 + 1, 1, '#fffbe0');
                px(ctx, x, y - s, 1, s * 2 + 1, '#fffbe0');
            }
        }
    };
    BACKDROP.super2 = BACKDROP.super;
    function drawBackdrop(ctx, W, H, time, ground) {
        const fn = BACKDROP[track()];
        if (fn) fn(ctx, W, H, time, ground, pulse(time, 6));
    }

    // opts.calm: ミニゲームや 会話の 画面など、飾りを 出さない とき
    function drawAmbient(ctx, W, H, time, opts = {}) {
        if (opts.calm) return;
        const name = track();
        const fn = name && AMBIENT[name];
        if (!fn) return;
        fn(ctx, W, H, time, pulse(time, 6), barPulse(time));
    }

    // ----- 当たり演出 -----
    const BIG = {
        castleEntry: 'gold', rashStart: 'red', superStart: 'rainbow', zoneHit: 'rainbow', freezeBonus: 'rainbow',
        revival: 'rainbow', companionSave: 'gold', revengeSuccess: 'gold', tokkaStart: 'rainbow', defeat: 'gold'
    };
    function event(e) {
        let kind = BIG[e.type];
        if (e.type === 'naiteiResult' && e.win) kind = 'rainbow';
        if (e.type === 'castleSure') kind = 'gold';
        if (!kind) return;
        const b = info();
        jackpot = { kind, start: performance.now(), beat0: b ? Math.ceil(b.beat) : null };
    }
    // レバーの 当たり確定 (キュインキュイン): 小さめの 虹の 輪
    function hype(h) {
        if (h && (h.kakutei || h.cutin === 'rainbow')) jackpot = { kind: 'rainbow', start: performance.now(), beat0: null, small: true };
    }
    function colorOf(kind, time, i = 0) {
        if (kind === 'rainbow') return `hsl(${(time / 4 + i * 50) % 360}, 100%, 60%)`;
        if (kind === 'red') return i % 2 ? '#ff4030' : '#ffd040';
        return i % 2 ? '#ffd700' : '#fff4b0';
    }
    function drawJackpot(ctx, W, H, time) {
        if (!jackpot) return;
        const t = time - jackpot.start;
        const life = jackpot.small ? 1400 : 3600;
        if (t > life) {
            jackpot = null;
            return;
        }
        const fade = t > life - 600 ? (life - t) / 600 : 1;
        // 回る 光の すじ (はじめの 2 秒)
        if (!jackpot.small && t < 2400) rays(ctx, W / 2, H / 2, time, colorOf(jackpot.kind, time), 0.22 * fade * (1 - t / 2400 * 0.5), 18);
        // 拍ごとに 広がる 光の 輪 (曲が ない ときは 0.4 秒ごと)
        const b = info();
        const rings = [];
        if (b && jackpot.beat0 !== null) {
            for (let n = jackpot.beat0 - 1; n <= b.beat; n++) {
                const age = (b.beat - n) * 60 / b.bpm * 1000;
                if (age >= 0 && age < 900) rings.push({ age, i: n });
            }
        } else {
            for (let k = 0; k * 400 <= t; k++) {
                const age = t - k * 400;
                if (age < 900) rings.push({ age, i: k });
            }
        }
        ctx.save();
        ctx.lineWidth = 2;
        for (const r of rings.slice(-3)) {
            const k = r.age / 900;
            ctx.globalAlpha = (1 - k) * 0.8 * fade;
            ctx.strokeStyle = colorOf(jackpot.kind, time, r.i);
            ctx.beginPath();
            ctx.ellipse(W / 2, H / 2, 10 + k * 170, 6 + k * 100, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        // 紙吹雪 (上から ばらまく)
        if (!jackpot.small) {
            for (let i = 0; i < 40; i++) {
                const delay = rnd(i + 50) * 500;
                const age = (t - delay) / 1000;
                if (age < 0) continue;
                const x = rnd(i) * W + Math.sin(age * 4 + i) * 6;
                const y = -6 + age * (40 + rnd(i + 9) * 50) + age * age * 10;
                if (y > H) continue;
                const flip = Math.floor(time / 90 + i) % 2;
                ctx.globalAlpha = fade;
                px(ctx, x, y, flip ? 3 : 1, flip ? 1 : 3, colorOf(jackpot.kind === 'red' ? 'rainbow' : jackpot.kind, time, i));
            }
            ctx.globalAlpha = 1;
        }
        edgeGlow(ctx, W, H, colorOf(jackpot.kind, time), pulse(time, 4, 400) * fade);
    }

    return { drawBackdrop, tick, pulse, barPulse, bounce, musicTime, drawAmbient, drawTelop, drawJackpot, event, hype };
})();
