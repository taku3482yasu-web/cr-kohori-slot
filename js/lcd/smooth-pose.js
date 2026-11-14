// =====================================================================
// なめらかに 動く ドット絵 (2026-11-14 ユーザー指定: 特化ゾーンの キャラを なめらかに 動かす)
// ---------------------------------------------------------------------
// 2 コマの 絵を 交互に 出すのでは なく、もとの ドット絵の 腕を 肩を 中心に ドットごと 回し、足を 上げ下げする。
// 角度・高さは 時間で なめらかに 変わる ので、かくかく しない。1 ドットずつ 塗って ぼかさず のせ、まわりに 1 ドットの 輪郭。
// 腕・足の 分け方は characters.js の RIGS (Characters.rig) と 同じ。絵は 足さない。
//
//   SmoothPose.drawEnemy(ctx, id, x, ground, { scale, flip, pose })   敵の 絵 (Characters の ENEMIES / COMPANIONS)
//   SmoothPose.drawSprite(ctx, sprite, frame, x, y, scale, { legRows, pose, flip })  文字列の 絵 (こおりくん など)
//   pose: { armL, armR (度。0 = もとの まま、+ で 外へ・上へ ふり上げる), legL, legR (足を 上げる ドット数) }
//   SmoothPose.dance(t, beatMs, opts) で よく 使う 踊りの pose を 作る
// =====================================================================

const SmoothPose = (() => {
    const LINE = '#14141c';
    const M = 18;   // 腕を ふる ための まわりの すきま (ドット)
    // 肩の 位置の 上書き (ふつうは 腕の いちばん 上の 内側の 角)。突き上げた 腕は 下の はしが 肩
    const PIVOT = {
        sasaki: { R: [24, 21] },
        asahara: { R: [25, 22] },
        onioni: { R: [30, 22] }
    };

    const colorCache = {};
    function rgb(hex) {
        if (colorCache[hex]) return colorCache[hex];
        const n = parseInt(hex.slice(1), 16);
        return (colorCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }

    // 絵の ドットと 部位 (0 体・1 左腕・2 右腕・3 左足・4 右足) と 肩の 位置
    const sources = {};
    function enemySource(id) {
        if (sources[id]) return sources[id];
        const { w: W, h: H } = Characters.size(id);
        const rig = Characters.rig(id) || {};
        const color = new Array(W * H).fill(null), part = new Uint8Array(W * H);
        Characters.rects(id).forEach(rc => {
            let p = 0;
            if (rig.legY != null && rc.y >= rig.legY) {
                const left = rig.legGroup ? rig.legGroup(rc) === 0 : rc.x + rc.w / 2 < W / 2;
                p = left ? 3 : 4;
            } else if (rig.legY != null && rc.y + rc.h <= rig.legY + 1) {
                if (rig.armL != null && rc.x + rc.w <= rig.armL) p = 1;
                else if (rig.armR != null && rc.x >= rig.armR) p = 2;
            }
            for (let y = Math.max(0, rc.y); y < Math.min(H, rc.y + rc.h); y++)
                for (let x = Math.max(0, rc.x); x < Math.min(W, rc.x + rc.w); x++) {
                    color[y * W + x] = rc.color;
                    part[y * W + x] = p;
                }
        });
        return (sources[id] = finish(W, H, color, part, rig, PIVOT[id] || {}));
    }
    function spriteSource(sprite, frame, legRows) {
        const key = '__smooth:' + frame + ':' + legRows;
        if (sprite[key]) return sprite[key];
        const rows = sprite.frames[frame];
        const W = rows[0].length, H = rows.length;
        const color = new Array(W * H).fill(null), part = new Uint8Array(W * H);
        rows.forEach((row, y) => {
            for (let x = 0; x < W; x++) {
                const c = sprite.palette[row[x]];
                if (!c) continue;
                color[y * W + x] = c;
                if (y >= H - legRows) part[y * W + x] = x < W / 2 ? 3 : 4;
            }
        });
        return (sprite[key] = finish(W, H, color, part, {}, {}));
    }
    // 肩: 腕の つけねの 幅の まんなかを 中心に 回し、そこに 腕の 色の 丸い 肩を 置く (回しても 体との あいだに すき間が できない)
    function finish(W, H, color, part, rig, over) {
        const pivots = {};
        [1, 2].forEach(p => {
            let minY = Infinity;
            for (let i = 0; i < W * H; i++) if (part[i] === p) minY = Math.min(minY, Math.floor(i / W));
            if (minY === Infinity) return;
            const k = p === 1 ? 'L' : 'R';
            const sh = rig['shoulder' + k];
            const o = over[k];
            const topY = o ? o[1] : sh != null && sh >= 0 ? sh : minY;
            // つけねの 行 (topY から 3 行) の 腕の 幅
            let x0 = Infinity, x1 = -Infinity;
            for (let y = topY; y < Math.min(H, topY + 3); y++) for (let x = 0; x < W; x++) {
                if (part[y * W + x] === p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); }
            }
            if (x0 === Infinity) { x0 = p === 1 ? rig.armL - 3 : rig.armR; x1 = x0 + 3; }
            const r = (x1 - x0) / 2;
            const px = o ? o[0] : x0 + r, py = o ? o[1] : topY + Math.min(r, 2);
            const ci = Math.min(H - 1, Math.floor(py)) * W + Math.min(W - 1, Math.max(0, Math.floor(px)));
            let cap = color[ci];
            if (!cap || part[ci] !== p) for (let i = 0; i < W * H; i++) if (part[i] === p) { cap = color[i]; break; }
            let maxR = 0;
            for (let i = 0; i < W * H; i++) if (part[i] === p) {
                maxR = Math.max(maxR, Math.hypot((i % W) + 0.5 - px, Math.floor(i / W) + 0.5 - py));
            }
            pivots[p] = { x: px, y: py, reach: Math.ceil(maxR) + 1, cap, capR: o ? 0 : r };
        });
        return { W, H, color, part, pivots };
    }

    // 小さな 画面 (使い回す。drawImage で すぐ 写す ので 1 つで よい)
    let canvas = null, g = null, image = null, solid = null, bw = 0, bh = 0;
    function buffer(w, h) {
        if (!canvas) {
            if (typeof document === 'undefined') return false;
            canvas = document.createElement('canvas');
            g = canvas.getContext('2d');
        }
        if (bw !== w || bh !== h) {
            bw = canvas.width = w;
            bh = canvas.height = h;
            image = g.createImageData(w, h);
            solid = new Uint8Array(w * h);
        }
        return true;
    }

    function render(src, pose) {
        const { W, H, color, part, pivots } = src;
        if (!buffer(W + M * 2, H + M + 2)) return false;
        const d = image.data;
        d.fill(0);
        const put = (x, y, hex) => {
            x += M; y += M;
            if (x < 0 || y < 0 || x >= bw || y >= bh) return;
            const c = rgb(hex), i = (y * bw + x) * 4;
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        };
        const legL = Math.round(pose.legL || 0), legR = Math.round(pose.legR || 0);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, c = color[i], p = part[i];
            if (!c) continue;
            if ((p === 1 || p === 2) && pivots[p]) continue;
            put(x, y - (p === 3 ? legL : p === 4 ? legR : 0), c);
        }
        // 腕: 肩を 中心に 回す (画面の ドット → もとの 絵の ドット に 逆回転して 色を 拾う)。先に 丸い 肩
        [[1, pose.armL || 0], [2, -(pose.armR || 0)]].forEach(([p, deg]) => {
            const pv = pivots[p];
            if (!pv) return;
            if (pv.capR && deg) {
                const R0 = Math.ceil(pv.capR);
                for (let y = -R0; y <= R0; y++) for (let x = -R0; x <= R0; x++) {
                    const qx = Math.floor(pv.x) + x, qy = Math.floor(pv.y) + y;
                    if (Math.hypot(qx + 0.5 - pv.x, qy + 0.5 - pv.y) <= pv.capR) put(qx, qy, pv.cap);
                }
            }
            const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
            const R = pv.reach;
            for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
                const qx = Math.floor(pv.x) + x, qy = Math.floor(pv.y) + y;
                const cx = qx + 0.5 - pv.x, cy = qy + 0.5 - pv.y;
                const ix = Math.floor(pv.x + cos * cx + sin * cy), iy = Math.floor(pv.y - sin * cx + cos * cy);
                if (ix < 0 || iy < 0 || ix >= W || iy >= H || part[iy * W + ix] !== p) continue;
                put(qx, qy, color[iy * W + ix]);
            }
        });
        // まわりに 1 ドットの 輪郭
        const line = rgb(LINE);
        for (let i = 0; i < bw * bh; i++) solid[i] = d[i * 4 + 3] ? 1 : 0;
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
            const i = y * bw + x;
            if (solid[i]) continue;
            if ((x > 0 && solid[i - 1]) || (x < bw - 1 && solid[i + 1]) || (y > 0 && solid[i - bw]) || (y < bh - 1 && solid[i + bw])) {
                d[i * 4] = line[0]; d[i * 4 + 1] = line[1]; d[i * 4 + 2] = line[2]; d[i * 4 + 3] = 255;
            }
        }
        g.putImageData(image, 0, 0);
        return true;
    }

    // 小さな 画面を 液晶に のせる。(left, top) は もとの 絵の 左上
    function blit(ctx, src, left, top, scale, flip, alpha) {
        const smoothOld = ctx.imageSmoothingEnabled;
        const tr = ctx.getTransform ? ctx.getTransform() : null;
        ctx.imageSmoothingEnabled = (tr ? Math.hypot(tr.a, tr.b) : 1) * scale < 1;   // 縮める ときだけ なめらかに
        ctx.save();
        ctx.globalAlpha *= alpha;
        if (flip) {
            const mid = left + src.W * scale / 2;
            ctx.translate(mid, 0);
            ctx.scale(-1, 1);
            ctx.translate(-mid, 0);
        }
        ctx.drawImage(canvas, left - M * scale, top - M * scale, bw * scale, bh * scale);
        ctx.restore();
        ctx.imageSmoothingEnabled = smoothOld;
    }

    // 敵・仲間を 描く。(x, ground) は 足もとの まんなか
    function drawEnemy(ctx, id, x, ground, { scale = 2, flip = false, pose = {}, alpha = 1 } = {}) {
        if (!Characters.size(id).w) return;
        const src = enemySource(id);
        if (!render(src, pose)) return;
        blit(ctx, src, x - src.W * scale / 2, ground - src.H * scale, scale, flip, alpha);
    }
    // 文字列の 絵 (drawSprite と 同じ 置き方: (x, y) は 左上)。legRows: 下から 何行が 足か
    function drawSprite(ctx, sprite, frame, x, y, scale = 1, { legRows = 0, pose = {}, flip = false, alpha = 1 } = {}) {
        const src = spriteSource(sprite, frame, legRows);
        if (!render(src, pose)) return;
        blit(ctx, src, x, y, scale, flip, alpha);
    }

    // 踊りの pose: 2 拍で 1 往復、左右の 腕を 1 拍 ずらして 交互に ふり上げ、足を 交互に 上げる (ゆっくり 出て ゆっくり 止まる)
    //   arm: ふり上げる 角度 / base: いちばん 下の ときの 角度 / leg: 足を 上げる 高さ / phase: ずらす 拍 / beats: 1 往復の 拍
    function dance(t, beatMs, { arm = 100, base = 10, leg = 2, phase = 0, beats = 2, armL = true, armR = true } = {}) {
        const b = (t / beatMs) * (2 / beats) + phase;
        const wave = k => 0.5 - 0.5 * Math.cos(Math.PI * k);
        const step = Math.sin(Math.PI * b);
        return {
            armL: armL ? base + arm * wave(b) : 0,
            armR: armR ? base + arm * wave(b + 1) : 0,
            legL: Math.max(0, step) * leg,
            legR: Math.max(0, -step) * leg,
            bob: Math.abs(Math.sin(Math.PI * b))   // 0〜1 (体を はずませる 量)
        };
    }

    return { drawEnemy, drawSprite, dance };
})();
