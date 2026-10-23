// =====================================================================
// レバーの 演出 (2026-10-24 ユーザー指定。パチンコ koori-pachinko の「レバーを引け！」から)
// ---------------------------------------------------------------------
// atLever(): レバー ON の ときに 出す 演出を 選ぶ
//   レバブル : 金棒の レバーが ぶるぶる 震える (熱い ゲームほど 出やすい)
//   遅れ     : リールが 少し 遅れて 回り出す。チャンス目・BAR 以上 (役の 分類 hot / premium) だけ
//   逆回転   : リールが しばらく 逆に 回る。7揃い・7・7・BAR・ロングフリーズ だけ
// tataki(): 結果の 前の PUSH を「レバーを叩け！」に する (はじめ PUSH で、押すと 変わる ことも ある)。
//   通常時は 熱い ゲームだけ。RASH 中は 確定 (熱さ 6) だけ なので、出たら 確定
// stopTier(): 第 3 停止の 前の STOP の 色 (青 < 赤 < 金 < 虹)。longStop(): 第 3 停止を 長押しに する か
// 演出だけで、役・バトル・出玉は 変えない (UI 側の 乱数で 選ぶ)。数字は config.lever (案)
// =====================================================================

const LeverFx = {
    atLever(state, outcome, heat, config, rng = Math.random) {
        const c = config.lever;
        const cls = Notice.classOf(outcome.role, config);
        const strong = cls === 'premium' || outcome.isFreeze;
        const reverse = strong && rng() < c.reverse.rate;
        const okure = !reverse && rng() < (outcome.isFreeze ? c.okure.rates.premium : c.okure.rates[cls] || 0);
        const buru = rng() < c.buru.rates[Math.max(0, Math.min(6, heat))];
        return { buru, okure, reverse };
    },

    // push (Hype.plan の PUSH。ない ときは そのまま) に lever (レバーを叩け！) と leverChange (PUSH から 変わる) を つける
    tataki(state, push, heat, config, rng = Math.random) {
        if (!push) return push;
        const c = config.lever.tataki;
        const rate = StateMachine.isRashMode(state) ? (heat >= 6 ? c.rashRate : 0) : c.rates[Math.max(0, Math.min(6, heat))];
        if (rng() >= rate) return push;
        return { ...push, lever: true, leverChange: rng() < c.change };
    },

    stopTier(heat, config, rng = Math.random) {
        const c = config.lever.stopTier;
        const h = Math.max(0, Math.min(6, heat));
        return rng() < c.rates[h] ? Hype.pick(c.colors[h], rng) : null;
    },

    longStop(heat, config, rng = Math.random) {
        return rng() < config.lever.longStop.rates[Math.max(0, Math.min(6, heat))];
    }
};
