// =====================================================================
// RASH 終了画面 (設定示唆の1枚絵。RASH が終わって通常時に戻る前に液晶いっぱいに出す)
// ---------------------------------------------------------------------
// show(id) で出し、config.endCard.showTime ミリ秒たつと消えて Promise が終わる。
// 液晶の毎フレームで draw(time) を呼ぶ。どの絵が出るか (設定ごとの条件と重み) は state.js の EndCard
// =====================================================================

const EndCardView = (() => {
    const { text, burst, ease } = LcdKit;
    let ctx, W, H, config;

    let card = null;   // { id, start, until }
    const GROUND = 120;
    const FADE = 300;

    // 絵ごとの背景の色 (上・下) と、光の筋を出すか
    const THEMES = {
        normal: { top: '#ffb070', bottom: '#5a3a8a', ground: '#3a2a50' },
        oni: { top: '#8a2030', bottom: '#2a0a20', ground: '#1a0814' },
        strong: { top: '#c070ff', bottom: '#2a1060', ground: '#1a0a3a' },
        gold: { top: '#fff0a0', bottom: '#b07a10', ground: '#6a4a08', rays: '#fff6c0' },
        royal: { top: '#2a0a5a', bottom: '#8a4a10', ground: '#2a1408', rays: '#ffd700' }   // 金色のキャラクターが映えるよう暗め
    };
    const CARD_THEMES = {
        onioni: 'oni', okagappaHibiki: 'strong', sasakiShibata: 'strong', everyone: 'gold', goldDog: 'royal'
    };

    function show(id) {
        ({ config } = LcdKit.canvas());
        const now = performance.now();
        card = { id, start: now, until: now + config.endCard.showTime };
        if (THEMES[CARD_THEMES[id]]?.rays) Sound.rainbow();   // 設定6確定の絵
        return new Promise(resolve => setTimeout(resolve, config.endCard.showTime));
    }

    function drawBackground(theme, t) {
        const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
        sky.addColorStop(0, theme.top);
        sky.addColorStop(1, theme.bottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        if (theme.rays) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.translate(W / 2, GROUND - 40);
            ctx.rotate(t / 4000);
            burst(0, 0, W, 16, theme.rays, 6);
            ctx.restore();
        }
        ctx.fillStyle = theme.ground;
        ctx.fillRect(0, GROUND, W, H - GROUND);
        // 舞い落ちる紙ふぶき
        for (let i = 0; i < 18; i++) {
            const x = (i * 53 + Math.sin(t / 700 + i) * 10) % W;
            const y = ((t / 18 + i * 37) % (GROUND + 10)) - 5;
            ctx.fillStyle = ['#ffd700', '#ff7ae0', '#7fffd4', '#ffffff'][i % 4];
            ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
    }

    // ドット絵 (sprites.js) を足元の中央 (x, groundY) に合わせて描く。16 ドット幅で、いちばん下の1行は空き
    function sprite(name, frame, x, groundY, scale) {
        const rows = SPRITES[name].frames[frame];
        drawSprite(ctx, SPRITES[name], frame, Math.round(x - 8 * scale), Math.round(groundY - (rows.length - 1) * scale), scale);
    }

    function koori(x, groundY, scale, t) {
        const hop = Math.round(-Math.abs(Math.sin(t / 260)) * scale * 1.5);
        sprite('koori', Math.floor(t / 260) % 2 ? 'walk2' : 'walk1', x, groundY + hop, scale);
    }

    // 絵ごとの描き方 (t: 出てからの時間, f: 2コマのどちらか)
    const SCENES = {
        koori: (t) => koori(W / 2, GROUND, 4, t),
        yasu: (t, f) => Characters.drawCompanion(ctx, 'yasu', W / 2, GROUND, { scale: 3, frame: f }),
        tamu: (t, f) => Characters.drawCompanion(ctx, 'tamu', W / 2, GROUND, { scale: 3, frame: f }),
        dake: (t, f) => Characters.drawCompanion(ctx, 'dake', W / 2, GROUND, { scale: 3, frame: f }),
        furukawa: (t, f) => sprite('furukawa', f ? 'talk' : 'idle', W / 2, GROUND, 4),
        tomoishi: (t, f) => sprite('tomoishi', f ? 'shout' : 'idle', W / 2, GROUND, 4),
        onioni: (t, f) => Characters.drawEnemy(ctx, 'onioni', W / 2, GROUND, { scale: 2, frame: f }),
        okagappaHibiki: (t, f) => {
            Characters.drawEnemy(ctx, 'okagappa', 84, GROUND, { scale: 2, frame: f });
            Characters.drawEnemy(ctx, 'hibikimakuri', 174, GROUND, { scale: 2, frame: 1 - f });
        },
        sasakiShibata: (t, f) => {
            Characters.drawEnemy(ctx, 'sasaki', 84, GROUND, { scale: 2, frame: f });
            Characters.drawEnemy(ctx, 'shibata', 172, GROUND, { scale: 2, frame: 1 - f });
        },
        // 集合絵: 後ろに敵たち、前にこおりくんと仲間・ともいし・ふるカワ
        everyone: (t, f) => {
            ['okagappa', 'hibikimakuri', 'shibata', 'sasaki', 'onioni'].forEach((id, i) => {
                Characters.drawEnemy(ctx, id, 36 + i * 46, 92, { scale: 1, frame: (f + i) % 2 });
            });
            sprite('tomoishi', 'idle', 30, GROUND + 8, 2);
            Characters.drawCompanion(ctx, 'yasu', 70, GROUND + 8, { scale: 1.5, frame: f });
            koori(W / 2, GROUND + 8, 2.5, t);
            Characters.drawCompanion(ctx, 'tamu', 172, GROUND + 8, { scale: 1.5, frame: 1 - f });
            Characters.drawCompanion(ctx, 'dake', 200, GROUND + 8, { scale: 1.5, frame: f });
            sprite('furukawa', 'idle', 232, GROUND + 8, 2);
        },
        goldDog: (t, f) => Characters.drawEnemy(ctx, 'goldDog', W / 2, GROUND, { scale: 2.5, frame: f })
    };

    function draw(time) {
        if (!card) return;
        ({ ctx, W, H, config } = LcdKit.canvas());
        if (time > card.until) {
            card = null;
            return;
        }
        const t = time - card.start;
        ctx.save();
        ctx.globalAlpha = Math.min(ease(t / FADE), Math.max(0, (card.until - time) / FADE));
        paint(card.id, t);
        ctx.restore();
    }

    function paint(id, t) {
        drawBackground(THEMES[CARD_THEMES[id] || 'normal'], t);
        (SCENES[id] || SCENES.koori)(t, Math.floor(t / 300) % 2);
        text('おつかれさま！', W / 2, 6, { color: '#ffffff', size: 14, align: 'center', outline: '#2a1040' });
    }

    // 液晶以外の canvas (図鑑) に絵を描く。canvas は液晶と同じ大きさにする。t: 出てからの時間 (キャラクターの動き)
    function renderTo(target, id, t = 1000) {
        const lcd = LcdKit.canvas();
        target.width = lcd.W;
        target.height = lcd.H;
        // 文字などの部品 (LcdKit) も図鑑の canvas に描くよう、描くあいだだけ差し替える
        LcdKit.setCanvas(target.getContext('2d'), lcd.W, lcd.H, lcd.config);
        ({ ctx, W, H, config } = LcdKit.canvas());
        try {
            paint(id, t);
        } finally {
            LcdKit.setCanvas(lcd.ctx, lcd.W, lcd.H, lcd.config);
            ({ ctx, W, H, config } = LcdKit.canvas());
        }
    }

    return { show, draw, renderTo };
})();
