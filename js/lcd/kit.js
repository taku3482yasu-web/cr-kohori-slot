// =====================================================================
// 液晶の描画の部品 (文字・枠・線・イージング・折り返し)
// ---------------------------------------------------------------------
// Lcd.init が setCanvas で canvas の context・大きさ・設定を渡す。
// js/lcd/ のほかのファイルは、描くたびに LcdKit.canvas() から受け取る。
// =====================================================================

const LcdKit = (() => {
    const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';
    let ctx = null;
    let W = 0, H = 0;
    let config = null;

    function setCanvas(context, width, height, cfg) {
        ctx = context;
        W = width;
        H = height;
        config = cfg;
    }

    function canvas() {
        return { ctx, W, H, config };
    }

    function text(str, x, y, { color = '#fff', size = 12, align = 'left', outline = '#000' } = {}) {
        ctx.font = `${size}px ${FONT}`;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        if (outline) {
            ctx.fillStyle = outline;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(str, x + dx, y + dy);
        }
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
    }

    function textWidth(str, size) {
        ctx.font = `${size}px ${FONT}`;
        return Math.ceil(ctx.measureText(str).width);
    }

    function box(x, y, w, h, fill = 'rgba(0,0,0,0.65)', border = '#fff') {
        ctx.fillStyle = border;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = fill;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }

    function line(x0, y0, x1, y1, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }

    function burst(x, y, radius, rays, color, width = 2) {
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2;
            line(x + Math.cos(a) * radius * 0.4, y + Math.sin(a) * radius * 0.4,
                x + Math.cos(a) * radius, y + Math.sin(a) * radius, color, width);
        }
    }

    const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const fadeOut = (t, from = 0.75) => (t < from ? 1 : Math.max(0, (1 - t) / (1 - from)));

    // 文字ごとに区切って、maxWidth に収まるように折り返す
    function wrapText(str, size, maxWidth) {
        const lines = [''];
        for (const ch of str) {
            const last = lines[lines.length - 1];
            if (last && textWidth(last + ch, size) > maxWidth) lines.push(ch);
            else lines[lines.length - 1] = last + ch;
        }
        return lines;
    }

    return { FONT, setCanvas, canvas, text, textWidth, box, line, burst, ease, fadeOut, wrapText };
})();
