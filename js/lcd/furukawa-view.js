// =====================================================================
// ふるカワ (液晶の右下に出てきて、左に吹き出しをだしてしゃべる)
// ---------------------------------------------------------------------
// show(talk) で出し (talk は Furukawa.talk の結果)、hide() で消す。液晶の毎フレームで draw(time) を呼ぶ。
// =====================================================================

const FurukawaView = (() => {
    const { text, textWidth, box, wrapText } = LcdKit;
    let ctx, W, H, config;

    let furukawa = null;   // { text, color, lines, start, until } (color: 0:白 〜 6:虹)
    const FURUKAWA_SCALE = 2;
    const BUBBLE_FONT = 10;
    const BUBBLE_LINE = 12;
    // 1行の幅 (ドット)。こおりくん (液晶の左寄り、地面は y=120 付近) にかからないよう、吹き出しは地面より下の帯に出し、
    // 1行を長めにして2行になりにくくする (たいていのセリフは1行に収まる)
    const BUBBLE_WIDTH = 170;

    function show(talk) {
        ({ config } = LcdKit.canvas());
        const now = performance.now();
        furukawa = { ...talk, lines: wrap(talk.text), start: now, until: now + config.furukawa.talkTime };
        Sound.talk();
    }

    // 折り返し。2行以上になるときは行の長さをそろえる (「？」だけが次の行に回らないように。吹き出しの幅も狭くなる)
    function wrap(str) {
        const lines = wrapText(str, BUBBLE_FONT, BUBBLE_WIDTH);
        if (lines.length < 2) return lines;
        const balanced = wrapText(str, BUBBLE_FONT, Math.ceil(textWidth(str, BUBBLE_FONT) / lines.length) + BUBBLE_FONT);
        // 句読点・「！？…♪」などは行の頭に置かず、前の行の終わりに付ける
        for (let i = 1; i < balanced.length; i++) {
            while (/^[、。，．！？!?…♪〜ー）」』]/.test(balanced[i])) {
                balanced[i - 1] += balanced[i][0];
                balanced[i] = balanced[i].slice(1);
            }
        }
        return balanced.filter(line => line);
    }

    function hide() {
        furukawa = null;
    }

    function draw(time) {
        if (!furukawa) return;
        ({ ctx, W, H, config } = LcdKit.canvas());
        if (time > furukawa.until) {
            furukawa = null;
            return;
        }
        const t = time - furukawa.start;
        const w = 16 * FURUKAWA_SCALE, h = 20 * FURUKAWA_SCALE;
        const rise = Math.min(1, t / 180);   // 下からぴょこっと出てくる
        const x = W - w - 4;
        const y = H - h + Math.round((1 - rise) * h);
        ctx.globalAlpha = Math.min(1, (furukawa.until - time) / 250);
        const talking = t < config.furukawa.talkTime - 800 && Math.floor(t / 140) % 2 === 0;
        drawSprite(ctx, SPRITES.furukawa, talking ? 'talk' : 'idle', x, y, FURUKAWA_SCALE);

        if (rise >= 1) {
            const lines = furukawa.lines;
            const bw = Math.max(...lines.map(l => textWidth(l, BUBBLE_FONT))) + 12;
            const bh = lines.length * BUBBLE_LINE + 8;
            const bx = x - bw - 6, by = H - bh - 2;   // 下の端にそろえる (地面より下の帯)
            box(bx, by, bw, bh, 'rgba(12,12,32,0.9)', '#ffffff');
            // しっぽ (ふるカワの顔のほうへ)
            const ty = Math.max(by + 3, Math.min(by + bh - 10, H - 30));   // ふるカワの顔に近い高さ (吹き出しの中で)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(bx + bw - 1, ty);
            ctx.lineTo(bx + bw + 6, ty + 5);
            ctx.lineTo(bx + bw - 1, ty + 7);
            ctx.closePath();
            ctx.fill();
            const color = config.furukawa.colors[furukawa.color];
            lines.forEach((line, i) => {
                const ly = by + 4 + i * BUBBLE_LINE;
                if (color !== 'rainbow') {
                    text(line, bx + 6, ly, { color, size: BUBBLE_FONT });
                    return;
                }
                // 虹: 1文字ずつ色を流す
                let cx = bx + 6;
                [...line].forEach((ch, k) => {
                    text(ch, cx, ly, { color: `hsl(${(time / 3 + (i * 8 + k) * 30) % 360}, 100%, 65%)`, size: BUBBLE_FONT });
                    cx += textWidth(ch, BUBBLE_FONT);
                });
            });
        }
        ctx.globalAlpha = 1;
    }

    return { show, hide, draw };
})();
