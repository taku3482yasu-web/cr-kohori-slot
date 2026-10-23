// =====================================================================
// 通常時の予告 (レバー ON で出すステップアップ予告・群予告)
// ---------------------------------------------------------------------
// ユーザー指定 2026-10-23: 通常時が長くなったので演出を増やす。キャラとセリフはパチンコ・新作のスロットを参考にした。
// どの予告を出すかは、そのゲームの役 (outcome.role) で決める (期待度は役しだい)。演出だけで、出目や抽選は変えない。
// カットインは期待度の演出 (js/hype.js) のものを使う (ユーザー指定)。そのカットインが出たゲームでは出さない (main.js)。
// 数値は config.notice。液晶は Lcd.playNotice が描く
// =====================================================================

const Notice = {
    // 役の分類: premium / hot / warm / cold
    classOf(role, config) {
        return config.notice.classes[role] || 'cold';
    },

    // 予告を出せる場面か (通常時のマップ・SE城前。ダンシングステージ・リベンジチャンス中は出さない)
    allowed(state) {
        return state.mode === MODES.NORMAL && !state.normal.dance && !(state.normal.revengeGames > 0);
    },

    // このゲームの予告を選ぶ。出さないときは null
    //   force: デバッグで種類を指定する ('stepUp' | 'gun')
    pick(state, outcome, config, rng = Math.random, force = null) {
        if (!this.allowed(state) || outcome.isFreeze) return null;
        const cfg = config.notice;
        const cls = this.classOf(outcome.role, config);
        if (!force && rng() >= cfg.rate[cls]) return null;
        const kind = force || Lottery.weightedPick(Object.keys(cfg.kinds[cls]), k => cfg.kinds[cls][k], rng);
        const pickKey = table => Lottery.weightedPick(Object.keys(table), k => table[k], rng);
        if (kind === 'stepUp') {
            const outcomeKey = pickKey(cfg.stepUp.outcomes[cls]);
            const steps = Number(outcomeKey[1]);
            const textColor = outcomeKey.slice(2) || 'white';
            const series = cfg.stepUp.series[Math.floor(rng() * cfg.stepUp.series.length)];
            return { kind, steps, textColor, series };
        }
        return { kind: 'gun', who: pickKey(cfg.gun[cls]) };
    }
};
