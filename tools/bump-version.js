// =====================================================================
// 読み込むファイルの版番号を付け直す (ブラウザに古いファイルを使わせない)
// ---------------------------------------------------------------------
// HTML が読み込む js / css の URL の後ろに「?v=中身から作った番号」を付ける。
// ファイルの中身が変わると番号も変わるので、ブラウザは新しいファイルを読み直す
// (中身が変わっていないファイルの番号はそのまま。キャッシュも効く)。
//
// 使い方 (koori フォルダで):
//   node tools/bump-version.js          番号を付け直す (変わった HTML のファイル名を表示)
//   node tools/bump-version.js --check  付け直しが必要なら終了コード 1 (書き換えない)
//
// コミットのたびに自動で動く (.githooks/pre-commit。git config core.hooksPath .githooks で有効)。
// =====================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const HTML_FILES = ['index.html', 'howto.html', 'tools/simulate.html', 'tools/make-icons.html'];
const check = process.argv.includes('--check');

// src="js/a.js" / href="css/style.css" / src="../js/a.js" (外部の URL は対象外)
const PATTERN = /(\b(?:src|href)=")((?:\.\.\/)?(?:js|css)\/[^"?#]+)(?:\?v=[^"]*)?(")/g;

const changed = [];
for (const file of HTML_FILES) {
    const htmlPath = path.join(ROOT, file);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const next = html.replace(PATTERN, (all, head, url, tail) => {
        const target = path.join(path.dirname(htmlPath), url);
        if (!fs.existsSync(target)) return all;
        const hash = crypto.createHash('sha1').update(fs.readFileSync(target)).digest('hex').slice(0, 8);
        return `${head}${url}?v=${hash}${tail}`;
    });
    if (next === html) continue;
    changed.push(file);
    if (!check) fs.writeFileSync(htmlPath, next);
}

if (check) {
    if (changed.length) {
        console.log('版番号の付け直しが必要: ' + changed.join(', '));
        process.exit(1);
    }
} else {
    for (const file of changed) console.log(file);
}
