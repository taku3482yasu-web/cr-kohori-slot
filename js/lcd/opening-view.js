// =====================================================================
// オープニング (はじめて遊ぶとき・リセット・台移動のあとに液晶で流す短いストーリー)
// ---------------------------------------------------------------------
// 1. 遠賀川のほとりで、こおりくんと母・ともいしが暮らしている
// 2. おにおにが現れる
// 3. ともいしがさらわれる (「こおり！ お金返しなさ〜い！」)
// 4. タイトル「こおりくんの大冒険」
// 流す仕組みは story-view.js (StoryView.play('opening'))。
// =====================================================================

(() => {
    const { text, ease } = LcdKit;
    const { soundAt, narration, bubble } = StoryView;
    const MAP = 'ongagawa';
    const SCENES = [
        { end: 4000, lines: ['遠賀川のほとりで、こおりくんは', '母・ともいしと 平和に暮らしていた。'] },
        { end: 7500, lines: ['ある日、SE城の主', 'おにおにが 現れた…！'] },
        { end: 11000, lines: ['おにおには ともいしを', 'さらっていってしまった！'] }
    ];
    const ONI_IN = 4000, CARRY = 7500, TITLE = 11000, TOTAL = 15000;
    const TOMO_X = 112, ONI_X = 196;

    function drawStory(t) {
        const { ctx, W, H } = LcdKit.canvas();
        const ground = Backgrounds.get(MAP).groundY;
        const scroll = t < ONI_IN ? t * 0.02 : ONI_IN * 0.02;   // 平和なあいだは景色がゆっくり流れる
        Backgrounds.draw(ctx, MAP, scroll);

        // こおりくん: はじめはのんびり、おにおにが来たら飛び上がって驚き、さらわれたら追いかける
        let kx = 64, ky = 0, frame = 'walk1';
        if (t < ONI_IN) {
            ky = -Math.abs(Math.sin(t / 300)) * 3;
        } else if (t < CARRY) {
            const s = t - ONI_IN - 900;
            ky = s > 0 && s < 400 ? -Math.sin(s / 400 * Math.PI) * 12 : 0;
        } else {
            kx = 64 + ease((t - CARRY) / 2500) * 40;
            frame = Math.floor(t / 120) % 2 ? 'walk2' : 'walk1';
        }
        drawSprite(ctx, SPRITES.koori, frame, kx, ground - 32 + ky, 2);

        // おにおに: 右から現れて、ともいしを抱えて右へ去る
        let ox = W + 50;
        if (t >= ONI_IN && t < CARRY) ox = W + 50 - ease((t - ONI_IN) / 900) * (W + 50 - ONI_X);
        else if (t >= CARRY) ox = ONI_X + ease((t - CARRY - 1600) / 1800) * 120;
        soundAt(t, ONI_IN, () => Sound.bigHit());
        if (t >= ONI_IN && t < ONI_IN + 500) {
            ctx.fillStyle = `rgba(255,0,0,${0.5 * (1 - (t - ONI_IN) / 500)})`;
            ctx.fillRect(0, 0, W, H);
        }

        // ともいし: 抱えられて持ち上がる
        let tx = TOMO_X, ty = 0, tframe = 'idle';
        if (t < ONI_IN) {
            ty = -Math.abs(Math.sin(t / 300 + 1)) * 3;
        } else if (t >= ONI_IN + 900) {
            tframe = 'shout';
        }
        if (t >= CARRY) {
            const lift = ease((t - CARRY) / 800);
            tx = TOMO_X + (ox - 16 - TOMO_X) * lift;
            ty = -lift * 34;
        }
        Characters.drawEnemy(ctx, 'onioni', ox, ground, { scale: 1.5, frame: Math.floor(t / 300) % 2 });
        drawSprite(ctx, SPRITES.tomoishi, tframe, tx, ground - 36 + ty, 2);

        // ともいしのセリフ (顔の左に吹き出し)
        const face = ground - 22 + ty;
        if (t >= CARRY + 500 && t < CARRY + 2100) bubble('こおり！ お金返しなさ〜い！', tx - 2, face);
        else if (t >= ONI_IN + 900 && t < CARRY) bubble('あら…？', tx - 2, face);

        narration(SCENES.find(s => t < s.end).lines);
    }

    function drawTitle(t) {
        const { ctx, W, H } = LcdKit.canvas();
        const s = t - TITLE;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        soundAt(t, TITLE + 300, () => Sound.fanfare());
        const hop = -Math.abs(Math.sin(s / 220)) * 10;
        drawSprite(ctx, SPRITES.koori, Math.floor(s / 220) % 2 ? 'walk2' : 'walk1', W / 2 - 16, 88 + hop, 2);
        ctx.globalAlpha = Math.min(1, s / 600);
        text('こおりくんの大冒険', W / 2, 26, { color: '#ffd700', size: 20, align: 'center', outline: '#4a3000' });
        if (s > 900) {
            ctx.globalAlpha = Math.min(1, (s - 900) / 500);
            text('〜ともいしを取り戻せ！〜', W / 2, 56, { color: '#9fe6ff', size: 12, align: 'center' });
        }
        ctx.globalAlpha = 1;
    }

    StoryView.register('opening', {
        total: TOTAL,
        fades: [TITLE],
        draw: t => (t < TITLE ? drawStory(t) : drawTitle(t))
    });
})();
