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
    let tokka = null;          // 上乗せ特化ゾーン (makeTokkaView)
    let chanceTimeView = null; // こおりチャンスタイム { games, remaining, points }
    let tokkaSelect = null;    // 特化ゾーンの見せ方を選ぶ画面 { index, until, resolve }
    let handlers = {};         // main.js から: chooseTokka (選んだ見せ方を state に入れる)・selectStart / selectEnd (ボタンを押せるようにする)
    let streak = 0;            // 表示中の連数

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
        killRate: animated(0), // 撃破率 (2026-10-27。表示用。0〜1、復活は 7.77)
        killUp: 0,             // 撃破率が 上がった 時刻 (枠を 光らせる)
        nameColor: 'white',    // 敵の 名前の 色 (撃破 確定の セットは ときどき 赤 / 金。2026-10-27)
        hurtUntil: 0
    };
    let killSplash = null;     // 全画面の「撃破率 〇〇%」{ rate, from, start, duration, sub }
    let miniView = null;       // ミニゲーム中 (2026-10-27) { kind, games, remaining, rainbow, msg, msgAt }
    // 演出が 始まるまで 止めて おく 表示 (2026-10-27 ユーザー指定: 結果が 先に 見えないように)。main.js が hold() / release()
    let held = null;
    function hold() {
        const n = state.normal, c = state.challenge;
        held = { cp: n.chancePoint, mini: n.mini ? { ...n.mini } : null, castleWait: n.castleWaitRemaining, challengeLeft: c.gamesRemaining, chanceBoost: c.chanceBoost, normal: state.mode === MODES.NORMAL };
    }
    function release() { held = null; }
    const shownNormal = () => held || { cp: state.normal.chancePoint, mini: state.normal.mini, castleWait: state.normal.castleWaitRemaining,
        challengeLeft: state.challenge.gamesRemaining, chanceBoost: state.challenge.chanceBoost, normal: state.mode === MODES.NORMAL };
    let hanase = null;         // 第 3 停止の「はなせ!!」{ color, until }

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
        // 特化ゾーンの見せ方を選ぶ画面: 液晶のカードをタップで選び、選んでいるカードをもう一度タップで決定
        canvas.addEventListener('pointerdown', (e) => {
            if (!tokkaSelect) return;
            const r = canvas.getBoundingClientRect();
            const x = (e.clientX - r.left) * W / r.width;
            const i = Math.max(0, Math.min(3, Math.floor((x - SELECT_CARD.x0) / SELECT_CARD.step)));
            if (i === tokkaSelect.index) finishTokkaSelect();
            else tokkaSelect.index = i;
            Sound.stop(1);
        });
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
        const mg = state.mode === MODES.NORMAL && state.normal.mini;
        // 決まって まだ 始まって いない ときも ミニゲームの 画面 (タイトルは 決まった ゲームで 出す)
        miniView = mg ? { kind: mg.kind, games: mg.games, remaining: mg.remaining, rainbow: mg.rainbow, msg: null, msgAt: 0 } : null;
        chanceTimeView = state.mode === MODES.NORMAL && state.normal.chanceTime ? { ...state.normal.chanceTime } : null;
        NoticeView.clear();
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
            streak = rash.streak || 0;
            nextBonusGames = rash.bonusGames;
            const tk = rash.phase === RASH_PHASES.TOKKA ? rash.tokka : null;
            tokka = tk ? makeTokkaView(tk.kind, tk.games, tk.remaining, tk.total, tk.members, tk.members.slice(0, tk.tier)) : null;
            treasure = rash.phase === RASH_PHASES.TREASURE
                ? { remaining: rash.treasureGames, games: config.treasure.games, total: rash.treasureTotal, chestOpenUntil: 0, coins: [] }
                : null;
            battle.probUpGames = rash.probUpGames;
            battle.probUpMultiplier = rash.probUpMultiplier;
            battle.breakActive = rash.breakActive;
            setNow(battle.killRate, rash.shownRate ?? rash.killRate ?? 0);
            battle.nameColor = rash.nameColor || 'white';
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
        drawHotFrame(time);   // 熱いときに 震える 枠 (2026-10-24)
        drawCrackFx(time);    // プレミア: 液晶が ひび割れて おにおに (2026-10-24)
        requestAnimationFrame(loop);
    }

    function isWalking() {
        return scene === 'field' && displayMap !== config.map.castle && !wipe && !bubbles && !dance;
    }

    function draw(time) {
        if (tokkaSelect) {
            drawTokkaSelect(time);
            drawFlash(time);
            return;
        }
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
        } else if (scene === 'field' && miniView) {
            drawMiniScene(time);   // ミニゲーム (2026-10-27): 4 つの 専用の 場面
            drawMiniHud(time);
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
            if (chanceTimeView && scene === 'field') drawChanceTimeFurukawa(time, groundY);
            drawKoori(time);
            drawVisitor(time, groundY);
            drawBubbles(time);
            if (scene === 'field') drawNormalHud(time);
            if (scene === 'field' && chanceTimeView) NoticeView.drawChanceTime(ctx, time, chanceTimeView, config.chanceTime.multiplier);
            if (scene === 'challenge') drawChallengeHud(time);
        }
        ctx.restore();
        drawZencho(time);
        drawNoise(time);
        drawRevival(time);
        drawPopups(time);
        drawMessage(time);
        drawHanase(time);
        drawPreview(time);
        NoticeView.draw(ctx, time);   // 通常時の予告 (ステップアップ予告・群予告)
        ChanceFx.draw(time);
        drawReach(time);
        FurukawaView.draw(time);
        drawLetterbox();
        drawCutIn(time);
        drawKillSplash(time);
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
        if (kooriAura && shownNormal().chanceBoost) drawAura(time, x + size / 2, bg.groundY + jump, size);
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
            text('G', x + w - 6, BUBBLE_Y + 16, { color: dim ? '#777' : '#555', size: 10, align: 'right', outline: null });
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
            const remaining = shownNormal().castleWait;
            const label = remaining > 0 ? `城突入まで あと${remaining}G` : '城突入チャレンジ!!';
            const labelWidth = textWidth(label, 10) + 12;
            box(W - labelWidth - 4, 4, labelWidth, 15, 'rgba(60,0,20,0.75)', '#ff5a5a');
            text(label, W - labelWidth + 2, 6, { color: '#ffe0e0', size: 10, outline: null });
            return;
        }

        drawCpGauge(time);
    }

    // ゲーム数 (2026-10-27 ユーザー指定。前の チャンスポイントの ゲージ。右下、ふるカワがしゃべっている間は右上)。
    //   中身は チャンスポイント (1G ごとに +1、チャンス目などで 足す)。ミニゲームが 決まったら 数字が その 色に 変わる (虹は 城突入 確定)
    //   value で表示する値を指定できる (ダンシングステージは結果発表まで増やさない)
    function drawCpGauge(time, value = shownNormal().cp) {
        const label = `${Math.floor(Math.min(value, config.chancePoint.threshold))}G`;
        const size = 14;
        const tw = textWidth(label, size);
        const bx = W - tw - 14, by = FurukawaView.isTalking(time) ? 4 : H - 22;
        const view = shownNormal();
        const mg = view.normal ? view.mini : null;
        const color = !mg ? '#ffffff' : mg.rainbow ? killRateColor(1, time, bx + 5, bx + 5 + tw) : config.mini.kinds[mg.kind].color;
        box(bx, by, tw + 10, 18, 'rgba(0,0,0,0.6)', mg ? (mg.rainbow ? '#ffffff' : config.mini.kinds[mg.kind].color) : '#5a7a9a');
        text(label, bx + 5, by + 2, { color, size });
    }

    // ----- ミニゲーム (2026-10-27 ユーザー指定。config.mini・GameFlow.miniGame) -----
    // miniView: { kind, games, remaining, rainbow, msg, msgAt, act (いまの ゲームの 演出の 始まり), res: { success, start, dark } }
    //   トイレ探し: いそいで いる こおりくん。トイレを 見つければ 成功 / 見つからなければ「こおりいきていけないよ～！」で 失敗
    //   おにおに特訓: おにおにが 100k の ダンベルを 持ち上げて 10 秒 耐える (5G で 2 秒ずつ)。5G の あとに 結果
    //   響かせ: 映画館で ひびきまくりが 4DX を 響かせれば 成功 / 警備員に つまみ出されたら 失敗
    //   ふるカワジャッジ: まん中の ふるカワが 虹色に フラッシュ すれば 成功 / 何も 起きず 暗く なったら 失敗 (暗く なった あとの フラッシュも 成功)
    const MINI_GROUND = 120;
    const RES_MS = { toilet: 2600, training: 2800, hibiki: 3000, judge: 3000 };

    // 右上に 名前と 残りゲームの ランプ、下に ひとこと
    function drawMiniHud(time) {
        if (miniView.res) return;   // 結果の ときは 上を あけて 結果の 文字を 出す
        const k = config.mini.kinds[miniView.kind];
        const color = miniView.rainbow ? killRateColor(1, time) : k.color;
        const bw = Math.max(110, textWidth(k.short, 10) + 16), bx = W - bw - 4;
        box(bx, 4, bw, 32, 'rgba(0,0,0,0.8)', color);
        text(k.short, bx + bw / 2, 6, { color, size: 10, align: 'center', outline: null });
        const n = miniView.games, lampW = 12, gap = 4;
        const startX = bx + (bw - (lampW * n + gap * (n - 1))) / 2;
        const blink = Math.floor(time / 250) % 2;
        for (let i = 0; i < n; i++) {
            const lit = i < miniView.remaining;
            ctx.fillStyle = lit ? (i === miniView.remaining - 1 && blink ? '#ffffff' : color) : '#2a2a30';
            ctx.fillRect(startX + i * (lampW + gap), 22, lampW, 8);
        }
        if (miniView.msg && time - miniView.msgAt < 1500) text(miniView.msg, W / 2, H - 20, { color: '#ffffff', size: 12, align: 'center' });
        else text(`あと${miniView.remaining}G`, W / 2, H - 20, { color, size: 12, align: 'center' });
    }

    // 場面の 中の 文字: ミニゲーム中は 左上、結果は 上の まん中 (払い出しの「WIN!!」や タイトルと 重ならない ところ)。タイトルが 出たら 消す
    function miniSay(str, line, color, size = 16) {
        if (miniView.res && miniView.res.quiet) return;
        if (!miniView.res) return text(str, 8, 8, { color, size: 12 });
        text(str, W / 2, line ? 34 : 14, { color, size, align: 'center' });
    }
    function drawMiniScene(time) {
        const res = miniView.res;
        const t = res ? time - res.start : time - (miniView.act || 0);
        if (miniView.kind === 'toilet') drawToilet(time, t, res);
        else if (miniView.kind === 'training') drawTraining(time, t, res);
        else if (miniView.kind === 'hibiki') drawHibiki(time, t, res);
        else drawJudge(time, t, res);
    }

    // トイレ探し: 通常時の マップを 速く 流し、こおりくんが あせって 走る。成功は トイレの とびらが 来て 飛びこむ
    function drawToilet(time, t, res) {
        Backgrounds.draw(ctx, displayMap, scroll + time / 6);
        const g = Backgrounds.get(displayMap).groundY;
        const size = 16 * KOORI_SCALE;
        let x = 70 + Math.sin(time / 90) * 3;
        let frame = Math.floor(time / 70) % 2 ? 'walk2' : 'walk1';
        if (res && res.success) {
            const doorX = Math.max(W - 90, W + 30 - t * 0.25);
            drawToiletDoor(doorX, g, t > 1300);
            x = Math.min(doorX - size / 2, 70 + Math.max(0, t - 800) * 0.2);
            if (t > 1300) return miniSay('トイレ発見!! 成功!', 0, '#ffe45a');
        } else if (res) {
            frame = 'walk1';
            x = 70 + Math.sin(time / 25) * 2;   // もじもじ
            if (t > 900) frame = 'down';
        }
        drawSprite(ctx, SPRITES.koori, frame, x, g - size, KOORI_SCALE);
        // あせ
        ctx.fillStyle = '#9fe6ff';
        for (let i = 0; i < 3; i++) {
            const k = ((time / 400) + i / 3) % 1;
            ctx.fillRect(Math.round(x + size + 2 + k * 8), Math.round(g - size - 4 + k * 10), 2, 3);
        }
        if (!res) miniSay('いそげ!! トイレは どこだ…!?', 0, '#ffffff');
        else if (!res.success) {
            miniSay('こおりいきていけないよ～！', 0, '#ff8a8a', 14);
            if (t > 1500) miniSay('失敗…', 1, '#9fb8d8');
        }
    }
    function drawToiletDoor(x, g, open) {
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x - 16, g - 50, 32, 50);
        ctx.fillStyle = open ? '#1a1a1a' : '#8a6a40';
        ctx.fillRect(x - 13, g - 47, 26, 44);
        box(x - 12, g - 64, 24, 12, '#ffffff', '#3a6aff');
        text('WC', x, g - 63, { color: '#3a6aff', size: 10, align: 'center', outline: null });
    }

    // おにおに特訓: ジムで 100k の ダンベルを 持ち上げて 耐える。のこり 秒は 5G で 10 → 0
    function drawTraining(time, t, res) {
        ctx.fillStyle = '#2a2230';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#3a3040';
        for (let i = 0; i < 8; i++) ctx.fillRect(i * 34, 20, 30, 70);   // 壁の 板
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(0, MINI_GROUND, W, H - MINI_GROUND);
        const total = config.mini.kinds.training.games;
        const done = total - miniView.remaining;
        const left = res ? (res.success ? Math.max(0, 2 - t / 600) : 2) : Math.max(0, 10 - done * 2 - Math.min(1, t / 800) * 0);
        const strain = 1 + done * 0.6 + (res && !res.success ? 2 : 0);
        const fallen = res && !res.success && t > 900;
        const cx = W / 2 + (fallen ? 0 : Math.sin(time / 30) * strain * 0.7);
        const { h } = Characters.size('onioni');
        const scale = 1.4, top = MINI_GROUND - h * scale;
        if (fallen) {
            Characters.drawEnemy(ctx, 'onioni', cx, MINI_GROUND, { scale, frame: 0, hurt: true });
            drawDumbbell(cx + 30, MINI_GROUND - 8, 1);
            text('ドスン!!', cx + 30, MINI_GROUND - 40, { color: '#ff8a3a', size: 14, align: 'center' });
        } else {
            const lift = res && !res.success ? Math.min(1, t / 900) * 30 : 0;   // 落ちて いく
            Characters.drawEnemy(ctx, 'onioni', cx, MINI_GROUND, { scale, frame: Math.floor(time / 200) % 2 });
            drawDumbbell(cx, top - 10 + lift, 1);
        }
        // のこり 秒
        const sec = res && res.success && t > 1200 ? 0 : Math.ceil(left);
        text(`${sec}`, 30, 50, { color: sec <= 2 ? '#ff5a5a' : '#ffffff', size: 24, align: 'center' });
        text('秒', 30, 78, { color: '#ffffff', size: 10, align: 'center' });
        if (!res) miniSay('10秒 耐えろ!!', 0, '#3fdf6f');
        else if (res.success && t > 1300) miniSay('耐えきった!! 成功!', 0, '#ffe45a');
        else if (!res.success && t > 1300) miniSay('つぶれた… 失敗', 0, '#9fb8d8');
    }
    function drawDumbbell(cx, y, s) {
        ctx.fillStyle = '#b0b0b8';
        ctx.fillRect(Math.round(cx - 44 * s), Math.round(y), Math.round(88 * s), 3);
        ctx.fillStyle = '#303038';
        for (const dx of [-44, -36, 30, 38]) ctx.fillRect(Math.round(cx + dx * s), Math.round(y - 9 * s), Math.round(6 * s), Math.round(21 * s));
        box(Math.round(cx - 15), Math.round(y - 12), 30, 11, '#202028', '#ffe45a');
        text('100k', cx, y - 12, { color: '#ffe45a', size: 10, align: 'center', outline: null });
    }

    // 響かせ: 映画館。ひびきまくりが 4DX を 響かせる (成功: 客席が ゆれて 光る / 失敗: 警備員に つまみ出される)
    function drawHibiki(time, t, res) {
        ctx.fillStyle = '#0c0a12';
        ctx.fillRect(0, 0, W, H);
        // スクリーン
        const glow = res && res.success && t > 600 ? 0.6 + 0.4 * Math.sin(time / 40) : 0.35;
        ctx.fillStyle = `rgba(160,180,255,${glow})`;
        ctx.fillRect(30, 8, W - 60, 46);
        ctx.fillStyle = '#e8e8ff';
        ctx.fillRect(34, 12, W - 68, 38);
        if (!res) text('NOW SHOWING', W / 2, 24, { color: '#2a2a4a', size: 12, align: 'center', outline: null });
        else if (res.success && t > 600 && t < 1200) text('4DX!!', W / 2, 24, { color: '#2a2a4a', size: 12, align: 'center', outline: null });
        // 客席 (成功は 4DX で ゆれる)
        const quake = res && res.success && t > 600 ? 3 : 0.6;
        for (let r = 0; r < 2; r++) {
            for (let i = 0; i < 9; i++) {
                const sx = 8 + i * 28 + (r ? 14 : 0), sy = MINI_GROUND - 10 + r * 14 + Math.sin(time / 50 + i + r) * quake;
                ctx.fillStyle = '#7a1a2a';
                ctx.fillRect(Math.round(sx), Math.round(sy), 22, 10);
                ctx.fillStyle = '#5a0a1a';
                ctx.fillRect(Math.round(sx), Math.round(sy + 8), 22, 3);
            }
        }
        // ひびきまくり と 音の 輪
        let hx = W / 2 + 20;
        const guardIn = res && !res.success;
        if (guardIn && t > 900) hx += (t - 900) * 0.12;   // つまみ出される
        const shake = res && res.success && t > 600 ? Math.sin(time / 20) * 2 : 0;
        Characters.drawEnemy(ctx, 'hibikimakuri', hx + shake, MINI_GROUND - 4, { scale: 1.2, frame: Math.floor(time / 180) % 2 });
        if (!guardIn) {
            const rings = res && res.success ? 4 : 2;
            for (let i = 0; i < rings; i++) {
                const r = ((time / (res && res.success ? 4 : 9)) + i * 12) % 48;
                ctx.strokeStyle = `rgba(192,112,255,${1 - r / 48})`;
                ctx.beginPath();
                ctx.arc(hx, MINI_GROUND - 40, r + 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        if (guardIn) {
            const gx = Math.max(hx + 26, W + 20 - t * 0.2);
            drawGuard(gx, MINI_GROUND - 2, time);
            if (t > 600) text('お客さま、こまります！', W / 2, 62, { color: '#9fe6ff', size: 10, align: 'center' });
            if (t > 1700) miniSay('つまみ出された… 失敗', 1, '#9fb8d8', 14);
        } else if (res && res.success && t > 1200) miniSay('響きまくった!! 成功!', 1, '#ffe45a');
        else if (!res) miniSay('4DX を 響かせろ!!', 0, '#c070ff');
    }
    // 警備員 (ドット絵を 四角で 描く。紺の 制服と 帽子)
    function drawGuard(x, g, time) {
        const step = Math.floor(time / 150) % 2;
        x = Math.round(x);
        ctx.fillStyle = '#1a2a5a';
        ctx.fillRect(x - 7, g - 10, 5, 10 - step);   // 足
        ctx.fillRect(x + 2, g - 10, 5, 9 + step);
        ctx.fillStyle = '#2a3a7a';
        ctx.fillRect(x - 9, g - 30, 18, 20);   // 体
        ctx.fillStyle = '#ffd23a';
        ctx.fillRect(x - 3, g - 26, 3, 3);   // バッジ
        ctx.fillStyle = '#f0c8a0';
        ctx.fillRect(x - 6, g - 42, 12, 12);   // 顔
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 3, g - 38, 2, 2);
        ctx.fillRect(x + 2, g - 38, 2, 2);
        ctx.fillStyle = '#1a2a5a';
        ctx.fillRect(x - 8, g - 46, 16, 5);   // 帽子
        ctx.fillRect(x - 10, g - 42, 20, 2);
        ctx.fillStyle = '#2a3a7a';
        ctx.fillRect(x - 16, g - 28, 8, 4);   // つまむ 手
    }

    // ふるカワジャッジ: まん中に ふるカワ。成功は 虹色の フラッシュ (暗く なって から の ことも)、失敗は 何も 起きず 暗く なる
    function drawJudge(time, t, res) {
        ctx.fillStyle = '#140a1a';
        ctx.fillRect(0, 0, W, H);
        // スポットライト
        const grad = ctx.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, 90);
        grad.addColorStop(0, 'rgba(255,240,200,0.35)');
        grad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        const scale = 3, fw = 16 * scale;
        const fx = Math.round(W / 2 - fw / 2), fy = Math.round(H / 2 - fw / 2 + 6);
        const flashAt = res && res.success ? (res.dark ? 1500 : 700) : null;
        const flashing = flashAt !== null && t > flashAt;
        if (flashing) {
            // 虹色の 輪と 光
            for (let i = 0; i < 6; i++) {
                const r = 18 + ((t - flashAt) / 6 + i * 10) % 60;
                ctx.strokeStyle = `hsla(${(i * 60 + time / 3) % 360}, 95%, 60%, ${1 - r / 80})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(W / 2, H / 2 + 6, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.lineWidth = 1;
        }
        drawSprite(ctx, SPRITES.furukawa, res ? 'idle' : Math.floor(time / 300) % 2 ? 'talk' : 'idle', fx, fy, scale);
        if (flashing) {
            ctx.fillStyle = `hsla(${(time / 2) % 360}, 95%, 60%, 0.35)`;
            ctx.fillRect(fx, fy, fw, fw);
        }
        // 暗く なる (失敗 / 暗く なってから の 成功)
        const darkEnd = flashAt !== null ? flashAt : Infinity;
        if (res && (!res.success || res.dark) && t > 500 && t < darkEnd) {
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, (t - 500) / 700)})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (!res) miniSay('ジャッジ中…', 0, '#ffffff');
        else if (flashing && t > flashAt + 400) miniSay('合格!! 成功!', 0, killRateColor(1, time, W / 2 - 40, W / 2 + 40));
        else if (!res.success && t > 1600) miniSay('不合格… 失敗', 0, '#9fb8d8');
    }

    async function miniDecided(event) {
        // 数字の 色が 変わる (ゲーム数の 表示が state を 見て 色を 変える)。ちいさく 光って 知らせる
        const k = config.mini.kinds[event.kind];
        startFlash(event.rainbow ? '#ffffff' : k.color, 300, 0.5);
        if (event.rainbow) Sound.rainbow(); else Sound.chance();
        await sleep(500);
        // タイトルは 決まった ゲームの うちに 出す (2026-10-27 ユーザー指定)。内部では 次の ゲームが 1G 目なので、
        // 次の ゲームで タイトルを 出すと 出た とたんに 1G 減って、見た目では 4 回しか 回せなかった
        await miniIntro({ kind: event.kind, games: k.games, rainbow: event.rainbow });
    }
    async function miniStart(event) {
        if (miniView) return;   // タイトルは 決まった ゲームで 出した
        await miniIntro(event);
    }
    async function miniIntro(event) {
        const k = config.mini.kinds[event.kind];
        miniView = { kind: event.kind, games: event.games, remaining: event.games, rainbow: event.rainbow, msg: null, msgAt: 0, act: performance.now(), res: null };
        startFlash(k.color, 400);
        Sound.chance();
        showTitle(k.name, event.rainbow ? '城突入 確定!!' : `${event.games}G 以内に 成功させろ!!`, event.rainbow ? '#ffd700' : k.color, 1800);
        if (event.kind === 'judge') FurukawaView.show({ text: 'わたしが ジャッジするよ！', color: 4, heat: 4 });
        await sleep(1800);
    }
    async function miniGameFx(event) {
        if (!miniView) return;
        miniView.remaining = event.remaining;
        miniView.act = performance.now();
        if (event.success || event.remaining <= 0) return;
        const k = config.mini.kinds[event.kind];
        const msg = k.miss[Math.floor(Math.random() * k.miss.length)];
        if (event.kind === 'judge') FurukawaView.show({ text: msg, color: 4, heat: 3 });
        else {
            miniView.msg = msg;
            miniView.msgAt = performance.now();
        }
        if (event.kind === 'training') Sound.hit();
        await sleep(400);
    }
    async function miniResult(event) {
        const k = config.mini.kinds[event.kind];
        if (!miniView) miniView = { kind: event.kind, games: k.games, remaining: 0, rainbow: event.rainbow, msg: null, msgAt: 0, act: 0, res: null };
        // ふるカワジャッジの 成功は ときどき 暗く なってから フラッシュ (見た目だけ)
        miniView.res = { success: event.success, start: performance.now(), dark: event.kind === 'judge' && event.success && Math.random() < 0.35 };
        const ms = RES_MS[event.kind];
        if (event.success) {
            const hitAt = event.kind === 'judge' ? (miniView.res.dark ? 1500 : 700) : event.kind === 'toilet' ? 1300 : event.kind === 'training' ? 1200 : 600;
            setTimeout(() => {
                startFlash(event.kind === 'judge' || event.rainbow ? '#ffffff' : k.color, 500);
                startShake(config.effects.intensity.shakeLarge, 400);
                if (event.kind === 'judge' || event.rainbow) Sound.rainbow(); else Sound.fanfare();
            }, hitAt);
            await sleep(ms);
            miniView.res.quiet = true;   // ここからは タイトルだけ
            showTitle(k.success, event.rainbow ? '城突入 確定!!' : 'SE城へ いそげ!!', event.rainbow ? '#ffd700' : k.color, 1500);
            if (event.kind === 'judge') FurukawaView.show({ text: '合格！！ いってらっしゃい！', color: 5, heat: 5 });
            await sleep(1500);
        } else {
            setTimeout(() => Sound.miss(), event.kind === 'training' ? 900 : 1200);
            await sleep(ms);
        }
        miniView = null;
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
        const remaining = shownNormal().challengeLeft;
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
        if (tokka) {
            drawTokka(time);
            drawDamageNumbers(time);
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
        // 連数 (おにおにの出やすさに関係する)
        if (streak > 0 && !naiteiZone) {
            text(`${streak}連`, textWidth(logo, 12) + 22, 6, { color: streak >= config.rash.oni.maxStreak ? '#ff6060' : '#fff', size: 12 });
        }
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
            // 撃破率 (2026-10-27 ユーザー指定): HP の 枠の 下。数字の 色は 白 < 青 < 緑 < 紫 < 赤 < 虹 (確定)。勝利確定の BATTLE は 100%
            if (!naiteiZone) {
                const rate = valueAt(battle.killRate, time);
                const label = `撃破率 ${killRatePct(rate)}%${rate >= 1 ? ' 確定' : ''}`;
                const kw = textWidth(label, 12) + 10;
                const glow = time - battle.killUp < 600 && Math.floor(time / 90) % 2;
                box(bx + bw - kw, by + 23, kw, 16, 'rgba(0,0,0,0.8)', glow ? '#ffffff' : killRateColor(rate, time));
                text(label, bx + bw - 5, by + 25, { color: killRateColor(rate, time, bx + bw - kw, bx + bw), size: 12, align: 'right' });
            }
            if (battle.breakActive) {
                const blink = Math.floor(time / 250) % 2;
                box(bx + bw - 34, by + 40, 34, 12, 'rgba(60,0,90,0.9)', '#c080ff');
                text('BREAK', bx + bw - 17, by + 41, { color: blink ? '#ffffff' : '#e0b0ff', size: 10, align: 'center', outline: null });
            }
            const nameColor = { red: '#ff3a3a', gold: SUPER_COLOR }[battle.nameColor] || '#ffffff';   // 赤字・金字は 撃破 確定
            text(enemy.name, bx + 5, by + 2, { size: 10, outline: null, color: nameColor });
            const hp = Math.max(0, valueAt(battle.hp, time));
            const ratio = battle.maxHp ? hp / battle.maxHp : 0;
            ctx.fillStyle = '#3a0a0a';
            ctx.fillRect(bx + 5, by + 15, bw - 10, 4);
            ctx.fillStyle = ratio > 0.5 ? '#40e060' : ratio > 0.2 ? '#f0c030' : '#f04030';
            ctx.fillRect(bx + 5, by + 15, Math.round((bw - 10) * ratio), 4);
            text(`HP ${Math.ceil(hp)}`, bx + bw - 5, by + 2, { size: 10, align: 'right', outline: null, color: '#ccc' });
        }
    }

    // 撃破率の 数字 (%) と 色 (config.killRate.colors。虹は 色が 流れる)
    const killRatePct = rate => Math.round(rate * 100);
    //   x0〜x1 (文字の 左はし〜右はし) を わたすと、虹は 文字の 中を 虹の グラデーションが 流れる
    function killRateColor(rate, time, x0 = null, x1 = null) {
        let color = config.killRate.colors[0].color;
        for (const c of config.killRate.colors) if (rate >= c.min - 1e-9) color = c.color;
        if (color !== 'rainbow') return color;
        if (x0 === null) return `hsl(${Math.floor(time / 4) % 360}, 95%, 62%)`;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        for (let k = 0; k <= 6; k++) grad.addColorStop(k / 6, `hsl(${(k * 60 + time / 4) % 360}, 95%, 62%)`);
        return grad;
    }

    // 全画面の「撃破率 〇〇%」(2026-10-27 ユーザー指定: 敵が 出てきた とき。復活の 777% も)。はじめの 0.5 秒で 数字が 上がっていく
    function drawKillSplash(time) {
        if (!killSplash) return;
        const t = (time - killSplash.start) / killSplash.duration;
        if (t >= 1) {
            killSplash = null;
            return;
        }
        ctx.save();
        ctx.globalAlpha = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, W, H);
        const k = Math.min(1, (time - killSplash.start) / 500);
        const rate = killSplash.from + (killSplash.rate - killSplash.from) * k;
        // 集中線
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
            const a = i / 24 * Math.PI * 2 + time / 900;
            ctx.moveTo(W / 2 + Math.cos(a) * 44, H / 2 + Math.sin(a) * 28);
            ctx.lineTo(W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * W);
        }
        ctx.stroke();
        text('撃破率', W / 2, H / 2 - 44, { color: '#ffffff', size: 16, align: 'center' });
        const size = Math.round(40 * (k >= 1 ? 1 + Math.max(0, 0.25 - (time - killSplash.start - 500) / 800) : 1));
        const num = `${killRatePct(rate)}%`, nw = textWidth(num, size);
        text(num, W / 2, H / 2 - 18 - (size - 40) / 2, { color: killRateColor(rate, time, W / 2 - nw / 2, W / 2 + nw / 2), size, align: 'center' });
        if (killSplash.sub && k >= 1) {
            const sw = textWidth(killSplash.sub, 14);
            text(killSplash.sub, W / 2, H / 2 + 28, { color: killRateColor(killSplash.rate, time, W / 2 - sw / 2, W / 2 + sw / 2), size: 14, align: 'center' });
        }
        ctx.restore();
    }
    function playKillSplash(rate, sub = null, from = 0, duration = config.killRate.splashMs) {
        killSplash = { rate, from, sub: sub || (rate >= 1 ? '撃破確定!!' : null), start: performance.now(), duration };
        if (rate >= 1) {
            Sound.rainbow();
            startFlash('#ffffff', 400);
        } else Sound.chance();
        return sleep(duration);
    }

    // 撃破率が 上がった (役・ブレイク・長押しの チャージ・撃破役)。100% に なったら 全画面で 確定
    async function killRateUp(event) {
        battle.nameColor = event.nameColor || battle.nameColor;
        // 違和感演出 (7% / 77%) の あいだは 数字を 動かさない (100% に なったら 出す)
        if (event.shown != null && event.to < 1) {
            setNow(battle.killRate, event.shown);
            await sleep(200);
            return;
        }
        battle.killUp = performance.now();
        animateTo(battle.killRate, event.to, 400);
        const word = event.reason === 'charge' ? 'チャージ!! ' : event.reason === 'break' ? 'BREAK!! ' : '';
        damageNumbers.push({ text: `${word}撃破率 +${killRatePct(event.to) - killRatePct(event.from)}%`, color: killRateColor(event.to, performance.now()), size: 12, born: performance.now() });
        if (event.to >= 1 && event.from < 1) {
            await playKillSplash(1, '撃破確定!!', event.from, 1400);
            return;
        }
        await sleep(event.reason === 'charge' ? 700 : 350);
    }

    // 長押しの チャージ (2026-10-27): 通常時は ポイント UP、城突入チャレンジは 突入率 UP (BATTLE は 撃破率の 演出で 出す)
    async function chargeEffect(event) {
        if (event.scene === 'battle') return;
        startFlash('#ffd700', 300);
        Sound.chance();
        showTitle(event.scene === 'castle' ? `チャージ!! 突入率 ×${event.mult}` : `チャージ!! ゲーム数 ×${event.mult}`, null, '#ffd700', 1100);
        await sleep(1100);
    }

    function drawDamageNumbers(time) {
        damageNumbers = damageNumbers.filter(d => time - d.born < 900);
        damageNumbers.forEach(d => {
            const age = (time - d.born) / 900;
            const y = 56 - Math.sin(Math.min(1, age * 2) * Math.PI / 2) * 14;
            text(d.text, treasure ? CHEST.x + CHEST.w / 2 : tokka ? W / 2 : ENEMY_X, y + (tokka ? 20 : 0), { color: d.color, size: d.size, align: 'center' });
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

    // 第 3 停止の「はなせ!!」(2026-10-27 ユーザー指定: 見やすく、すぐ 消えないように)。帯の 上に 大きく 点滅
    function setHanase(color) {
        if (color) hanase = { color, until: Infinity };
        else if (hanase) hanase.until = performance.now() + 700;   // 離したあとも 少し 残す
    }
    function drawHanase(time) {
        if (!hanase) return;
        if (time > hanase.until) {
            hanase = null;
            return;
        }
        const blink = Math.floor(time / 120) % 2;
        const color = hanase.color === 'rainbow' ? killRateColor(1, time, W / 2 - 50, W / 2 + 50) : hanase.color;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 44, W, 36);
        ctx.fillStyle = blink ? '#ffffff' : (hanase.color === 'rainbow' ? '#ffd700' : hanase.color);
        ctx.fillRect(0, 44, W, 2);
        ctx.fillRect(0, 78, W, 2);
        text('はなせ!!', W / 2, 48, { color: blink ? '#ffffff' : color, size: 26, align: 'center' });
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

    // ため の 光 (2026-10-24 ユーザー指定: 長押しは ため演出): 液晶の ふちが 光って、光の 粒が まんなかへ 集まる。k: 0〜1
    let charge = null;   // { k, color }
    function setCharge(k, color = '#ffd700') { charge = k == null ? null : { k: Math.min(1, k), color }; }
    function drawCharge(time) {
        if (!charge) return;
        const { k } = charge;
        const color = charge.color === 'rainbow' ? `hsl(${Math.floor(time / 4) % 360}, 95%, 62%)` : charge.color;
        ctx.save();
        ctx.globalAlpha = 0.25 + k * 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 + k * 6;
        ctx.strokeRect(1, 1, W - 2, H - 2);
        ctx.fillStyle = color;
        for (let i = 0; i < 14; i++) {
            const a = i / 14 * Math.PI * 2 + time / 300;
            const r = (1 - ((time / 500 + i / 14) % 1)) * W * 0.45;
            ctx.fillRect(Math.round(W / 2 + Math.cos(a) * r), Math.round(H / 2 + Math.sin(a) * r * 0.6), 2, 2);
        }
        ctx.globalAlpha = 0.15 + k * 0.35;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 6 + k * 26 + Math.sin(time / 40) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawFlash(time) {
        drawCharge(time);
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
        if (reachView.list && reachView.list.length > 1) return drawMultiReach(time);
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

    // リーチが 2 つ 以上: 絵柄を ならべて「どれが出るかな？」。交互に 光り、揃ったら その 絵柄だけ 光る
    function drawMultiReach(time) {
        const list = reachView.list;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 46, W, 56);
        const lit = reachView.won ? list.findIndex(r => r.symbol === reachView.won) : Math.floor(time / 260) % list.length;
        const size = 34, gap = 14, total = list.length * size + (list.length - 1) * gap;
        const x0 = W / 2 - total / 2;
        text(reachView.won ? 'GET!!' : 'どれが出るかな？', W / 2, 48, { color: reachView.won ? '#ffd700' : '#ffffff', size: 12, align: 'center' });
        list.forEach((r, i) => {
            const x = x0 + i * (size + gap), on = i === lit;
            ctx.globalAlpha = on ? 1 : 0.35;
            if (on) {
                ctx.fillStyle = reachView.won ? '#ffd700' : (Math.floor(time / 130) % 2 ? '#ff3030' : '#ffffff');
                ctx.fillRect(x - 3, 61, size + 6, size + 6);
            }
            ctx.drawImage(Symbols.canvas(r.symbol), x, 64, size, size);
            ctx.globalAlpha = 1;
        });
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

    // list: Lottery.findReaches の 結果 (強い 絵柄から)。1 つなら 前と 同じ 表示
    function reach(list) {
        const { symbol, lineName } = list[0];
        reachView = { symbol, lineName, list, won: null, start: performance.now() };
        startFlash(symbol === 'seven' ? '#ffffff' : '#ff3030', 300);
        if (symbol === 'seven' && list.length === 1) {   // 2 つ 以上の ときは「どれが出るかな？」を 見せる
            cutIn = { who: 'koori', text: '7が来る…!?', color: '#b01828', start: performance.now(), duration: 1200 };
        }
    }

    function push() {
        showMessage('押せ!!', '#ffd700', 3000);
        startFlash('#ffd700', 300);
    }

    async function reachResult(result, symbol = null) {
        // 2 つ 以上の リーチで 揃ったら、揃った 絵柄を 光らせて から
        if (result === 'get' && reachView && reachView.list && reachView.list.length > 1) {
            reachView.won = symbol;
            startFlash('#ffd700', 500);
            await sleep(900);
        }
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
        showTitle('ダンシングステージ!!', 'ゲーム数アップ or チャンスゾーン突入!?', DANCE_PINK, 2200);
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
        showTitle(`+${event.points}G!!`, `ゲーム数 ${event.total}G`, '#7fe0ff', 2000);
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
        popups.push({ text: `+${event.amount}G`, color: big ? '#ffd700' : '#9fe6ff', born: performance.now() });
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

// ----- 上乗せ特化ゾーン (config.tokka。おにおに撃破の報酬など) -----
    // 4つの見せ方: fire (こおりファイアー) / okaLamp (おかランプ) / ikkeki (おにおに一撃入魂) / asahara (ASAHARA CHANCE)
    // 上乗せの確率はどれも同じで、見せ方だけちがう。一撃入魂と ASAHARA CHANCE は合計を最後まで見せない
    const TOKKA_COLOR = { fire: '#ff7a1a', okaLamp: '#ff4fd8', ikkeki: '#ff3030', asahara: '#ffd700' };
    const TOKKA_HIDDEN = ['ikkeki', 'asahara'];

    function makeTokkaView(kind, games, remaining, total, members, arrived) {
        return {
            kind, games, remaining, total, members, arrived,
            name: config.tokka.names[kind],
            lamp: null,            // おかランプ: 'red' | 'rainbow' (次のレバーまで点いたまま)
            lampAt: 0,
            fireLevel: 0,          // こおりファイアー: 直前の上乗せの大きさ (0〜4。4 は虹色)
            fireAt: 0,
            guaranteed: arrived.length ? config.tokka.tiers[arrived.length - 1] : 0,
            arriveAt: {},          // ASAHARA CHANCE: 仲間が歩いてきた時刻
            strikeAt: 0,           // 一撃入魂: 金棒を振り下ろした時刻
            reveal: null           // 終わりに出す合計 (一撃入魂・ASAHARA CHANCE)
        };
    }

    function fireLevelOf(add) {
        if (add >= 300) return 4;
        if (add >= 100) return 3;
        if (add >= 50) return 2;
        return add > 0 ? 1 : 0;
    }

    function drawTokka(time) {
        const t = tokka;
        if (t.kind === 'okaLamp') {
            drawTokkaLamp(time);
        } else {
            const bgId = t.kind === 'asahara' ? 'goldHall' : 'castleHall';
            const bg = Backgrounds.get(bgId);
            Backgrounds.draw(ctx, bgId, 0);
            if (bg.braziers) drawFlames(bg.braziers, time);
            const ground = bg.groundY;
            if (t.kind === 'fire') drawTokkaFire(time, ground);
            else if (t.kind === 'ikkeki') drawTokkaIkkeki(time, ground);
            else drawTokkaAsahara(time, ground);
        }

        // 表示: ゾーン名・残りゲーム (ランプ)・上乗せの合計
        const color = TOKKA_COLOR[t.kind];
        box(4, 4, textWidth(t.name, 12) + 12, 17, 'rgba(0,0,0,0.75)', color);
        text(t.name, 10, 6, { color, outline: '#200000' });
        const lampW = 6, gap = 2, n = t.games;
        const lx = W - 8 - n * (lampW + gap);
        box(lx - 5, 4, n * (lampW + gap) + 7, 15, 'rgba(0,0,0,0.75)', color);
        const blink = Math.floor(time / 250) % 2;
        for (let i = 0; i < n; i++) {
            const lit = i < t.remaining;
            ctx.fillStyle = lit ? (i === t.remaining - 1 && blink ? '#ffffff' : color) : '#3a2a10';
            ctx.fillRect(lx + i * (lampW + gap), 8, lampW, 7);
        }
        // 下の帯: 上乗せの合計 (一撃入魂・ASAHARA CHANCE は最後まで ？？？) と、保障・確定
        const hidden = TOKKA_HIDDEN.includes(t.kind) && t.reveal === null;
        const shown = hidden ? '？？？' : String(t.reveal ?? t.total);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, H - 19, W, 19);
        ctx.fillStyle = color;
        ctx.fillRect(0, H - 19, W, 1);
        text(`上乗せ ${shown}枚`, 8, H - 17, { color: '#fff2a0', size: 14, outline: '#3a2a00' });
        if (t.guaranteed && t.reveal === null) {
            const gb = Math.floor(time / 300) % 2;
            text(`${t.guaranteed}枚以上確定!!`, W - 8, H - 16, { color: gb ? '#ffffff' : '#ffd700', size: 12, align: 'right', outline: '#3a2a00' });
        } else if (t.reveal === null) {
            text(`${config.tokka.min}枚保障・最大${config.tokka.max}枚`, W - 8, H - 15, { color: '#e0d0a0', size: 10, align: 'right', outline: null });
        }
    }

    // こおりファイアー: こおりくんが炎をまとう。上乗せが大きいほど炎が高く、色が変わる (300枚以上は虹色)
    function drawTokkaFire(time, ground) {
        const t = tokka;
        ctx.fillStyle = 'rgba(30,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        // ふだんの炎は合計が増えるほど大きく、上乗せのあと少しのあいだはその大きさの炎
        const base = t.total >= 1000 ? 3 : t.total >= 300 ? 2 : 1;
        const hot = time - t.fireAt < 1800 ? Math.max(base, t.fireLevel) : base;
        const cx = W / 2, size = 16 * 3;
        const colors = [['#ffb040', '#ff5a1a'], ['#ffb040', '#ff5a1a'], ['#ffe060', '#ff2020'], ['#a0e0ff', '#4060ff']];
        const count = 28 + hot * 10;
        for (let i = 0; i < count; i++) {
            const k = (time / (600 - hot * 60) + i / count) % 1;
            const fx = cx + Math.sin(i * 2.4 + time / 250) * size * (0.45 + hot * 0.06);
            const fy = ground - k * size * (1.1 + hot * 0.35);
            const s = Math.max(1, Math.round((1 - k) * (4 + hot * 1.5)));
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = hot >= 4 ? `hsl(${(time / 4 + i * 40) % 360}, 95%, 60%)` : colors[Math.min(3, hot)][k < 0.4 ? 0 : 1];
            ctx.fillRect(Math.round(fx - s / 2), Math.round(fy), s, s * 2);
        }
        ctx.globalAlpha = 1;
        if (hot >= 4) drawRainbowGlow(cx, ground - size / 2, size, (time / 6) % 360);
        drawSprite(ctx, SPRITES.koori, Math.floor(time / 200) % 2 ? 'walk2' : 'walk1', cx - size / 2, ground - size + valueAt(koori.jump, time), 3);
        drawParty(time, cx - size / 2 - 4, ground, 1.5);
    }

    // おかランプ (新作と同じ。js/lcd/okalamp-view.js): まんなかで8頭身のおかがっぱがキレのあるダンスを踊り、
    // 頭のランプがチャンス役でレバーの瞬間に点灯 (7揃い・7・7・BAR は虹色)。左右にいつものおかがっぱ
    function drawTokkaLamp(time) {
        const t = tokka;
        const ground = 120;
        OkaLampView.drawScene(ctx, time, W, H, ground, t.lamp, t.lamp ? time - t.lampAt : 99999);
        if (t.lamp && time - t.lampAt < 1200) {
            const k = time - t.lampAt;
            const size = Math.round(14 * (1 + Math.max(0, 0.5 - k / 300)));
            const rainbowLit = t.lamp === 'rainbow';
            text(rainbowLit ? 'ピカーッ！！' : 'ピカッ！', 54, 40, { color: rainbowLit ? `hsl(${(time / 3) % 360}, 95%, 62%)` : '#ff5050', size, align: 'center', outline: '#2a0008' });
        } else if (!t.lamp) {
            text('おかピポ♪ おかピポ♪', 56, 44, { color: '#e0d0ff', size: 10, align: 'center', outline: '#2a0a3a' });
        }
    }
    // おにおに一撃入魂: おにおにが金棒に気合を溜める (ゲームが進むほどオーラが大きく)。最後に千両箱を一撃
    function drawTokkaIkkeki(time, ground) {
        const t = tokka;
        ctx.fillStyle = 'rgba(40,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        const charge = (t.games - t.remaining) / t.games;
        const ox = 96;
        const pulse = 0.25 + 0.2 * Math.sin(time / 120) + charge * 0.3;
        ctx.fillStyle = `rgba(255,40,20,${Math.min(0.8, pulse)})`;
        ctx.beginPath();
        ctx.ellipse(ox, ground - 40, 26 + charge * 22, 40 + charge * 18, 0, 0, Math.PI * 2);
        ctx.fill();
        const struck = t.strikeAt && time - t.strikeAt < 1200;
        Characters.drawEnemy(ctx, 'onioni', ox + (struck ? 30 : 0), ground, { scale: 2, frame: Math.floor(time / 300) % 2, flip: true });
        // 千両箱
        const bx = 170, by = ground - 30;
        ctx.fillStyle = '#6a3a14';
        ctx.fillRect(bx, by, 48, 30);
        ctx.fillStyle = '#c8a040';
        ctx.fillRect(bx, by, 48, 3);
        ctx.fillRect(bx, by + 14, 48, 2);
        ctx.fillRect(bx + 21, by + 6, 6, 8);
        text('千両', bx + 24, by + 17, { color: '#ffd23a', size: 10, align: 'center', outline: null });
        if (struck) {
            const k = (time - t.strikeAt) / 1200;
            for (let i = 0; i < 40; i++) {
                const a = i * 2.39;
                const r = k * (40 + (i % 7) * 12);
                ctx.fillStyle = i % 3 ? '#ffd23a' : '#fff2a0';
                ctx.fillRect(Math.round(bx + 24 + Math.cos(a) * r), Math.round(by + 10 + Math.sin(a) * r * 0.7 - k * 20), 3, 3);
            }
        }
        // 気合のゲージ
        text('気合', 8, 25, { color: '#ffb0b0', size: 10 });
        box(32, 26, 80, 9, 'rgba(0,0,0,0.7)', '#ff6060');
        ctx.fillStyle = Math.floor(time / 150) % 2 ? '#ff3030' : '#ff8a30';
        ctx.fillRect(34, 28, Math.round(76 * charge), 5);
    }

    // ASAHARA CHANCE: まんなかの玉座に KING.ASAHARA。ASAHARA FLASH のたびに SASAKI・KOTANI が集まる
    function drawTokkaAsahara(time, ground) {
        const t = tokka;
        const cx = W / 2;
        // 玉座
        ctx.fillStyle = '#7a1020';
        ctx.fillRect(cx - 30, ground - 100, 60, 100);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(cx - 30, ground - 100, 60, 3);
        ctx.fillRect(cx - 30, ground - 100, 3, 100);
        ctx.fillRect(cx + 27, ground - 100, 3, 100);
        [-20, 0, 20].forEach(dx => ctx.fillRect(cx + dx - 3, ground - 108, 6, 8));
        ctx.fillStyle = '#a01828';
        ctx.fillRect(cx - 36, ground - 34, 72, 10);
        // すわっている KING.ASAHARA (足元を座面に合わせる)
        Characters.drawEnemy(ctx, 'asahara', cx, ground - 6, { scale: 2, frame: Math.floor(time / 600) % 2 });
        // 集まった仲間 (左右から歩いてくる)
        t.arrived.forEach((id, i) => {
            const fromLeft = i === 0;
            const at = t.arriveAt[id] || 0;
            const k = ease(Math.min(1, (time - at) / 700));
            const home = fromLeft ? 44 : W - 44;
            const x = fromLeft ? -30 + (home + 30) * k : W + 30 - (W + 30 - home) * k;
            drawRainbowGlow(x, ground - 40, 34, (time / 6 + i * 120) % 360);
            Characters.drawEnemy(ctx, id, x, ground, { scale: 2, frame: Math.floor(time / 400) % 2, flip: fromLeft });
        });
        // まだ来ていない席は影だけ
        if (t.arrived.length < 2) {
            const empty = t.arrived.length === 0 ? [44, W - 44] : [W - 44];
            empty.forEach(x => {
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(x - 14, ground - 2, 28, 3);
                text('？', x, ground - 40, { color: 'rgba(255,255,255,0.35)', size: 16, align: 'center', outline: null });
            });
        }
    }

    async function tokkaStart(event) {
        clearMessage();
        letterboxTarget = 1;
        battle.visible = false;
        startFlash(TOKKA_COLOR[event.kind], 700);
        startShake(config.effects.intensity.shakeLarge, 600);
        Sound.fanfare();
        showTitle('上乗せ特化ゾーン突入!!', `${event.min}枚保障！ 最大${event.max}枚！`, '#ffd700', 2000);
        await sleep(2000);
        // 見せ方を選ぶ (デバッグで指定したときは選ばない)。選んだものは main.js が state に入れる
        const kind = event.choose ? await selectTokka(event.kind) : event.kind;
        if (handlers.chooseTokka) handlers.chooseTokka(kind);
        letterboxTarget = 1;
        tokka = makeTokkaView(kind, event.games, event.games, 0, event.members, []);
        startFlash('#ffffff', 400);
        Sound.chance();
        const subs = {
            fire: '1Gごとに枚数を上乗せ！炎が大きいほど大量！',
            okaLamp: 'ランプが光ったらチャンス！',
            ikkeki: `${event.games}G 気合を溜めて、最後に一撃！`,
            asahara: 'ASAHARA FLASH で一発告知！'
        };
        showTitle(config.tokka.names[kind], subs[kind], TOKKA_COLOR[kind], 2200);
        await sleep(2200);
        letterboxTarget = 0;
    }

    // レバーの瞬間 (main.js から): おかランプはチャンス役でランプが点灯する
    function tokkaLever(outcome) {
        if (!tokka || !StateMachine.isRashMode(state) || state.rash.phase !== RASH_PHASES.TOKKA) return;
        tokka.lamp = null;
        if (tokka.kind !== 'okaLamp' || !config.tokka.lampRoles.includes(outcome.role)) return;
        const rainbow = config.tokka.rainbowRoles.includes(outcome.role);
        tokka.lamp = rainbow ? 'rainbow' : 'red';
        tokka.lampAt = performance.now();
        startFlash(rainbow ? '#ffffff' : '#ff3030', 300);
        if (rainbow) Sound.rainbow(); else Sound.chance();
    }

    async function tokkaGame(event) {
        if (!tokka) return;
        const t = tokka;
        t.remaining = event.remaining;
        t.total = event.total;
        const now = performance.now();
        if (TOKKA_HIDDEN.includes(t.kind)) {
            if (event.flash) await asaharaFlash(event);
            else await sleep(300);
            return;
        }
        if (event.add <= 0) {
            showMessage('MAX!!', '#ffd700', 600);
            await sleep(400);
            return;
        }
        const level = fireLevelOf(event.add);
        t.fireLevel = level;
        t.fireAt = now;
        const big = event.add >= 100;
        if (level >= 4) {
            startFlash('#ffffff', 600);
            Sound.rainbow();
        } else if (big) {
            startFlash('#ffd23a', 400);
            Sound.fanfare();
        } else {
            Sound.win();
        }
        startShake(big ? config.effects.intensity.shakeLarge : config.effects.intensity.shakeSmall, 250);
        const color = level >= 4 ? `hsl(${Math.floor(now / 5) % 360}, 95%, 62%)` : big ? '#ff6a3a' : '#ffd23a';
        damageNumbers.push({ text: `+${event.add}枚`, color, size: big ? 16 : 12, born: now });
        await animateTo(koori.jump, -10, 120);
        await animateTo(koori.jump, 0, 120);
        await sleep(big ? 700 : 350);
    }

    // ASAHARA FLASH: 暗転 → 金と虹の光 → 仲間が歩いてくる →「〇枚以上確定!!」
    async function asaharaFlash(event) {
        const t = tokka;
        letterboxTarget = 1;
        startFlash('#000000', 500, 1);
        await sleep(500);
        startFlash('#ffd700', 900);
        startShake(config.effects.intensity.shakeLarge, 900);
        Sound.rainbow();
        showTitle('ASAHARA FLASH!!', 'KING.ASAHARA「集え、我がしもべたちよ」', '#ffd700', 1600);
        await sleep(1600);
        const now = performance.now();
        event.flash.arrive.forEach((id, i) => {
            t.arrived.push(id);
            t.arriveAt[id] = now + i * 400;
        });
        Sound.fanfare();
        await sleep(900 + 400 * (event.flash.arrive.length - 1));
        t.guaranteed = event.guaranteed;
        startFlash('#ffffff', 500);
        const names = event.flash.arrive.map(id => (id === 'sasaki' ? 'Mr.SASAKI' : 'Mr.KOTANI')).join('・');
        showTitle(`${event.guaranteed}枚以上確定!!`, `${names} が集まった！`, '#ffd700', 2000);
        await sleep(2000);
        letterboxTarget = 0;
    }

    async function tokkaEnd(event) {
        if (!tokka) tokka = makeTokkaView(event.kind, config.tokka.games, 0, event.total, event.members, event.members);
        const t = tokka;
        if (t.kind === 'ikkeki') {
            // 一撃入魂: 「一撃入魂!!」→ 金棒で千両箱を一撃 → 合計を出す
            letterboxTarget = 1;
            showTitle('一撃入魂!!', 'おにおに「うおおおお！金返せぇぇ！」', '#ff3030', 1500);
            Sound.bigHit();
            await sleep(1500);
            t.strikeAt = performance.now();
            startFlash('#ffffff', 700);
            startShake(config.effects.intensity.shakeLarge, 700);
            Sound.special('club');   // 鬼鬼の金棒の音
            await sleep(700);
        } else if (t.kind === 'asahara') {
            letterboxTarget = 1;
            showTitle('結果発表', 'KING.ASAHARA「褒美をとらす」', '#ffd700', 1300);
            await sleep(1300);
        }
        t.reveal = event.coins;
        const huge = event.coins >= 1000;
        startFlash(huge ? '#ffffff' : '#ffd700', 600);
        if (huge) Sound.rainbow(); else Sound.fanfare();
        popups.push({ text: `+${event.coins}枚`, color: '#ffe45a', born: performance.now() });
        showTitle(`${event.name} 終了`, `+${event.coins}枚 GET!!${event.guaranteed ? `（${config.tokka.min}枚保障）` : ''}`, TOKKA_COLOR[t.kind], 2600);
        await sleep(2600);
        letterboxTarget = 0;
        tokka = null;
    }

    // ----- 特化ゾーンの見せ方を選ぶ画面 (新作と同じ: 前に選んだものを最初に選んでおき、10秒たったらそれで始める) -----
    // 左の STOP・右の STOP で選び、レバーか まんなかの STOP で決定。液晶のカードのタップでも選べる (もう一度タップで決定)
    const SELECT_CARD = { x0: 4, step: 63, w: 60, y: 24, h: 94 };
    const SELECT_LABELS = { fire: ['こおり', 'ファイアー'], okaLamp: ['おか', 'ランプ'], ikkeki: ['一撃', '入魂'], asahara: ['ASAHARA', 'CHANCE'] };
    const SELECT_NOTES = { fire: '1Gごと', okaLamp: 'ランプで告知', ikkeki: '最後に一撃', asahara: '一発告知' };

    function selectTokka(current) {
        const kinds = config.tokka.kinds;
        return new Promise(resolve => {
            tokkaSelect = { index: Math.max(0, kinds.indexOf(current)), until: performance.now() + config.tokka.selectMs, resolve };
            tokkaSelect.timer = setTimeout(finishTokkaSelect, config.tokka.selectMs);
            if (handlers.selectStart) handlers.selectStart();
        });
    }

    function finishTokkaSelect() {
        if (!tokkaSelect) return;
        const sel = tokkaSelect;
        tokkaSelect = null;
        clearTimeout(sel.timer);
        if (handlers.selectEnd) handlers.selectEnd();
        startFlash('#ffffff', 300);
        Sound.fanfare();
        sel.resolve(config.tokka.kinds[sel.index]);
    }

    // ボタン・キーの操作 (action: 'stop1' | 'stop2' | 'stop3' | 'lever')
    function tokkaSelectInput(action) {
        if (!tokkaSelect) return;
        const n = config.tokka.kinds.length;
        if (action === 'stop1') tokkaSelect.index = (tokkaSelect.index + n - 1) % n;
        else if (action === 'stop3') tokkaSelect.index = (tokkaSelect.index + 1) % n;
        else return finishTokkaSelect();
        Sound.stop(1);
    }

    function drawTokkaSelect(time) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#14081e');
        bg.addColorStop(0.5, '#2a0a2a');
        bg.addColorStop(1, '#0a0410');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        text('特化ゾーンの演出を選んでね', W / 2, 5, { color: '#ffffff', size: 12, align: 'center' });
        const { x0, step, w, y: y0, h } = SELECT_CARD;
        config.tokka.kinds.forEach((kind, i) => {
            const on = i === tokkaSelect.index;
            const x = x0 + i * step, y = on ? y0 - 3 : y0;
            const color = TOKKA_COLOR[kind];
            box(x, y, w, h, on ? 'rgba(60,20,40,0.95)' : 'rgba(20,10,20,0.85)', on ? '#ffd23a' : '#5a4a5a');
            // カードの絵
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 2, y + 2, w - 4, 58);
            ctx.clip();
            const ground = y + 58;
            if (kind === 'fire') {
                ctx.fillStyle = '#3a1000';
                ctx.fillRect(x + 2, y + 2, w - 4, 58);
                for (let k = 0; k < 14; k++) {
                    const f = (time / 500 + k / 14) % 1;
                    ctx.globalAlpha = 1 - f;
                    ctx.fillStyle = f < 0.4 ? '#ffb040' : '#ff3a1a';
                    ctx.fillRect(Math.round(x + w / 2 + Math.sin(k * 2.4 + time / 250) * 14), Math.round(ground - f * 44), 3, 5);
                }
                ctx.globalAlpha = 1;
                drawSprite(ctx, SPRITES.koori, Math.floor(time / 160) % 2 ? 'walk2' : 'walk1', x + w / 2 - 16, ground - 34, 2);
            } else if (kind === 'okaLamp') {
                ctx.fillStyle = '#1a0828';
                ctx.fillRect(x + 2, y + 2, w - 4, 58);
                OkaLampView.drawDanceFloor(ctx, time, x + 2, ground - 8, w - 4, 8);
                OkaLampView.drawTall(ctx, time, x + w / 2, ground - 2, 46, Math.floor(time / 600) % 2 ? 'red' : null);
            } else if (kind === 'ikkeki') {
                ctx.fillStyle = '#2a0404';
                ctx.fillRect(x + 2, y + 2, w - 4, 58);
                Characters.drawEnemy(ctx, 'onioni', x + w / 2, ground, { scale: 1, frame: Math.floor(time / 400) % 2, flip: true });
            } else {
                ctx.fillStyle = '#4a3a08';
                ctx.fillRect(x + 2, y + 2, w - 4, 58);
                Characters.drawEnemy(ctx, 'asahara', x + w / 2, ground, { scale: 1.1, frame: Math.floor(time / 600) % 2 });
            }
            ctx.restore();
            if (!on) {
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.fillRect(x, y, w, h);
            }
            const [l1, l2] = SELECT_LABELS[kind];
            text(l1, x + w / 2, y + 61, { color: on ? '#ffe680' : '#a89aa8', size: 10, align: 'center', outline: '#000' });
            text(l2, x + w / 2, y + 72, { color: on ? color : '#a89aa8', size: 10, align: 'center', outline: '#000' });
            text(SELECT_NOTES[kind], x + w / 2, y + 83, { color: on ? '#ffffff' : '#8a7a8a', size: 8, align: 'center', outline: null });
        });
        const sec = Math.max(0, Math.ceil((tokkaSelect.until - time) / 1000));
        const blink = Math.floor(time / 500) % 2;
        text(`左右のSTOP・タップで選んで レバーで決定（あと${sec}秒）`, W / 2, H - 23, { color: blink ? '#ffffff' : '#ffd0e0', size: 8, align: 'center', outline: null });
        text('上乗せのしやすさは どれも同じだよ', W / 2, H - 12, { color: '#a89aa8', size: 8, align: 'center', outline: null });
    }

    // ----- 通常時の予告 (レバー ON。Notice.pick が役で選んだステップアップ予告・群予告) -----
    // リールが回っている間に流すので待たない
    function playNotice(notice) {
        if (!notice) return;
        if (notice.kind === 'stepUp') {
            NoticeView.playStepUp(notice, config);
        } else {
            NoticeView.playGun(notice, config);
        }
    }

    // ----- こおりチャンスタイム (通常時) -----
    // ふるカワが「こおりくん、チャンスだよ！」と飛び出してきて、こおりくんの後ろを応援しながら付いてくる (ユーザー指定 2026-10-24: ともいし → ふるカワ)
    function drawChanceTimeFurukawa(time, groundY) {
        const x = valueAt(koori.x, time) + 8 - COMPANION_GAP * (party.length + 1) - 10;
        const frame = Math.floor(time / 300) % 2 ? 'talk' : 'idle';
        const hop = Math.floor(time / 140) % 2 ? -2 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x - 8, groundY - 2, 16, 3);
        drawSprite(ctx, SPRITES.furukawa, frame, x - 12, groundY - 20 * 1.5 + hop, 1.5);
        // 吹き出しは 1.8 秒 出して 3.6 秒 休む。出るたびに 次の セリフへ
        const turn = Math.floor(time / 1800), lines = config.chanceTime.cheerLines;
        if (turn % 3 === 0) text(lines[(turn / 3) % lines.length], x, groundY - 42, { color: '#ffe45a', size: 8, align: 'center' });
    }

    async function chanceTimeStart(event) {
        clearMessage();
        startFlash('#ff8ad8', 500);
        const startLines = config.chanceTime.startLines;
        await playCutIn('furukawa', startLines[Math.floor(Math.random() * startLines.length)], '#c03a8a', 1300);
        chanceTimeView = { games: event.games, remaining: event.games, points: 0 };
        startShake(config.effects.intensity.shakeSmall, 300);
        Sound.fanfare();
        showTitle('こおりチャンスタイム!!', `${event.games}G のあいだ ゲーム数${event.multiplier}倍！`, '#ff8ad8', 2000);
        await sleep(2000);
    }

    async function chanceTimeEnd(event) {
        chanceTimeView = null;
        Sound.win();
        showTitle('チャンスタイム終了', `チャンスタイムで +${event.points}G`, '#ff8ad8', 1500);
        await sleep(1500);
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
        if (event.killRate != null) setNow(battle.killRate, event.shown ?? event.killRate);   // 新しい セットの 撃破率
        if (event.nameColor) battle.nameColor = event.nameColor;
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
    // SE城前で 7揃い: このあとの 城突入チャレンジは 突破 確定 (2026-10-27 ユーザー指定)
    async function castleSure(event = {}) {
        kooriAura = true;
        startFlash('#ffffff', 600);
        startShake(config.effects.intensity.shakeLarge, 500);
        Sound.rainbow();
        showTitle('城突入 確定!!', event.role === 'bar' ? 'BAR揃い で 突破 確定！' : '7・7・7 で 突破 確定！', '#ffd700', 2000);
        await sleep(2000);
    }
    // 通常時の BAR揃い (2026-10-27 ユーザー指定): SE城前へ 直行 (ときどき 城突入 確定)
    async function barBonus(event) {
        startFlash(event.sure ? '#ffffff' : '#ffd700', 500);
        startShake(config.effects.intensity.shakeLarge, 400);
        if (event.sure) Sound.rainbow(); else Sound.fanfare();
        showTitle('BAR揃い!!', event.sure ? 'SE城へ 直行!! 城突入 確定!!' : 'SE城へ 直行!!', '#ffd700', 1800);
        await sleep(1800);
    }

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
        showTitle('突入失敗…', `ゲーム数 ${event.keptCp}G を持ち越し`, '#9fb8d8', 1600);
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
        setNow(battle.killRate, event.shown ?? event.killRate ?? 0);
        battle.nameColor = event.nameColor || 'white';
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
        // 敵の カットインと 全画面の「撃破率 〇〇%」(2026-10-27 ユーザー指定。おにおに・金面犬は 上の カットインの あと)
        const foe = Battle.findEnemy(config, event.enemyId);
        if (event.enemyId !== 'onioni' && !event.isGoldDog) await playCutIn(event.enemyId, `${foe.name} 出現!!`, '#3a1a5a', 1100);
        await playKillSplash(event.shown ?? event.killRate ?? 0, event.winGuaranteed ? '勝利確定!!' : null);
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
        showTitle('BREAK!!', '撃破率UP!!', '#c080ff', 1500);
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
            case 'tokka': return '上乗せ特化ゾーン 確定!!';
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
            if (event.killRate != null) setNow(battle.killRate, event.shown ?? event.killRate);   // 新しい セットの 撃破率
            if (event.nameColor) battle.nameColor = event.nameColor;
            startFlash('#ffd700', 500);
            Sound.fanfare();
            showTitle('継続!!', `BATTLE +${event.games}G`, '#ffd700', 1500);
        } else {
            await enemySpecial(event.enemyId);
            knockDown();
            animateTo(battle.killRate, 0, 500);   // 負けたら 撃破率は 0%
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
        // 撃破率 777% (2026-10-27 ユーザー指定): 0% から 一気に 777% へ
        const shown = event.killRate || config.killRate.revivalShow;
        await playKillSplash(shown, '復活撃破!!', 0, 1800);
        setNow(battle.killRate, shown);
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
                            popups.push({ text: `+${event.amount}枚`, color: '#ffe45a', born: performance.now() });
                        } else {
                            showMessage(`WIN!! +${event.amount}`, '#ffe45a');
                        }
                    }
                    break;
                case 'chancePoint':
                    if (event.bonus > 0) {
                        const label = event.reason === 'chance' ? 'CHANCE' : 'BONUS';
                        popups.push({ text: `${label} +${event.bonus}`, color: '#ffe45a', born: performance.now() });
                    } else if (event.multiplier > 1) {
                        popups.push({ text: `+${event.added}G`, color: '#ff8ad8', born: performance.now() });
                    }
                    break;
                case 'chanceTimeStart':
                    await chanceTimeStart(event);
                    break;
                case 'miniDecided':
                    await miniDecided(event);
                    break;
                case 'miniStart':
                    await miniStart(event);
                    break;
                case 'miniGame':
                    await miniGameFx(event);
                    break;
                case 'miniResult':
                    await miniResult(event);
                    break;
                case 'chanceTimeGame':
                    if (chanceTimeView) {
                        chanceTimeView.remaining = event.remaining;
                        chanceTimeView.points = event.points;
                    }
                    break;
                case 'chanceTimeEnd':
                    await chanceTimeEnd(event);
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
                case 'castleSure':
                    await castleSure(event);
                    break;
                case 'barBonus':
                    await barBonus(event);
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
                case 'killRate':
                    await killRateUp(event);
                    break;
                case 'charge':
                    await chargeEffect(event);
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
                case 'tokkaStart':
                    await tokkaStart(event);
                    break;
                case 'tokkaGame':
                    await tokkaGame(event);
                    break;
                case 'tokkaEnd':
                    await tokkaEnd(event);
                    break;
                case 'streak':
                    streak = event.streak;
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
        drawHotFrame(time);
        drawCrackFx(time);
    }

    // ----- 熱いときに 震える 枠 (2026-10-24 ユーザー指定: 映像の 中の 外枠が 震える) -----
    // レバー ON で そのゲームの 熱さが 高ければ、液晶の ふちに 太い 枠を 出して ぶるぶる 震わせる。ゲームが 終わったら 消す。
    //   level 1 赤 (熱さ 4) / 2 金 (熱さ 5) / 3 虹 (熱さ 6 = 確定)。震えも 段階で 大きく なる
    let hotFrame = 0;
    function setHotFrame(level) { hotFrame = level; }
    function drawHotFrame(time) {
        if (!hotFrame) return;
        const mag = hotFrame + 1;
        const dx = Math.round((Math.random() * 2 - 1) * mag), dy = Math.round((Math.random() * 2 - 1) * mag);
        const th = 4 + hotFrame;
        const color = hotFrame >= 3 ? `hsl(${(time / 3) % 360}, 95%, 60%)` : hotFrame === 2 ? '#ffd23a' : '#ff3040';
        ctx.save();
        ctx.translate(dx, dy);
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time / 60);
        ctx.fillStyle = '#000';
        ctx.fillRect(-4, -4, W + 8, th + 5);
        ctx.fillRect(-4, H - th - 1, W + 8, th + 5);
        ctx.fillRect(-4, -4, th + 5, H + 8);
        ctx.fillRect(W - th - 1, -4, th + 5, H + 8);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, W, th);
        ctx.fillRect(0, H - th, W, th);
        ctx.fillRect(0, 0, th, H);
        ctx.fillRect(W - th, 0, th, H);
        // 内側の 光る すじ
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(th, th, W - th * 2, 1);
        ctx.fillRect(th, H - th - 1, W - th * 2, 1);
        ctx.fillRect(th, th, 1, H - th * 2);
        ctx.fillRect(W - th - 1, th, 1, H - th * 2);
        ctx.restore();
    }

    // ----- プレミア: 液晶が ひび割れて おにおにが 出てくる (2026-10-24 ユーザー指定。パチンコの 1・3・5 の ひび割れと 同じ 流れ) -----
    // 確定 (熱さ 6) の ゲームの 一部で、リールが 回る 前に 流す (js/main.js)。CRACK_MS の 時刻 (ミリ秒) で 場面が かわる:
    //   暗くなる → まっぷたつに ひび割れ → 割れた 左右が ずれて すき間から おにおに → 粉々に 砕ける → 咆哮 → 「確定!!」
    const CRACK_MS = { dark: 0, crack: 500, split: 1300, smash: 2400, roar: 2900, kakutei: 4000, end: 4800 };
    const CRACK_PATH = [[0, 0], [-0.025, 0.1], [0.02, 0.19], [-0.016, 0.29], [0.03, 0.38], [-0.012, 0.49], [0.024, 0.58], [-0.02, 0.68], [0.012, 0.78], [-0.008, 0.89], [0, 1]];
    let crackFx = null;   // { start, snap (割れる 画面の 写し) }
    function playCrack() {
        crackFx = { start: performance.now(), snap: null, sounds: new Set() };
        return sleep(CRACK_MS.end).then(() => { crackFx = null; });
    }
    function crackSound(key, fn) {
        if (crackFx.sounds.has(key)) return;
        crackFx.sounds.add(key);
        fn();
    }
    function crackPath(k) {
        const n = CRACK_PATH.length - 1, upto = k * n;
        ctx.beginPath();
        ctx.moveTo(W / 2 + CRACK_PATH[0][0] * W, 0);
        for (let i = 1; i <= n; i++) {
            const f = Math.min(1, Math.max(0, upto - (i - 1)));
            if (f <= 0) break;
            const [x0, y0] = CRACK_PATH[i - 1], [x1, y1] = CRACK_PATH[i];
            ctx.lineTo(W / 2 + (x0 + (x1 - x0) * f) * W, (y0 + (y1 - y0) * f) * H);
        }
    }
    function drawCrackFx(time) {
        if (!crackFx) return;
        const e = time - crackFx.start;
        const jolt = m => [Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m)];
        if (e < CRACK_MS.crack) {
            ctx.fillStyle = `rgba(0,0,0,${0.5 * e / CRACK_MS.crack})`;
            ctx.fillRect(0, 0, W, H);
            return;
        }
        if (e < CRACK_MS.split) {
            crackSound('crack', () => Sound.premiumCrack());
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            const k = Math.min(1, (e - CRACK_MS.crack) / 450);
            ctx.save();
            const [dx, dy] = jolt(k >= 1 ? 2 : 1);
            ctx.translate(dx, dy);
            crackPath(k);
            ctx.strokeStyle = 'rgba(255,40,40,0.8)';
            ctx.lineWidth = 5;
            ctx.stroke();
            crackPath(k);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            // 割れる 画面を 写して おく
            if (!crackFx.snap) {
                crackFx.snap = document.createElement('canvas');
                crackFx.snap.width = W;
                crackFx.snap.height = H;
            }
            const g = crackFx.snap.getContext('2d');
            g.clearRect(0, 0, W, H);
            g.drawImage(canvas, 0, 0);
            return;
        }
        if (e < CRACK_MS.smash) {
            // 左右が ずれて、赤い すき間から おにおにが せり上がる
            const k = (e - CRACK_MS.split) / (CRACK_MS.smash - CRACK_MS.split);
            const gap = Math.round(Math.min(1, k / 0.35) * 30 + Math.max(0, k - 0.3) * 40);
            const rise = Math.min(1, Math.max(0, (k - 0.2) / 0.6));
            ctx.fillStyle = '#140000';
            ctx.fillRect(0, 0, W, H);
            const glow = ctx.createLinearGradient(W / 2 - gap - 10, 0, W / 2 + gap + 10, 0);
            glow.addColorStop(0, 'rgba(255,0,0,0)');
            glow.addColorStop(0.5, `rgba(255,${90 + Math.floor(60 * Math.sin(time / 50))},40,0.95)`);
            glow.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(W / 2 - gap - 10, 0, gap * 2 + 20, H);
            Characters.drawEnemy(ctx, 'onioni', W / 2, H + 4 + (1 - rise) * 110, { scale: 3, frame: Math.floor(time / 250) % 2 });
            if (crackFx.snap) {
                const [dx, dy] = jolt(1 + rise * 2);
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.translate(side * gap + dx, dy);
                    ctx.beginPath();
                    ctx.moveTo(side < 0 ? -2 : W + 2, 0);
                    for (const [x, y] of CRACK_PATH) ctx.lineTo(W / 2 + x * W, y * H);
                    ctx.lineTo(side < 0 ? -2 : W + 2, H);
                    ctx.closePath();
                    ctx.save();
                    ctx.clip();
                    ctx.drawImage(crackFx.snap, 0, 0);
                    ctx.restore();
                    ctx.strokeStyle = '#ffb0a0';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                }
            }
            if (rise > 0.5) LcdKit.text('グ……', W / 2, 10, { color: '#ff6060', size: 12, align: 'center' });
            return;
        }
        if (e < CRACK_MS.roar) {
            // 粉々に 砕けて 飛び散る
            crackSound('smash', () => Sound.premiumSmash());
            const k = (e - CRACK_MS.smash) / (CRACK_MS.roar - CRACK_MS.smash), q = k * k;
            ctx.fillStyle = '#200000';
            ctx.fillRect(0, 0, W, H);
            if (crackFx.snap) {
                const cols = 6, rows = 4, cw = W / cols, ch = H / rows;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch;
                        const vx = (cx - W / 2) * 3.2 + ((r * 7 + c * 13) % 9 - 4) * 12, vy = (cy - H / 2) * 3.2 - 40;
                        ctx.save();
                        ctx.globalAlpha = Math.max(0, 1 - k * 1.1);
                        ctx.translate(cx + vx * q, cy + vy * q + 160 * q * q);
                        ctx.rotate(((r + c) % 2 ? 1 : -1) * k * 4);
                        ctx.drawImage(crackFx.snap, cx - cw / 2, cy - ch / 2, cw, ch, -cw / 2, -ch / 2, cw, ch);
                        ctx.restore();
                    }
                }
            }
            if (k < 0.3) {
                ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k / 0.3)})`;
                ctx.fillRect(0, 0, W, H);
            }
            return;
        }
        if (e < CRACK_MS.kakutei) {
            // 赤い 画面で おにおにが 咆哮
            crackSound('roar', () => Sound.premiumRoar());
            const bg = ctx.createRadialGradient(W / 2, H * 0.55, 6, W / 2, H * 0.55, W * 0.7);
            bg.addColorStop(0, '#ff4020');
            bg.addColorStop(0.5, '#801010');
            bg.addColorStop(1, '#100000');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
            for (let j = 0; j < 3; j++) {
                const r = ((time / 600 + j / 3) % 1) * W * 0.7;
                ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r / (W * 0.7))})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(W / 2, H * 0.45, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            const [dx, dy] = jolt(3);
            Characters.drawEnemy(ctx, 'onioni', W / 2 + dx, H - 2 + dy, { scale: 3.4, frame: 1 });
            const [tx, ty] = jolt(2);
            LcdKit.text('グオオオオオ!!', W / 2 + tx, 6 + ty, { color: Math.floor(time / 100) % 2 ? '#ffe066' : '#ffffff', size: 20, align: 'center', outline: '#000' });
            return;
        }
        // 確定!! (虹色の 光)
        crackSound('kakutei', () => Sound.kakutei());
        const k = (e - CRACK_MS.kakutei) / (CRACK_MS.end - CRACK_MS.kakutei);
        if (k < 0.25) {
            ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - k / 0.25)})`;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, H / 2 - 18, W, 36);
        LcdKit.text('確定!!', W / 2, H / 2 - 13, { color: `hsl(${(time / 3) % 360}, 95%, 62%)`, size: 26, align: 'center', outline: '#000' });
    }

    return {
        init, showMessage, clearMessage, playEvents, renderFrame, setHotFrame, playCrack, startPreview, stopPreview,
        reach, push, reachResult, hold, release, setHanase, longFreeze, playChanceEffect, revivalBlackout, chanceCutIn, startFlash, startShake, setCharge, setZencho, noiseFx,
        tokkaLever, tokkaSelectInput, playNotice,
        tokkaSelecting: () => Boolean(tokkaSelect),
        setHandlers: h => { handlers = h; },
        playOpening: () => StoryView.play('opening'),
        skipStory: () => StoryView.skip(),
        storyActive: () => StoryView.active(),
        hideTrophy: () => TrophyView.hide(),
        showEndCard: id => EndCardView.show(id),
        showFurukawa: talk => FurukawaView.show(talk),
        hideFurukawa: () => FurukawaView.hide()
    };
})();
