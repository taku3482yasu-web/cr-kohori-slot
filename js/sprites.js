// =====================================================================
// ドット絵データ (キャラクター・リール図柄)
// ---------------------------------------------------------------------
// キャラクターは「1文字 = 1ドット」の文字列で描き、パレットで色を割り当てる。
// '.' は透明。
// =====================================================================

// リール図柄の代替テキスト (画像の alt に使う。絵は下の SYMBOL_ART)
const SYMBOL_GLYPHS = {
    cherry: '🍒',
    replay: '🍋',
    melon: '🍉',
    bell: '🔔',
    diamond: '💎',
    seven: '7',
    bar: 'BAR'
};

const SPRITES = {
    // こおりくん (16x16): 氷のキューブの体
    koori: {
        palette: {
            o: '#1b3a6b',  // 輪郭
            w: '#ffffff',  // ハイライト
            c: '#bff0ff',  // 氷 (明)
            b: '#7fd3f7',  // 氷 (影)
            d: '#4aa8e0',  // 足
            k: '#10162a',  // 目・口
            p: '#ff9eb5'   // ほっぺ
        },
        frames: (() => {
            // 体 (両フレーム共通) + 足 (歩きの2コマ)
            const body = [
                '................',
                '.oooooooooooooo.',
                '.owwwcccccccbbo.',
                '.owwccccccccbbo.',
                '.owcccccccccbbo.',
                '.occckcccckccbo.',
                '.occckcccckccbo.',
                '.ocpcccccccpcbo.',
                '.occccckkccccbo.',
                '.occcccccccccbo.',
                '.obcccccccccbbo.',
                '.obbbbbbbbbbbdo.',
                '.oooooooooooooo.'
            ];
            // 負けたとき: 目が × になる
            const down = [...body];
            down[4] = '.owckckcckckbbo.';
            down[5] = '.occckcccckccbo.';
            down[6] = '.occkckcckckcbo.';
            return {
                down: [...down, '...odo....odo...', '...ooo....ooo...', '................'],
                walk1: [...body, '...odo....odo...', '...ooo....ooo...', '................'],
                walk2: [...body, '....odo..odo....', '....ooo..ooo....', '................']
            };
        })()
    },

    // ともいし (16x18): こおりくんのお母さん。パーマ頭の石に黄色いエプロン。idle と shout (口を開けて叫ぶ) の2コマ
    tomoishi: {
        palette: {
            o: '#2a2a30',  // 輪郭
            h: '#7a4ab0',  // パーマの髪
            H: '#a87ad8',  // 髪のつや
            G: '#d0d0da',  // 石 (明)
            g: '#a0a0ac',  // 石
            d: '#70707c',  // 石 (影)
            k: '#10162a',  // 目
            p: '#ff9eb5',  // ほっぺ
            m: '#c03048',  // 口
            a: '#ffe08a',  // エプロン
            A: '#d8a840',  // エプロンの影
            f: '#4a4a54'   // 足
        },
        frames: (() => {
            const top = [
                '...hHhhHhhHh....',
                '..hhhhhhhhhhhh..',
                '.hHhhhHhhhhHhhh.',
                '.hoooooooooooohh',
                '.oGGGgggggggggo.',
                'oGGgggggggggggdo',
                'oGgggkgggggkggdo',
                'oggggkgggggkggdo',
                'ogpgggggggggpgdo'
            ];
            // エプロン (肩ひもつき)
            const apron = [
                'oggaggggggggaddo',
                'oggaaaaaaaaaaddo',
                'odgaaaappaaaAddo',
                '.oddAAAAAAAAddo.',
                '..oooooooooooo..',
                '...ofo....ofo...',
                '...ooo....ooo...'
            ];
            return {
                idle: [...top, 'oggggggmmgggggdo', 'oggggggggggggddo', ...apron],
                // 口を縦に開けて叫ぶ
                shout: [...top, 'oggggmmmmmggggdo', 'oggggmmkmmgggddo', ...apron]
            };
        })()
    },

    // ふるカワ (16x20): リボンのボブヘアの女の子。idle と talk (口が開く) の2コマ
    furukawa: {
        palette: {
            o: '#2a1a1a',  // 輪郭
            h: '#7a4a2a',  // 髪
            H: '#b07a48',  // 髪のつや
            r: '#ff4f8b',  // リボン
            s: '#ffe2cc',  // 肌
            e: '#2a1830',  // 目
            w: '#ffffff',  // 目のハイライト
            p: '#ff9eb5',  // ほっぺ
            k: '#a03048',  // 口
            d: '#ff8ab8',  // 服
            D: '#e0609a',  // 服の影
            f: '#6a3a2a'   // くつ
        },
        frames: (() => {
            const head = [
                '....oooooooo....',
                '...ohhhhhhhhorr.',
                '..ohhHHhhhhhhorr',
                '..ohhhhhhhhhhho.',
                '.ohhhsssssshhhho',
                '.ohhsssssssshho.',
                '.ohssewssewssho.',
                '.ohsseessseesho.',
                '.ohspsssssspsho.'
            ];
            const body = [
                '..ohhsssssshhho.',
                '...oooddddooo...',
                '...odDddddDdo...',
                '..osdddrrdddso..',
                '..osddddddddso..',
                '...oDddddddDo...',
                '...oDDDDDDDDo...',
                '....oso..oso....',
                '....off..off....',
                '....ooo..ooo....'
            ];
            const mouth = '.ohhssskkssshho.';
            return {
                idle: [...head, mouth, ...body],
                // 口を縦に開ける (あごの行にも口を描く)
                talk: [...head, mouth, '..ohhsskksshhho.', ...body.slice(1)]
            };
        })()
    }
};

// 文字列のドット絵を ctx に描く。scale 倍、flip で左右反転
function drawSprite(ctx, sprite, frameName, x, y, scale = 1, flip = false) {
    const rows = sprite.frames[frameName];
    const width = rows[0].length;
    rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
            const color = sprite.palette[row[rx]];
            if (!color) continue;
            const px = flip ? width - 1 - rx : rx;
            // 端を丸めて隣のドットと隙間なくつなげる (拡大率が整数でなくても格子が出ない)
            const x0 = Math.round(x + px * scale), x1 = Math.round(x + (px + 1) * scale);
            const y0 = Math.round(y + ry * scale), y1 = Math.round(y + (ry + 1) * scale);
            ctx.fillStyle = color;
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
    });
}

// =====================================================================
// リール図柄のドット絵 (32x32 ドット)
// r(x, y, w, h, 色) で矩形、disc(cx, cy, 半径, 色) で円を描く
// =====================================================================
const SYMBOL_ART = {
    cherry(r, disc) {
        for (let k = 0; k < 13; k++) {
            r(Math.round(16 - k * 0.5), 5 + k, 2, 1, '#2f7a22');
            r(Math.round(16 + k * 0.5), 5 + k, 2, 1, '#2f7a22');
        }
        r(17, 3, 6, 3, '#4ab83a');
        r(18, 3, 3, 1, '#7ad86a');
        disc(10, 23, 6, '#8a0818');
        disc(10, 23, 5, '#d81830');
        disc(22, 23, 6, '#8a0818');
        disc(22, 23, 5, '#d81830');
        r(7, 20, 2, 2, '#ff8090');
        r(19, 20, 2, 2, '#ff8090');
    },
    replay(r) {
        // レモン (リプレイ)
        for (let y = -8; y <= 8; y++) {
            const half = Math.round(Math.sqrt(1 - (y * y) / 81) * 12);
            r(16 - half, 16 + y, half * 2, 1, '#c89a10');
            if (half > 1) r(17 - half, 16 + y, half * 2 - 2, 1, '#ffe030');
        }
        r(3, 15, 2, 2, '#c89a10');
        r(27, 15, 2, 2, '#c89a10');
        r(10, 11, 6, 2, '#fff8b0');
    },
    melon(r) {
        // スイカの切り身 (下向きの半円)
        for (let y = 0; y <= 14; y++) {
            const outer = Math.round(Math.sqrt(196 - y * y));
            const inner = Math.round(Math.sqrt(Math.max(0, 121 - y * y)));
            r(16 - outer, 9 + y, outer * 2, 1, '#1e6a1e');
            if (y <= 12) r(16 - outer + 1, 9 + y, outer * 2 - 2, 1, '#e8f8d8');
            if (y <= 11) r(16 - inner, 9 + y, inner * 2, 1, '#e83040');
        }
        [[10, 12], [16, 13], [22, 12], [13, 16], [19, 16], [16, 19]].forEach(([x, y]) => r(x, y, 1, 2, '#1a1a1a'));
        r(5, 9, 22, 1, '#ff7080');
    },
    bell(r, disc) {
        r(15, 3, 2, 2, '#a07a10');
        for (let y = 5; y <= 22; y++) {
            const half = Math.round(3 + (y - 5) * 0.55 + (y > 18 ? (y - 18) : 0));
            r(16 - half, y, half * 2, 1, '#a07a10');
            r(17 - half, y, half * 2 - 2, 1, '#ffd23a');
        }
        r(4, 23, 24, 3, '#a07a10');
        r(5, 23, 22, 2, '#ffe680');
        disc(16, 27, 2, '#a07a10');
        r(11, 8, 2, 9, '#fff4b0');
    },
    diamond(r) {
        for (let y = 7; y <= 12; y++) {
            const half = 6 + (y - 7) * 2;
            r(16 - half, y, half * 2, 1, '#5ad8ff');
        }
        for (let y = 13; y <= 28; y++) {
            const half = Math.round(16 - (y - 13) * 1.05);
            if (half > 0) r(16 - half, y, half * 2, 1, y % 3 ? '#2a9ad8' : '#5ad8ff');
        }
        r(12, 8, 8, 2, '#e0f8ff');
        r(10, 13, 4, 6, '#b8f0ff');
    },
    seven(r) {
        const stroke = (dx, dy, color) => {
            r(6 + dx, 4 + dy, 21, 6, color);
            for (let y = 10; y <= 27; y++) r(Math.round(21 - (y - 10) * 0.6) + dx, y + dy, 6, 1, color);
        };
        stroke(1, 1, '#5a0008');
        stroke(0, 0, '#e01020');
        r(7, 5, 18, 1, '#ff8a8a');
    },
    bar(r) {
        r(2, 8, 28, 16, '#000000');
        r(3, 9, 26, 14, '#ffffff');
        r(4, 10, 24, 12, '#1a1a1a');
        const letters = {
            B: ['####.', '#...#', '####.', '#...#', '####.'],
            A: ['.###.', '#...#', '#####', '#...#', '#...#'],
            R: ['####.', '#...#', '####.', '#..#.', '#...#']
        };
        ['B', 'A', 'R'].forEach((ch, i) => {
            letters[ch].forEach((row, ry) => {
                for (let rx = 0; rx < 5; rx++) if (row[rx] === '#') r(6 + i * 7 + rx, 13 + ry, 1, 1, '#ffffff');
            });
        });
    }
};

// 図柄の画像 (canvas と data URL) を作ってキャッシュする
const Symbols = (() => {
    const SIZE = 32;
    const cache = {};

    function canvas(id) {
        if (cache[id]) return cache[id];
        const c = document.createElement('canvas');
        c.width = SIZE;
        c.height = SIZE;
        const g = c.getContext('2d');
        const r = (x, y, w, h, color) => {
            g.fillStyle = color;
            g.fillRect(Math.round(x), Math.round(y), w, h);
        };
        const disc = (cx, cy, rad, color) => {
            for (let y = -rad; y <= rad; y++) {
                const half = Math.round(Math.sqrt(rad * rad - y * y));
                r(cx - half, cy + y, half * 2, 1, color);
            }
        };
        SYMBOL_ART[id](r, disc);
        cache[id] = c;
        return c;
    }

    return {
        SIZE,
        canvas,
        url: id => canvas(id).toDataURL()
    };
})();
