// =====================================================================
// 筐体の 光 (2026-10-23 ユーザー指定: 当たったら 周りの ライトが 虹色。演出に 合わせて 光り方を かえて 盛り上げる)
// ---------------------------------------------------------------------
// body.dataset.light に 光り方を 入れ、css/cabinet.css が 提灯・筐体の ふち・液晶の 額縁の 光を かえる。
//   rainbow 虹色 (当たり: 城突入・撃破・継続・特化ゾーン など。はじめに 虹色の 光の すじ)
//   color   --light-color の 色で 速く 流れる (BATTLE・城突入チャレンジ・カットイン など)
//   strobe  白く 点滅 (大ダメージ・「？？」)
//   dim     暗く (外れ・終了)
// ms たつと 元 (台の モードの 光) に 戻る。強い 光 (rainbow) の あいだは 弱い 光で 上書きしない。
// 上乗せ特化ゾーン中 (body[data-phase="TOKKA"]) は ずっと 虹色 (css)。
// Lcd.playEvents が イベントごとに Lights.event を 呼ぶ (演出と 同じ 時に 光る)
// =====================================================================

const Lights = (() => {
    const RANK = { dim: 1, color: 2, strobe: 3, rainbow: 4 };
    const CUTIN = { blue: '#3a8aff', green: '#3fdf6f', red: '#ff3a3a', gold: '#ffd040' };
    let timer = null, current = null;

    function set(kind, ms, color) {
        if (typeof document === 'undefined') return;
        const now = performance.now();
        if (current && current.until > now && RANK[current.kind] > RANK[kind]) return;
        const body = document.body;
        body.dataset.light = kind;
        if (color) body.style.setProperty('--light-color', color);
        if (kind === 'rainbow' && !(current && current.kind === 'rainbow' && current.until > now)) {
            body.classList.remove('light-burst');
            void body.offsetWidth;   // アニメーションを はじめから
            body.classList.add('light-burst');
        }
        current = { kind, until: now + ms };
        clearTimeout(timer);
        timer = setTimeout(() => {
            body.dataset.light = '';
            body.classList.remove('light-burst');
            current = null;
        }, ms);
    }

    function event(e) {
        switch (e.type) {
            case 'castleEntry': case 'rashStart': case 'superStart': case 'zoneHit': case 'freezeBonus':
            case 'revival': case 'companionSave': case 'revengeSuccess': case 'tokkaStart':
                return set('rainbow', 4000);
            case 'defeat':
                return set('rainbow', 3500);
            case 'questionResult':
                return e.continued ? set('rainbow', 3000) : e.revival ? set('strobe', 1500) : set('dim', 2000);
            case 'naiteiResult':
                return e.win ? set('rainbow', 4500) : set('dim', 2000);
            case 'challengeFail': case 'rashEnd': case 'revengeEnd':
                return set('dim', 2000);
            case 'challengeStart':
                return set('color', 2500, '#ff8a3a');
            case 'challengeGame':
                return e.success ? set('color', 1500, '#ffd700') : null;
            case 'battleStart': case 'revengeStart':
                return set('color', 2500, '#ff3a2a');
            case 'damage':
                return e.big ? set('strobe', 900) : set('color', 500, '#ff6a3a');
            case 'question':
                return set('strobe', 2000);
            case 'naiteiStart':
                return set('color', 3000, '#ff2050');
            case 'treasureStart': case 'pointChance': case 'castleBoost': case 'ceiling':
                return set('color', 2500, '#ffd700');
            case 'danceStart':
                return set('color', 2500, '#ff6ad8');
            case 'heavenHint': case 'modeHint':
                return set('color', 1500, '#7fffd4');
            default:
                return null;
        }
    }

    // レバー ON の カットイン (js/hype.js)。虹は 確定なので 虹色
    function hype(h) {
        if (!h) return;
        if (h.kakutei || h.cutin === 'rainbow') set('rainbow', 3000);
        else if (h.cutin && CUTIN[h.cutin]) set('color', 1800, CUTIN[h.cutin]);
    }

    return { set, event, hype };
})();
