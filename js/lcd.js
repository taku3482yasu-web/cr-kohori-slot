// =====================================================================
// 液晶演出: canvas にドット絵で描画する
// ---------------------------------------------------------------------
// requestAnimationFrame で毎フレーム描き直す。
// state は読むだけで書き換えない。演出の進行は playEvents(events) が Promise で返し、
// main.js は演出の終了を待ってから次のゲームを許可する。
//
// state は1ゲームの結果で先に更新されるため、液晶は「今どの場面を見せているか」(scene) を
// 自分で持ち、演出の区切りで切り替える (例: 突入した瞬間 state は RASH だが、門が開くまでは城を見せる)。
// =====================================================================

const Lcd = (() => {
    const FONT = '"DotGothic16", "MS Gothic", "Osaka-Mono", monospace';
    const WALK_SPEED = 0.03;   // 背景のスクロール速度 (px / ms)
    const KOORI_HOME_X = 40;
    const KOORI_SCALE = 2;
    const CASTLE_GATE = { x: 170, y: 92, w: 16, h: 12 };   // backgrounds.js の城門の位置
    const KOORI_BATTLE_X = 44;
    const ENEMY_X = 190;
    const RASH_COLOR = '#ff3030';
    const SUPER_COLOR = '#ffd700';

    // 場面: field (通常時のマップ) / challenge (城突入チャレンジ) / entry (突入演出中) / rash
    let scene = 'field';
    let canvas, ctx, config, state;
    let W, H;
    let scroll = 0;
    let lastTime = 0;
    let displayMap = null;     // 液晶に表示中のマップ
    let message = null;        // { text, color, until }
    let popups = [];           // { text, color, born }
    let titleCard = null;      // { text, sub, color, until }
    let wipe = null;           // { start, duration, closing }
    let letterbox = 0;         // ムービー風の上下の黒帯 (0〜1)
    let letterboxTarget = 0;
    let flash = null;          // { color, start, duration }
    let shake = null;          // { amp, start, duration }
    let pendingScene = null;   // 次のマップ切り替えの暗転中に切り替える場面
    let bigLogo = null;        // RASH ロゴの大きな表示 { text, sub, color, size, start, until }
    let roulette = null;       // 対戦相手ルーレット { names, start, stopAt, final }
    let damageNumbers = [];    // { text, color, size, born }
    let logoSuper = false;     // ロゴを SUPER (金色) で表示するか
    let reachView = null;      // リーチ表示 { symbol, start }
    let preview = 0;           // 先読みの雪 (0: なし / 1: 白 / 2: 金)
    let cutIn = null;          // カットイン { who, text, color, start, duration }
    let bubbles = null;        // ポイントチャンスの吹き出し { values: [左, 右], cursor, chosen, decided }
    let freeze = null;         // ロングフリーズ { phase: 'still' | 'noise' | 'black' | 'rainbow', snapshot, start }

    // 時間で値が変わるアニメーション値 (描画時に時刻から計算するので、フレームの抜けに強い)
    const koori = { x: animated(KOORI_HOME_X), jump: animated(0), moving: false, visible: true };
    const gate = animated(0);  // 城門の開き具合 (0〜1)
    // BATTLE の表示 (state とは別に、演出の進行に合わせて更新する)
    const battle = {
        enemyId: null,
        visible: false,
        x: animated(ENEMY_X),
        drop: animated(0),
        alpha: animated(1),
        hp: animated(0),
        maxHp: 0,
        games: null,           // 残りゲーム数 (数値 or '？？')
        defeats: 0,            // 表示中の撃破数
        breakActive: false,    // ブレイク状態 (表示用)
        probUpGames: 0,        // 柄揃い確率アップの残りゲーム数 (表示用)
        probUpMultiplier: 1,
        hurtUntil: 0
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function animated(value) {
        return { from: value, to: value, start: 0, duration: 0 };
    }

    function valueAt(a, time = performance.now()) {
        if (a.duration <= 0 || time >= a.start + a.duration) return a.to;
        const k = Math.max(0, (time - a.start) / a.duration);
        return a.from + (a.to - a.from) * k;
    }

    function animateTo(a, to, duration) {
        const now = performance.now();
        a.from = valueAt(a, now);
        a.to = to;
        a.start = now;
        a.duration = duration;
        return sleep(duration);
    }

    function setNow(a, value) {
        a.from = a.to = value;
        a.duration = 0;
    }

    function init(canvasEl, cfg, gameState) {
        canvas = canvasEl;
        config = cfg;
        state = gameState;
        ({ width: W, height: H } = cfg.effects.lcd);
        canvas.width = W;
        canvas.height = H;
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        syncWithState();
        requestAnimationFrame(loop);
    }

    // state に合わせて場面をそろえる (起動時・デバッグ遷移時)
    function syncWithState() {
        displayMap = state.normal.map;
        letterboxTarget = 0;
        bubbles = null;
        setNow(gate, 0);
        koori.visible = true;
        koori.moving = false;
        if (StateMachine.isRashMode(state)) {
            scene = 'rash';
            logoSuper = state.mode === MODES.SUPER_RASH;
            setNow(koori.x, KOORI_BATTLE_X);
            const rash = state.rash;
            battle.enemyId = rash.enemyId;
            battle.visible = Boolean(rash.enemyId);
            battle.maxHp = rash.enemyMaxHp;
            setNow(battle.hp, rash.enemyHp);
            setNow(battle.x, ENEMY_X);
            setNow(battle.alpha, 1);
            setNow(battle.drop, 0);
            battle.defeats = rash.defeatCount;
            battle.probUpGames = rash.probUpGames;
            battle.probUpMultiplier = rash.probUpMultiplier;
            battle.breakActive = rash.breakActive;
            battle.games = rash.phase === RASH_PHASES.QUESTION ? '？？' : (rash.enemyId ? rash.gamesRemaining : null);
        } else if (state.mode === MODES.CASTLE_CHALLENGE) {
            scene = 'challenge';
            setNow(koori.x, 112);
        } else {
            scene = 'field';
            setNow(koori.x, KOORI_HOME_X);
        }
    }

    // ----- 描画ループ -----
    function loop(time) {
        const dt = Math.min(50, time - lastTime);
        lastTime = time;
        if (isWalking()) scroll += dt * WALK_SPEED;
        letterbox += (letterboxTarget - letterbox) * Math.min(1, dt / 120);
        draw(time);
        requestAnimationFrame(loop);
    }

    function isWalking() {
        return scene === 'field' && displayMap !== config.map.castle && !wipe && !bubbles;
    }

    function draw(time) {
        if (freeze) {
            drawFreeze(time);
            return;
        }
        ctx.save();
        if (shake && time < shake.start + shake.duration) {
            const amp = shake.amp;
            ctx.translate(Math.round((Math.random() * 2 - 1) * amp), Math.round((Math.random() * 2 - 1) * amp));
        }
        if (scene === 'rash') {
            drawRash(time);
        } else {
            Backgrounds.draw(ctx, displayMap, scroll);
            if (displayMap === config.map.castle) {
                drawTorches(time);
                drawGate(time);
            }
            drawKoori(time);
            drawBubbles(time);
            if (scene === 'field') drawNormalHud(time);
            if (scene === 'challenge') drawChallengeHud(time);
        }
        ctx.restore();
        drawPopups(time);
        drawMessage(time);
        drawPreview(time);
        drawReach(time);
        drawLetterbox();
        drawCutIn(time);
        drawRoulette(time);
        drawBigLogo(time);
        drawTitleCard(time);
        drawWipe(time);
        drawFlash(time);
    }

    // ----- 文字・枠 -----
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

    // ----- キャラクター・背景の動くもの -----
    function drawKoori(time) {
        if (!koori.visible) return;
        const bg = Backgrounds.get(displayMap);
        const moving = isWalking() || koori.moving;
        const frame = moving && Math.floor(time / 140) % 2 ? 'walk2' : 'walk1';
        const bob = moving && frame === 'walk2' ? -1 : 0;
        const size = 16 * KOORI_SCALE;
        const x = valueAt(koori.x, time);
        const jump = valueAt(koori.jump, time);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 4, bg.groundY - 2, size - 8, 3);
        drawSprite(ctx, SPRITES.koori, frame, x, bg.groundY - size + bob + jump, KOORI_SCALE);
    }

    // ポイントチャンス: こおりくんの頭上に2つの吹き出し
    const BUBBLE_X = [24, 104];
    const BUBBLE_Y = 34;
    function drawBubbles(time) {
        if (!bubbles) return;
        const bg = Backgrounds.get(displayMap);
        const tailX = valueAt(koori.x, time) + 16;
        const tailY = bg.groundY - 16 * KOORI_SCALE - 6;
        bubbles.values.forEach((value, i) => {
            const x = BUBBLE_X[i], w = 72, h = 30;
            const active = bubbles.decided ? i === bubbles.chosen : i === bubbles.cursor;
            const dim = bubbles.decided && i !== bubbles.chosen;
            const big = value === bubbles.big;
            const blink = Math.floor(time / 120) % 2;
            const border = dim ? '#666' : active ? (bubbles.decided && big ? (blink ? '#ffd700' : '#fff') : '#ffe45a') : '#bbb';
            const fill = dim ? 'rgba(40,40,40,0.8)' : bubbles.decided && i === bubbles.chosen ? (big ? '#fff2a0' : '#e8f4ff') : '#ffffff';
            // しっぽ (こおりくんの頭へ)
            ctx.fillStyle = border;
            const fromX = x + w / 2;
            for (let k = 0; k <= 6; k++) {
                const px = Math.round(fromX + (tailX - fromX) * (k / 6) * 0.5);
                ctx.fillRect(px - 1, BUBBLE_Y + h + k * 2, 3, 2);
            }
            box(x, BUBBLE_Y, w, h, fill, border);
            if (active && !bubbles.decided) {
                ctx.fillStyle = '#ffe45a';
                ctx.fillRect(x - 2, BUBBLE_Y - 2, w + 4, 2);
                ctx.fillRect(x - 2, BUBBLE_Y + h, w + 4, 2);
            }
            text(`+${value}`, x + w / 2, BUBBLE_Y + 6, {
                color: dim ? '#888' : big ? '#d03020' : '#2050c0', size: 16, align: 'center', outline: null
            });
            text('CP', x + w - 6, BUBBLE_Y + 16, { color: dim ? '#777' : '#555', size: 10, align: 'right', outline: null });
        });
    }

    function drawTorches(time) {
        drawFlames(Backgrounds.get(config.map.castle).torches, time);
    }

    function drawFlames(points, time) {
        const flicker = Math.floor(time / 90) % 3;
        points.forEach(({ x, y }) => {
            const glow = ctx.createRadialGradient(x + 1, y, 1, x + 1, y, 18);
            glow.addColorStop(0, 'rgba(255,160,40,0.35)');
            glow.addColorStop(1, 'rgba(255,120,20,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(x - 18, y - 18, 38, 36);
            ctx.fillStyle = '#ff5a1a';
            ctx.fillRect(x - 2, y - 2 - flicker, 7, 6 + flicker);
            ctx.fillStyle = '#ffc040';
            ctx.fillRect(x - 1, y - flicker, 5, 4 + flicker);
            ctx.fillStyle = '#fff4a0';
            ctx.fillRect(x, y + 1, 3, 2);
        });
    }

    // 城門 (左右に開く扉。開くと中から光が漏れる)
    function drawGate(time) {
        const { x, y, w, h } = CASTLE_GATE;
        const open = valueAt(gate, time);
        if (open > 0) {
            ctx.fillStyle = '#fff4c0';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = `rgba(255,240,180,${0.35 * open})`;
            ctx.fillRect(x - 12, y - 10, w + 24, h + 10);
        }
        const doorW = Math.round((w / 2) * (1 - open));
        if (doorW <= 0) return;
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x, y, doorW, h);
        ctx.fillRect(x + w - doorW, y, doorW, h);
        ctx.fillStyle = '#c8a040';
        for (let sy = y + 2; sy < y + h; sy += 4) {
            if (doorW > 2) ctx.fillRect(x + doorW - 3, sy, 1, 1);
            if (doorW > 2) ctx.fillRect(x + w - doorW + 2, sy, 1, 1);
        }
    }

    // ----- 表示パネル -----
    function drawMapPlate() {
        const name = config.map.names[displayMap];
        box(4, 4, textWidth(name, 12) + 12, 17);
        text(name, 10, 6, { outline: null });
    }

    function drawNormalHud(time) {
        drawMapPlate();

        if (displayMap === config.map.castle) {
            const remaining = state.normal.castleWaitRemaining;
            const label = remaining > 0 ? `城突入まで あと${remaining}G` : '城突入チャレンジ!!';
            const labelWidth = textWidth(label, 10) + 12;
            box(W - labelWidth - 4, 4, labelWidth, 15, 'rgba(60,0,20,0.75)', '#ff5a5a');
            text(label, W - labelWidth + 2, 6, { color: '#ffe0e0', size: 10, outline: null });
            return;
        }

        // チャンスポイントのゲージ
        const threshold = config.chancePoint.threshold;
        const cp = Math.min(state.normal.chancePoint, threshold);
        const gx = W - 104, gy = H - 14, gw = 80, gh = 6;
        box(gx - 22, gy - 5, gw + 28, 16);
        text('CP', gx - 18, gy - 4, { color: '#9fe6ff', size: 10, outline: null });
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(gx, gy, gw, gh);
        const full = cp >= threshold;
        ctx.fillStyle = full ? (Math.floor(time / 150) % 2 ? '#ffd700' : '#fff') : '#5ad0ff';
        ctx.fillRect(gx, gy, Math.round(gw * cp / threshold), gh);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(gx, gy, Math.round(gw * cp / threshold), 1);
    }

    // 城突入チャレンジ: 残りゲーム数をランプで表示
    function drawChallengeHud(time) {
        drawMapPlate();
        const total = config.castle.challengeGames;
        const remaining = state.challenge.gamesRemaining;
        const bw = 96, bx = W - bw - 4;
        box(bx, 4, bw, 32, 'rgba(60,0,20,0.8)', '#ff5a5a');
        text('城突入チャレンジ', bx + bw / 2, 6, { color: '#ffe0e0', size: 10, align: 'center', outline: null });
        const lampW = 12, gap = 4;
        const startX = bx + (bw - (lampW * total + gap * (total - 1))) / 2;
        const blink = Math.floor(time / 250) % 2;
        for (let i = 0; i < total; i++) {
            const lit = i < remaining;
            ctx.fillStyle = lit ? (i === remaining - 1 && blink ? '#ffffff' : '#ff3a3a') : '#3a1a20';
            ctx.fillRect(startX + i * (lampW + gap), 22, lampW, 8);
        }
        text(`あと${remaining}G`, W / 2, H - 22, { color: '#ffd0d0', size: 12, align: 'center' });
    }

    // ----- RASH / BATTLE -----
    function logoColor() {
        return logoSuper ? SUPER_COLOR : RASH_COLOR;
    }

    function logoText() {
        return logoSuper ? 'SUPERおにおにRASH' : 'おにおにRASH';
    }

    function drawRash(time) {
        const hallId = logoSuper ? 'goldHall' : 'castleHall';
        const hall = Backgrounds.get(hallId);
        Backgrounds.draw(ctx, hallId, 0);
        drawFlames(hall.braziers, time);

        // こおりくん
        if (koori.visible) {
            const frame = koori.moving && Math.floor(time / 100) % 2 ? 'walk2' : 'walk1';
            const x = valueAt(koori.x, time);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x + 4, hall.groundY - 2, 24, 3);
            drawSprite(ctx, SPRITES.koori, frame, x, hall.groundY - 16 * KOORI_SCALE, KOORI_SCALE);
        }

        // 敵
        if (battle.visible && battle.enemyId) {
            const hurt = time < battle.hurtUntil && Math.floor(time / 60) % 2 === 0;
            Characters.drawEnemy(ctx, battle.enemyId, valueAt(battle.x, time), hall.groundY + valueAt(battle.drop, time), {
                scale: 2,
                frame: Math.floor(time / 450) % 2,
                hurt,
                alpha: Math.max(0, valueAt(battle.alpha, time))
            });
        }

        drawRashHud(time);
        drawDamageNumbers(time);
    }

    function drawRashHud(time) {
        // ロゴ (おにおにRASH は赤、SUPER は金)
        const logo = logoText();
        box(4, 4, textWidth(logo, 12) + 12, 17, 'rgba(0,0,0,0.75)', logoColor());
        text(logo, 10, 6, { color: logoColor(), outline: '#200000' });
        if (battle.defeats > 0) {
            text(`撃破 ${battle.defeats}`, 8, 24, { color: '#fff', size: 10 });
        }
        if (battle.probUpGames > 0) {
            const blink = Math.floor(time / 300) % 2;
            text(`確率UP ×${battle.probUpMultiplier} 残り${battle.probUpGames}G`, 8, 36, { color: blink ? '#7fffd4' : '#40e0b0', size: 10 });
        }

        // 残りゲーム数
        if (battle.games !== null) {
            const question = battle.games === '？？';
            const label = question ? '？？' : `残り${battle.games}G`;
            const bw = textWidth(label, 12) + 14;
            box(W - bw - 4, 4, bw, 17, 'rgba(0,0,0,0.75)', question ? '#ffe45a' : '#fff');
            const color = question ? (Math.floor(time / 200) % 2 ? '#ffe45a' : '#ff8a30') : '#fff';
            text(label, W - bw + 3, 6, { color, outline: null });
        }

        // 敵の名前と HP
        if (battle.visible && battle.enemyId) {
            const enemy = Battle.findEnemy(config, battle.enemyId);
            const bw = Math.max(108, textWidth(enemy.name, 10) + textWidth('HP 000', 10) + 18);
            const bx = Math.round(W / 2 - bw / 2) - 20, by = 24;
            box(bx, by, bw, 22, 'rgba(0,0,0,0.7)', battle.breakActive ? '#c080ff' : '#a0a0a0');
            if (battle.breakActive) {
                const blink = Math.floor(time / 250) % 2;
                box(bx + bw - 34, by + 22, 34, 12, 'rgba(60,0,90,0.9)', '#c080ff');
                text('BREAK', bx + bw - 17, by + 23, { color: blink ? '#ffffff' : '#e0b0ff', size: 10, align: 'center', outline: null });
            }
            text(enemy.name, bx + 5, by + 2, { size: 10, outline: null });
            const hp = Math.max(0, valueAt(battle.hp, time));
            const ratio = battle.maxHp ? hp / battle.maxHp : 0;
            ctx.fillStyle = '#3a0a0a';
            ctx.fillRect(bx + 5, by + 15, bw - 10, 4);
            ctx.fillStyle = ratio > 0.5 ? '#40e060' : ratio > 0.2 ? '#f0c030' : '#f04030';
            ctx.fillRect(bx + 5, by + 15, Math.round((bw - 10) * ratio), 4);
            text(`HP ${Math.ceil(hp)}`, bx + bw - 5, by + 2, { size: 10, align: 'right', outline: null, color: '#ccc' });
        }
    }

    function drawDamageNumbers(time) {
        damageNumbers = damageNumbers.filter(d => time - d.born < 900);
        damageNumbers.forEach(d => {
            const age = (time - d.born) / 900;
            const y = 56 - Math.sin(Math.min(1, age * 2) * Math.PI / 2) * 14;
            text(d.text, ENEMY_X, y, { color: d.color, size: d.size, align: 'center' });
        });
    }

    function drawRoulette(time) {
        if (!roulette) return;
        const stopped = time >= roulette.stopAt;
        const name = stopped ? roulette.final : roulette.names[Math.floor((time - roulette.start) / 70) % roulette.names.length];
        const y = H / 2 - 22;
        box(W / 2 - 80, y, 160, 44, 'rgba(0,0,0,0.85)', stopped ? logoColor() : '#fff');
        text('対戦相手', W / 2, y + 4, { size: 10, align: 'center', color: '#ccc', outline: null });
        text(name, W / 2, y + 18, { size: 16, align: 'center', color: stopped ? logoColor() : '#fff' });
    }

    // RASH ロゴの大きな表示 (拡大した状態から縮んで止まる)
    function drawBigLogo(time) {
        if (!bigLogo || time > bigLogo.until) return;
        const t = Math.min(1, (time - bigLogo.start) / 250);
        const size = Math.round(bigLogo.size * (1.6 - 0.6 * t));
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, H / 2 - 30, W, 60);
        text(bigLogo.text, W / 2, H / 2 - 24 + (bigLogo.size - size) / 2, { color: bigLogo.color, size, align: 'center', outline: bigLogo.outline });
        if (t >= 1 && bigLogo.sub) text(bigLogo.sub, W / 2, H / 2 + 10, { color: bigLogo.color, size: 12, align: 'center' });
    }

    // ----- ポップアップ・メッセージ・画面効果 -----
    function drawPopups(time) {
        popups = popups.filter(p => time - p.born < 1000);
        popups.forEach((p, i) => {
            const age = (time - p.born) / 1000;
            const x = scene === 'rash' ? KOORI_BATTLE_X + 16 : W - 64;   // RASH 中はこおりくんの上
            const y = scene === 'rash' ? 70 : H - 34;
            text(p.text, x, y - age * 14 - i * 12, { color: p.color, size: 10, align: 'center' });
        });
    }

    function drawMessage(time) {
        if (!message) return;
        if (time > message.until) {
            message = null;
            return;
        }
        text(message.text, W / 2, 52, { color: message.color, size: 16, align: 'center' });
    }

    function drawLetterbox() {
        const h = Math.round(18 * letterbox);
        if (h <= 0) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, h);
        ctx.fillRect(0, H - h, W, h);
    }

    function drawTitleCard(time) {
        if (!titleCard || time > titleCard.until) return;
        const y = H / 2 - 20;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, y, W, 40);
        ctx.fillStyle = titleCard.color;
        ctx.fillRect(0, y, W, 1);
        ctx.fillRect(0, y + 39, W, 1);
        text(titleCard.text, W / 2, y + 6, { color: titleCard.color, size: 16, align: 'center' });
        if (titleCard.sub) text(titleCard.sub, W / 2, y + 26, { color: '#fff', size: 10, align: 'center' });
    }

    // 左右から黒い幕が閉じる / 開くワイプ
    function drawWipe(time) {
        if (!wipe) return;
        let t = Math.min(1, (time - wipe.start) / wipe.duration);
        if (!wipe.closing) t = 1 - t;
        const half = Math.ceil((W / 2) * t);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, half, H);
        ctx.fillRect(W - half, 0, half, H);
    }

    function drawFlash(time) {
        if (!flash) return;
        const t = (time - flash.start) / flash.duration;
        if (t >= 1) {
            flash = null;
            return;
        }
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
    }

    // ----- 先読み・リーチ・カットイン -----
    // 先読み: 雪が降る (金色は激アツ)
    function drawPreview(time) {
        if (!preview) return;
        const color = preview === 2 ? '#ffd700' : '#ffffff';
        for (let i = 0; i < 48; i++) {
            const speed = 0.02 + (i % 5) * 0.006;
            const x = (i * 53 + Math.sin(time / 600 + i) * 6 + time * 0.01) % W;
            const y = (i * 37 + time * speed) % H;
            ctx.fillStyle = color;
            ctx.fillRect(Math.round(x), Math.round(y), i % 3 ? 1 : 2, i % 3 ? 1 : 2);
        }
        if (preview === 2) {
            ctx.fillStyle = 'rgba(255,215,0,0.08)';
            ctx.fillRect(0, 0, W, H);
        }
    }

    // リーチ: 画面上部に「REACH!」とリーチ柄を大きく表示
    function drawReach(time) {
        if (!reachView) return;
        const pulse = Math.floor(time / 150) % 2;
        const seven = reachView.symbol === 'seven';
        const color = seven ? `hsl(${(time / 4) % 360}, 90%, 60%)` : (pulse ? '#ff3030' : '#ff8080');
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 54, W, 44);
        ctx.fillStyle = color;
        ctx.fillRect(0, 54, W, 2);
        ctx.fillRect(0, 96, W, 2);
        text('REACH!', W / 2 - 24, 64, { color, size: 24, align: 'right' });
        ctx.drawImage(Symbols.canvas(reachView.symbol), W / 2 + 4, 58, 36, 36);
        if (reachView.lineName) text(`${reachView.lineName}ライン`, W / 2 + 46, 68, { color: '#fff', size: 10 });
    }

    // カットイン: キャラクターが横からスライドして入る帯
    function drawCutIn(time) {
        if (!cutIn) return;
        const t = (time - cutIn.start) / cutIn.duration;
        if (t >= 1) {
            cutIn = null;
            return;
        }
        const slide = t < 0.2 ? 1 - t / 0.2 : t > 0.85 ? -(t - 0.85) / 0.15 : 0;
        const offset = Math.round(slide * W);
        const y = 34, h = 76;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, W, h);
        ctx.clip();
        ctx.translate(offset, 0);
        ctx.fillStyle = cutIn.color;
        ctx.fillRect(0, y, W, h);
        // 集中線
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < 14; i++) {
            const ly = y + ((i * 23 + Math.floor(time / 30) * 7) % h);
            ctx.fillRect(0, ly, W, 1);
        }
        if (cutIn.who === 'koori') {
            drawSprite(ctx, SPRITES.koori, 'walk1', 14, y + 6, 4);
        } else {
            const { w, h: eh } = Characters.size(cutIn.who);
            const scale = Math.min(3, 72 / eh, 110 / w);
            Characters.drawEnemy(ctx, cutIn.who, 60, y + h - 2, { scale });
        }
        text(cutIn.text, W - 12, y + h / 2 - 12, { color: '#fff', size: 24, align: 'right', outline: '#000' });
        ctx.restore();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, y - 1, W, 1);
        ctx.fillRect(0, y + h, W, 1);
    }

    function startPreview(level) {
        preview = level;
    }

    function stopPreview() {
        preview = 0;
    }

    function reach(symbol, lineName = '') {
        reachView = { symbol, lineName, start: performance.now() };
        startFlash(symbol === 'seven' ? '#ffffff' : '#ff3030', 300);
        if (symbol === 'seven') {
            cutIn = { who: 'koori', text: '7が来る…!?', color: '#b01828', start: performance.now(), duration: 1200 };
        }
    }

    function push() {
        showMessage('押せ!!', '#ffd700', 3000);
        startFlash('#ffd700', 300);
    }

    async function reachResult(result) {
        reachView = null;
        if (result === 'get') {
            startFlash('#ffd700', 500);
            showMessage('GET!!', '#ffd700', 700);
        } else if (result === 'chance') {
            startFlash('#ff8af0', 400);
            showMessage('CHANCE!!', '#ff8af0', 700);
        } else {
            showMessage('NO...', '#8090a0', 700);
            Sound.miss();
        }
        await sleep(700);
    }

    function playCutIn(who, textStr, color, duration = 1100) {
        cutIn = { who, text: textStr, color, start: performance.now(), duration };
        return sleep(duration);
    }

    // ----- ロングフリーズ -----
    // 画面が止まる → ノイズ → 暗転 → 虹色の「こおりいきていける！」と虹色に光るこおりくん
    function drawFreeze(time) {
        const { phase, snapshot } = freeze;
        if (phase === 'still') {
            ctx.drawImage(snapshot, 0, 0);
            return;
        }
        if (phase === 'noise') {
            ctx.drawImage(snapshot, 0, 0);
            // 横にずれる帯
            for (let k = 0; k < 14; k++) {
                const y = Math.floor(Math.random() * H);
                const h = 2 + Math.floor(Math.random() * 8);
                const dx = Math.round((Math.random() * 2 - 1) * 24);
                ctx.drawImage(snapshot, 0, y, W, h, dx, y, W, h);
            }
            // 砂嵐
            for (let k = 0; k < 900; k++) {
                const v = Math.floor(Math.random() * 255);
                ctx.fillStyle = `rgb(${v},${v},${v})`;
                ctx.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 2, 1);
            }
            ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,0,80' : '0,200,255'},0.12)`;
            ctx.fillRect(0, 0, W, H);
            return;
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (phase === 'black') return;

        // 虹色の表示
        const t = time - freeze.start;
        const hue = (t / 6) % 360;
        // 背景の光の筋
        ctx.save();
        ctx.translate(W / 2, 92);
        for (let i = 0; i < 12; i++) {
            ctx.rotate(Math.PI / 6);
            ctx.fillStyle = `hsla(${(hue + i * 30) % 360}, 90%, 55%, 0.18)`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(160, -14);
            ctx.lineTo(160, 14);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
        // こおりくん (虹色に光る)
        const glow = ctx.createRadialGradient(W / 2, 92, 4, W / 2, 92, 52);
        glow.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.9)`);
        glow.addColorStop(1, `hsla(${(hue + 120) % 360}, 100%, 50%, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(W / 2 - 60, 32, 120, 120);
        drawRainbowKoori(W / 2 - 32, 60, 4, hue);
        // 文字 (1文字ずつ色を変えて揺らす)
        const message = config.longFreeze.text;
        const size = 18;
        ctx.font = `${size}px ${FONT}`;
        const widths = [...message].map(ch => ctx.measureText(ch).width);
        let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
        [...message].forEach((ch, i) => {
            const y = 14 + Math.round(Math.sin(t / 150 + i * 0.7) * 3);
            text(ch, x, y, { color: `hsl(${(hue + i * 28) % 360}, 95%, 62%)`, size, outline: '#000' });
            x += widths[i];
        });
        // きらきら
        for (let i = 0; i < 24; i++) {
            const sx = (i * 97 + t * 0.03) % W;
            const sy = (i * 53 + t * 0.02 * (1 + (i % 3))) % H;
            ctx.fillStyle = `hsl(${(hue + i * 15) % 360}, 100%, 75%)`;
            ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
        }
    }

    // こおりくんを虹色に塗る (ドット絵の上に色を重ねる)
    const rainbowCanvas = document.createElement('canvas');
    function drawRainbowKoori(x, y, scale, hue) {
        const size = 16 * scale;
        rainbowCanvas.width = size;
        rainbowCanvas.height = size;
        const g = rainbowCanvas.getContext('2d');
        g.imageSmoothingEnabled = false;
        drawSprite(g, SPRITES.koori, 'walk1', 0, 0, scale);
        g.globalCompositeOperation = 'source-atop';
        const grad = g.createLinearGradient(0, 0, size, size);
        for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${(hue + i * 60) % 360}, 100%, 60%)`);
        g.globalAlpha = 0.6;
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        ctx.drawImage(rainbowCanvas, x, y);
    }

    async function longFreeze() {
        const timing = config.longFreeze.timing;
        const snapshot = document.createElement('canvas');
        snapshot.width = W;
        snapshot.height = H;
        snapshot.getContext('2d').drawImage(canvas, 0, 0);
        clearMessage();
        reachView = null;
        preview = 0;
        document.body.classList.add('long-freeze');
        freeze = { phase: 'still', snapshot };
        await sleep(timing.still);
        freeze.phase = 'noise';
        Sound.noise(timing.noise / 1000);
        await sleep(timing.noise);
        freeze.phase = 'black';
        await sleep(timing.black);
        freeze.phase = 'rainbow';
        freeze.start = performance.now();
        Sound.rainbow();
        await sleep(timing.rainbow);
        freeze = null;
        document.body.classList.remove('long-freeze');
        startFlash('#ffffff', 700);
    }

    // フリーズ後の効果の告知
    async function freezeBonus(event) {
        const sub = event.kind === 'super' ? '勝利確定!! 次はゴールド金面犬'
            : scene === 'rash' ? '完全撃破!!' : 'おにおにRASH 確定!! おにおにと対決';
        startShake(config.effects.intensity.shakeLarge, 600);
        Sound.fanfare();
        showTitle('ロングフリーズ!!', sub, '#ffffff', 2200);
        await sleep(2200);
    }

    async function nextForced(event) {
        startFlash('#ff3030', 400);
        showTitle(`次の相手は ${event.name}`, '確定!!', '#ff6060', 1600);
        await sleep(1600);
    }

    // ----- 演出の部品 -----
    function showMessage(str, color = '#fff', duration = config.effects.timing.resultDisplay) {
        message = { text: str, color, until: performance.now() + duration };
    }

    function clearMessage() {
        message = null;
    }

    function showTitle(textStr, sub, color, duration) {
        clearMessage();
        titleCard = { text: textStr, sub, color, until: performance.now() + duration };
    }

    function startFlash(color, duration = 400) {
        flash = { color, start: performance.now(), duration };
    }

    function startShake(amp, duration) {
        shake = { amp, start: performance.now(), duration };
    }

    async function playWipe(closing, duration) {
        wipe = { start: performance.now(), duration, closing };
        await sleep(duration);
        if (!closing) wipe = null;
    }

    // ----- 演出: マップ移動 -----
    async function mapTransition(event) {
        const total = config.effects.timing.mapTransition;
        const toCastle = event.to === config.map.castle;
        clearMessage();
        await playWipe(true, total * 0.3);
        if (pendingScene) {
            scene = pendingScene;
            pendingScene = null;
            koori.visible = true;
            battle.visible = false;
        }
        displayMap = event.to;
        setNow(koori.x, KOORI_HOME_X);
        if (toCastle) letterboxTarget = 1;
        await playWipe(false, total * 0.3);
        const name = config.map.names[event.to];
        if (toCastle) {
            startFlash('#ff3030', 500);
            showTitle('SE城が見えてきた！', `― ${name} ―`, '#ff8080', total * 2);
            await sleep(total * 2);
            letterboxTarget = 0;
        } else {
            showTitle(name, null, '#9fe6ff', total);
            await sleep(total);
        }
    }

    // ----- 演出: ポイントチャンス -----
    // 2つの吹き出し (少ない / 多い) を左右ランダムに出し、カーソルが行き来したあと出目で決まった方に止まる
    async function pointChance(event) {
        const bigLeft = Math.random() < 0.5;
        const values = bigLeft ? [event.big, event.small] : [event.small, event.big];
        const chosenIndex = values.indexOf(event.chosen === 'big' ? event.big : event.small);
        clearMessage();
        bubbles = { values, big: event.big, cursor: 0, chosen: chosenIndex, decided: false };
        startFlash('#ffe45a', 300);
        Sound.chance();
        showTitle('ポイントチャンス!!', 'こおりくんが選ぶ…', '#ffe45a', 900);
        await sleep(900);

        // カーソルがだんだん遅くなりながら行き来する
        const steps = 9 + (chosenIndex === 1 ? 1 : 0);   // 最後に chosenIndex で止まる回数
        let wait = 70;
        for (let i = 0; i < steps; i++) {
            bubbles.cursor = i % 2;
            Sound.stop(0);
            await sleep(wait);
            wait = Math.min(260, wait * 1.22);
        }
        bubbles.cursor = chosenIndex;

        // こおりくんがジャンプして選ぶ
        await animateTo(koori.jump, -10, 120);
        await animateTo(koori.jump, 0, 120);
        bubbles.decided = true;
        const big = event.chosen === 'big';
        if (big) {
            startFlash('#ffd700', 500);
            startShake(config.effects.intensity.shakeSmall, 300);
            Sound.fanfare();
        } else {
            Sound.win();
        }
        popups.push({ text: `+${event.amount} CP`, color: big ? '#ffd700' : '#9fe6ff', born: performance.now() });
        await sleep(1100);
        bubbles = null;
    }

    // ----- 演出: 城突入チャレンジ -----
    async function challengeIntro(event) {
        const timing = config.effects.timing;
        scene = 'challenge';
        letterboxTarget = 1;
        startFlash('#ff3030', 500);
        startShake(config.effects.intensity.shakeSmall, 400);
        showTitle('城突入チャレンジ!!', `${event.games}G以内に チャンス目を引け！`, '#ff8080', timing.castleMovie);
        koori.moving = true;
        await animateTo(koori.x, 112, timing.castleMovie * 0.5);
        koori.moving = false;
        await sleep(timing.castleMovie * 0.5);
        letterboxTarget = 0;
    }

    // 突入できなかったゲーム: 門に体当たりしてはじかれる
    async function challengeBounce() {
        koori.moving = true;
        await animateTo(koori.x, 136, 180);
        startShake(config.effects.intensity.shakeSmall, 200);
        showMessage('はじかれた！', '#aaccff', 800);
        await animateTo(koori.x, 112, 300);
        koori.moving = false;
    }

    async function castleEntry() {
        const timing = config.effects.timing;
        scene = 'entry';
        letterboxTarget = 1;
        startFlash('#ffffff', 600);
        startShake(config.effects.intensity.shakeLarge, 500);
        showTitle('突入!!', '城の門が開いた！', '#ffd700', timing.castleMovie);
        await animateTo(gate, 1, 700);
        koori.moving = true;
        await animateTo(koori.x, CASTLE_GATE.x, 700);
        koori.visible = false;
        koori.moving = false;
        await sleep(timing.castleMovie - 1400);
        await playWipe(true, 300);
        letterboxTarget = 0;
    }

    async function challengeFail(event) {
        showTitle('突入失敗…', `CP ${event.keptCp} を持ち越し`, '#9fb8d8', 1600);
        await sleep(1600);
        scene = 'field';
    }

    // ----- 演出: RASH -----
    async function rashStart() {
        const timing = config.effects.timing;
        scene = 'rash';
        logoSuper = state.mode === MODES.SUPER_RASH;
        setNow(gate, 0);
        setNow(koori.x, KOORI_BATTLE_X);
        koori.visible = true;
        koori.moving = false;
        battle.visible = false;
        battle.enemyId = null;
        battle.games = null;
        battle.defeats = 0;
        battle.probUpGames = 0;
        if (wipe) await playWipe(false, 300);
        clearMessage();
        startFlash(logoColor(), 500);
        startShake(config.effects.intensity.shakeLarge, 400);
        Sound.fanfare();
        const now = performance.now();
        bigLogo = {
            text: logoText(), sub: 'RASH突入!!', color: logoColor(), outline: logoSuper ? '#4a3000' : '#300000',
            size: logoSuper ? 18 : 24, start: now, until: now + timing.rashStartMovie
        };
        await sleep(timing.rashStartMovie);
        bigLogo = null;
    }

    // 対戦相手のルーレット → 敵の登場
    async function battleStart(event) {
        const timing = config.effects.timing;
        const names = config.enemies.map(e => e.name);
        if (event.isSuper) names.push(config.goldDog.name);
        const start = performance.now();
        roulette = { names, start, stopAt: start + 1200, final: event.name };
        const tick = setInterval(() => Sound.stop(0), 140);
        await sleep(1200);
        clearInterval(tick);
        Sound.chance();
        await sleep(500);
        roulette = null;

        battle.enemyId = event.enemyId;
        battle.maxHp = event.hp;
        battle.games = event.games;
        battle.breakActive = false;
        setNow(battle.hp, event.hp);
        setNow(battle.alpha, 1);
        setNow(battle.drop, 0);
        setNow(battle.x, W + 60);
        battle.visible = true;
        await animateTo(battle.x, ENEMY_X, 400);
        if (event.enemyId === 'onioni') {
            await playCutIn('onioni', '来たな…!!', '#6a0a0a', 1300);
        } else if (event.isGoldDog) {
            await playCutIn(event.enemyId, '金…!!', '#8a6a00', 1300);
        }
        const sub = event.bonusGames > 0 ? `BATTLE ${event.games}G（+${event.bonusGames}G）` : `BATTLE ${event.games}G`;
        if (event.isGoldDog) {
            startFlash('#ffd700', 800);
            startShake(config.effects.intensity.shakeLarge, 600);
            Sound.fanfare();
            showTitle('ゴールド金面犬 降臨!!', `倒せば2000枚!!　${sub}`, SUPER_COLOR, timing.battleIntro * 1.5);
            await sleep(timing.battleIntro * 1.5);
            return;
        }
        startShake(config.effects.intensity.shakeSmall, 200);
        showTitle(`VS ${event.name}`, sub, logoColor(), timing.battleIntro);
        await sleep(timing.battleIntro);
    }

    // こおりくんの攻撃 → ヒット (白く光る・揺れ・ダメージの数字・HPバーが減る)
    async function damage(event) {
        const timing = config.effects.timing;
        const intensity = config.effects.intensity;
        battle.games = event.gamesRemaining;
        battle.probUpGames = event.probUpGames;
        if (event.amount <= 0 && !event.guarded) return;   // ベル・ハズレは攻撃なし

        if (event.freeze) {
            await playCutIn('koori', '完全撃破!!', '#8a2ab0');
        } else if (event.big && Math.random() < config.effects.cutInRate) {
            await playCutIn('koori', event.kill ? '必殺!!' : 'くらえ!!', event.kill ? '#b01828' : '#1a5ab0');
        }
        koori.moving = true;
        await animateTo(koori.x, ENEMY_X - 56, 150);
        battle.hurtUntil = performance.now() + 300;
        startShake(event.big ? intensity.shakeLarge : intensity.shakeSmall, event.big ? 400 : 150);
        if (event.big) startFlash('#ffffff', 300);
        if (event.big) Sound.bigHit(); else Sound.hit();
        damageNumbers.push({
            text: event.guarded ? 'ガード!' : `-${event.amount}`,
            color: event.guarded ? '#aaccff' : event.big ? '#ff4040' : '#ffe45a',
            size: event.big ? 16 : 12,
            born: performance.now()
        });
        animateTo(battle.hp, event.hp, 300);
        await sleep(timing.hitStop + 100);
        await animateTo(koori.x, KOORI_BATTLE_X, 250);
        koori.moving = false;
        if (event.guardBreak) {
            startFlash('#c080ff', 400);
            showMessage('ガードブレイク!!', '#e0b0ff', 900);
            await sleep(900);
        } else if (event.kill) {
            showMessage('一撃必殺!!', '#ff4040', 800);
        }
    }

    // ブレイク状態に (敵がガードできなくなる)
    async function breakStart() {
        battle.breakActive = true;
        battle.hurtUntil = performance.now() + 500;
        startFlash('#c080ff', 500);
        startShake(config.effects.intensity.shakeLarge, 400);
        Sound.bigHit();
        damageNumbers.push({ text: 'BREAK!!', color: '#e0b0ff', size: 16, born: performance.now() });
        showTitle('BREAK!!', '敵はガードできない！', '#c080ff', 1500);
        await sleep(1500);
    }

    async function defeat(event) {
        const timing = config.effects.timing;
        battle.hurtUntil = performance.now() + 800;
        Sound.defeat();
        startFlash('#ffd700', 500);
        animateTo(battle.alpha, 0, 800);
        animateTo(battle.drop, 20, 800);
        battle.defeats = event.defeatCount;
        showTitle('撃破!!', `${event.name}をたおした！`, '#ffd700', timing.defeatMovie);
        await sleep(timing.defeatMovie);
        battle.visible = false;
        battle.enemyId = null;
        battle.games = null;
        battle.breakActive = false;

        const bonus = event.bonus;
        if (bonus.type === 'probUp') {
            battle.probUpGames = bonus.games;
            battle.probUpMultiplier = bonus.value;
        }
        Sound.win();
        showTitle('撃破ボーナス', bonusText(bonus), '#7fffd4', 1600);
        await sleep(1600);
        if (event.nextForcedName) {
            startFlash('#ff3030', 400);
            showTitle(`次の相手は ${event.nextForcedName}`, '確定!!', '#ff6060', 1600);
            await sleep(1600);
        }
    }

    function bonusText(bonus) {
        switch (bonus.type) {
            case 'coins': return `+${bonus.value}枚 GET!!`;
            case 'games': return `次のBATTLE +${bonus.value}G`;
            case 'probUp': return `柄揃い確率UP ×${bonus.value}（${bonus.games}G）`;
        }
        return '';
    }

    // おにおにが対戦相手の候補に入った
    async function oniUnlocked() {
        startFlash('#ff0000', 600);
        startShake(config.effects.intensity.shakeLarge, 600);
        Sound.bigHit();
        showTitle('おにおにが現れる…!?', '対戦相手に おにおに が追加', '#ff4040', 2000);
        await sleep(2000);
    }

    // SUPERおにおにRASH へ移行 (背景とロゴが金色に)
    async function superStart() {
        const timing = config.effects.timing;
        letterboxTarget = 1;
        startFlash('#ffffff', 400);
        await sleep(400);
        logoSuper = true;
        startFlash('#ffd700', 900);
        startShake(config.effects.intensity.shakeLarge, 700);
        Sound.fanfare();
        setTimeout(Sound.fanfare, 500);
        const now = performance.now();
        bigLogo = {
            text: 'SUPERおにおにRASH', sub: `継続率${Math.round(config.rash.super.continueRate * 100)}%!!`,
            color: SUPER_COLOR, outline: '#4a3000', size: 18, start: now, until: now + timing.superMovie
        };
        await sleep(timing.superMovie);
        bigLogo = null;
        letterboxTarget = 0;
    }

    async function question() {
        battle.games = '？？';
        startFlash('#ffe45a', 300);
        Sound.chance();
        showTitle('？？', '柄が揃えば継続!!', '#ffe45a', config.effects.timing.questionDisplay);
        await sleep(config.effects.timing.questionDisplay);
    }

    async function questionResult(event) {
        if (event.continued) {
            battle.games = event.games;
            startFlash('#ffd700', 500);
            Sound.fanfare();
            showTitle('継続!!', `BATTLE +${event.games}G`, '#ffd700', 1500);
        } else {
            Sound.miss();
            showTitle('RASH終了…', null, '#9fb8d8', 1500);
        }
        await sleep(1500);
    }

    async function rashEnd(event) {
        const name = event.wasSuper ? 'SUPERおにおにRASH' : 'おにおにRASH';
        showTitle(`${name} 終了`, `獲得 ${event.coinsWon}枚　撃破 ${event.defeatCount}体`, logoColor(), 2500);
        await sleep(2500);
        pendingScene = 'field';
    }

    // GameFlow が返した events を順に演出する
    async function playEvents(events) {
        for (const event of events) {
            switch (event.type) {
                case 'payout':
                    if (event.amount > 0) {
                        if (scene === 'rash') {
                            popups.push({ text: `+${event.amount}枚`, color: '#ffe45a', born: performance.now() });
                        } else {
                            showMessage(`WIN!! +${event.amount}`, '#ffe45a');
                        }
                    } else if (event.isChance && scene !== 'rash') {
                        showMessage('チャンス目!!', '#ff8af0');
                    }
                    break;
                case 'chancePoint':
                    if (event.bonus > 0) {
                        const label = event.reason === 'chance' ? 'CHANCE' : 'BONUS';
                        popups.push({ text: `${label} +${event.bonus}`, color: '#ffe45a', born: performance.now() });
                    }
                    break;
                case 'mapChange':
                    await mapTransition(event);
                    break;
                case 'pointChance':
                    await pointChance(event);
                    break;
                case 'challengeStart':
                    await challengeIntro(event);
                    break;
                case 'challengeGame':
                    if (!event.success) await challengeBounce();
                    break;
                case 'castleEntry':
                    await castleEntry();
                    break;
                case 'challengeFail':
                    await challengeFail(event);
                    break;
                case 'rashStart':
                    await rashStart();
                    break;
                case 'battleStart':
                    await battleStart(event);
                    break;
                case 'damage':
                    await damage(event);
                    break;
                case 'defeat':
                    await defeat(event);
                    break;
                case 'question':
                    await question();
                    break;
                case 'questionResult':
                    await questionResult(event);
                    break;
                case 'rashEnd':
                    await rashEnd(event);
                    break;
                case 'break':
                    await breakStart();
                    break;
                case 'freezeBonus':
                    await freezeBonus(event);
                    break;
                case 'nextForced':
                    await nextForced(event);
                    break;
                case 'oniUnlocked':
                    await oniUnlocked();
                    break;
                case 'superStart':
                    await superStart();
                    break;
                case 'debug':
                    syncWithState();
                    break;
            }
        }
    }

    // テスト用: 指定時刻のフレームをその場で描く
    function renderFrame(time = performance.now()) {
        draw(time);
    }

    return { init, showMessage, clearMessage, playEvents, renderFrame, startPreview, stopPreview, reach, push, reachResult, longFreeze };
})();
