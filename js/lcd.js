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
    const FONT = LcdKit.FONT;
    const WALK_SPEED = 0.03;   // 背景のスクロール速度 (px / ms)
    const KOORI_HOME_X = 72;           // 後ろに仲間が並べるよう少し右に
    const KOORI_SCALE = 2;
    const CASTLE_GATE = { x: 170, y: 92, w: 16, h: 12 };   // backgrounds.js の城門の位置
    const KOORI_BATTLE_X = 62;
    const COMPANION_GAP = 20;          // 仲間どうしの間隔 (こおりくんの後ろに並ぶ)
    const ENEMY_X = 190;
    const RASH_COLOR = '#ff3030';
    const SUPER_COLOR = '#ffd700';
    const NAITEI_COLOR = '#ff3060';

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
    let enemyTalk = null;      // 敵のセリフの吹き出し { text, until }
    let freeze = null;         // ロングフリーズ { phase: 'still' | 'noise' | 'black' | 'rainbow', snapshot, start }
    let party = [];            // 表示中の仲間 (加わった順の id)
    const partyJump = {};      // 仲間ごとのジャンプ (アニメーション値)
    let visitor = null;        // お仲間チャレンジで現れた仲間候補 { id, x, silhouette, alpha }
    let treasure = null;       // 宝物庫ゾーン { remaining, games, total, chestOpenUntil, coins: [...] }
    let nextBonusGames = 0;    // 次の BATTLE に上乗せされるゲーム数 (表示用)
    let revenge = null;        // リベンジチャンス { remaining, games }
    let naiteiZone = false;    // 内定の時ゾーンの場面か
    let gateText = null;       // ゾーン突入の暗転と文字 { start, lines: [{ text, color, size, y, born, shake }], fadeStart }
    let naiteiGet = null;      // ゾーン突破の演出 { phase: 'black' | 'text' | 'rainbow', start }
    let aruaruIntro = null;    // アルアルの復活の暗転 { phase: 'black' | 'giveup' | 'you' | 'rainbow' | 'have', start }
    let aruaruAlly = null;     // こおりくんの横に立つアルアル { x }
    let dance = null;          // ダンシングステージ { hype, hypeAt } (hype: 盛り上がり 0〜3、hypeAt: そのゲームの時刻)

    // 時間で値が変わるアニメーション値 (描画時に時刻から計算するので、フレームの抜けに強い)
    const koori = { x: animated(KOORI_HOME_X), jump: animated(0), moving: false, visible: true, hurtUntil: 0 };
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
        winGuaranteed: false,  // 勝利確定の BATTLE (内定の時ゾーン突破の特典、表示用)
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
        LcdKit.setCanvas(ctx, W, H, config);   // 切り出した描画のファイル (js/lcd/) が使う
        syncWithState();
        requestAnimationFrame(loop);
    }

    // state に合わせて場面をそろえる (起動時・デバッグ遷移時)
    function syncWithState() {
        displayMap = state.normal.map;
        revival = null;
        defeatDim = StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.REVIVAL;
        down = defeatDim ? { start: -10000 } : null;   // 復活待ちで読み込んだら倒れたまま
        kooriAura = Boolean(state.challenge.chanceBoost) && !StateMachine.isRashMode(state);
        letterboxTarget = 0;
        bubbles = null;
        party = [...state.companions];
        visitor = null;
        revenge = state.mode === MODES.NORMAL && state.normal.revengeGames > 0
            ? { remaining: state.normal.revengeGames, games: config.revenge.games }
            : null;
        setNow(gate, 0);
        koori.visible = true;
        koori.moving = false;
        gateText = null;
        naiteiZone = StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.NAITEI;
        dance = state.mode === MODES.NORMAL && state.normal.dance ? { hype: 0, hypeAt: 0, cp: state.normal.chancePoint } : null;
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
            nextBonusGames = rash.bonusGames;
            treasure = rash.phase === RASH_PHASES.TREASURE
                ? { remaining: rash.treasureGames, games: config.treasure.games, total: rash.treasureTotal, chestOpenUntil: 0, coins: [] }
                : null;
            bonusView = rash.phase === RASH_PHASES.BONUS && rash.bonusKind
                ? { kind: rash.bonusKind, remaining: rash.bonusLeft, games: config.pseudoBonus.kinds[rash.bonusKind].games, total: rash.bonusTotal, start: performance.now() }
                : null;
            battle.probUpGames = rash.probUpGames;
            battle.probUpMultiplier = rash.probUpMultiplier;
            battle.breakActive = rash.breakActive;
            battle.winGuaranteed = Boolean(rash.winGuaranteed && rash.enemyId);
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
        return scene === 'field' && displayMap !== config.map.castle && !wipe && !bubbles && !dance;
    }

    function draw(time) {
        if (StoryView.active()) {
            StoryView.draw(time);
            return;
        }
        if (freeze) {
            drawFreeze(time);
            return;
        }
        if (naiteiGet) {
            drawNaiteiGet(time);
            drawFlash(time);
            return;
        }
        if (aruaruIntro) {
            drawAruaruIntro(time);
            drawFlash(time);
            return;
        }
        ctx.save();
        if (shake && time < shake.start + shake.duration) {
            const amp = shake.amp;
            ctx.translate(Math.round((Math.random() * 2 - 1) * amp), Math.round((Math.random() * 2 - 1) * amp));
        }
        if (scene === 'rash') {
            drawRash(time);
        } else if (scene === 'field' && dance) {
            drawDance(time);
        } else {
            Backgrounds.draw(ctx, displayMap, scroll);
            if (displayMap === config.map.castle) {
                drawTorches(time);
                drawGate(time);
            }
            const groundY = Backgrounds.get(displayMap).groundY;
            drawParty(time, valueAt(koori.x, time), groundY, 1.5);
            drawKoori(time);
            drawVisitor(time, groundY);
            drawBubbles(time);
            if (scene === 'field') drawNormalHud(time);
            if (scene === 'challenge') drawChallengeHud(time);
        }
        ctx.restore();
        drawZencho(time);
        drawNoise(time);
        drawRevival(time);
        drawPopups(time);
        drawMessage(time);
        drawPreview(time);
        ChanceFx.draw(time);
        drawReach(time);
        FurukawaView.draw(time);
        drawLetterbox();
        drawCutIn(time);
        drawRoulette(time);
        drawBigLogo(time);
        drawTitleCard(time);
        drawWipe(time);
        drawGateText(time);
        EndCardView.draw(time);
        TrophyView.draw(time);
        drawFlash(time);
    }

    // ----- 文字・枠・線などの描画の部品 (js/lcd/kit.js) -----
    const { text, textWidth, box, line, burst, ease, fadeOut } = LcdKit;

    // ----- キャラクター・背景の動くもの -----
    let kooriAura = false;   // SE城前でチャンス目 → 城突入チャレンジの突入率UP中 (赤いオーラ)

    // こおりくんの赤いオーラ: 脈打つ赤い光と、足元から立ちのぼる炎
    function drawAura(time, cx, groundY, size) {
        const pulse = 0.3 + 0.15 * Math.sin(time / 120);
        ctx.fillStyle = `rgba(255,40,40,${pulse})`;
        ctx.beginPath();
        ctx.ellipse(cx, groundY - size / 2, size * 0.75, size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 10; i++) {
            const t = (time / 700 + i / 10) % 1;
            const fx = cx + Math.sin(i * 2.4 + time / 300) * size * 0.5;
            const fy = groundY - t * size * 1.4;
            const s = Math.max(1, Math.round((1 - t) * 4));
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = t < 0.4 ? '#ffb040' : '#ff3030';
            ctx.fillRect(Math.round(fx - s / 2), Math.round(fy), s, s * 2);
        }
        ctx.globalAlpha = 1;
    }

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
        if (kooriAura && state.challenge.chanceBoost) drawAura(time, x + size / 2, bg.groundY + jump, size);
        drawSprite(ctx, SPRITES.koori, frame, x, bg.groundY - size + bob + jump, KOORI_SCALE);
    }

    function jumpOf(id) {
        if (!partyJump[id]) partyJump[id] = animated(0);
        return partyJump[id];
    }

    // 仲間をこおりくんの後ろに並べて描く (近い順に後ろへ)
    function drawParty(time, kooriX, groundY, scale) {
        if (!koori.visible) return;
        const moving = isWalking() || koori.moving;
        party.forEach((id, k) => {
            const frame = moving && Math.floor(time / 140 + k) % 2 ? 1 : 0;
            const bob = moving && frame ? -1 : 0;
            const x = kooriX + 8 - COMPANION_GAP * (k + 1);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(x - 8, groundY - 2, 16, 3);
            if (down && scene === 'rash') {
                // 負けて仲間もダウン (少しずつ遅れて倒れる)
                const { w, h } = Characters.size(id);
                const fall = ease((time - down.start - 120 * (k + 1)) / 350);
                ctx.save();
                ctx.translate(x, groundY - (h + (w - h) * fall) * scale / 2);
                ctx.rotate(-Math.PI / 2 * fall);
                Characters.drawCompanion(ctx, id, 0, h * scale / 2, { scale, frame: 0 });
                ctx.restore();
                if (fall >= 1) drawDizzy(time + k * 300, x - h * scale / 2 + 4, groundY - w * scale - 2);
                return;
            }
            Characters.drawCompanion(ctx, id, x, groundY + bob + valueAt(jumpOf(id), time), { scale, frame });
        });
    }

    // ----- 負けてダウン: こおりくんの目が × になって後ろに倒れ、仲間も倒れる -----
    let down = null;   // { start }

    function knockDown() {
        down = { start: performance.now() };
    }

    function drawKooriDown(time, x, groundY) {
        const size = 16 * KOORI_SCALE;
        const fall = ease((time - down.start) / 350);
        ctx.save();
        ctx.translate(x + size / 2, groundY - size / 2);
        ctx.rotate(-Math.PI / 2 * fall);
        drawSprite(ctx, SPRITES.koori, 'down', -size / 2, -size / 2, KOORI_SCALE);
        ctx.restore();
        if (fall >= 1) drawDizzy(time, x + 4, groundY - size - 4);
    }

    // 目を回している: 頭の上を星がくるくる回る
    function drawDizzy(time, cx, cy) {
        for (let i = 0; i < 3; i++) {
            const a = time / 300 + (i / 3) * Math.PI * 2;
            const sx = Math.round(cx + Math.cos(a) * 9);
            const sy = Math.round(cy + Math.sin(a) * 3);
            ctx.fillStyle = '#ffe45a';
            ctx.fillRect(sx - 1, sy, 3, 1);
            ctx.fillRect(sx, sy - 1, 1, 3);
        }
    }

    function drawVisitor(time, groundY) {
        if (!visitor) return;
        Characters.drawCompanion(ctx, visitor.id, valueAt(visitor.x, time), groundY, {
            scale: 2,
            frame: Math.floor(time / 300) % 2,
            silhouette: visitor.silhouette,
            alpha: Math.max(0, valueAt(visitor.alpha, time))
        });
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

        if (revenge) {
            drawRevengeHud(time);
            return;
        }

        if (displayMap === config.map.castle) {
            const remaining = state.normal.castleWaitRemaining;
            const label = remaining > 0 ? `城突入まで あと${remaining}G` : '城突入チャレンジ!!';
            const labelWidth = textWidth(label, 10) + 12;
            box(W - labelWidth - 4, 4, labelWidth, 15, 'rgba(60,0,20,0.75)', '#ff5a5a');
            text(label, W - labelWidth + 2, 6, { color: '#ffe0e0', size: 10, outline: null });
            return;
        }

        drawCpGauge(time);
    }

    // チャンスポイントのゲージ (右下。ふるカワがしゃべっている間は吹き出しと重ならないよう右上)。
    // value で表示する値を指定できる (ダンシングステージは結果発表まで増やさない)
    function drawCpGauge(time, value = state.normal.chancePoint) {
        const threshold = config.chancePoint.threshold;
        const cp = Math.min(value, threshold);
        const gx = W - 104, gy = FurukawaView.isTalking(time) ? 9 : H - 14, gw = 80, gh = 6;
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

    // リベンジチャンス: 赤い縁取りと残りゲーム数のランプ
    function drawRevengeHud(time) {
        const pulse = 0.25 + 0.15 * Math.sin(time / 200);
        ctx.fillStyle = `rgba(255,40,40,${pulse})`;
        ctx.fillRect(0, 0, W, 3);
        ctx.fillRect(0, H - 3, W, 3);
        ctx.fillRect(0, 0, 3, H);
        ctx.fillRect(W - 3, 0, 3, H);
        const n = revenge.games;
        const bw = 104, bx = W - bw - 4;
        box(bx, 4, bw, 30, 'rgba(70,0,10,0.85)', '#ff4a4a');
        text('リベンジチャンス', bx + bw / 2, 6, { color: '#ffd0d0', size: 10, align: 'center', outline: null });
        const lampW = 14, gap = 4;
        const startX = bx + (bw - (lampW * n + gap * (n - 1))) / 2;
        const blink = Math.floor(time / 250) % 2;
        for (let i = 0; i < n; i++) {
            const lit = i < revenge.remaining;
            ctx.fillStyle = lit ? (i === revenge.remaining - 1 && blink ? '#ffffff' : '#ff3a3a') : '#3a1018';
            ctx.fillRect(startX + i * (lampW + gap), 21, lampW, 8);
        }
        text('チャンス目でRASH再突入!!', W / 2, H - 18, { color: '#ffd0d0', size: 10, align: 'center' });
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

    // ----- ダンシングステージ -----
    const DANCE_BEAT = 60000 / 128;   // BGM (128bpm) の1拍 (ms)
    const DANCE_PINK = '#ff7ae0';

    // flip のとき cx を軸に左右反転して描く
    function withFlip(cx, flip, drawFn) {
        if (!flip) {
            drawFn();
            return;
        }
        ctx.save();
        ctx.translate(cx * 2, 0);
        ctx.scale(-1, 1);
        drawFn();
        ctx.restore();
    }

    function drawDance(time) {
        const hall = Backgrounds.get('danceHall');
        Backgrounds.draw(ctx, 'danceHall', 0);
        const beat = Math.floor(time / DANCE_BEAT);
        const phase = (time % DANCE_BEAT) / DANCE_BEAT;
        // 直前のゲームの出目で盛り上がる (1.6秒)
        const hot = dance.hypeAt && time - dance.hypeAt < 1600 ? dance.hype : 0;
        const gold = hot === 3;

        // 光る床 (拍ごとに色が流れる)
        const floorColors = ['#ff4fd8', '#4fe0ff', '#ffe04f', '#7fff6a'];
        for (let y = hall.floorY, row = 0; y < H; y += 8, row++) {
            for (let x = 0, col = 0; x < W; x += 16, col++) {
                const lit = (col + row + beat) % 3 === 0;
                ctx.fillStyle = lit ? (gold ? '#ffd700' : floorColors[(col + beat) % 4]) : (row + col) % 2 ? '#1e0c2a' : '#2a1238';
                ctx.globalAlpha = lit ? 0.75 : 1;
                ctx.fillRect(x + 1, y + 1, 14, 6);
            }
        }
        ctx.globalAlpha = 1;

        // ネオン看板
        const neon = beat % 2 ? DANCE_PINK : '#4fe0ff';
        text('DANCE', 128, 48, { color: gold ? '#ffd700' : neon, size: 12, align: 'center', outline: null });

        // スポットライト (天井から左右に揺れる)
        for (let i = 0; i < 3; i++) {
            const sx = 48 + i * 80;
            const angle = Math.sin(time / 700 + i * 2.1) * 0.45;
            ctx.save();
            ctx.translate(sx, 8);
            ctx.rotate(angle);
            ctx.fillStyle = gold ? 'rgba(255,215,0,0.16)' : `hsla(${(i * 120 + time / 20) % 360}, 100%, 65%, ${0.1 + hot * 0.04})`;
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(3, 0);
            ctx.lineTo(22, 120);
            ctx.lineTo(-22, 120);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // ミラーボール (チャンスゾーン当選のゲームは金色)
        const bx = 128, by = 22, br = 9;
        ctx.fillStyle = '#8a8a9a';
        ctx.fillRect(bx, 9, 1, by - br - 9);
        for (let dy = -br; dy <= br; dy++) {
            const half = Math.round(Math.sqrt(br * br - dy * dy));
            for (let dx = -half; dx < half; dx += 3) {
                const shine = (Math.floor((dx + time / 60) / 3) + dy) % 3 === 0;
                ctx.fillStyle = gold ? (shine ? '#fff8c0' : '#d0a020') : shine ? '#ffffff' : (dy + dx) % 2 ? '#9aa0b8' : '#c8ccdc';
                ctx.fillRect(bx + dx, by + dy, Math.min(3, half - dx), 1);
            }
        }
        // ミラーボールの光の粒
        for (let i = 0; i < 18; i++) {
            const a = i * 0.35 + time / 900;
            const r = 30 + (i % 5) * 18;
            const x = bx + Math.cos(a) * r * 1.6, y = by + 10 + Math.abs(Math.sin(a)) * r;
            ctx.fillStyle = gold ? '#ffd700' : floorColors[i % 4];
            ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }

        // 踊る人たち: 拍に合わせて跳ね、2拍ごとに向きを変える。盛り上がると大きく跳ぶ
        const ground = hall.groundY;
        const amp = 2 + hot * 2;
        const bounce = i => -Math.round(Math.abs(Math.sin((phase + (i % 2) * 0.5) * Math.PI)) * amp);
        const flipOf = i => (beat + i) % 4 < 2;
        party.forEach((id, k) => {
            const x = 14 + k * 20;
            withFlip(x, flipOf(k + 1), () => Characters.drawCompanion(ctx, id, x, ground + bounce(k + 1), { scale: 1.5, frame: (beat + k) % 2 }));
        });
        const kooriX = 70;
        drawSprite(ctx, SPRITES.koori, beat % 2 ? 'walk2' : 'walk1', kooriX, ground - 16 * KOORI_SCALE + bounce(0), KOORI_SCALE, flipOf(0));
        [['okagappa', 150, 2], ['hibikimakuri', 208, 3]].forEach(([id, x, i]) => {
            withFlip(x, flipOf(i), () => Characters.drawEnemy(ctx, id, x, ground + bounce(i), { scale: 1.5, frame: (beat + i) % 2 }));
        });

        // 音符
        for (let i = 0; i < 6; i++) {
            const t = (time / 22 + i * 41) % 90;
            const x = 16 + i * 44 + Math.round(Math.sin(time / 300 + i) * 4);
            ctx.globalAlpha = Math.max(0, 1 - t / 90);
            text(i % 2 ? '♪' : '♫', x, 100 - t, { color: gold ? '#ffd700' : floorColors[i % 4], size: 10, outline: null });
        }
        ctx.globalAlpha = 1;

        // 表示: ステージ名とチャンスポイント
        const label = 'ダンシングステージ';
        box(4, 4, textWidth(label, 10) + 12, 15, 'rgba(40,0,50,0.8)', DANCE_PINK);
        text(label, 10, 6, { color: '#ffe0fa', size: 10, outline: null });
        drawCpGauge(time, dance.cp);
    }

    // ----- RASH / BATTLE -----
    function logoColor() {
        if (naiteiZone) return NAITEI_COLOR;
        return logoSuper ? SUPER_COLOR : RASH_COLOR;
    }

    function logoText() {
        if (naiteiZone) return '内定の時';
        return logoSuper ? 'SUPERおにおにRASH' : 'おにおにRASH';
    }

    function drawRash(time) {
        if (treasure) {
            drawTreasure(time);
            return;
        }
        if (bonusView) {
            drawBonus(time);
            return;
        }
        const hallId = logoSuper && !naiteiZone ? 'goldHall' : 'castleHall';
        const hall = Backgrounds.get(hallId);
        Backgrounds.draw(ctx, hallId, 0);
        drawFlames(hall.braziers, time);
        if (naiteiZone) {
            // 内定の時ゾーン: 赤黒く沈んだ広間がゆっくり脈打つ
            const pulse = 0.5 + 0.08 * Math.sin(time / 400);
            ctx.fillStyle = `rgba(40,0,12,${pulse})`;
            ctx.fillRect(0, 0, W, H);
        }

        // 仲間とこおりくん
        drawParty(time, KOORI_BATTLE_X, hall.groundY, 1.5);
        if (koori.visible) {
            const frame = koori.moving && Math.floor(time / 100) % 2 ? 'walk2' : 'walk1';
            const x = valueAt(koori.x, time);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x + 4, hall.groundY - 2, 24, 3);
            const hurtBlink = time < koori.hurtUntil && Math.floor(time / 70) % 2 === 0;
            if (down) drawKooriDown(time, x, hall.groundY);
            else if (!hurtBlink) drawSprite(ctx, SPRITES.koori, frame, x, hall.groundY - 16 * KOORI_SCALE, KOORI_SCALE);
        }

        // 「？？」の間は敵が必殺技を溜める (赤いオーラが脈打つ)
        if (battle.visible && battle.enemyId && battle.games === '？？') {
            const pulse = 0.25 + 0.2 * Math.sin(time / 150);
            const { w: ew, h: eh } = Characters.size(battle.enemyId);
            ctx.fillStyle = `rgba(255,40,40,${pulse})`;
            ctx.beginPath();
            ctx.ellipse(valueAt(battle.x, time), hall.groundY - eh, ew + 6, eh + 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // アルアル (内定の時ゾーンの復活): 虹色の光をまとって右を向いて立つ
        if (aruaruAlly) {
            const ax = valueAt(aruaruAlly.x, time);
            drawRainbowGlow(ax, hall.groundY - 56, 56, (time / 6) % 360);
            Characters.drawEnemy(ctx, config.naitei.aruaru.id, ax, hall.groundY, { scale: 2, frame: Math.floor(time / 450) % 2, flip: true });
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

        drawSpecialFx(time, hall.groundY);
        drawRashHud(time);
        drawEnemyTalk(time, hall.groundY);
        drawDamageNumbers(time);
    }

    function drawRashHud(time) {
        // ロゴ (おにおにRASH は赤、SUPER は金)
        const logo = logoText();
        box(4, 4, textWidth(logo, 12) + 12, 17, 'rgba(0,0,0,0.75)', logoColor());
        text(logo, 10, 6, { color: logoColor(), outline: '#200000' });
        // 内定の時ゾーンは敵の名前が長いので、左側の表示は出さない
        if (battle.defeats > 0 && !naiteiZone) {
            text(`撃破 ${battle.defeats}`, 8, 24, { color: '#fff', size: 10 });
        }
        if (nextBonusGames > 0 && !naiteiZone) {
            text(`次のBATTLE +${nextBonusGames}G`, 8, battle.probUpGames > 0 ? 48 : 36, { color: '#ffd23a', size: 10 });
        }
        if (battle.probUpGames > 0 && !naiteiZone) {
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

        // 「？？」の間: 敵がこうげきしそうだ…！
        if (battle.games === '？？' && battle.visible) {
            const msg = config.specials.questionWarning;
            const blink = Math.floor(time / 300) % 2;
            const bw = textWidth(msg, 12) + 16;
            box(Math.round((W - bw) / 2), H - 24, bw, 18, 'rgba(60,0,0,0.85)', blink ? '#ff4040' : '#802020');
            text(msg, W / 2, H - 21, { color: blink ? '#ffffff' : '#ffb0b0', size: 12, align: 'center', outline: null });
        }

        // 敵の名前と HP (左上の撃破数・確率UPなどと重ならないよう、右側の残りゲーム数の下に置く)
        // アルアルが出ている間は、王冠と顔が隠れないよう出さない
        if (battle.visible && battle.enemyId && !aruaruAlly) {
            const enemy = Battle.findEnemy(config, battle.enemyId);
            const bw = Math.max(108, textWidth(enemy.name, 10) + textWidth('HP 000', 10) + 18);
            const bx = W - bw - 4, by = 24;
            box(bx, by, bw, 22, 'rgba(0,0,0,0.7)', battle.breakActive ? '#c080ff' : '#a0a0a0');
            if (battle.breakActive) {
                const blink = Math.floor(time / 250) % 2;
                box(bx + bw - 34, by + 22, 34, 12, 'rgba(60,0,90,0.9)', '#c080ff');
                text('BREAK', bx + bw - 17, by + 23, { color: blink ? '#ffffff' : '#e0b0ff', size: 10, align: 'center', outline: null });
            }
            if (battle.winGuaranteed) {
                const blink = Math.floor(time / 350) % 2;
                box(bx, by + 22, 52, 12, 'rgba(90,60,0,0.9)', SUPER_COLOR);
                text('勝利確定', bx + 26, by + 23, { color: blink ? '#ffffff' : SUPER_COLOR, size: 10, align: 'center', outline: null });
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
            text(d.text, treasure ? CHEST.x + CHEST.w / 2 : ENEMY_X, y, { color: d.color, size: d.size, align: 'center' });
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

    // 内定の時ゾーン突入: 暗転した画面に文字が浮かぶ (赤い文字は出た瞬間に震える)
    function drawGateText(time) {
        if (!gateText) return;
        const fade = gateText.fadeStart ? Math.min(1, (time - gateText.fadeStart) / 500) : 0;
        ctx.globalAlpha = Math.min(1, (time - gateText.start) / 300) * (1 - fade);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        gateText.lines.forEach(line => {
            const age = time - line.born;
            ctx.globalAlpha = Math.min(1, age / 250) * (1 - fade);
            const jitter = line.shake && age < 600 ? () => Math.round((Math.random() * 2 - 1) * 2) : () => 0;
            text(line.text, W / 2 + jitter(), line.y + jitter(), { color: line.color, size: line.size, align: 'center', outline: line.outline });
        });
        ctx.globalAlpha = 1;
    }

    function drawFlash(time) {
        if (!flash) return;
        const t = (time - flash.start) / flash.duration;
        if (t >= 1) {
            flash = null;
            return;
        }
        ctx.globalAlpha = (1 - t) * flash.strength;
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
        if (cutIn.color === 'rainbow') {
            // 虹の カットイン (確定): 色が 流れる
            const grad = ctx.createLinearGradient(0, y, W, y + h);
            for (let k = 0; k <= 6; k++) grad.addColorStop(k / 6, `hsl(${(k * 60 + time / 5) % 360}, 90%, 50%)`);
            ctx.fillStyle = grad;
        } else ctx.fillStyle = cutIn.color;
        ctx.fillRect(0, y, W, h);
        // 集中線
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < 14; i++) {
            const ly = y + ((i * 23 + Math.floor(time / 30) * 7) % h);
            ctx.fillRect(0, ly, W, 1);
        }
        if (cutIn.who === 'koori') {
            drawSprite(ctx, SPRITES.koori, 'walk1', 14, y + 6, 4);
        } else if (cutIn.who === 'tomoishi') {
            drawSprite(ctx, SPRITES.tomoishi, 'shout', 14, y + 4, 4);
        } else if (cutIn.who === 'furukawa') {
            drawSprite(ctx, SPRITES.furukawa, 'talk', 16, y + 2, 3.5);
        } else if (Characters.isCompanion(cutIn.who)) {
            Characters.drawCompanion(ctx, cutIn.who, 52, y + h - 2, { scale: 3 });
        } else {
            const { w, h: eh } = Characters.size(cutIn.who);
            const scale = Math.min(3, 72 / eh, 110 / w);
            Characters.drawEnemy(ctx, cutIn.who, 60, y + h - 2, { scale });
        }
        // 技名が長いときは右側の幅に収まるまで小さくする
        let size = 24;
        while (size > 10 && textWidth(cutIn.text, size) > W - 124) size -= 2;
        if (cutIn.sub) {
            // 「○○の必殺技!!」も幅に収める (名前が長すぎるときは「必殺技!!」だけにする)
            let sub = cutIn.sub, subSize = 12;
            while (subSize > 9 && textWidth(sub, subSize) > W - 124) subSize--;
            if (textWidth(sub, subSize) > W - 124) {
                sub = '必殺技!!';
                subSize = 12;
            }
            text(sub, W - 12, y + 12, { color: '#ffe45a', size: subSize, align: 'right', outline: '#000' });
            text(cutIn.text, W - 12, y + h / 2 - size / 2 + 6, { color: '#fff', size, align: 'right', outline: '#000' });
        } else {
            text(cutIn.text, W - 12, y + h / 2 - size / 2, { color: '#fff', size, align: 'right', outline: '#000' });
        }
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

    // ----- 疑似ボーナス (2026-10-23 A5)。BIG 金・REG 銀 は キャラ解説、エピソードBIG は 夕焼けで ストーリー -----
    let bonusView = null;   // { kind, remaining, games, total, start }
    const profileOf = id => (window.CHARACTER_PROFILES || {})[id] || {};
    const nameOf = id => {
        if (id === 'koori') return 'こおりくん';
        if (id === 'tomoishi') return 'ともいし';
        if (id === 'furukawa') return config.furukawa.name;
        const m = config.companions.members.find(c => c.id === id);
        if (m) return m.name;
        if (id === config.naitei.enemy.id) return config.naitei.enemy.name;
        if (id === config.naitei.aruaru.id) return config.naitei.aruaru.name;
        const e = config.enemies.find(x => x.id === id) || (config.goldDog.id === id ? config.goldDog : null);
        return e ? e.name : id;
    };
    // キャラの 絵 (地面 groundY・まんなか x)
    function drawWho(id, x, groundY, scale = 2) {
        if (id === 'koori') return drawSprite(ctx, SPRITES.koori, 'walk1', x - 8 * scale, groundY - 16 * scale, scale);
        if (id === 'tomoishi') return drawSprite(ctx, SPRITES.tomoishi, 'idle', x - 9 * scale, groundY - 18 * scale, scale);
        if (id === 'furukawa') return drawSprite(ctx, SPRITES.furukawa, 'talk', x - 10 * scale, groundY - 20 * scale, scale);
        if (Characters.isCompanion(id)) return Characters.drawCompanion(ctx, id, x, groundY, { scale });
        if (Characters.has(id)) {
            const { w, h } = Characters.size(id);
            return Characters.drawEnemy(ctx, id, x, groundY, { scale: Math.min(scale, 56 / h, 70 / w) });
        }
    }
    function drawBonus(time) {
        const b = bonusView;
        const k = config.pseudoBonus.kinds[b.kind];
        // 背景: BIG 金 / REG 銀 / エピソード 夕焼け
        const g = ctx.createLinearGradient(0, 0, 0, H);
        const stops = b.kind === 'episode' ? ['#2a1450', '#c8505a', '#ffb060'] : b.kind === 'big' ? ['#5a3a00', '#d8a020', '#fff0a0'] : ['#2a3440', '#8a9aac', '#e8eef4'];
        stops.forEach((c, i) => g.addColorStop(i / 2, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // 光の すじ
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI * 2 + time / 2400;
            ctx.beginPath();
            ctx.moveTo(W / 2, H + 30);
            ctx.lineTo(W / 2 + Math.cos(a) * W, H + 30 + Math.sin(a) * W);
            ctx.lineTo(W / 2 + Math.cos(a + 0.12) * W, H + 30 + Math.sin(a + 0.12) * W);
            ctx.fill();
        }
        // 名前・残り・獲得
        const title = k.name;
        const tcol = b.kind === 'episode' ? `hsl(${(time / 6) % 360}, 90%, 70%)` : b.kind === 'big' ? '#fff6c0' : '#ffffff';
        text(title, W / 2, 6, { color: tcol, size: 16, align: 'center', outline: '#2a1a00' });
        text(`残り ${b.remaining}G`, 8, 26, { color: '#fff', size: 10, outline: '#000' });
        text(`+${b.total}枚`, W - 8, 26, { color: '#fff2a0', size: 12, align: 'right', outline: '#3a2a00' });
        // 解説 / ストーリー (2 ゲームで 1 つ)
        const page = Math.floor((b.games - b.remaining) / 2);
        let who, line, head;
        if (b.kind === 'episode') {
            // ストーリーは js/episode.js (場面の 数で ゲーム数を 均等に わりふる)
            const list = window.EPISODE_STORY && window.EPISODE_STORY.length ? window.EPISODE_STORY : [{ who: 'koori', text: 'こおりいきていける！' }];
            const scene = list[Math.min(list.length - 1, Math.floor((b.games - b.remaining) * list.length / b.games))];
            ({ who, text: line } = scene);
            head = scene.name || nameOf(who);
        } else {
            const list = config.pseudoBonus.guide;
            who = list[page % list.length];
            const pr = profileOf(who);
            head = `${nameOf(who)}${pr.title ? ` ― ${pr.title}` : ''}`;
            line = (pr.text || '').replace(/\n+/g, ' ');
        }
        const ground = 118;
        drawWho(who, 40, ground + Math.round(Math.sin(time / 300) * 1.5), 2);
        box(76, 46, W - 84, 74, 'rgba(0,0,0,0.6)', b.kind === 'big' ? '#ffd700' : b.kind === 'reg' ? '#d8e4f0' : '#ff9ad0');
        text(head.length > 22 ? head.slice(0, 22) + '…' : head, 82, 50, { color: '#ffe680', size: 10 });
        // 「！」「…」などだけが 次の 行に 回ったら 前の 行に つける
        const rows = LcdKit.wrapText(line, 10, W - 96).reduce((out, row) => {
            if (out.length && /^[！？!?…、。」）～ー]{1,3}$/.test(row)) out[out.length - 1] += row;
            else out.push(row);
            return out;
        }, []);
        rows.slice(0, 4).forEach((row, i) => text(row, 82, 64 + i * 13, { color: '#fff', size: 10 }));
        // 残りの ランプ
        const n = Math.min(b.games, 40), lampW = Math.max(3, Math.floor((W - 20) / n) - 1);
        for (let i = 0; i < n; i++) {
            ctx.fillStyle = i < Math.round(b.remaining * n / b.games) ? '#fff2a0' : 'rgba(0,0,0,0.4)';
            ctx.fillRect(10 + i * (lampW + 1), H - 10, lampW, 4);
        }
    }
    async function pseudoBonusStart(event) {
        clearMessage();
        letterboxTarget = 1;
        const k = config.pseudoBonus.kinds[event.kind];
        startFlash(event.kind === 'reg' ? '#ffffff' : '#ffd700', 700);
        startShake(config.effects.intensity.shakeLarge, 500);
        Sound.fanfare();
        if (event.kind !== 'reg') setTimeout(Sound.fanfare, 450);
        if (event.kind === 'episode') Sound.rainbow();
        bonusView = { kind: event.kind, remaining: event.games, games: event.games, total: 0, start: performance.now() };
        showTitle(`${k.name}!!`, `${event.games}G ・ 約${Math.round(event.games * (k.perGame + 1.8))}枚`, k.color === 'rainbow' ? '#ff9ad0' : k.color, 2200);
        await sleep(2200);
        letterboxTarget = 0;
    }
    async function pseudoBonusGame(event) {
        if (!bonusView) return;
        bonusView.remaining = event.remaining;
        bonusView.total += event.gained;
        if (event.added > 0) {
            startFlash('#ffffff', 400);
            Sound.fanfare();
            damageNumbers.push({ text: `次のBATTLE +${event.added}G`, color: '#ff6a3a', size: 14, born: performance.now() });
            await sleep(600);
        }
    }
    async function pseudoBonusEnd(event) {
        nextBonusGames = event.bonusGames;
        const k = config.pseudoBonus.kinds[event.kind];
        showTitle(`${k.name} 終了`, `+${event.total}枚${event.added ? ` ・ 次のBATTLE +${event.added}G` : ''}`, k.color === 'rainbow' ? '#ff9ad0' : k.color, 2000);
        Sound.win();
        await sleep(2000);
        bonusView = null;
    }

    // ----- モード・ゾーン・天井 (2026-10-23 A5) -----
    const NAITEI_ID = () => config.naitei.enemy.id;
    async function ceiling(event) {
        const aruaru = event.who === 'aruaru';
        startFlash(aruaru ? '#ffffff' : '#ffd700', 600);
        startShake(config.effects.intensity.shakeLarge, 600);
        if (aruaru) Sound.rainbow(); else Sound.fanfare();
        await playCutIn(aruaru ? config.naitei.aruaru.id : NAITEI_ID(), aruaru ? '君には 内定が ある！！' : '…城へ 来るがいい', aruaru ? 'rainbow' : '#8a1a1a', 1600, '天井到達!!');
        showTitle('城突入 確定!!', `${event.games}G`, aruaru ? '#ff9ad0' : '#ffd700', 1800);
        await sleep(1800);
    }
    async function heavenHint(event) {
        const aruaru = event.who === 'aruaru';
        Sound.chance();
        await playCutIn(aruaru ? config.naitei.aruaru.id : NAITEI_ID(), aruaru ? 'また すぐに 会おう…' : 'まだ 終わらせないぞ…', aruaru ? 'rainbow' : '#4a1a6a', 1600);
    }
    function modeHint(event) {
        FurukawaView.show({ text: event.text, color: 1, heat: 0 });
    }
    async function zoneHit() {
        startFlash('#d8a8ff', 500);
        Sound.chance();
        showMessage('SE城へ いそげ!!', '#d8a8ff', 1200);
        await sleep(900);
    }

    // ----- 前兆と 違和感演出 (2026-10-23 A4。js/zencho.js) -----
    let zencho = null;      // { kind: 'dance' / 'battle', start }
    let noiseUntil = 0;
    function setZencho(kind) {
        if ((zencho && zencho.kind) === kind) return;
        zencho = kind ? { kind, start: performance.now() } : null;
    }
    // 前兆: 画面の まわりに 黒い 靄 (バトルは 赤黒い)。ゆらゆら 動く 影と、ときどき 出る ひとこと
    function drawZencho(time) {
        if (!zencho) return;
        const k = Math.min(1, (time - zencho.start) / 700);
        const rgb = zencho.kind === 'battle' ? '90,0,0' : '20,0,40';
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.62);
        g.addColorStop(0, `rgba(${rgb},0)`);
        g.addColorStop(1, `rgba(${rgb},${0.8 * k})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(0,0,0,${0.22 * k})`;
        for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2 + time / 1800;
            const x = W / 2 + Math.cos(a) * W * 0.5, y = H / 2 + Math.sin(a) * H * 0.55;
            ctx.beginPath();
            ctx.arc(x, y, 18 + 6 * Math.sin(time / 300 + i), 0, Math.PI * 2);
            ctx.fill();
        }
        if (Math.floor((time - zencho.start) / 900) % 3 === 2) return;
        const msg = zencho.kind === 'battle' ? '決着の 時が 近い…' : 'なにかが 近づいてくる…';
        text(msg, W / 2 + 30, 12, { color: zencho.kind === 'battle' ? '#ff9a8a' : '#d8a8ff', size: 10, align: 'center', outline: '#000' });
    }
    // 違和感: 液晶に ノイズ (横の すじと 砂あらし)
    function noiseFx(ms = 700) {
        noiseUntil = performance.now() + ms;
    }
    function drawNoise(time) {
        if (time > noiseUntil) return;
        for (let i = 0; i < 26; i++) {
            const v = Math.floor(Math.random() * 255);
            ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.4})`;
            ctx.fillRect(0, Math.floor(Math.random() * H), W, 1 + Math.floor(Math.random() * 3));
        }
    }

    // 期待度の カットイン (2026-10-23 A3。js/hype.js): 青 < 緑 < 赤 < 金 < 虹。待たずに 出す
    function chanceCutIn(tier, cast) {
        const h = config.hype.cutin;
        const sub = { blue: 'CHANCE', green: 'CHANCE', red: 'BIG CHANCE', gold: '激アツ', rainbow: '確定!!' }[tier];
        cutIn = { who: cast.who, text: cast.text, color: h.colorCodes[tier], sub, start: performance.now(), duration: h.duration };
        if (tier === 'gold' || tier === 'rainbow') startFlash(tier === 'gold' ? '#ffd700' : '#ffffff', 400);
    }

    function playCutIn(who, textStr, color, duration = 1100, sub = null) {
        cutIn = { who, text: textStr, color, sub, start: performance.now(), duration };
        return sleep(duration);
    }

    // ----- 必殺技 -----
    const SPECIAL_FX = SpecialFx.KINDS;   // 必殺技ごとのエフェクトの種類 (js/lcd/special-fx.js)

    // こおりくんがとどめ: 大腸炎アタック / 一撃必殺の役は 7つの内定フラッシュ。エフェクトの種類を返す (攻撃が当たる瞬間に出す)
    //   内定の時ゾーンの突破 (naitei) は ばりきつよめのレクイエム
    async function kooriSpecial(kill, naitei = false) {
        const id = naitei ? 'kooriNaitei' : kill ? 'kooriKill' : 'koori';
        startFlash(naitei || kill ? '#ffd700' : '#ffffff', 300);
        Sound.chance();
        const color = { kooriNaitei: '#5a1a8a', kooriKill: '#8a6a00', koori: '#b01828' }[id];
        await playCutIn('koori', config.specials[id], color, naitei ? 1800 : 1500, '必殺技!!');
        return SPECIAL_FX[id];
    }

    // 仲間がとどめ: 仲間ごとの必殺技。エフェクトの種類を返す
    async function companionSpecial(id) {
        const member = config.companions.members.find(m => m.id === id);
        if (!member || !member.special) return null;
        startFlash('#7fffd4', 300);
        Sound.chance();
        await playCutIn(id, member.special, '#1a6a50', 1400, `${member.name}の必殺技!!`);
        return SPECIAL_FX[id] || null;
    }

    // とどめの攻撃が当たった瞬間のエフェクト
    function hitFx(kind) {
        if (!kind) return;
        Sound.special(kind);
        startFx(kind);
        if (kind === 'sevenFlash') startFlash('#ffffff', 300);
        if (kind === 'requiem') startFlash('#ffd700', 400);
    }

    // 敵のセリフ (config の lines。key: 'intro' 出てきたとき / 'special' 必殺技の前)。言い終わるまで待つ
    async function enemySay(enemyId, key) {
        const enemy = enemyId && Battle.findEnemy(config, enemyId);
        const line = enemy && enemy.lines && enemy.lines[key];
        if (!line) return;
        const duration = config.effects.timing.enemyTalk;
        Sound.talk();
        enemyTalk = { text: line, until: performance.now() + duration };
        await sleep(duration);
        enemyTalk = null;
    }

    // 敵の顔の左に吹き出しを出す
    function drawEnemyTalk(time, groundY) {
        if (!enemyTalk || time > enemyTalk.until || !battle.visible || !battle.enemyId) return;
        const { w, h } = Characters.size(battle.enemyId);
        const left = valueAt(battle.x, time) - w;   // 敵は2倍で描いている
        const top = groundY + valueAt(battle.drop, time) - h * 2;
        StoryView.bubble(enemyTalk.text, Math.round(left + 6), Math.round(top + 18));
    }

    // 敵の必殺技 (「？？」で継続できなかったとき・内定の時ゾーンの失敗): セリフ → カットイン → 技ごとのエフェクト
    //   hitKoori: false のときはこおりくんに当たらない (仲間がかばう)
    async function enemySpecial(enemyId, { hitKoori = true } = {}) {
        const enemy = enemyId && Battle.findEnemy(config, enemyId);
        if (!enemy || !enemy.special) return;
        const intensity = config.effects.intensity;
        const kind = SPECIAL_FX[enemyId] || 'beam';
        await enemySay(enemyId, 'special');
        startFlash('#ff2020', 300);
        Sound.bigHit();
        await playCutIn(enemyId, enemy.special, '#5a0a0a', 1600, `${enemy.name}の必殺技!!`);
        battle.games = null;
        Sound.special(kind);
        if (kind === 'driver') {
            // シバタードライバー: 跳び上がってこおりくんの目の前に叩きつける
            animateTo(battle.x, KOORI_BATTLE_X + 46, 380);
            await animateTo(battle.drop, -60, 380);
            await animateTo(battle.drop, 0, 120);
        }
        // 技が当たるまでの時間 (エフェクトの途中で当てる)
        const impact = { beam: 300, soundwave: 250, driver: 0, slash: 250, club: 360, goldbite: 400, judge: 300 }[kind] ?? 300;
        const fxDone = startFx(kind);
        await sleep(impact);
        // 技のエフェクトが透けて見えるように、フラッシュは薄め
        startFlash(kind === 'goldbite' ? '#ffd700' : '#ff0000', 400, 0.6);
        startShake(intensity.shakeLarge, 500);
        if (hitKoori) {
            koori.hurtUntil = performance.now() + 700;
            animateTo(koori.x, KOORI_BATTLE_X - 20, 200);
        }
        await fxDone;
        if (kind === 'driver') await animateTo(battle.x, ENEMY_X, 300);
        if (hitKoori) await animateTo(koori.x, KOORI_BATTLE_X, 300);
    }

    // ----- 必殺技のエフェクト (RASH の場面に重ねて描く。中身は js/lcd/special-fx.js) -----
    function startFx(kind) {
        return sleep(SpecialFx.start(kind));
    }

    function drawSpecialFx(time, groundY) {
        SpecialFx.draw(time, {
            kx: valueAt(koori.x, time) + 16, ky: groundY - 16,           // こおりくんの中心
            ex: valueAt(battle.x, time), ey: groundY - 44                 // 敵の中心あたり
        }, groundY);
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
        drawRainbowRays(W / 2, 92, hue);
        drawRainbowGlow(W / 2, 92, 52, hue);
        drawRainbowKoori(W / 2 - 32, 60, 4, hue);
        drawRainbowText(config.longFreeze.text, 14, 18, t, hue);
        drawSparkles(t, hue);
    }

    // ----- 虹色の表示の部品 (ロングフリーズ・内定の時の突破) -----
    // (cx, cy) から放射状に伸びる虹色の光の筋
    function drawRainbowRays(cx, cy, hue) {
        ctx.save();
        ctx.translate(cx, cy);
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
    }

    function drawRainbowGlow(cx, cy, radius, hue) {
        const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
        glow.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.9)`);
        glow.addColorStop(1, `hsla(${(hue + 120) % 360}, 100%, 50%, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(cx - radius - 8, cy - radius - 8, radius * 2 + 16, radius * 2 + 16);
    }

    // 1文字ずつ色を変えて揺らす虹色の文字 (中央寄せ)
    function drawRainbowText(message, y, size, t, hue) {
        ctx.font = `${size}px ${FONT}`;
        const widths = [...message].map(ch => ctx.measureText(ch).width);
        let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
        [...message].forEach((ch, i) => {
            const cy = y + Math.round(Math.sin(t / 150 + i * 0.7) * 3);
            text(ch, x, cy, { color: `hsl(${(hue + i * 28) % 360}, 95%, 62%)`, size, outline: '#000' });
            x += widths[i];
        });
    }

    function drawSparkles(t, hue) {
        for (let i = 0; i < 24; i++) {
            const sx = (i * 97 + t * 0.03) % W;
            const sy = (i * 53 + t * 0.02 * (1 + (i % 3))) % H;
            ctx.fillStyle = `hsl(${(hue + i * 15) % 360}, 100%, 75%)`;
            ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
        }
    }

    // こおりくんを虹色に塗る (ドット絵の上に色を重ねる)。white (0〜1) で白く光らせる
    const rainbowCanvas = document.createElement('canvas');
    function drawRainbowKoori(x, y, scale, hue, white = 0) {
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
        if (white > 0) {
            g.globalAlpha = white;
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, size, size);
        }
        ctx.drawImage(rainbowCanvas, x, y);
    }

    // ----- 内定の時の突破 -----
    // 暗転 →「内定は」→ 虹色の「こおりがいただいた！」と、虹色のこおりくんのドアップ (寄りながら白く点滅)
    function drawNaiteiGet(time) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const t = time - naiteiGet.start;
        if (naiteiGet.phase === 'black') return;
        if (naiteiGet.phase === 'text') {
            ctx.globalAlpha = Math.min(1, t / 300);
            text('内定は', W / 2, H / 2 - 14, { size: 24, align: 'center', color: '#ffffff' });
            ctx.globalAlpha = 1;
            return;
        }
        const hue = (t / 6) % 360;
        const cx = W / 2, cy = 84;
        drawRainbowRays(cx, cy, hue);
        drawRainbowGlow(cx, cy, 60, hue);
        // ドアップ: 3倍から7倍まで一気に寄る
        const scale = Math.round(3 + 4 * Math.min(1, t / 350));
        const size = 16 * scale;
        const white = t % 400 < 110 ? 0.85 : 0;
        drawRainbowKoori(Math.round(cx - size / 2), Math.round(cy - size / 2), scale, hue, white);
        drawRainbowText('こおりがいただいた！', 8, 18, t, hue);
        drawSparkles(t, hue);
    }

    // ----- アルアルの復活 (内定の時ゾーンで負けたとき) -----
    // 暗転 →「あきらめるな」(赤) →「君には」→ 赤が少しずつ虹色に →「内定がある！！」
    function drawAruaruIntro(time) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const { phase, start } = aruaruIntro;
        const t = time - start;
        if (phase === 'black') return;
        if (phase === 'have') {
            const hue = (t / 6) % 360;
            drawRainbowRays(W / 2, H / 2, hue);
            drawRainbowGlow(W / 2, H / 2, 70, hue);
            drawRainbowText('内定がある！！', H / 2 - 14, 26, t, hue);
            drawSparkles(t, hue);
            return;
        }
        // 赤い文字。'rainbow' のあいだに少しずつ虹色を重ねる
        const mix = phase === 'rainbow' ? Math.min(1, t / config.naitei.timing.aruRainbow) : 0;
        const fade = phase === 'giveup' ? Math.min(1, t / 300) : 1;
        ctx.globalAlpha = fade;
        drawRedToRainbow('あきらめるな', H / 2 - 36, 24, mix, time);
        ctx.globalAlpha = 1;
        if (phase === 'you' || phase === 'rainbow') {
            ctx.globalAlpha = phase === 'you' ? Math.min(1, t / 300) : 1;
            drawRedToRainbow('君には', H / 2 + 6, 20, mix, time);
            ctx.globalAlpha = 1;
        }
    }

    // 真ん中ぞろえの文字を赤で描き、mix (0〜1) の濃さで1文字ずつ虹色を重ねる
    function drawRedToRainbow(message, y, size, mix, time) {
        const widths = [...message].map(ch => textWidth(ch, size));
        let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
        const alpha = ctx.globalAlpha;
        [...message].forEach((ch, i) => {
            text(ch, x, y, { color: '#ff2a2a', size, outline: '#000' });
            if (mix > 0) {
                ctx.globalAlpha = alpha * mix;
                text(ch, x, y, { color: `hsl(${(time / 4 + i * 40) % 360}, 100%, 62%)`, size, outline: null });
                ctx.globalAlpha = alpha;
            }
            x += widths[i];
        });
    }

    // ナイナイの必殺技で倒れたあと: 暗転の文字 → こおりくんが起き上がり、王冠のアルアルが現れて必殺技でナイナイを一撃
    async function playAruaru() {
        const timing = config.naitei.timing;
        const aru = config.naitei.aruaru;
        const phase = (name, ms) => {
            aruaruIntro = { phase: name, start: performance.now() };
            return sleep(ms);
        };
        clearMessage();
        titleCard = null;
        await phase('black', timing.aruBlack);
        Sound.bigHit();
        await phase('giveup', timing.aruGiveUp);
        Sound.stop(1);
        await phase('you', timing.aruYou);
        Sound.chance();
        await phase('rainbow', timing.aruRainbow);
        startFlash('#ffffff', 500);
        Sound.rainbow();
        setTimeout(Sound.fanfare, 500);
        await phase('have', timing.aruHave);
        aruaruIntro = null;
        down = null;   // こおりくんが起き上がる
        startFlash('#ffffff', 600);
        // 王冠のアルアルが左から現れ、こおりくんの前に立つ
        aruaruAlly = { x: animated(-40) };
        await animateTo(aruaruAlly.x, 124, 700);
        await sleep(400);
        startFlash('#ffd700', 300);
        Sound.chance();
        await playCutIn(aru.id, aru.special, '#8a6a00', 1800, `${aru.name}の必殺技!!`);
        hitFx(SPECIAL_FX[aru.id]);
        await sleep(1000);
    }

    async function playNaiteiGet() {
        const timing = config.naitei.timing;
        clearMessage();
        titleCard = null;
        naiteiGet = { phase: 'black', start: performance.now() };
        Sound.miss();
        await sleep(timing.getBlack);
        naiteiGet = { phase: 'text', start: performance.now() };
        Sound.stop(2);
        await sleep(timing.getText);
        naiteiGet = { phase: 'rainbow', start: performance.now() };
        startFlash('#ffffff', 500);
        Sound.rainbow();
        setTimeout(Sound.fanfare, 600);
        await sleep(timing.getRainbow);
        naiteiGet = null;
        startFlash('#ffffff', 600);
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
        const sub = event.kind === 'naitei' ? '内定確定!! 突破!!'
            : event.kind === 'treasure' ? `+${event.games}G!! SUPER突入 & ゴールド金面犬と対決!!`
            : event.kind === 'super' ? '勝利確定!! 次はゴールド金面犬'
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

    // ----- チャンス目の演出 (チャンス目の種類ごと。中身は js/lcd/chance-fx.js) -----
    // チャンス目の演出を流す (main.js から呼ぶ)
    async function playChanceEffect(name) {
        clearMessage();
        const duration = ChanceFx.start(name, () => startShake(config.effects.intensity.shakeLarge, 120));
        if (!duration) return;
        if (name === '7崩れ') {
            startFlash('#ff3a3a', 400);
            startShake(config.effects.intensity.shakeLarge, 500);
            Sound.fanfare();
        } else if (name === 'BAR崩れ') {
            Sound.bigHit();
        } else {
            startFlash('#7aff7a', 300);
            Sound.win();
        }
        await sleep(duration);
    }

    // ----- 演出: リベンジチャンス -----
    // ----- 演出: ダンシングステージ -----
    async function danceStart() {
        clearMessage();
        await playWipe(true, 300);
        dance = { hype: 0, hypeAt: 0, cp: state.normal.chancePoint };
        koori.visible = true;
        await playWipe(false, 300);
        startFlash(DANCE_PINK, 500);
        startShake(config.effects.intensity.shakeSmall, 300);
        Sound.fanfare();
        showTitle('ダンシングステージ!!', 'ポイント増加 or チャンスゾーン突入!?', DANCE_PINK, 2200);
        await sleep(2200);
    }

    // ステージの1ゲーム: 出目で盛り上がる (チャンスゾーン当選のゲームは会場が一瞬金色に)
    async function danceGame(event) {
        if (!dance) return;
        dance.hype = event.hype;
        dance.hypeAt = performance.now();
        if (event.hype === 3) {
            startFlash('#ffd700', 400);
            Sound.chance();
            await sleep(600);
        } else if (event.hype === 2) {
            startFlash(DANCE_PINK, 300);
            Sound.chance();
            await sleep(400);
        }
    }

    // 最終ゲーム: 結果発表
    async function danceEnd(event) {
        if (dance) {
            dance.hype = 2;
            dance.hypeAt = performance.now();
        }
        showTitle('ラストダンス!!', '結果は…', DANCE_PINK, 1500);
        const tick = setInterval(() => Sound.stop(1), 110);
        await sleep(1500);
        clearInterval(tick);
        if (event.zone) {
            if (dance) {
                dance.hype = 3;
                dance.hypeAt = performance.now();
                dance.cp = event.total;
            }
            startFlash('#ffd700', 700);
            startShake(config.effects.intensity.shakeLarge, 600);
            Sound.fanfare();
            setTimeout(Sound.fanfare, 450);
            showTitle('チャンスゾーン突入!!', 'SE城へ直行!!', '#ffd700', 2400);
            await sleep(2400);
            return;   // このあとのマップ移動 (SE城前) の暗転で会場を抜ける
        }
        if (dance) dance.cp = event.total;
        startFlash('#7fe0ff', 500);
        Sound.win();
        showTitle(`+${event.points} ポイント!!`, `チャンスポイント ${event.total} / ${config.chancePoint.threshold}`, '#7fe0ff', 2000);
        await sleep(2000);
        if (event.total >= config.chancePoint.threshold) return;   // 規定値に到達: このあと SE城前へ
        await playWipe(true, 300);
        dance = null;
        setNow(koori.x, KOORI_HOME_X);
        await playWipe(false, 300);
    }

    async function revengeStart(event) {
        revenge = { remaining: event.games, games: event.games };
        startFlash('#ff3a3a', 400);
        startShake(config.effects.intensity.shakeSmall, 300);
        Sound.chance();
        showTitle('リベンジチャンス!!', `${event.games}G以内にチャンス目で RASH 再突入!!`, '#ff6a6a', 2000);
        await sleep(2000);
    }

    async function revengeSuccess(event) {
        revenge = null;
        letterboxTarget = 1;
        startFlash(event.super ? SUPER_COLOR : '#ffffff', 500);
        startShake(config.effects.intensity.shakeLarge, 500);
        Sound.fanfare();
        showTitle('リベンジ成功!!', event.super ? 'SUPERおにおにRASH 復帰!!' : 'おにおにRASH 再突入!!', event.super ? SUPER_COLOR : '#ff3030', 2000);
        await sleep(2000);
        if (event.defeatCount > 0) {
            showTitle('撃破数を引き継ぎ', `${event.defeatCount}体から再スタート!!`, '#7fffd4', 1500);
            await sleep(1500);
        }
        await playWipe(true, 300);
        letterboxTarget = 0;
    }

    async function revengeEnd() {
        revenge = null;
        Sound.miss();
        showMessage('リベンジ失敗…', '#9fb8d8', 1200);
        await sleep(1000);
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

    function startFlash(color, duration = 400, strength = 1) {
        flash = { color, start: performance.now(), duration, strength };
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
            down = null;
            koori.visible = true;
            battle.visible = false;
            naiteiZone = false;
        }
        dance = null;   // ダンシングステージから SE城前へ直行するときは、この暗転中に会場を抜ける
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

    // ----- 宝物庫ゾーン -----
    const CHEST = { x: 168, y: 92, w: 40, h: 28 };

    function drawTreasure(time) {
        const bg = Backgrounds.get('treasure');
        Backgrounds.draw(ctx, 'treasure', 0);
        drawFlames(bg.torches, time);

        // 宝箱 (揃うとふたが開いて光る)
        const open = time < treasure.chestOpenUntil;
        const { x, y, w, h } = CHEST;
        if (open) {
            const glow = ctx.createRadialGradient(x + w / 2, y, 2, x + w / 2, y, 50);
            glow.addColorStop(0, 'rgba(255,240,150,0.85)');
            glow.addColorStop(1, 'rgba(255,200,50,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(x - 40, y - 50, w + 80, 80);
        }
        ctx.fillStyle = '#6a3a14';
        ctx.fillRect(x, y + 10, w, h - 10);
        ctx.fillStyle = '#c8a040';
        ctx.fillRect(x, y + 10, w, 2);
        ctx.fillRect(x + w / 2 - 3, y + 12, 6, 7);
        ctx.fillRect(x + 4, y + 10, 2, h - 10);
        ctx.fillRect(x + w - 6, y + 10, 2, h - 10);
        if (open) {
            ctx.fillStyle = '#fff2a0';
            ctx.fillRect(x + 2, y + 6, w - 4, 4);
            ctx.fillStyle = '#5a3010';
            ctx.fillRect(x, y - 10, w, 10);   // 開いたふた
            ctx.fillStyle = '#c8a040';
            ctx.fillRect(x, y - 10, w, 2);
        } else {
            ctx.fillStyle = '#7a4418';
            ctx.fillRect(x, y, w, 10);
            ctx.fillStyle = '#c8a040';
            ctx.fillRect(x, y, w, 2);
        }

        // 飛び出すコイン
        treasure.coins = treasure.coins.filter(c => time - c.born < 900);
        treasure.coins.forEach(c => {
            const t = (time - c.born) / 1000;
            const cx = x + w / 2 + c.vx * t * 60;
            const cy = y + 4 - c.vy * t * 60 + 120 * t * t;
            ctx.fillStyle = '#ffd23a';
            ctx.fillRect(Math.round(cx), Math.round(cy), 3, 3);
            ctx.fillStyle = '#fff2a0';
            ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
        });

        // 仲間とこおりくん
        drawParty(time, 70, bg.groundY, 1.5);
        const frame = Math.floor(time / 300) % 2 ? 'walk2' : 'walk1';
        drawSprite(ctx, SPRITES.koori, frame, 70, bg.groundY - 16 * KOORI_SCALE + valueAt(koori.jump, time), KOORI_SCALE);

        // 表示: ゾーン名・残りゲーム (ランプ)・上乗せの合計
        const title = '宝物庫ゾーン';
        box(4, 4, textWidth(title, 12) + 12, 17, 'rgba(0,0,0,0.75)', '#ffd23a');
        text(title, 10, 6, { color: '#ffd23a', outline: '#3a2a00' });
        const lampW = 10, gap = 3, n = treasure.games;
        const lx = W - 8 - n * (lampW + gap);
        box(lx - 5, 4, n * (lampW + gap) + 7, 15, 'rgba(0,0,0,0.75)', '#ffd23a');
        const blink = Math.floor(time / 250) % 2;
        for (let i = 0; i < n; i++) {
            const lit = i < treasure.remaining;
            ctx.fillStyle = lit ? (i === treasure.remaining - 1 && blink ? '#ffffff' : '#ffd23a') : '#3a2a10';
            ctx.fillRect(lx + i * (lampW + gap), 8, lampW, 7);
        }
        text(`次のBATTLE +${treasure.total}G`, W / 2, 26, { color: '#fff2a0', size: 16, align: 'center', outline: '#3a2a00' });
    }

    async function treasureStart(event) {
        clearMessage();
        letterboxTarget = 1;
        startFlash('#ffd23a', 600);
        startShake(config.effects.intensity.shakeLarge, 500);
        Sound.fanfare();
        treasure = { remaining: event.games, games: event.games, total: 0, chestOpenUntil: 0, coins: [] };
        showTitle('宝物庫ゾーン突入!!', `${event.games}G間 柄を揃えて次のBATTLEのゲーム数を増やせ!`, '#ffd23a', 2400);
        await sleep(2400);
        letterboxTarget = 0;
    }

    async function treasureGame(event) {
        if (!treasure) return;
        treasure.remaining = event.remaining;
        if (event.added > 0) {
            treasure.total = event.total;
            const now = performance.now();
            treasure.chestOpenUntil = now + 900;
            for (let i = 0; i < 8 + event.added; i++) {
                treasure.coins.push({ born: now + i * 15, vx: Math.random() * 2 - 1, vy: 1.2 + Math.random() * 1.4 });
            }
            const big = event.added >= 10;
            if (big) startFlash('#ffffff', 400);
            startShake(big ? config.effects.intensity.shakeLarge : config.effects.intensity.shakeSmall, 250);
            if (big) Sound.fanfare(); else Sound.win();
            damageNumbers.push({ text: `+${event.added}G`, color: big ? '#ff6a3a' : '#ffd23a', size: big ? 16 : 12, born: now });
            await animateTo(koori.jump, -10, 120);
            await animateTo(koori.jump, 0, 120);
            await sleep(500);
        } else {
            showMessage('…', '#aaaaaa', 500);
            await sleep(400);
        }
    }

    async function treasureEnd(event) {
        nextBonusGames = event.bonusGames;
        showTitle('宝物庫ゾーン終了', `次のBATTLE +${event.total}G!!`, '#ffd23a', 2000);
        Sound.fanfare();
        await sleep(2000);
        treasure = null;
    }

    // ----- 演出: お仲間チャレンジ -----
    async function companionChallenge(event) {
        clearMessage();
        visitor = { id: event.memberId, x: animated(W + 20), silhouette: true, alpha: animated(1) };
        startFlash('#7fffd4', 300);
        Sound.chance();
        showTitle('お仲間チャレンジ!!', '仲間になりたそうに こちらを見ている…', '#7fffd4', 1400);
        await animateTo(visitor.x, 176, 900);
        await sleep(500);
        // こおりくんが声をかける
        await animateTo(koori.jump, -8, 120);
        await animateTo(koori.jump, 0, 120);
        showMessage('仲間になって!!', '#ffffff', 1000);
        await sleep(1000);
        showMessage('…', '#aaaaaa', 900);
        await sleep(900);
        visitor.silhouette = false;
        if (event.success) {
            startFlash('#ffffff', 500);
            startShake(config.effects.intensity.shakeSmall, 300);
            Sound.fanfare();
            const member = config.companions.members.find(m => m.id === event.memberId);
            showTitle(`${event.name}が仲間になった!!`,
                `突入率×${member.castleEntry} / 追加ダメージ+${member.extraDamage} / 肩代わり${Math.round(member.saveRate * 100)}%`,
                '#7fffd4', 2200);
            await sleep(1000);
            // こおりくんの後ろへ走っていく
            const k = party.length;
            await animateTo(visitor.x, valueAt(koori.x) + 8 - COMPANION_GAP * (k + 1), 700);
            visitor = null;
            party.push(event.memberId);
            await sleep(500);
        } else {
            Sound.miss();
            showTitle('ことわられた…', `${event.name}は去っていった`, '#9fb8d8', 1600);
            await sleep(500);
            animateTo(visitor.alpha, 0, 900);
            await animateTo(visitor.x, W + 30, 900);
            visitor = null;
            await sleep(200);
        }
    }

    // 肩代わり: 仲間がかばって RASH 継続、その仲間は離脱
    async function companionSave(event) {
        const id = event.memberId;
        await enemySpecial(event.enemyId, { hitKoori: false });
        startFlash('#7fffd4', 400);
        Sound.bigHit();
        showTitle(`${event.name}がかばってくれた!!`, `RASH継続!! BATTLE +${event.games}G`, '#7fffd4', 2200);
        if (party.includes(id)) {
            await animateTo(jumpOf(id), -16, 200);
            await animateTo(jumpOf(id), 0, 200);
        }
        await sleep(1200);
        party = party.filter(p => p !== id);
        Sound.miss();
        showMessage(`${event.name}は力尽きた…`, '#aaccff', 1200);
        battle.games = event.games;
        await sleep(1200);
    }

    // ----- 演出: 城突入チャレンジ -----
    async function challengeIntro(event) {
        const timing = config.effects.timing;
        scene = 'challenge';
        letterboxTarget = 1;
        startFlash('#ff3030', 500);
        startShake(config.effects.intensity.shakeSmall, 400);
        // 仲間とオーラの倍率はまとめて表示 (帯の幅に収まるように)
        const mult = event.companionBoost * (event.chanceBoost ? config.castle.chanceBoost : 1);
        const boost = mult > 1 ? `（突入率×${Math.round(mult * 100) / 100}）` : '';
        showTitle('城突入チャレンジ!!', `${event.games}G以内に チャンス目を引け！${boost}`, '#ff8080', timing.castleMovie);
        koori.moving = true;
        await animateTo(koori.x, 112, timing.castleMovie * 0.5);
        koori.moving = false;
        await sleep(timing.castleMovie * 0.5);
        letterboxTarget = 0;
    }

    // SE城前でチャンス目: こおりくんが赤いオーラをまとい、突入率UP
    async function castleBoost(event) {
        kooriAura = true;
        startFlash('#ff3030', 400);
        startShake(config.effects.intensity.shakeSmall, 300);
        Sound.chance();
        showTitle('突入率UP!!', `こおりくんが燃えている！（突入率×${event.rate}）`, '#ff5a5a', 1600);
        await sleep(1600);
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

    async function castleEntry(event) {
        const timing = config.effects.timing;
        scene = 'entry';
        letterboxTarget = 1;
        // こおりくんのカットイン「こおりばりきつよい！」→ 門が開く
        startFlash('#ffd700', 400);
        Sound.chance();
        await playCutIn('koori', config.castle.entryCutIn, '#b01828', 1400, '突入成功!!');
        startFlash('#ffffff', 600);
        startShake(config.effects.intensity.shakeLarge, 500);
        if (event.oni) {
            showTitle('7・7・BAR!! 突入!!', '最初の相手は おにおに!!', '#ff4040', timing.castleMovie);
        } else {
            showTitle('突入!!', '城の門が開いた！', '#ffd700', timing.castleMovie);
        }
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
        down = null;
        logoSuper = state.mode === MODES.SUPER_RASH;
        setNow(gate, 0);
        setNow(koori.x, KOORI_BATTLE_X);
        koori.visible = true;
        koori.moving = false;
        battle.visible = false;
        battle.enemyId = null;
        battle.games = null;
        battle.defeats = state.rash.defeatCount;   // リベンジで引き継いだ撃破数 (ふつうは 0)
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

        nextBonusGames = 0;
        battle.enemyId = event.enemyId;
        battle.maxHp = event.hp;
        battle.games = event.games;
        battle.breakActive = false;
        battle.winGuaranteed = Boolean(event.winGuaranteed);
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
        await enemySay(event.enemyId, 'intro');
        // ふるカワの返事
        if (event.furukawa) {
            FurukawaView.show(event.furukawa);
            await sleep(config.furukawa.replyWait);
        }
        const sub = event.bonusGames > 0 ? `BATTLE ${event.games}G（+${event.bonusGames}G）` : `BATTLE ${event.games}G`;
        if (event.isGoldDog) {
            startFlash('#ffd700', 800);
            startShake(config.effects.intensity.shakeLarge, 600);
            Sound.fanfare();
            showTitle('ゴールド金面犬 降臨!!', `倒せば2000枚!!　${sub}`, SUPER_COLOR, timing.battleIntro * 1.5);
            await sleep(timing.battleIntro * 1.5);
        } else {
            startShake(config.effects.intensity.shakeSmall, 200);
            showTitle(`VS ${event.name}`, sub, logoColor(), timing.battleIntro);
            await sleep(timing.battleIntro);
        }
        // 内定の時ゾーン突破の特典
        if (event.winGuaranteed) {
            startFlash(SUPER_COLOR, 400);
            Sound.fanfare();
            showTitle('勝利確定!!', `${event.name}を必ず倒せる!!`, SUPER_COLOR, 1600);
            await sleep(1600);
        }
    }

    // こおりくんの攻撃 → ヒット (白く光る・揺れ・ダメージの数字・HPバーが減る)
    async function damage(event) {
        const timing = config.effects.timing;
        const intensity = config.effects.intensity;
        battle.games = event.gamesRemaining;
        battle.probUpGames = event.probUpGames;
        if (event.amount <= 0 && !event.guarded) return;   // ベル・ハズレは攻撃なし

        let kooriFx = null;   // こおりくんがとどめを刺すときの必殺技のエフェクト
        if (event.freeze) {
            await playCutIn('koori', '完全撃破!!', '#8a2ab0');
        } else if (event.finishBy === 'koori' && !event.finalBlow) {
            // こおりくんがとどめ: 必殺技 (内定の時は HP が残っていても、このカットインで決着)
            kooriFx = await kooriSpecial(event.finishKill, Boolean(event.finisher));
        } else if (event.big && Math.random() < config.effects.cutInRate) {
            await playCutIn('koori', event.kill ? '必殺!!' : 'くらえ!!', event.kill ? '#b01828' : '#1a5ab0');
        }
        koori.moving = true;
        await animateTo(koori.x, ENEMY_X - 56, 150);
        battle.hurtUntil = performance.now() + 300;
        hitFx(kooriFx);
        startShake(event.big ? intensity.shakeLarge : intensity.shakeSmall, event.big ? 400 : 150);
        if (event.big) startFlash('#ffffff', 300);
        if (event.big) Sound.bigHit(); else Sound.hit();
        // こおりくん自身の分 (仲間の追加ダメージは後で別に表示)
        const extraSum = (event.companionHits || []).reduce((sum, h) => sum + h.amount, 0);
        damageNumbers.push({
            text: event.guarded ? 'ガード!' : `-${event.amount - extraSum}`,
            color: event.guarded ? '#aaccff' : event.big ? '#ff4040' : '#ffe45a',
            size: event.big ? 16 : 12,
            born: performance.now()
        });
        // 仲間の追撃 (こおりくんの攻撃に続いて、仲間がジャンプしてダメージ)
        const hits = event.guarded ? [] : (event.companionHits || []);
        // まずこおりくんの分だけ HP を減らし、仲間の追撃で残りを減らす
        // とどめの一撃は、まずガードで HP1 残す
        animateTo(battle.hp, event.finalBlow ? 1 : hits.length ? event.hp + extraSum : event.hp, 300);
        await sleep(timing.hitStop + 100);
        await animateTo(koori.x, KOORI_BATTLE_X, 250);
        koori.moving = false;
        for (const hit of hits) {
            // 仲間がとどめ: 必殺技のカットイン → 追撃が当たった瞬間にエフェクト
            const companionFx = hit.id === event.finishBy ? await companionSpecial(hit.id) : null;
            if (!party.includes(hit.id)) {
                hitFx(companionFx);
                continue;
            }
            animateTo(jumpOf(hit.id), -12, 120).then(() => animateTo(jumpOf(hit.id), 0, 140));
            await sleep(120);
            battle.hurtUntil = performance.now() + 150;
            hitFx(companionFx);
            Sound.hit();
            damageNumbers.push({ text: `+${hit.amount}`, color: '#7fffd4', size: 10, born: performance.now() });
            await sleep(160);
        }
        if (hits.length) {
            animateTo(battle.hp, event.hp, 250);
            await sleep(250);
        }
        if (event.finalBlow) await finalBlow(event);
        if (event.guardBreak) {
            startFlash('#c080ff', 400);
            showMessage('ガードブレイク!!', '#e0b0ff', 900);
            await sleep(900);
        } else if (event.kill) {
            showMessage('一撃必殺!!', '#ff4040', 800);
        }
    }

    // とどめの一撃: ガードで HP1 残った敵へ、カットインのあとガード無視の 1 ダメージ
    async function finalBlow(event) {
        const intensity = config.effects.intensity;
        startFlash('#ff8c1a', 300);
        Sound.chance();
        await playCutIn('koori', 'とどめの一撃!', '#c04a00', 1300, 'ガード無視!!');
        koori.moving = true;
        await animateTo(koori.x, ENEMY_X - 56, 120);
        battle.hurtUntil = performance.now() + 300;
        startShake(intensity.shakeLarge, 400);
        startFlash('#ffffff', 300);
        Sound.bigHit();
        damageNumbers.push({ text: '-1', color: '#ff4040', size: 16, born: performance.now() });
        animateTo(battle.hp, event.hp, 300);
        await sleep(config.effects.timing.hitStop + 100);
        await animateTo(koori.x, KOORI_BATTLE_X, 250);
        koori.moving = false;
    }

    // ----- 演出: 内定の時ゾーン -----
    // 暗転 →「ここから先」(白) →「内定を持たぬものは / 通す事は出来ない」(赤・大) → ゾーンの場面 → 仲間抽選 → 敵の登場
    async function naiteiStart(event) {
        const timing = config.naitei.timing;
        const intensity = config.effects.intensity;
        clearMessage();
        gateText = { start: performance.now(), lines: [], fadeStart: 0 };
        Sound.miss();
        await sleep(timing.black);
        gateText.lines.push({ text: 'ここから先', color: '#ffffff', size: 14, y: 30, born: performance.now() });
        Sound.stop(2);
        await sleep(timing.text1);
        const now = performance.now();
        gateText.lines.push(
            { text: '内定を持たぬものは', color: '#ff1a1a', size: 22, y: 60, born: now, shake: true, outline: '#3a0000' },
            { text: '通す事は出来ない', color: '#ff1a1a', size: 22, y: 88, born: now, shake: true, outline: '#3a0000' }
        );
        Sound.bigHit();
        await sleep(timing.text2);

        // 暗転したまま ゾーンの場面に切り替える
        naiteiZone = true;
        battle.visible = false;
        battle.enemyId = null;
        battle.games = null;
        battle.breakActive = false;
        setNow(koori.x, KOORI_BATTLE_X);
        koori.visible = true;
        gateText.fadeStart = performance.now();
        await sleep(500);
        gateText = null;
        startFlash(NAITEI_COLOR, 500);
        startShake(intensity.shakeLarge, 500);
        Sound.fanfare();
        const logoStart = performance.now();
        bigLogo = {
            text: '内定の時', sub: `突破率 約${Math.round(event.winRate * 100)}%!! チャンス目で突破を狙え`, color: NAITEI_COLOR, outline: '#300010',
            size: 24, start: logoStart, until: logoStart + 2200
        };
        await sleep(2200);
        bigLogo = null;

        // 仲間抽選 (まだ仲間でない人がいるときだけ)
        if (event.companions.length) {
            Sound.chance();
            showTitle('仲間抽選!!', '内定の時に 駆けつけるのは…', '#7fffd4', 1200);
            await sleep(1200);
            const joined = event.companions.filter(c => c.success);
            for (const c of joined) {
                if (!party.includes(c.memberId)) party.push(c.memberId);
                startFlash('#7fffd4', 300);
                Sound.fanfare();
                showTitle(`${c.name}が駆けつけた!!`, '仲間になった!!', '#7fffd4', 1300);
                await animateTo(jumpOf(c.memberId), -12, 150);
                await animateTo(jumpOf(c.memberId), 0, 150);
                await sleep(1000);
            }
            if (!joined.length) {
                Sound.miss();
                showTitle('誰も来なかった…', null, '#9fb8d8', 1200);
                await sleep(1200);
            }
        }

        // シーシャ・ナイテイ・ナイナイの登場
        battle.enemyId = event.enemyId;
        battle.maxHp = event.hp;
        battle.games = event.games;
        setNow(battle.hp, event.hp);
        setNow(battle.alpha, 1);
        setNow(battle.drop, 0);
        setNow(battle.x, W + 60);
        battle.visible = true;
        await animateTo(battle.x, ENEMY_X, 600);
        startShake(intensity.shakeLarge, 400);
        Sound.bigHit();
        await playCutIn(event.enemyId, '内定は…?', '#5a0a1a', 1500);
        showTitle(event.name, `${event.games}G以内に倒せば突破!!`, NAITEI_COLOR, config.effects.timing.battleIntro);
        await sleep(config.effects.timing.battleIntro);
    }

    // ゾーンの結果。突破 → 撃破ボーナス (このあと SUPER 突入の演出が続くことがある)
    // 失敗 → おにおにRASH なら RASH 終了で SE城へ (このあとマップ移動・城突入チャレンジが続く)、SUPER なら継続
    async function naiteiResult(event) {
        const intensity = config.effects.intensity;
        if (event.win) {
            // アルアルの復活: いったん負けて (ナイナイの必殺技)、アルアルがナイナイを一撃で倒す
            if (event.aruaru) {
                await enemySpecial(battle.enemyId);
                knockDown();
                Sound.miss();
                await sleep(900);
                await playAruaru();
            }
            battle.hurtUntil = performance.now() + 800;
            Sound.defeat();
            startFlash('#ffd700', 600);
            startShake(intensity.shakeLarge, 500);
            animateTo(battle.alpha, 0, 800);
            animateTo(battle.drop, 20, 800);
            battle.defeats = event.defeatCount;
            await sleep(900);
            battle.visible = false;
            battle.enemyId = null;
            battle.games = null;
            await playNaiteiGet();
            aruaruAlly = null;
            naiteiZone = false;
            showTitle('突破!!', '内定を勝ち取った!!', '#ffd700', 1800);
            if (event.furukawa) FurukawaView.show(event.furukawa);   // ふるカワの撃破のひとこと
            await sleep(1800);
            Sound.win();
            showTitle('突破ボーナス', bonusText(event.bonus), '#7fffd4', 1600);
            await sleep(1600);
            if (event.winNextBattle) {
                startFlash(SUPER_COLOR, 400);
                Sound.fanfare();
                showTitle('次のBATTLE', '勝利確定!!', SUPER_COLOR, 1800);
                await sleep(1800);
            }
            return;
        }

        await enemySpecial(battle.enemyId);
        knockDown();
        Sound.miss();
        battle.games = null;
        showTitle('突破失敗…', '内定は もらえなかった', '#9fb8d8', 2000);
        await sleep(2000);
        await animateTo(battle.x, W + 60, 600);
        battle.visible = false;
        battle.enemyId = null;
        if (event.toCastle) {
            TrophyView.show(event.trophy);
            showTitle('おにおにRASH 終了', `獲得 ${event.coinsWon}枚　撃破 ${event.defeatCount}体`, RASH_COLOR, 2500);
            if (event.furukawa) FurukawaView.show(event.furukawa);   // ふるカワの「おつかれさま！」など
            await sleep(2500);
            await EndCardView.show(event.endCard);   // 設定示唆の1枚絵
            showTitle('SE城突入ゾーンへ戻る', 'もう一度 城を目指せ!!', '#ff8080', 1600);
            await sleep(1600);
            pendingScene = 'field';   // 次のマップ移動 (SE城前) の暗転中に切り替える
            return;
        }
        naiteiZone = false;
        down = null;   // SUPER は続くので起き上がる
        startFlash(SUPER_COLOR, 400);
        Sound.fanfare();
        showTitle('SUPER継続!!', '次の相手を決めるぞ', SUPER_COLOR, 1600);
        await sleep(1600);
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
        if (event.furukawa) FurukawaView.show(event.furukawa);   // ふるカワの撃破のひとこと
        await sleep(timing.defeatMovie);
        battle.visible = false;
        battle.enemyId = null;
        battle.games = null;
        battle.breakActive = false;
        battle.winGuaranteed = false;

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
    async function superStart(event) {
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
        // 母・ともいしが見ている (図鑑のともいしもここで解禁)。セリフは GameFlow が選ぶ (デバッグの強制遷移ではここで選ぶ)
        const tomo = config.tomoishi;
        const tomoLine = event.tomoishiLine || tomo.superLines[Math.floor(Math.random() * tomo.superLines.length)];
        await playCutIn('tomoishi', tomoLine, '#7a4ab0', 1800, tomo.name);
        letterboxTarget = 0;
        if (event.furukawa) FurukawaView.show(event.furukawa);   // ふるカワの返事
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
            await enemySpecial(event.enemyId);
            knockDown();
            Sound.miss();
            showTitle('RASH終了…', null, '#9fb8d8', 1500);
            // 復活が決まっていても通常時には戻らず、暗いまま止まる (次のレバー ON で復活演出)
            if (event.revival) defeatDim = true;
        }
        await sleep(1500);
    }

    // ----- 復活演出 -----
    let defeatDim = false;     // 復活待ち: RASH の場面を暗くして止める
    let revival = null;        // { phase: 'black' | 'glow', start }

    // 復活待ちでレバー ON: 画面が暗転する
    function revivalBlackout() {
        revival = { phase: 'black', start: performance.now() };
    }

    // 暗転 → こおりくんが光り輝いてフラッシュ →「こおりまだまえる！」→ 戦っていた敵を撃破
    async function revivalEffect(event) {
        const intensity = config.effects.intensity;
        if (!revival) revivalBlackout();
        defeatDim = false;
        await sleep(700);
        revival = { phase: 'glow', start: performance.now() };
        down = null;
        Sound.rainbow();
        for (let i = 0; i < 3; i++) {
            startFlash('#ffffff', 250);
            await sleep(380);
        }
        startFlash('#ffd700', 700);
        startShake(intensity.shakeLarge, 500);
        Bgm.setPaused(false);
        Sound.fanfare();
        showTitle(config.revival.text, '復活!!', '#ffd700', 2000);
        await sleep(2000);
        revival = null;
        // 一撃で撃破
        koori.moving = true;
        await animateTo(koori.x, ENEMY_X - 56, 150);
        battle.hurtUntil = performance.now() + 600;
        startFlash('#ffffff', 300);
        startShake(intensity.shakeLarge, 400);
        Sound.bigHit();
        damageNumbers.push({ text: `-${event.amount}`, color: '#ffd700', size: 16, born: performance.now() });
        animateTo(battle.hp, 0, 300);
        await animateTo(koori.x, KOORI_BATTLE_X, 250);
        koori.moving = false;
        await sleep(300);
    }

    function drawRevival(time) {
        if (scene !== 'rash') return;
        if (!revival) {
            if (defeatDim) {
                ctx.fillStyle = 'rgba(0,0,12,0.7)';
                ctx.fillRect(0, 0, W, H);
            }
            return;
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (revival.phase !== 'glow') return;
        // 暗闇の中で、こおりくんだけが光り輝く
        const t = time - revival.start;
        const hall = Backgrounds.get(logoSuper && !naiteiZone ? 'goldHall' : 'castleHall');
        const size = 16 * KOORI_SCALE;
        const x = valueAt(koori.x, time);
        const cx = x + size / 2, cy = hall.groundY - size / 2;
        const radius = Math.min(1, t / 400) * (56 + 6 * Math.sin(time / 90));
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
        glow.addColorStop(0, 'rgba(255,255,220,0.95)');
        glow.addColorStop(0.4, 'rgba(255,215,0,0.6)');
        glow.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        for (let i = 0; i < 12; i++) {
            const a = time / 600 + (i / 12) * Math.PI * 2;
            line(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22, cx + Math.cos(a) * radius * 1.4, cy + Math.sin(a) * radius * 1.4,
                i % 2 ? 'rgba(255,255,255,0.7)' : 'rgba(255,215,0,0.7)', 2);
        }
        drawSprite(ctx, SPRITES.koori, 'walk1', x, hall.groundY - size, KOORI_SCALE);
    }

    // エンディング (SUPER 中におにおにを撃破。js/lcd/ending-view.js)
    async function ending(event) {
        clearMessage();
        titleCard = null;
        await StoryView.play('ending');
        if (event.furukawa) FurukawaView.show(event.furukawa);   // ふるカワのひとこと
    }

    async function rashEnd(event) {
        const name = event.wasSuper ? 'SUPERおにおにRASH' : 'おにおにRASH';
        TrophyView.show(event.trophy);
        showTitle(`${name} 終了`, `獲得 ${event.coinsWon}枚　撃破 ${event.defeatCount}体`, logoColor(), 2500);
        if (event.furukawa) FurukawaView.show(event.furukawa);   // ふるカワの「おつかれさま！」など
        await sleep(2500);
        if (event.companionNames && event.companionNames.length) {
            showTitle('仲間たちは帰っていった', `${event.companionNames.join('・')} ありがとう！`, '#7fffd4', 1800);
            await sleep(1800);
            party = [];
        }
        await EndCardView.show(event.endCard);   // 設定示唆の1枚絵
        pendingScene = 'field';
    }

    // GameFlow が返した events を順に演出する
    async function playEvents(events) {
        for (const event of events) {
            if (typeof Lights !== 'undefined') Lights.event(event);   // 筐体の 光 (当たりは 虹色。js/lights.js)
            switch (event.type) {
                case 'payout':
                    if (event.amount > 0) {
                        if (scene === 'rash') {
                            // ボーナス中は 画面の 右上に 合計が 出るので 出さない (解説の 枠に 重なる)
                            if (!bonusView) popups.push({ text: `+${event.amount}枚`, color: '#ffe45a', born: performance.now() });
                        } else {
                            showMessage(`WIN!! +${event.amount}`, '#ffe45a');
                        }
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
                case 'castleBoost':
                    await castleBoost(event);
                    break;
                case 'challengeStart':
                    await challengeIntro(event);
                    break;
                case 'challengeGame':
                    if (!event.success) await challengeBounce();
                    break;
                case 'castleEntry':
                    await castleEntry(event);
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
                case 'revival':
                    await revivalEffect(event);
                    break;
                case 'rashEnd':
                    await rashEnd(event);
                    break;
                case 'break':
                    await breakStart();
                    break;
                case 'naiteiStart':
                    await naiteiStart(event);
                    break;
                case 'naiteiResult':
                    await naiteiResult(event);
                    break;
                case 'revengeStart':
                    await revengeStart(event);
                    break;
                case 'danceStart':
                    await danceStart();
                    break;
                case 'danceGame':
                    await danceGame(event);
                    break;
                case 'danceEnd':
                    await danceEnd(event);
                    break;
                case 'revengeGame':
                    if (revenge) revenge.remaining = event.remaining;
                    break;
                case 'revengeSuccess':
                    await revengeSuccess(event);
                    break;
                case 'revengeEnd':
                    await revengeEnd();
                    break;
                case 'treasureStart':
                    await treasureStart(event);
                    break;
                case 'pseudoBonusStart':
                    await pseudoBonusStart(event);
                    break;
                case 'pseudoBonusGame':
                    await pseudoBonusGame(event);
                    break;
                case 'pseudoBonusEnd':
                    await pseudoBonusEnd(event);
                    break;
                case 'ceiling':
                    await ceiling(event);
                    break;
                case 'heavenHint':
                    await heavenHint(event);
                    break;
                case 'modeHint':
                    modeHint(event);
                    break;
                case 'zoneHit':
                    await zoneHit(event);
                    break;
                case 'treasureGame':
                    await treasureGame(event);
                    break;
                case 'treasureEnd':
                    await treasureEnd(event);
                    break;
                case 'bonusGames':
                    nextBonusGames = event.bonusGames;
                    break;
                case 'companionChallenge':
                    await companionChallenge(event);
                    break;
                case 'companionSave':
                    await companionSave(event);
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
                    await superStart(event);
                    break;
                case 'ending':
                    await ending(event);
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

    return {
        init, showMessage, clearMessage, playEvents, renderFrame, startPreview, stopPreview,
        reach, push, reachResult, longFreeze, playChanceEffect, revivalBlackout, chanceCutIn, startFlash, setZencho, noiseFx,
        playOpening: () => StoryView.play('opening'),
        skipStory: () => StoryView.skip(),
        storyActive: () => StoryView.active(),
        hideTrophy: () => TrophyView.hide(),
        showEndCard: id => EndCardView.show(id),
        showFurukawa: talk => FurukawaView.show(talk),
        hideFurukawa: () => FurukawaView.hide()
    };
})();
