// =====================================================================
// 液晶の カメラ (2026-11-14 ユーザー指定: カメラが いつも 同じ 向きなので、動いて いろいろな 方向から 楽しめる ように)
// ---------------------------------------------------------------------
// 場面 (背景・キャラ) だけを 動かし、文字の 表示 (HUD) は 動かさない。
//   apply(ctx, view) … 場面を 描く 前に 呼ぶ。restore は 呼んだ 側で ctx.restore()
//   project(x, y)    … 場面の 座標が 画面の どこに 映るか (吹き出し・ダメージの 数字を カメラに ついて いかせる)
// カット (ショット) は 数秒ごとに 切り替わる。急に 切り替える (カット) か、ゆっくり 動く (ドリー) か。
//   wide: 引き / push: 少し 寄って ゆっくり 横に 流れる / hero: こおりくんに 寄る / enemy: 敵に 寄る
//   low: 下から あおる / dutch: 少し 傾ける / reverse: 反対側から (左右が 入れかわる) / track: 横に 流す
// 当たり・ダメージなどでは punch(…) で 一瞬 ぐっと 寄る。設定で 切れる (setEnabled)
// =====================================================================

const LcdCamera = (() => {
    let W = 256, H = 144;
    let enabled = true;
    const cur = { x: 128, y: 72, zoom: 1, rot: 0, flip: 1, sy: 1 };   // いまの カメラ (flip: 1 / -1)
    let from = { ...cur }, to = { ...cur };
    let moveStart = 0, moveMs = 0;
    let shot = null;          // { name, start, until, drift }
    let scene = null;
    let flipNow = 1;          // 反対側から (文字を 裏返さない ため LcdKit が 見る)
    let punchFx = null;       // { x, y, zoom, start, ms }
    let lastTime = 0;

    // 場面ごとの ショットの 出やすさ
    const SHOTS = {
        field: { wide: 4, push: 3, hero: 2, low: 2, dutch: 1, reverse: 2, track: 2 },
        // RASH は 敵が 画面の 外に 出ない ショット だけ (2026-11-14 ユーザー指摘: 敵が 映って いない ときが ある。こおりくんに 寄る hero は 使わない)
        rash: { wide: 3, push: 2, enemy: 3, low: 2, dutch: 2, reverse: 3, track: 2 },
        calm: { wide: 1 }
    };

    function init(width, height) { W = width; H = height; }
    function setEnabled(on) { enabled = on; if (!on) reset(); }
    function reset() {
        Object.assign(cur, { x: W / 2, y: H / 2, zoom: 1, rot: 0, flip: 1, sy: 1 });
        from = { ...cur }; to = { ...cur };
        shot = null;
    }

    const rnd = (a, b) => a + Math.random() * (b - a);
    function pickShot(kind, prev) {
        const table = SHOTS[kind] || SHOTS.calm;
        const names = Object.keys(table).filter(n => n !== prev || Object.keys(table).length === 1);
        let sum = names.reduce((s, n) => s + table[n], 0), r = Math.random() * sum;
        for (const n of names) { r -= table[n]; if (r <= 0) return n; }
        return names[0];
    }

    // ショットの 目標 (view: { kind, hero: {x, y}, enemy: {x, y} | null, ground })
    function targetOf(name, view) {
        const hero = view.hero || { x: W * 0.3, y: H * 0.6 };
        const enemy = view.enemy;
        const g = view.ground ?? H * 0.75;
        switch (name) {
            case 'push': return { x: W / 2 + rnd(-20, 20), y: H / 2 + 4, zoom: 1.16, rot: 0, flip: 1, sy: 1, drift: rnd(-6, 6) };
            case 'hero': return { x: hero.x + 18, y: hero.y - 6, zoom: 1.75, rot: 0, flip: 1, sy: 1, drift: 3 };
            case 'enemy': return enemy ? { x: enemy.x - 14, y: enemy.y - 4, zoom: 1.7, rot: 0, flip: 1, sy: 1, drift: -3 } : targetOf('push', view);
            case 'low': return { x: enemy ? (hero.x + enemy.x) / 2 : hero.x + 40, y: g - 34, zoom: 1.32, rot: 0, flip: 1, sy: 1.12, drift: 4 };
            case 'dutch': { const s = Math.random() < 0.5 ? -1 : 1; return { x: W / 2, y: H / 2 + 6, zoom: 1.24, rot: 0.065 * s, flip: 1, sy: 1, drift: 0 }; }
            case 'reverse': return { x: W / 2, y: H / 2 + 2, zoom: 1.1, rot: 0, flip: -1, sy: 1, drift: rnd(-5, 5) };
            case 'track': {
                const s = Math.random() < 0.5 ? -1 : 1;
                if (enemy) return { x: W / 2 + 8, y: H / 2 + 4, zoom: 1.22, rot: 0, flip: 1, sy: 1, drift: 10 * s };   // 敵が いる ときは 両方 入る 寄り
                return { x: W / 2 - 34 * s, y: H / 2 + 4, zoom: 1.38, rot: 0, flip: 1, sy: 1, drift: 16 * s };
            }
            default: return { x: W / 2, y: H / 2, zoom: 1, rot: 0, flip: 1, sy: 1, drift: 0 };
        }
    }

    function startShot(name, view, time, cut) {
        const t = targetOf(name, view);
        const len = name === 'wide' ? rnd(4500, 7000) : name === 'reverse' ? rnd(4000, 6000) : rnd(3000, 5000);
        shot = { name, start: time, until: time + len, drift: t.drift || 0, base: t };
        from = { ...cur };
        to = { x: t.x, y: t.y, zoom: t.zoom, rot: t.rot, flip: t.flip, sy: t.sy };
        // 反対側への 切り替えは いつも カット (ゆっくり 回すと 絵が つぶれる)
        moveMs = cut || from.flip !== to.flip ? 0 : rnd(900, 1500);
        moveStart = time;
        if (!moveMs) Object.assign(cur, to);
    }

    // view.kind: 'field' | 'rash' | 'calm' (動かさない)。view.lock でも 動かさない (演出の 途中)
    let keep = null;   // 画面に 入れて おく 敵 { x }
    function update(time, view) {
        keep = view.enemy && view.kind === 'rash' ? { x: view.enemy.x } : null;
        const dt = Math.min(100, lastTime ? time - lastTime : 16);
        lastTime = time;
        if (!enabled) return;
        if (view.kind !== scene) {   // 場面が 変わったら 引きの 絵から
            scene = view.kind;
            reset();
            shot = { name: 'wide', start: time, until: time + rnd(3500, 5000), drift: 0, base: targetOf('wide', view) };
        }
        // 敵が しゃべって いる あいだは 敵の 顔に ぐっと 寄る (2026-11-14 ユーザー指定)。ほかの 演出より 先
        if (view.focus === 'enemy' && view.enemy) {
            if (!shot || shot.name !== 'talk') {
                shot = { name: 'talk', start: time, until: time + 60000, drift: 0, base: null };
                from = { ...cur };
                const f = view.face || view.enemy;
                to = { x: f.x - 10, y: f.y + 4, zoom: 2.1, rot: 0, flip: 1, sy: 1 };   // 顔が まんなか・吹き出しが 左に 入る くらい
                moveMs = from.flip !== 1 ? 0 : 420;
                moveStart = time;
                if (!moveMs) Object.assign(cur, to);
            }
        } else if (shot && shot.name === 'talk') {
            startShot('wide', view, time, false);   // しゃべり おわったら ゆっくり 引く
        } else if (view.lock || view.kind === 'calm') {
            if (shot && shot.name !== 'wide') startShot('wide', view, time, false);
        } else if (!shot || time > shot.until) {
            startShot(pickShot(view.kind, shot && shot.name), view, time, Math.random() < 0.45);
        }
        // ゆっくり 動く / ショットの 中の 小さな 流れ
        const k = moveMs ? Math.min(1, (time - moveStart) / moveMs) : 1;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const p = shot ? Math.min(1, (time - shot.start) / Math.max(1, shot.until - shot.start)) : 0;
        const drift = shot && shot.name !== 'talk' ? shot.drift * (p - 0.5) * 2 : 0;
        cur.x = from.x + (to.x - from.x) * e + drift;
        cur.y = from.y + (to.y - from.y) * e;
        cur.zoom = from.zoom + (to.zoom - from.zoom) * e + (shot && shot.name !== 'wide' && shot.name !== 'talk' ? 0.03 * p : 0);   // じわっと 寄る
        cur.rot = from.rot + (to.rot - from.rot) * e;
        cur.sy = from.sy + (to.sy - from.sy) * e;
        cur.flip = to.flip;
    }

    // 当たり・ダメージで 一瞬 ぐっと 寄る
    function punch(x, y, zoom = 1.25, ms = 450) {
        if (!enabled) return;
        punchFx = { x, y, zoom, start: performance.now(), ms };
    }

    // 画面が 絵の 外に はみ出さない ように、寄り具合と 中心を おさえる
    function effective(time) {
        let { x, y, zoom, rot, flip, sy } = cur;
        if (punchFx) {
            const t = (time - punchFx.start) / punchFx.ms;
            if (t >= 1) punchFx = null;
            else {
                const a = Math.sin(Math.min(1, t) * Math.PI) ** 0.7;
                zoom *= 1 + (punchFx.zoom - 1) * a;
                x += (punchFx.x - x) * a * 0.5;
                y += (punchFx.y - y) * a * 0.5;
            }
        }
        const need = Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot)) * (W / H);   // 傾けても 角が 出ない 寄り
        zoom = Math.max(zoom, need);
        const zx = zoom, zy = zoom * sy;
        const hw = W / (2 * zx) + Math.abs(Math.sin(rot)) * H / (2 * zy), hh = H / (2 * zy) + Math.abs(Math.sin(rot)) * W / (2 * zx);
        // 敵が いる 場面では 敵 (と その まわり) が 画面に 入る ように 中心を ずらす
        if (keep) {
            const half = W / (2 * zx);
            x = Math.min(x, keep.x - 20 + half);   // 敵の 左はしより 右に 画面の 右はし
            x = Math.max(x, keep.x + 20 - half);
        }
        x = Math.min(W - Math.min(hw, W / 2), Math.max(Math.min(hw, W / 2), x));
        y = Math.min(H - Math.min(hh, H / 2), Math.max(Math.min(hh, H / 2), y));
        return { x, y, zx, zy, rot, flip };
    }

    let applied = null;
    function apply(ctx, time = performance.now()) {
        if (!enabled) { applied = null; flipNow = 1; return; }
        const c = effective(time);
        applied = c;
        flipNow = c.flip;
        ctx.translate(W / 2, H / 2);
        ctx.rotate(c.rot);
        ctx.scale(c.zx * c.flip, c.zy);
        ctx.translate(-c.x, -c.y);
    }
    // 場面を 描き 終えたら 呼ぶ (文字を ふつうに 戻す)
    function done() { flipNow = 1; }
    // フレームの 頭で 呼ぶ (カメラを 使わない 場面では project が そのままの 座標を 返す)
    function clear() { applied = null; flipNow = 1; }

    // 場面の (x, y) が 画面の どこに 映るか
    function project(x, y) {
        const c = applied;
        if (!c) return { x, y };
        let dx = (x - c.x) * c.zx * c.flip, dy = (y - c.y) * c.zy;
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        return { x: W / 2 + dx * cs - dy * sn, y: H / 2 + dx * sn + dy * cs };
    }

    return {
        init, update, apply, done, clear, project, punch, setEnabled, reset,
        get mirrored() { return flipNow < 0; },
        get enabled() { return enabled; },
        get shot() { return shot && shot.name; }
    };
})();
