// =====================================================================
// PUSH ボタン (2026-10-23 アップグレード A3。筐体の 下の 丸い ボタン #push-button と B キー)
// ---------------------------------------------------------------------
// wait(push) で 出して、押し終わるまで 待つ (押さなければ config.hype.push.autoMs で 進む)。
//   push: { tier: 'white'〜'rainbow', pop: 飛び出す, mode: 'tap' 1 回 / 'long' 長押し / 'mash' 連打 }
// 押したら 色に 合わせて 液晶を 光らせる。演出だけで 結果は 変えない。
// push.lever (2026-10-24 ユーザー指定。js/lever.js): PUSH の かわりに「レバーを叩け！」。PUSH では 進まず、金棒の レバー (Space) で 進む。
//   push.leverChange: はじめ PUSH で 出て、押すと (押さなくても changeMs で)「レバーを叩け！」に 変わる
// =====================================================================

const PushButton = (() => {
    let button = null;
    let cfg = null;
    let leverCfg = null;
    let active = null;   // { push, resolve, start, held, count, timer, lever (レバーを叩け！の 最中), changeTimer }
    let lever = null;    // 金棒の レバー (#spin-button)

    function init(config) {
        cfg = config.hype.push;
        leverCfg = config.lever.tataki;
        button = document.getElementById('push-button');
        lever = document.getElementById('spin-button');
        if (!button) return;
        button.addEventListener('pointerdown', e => {
            e.preventDefault();
            down();
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => button.addEventListener(t, up));
        // キーボード (設定で 変えられる。初期は B)。長押しも できるように 押した・離したを 見る
        document.addEventListener('keydown', e => {
            if (!active || e.code !== UI.bindingOf('push') || e.repeat) return;
            e.preventDefault();
            down();
        });
        document.addEventListener('keyup', e => {
            if (active && e.code === UI.bindingOf('push')) up();
        });
    }

    const label = mode => ({ tap: 'PUSH!!', long: '長押し!!', mash: '連打!!' }[mode]);

    function wait(push) {
        if (!button || !push) return Promise.resolve();
        return new Promise(resolve => {
            active = { push, resolve, held: 0, count: 0, timer: setTimeout(() => finish(), cfg.autoMs), lever: false, changeTimer: null };
            if (push.lever && !push.leverChange) return toLever();
            button.className = `cab-push on tier-${push.tier}${push.pop ? ' pop' : ''}`;
            button.style.setProperty('--progress', '0');
            const color = cfg.colorCodes[push.tier];
            Lcd.showMessage(push.lever ? 'PUSH!!' : label(push.mode), color === 'rainbow' ? '#ffffff' : color, cfg.autoMs);
            Sound.pushReady(push.tier);
            if (push.lever) active.changeTimer = setTimeout(toLever, leverCfg.changeMs);
        });
    }

    // 「レバーを叩け！」に する: PUSH は 消して、金棒の レバーを 光らせて 押せる ように する
    function toLever() {
        if (!active || active.lever) return;
        clearTimeout(active.changeTimer);
        active.lever = true;
        const { push } = active;
        button.className = 'cab-push';
        lever.disabled = false;
        lever.className = `lever-call tier-${push.tier}`;
        const color = cfg.colorCodes[push.tier];
        Lcd.showMessage('レバーを叩け!!', color === 'rainbow' ? '#ffffff' : color, cfg.autoMs);
        if (push.leverChange) Lcd.startFlash('#ffffff', 250);
        Sound.leverCall();
    }

    // 金棒の レバーを 叩いた (main.js の レバー ON から)
    function hitLever() {
        if (!active || !active.lever) return;
        lever.classList.add('lever-hit');
        finish();
    }

    function down() {
        if (!active) return;
        const { push } = active;
        if (push.lever) {   // レバーを叩け！ は PUSH では 進まない (はじめの PUSH を 押すと 変わる)
            if (!active.lever) toLever();
            return;
        }
        button.classList.add('pressed');
        if (push.mode === 'tap') return finish();
        if (push.mode === 'mash') {
            active.count++;
            Sound.hit();
            button.style.setProperty('--progress', String(active.count / cfg.mashCount));
            if (active.count >= cfg.mashCount) finish();
            return;
        }
        // 長押し: ゲージが たまったら 終わる
        const start = performance.now();
        active.held = start;
        const tick = () => {
            if (!active || active.held !== start) return;
            const k = Math.min(1, (performance.now() - start) / cfg.longMs);
            button.style.setProperty('--progress', String(k));
            if (k >= 1) return finish();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    function up() {
        if (!button) return;
        button.classList.remove('pressed');
        if (active && active.push.mode === 'long') {
            active.held = 0;
            button.style.setProperty('--progress', '0');
        }
    }

    function finish() {
        if (!active) return;
        const { push, resolve, timer } = active;
        clearTimeout(timer);
        clearTimeout(active.changeTimer);
        if (active.lever) {
            lever.disabled = true;
            setTimeout(() => { lever.className = ''; }, 300);
        }
        active = null;
        button.className = 'cab-push';
        button.style.setProperty('--progress', '0');
        Lcd.clearMessage();
        const color = cfg.colorCodes[push.tier];
        Lcd.startFlash(color === 'rainbow' ? '#ffffff' : color, push.tier === 'rainbow' || push.tier === 'gold' ? 600 : 350);
        Sound.pushHit(push.tier);
        setTimeout(resolve, 450);
    }

    return { init, wait, hitLever, isActive: () => Boolean(active), leverActive: () => Boolean(active && active.lever) };
})();
