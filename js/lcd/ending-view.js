// =====================================================================
// エンディング (SUPERおにおにRASH 中におにおにを撃破すると流れる。SUPER 1回につき1回)
// ---------------------------------------------------------------------
// 1. おにおにを倒し、ともいしを助け出す (ともいしが駆け寄ってくる)
// 2. 感動の再会 (ハートが舞う。「こおり…！ 会いたかったわ！」)
// 3. …と思ったら怒られる (「それはそれとして、お金返しなさい！」「内定もまだなの!?」)
// 4. 通学路を逃げるこおりくんと、追いかけるともいし。「こおりくんの冒険は まだまだ続く…！」
// 流す仕組みは story-view.js (StoryView.play('ending'))。
// =====================================================================

(() => {
    const { text, ease } = LcdKit;
    const { soundAt, narration, bubble } = StoryView;
    const HALL = 'goldHall', FIELD = 'tsugakuro';
    const REUNION = 4000, SCOLD = 7500, CHASE = 11500, TOTAL = 17000;
    const KOORI_X = 64, TOMO_X = 112;

    function narrationAt(t) {
        if (t < REUNION) return ['おにおにを倒し、ついに', 'ともいしを 助け出した！'];
        if (t < SCOLD) return ['感動の再会…！'];
        if (t < CHASE) return ['…と思ったら、', 'めちゃくちゃ怒られた。'];
        return ['こおりくんの冒険は', 'まだまだ続く…！'];
    }

    // 小さなハート (5x4 ドットを scale 倍)
    function heart(ctx, x, y, scale, alpha) {
        const rows = ['.#.#.', '#####', '.###.', '..#..'];
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff6a9a';
        rows.forEach((row, ry) => [...row].forEach((c, rx) => {
            if (c === '#') ctx.fillRect(Math.round(x + rx * scale), Math.round(y + ry * scale), scale, scale);
        }));
        ctx.globalAlpha = 1;
    }

    function drawHall(t, time) {
        const { ctx, W, H } = LcdKit.canvas();
        const ground = Backgrounds.get(HALL).groundY;
        Backgrounds.draw(ctx, HALL, 0);
        soundAt(t, 300, () => Sound.fanfare());

        // 倒れたおにおに (右に横たわって、目を回している)
        ctx.save();
        ctx.translate(176, ground - 25);
        ctx.rotate(Math.PI / 2);
        Characters.drawEnemy(ctx, 'onioni', 0, 0, { scale: 1.2, alpha: 0.85 });
        ctx.restore();
        for (let i = 0; i < 3; i++) {
            const a = time / 300 + (i / 3) * Math.PI * 2;
            text('★', 214 + Math.cos(a) * 12, ground - 44 + Math.sin(a) * 4, { color: '#ffe45a', size: 8, outline: null });
        }

        // こおりくん: 再会で跳ねる。怒られたら後ずさりして汗
        let kx = KOORI_X, ky = 0;
        if (t >= REUNION && t < SCOLD) ky = -Math.abs(Math.sin((t - REUNION) / 260)) * 6;
        if (t >= SCOLD + 300) kx = KOORI_X - ease((t - SCOLD - 300) / 400) * 20;
        drawSprite(ctx, SPRITES.koori, 'walk1', kx, ground - 32 + ky, 2);
        if (t >= SCOLD + 300) {
            ctx.fillStyle = '#7fd3f7';
            const drip = ((t - SCOLD) / 12) % 10;
            ctx.fillRect(kx + 30, ground - 34 + drip, 2, 3);
            ctx.fillRect(kx - 2, ground - 30 + drip * 0.7, 2, 3);
        }

        // ともいし: 右から駆け寄ってくる → 再会で跳ねる → 怒って叫ぶ
        let tx = TOMO_X, ty = 0, tframe = 'idle';
        if (t < 1500) {
            tx = W + 20 - ease(t / 1500) * (W + 20 - TOMO_X);
            ty = -Math.abs(Math.sin(t / 90)) * 3;
        } else if (t >= REUNION && t < SCOLD) {
            ty = -Math.abs(Math.sin((t - REUNION) / 260 + 0.6)) * 6;
        } else if (t >= SCOLD) {
            tframe = 'shout';
            tx = TOMO_X + (Math.floor(t / 60) % 2 ? 1 : -1);   // 怒りでぷるぷる震える
        }
        drawSprite(ctx, SPRITES.tomoishi, tframe, tx, ground - 36 + ty, 2);

        // 再会: ハートが舞う
        if (t >= REUNION && t < SCOLD) {
            for (let i = 0; i < 6; i++) {
                const p = ((t - REUNION) / 1600 + i / 6) % 1;
                heart(ctx, 99 + Math.sin(i * 2.1 + p * 6) * 6, ground - 34 - p * 50, 2, 1 - p);   // 2人のあいだから立ちのぼる
            }
        }
        // 怒り: 頭の上に「ムカッ」と赤いフラッシュ
        if (t >= SCOLD) {
            soundAt(t, SCOLD, () => Sound.bigHit());
            if (t < SCOLD + 400) {
                ctx.fillStyle = `rgba(255,40,40,${0.45 * (1 - (t - SCOLD) / 400)})`;
                ctx.fillRect(0, 0, W, H);
            }
            text('ムカッ', tx + 30, ground - 52, { color: '#ff3a3a', size: 10 });
        }

        // セリフ (頭の上に吹き出し)
        const head = ground - 38 + ty;
        if (t >= 1700 && t < REUNION) bubble('こおり〜！', tx + 16, head, 'above');
        else if (t >= REUNION + 300 && t < SCOLD) bubble('こおり…！ 会いたかったわ！', tx + 16, head, 'above');
        else if (t >= SCOLD + 200 && t < SCOLD + 2200) bubble('それはそれとして、お金返しなさい！', tx + 16, head, 'above');
        else if (t >= SCOLD + 2200 && t < CHASE - 200) bubble('内定もまだなの!?', tx + 16, head, 'above');

        narration(narrationAt(t));
    }

    // 通学路を逃げるこおりくんと、追いかけるともいし
    function drawChase(t) {
        const { ctx, W } = LcdKit.canvas();
        const s = t - CHASE;
        const ground = Backgrounds.get(FIELD).groundY;
        Backgrounds.draw(ctx, FIELD, s * 0.08);
        const run = Math.floor(s / 100) % 2;
        drawSprite(ctx, SPRITES.koori, run ? 'walk2' : 'walk1', 150, ground - 32 - (run ? 2 : 0), 2);
        drawSprite(ctx, SPRITES.tomoishi, 'shout', 70 + Math.sin(s / 300) * 6, ground - 36 - (run ? 0 : 2), 2);
        bubble('待ちなさ〜い！', 86, ground - 38, 'above');
        narration(narrationAt(t));
        if (s > 2500) {
            ctx.globalAlpha = Math.min(1, (s - 2500) / 600);
            ctx.fillStyle = 'rgba(0,0,16,0.6)';
            ctx.fillRect(0, 42, W, 20);
            text('THANK YOU FOR PLAYING', W / 2, 46, { color: '#ffd700', size: 12, align: 'center', outline: '#4a3000' });
            ctx.globalAlpha = 1;
        }
    }

    StoryView.register('ending', {
        total: TOTAL,
        fades: [CHASE],
        draw: (t, time) => (t < CHASE ? drawHall(t, time) : drawChase(t))
    });
})();
