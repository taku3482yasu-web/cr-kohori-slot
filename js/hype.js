// =====================================================================
// 期待度の演出の抽選 (2026-10-23 アップグレード A3。最新のスロット koori-slot の 画面設計書 3-6 を参考に)
// ---------------------------------------------------------------------
// レバー ON で そのゲームの 熱さ (Furukawa.heat。0〜6) が 決まったら、plan() で 出す 演出を まとめて 選ぶ。
//   カットイン   : 青 < 緑 < 赤 < 金 < 虹 (虹は 熱さ 6 = 確定 だけ)
//   先バレ音     : レバー ON で 鳴る (熱い ゲームほど 鳴りやすい)
//   確定音       : 鳴ったら 熱さ 6 (確定) だけ
//   金発光       : 筐体が 金色に 光る (熱さ 5 以上)
//   フラッシュ   : 弱 (リールが 白く 光る) / 強 (液晶と リールが 大きく 光る)
//   PUSH ボタン  : 白 < 青 < 赤 < 金 < 虹。激熱は 飛び出す。押し方は 1 回・長押し・連打
// 高い 色・強い 演出ほど 熱い ゲームでしか 出ないので、色の 順に 期待度が 上がる。数字は config.hype (案)。
// 演出だけで、役・バトル・出玉は 変えない (UI 側の 乱数で 選ぶ)。
// =====================================================================

const Hype = {
    TIERS: ['blue', 'green', 'red', 'gold', 'rainbow'],
    PUSH_TIERS: ['white', 'blue', 'red', 'gold', 'rainbow'],

    // 重みの 表 { 名前: 重み } から 1 つ 選ぶ (重みが なければ null)
    pick(weights, rng) {
        const entries = Object.entries(weights || {}).filter(([, w]) => w > 0);
        if (!entries.length) return null;
        return Lottery.weightedPick(entries, ([, w]) => w, rng)[0];
    },

    // heat: 0〜6。返り値は 出す 演出 (出さない ものは null / false)
    plan(heat, config, rng = Math.random) {
        const h = config.hype;
        const at = (list) => list[Math.max(0, Math.min(6, heat))];
        const cutin = rng() < at(h.cutin.rates) ? this.pick(at(h.cutin.colors), rng) : null;
        const push = rng() < at(h.push.rates)
            ? { tier: this.pick(at(h.push.colors), rng), pop: rng() < at(h.push.popRates), mode: this.pick(h.push.modes, rng) }
            : null;
        return {
            heat,
            cutin,
            cutinWho: cutin ? this.castFor(cutin, config, rng) : null,
            sakibare: rng() < at(h.sakibareRates),
            kakutei: heat >= 6 && rng() < h.kakuteiRate,
            gold: rng() < at(h.goldRates),
            flash: this.pick(at(h.flash), rng) || 'none',
            push
        };
    },

    // カットインに 出る キャラと セリフ (色ごとの 顔ぶれから。キャラで 期待度は 変わらない)
    castFor(tier, config, rng) {
        const list = config.hype.cast[tier];
        return list[Math.floor(rng() * list.length)];
    }
};
