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

    function show(talk) {
        ({ config } = LcdKit.canvas());
        const now = performance.now();
        furukawa = { ...talk, lines: wrapText(talk.text, BUBBLE_FONT, 150), start: now, until: now + config.furukawa.talkTime };
        Sound.talk();
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
            const bx = x - bw - 6, by = H - bh - 16;
            box(bx, by, bw, bh, 'rgba(12,12,32,0.9)', '#ffffff');
            // しっぽ (ふるカワの顔のほうへ)
            const ty = by + bh - 10;
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
