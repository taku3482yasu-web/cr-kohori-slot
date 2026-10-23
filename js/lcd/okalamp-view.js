// =====================================================================
// 上乗せ特化ゾーン「おかランプ」の絵 (8頭身のおかがっぱ・ランプ・ダンスフロア)
// ---------------------------------------------------------------------
// 新作 (koori-slot-aso の src/presentation/lcd/tokka.js) の絵を写した (ユーザー指定 2026-10-23: おかランプは新作と同じ)。
// まんなかの8頭身のおかがっぱがキレのあるダンスを踊り、頭のランプがチャンス役でレバーの瞬間に点灯する。
// 頭はいつものおかがっぱの絵 (characters.js) の上の部分を使い、首から下は長い手足を線で描く。
// 1拍 (BEAT_MS) ごとにポーズを変え、拍の頭のほんの一瞬 (SNAP_MS) で決めてピタッと止める。決めた瞬間はキレの線と残像。
// t はミリ秒。lamp: null (消えている) / 'red' / 'rainbow'
// =====================================================================

const OkaLampView = (() => {
    const RAINBOW = ['#ff4040', '#ffa040', '#ffe040', '#40e060', '#40a0ff', '#a060ff'];
    const BEAT_MS = 300;
    const SNAP_MS = 70;
    const HEAD_ROWS = 19;   // おかがっぱの絵 (32x40) の頭の部分 (皿〜くちばし)
    const G = { body: '#5ab84a', dark: '#469a3a', line: '#24501c', belly: '#e8e0a0', shell: '#8a6a3a', hand: '#7ad06a' };

    const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
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
    // 16拍で1まわり。[ポーズ, 左右反転, くるっと回ってから決める]
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

    // 骨組み: 首・腰と、手足の関節の位置。u は頭の高さ (全身の 1/8)
    function skeleton(x, ground, u, p) {
        const torso = 2.6 * u, thigh = 2.1 * u, shin = 2.0 * u, upper = 1.35 * u, fore = 1.25 * u;
        const lean = p.lean * Math.PI / 180;
        const legDrop = ([a, b]) => thigh * dir(a)[1] + shin * dir(b)[1];
        const hipY = ground - Math.max(legDrop(p.legL), legDrop(p.legR), 0.5 * u) - 0.2 * u - (p.up || 0) * u;
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
        return {
            neck, hip, lean,
            armL: limb(shoulder(-1), p.armL, upper, fore), armR: limb(shoulder(1), p.armR, upper, fore),
            legL: limb(hipAt(-1), p.legL, thigh, shin), legR: limb(hipAt(1), p.legR, thigh, shin)
        };
    }

    function strokeLimb(ctx, pts, w, color, outline) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        [[w + 2, outline], [w, color]].forEach(([lw, c]) => {
            ctx.strokeStyle = c;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            pts.slice(1).forEach(q => ctx.lineTo(q[0], q[1]));
            ctx.stroke();
        });
    }

    // 首から下。ghost: 残像の色 (色1つの薄い絵)
    function drawTallBody(ctx, sk, u, ghost = null) {
        const limbW = Math.max(2, 0.34 * u);
        const c = ghost ? { body: ghost, dark: ghost, line: ghost, belly: ghost, shell: ghost, hand: ghost } : G;
        ['legL', 'legR'].forEach((k, i) => {
            strokeLimb(ctx, sk[k], limbW * 1.1, i ? c.body : c.dark, c.line);
            const [fx, fy] = sk[k][2];
            rect(ctx, fx - (i ? 0.15 : 0.55) * u, fy - 0.12 * u, 0.7 * u, 0.24 * u, c.dark);
        });
        ctx.save();
        ctx.translate(sk.hip[0], sk.hip[1]);
        ctx.rotate(sk.lean);
        const tw = 1.5 * u, hw = 1.05 * u, tl = 2.6 * u;
        [[c.line, 1], [c.body, 0]].forEach(([fill, o]) => {
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(-hw / 2 - o, o);
            ctx.lineTo(-tw / 2 - o, -tl + 0.1 * u);
            ctx.lineTo(tw / 2 + o, -tl + 0.1 * u);
            ctx.lineTo(hw / 2 + o, o);
            ctx.fill();
        });
        rect(ctx, -tw / 2, -tl + 0.3 * u, 0.16 * u, tl * 0.7, c.shell);
        rect(ctx, tw / 2 - 0.16 * u, -tl + 0.3 * u, 0.16 * u, tl * 0.7, c.shell);
        rect(ctx, -0.42 * u, -tl + 0.35 * u, 0.84 * u, tl * 0.8, c.belly);
        if (!ghost) for (let i = 1; i < 4; i++) rect(ctx, -0.42 * u, -tl + 0.35 * u + i * tl * 0.2, 0.84 * u, Math.max(1, 0.06 * u), '#c8c080');
        ctx.restore();
        strokeLimb(ctx, [sk.neck, [sk.neck[0], sk.neck[1] - 0.3 * u]], 0.4 * u, c.body, c.line);
        ['armL', 'armR'].forEach(k => {
            strokeLimb(ctx, sk[k], limbW, c.body, c.line);
            const [hx, hy] = sk[k][2];
            rect(ctx, hx - 0.2 * u, hy - 0.2 * u, 0.4 * u, 0.4 * u, c.hand);
        });
    }

    // 頭 (いつものおかがっぱの絵の上の部分) を首の上に。戻り値: 頭のてっぺん (ランプを置くところ) と傾き
    function drawTallHead(ctx, t, sk, u, tilt, flip) {
        const hs = u / HEAD_ROWS;
        const nx = sk.neck[0], ny = sk.neck[1] - 0.25 * u;
        const a = (tilt * Math.PI) / 180;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.rect(-20 * hs, -HEAD_ROWS * hs, 40 * hs, HEAD_ROWS * hs);
        ctx.clip();
        // 絵の足もと (40 ドット目) を首より下に置くと、頭 (上の 19 ドット) が首の上にくる
        Characters.drawEnemy(ctx, 'okagappa', 0, (40 - HEAD_ROWS) * hs, { scale: hs, flip, frame: Math.floor(t / BEAT_MS) % 2 });
        ctx.restore();
        const top = (HEAD_ROWS - 2) * hs;
        return [nx + Math.sin(a) * top, ny - Math.cos(a) * top, a];
    }

    // キレの線: 手先・足先から外へ短い線
    function drawSnapLines(ctx, sk, u, k) {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, 0.12 * u);
        ['armL', 'armR', 'legL', 'legR'].forEach(key => {
            const [, mid, end] = sk[key];
            const dx = end[0] - mid[0], dy = end[1] - mid[1];
            const len = Math.hypot(dx, dy) || 1;
            const nx = dx / len, ny = dy / len;
            [-0.5, 0, 0.5].forEach(spread => {
                const ax = nx * Math.cos(spread) - ny * Math.sin(spread);
                const ay = nx * Math.sin(spread) + ny * Math.cos(spread);
                const r0 = 0.4 * u + k * 0.4 * u, r1 = r0 + 0.6 * u;
                ctx.beginPath();
                ctx.moveTo(end[0] + ax * r0, end[1] + ay * r0);
                ctx.lineTo(end[0] + ax * r1, end[1] + ay * r1);
                ctx.stroke();
            });
        });
        ctx.restore();
    }

    // 8頭身のおかがっぱ。(x, ground) は足もと、h は全身の高さ
    function drawTall(ctx, t, x, ground, h, lamp, litSince = 99999) {
        const u = h / 8;
        const beat = Math.floor(t / BEAT_MS);
        const inBeat = t - beat * BEAT_MS;
        const prev = poseAt(beat - 1), next = poseAt(beat);
        const k = inBeat < SNAP_MS ? ease(inBeat / SNAP_MS) : 1;
        // 決めた直後は少しだけ行きすぎてから戻る (ピタッと止まる感じ)
        const over = inBeat < SNAP_MS ? 0 : Math.max(0, 1 - (inBeat - SNAP_MS) / 120);
        const pose = blend(prev, next, k + over * 0.06);
        const spinMs = SNAP_MS * 2.2;
        const spin = stepAt(beat)[2] && inBeat < spinMs;
        const facing = Math.floor(beat / 4) % 2 === 1;
        if (inBeat < SNAP_MS * 1.6) {
            ctx.save();
            ctx.globalAlpha *= 0.28 * (1 - inBeat / (SNAP_MS * 1.6));
            drawTallBody(ctx, skeleton(x, ground, u, prev), u, '#c080ff');
            ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(x, ground, 1.6 * u, 0.3 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        if (spin) {
            const sx = Math.cos((inBeat / spinMs) * Math.PI * 2);
            ctx.translate(x, 0);
            ctx.scale(Math.abs(sx) < 0.15 ? (sx < 0 ? -0.15 : 0.15) : sx, 1);
            ctx.translate(-x, 0);
        }
        const sk = skeleton(x, ground, u, pose);
        drawTallBody(ctx, sk, u);
        const [lx, ly, la] = drawTallHead(ctx, t, sk, u, pose.tilt, facing);
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(la);
        drawLamp(ctx, t, 0, 0, u / 13, lamp, litSince);
        ctx.restore();
        ctx.restore();
        if (!spin && inBeat >= SNAP_MS && inBeat < SNAP_MS + 160) drawSnapLines(ctx, sk, u, (inBeat - SNAP_MS) / 160);
    }

    // 左右のいつものおかがっぱ (ランプなし。まんなかに合わせて体をゆらす)
    function drawBackup(ctx, t, x, ground, scale, right) {
        const beat = t / BEAT_MS;
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
