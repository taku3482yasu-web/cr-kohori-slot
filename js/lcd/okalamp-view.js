// =====================================================================
// 上乗せ特化ゾーン「おかランプ」の絵 (8頭身のおかがっぱ・ランプ・ダンスフロア)
// ---------------------------------------------------------------------
// 新作 (koori-slot-aso の src/presentation/lcd/tokka.js) の絵を写した (ユーザー指定 2026-10-23: おかランプは新作と同じ)。
// まんなかの8頭身のおかがっぱがキレのあるダンスを踊り、頭のランプがチャンス役でレバーの瞬間に点灯する。
// 頭はいつものおかがっぱの絵 (characters.js) の上の部分を使い、首から下も ドットで 描く (2026-11-14: 完全な ドット絵に)。
// 1拍 (BEAT_MS) ごとにポーズを変え、拍の 前半で 次の ポーズへ なめらかに 移る (2026-11-14: かくかく せず 自然に)。
// t はミリ秒。lamp: null (消えている) / 'red' / 'rainbow'
// =====================================================================

const OkaLampView = (() => {
    const RAINBOW = ['#ff4040', '#ffa040', '#ffe040', '#40e060', '#40a0ff', '#a060ff'];
    const BEAT_MS = 300;
    const HEAD_ROWS = 19;   // おかがっぱの絵 (32x40) の頭の部分 (皿〜くちばし)
    const G = { body: '#5ab84a', dark: '#469a3a', line: '#24501c', belly: '#e8e0a0', shell: '#8a6a3a', hand: '#7ad06a' };

    const lerp = (a, b, k) => a + (b - a) * k;

    function rect(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    function rainbow(ctx, x0, y0, x1, y1) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
        return g;
    }

    // ダンスフロア (色の変わるタイル)
    function drawDanceFloor(ctx, t, x, y, w, h) {
        const cols = ['#ff3a8a', '#3a8aff', '#ffd23a', '#3aff9a', '#a03aff'];
        const size = 12;
        for (let ix = 0; ix * size < w; ix++) {
            for (let iy = 0; iy * size / 2 < h; iy++) {
                ctx.save();
                ctx.globalAlpha = (ix + iy) % 2 ? 0.7 : 0.35;
                rect(ctx, x + ix * size, y + iy * size / 2, size - 1, size / 2 - 1, cols[(ix + iy + Math.floor(t / 250)) % cols.length]);
                ctx.restore();
            }
        }
    }

    // ランプ (台座とガラスの丸)
    function drawLamp(ctx, t, x, y, s, color, litSince = 99999) {
        if (color) {
            ctx.save();
            ctx.globalAlpha = 0.55 + Math.sin(t / 90) * 0.15;
            const g = ctx.createRadialGradient(x, y - 7 * s, 2, x, y - 7 * s, 30 * s);
            g.addColorStop(0, color === 'rainbow' ? '#ffffff' : '#ff8080');
            g.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y - 7 * s, 30 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        rect(ctx, x - 7 * s, y - 3 * s, 14 * s, 3 * s, '#3a3a44');
        rect(ctx, x - 6 * s, y - 4 * s, 12 * s, 1 * s, '#6a6a7a');
        ctx.fillStyle = !color ? '#5a1418' : color === 'red' ? '#ff2a2a'
            : rainbow(ctx, x - 8 * s + ((t / 6) % (16 * s)), 0, x + 8 * s + ((t / 6) % (16 * s)), 0);
        ctx.beginPath();
        ctx.arc(x, y - 10 * s, 6 * s, Math.PI, 0);
        ctx.lineTo(x + 6 * s, y - 4 * s);
        ctx.lineTo(x - 6 * s, y - 4 * s);
        ctx.closePath();
        ctx.fill();
        rect(ctx, x - 4 * s, y - 13 * s, 2 * s, 4 * s, color ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.25)');
        // 点いた瞬間のはじける光
        if (color && litSince < 400) {
            const k = litSince / 400;
            ctx.save();
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = color === 'rainbow' ? '#ffffff' : '#ff6060';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y - 8 * s, 8 * s + k * 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ポーズ: 腕と脚は [付け根の角度, 先の角度] (度。0 が真下・90 が右・180 が真上・-90 が左)
    // lean: 体の傾き / tilt: 首の傾き / up: 跳ぶ高さ (頭の高さの何倍)
    const POSES = {
        ready: { armL: [-20, -8], armR: [20, 8], legL: [-6, -2], legR: [6, 2], lean: 0, tilt: 0 },
        fever: { armL: [-35, 45], armR: [148, 152], legL: [-14, -10], legR: [28, -4], lean: -6, tilt: 8 },
        feverDown: { armL: [-35, 45], armR: [-42, -50], legL: [-14, -10], legR: [28, -4], lean: 6, tilt: -6 },
        wide: { armL: [-138, -150], armR: [138, 150], legL: [-30, -24], legR: [30, 24], lean: 0, tilt: 0, up: 0.5 },
        split: { armL: [-95, -100], armR: [95, 100], legL: [-84, -88], legR: [84, 88], lean: 0, tilt: 0 },
        robot: { armL: [-90, 0], armR: [90, 180], legL: [-6, -6], legR: [6, 6], lean: 0, tilt: -12 },
        kick: { armL: [-120, -100], armR: [60, 25], legL: [-4, -4], legR: [100, 92], lean: -14, tilt: -6 },
        dab: { armL: [-128, -128], armR: [-100, -152], legL: [-18, -12], legR: [14, 6], lean: -8, tilt: -24 },
        pose: { armL: [-30, -170], armR: [35, 110], legL: [-4, 18], legR: [22, 12], lean: 4, tilt: 10 }
    };
    const mirror = p => ({
        armL: p.armR.map(a => -a), armR: p.armL.map(a => -a), legL: p.legR.map(a => -a), legR: p.legL.map(a => -a),
        lean: -p.lean, tilt: -p.tilt, up: p.up
    });
    // 16拍で1まわり。[ポーズ, 左右反転, (前は くるっと回る 印。2026-11-14 から 使って いない)]
    const CHOREO = [
        ['fever'], ['feverDown'], ['fever'], ['feverDown'],
        ['wide'], ['split'], ['robot'], ['robot', true],
        ['kick'], ['kick', true], ['dab'], ['dab', true],
        ['pose', false, true], ['wide'], ['split'], ['ready', false, true]
    ];
    const stepAt = beat => CHOREO[((beat % CHOREO.length) + CHOREO.length) % CHOREO.length];
    const poseAt = beat => {
        const [id, flip] = stepAt(beat);
        return flip ? mirror(POSES[id]) : POSES[id];
    };
    function blend(p, q, k) {
        const mix = (x, y) => x.map((v, i) => lerp(v, y[i], k));
        return {
            armL: mix(p.armL, q.armL), armR: mix(p.armR, q.armR), legL: mix(p.legL, q.legL), legR: mix(p.legR, q.legR),
            lean: lerp(p.lean, q.lean, k), tilt: lerp(p.tilt, q.tilt, k), up: lerp(p.up || 0, q.up || 0, k)
        };
    }
    const dir = deg => [Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)];

    // 骨組み: 首・腰と、手足の関節の位置。u は頭の高さ (全身の 1/8)。dip: 拍で ひざを 曲げて 沈む 量 (u の 何倍)
    function skeleton(x, ground, u, p, dip = 0) {
        const torso = 2.6 * u, thigh = 2.1 * u, shin = 2.0 * u, upper = 1.35 * u, fore = 1.25 * u;
        const lean = p.lean * Math.PI / 180;
        const legDrop = ([a, b]) => thigh * dir(a)[1] + shin * dir(b)[1];
        const hipY = ground - Math.max(legDrop(p.legL), legDrop(p.legR), 0.5 * u) - 0.2 * u - (p.up || 0) * u + dip * u;
        const hip = [x, hipY];
        const neck = [x + Math.sin(lean) * torso, hipY - Math.cos(lean) * torso];
        const across = [Math.cos(lean), Math.sin(lean)];
        const shoulder = side => [neck[0] + across[0] * side * 0.72 * u, neck[1] + across[1] * side * 0.72 * u + 0.15 * u];
        const hipAt = side => [hip[0] + across[0] * side * 0.42 * u, hip[1] + across[1] * side * 0.42 * u];
        const limb = (root, [a, b], l1, l2) => {
            const d1 = dir(a), d2 = dir(b);
            const mid = [root[0] + d1[0] * l1, root[1] + d1[1] * l1];
            return [root, mid, [mid[0] + d2[0] * l2, mid[1] + d2[1] * l2]];
        };
        // 沈んだ ぶん ひざを 外へ 曲げる (足先は 地面より 下に 行かない)
        const bend = (leg, side) => {
            if (dip <= 0) return leg;
            leg[1] = [leg[1][0] + side * dip * 1.4 * u, leg[1][1]];
            leg[2] = [leg[2][0], Math.min(leg[2][1], ground - 0.2 * u)];
            return leg;
        };
        return {
            neck, hip, lean,
            armL: limb(shoulder(-1), p.armL, upper, fore), armR: limb(shoulder(1), p.armR, upper, fore),
            legL: bend(limb(hipAt(-1), p.legL, thigh, shin), -1), legR: bend(limb(hipAt(1), p.legR, thigh, shin), 1)
        };
    }

    // ----- ドット絵の 8頭身 (2026-11-14 ユーザー指定: 完全な ドット絵に して、かくかく せず 自然に 踊らせる) -----
    // 首から下も 線では なく 1 ドットずつ 塗る。小さな 画面 (1 ドット = 頭の 高さの 1/19) に 毎フレーム 描いて、
    // ぼかさずに 拡大して のせる。頭は いつもの おかがっぱの 絵 (characters.js) の 上 19 行を そのまま 使い、
    // 傾けるときも ドットを 1 つずつ 移す。最後に 全体の まわりに 1 ドットの 輪郭
    const U = HEAD_ROWS;                 // 頭の 高さ = 19 ドット
    const BW = 168, BH = 206;            // 小さな 画面の 大きさ (ドット)
    const FOOT_X = BW / 2, FOOT_Y = BH - 8;
    const LINE = '#1c3c16';
    let buf = null, bctx = null, img = null, px = null;
    const colorCache = {};
    function rgb(hex) {
        if (colorCache[hex]) return colorCache[hex];
        const n = parseInt(hex.slice(1), 16);
        return (colorCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
    function ensureBuffer() {
        if (buf) return true;
        if (typeof document === 'undefined') return false;
        buf = document.createElement('canvas');
        buf.width = BW;
        buf.height = BH;
        bctx = buf.getContext('2d');
        img = bctx.createImageData(BW, BH);
        px = img.data;
        return true;
    }
    function plot(x, y, hex) {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || y < 0 || x >= BW || y >= BH) return;
        const c = rgb(hex), i = (y * BW + x) * 4;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    // 円を 塗る (半径 r ドット)
    function disc(cx, cy, r, hex) {
        const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            if (dx * dx + dy * dy <= r * r) plot(x, y, hex);
        }
    }
    // 太い 線 (a → b。半径は r0 → r1 に 変わる)
    function capsule(a, b, r0, r1, hex) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(len * 2));
        for (let i = 0; i <= n; i++) {
            const k = i / n;
            disc(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, r0 + (r1 - r0) * k, hex);
        }
    }
    // 手足: 輪郭の 色で 1 ドット 太く 塗ってから 中を 塗る (重なっても 境目が 見える)。下側に 影
    function limbPx(pts, r, hex, shade) {
        capsule(pts[0], pts[1], r + 1, r + 1, LINE);
        capsule(pts[1], pts[2], r + 1, r * 0.85 + 1, LINE);
        capsule(pts[0], pts[1], r, r, hex);
        capsule(pts[1], pts[2], r, r * 0.85, hex);
        const o = Math.max(1, r * 0.45);
        capsule([pts[0][0] + o, pts[0][1] + o], [pts[1][0] + o, pts[1][1] + o], r * 0.4, r * 0.4, shade);
        capsule([pts[1][0] + o, pts[1][1] + o], [pts[2][0] + o * 0.8, pts[2][1] + o * 0.8], r * 0.35, r * 0.3, shade);
    }

    // 頭 (+ ランプ) の 元の 絵。ランプの 色 (消えて いる・赤・虹の ずれ) ごとに 作って おく
    const LAMP_H = 17;
    const headSrc = {};
    function headSource(lampKey) {
        if (headSrc[lampKey]) return headSrc[lampKey];
        const W = 32, H = LAMP_H - 2 + HEAD_ROWS;
        const cells = new Array(W * H).fill(null);
        const put = (x, y, w, h, color) => {
            for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
                for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) cells[yy * W + xx] = color;
        };
        Characters.rects('okagappa').forEach(rc => {
            if (rc.y >= HEAD_ROWS) return;
            put(rc.x, rc.y + LAMP_H - 2, rc.w, Math.min(rc.h, HEAD_ROWS - rc.y), rc.color);
        });
        // ランプ (皿の 上に 乗る): 台座 と ガラスの 丸
        const [state, shift] = lampKey.split(':');
        const glass = y => state === 'off' ? '#5a1418' : state === 'red' ? (y < 5 ? '#ff7070' : '#ff2a2a')
            : RAINBOW[(Math.floor(y / 2) + Number(shift)) % RAINBOW.length];
        for (let y = 0; y < LAMP_H - 4; y++) {
            const dy = y < 8 ? 8 - y - 0.5 : 0;
            const half = Math.round(y < 8 ? Math.sqrt(64 - dy * dy) : 8) - (y >= 8 ? 1 : 0);
            put(16 - half, y, half * 2, 1, glass(y));
        }
        put(11, 3, 2, 6, state === 'off' ? '#8a4a50' : '#ffffff');
        put(13, 2, 1, 1, state === 'off' ? '#8a4a50' : '#ffffff');
        put(7, LAMP_H - 4, 18, 1, '#6a6a7a');
        put(6, LAMP_H - 3, 20, 3, '#3a3a44');
        return (headSrc[lampKey] = { W, H, cells });
    }
    // 頭を 首の 上に (傾き a・左右反転)。ドットを 1 つずつ 移す (ぼかさない)
    function headPx(neck, a, flip, lampKey) {
        const src = headSource(lampKey);
        const pivot = [16, src.H];   // 首の つけね (あごの 下の まんなか)
        const cos = Math.cos(a), sin = Math.sin(a);
        const reach = Math.ceil(Math.hypot(src.W, src.H));
        const nx = Math.round(neck[0]), ny = Math.round(neck[1]);
        for (let y = -reach; y <= 2; y++) for (let x = -reach; x <= reach; x++) {
            // 画面の ドット → 元の 絵の ドット (逆回転)
            const cx = x + 0.5, cy = y + 0.5;
            const sx = cos * cx + sin * cy, sy = -sin * cx + cos * cy;
            let ix = Math.floor(pivot[0] + sx), iy = Math.floor(pivot[1] + sy);
            if (iy < 0 || iy >= src.H || ix < 0 || ix >= src.W) continue;
            if (flip) ix = src.W - 1 - ix;
            const c = src.cells[iy * src.W + ix];
            if (c) plot(nx + x, ny + y, c);
        }
    }
    // まわりに 1 ドットの 輪郭
    let solid = null;
    function outlinePx() {
        const c = rgb(LINE);
        if (!solid) solid = new Uint8Array(BW * BH);
        for (let i = 0; i < BW * BH; i++) solid[i] = px[i * 4 + 3] ? 1 : 0;
        for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
            const i = y * BW + x;
            if (solid[i]) continue;
            if ((x > 0 && solid[i - 1]) || (x < BW - 1 && solid[i + 1]) || (y > 0 && solid[i - BW]) || (y < BH - 1 && solid[i + BW])) {
                px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
            }
        }
    }
    // 8頭身を 小さな 画面に 描く
    function renderTall(sk, tilt, flip, lampKey) {
        px.fill(0);
        const u = U, armR = 0.17 * u, legR = 0.2 * u;
        // うしろの 足 → 前の 足
        limbPx(sk.legL, legR, G.dark, LINE);
        limbPx(sk.legR, legR, G.body, G.dark);
        ['legL', 'legR'].forEach((k, i) => {   // 足先 (水かき)
            const [fx, fy] = sk[k][2];
            const toe = [fx + (i ? 1 : -1) * 0.5 * u, fy + 0.05 * u];
            capsule([fx, fy], toe, 0.17 * u + 1, 0.12 * u + 1, LINE);
            capsule([fx, fy], toe, 0.17 * u, 0.12 * u, G.dark);
        });
        // 胴: こうらの ふち (茶) → 緑の 体 → おなか (クリーム色と しま)
        const top = [sk.neck[0], sk.neck[1] + 0.35 * u];
        capsule(sk.hip, top, 0.55 * u + 1, 0.78 * u + 1, LINE);
        capsule(sk.hip, top, 0.55 * u, 0.78 * u, G.shell);
        capsule(sk.hip, top, 0.45 * u, 0.66 * u, G.body);
        const bellyTop = [top[0] + (sk.hip[0] - top[0]) * 0.12, top[1] + (sk.hip[1] - top[1]) * 0.12];
        capsule(sk.hip, bellyTop, 0.3 * u, 0.4 * u, G.belly);
        const ax = Math.cos(sk.lean), ay = Math.sin(sk.lean);
        for (let i = 1; i < 4; i++) {
            const k = i / 4;
            const cx = sk.hip[0] + (bellyTop[0] - sk.hip[0]) * k, cy = sk.hip[1] + (bellyTop[1] - sk.hip[1]) * k;
            const w = (0.3 + 0.1 * k) * u - 1.5;
            capsule([cx - w * ax, cy - w * ay], [cx + w * ax, cy + w * ay], 0.5, 0.5, '#c8c080');
        }
        // 首
        const neckLow = [sk.neck[0], sk.neck[1] + 0.5 * u];
        capsule(sk.neck, neckLow, 0.24 * u + 1, 0.24 * u + 1, LINE);
        capsule(sk.neck, neckLow, 0.24 * u, 0.24 * u, G.body);
        // 腕と 手
        ['armL', 'armR'].forEach(k => {
            limbPx(sk[k], armR, G.body, G.dark);
            const [hx, hy] = sk[k][2];
            disc(hx, hy, 0.22 * u + 1, LINE);
            disc(hx, hy, 0.22 * u, G.hand);
        });
        headPx([sk.neck[0], sk.neck[1] + 0.1 * u], tilt * Math.PI / 180, flip, lampKey);
        outlinePx();
        bctx.putImageData(img, 0, 0);
    }

    // なめらかに つなぐ: 0〜1 を ゆっくり 出て ゆっくり 止まる 形に
    const smooth = k => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

    // 8頭身のおかがっぱ。(x, ground) は足もと、h は全身の高さ
    //   2026-11-14: 拍の 頭で 一瞬で 切り替えて 止める (かくかく) のを やめ、拍の 前半 かけて 次の ポーズへ なめらかに 移る。
    //   拍ごとに ひざを 曲げて 沈み (ノリ)、体も 左右に ゆれる。残像・キレの 線 (線で 描いて いた もの) は なくした
    function drawTall(ctx, t, x, ground, h, lamp, litSince = 99999) {
        const mt = BeatFx.musicTime(t, BEAT_MS);   // 曲 (おかピポ) の 拍に 合わせて 踊る (2026-11-14)
        const pos = mt / BEAT_MS;
        const beat = Math.floor(pos);
        const f = pos - beat;
        const pose = blend(poseAt(beat - 1), poseAt(beat), smooth(f / 0.7));
        const dip = 0.16 * (0.5 + 0.5 * Math.cos(f * Math.PI * 2)) * (1 - Math.min(1, pose.up * 2));   // 拍の 頭で いちばん 沈む
        pose.lean += Math.sin(pos * Math.PI) * 4;   // 2 拍で 1 往復の ゆれ
        pose.tilt += Math.sin(pos * Math.PI + 0.6) * 4;
        const facing = Math.floor(beat / 4) % 2 === 1;
        const s = h / (8 * U);   // 1 ドットの 大きさ (液晶の 座標)
        ctx.save();
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(x, ground, 1.6 * U * s, 0.3 * U * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (!ensureBuffer()) return;
        const lampKey = !lamp ? 'off:0' : lamp === 'red' ? 'red:0' : 'rainbow:' + (Math.floor(t / 80) % RAINBOW.length);
        const sk = skeleton(FOOT_X, FOOT_Y, U, pose, dip);
        renderTall(sk, pose.tilt, facing, lampKey);
        const left = x - FOOT_X * s, topY = ground - FOOT_Y * s;
        // ランプの 光 (点いて いる とき・点いた 瞬間)。ランプの まんなかは 首から 頭の 向きに (19 + 6) ドット 上
        if (lamp) {
            const a = pose.tilt * Math.PI / 180, d = HEAD_ROWS + 6 - 0.1 * U;
            const gx = left + (sk.neck[0] + Math.sin(a) * d) * s, gy = topY + (sk.neck[1] - Math.cos(a) * d) * s;
            const rad = 30 * h / 92;
            ctx.save();
            ctx.globalAlpha *= 0.55 + Math.sin(t / 90) * 0.15;
            const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, rad);
            g.addColorStop(0, lamp === 'rainbow' ? '#ffffff' : '#ff8080');
            g.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
            ctx.restore();
        }
        // 光の 上に ドット絵を のせる (ぼかさない)
        const smoothOld = ctx.imageSmoothingEnabled;
        // 画面で 1 ドットが 1 画素より 小さく なる (縮める) ときだけ なめらかに 縮める (線が 欠けない ように)
        const screenScale = ctx.getTransform ? Math.hypot(ctx.getTransform().a, ctx.getTransform().b) * s : s;
        ctx.imageSmoothingEnabled = screenScale < 1;
        ctx.drawImage(buf, left, topY, BW * s, BH * s);
        ctx.imageSmoothingEnabled = smoothOld;
        if (lamp) {
            const a = pose.tilt * Math.PI / 180, d = HEAD_ROWS + 6 - 0.1 * U;
            const gx = left + (sk.neck[0] + Math.sin(a) * d) * s, gy = topY + (sk.neck[1] - Math.cos(a) * d) * s;
            if (litSince < 400) {
                const k = litSince / 400;
                ctx.save();
                ctx.globalAlpha *= 1 - k;
                ctx.strokeStyle = lamp === 'rainbow' ? '#ffffff' : '#ff6060';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(gx, gy, 8 * h / 92 + k * 30, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // 左右のいつものおかがっぱ (ランプなし。まんなかに合わせて体をゆらす)
    function drawBackup(ctx, t, x, ground, scale, right) {
        const beat = BeatFx.musicTime(t, BEAT_MS) / BEAT_MS;
        const bob = Math.abs(Math.sin(beat * Math.PI)) * 3;
        const sway = Math.sin(beat * Math.PI / 2) * 4 * (right ? -1 : 1);
        Characters.drawEnemy(ctx, 'okagappa', x + sway, ground - bob, { scale, flip: right !== (Math.floor(beat / 2) % 2 === 1), frame: Math.floor(beat) % 2 });
    }

    // 場面全体: 暗いクラブ・スポットライト・ミラーボール・ダンスフロア・3人のおかがっぱ。
    // lamp が点いていると部屋も赤く (虹色に) 光る。W・H は液晶の大きさ、ground は足もと
    function drawScene(ctx, t, W, H, ground, lamp, litSince) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0a0418');
        bg.addColorStop(0.55, '#2a0a3a');
        bg.addColorStop(1, '#10061e');
        rect(ctx, 0, 0, W, H, bg);
        [['#ff3a8a', 50], ['#3a8aff', 128], ['#ffd23a', 206]].forEach(([c, x0], i) => {
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = c;
            const sx = x0 + Math.sin(t / 700 + i * 2) * 40;
            ctx.beginPath();
            ctx.moveTo(x0, 0);
            ctx.lineTo(sx - 24, ground);
            ctx.lineTo(sx + 24, ground);
            ctx.fill();
            ctx.restore();
        });
        const bx = 28, by = 34;
        rect(ctx, bx - 1, 16, 2, by - 24, '#6a6a7a');
        ctx.fillStyle = '#c8d0e0';
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 8; i++) rect(ctx, bx - 6 + ((i * 5 + Math.floor(t / 120)) % 12), by - 5 + (i % 3) * 4, 2, 2, '#ffffff');
        drawDanceFloor(ctx, t, 0, ground - 6, W, H - ground + 6);
        if (lamp) {
            ctx.save();
            ctx.globalAlpha = 0.18 + Math.sin(t / 90) * 0.06;
            rect(ctx, 0, 0, W, H, lamp === 'rainbow' ? rainbow(ctx, 0, 0, W, H) : '#ff0000');
            ctx.restore();
        }
        drawBackup(ctx, t, 44, ground, 1.5, false);
        drawBackup(ctx, t, W - 44, ground, 1.5, true);
        drawTall(ctx, t, W / 2, ground + 2, 92, lamp, litSince);
    }

    return { drawScene, drawTall, drawLamp, drawDanceFloor };
})();
