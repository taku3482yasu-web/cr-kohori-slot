// =====================================================================
// 通常時の予告の絵 (ステップアップ予告・群予告) と、こおりチャンスタイムの飾り
// ---------------------------------------------------------------------
// ユーザー指定 2026-10-23: 通常時が長くなったので演出を増やす。パチンコのステップアップ予告・群予告を写した。
// どれを出すかは Notice.pick (js/notice.js) が役で決める。カットインは lcd.js のカットインを使う。
// LcdKit.setCanvas のあとに使う。t はミリ秒 (performance.now)
// =====================================================================

const NoticeView = (() => {
    const K = LcdKit;
    let stepUp = null;   // { start, steps, textColor, series }
    let gun = null;      // { start, who }

    function drawWho(ctx, who, x, ground, scale, frame) {
        if (who === 'koori' || who === 'tomoishi' || who === 'furukawa') {
            const sprite = SPRITES[who];
            const name = who === 'koori' ? (frame ? 'walk2' : 'walk1') : who === 'tomoishi' ? (frame ? 'shout' : 'idle') : (frame ? 'talk' : 'idle');
            const rows = sprite.frames[name];
            drawSprite(ctx, sprite, name, Math.round(x - rows[0].length * scale / 2), Math.round(ground - rows.length * scale), scale);
        } else {
            // 仲間・敵は絵の大きさがまちまちなので、こおりくんより少し大きいくらいの高さにそろえる
            const s = (16 * scale * 1.15) / Characters.size(who).h;
            if (Characters.isCompanion(who)) Characters.drawCompanion(ctx, who, x, ground, { scale: s, frame });
            else Characters.drawEnemy(ctx, who, x, ground, { scale: s, frame });
        }
    }

    // ----- ステップアップ予告: キャラが1段ずつ下から積み上がる。3段目の文字が赤ならチャンス、金なら激アツ -----
    function playStepUp(notice, config) {
        stepUp = { start: performance.now(), ...notice, stepMs: config.notice.stepUp.stepMs, colors: config.notice.stepUp.textColors };
        for (let i = 0; i < notice.steps; i++) {
            setTimeout(() => {
                if (!stepUp) return;
                const last = i === 2;
                if (last && notice.textColor === 'gold') Sound.fanfare();
                else if (last && notice.textColor === 'red') Sound.chance();
                else Sound.stop(2 - i);
            }, i * stepUp.stepMs);
        }
        return stepUp.stepMs * notice.steps + 500;
    }

    function drawStepUp(ctx, time) {
        if (!stepUp) return;
        const { W } = K.canvas();
        const age = time - stepUp.start;
        const total = stepUp.stepMs * stepUp.steps + 500;
        if (age > total) {
            stepUp = null;
            return;
        }
        const fade = age > total - 250 ? (total - age) / 250 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        for (let i = 0; i < stepUp.steps; i++) {
            const k = (age - i * stepUp.stepMs) / 180;
            if (k < 0) break;
            const slide = Math.max(0, 1 - k);
            const y = 96 - i * 30;
            const x = Math.round(slide * W);
            const [who, line] = stepUp.series[i];
            const last = i === 2;
            const color = last ? stepUp.colors[stepUp.textColor] : '#ffffff';
            const border = last && stepUp.textColor === 'gold' ? '#ffd040' : last && stepUp.textColor === 'red' ? '#ff3a3a' : '#9fb8d8';
            K.box(x + 8, y, W - 16, 26, 'rgba(10,10,30,0.85)', border);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 9, y + 1, 40, 24);
            ctx.clip();
            drawWho(ctx, who, x + 29, y + 30, 1.5, Math.floor(time / 200) % 2);
            ctx.restore();
            K.text(`STEP${i + 1}`, x + 54, y + 2, { color: '#9fb8d8', size: 8, outline: null });
            K.text(line, x + 54, y + 11, { color, size: 12, outline: '#000' });
        }
        ctx.restore();
    }

    // ----- 群予告: キャラの群れが画面を右から左へ横切る -----
    function playGun(notice, config) {
        gun = { start: performance.now(), who: notice.who, ms: config.notice.gun.ms, name: config.notice.gun.names[notice.who] };
        Sound.noise(0.6, 0.08);
        if (notice.who === 'hibikimakuri') setTimeout(() => Sound.rainbow(), 300);
        else Sound.chance();
        return gun.ms;
    }

    function drawGun(ctx, time) {
        if (!gun) return;
        const { W, H } = K.canvas();
        const k = (time - gun.start) / gun.ms;
        if (k >= 1) {
            gun = null;
            return;
        }
        if (gun.who === 'hibikimakuri') {
            ctx.fillStyle = `hsla(${(time / 4) % 360}, 90%, 50%, 0.18)`;
            ctx.fillRect(0, 0, W, H);
        }
        for (let i = 0; i < 16; i++) {
            const row = i % 4;
            const x = W + 30 - k * (W + 140) * 1.4 + (i * 37) % 120 + row * 14;
            const ground = 52 + row * 24 + ((i * 7) % 5);
            drawWho(ctx, gun.who, x, ground, 1.3, Math.floor(time / 90 + i) % 2);
        }
        K.text(`${gun.name}!!`, W / 2, 8, {
            color: gun.who === 'hibikimakuri' ? `hsl(${(time / 3) % 360}, 95%, 62%)` : '#ffe45a', size: 16, align: 'center', outline: '#000'
        });
    }

    // ----- こおりチャンスタイム: 上の帯と、きらきら -----
    function drawChanceTime(ctx, time, ct, multiplier) {
        if (!ct) return;
        const { W } = K.canvas();
        for (let i = 0; i < 20; i++) {
            const x = (i * 61 + time * 0.03) % W;
            const y = 24 + (i * 29 + time * 0.02 * (1 + i % 3)) % 90;
            ctx.fillStyle = i % 2 ? '#ffe45a' : '#ff8ad8';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time / 150 + i);
            ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
        ctx.globalAlpha = 1;
        const label = `CHANCE TIME  残り${ct.remaining}G  ポイント×${multiplier}`;
        const bw = K.textWidth(label, 10) + 14;
        const blink = Math.floor(time / 300) % 2;
        K.box(Math.round((W - bw) / 2), 22, bw, 15, 'rgba(90,0,60,0.85)', blink ? '#ffe45a' : '#ff8ad8');
        K.text(label, W / 2, 24, { color: blink ? '#ffffff' : '#ffe45a', size: 10, align: 'center', outline: null });
    }

    function draw(ctx, time) {
        drawStepUp(ctx, time);
        drawGun(ctx, time);
    }

    function clear() {
        stepUp = null;
        gun = null;
    }

    return { playStepUp, playGun, draw, drawChanceTime, drawWho, clear };
})();
