// =====================================================================
// 前兆と違和感演出 (2026-10-23 アップグレード A4。最新のスロット koori-slot の 画面設計書 3-4・5-7 を参考に)
// ---------------------------------------------------------------------
// 前兆は「もう 決まっているが、あとで 知らせる」場面に 出す (state を 読むだけ。抽選・バトルは 変えない):
//   dance  : ダンシングステージ。チャンスゾーンの 当選 (dance.zone) は 最後の ゲームで 発表
//   battle : RASH の BATTLE。そのセットで 勝つか (rash.setWillWin) は「？？」で 発表
// 残りの ゲームが startWithin 以下に なったら、ゲームごとに 本物なら realRate・外れなら fakeRate で 前兆が 始まる
// (ガセ前兆。途中で 当たりに 変われば そのまま 本物)。場面が 変わったら 終わる (結果は 今までの 演出で 知らせる)。
// 違和感演出は 本前兆の ゲームで 出やすく、ガセ・前兆なしでも まれに 出る。数字は config.zencho (案)。
// UI 側の 乱数で 選ぶので、自動テスト・シミュレーターの 結果は 変わらない。
// =====================================================================

const Zencho = (() => {
    let current = null;   // { kind, games }

    // いまの 場面 (前兆を 出せる ところ) と、残りの ゲーム数・結果が 当たりか
    function sceneOf(state) {
        if (state.mode === MODES.NORMAL && state.normal.dance) {
            const d = state.normal.dance;
            return { kind: 'dance', left: d.gamesRemaining, real: d.zone };
        }
        if (StateMachine.isRashMode(state) && state.rash.phase === RASH_PHASES.BATTLE) {
            return { kind: 'battle', left: state.rash.gamesRemaining, real: state.rash.setWillWin };
        }
        return null;
    }

    // レバー ON の 前に 呼ぶ。{ zencho: 前兆の 種類 or null, started: この ゲームで 始まった, iwakan: 違和感の 種類 or null }
    function beforeGame(state, config, rng = Math.random) {
        const z = config.zencho;
        const scene = sceneOf(state);
        if (current && (!scene || scene.kind !== current.kind)) current = null;
        let started = false;
        if (!current && scene && scene.left >= z[scene.kind].minLeft && scene.left <= z[scene.kind].startWithin
            && rng() < (scene.real ? z[scene.kind].realRate : z[scene.kind].fakeRate)) {
            current = { kind: scene.kind, games: 0 };
            started = true;
        }
        if (current) current.games++;
        const iwakanRate = current ? (scene.real ? z.iwakan.real : z.iwakan.fake) : z.iwakan.random;
        const iwakan = rng() < iwakanRate ? Hype.pick(z.iwakan.kinds, rng) : null;
        return { zencho: current ? current.kind : null, started, iwakan };
    }

    // 場面が 変わったか (ゲームの あとに 呼ぶ)。前兆が 終わったら true
    function afterGame(state) {
        if (!current) return false;
        const scene = sceneOf(state);
        if (scene && scene.kind === current.kind) return false;
        current = null;
        return true;
    }

    return { beforeGame, afterGame, active: () => (current ? current.kind : null), reset: () => { current = null; } };
})();
