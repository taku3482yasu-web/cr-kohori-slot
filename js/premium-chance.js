// =====================================================================
// プレミア演出「CHANCE ボタン」(2026-11-14 ユーザー指定)
// ---------------------------------------------------------------------
// まんなかの STOP ボタンが ガタガタ 震えて まんなかから 真っ二つに 開き、中から 大きな CHANCE ボタンが 飛び出す。
// 押すと (押さなくても 10 秒で) 虹色に はじけて 当たりを 知らせる。
// おにおにへの とどめの 一撃・内定の時ゾーンの 突破・特化ゾーンの 大きな 上乗せ の うち、たまに だけ (config.premiumChance)。
// 当たる ことが 決まった 場面で だけ 出す 演出なので、出たら 確定。出玉・抽選は 変えない
//   PremiumChance.play() → Promise (押されたら 解決)
// =====================================================================

const PremiumChance = (() => {
    let active = null;

    function el(cls, html = '') {
        const d = document.createElement('div');
        d.className = cls;
        d.innerHTML = html;
        return d;
    }

    function play() {
        if (active || typeof document === 'undefined') return Promise.resolve();
        const stop = document.getElementById('stop-button-2');
        if (!stop) return Promise.resolve();
        const r = stop.getBoundingClientRect();
        const root = el('pc-root');
        root.style.setProperty('--x', `${r.left}px`);
        root.style.setProperty('--y', `${r.top}px`);
        root.style.setProperty('--w', `${r.width}px`);
        root.style.setProperty('--h', `${r.height}px`);
        // STOP ボタンの 左半分・右半分 (本物の ボタンは そのあいだ かくす)
        const left = el('pc-half pc-left', '<span>STOP</span>');
        const right = el('pc-half pc-right', '<span>STOP</span>');
        const glow = el('pc-glow');
        const chance = el('pc-chance', '<b>CHANCE</b><small>PUSH!!</small>');
        chance.setAttribute('role', 'button');
        chance.setAttribute('tabindex', '0');
        root.append(glow, left, right, chance);
        document.body.appendChild(root);
        stop.style.visibility = 'hidden';
        document.body.classList.add('pc-on');

        return new Promise(resolve => {
            const timers = [];
            const later = (fn, ms) => timers.push(setTimeout(fn, ms));
            let pushed = false;
            const press = (e) => {
                if (e) { e.preventDefault(); e.stopPropagation(); }
                if (pushed || !root.classList.contains('pc-popped')) return;
                pushed = true;
                root.classList.add('pc-pushed');
                if (typeof Sound !== 'undefined') { Sound.kokuchi(); Sound.rainbow(); }
                if (typeof Lcd !== 'undefined') { Lcd.clearMessage(); Lcd.startFlash('#ffffff', 500); Lcd.startShake(6, 500); }
                if (navigator.vibrate) { try { navigator.vibrate([80, 40, 160]); } catch (err) { /* なし */ } }
                later(() => {
                    document.removeEventListener('keydown', onKey, true);
                    root.remove();
                    stop.style.visibility = '';
                    document.body.classList.remove('pc-on');
                    active = null;
                    timers.forEach(clearTimeout);
                    resolve();
                }, 700);
            };
            const onKey = (e) => {
                if (['Space', 'Enter', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'].includes(e.code) || e.key === ' ') press(e);
                else e.stopPropagation();
            };
            document.addEventListener('keydown', onKey, true);
            chance.addEventListener('pointerdown', press);
            active = { press };
            // 1) ガタガタ 震える → 2) まんなかから 割れて 開く → 3) CHANCE ボタンが 飛び出す
            root.classList.add('pc-shake');
            if (typeof Sound !== 'undefined') { Sound.leverBuru(); }
            later(() => {
                root.classList.remove('pc-shake');
                root.classList.add('pc-open');
                if (typeof Sound !== 'undefined') { Sound.premiumCrack(); Sound.juteion(); }
            }, 700);
            later(() => {
                root.classList.add('pc-popped');
                if (typeof Sound !== 'undefined') Sound.leverCall();
                if (typeof Lcd !== 'undefined') Lcd.showMessage('CHANCEボタンを押せ!!', '#ffffff', 10000);
            }, 1150);
            later(() => press(), 1150 + 10000);   // 押さなくても 10 秒で
        });
    }

    return { play, active: () => Boolean(active) };
})();
