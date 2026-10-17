// =====================================================================
// 液晶のストーリー (オープニング・エンディング) を流す仕組み
// ---------------------------------------------------------------------
// 物語ごとのファイル (opening-view.js・ending-view.js) が register(name, script) で登録する。
//   script: { total: 長さ (ミリ秒), fades: [暗転でつなぐ時刻], draw(t, time) }
// play(name) で流し、終わるか skip() で止めると Promise が解決する。
// 液晶は active() の間、毎フレーム draw(time) だけを呼ぶ (ほかの描画はしない)。
// 物語のファイルが使う部品 (ナレーション・吹き出し・効果音) もここに置く。
// =====================================================================

const StoryView = (() => {
    const { text, textWidth, box } = LcdKit;
    const stories = {};
    let story = null;   // { script, start, resolve, sounds }

    function register(name, script) {
        stories[name] = script;
    }

    function play(name) {
        return new Promise(resolve => {
            story = { script: stories[name], start: performance.now(), resolve, sounds: {} };
        });
    }

    function skip() {
        if (!story) return;
        const { resolve } = story;
        story = null;
        resolve();
    }

    function active() {
        return Boolean(story);
    }

    function draw(time) {
        if (!story) return;
        const { ctx, W, H } = LcdKit.canvas();
        const { total, fades = [], draw: drawScene } = story.script;
        const t = time - story.start;
        if (t >= total) {
            skip();
            return;
        }
        drawScene(t, time);

        // 始まり・場面の切り替え・終わりは暗転でつなぐ
        const edge = Math.min(t, total - t, ...fades.map(f => Math.abs(t - f)));
        if (edge < 250) {
            ctx.fillStyle = `rgba(0,0,0,${1 - edge / 250})`;
            ctx.fillRect(0, 0, W, H);
        }
        text('タップでスキップ', W - 4, H - 12, { color: '#c8d0e0', size: 9, align: 'right' });
    }

    // ----- 物語のファイルが使う部品 -----

    // 決まった時刻に1回だけ効果音を鳴らす
    function soundAt(t, at, playSound) {
        if (!story || t < at || story.sounds[at]) return;
        story.sounds[at] = true;
        playSound();
    }

    // ナレーション (上の枠。キャラクターに重ならないように)
    function narration(lines) {
        const { W } = LcdKit.canvas();
        if (!lines.length) return;
        const bh = lines.length * 13 + 8;
        box(6, 6, W - 12, bh, 'rgba(0,0,16,0.8)', '#ffffff');
        lines.forEach((l, i) => text(l, 12, 10 + i * 13, { size: 11 }));
    }

    // 吹き出し。しっぽの先が (x, y)。side: 'left' はその左に、'above' はその上に出す
    function bubble(str, x, y, side = 'left') {
        const { ctx, W } = LcdKit.canvas();
        const size = 10;
        const w = textWidth(str, size) + 10, h = 16;
        let bx, by;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (side === 'above') {
            bx = Math.round(Math.max(4, Math.min(W - w - 4, x - w / 2)));
            by = Math.round(y - h - 5);
            ctx.moveTo(x - 3, by + h - 1);
            ctx.lineTo(x, y);
            ctx.lineTo(x + 3, by + h - 1);
        } else {
            bx = Math.round(Math.max(4, x - 6 - w));
            by = Math.round(y - h / 2);
            ctx.moveTo(bx + w - 1, by + 4);
            ctx.lineTo(x, y);
            ctx.lineTo(bx + w - 1, by + h - 4);
        }
        ctx.closePath();
        box(bx, by, w, h, '#ffffff', '#202030');
        ctx.fill();
        text(str, bx + 5, by + 3, { color: '#202030', size, outline: null });
    }

    return { register, play, skip, active, draw, soundAt, narration, bubble };
})();
