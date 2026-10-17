// =====================================================================
// 設定示唆トロフィー (RASH 終了時に液晶の左下に落ちてくる)
// ---------------------------------------------------------------------
// show(level) で出し、hide() で次のレバー ON に消す予約、液晶の毎フレームで draw(time) を呼ぶ。
// =====================================================================

const TrophyView = (() => {
    let ctx, H, config;
    let trophy = null;   // { level, born, until } (level: 示す設定「○以上」)

    // k: 縁 / h: ハイライト / #: 本体 / d: 影 / b: 台座
    const TROPHY_ART = [
        '..kkkkkkkkkk..',
        'kkkhh#####dkkk',
        'k.kh######dk.k',
        'k.kh######dk.k',
        '.kkh######dkk.',
        '...kh####dk...',
        '....kh##dk....',
        '.....k##k.....',
        '.....k##k.....',
        '....kh##dk....',
        '..kkkkkkkkkk..',
        '..kbbbbbbbbk..',
        '..kbbbbbbbbk..',
        '..kkkkkkkkkk..'
    ];

    // level: 示す設定 (出なかったときは null)
    function show(level) {
        ({ config } = LcdKit.canvas());
        if (!config.trophy.colors[level]) return;
        trophy = { level, born: performance.now(), until: Infinity };
        if (config.trophy.colors[level].rainbow) Sound.rainbow();
        else Sound.chance();
    }

    // 次のレバー ON で消す (出てから minShow ミリ秒は残す)
    function hide() {
        if (!trophy) return;
        trophy.until = Math.max(performance.now(), trophy.born + config.trophy.minShow);
    }

    function draw(time) {
        if (!trophy) return;
        ({ ctx, H, config } = LcdKit.canvas());
        if (time > trophy.until) {
            trophy = null;
            return;
        }
        const color = config.trophy.colors[trophy.level];
        const px = 2;
        const size = TROPHY_ART.length * px;
        const t = Math.max(0, performance.now() - trophy.born);
        // 上から落ちてきて少し弾む
        const drop = t < 300 ? (1 - t / 300) * -24 : t < 450 ? -Math.sin((t - 300) / 150 * Math.PI) * 4 : 0;
        const x = 6;
        const y = Math.round(H - size - 6 + drop);
        const fadeOut = Math.min(1, Math.max(0, (trophy.until - time) / 400));
        ctx.save();
        ctx.globalAlpha = fadeOut;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x + 2, H - 8, size - 4, 3);
        // 光の筋が斜めに通り過ぎる (1.6秒ごと)
        const glint = ((t % 1600) / 1600) * (size * 2.5) - size / 2;
        TROPHY_ART.forEach((row, r) => {
            [...row].forEach((c, col) => {
                if (c === '.') return;
                let fill;
                if (c === 'k') fill = '#1a1208';
                else if (c === 'b') fill = '#5a3a1a';
                else if (color.rainbow) {
                    const hue = (time / 5 + r * 25 + col * 12) % 360;
                    fill = `hsl(${hue}, 100%, ${c === 'h' ? 85 : c === 'd' ? 38 : 60}%)`;
                } else {
                    fill = c === 'h' ? color.light : c === 'd' ? color.dark : color.main;
                }
                if (c !== 'k' && c !== 'b' && Math.abs((col + r) * px - glint) < 3) fill = '#ffffff';
                ctx.fillStyle = fill;
                ctx.fillRect(x + col * px, y + r * px, px, px);
            });
        });
        // 6 (虹) はキラキラも出す
        if (color.rainbow) {
            for (let i = 0; i < 3; i++) {
                const phase = (time / 400 + i / 3) % 1;
                const sx = x + ((i * 11 + 3) % size);
                const sy = y + ((i * 7 + 2) % (size - 8));
                ctx.globalAlpha = fadeOut * (1 - phase);
                ctx.fillStyle = `hsl(${(time / 3 + i * 120) % 360}, 100%, 80%)`;
                ctx.fillRect(sx - 1, sy, 3, 1);
                ctx.fillRect(sx, sy - 1, 1, 3);
            }
        }
        ctx.restore();
    }

    return { show, hide, draw };
})();
