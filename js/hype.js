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
// reveal() (2026-10-27 ユーザー指定): ゲームの 結果が 決まった あと、PUSH を その 結果に 合わせて 選び直す。
//   RASH の BATTLE (撃破するか) と 城突入チャレンジ (突入するか) は、赤以上の PUSH なら 80% 以上・
//   「レバーを叩け!!」なら 90% で 勝つ (config.hype.reveal)。長押しは 台が チャージを 決めた ゲームだけ
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

    // PUSH を 選び直す ための、この ゲームの 結果 (reveal の ctx。events は GameFlow.onGameEnd の 返り値)
    //   RASH の BATTLE: 撃破率と そのセットを 勝つか / 城突入チャレンジ: 突入率と 突入したか / 長押しの チャージ
    contextOf(events, state) {
        const charge = false;   // 長押しの チャージは GameFlow.drawCharge / battleChargeChance で 決める
        const challenge = events.find(e => e.type === 'challengeGame');
        if (challenge) return { charge, win: challenge.success, base: challenge.rate };
        const dmg = events.find(e => e.type === 'damage' && e.killRate != null);
        if (dmg) return { charge, win: state.rash.setWillWin || events.some(e => e.type === 'defeat'), base: dmg.killRate };
        return { charge, win: null };
    },

    // 結果に 合わせて PUSH を 選び直す。push: plan() の PUSH (なければ null)
    //   ctx: { charge: 長押しの チャージ, win: 勝つ (突入する) か (わからない 場面は null), base: 勝つ 確率 (撃破率・突入率) }
    reveal(push, ctx, config, rng = Math.random) {
        const r = config.hype.reveal;
        if (ctx.charge && !push) push = { tier: 'white', pop: false, mode: 'long' };
        if (!push) return null;
        push = { ...push, mode: ctx.charge ? 'long' : push.mode === 'long' ? 'tap' : push.mode };
        if (ctx.win == null) return push;
        push.lever = false;
        push.leverChange = false;
        const base = Math.max(0, Math.min(1, ctx.base));
        let b = base;
        // レバーを叩け!! (長押しの ときは 出さない): 出たら reliability で 勝つ
        if (!ctx.charge && base < 1) {
            const lw = r.lever.win;
            const ll = Math.min(1, lw * base / (1 - base) * (1 - r.lever.reliability) / r.lever.reliability);
            if (rng() < (ctx.win ? lw : ll)) {
                push.lever = true;
                push.leverChange = rng() < config.lever.tataki.change;
            } else b = base * (1 - lw) / (base * (1 - lw) + (1 - base) * (1 - ll));   // 叩け!! が 出なかった ときの 勝つ 確率
        }
        push.tier = this.pick(ctx.win || b >= 1 ? r.win : this.loseTiers(r, b), rng) || 'white';
        return push;
    },

    // 負ける ときの PUSH の 色の 重み: 赤・金・虹は 出たら reliability で 勝つ ぶんだけ、残りを 白・青に
    loseTiers(r, base) {
        const sum = o => Object.values(o).reduce((a, x) => a + x, 0);
        const total = sum(r.win);
        const out = {};
        let fixed = 0;
        for (const [tier, rel] of Object.entries(r.reliability)) {
            out[tier] = rel >= 1 ? 0 : r.win[tier] / total * base / (1 - base) * (1 - rel) / rel;
            fixed += out[tier];
        }
        if (fixed > 1) {
            for (const tier of Object.keys(r.reliability)) out[tier] /= fixed;
            fixed = 1;
        }
        const restTotal = sum(r.lose);
        for (const [tier, w] of Object.entries(r.lose)) out[tier] = (1 - fixed) * w / restTotal;
        return out;
    },

    // カットインに 出る キャラと セリフ (色ごとの 顔ぶれから。キャラで 期待度は 変わらない)
    castFor(tier, config, rng) {
        const list = config.hype.cast[tier];
        return list[Math.floor(rng() * list.length)];
    }
};
