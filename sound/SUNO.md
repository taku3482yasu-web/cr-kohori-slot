# Suno で作る BGM の台本

ゲームに入っている今の曲（`js/bgm.js` のチップチューン）をもとに、Suno に入れる内容を曲ごとにまとめた。
作った曲を MP3 でダウンロードし、**表のファイル名**にして `sound/` に入れると、その場面で流れる。
置いていない曲は今までのチップチューンのまま。全部そろえなくても大丈夫。

| ファイル名 | 流れる場面 | 今の曲（もとにしたところ） |
|---|---|---|
| `field.mp3` | 通常時（ステージの曲がないとき） | ハ長調・140 BPM・明るい行進 |
| `stage-tsugakuro.mp3` | 通常時：通学路 | 新しく作る |
| `stage-ongagawa.mp3` | 通常時：遠賀川 | 新しく作る |
| `stage-ebisucho.mp3` | 通常時：恵比寿町 | 新しく作る |
| `castle.mp3` | SE城前・城突入チャレンジ | イ短調・120 BPM・不穏。ベースが ラ→ソ♯→ファ→ミ と下がる |
| `battle.mp3` | おにおにRASH | ホ短調・170 BPM・速いバトル。オクターブで刻むベース |
| `battle2.mp3` | おにおにRASH（歌あり版） | 2026-11-14 に入った |
| `rash2.mp3` | おにおにRASH（2曲目）：こおりくんのテーマ | 新しく作る |
| `rash3.mp3` | おにおにRASH（3曲目）：SE城 突撃 | 新しく作る |
| `rash4.mp3` | おにおにRASH（4曲目）：宿敵おにおに | 新しく作る |
| `super.mp3` | SUPERおにおにRASH（歌なし） | ハ長調・160 BPM・勝利のファンファーレ |
| `super2.mp3` | SUPERおにおにRASH（歌あり）。SUPER に入るたびに super とランダム | 2026-11-14 に入った |
| `defeat.mp3` | バトル敗北・復活待ち | イ短調・72 BPM・ゆっくり下がっていく |
| `dance.mp3` | ダンシングステージ | イ短調・128 BPM・ディスコ。オクターブで跳ねるベース |
| `okapipo.mp3` | 特化ゾーン：おかランプ（オカピポ） | ラップ入り（`sound/README.md`） |
| `tokka-fire.mp3` | 特化ゾーン：こおりファイアー | 新しく作る（今は RASH・SUPER の曲） |
| `tokka-ikkeki.mp3` | 特化ゾーン：おにおに一撃入魂 | 新しく作る（今は RASH・SUPER の曲） |
| `tokka-asahara.mp3` | 特化ゾーン：ASAHARA CHANCE | 新しく作る（今は RASH・SUPER の曲） |

## Suno での入れ方

- **Custom** モードにする
- 歌なしの曲は **Instrumental** をオンにして、Style だけ入れる（Lyrics は空のまま）
- 歌ありの曲は Instrumental をオフにして、Style と Lyrics を入れる
- **Exclude Styles**（入れないスタイル）があるときは、下の「入れない」を入れる
- 曲はゲームの中でくり返し流れる。終わりがフェードアウトせずに、頭へ戻りやすい曲を選ぶ
- 何曲か作って、ゲームの中で聞きくらべて選ぶ（`tools/sound-test.html` で試聴できる）

---

## 1. 通常時 — `field.mp3`（歌なし）

**Title**: こおりくんの大冒険

**Style**
```
upbeat Japanese game music, bright adventure march, 140 BPM, C major, chiptune lead melody, brass section, snare march rhythm, bouncy bass, cheerful pachislot, loopable, instrumental
```
**入れない**
```
vocals, slow, sad, lo-fi
```

ねらい：レバーを何百回も叩く場面なので、明るいけれどうるさすぎない曲。メロディは今の曲と同じく「ミ・ソ・ド」と上がって跳ねる感じ。

### ステージ別の曲（2026-11-13）
通常時はマップ（通学路 → 遠賀川 → 恵比寿町、15 ゲームごと）ごとに曲が変わる。
そのステージの曲を置いていないときは `field.mp3`、それもなければチップチューン。SE城前は `castle.mp3`。
3 曲とも歌なし（**Instrumental オン**）。打ちながら何周も聞くので、メロディはわかりやすく、音はにぎやかすぎないように。

#### 1-2. 通学路 — `stage-tsugakuro.mp3`

**Title**：通学路

**Style**
```
cheerful Japanese morning game music, 132 BPM, G major, bright acoustic guitar strumming, glockenspiel melody, whistling, light snare and claps, bouncy bass, sunny school days, walking to school, pachislot normal stage, loopable, instrumental
```
**入れない**
```
vocals, sad, dark, heavy, lo-fi
```
ねらい：朝の住宅街、家・学校・電柱と電線・横断歩道。ランドセルで歩いていく、元気でさわやかな朝の曲。

#### 1-3. 遠賀川 — `stage-ongagawa.mp3`

**Title**：遠賀川

**Style**
```
breezy nostalgic Japanese countryside game music, 112 BPM, D major, acoustic guitar, wooden flute, warm strings, soft piano, gentle shuffle drums, wide open sky, riverside walk under a red iron bridge, pachislot normal stage, loopable, instrumental
```
**入れない**
```
vocals, sad, dark, heavy, electronic
```
ねらい：山並み・赤い鉄橋・川・土手の道と草花。風が通り抜けるような、ひろびろとした懐かしい曲。

#### 1-4. 恵比寿町 — `stage-ebisucho.mp3`

**Title**：恵比寿町

**Style**
```
retro Showa-era Japanese shopping street music, 124 BPM, F major, shamisen, brass section, accordion, wood blocks, festive taiko, playful and warm, sunset market with paper lanterns, chindon style, pachislot normal stage, loopable, instrumental
```
**入れない**
```
vocals, sad, dark, metal, lo-fi
```
ねらい：夕焼けの商店街、看板・のれん・提灯・石畳。昭和のにぎやかな商店街の、ちょっとお祭りっぽい曲。

---

## 2. SE城前・城突入チャレンジ — `castle.mp3`（歌なし）

**Title**: SE城の門

**Style**
```
dark tense Japanese game music, ominous castle theme, 120 BPM, A minor, descending chromatic bass line, pipe organ, staccato strings, taiko drums, rising suspense, pachislot chance zone, loopable, instrumental
```
**入れない**
```
vocals, happy, major key
```

ねらい：当たりの手前の「ここで決まる」ドキドキ。ベースが半音ずつ下がる不穏さは今の曲と同じ。太鼓で心臓の音のように。

---

## 3. おにおにRASH — `battle.mp3`（歌なし、または かけ声だけ）

**Title**: おにおにRASH

**Style**
```
high-speed Japanese anime battle music, 170 BPM, E minor, aggressive electric guitar riffs, driving octave bass, fast drums, orchestral hits, synth brass, heroic and intense, pachislot rush mode, loopable, instrumental
```
**入れない**
```
slow, ballad, lo-fi
```

かけ声を入れたいとき（Instrumental オフ）
```
[Intro]
(RASH! RASH!)

[Instrumental Break]

[Chant]
おにおに！ おにおに！ 撃破せよ！

[Instrumental Break]
```

ねらい：いちばん長く聞く当たり中の曲。速くて熱く、でも何周しても飽きないもの。

### RASH の曲は 4 曲から ランダム（2026-11-13）
`battle.mp3`・`battle2.mp3`・`rash2.mp3`・`rash3.mp3`・`rash4.mp3` のうち、置いてある曲から RASH に入るたびに 1 曲選ぶ。
RASH のあいだ（特化ゾーン・復活をはさんでも）は同じ曲。全部そろえなくてもいい。

#### 3-2. こおりくんのテーマ — `rash2.mp3`（歌あり）

**Title**：こおりばりきつよい！

**Style**
```
heroic Japanese anime opening rock, 168 BPM, B minor, sparkling icy synth arpeggios, glockenspiel, crunchy electric guitars, fast drums, bright male vocals, cool and brave, frozen hero theme, pachislot rush mode, loopable
```
**入れない**
```
slow, ballad, lo-fi, sad
```
**Lyrics**
```
[Intro]
(こおり！ ばりき！ つよい！)

[Verse]
小さな 体に 冷たい 心
溶けそうな 夜も 負けは しない
キラキラ 光る 氷の 拳
目の前の 敵を 凍らせて ゆけ

[Pre-Chorus]
怖くない もう 迷わない
ぼくには 仲間が いるから

[Chorus]
こおり ばりき つよい！
凍てつく 風を 味方に つけて
こおり ばりき つよい！
SE城の てっぺんまで
溶けない 夢を 握りしめ
今 撃破の 向こうへ

[Instrumental Break]

[Chorus]
こおり ばりき つよい！
凍てつく 風を 味方に つけて
こおり ばりき つよい！
SE城の てっぺんまで
溶けない 夢を 握りしめ
今 撃破の 向こうへ
```
ねらい：主人公こおりくんの曲。氷のキラキラした音（シンセのアルペジオ・鉄琴）と、熱いロックを合わせる。サビの「こおりばりきつよい！」は城突入成功のカットインのセリフ。

#### 3-3. SE城 突撃 — `rash3.mp3`（歌なし）

**Title**：SE城 突撃

**Style**
```
eurobeat, 155 BPM, A minor, fast synth lead, driving octave bass, supersaw chords, orchestral hits, high-speed racing energy, pachislot rush mode, loopable, instrumental
```
**入れない**
```
vocals, slow, lo-fi, acoustic
```
ねらい：パチスロの当たり中の定番のユーロビート。歌なしで、ひたすら速く気持ちよく打てる曲。

#### 3-4. 宿敵おにおに — `rash4.mp3`（歌あり）

**Title**：宿敵おにおに

**Style**
```
symphonic metal, 175 BPM, D minor, epic choir, heavy guitars, blast beats, taiko drums, powerful female vocals, dark and dramatic final boss battle, Japanese oni demon theme, pachislot rush mode, loopable
```
**入れない**
```
pop, cute, lo-fi, slow
```
**Lyrics**
```
[Intro]
(Choir: おに… おに…)

[Verse]
赤い 月が 城を 照らす
金棒の 音が 地を 揺らす
何度 倒れても 立ち上がる
宿命の 鬼が 待っている

[Chorus]
宿敵 おにおに 今こそ 決着を
燃える 魂 ひとつに 重ねて
撃破の その先に 光が 見える
この 戦いを 終わらせない

[Instrumental Break]

[Chorus]
宿敵 おにおに 今こそ 決着を
燃える 魂 ひとつに 重ねて
撃破の その先に 光が 見える
この 戦いを 終わらせない
```
ねらい：RASH の最大の敵おにおにとの決戦の曲。重いメタルと合唱で、ラスボス感を出す。

---

## 4. SUPERおにおにRASH — `super.mp3`（歌あり）

**Title**: SUPERおにおにRASH

**Style**
```
epic victory anthem, Japanese anime opening style, 160 BPM, C major, powerful male and female vocals, soaring brass fanfare, electric guitar, big drums, euphoric, pachislot premium mode, loopable
```
**入れない**
```
sad, slow, lo-fi
```

**Lyrics**
```
[Intro]
(SUPER! SUPER!)

[Verse]
凍える 夜を 越えて きた
こおりの 心に 火が ともる
目の前の 鬼も 金の 犬も
今なら 全部 ぶち抜ける

[Pre-Chorus]
止まらない 終わらない
継続の 鐘が 鳴りやまない

[Chorus]
SUPER おにおに RASH！
限界の その先へ
撃破 撃破 撃破で 駆けぬけろ
SUPER おにおに RASH！
この 一撃に すべてを
ばりきつよい 俺たちの 勝利だ

[Instrumental Break]

[Chorus]
SUPER おにおに RASH！
限界の その先へ
撃破 撃破 撃破で 駆けぬけろ
SUPER おにおに RASH！
この 一撃に すべてを
ばりきつよい 俺たちの 勝利だ
```

ねらい：めったに来ない最上位モードなので、ここだけはアニメの OP のように歌で盛り上げる。

---

## 5. バトル敗北・復活待ち — `defeat.mp3`（歌なし）

**Title**: 凍える夜

**Style**
```
melancholic Japanese game music, slow 72 BPM, A minor, solo piano, soft strings, descending melody, quiet tension, hint of hope, pachislot defeat scene, loopable, instrumental
```
**入れない**
```
vocals, drums, upbeat
```

ねらい：負けたように見せて、復活するかもしれない場面。悲しいだけでなく「まだ終わってない」静かな張りつめた感じ。復活したら一気にバトル曲へ戻るので、そこで落差が出る。

---

## 6. ダンシングステージ — `dance.mp3`（歌あり）

**Title**: ダンシング おにおに

**Style**
```
Japanese disco funk, 128 BPM, A minor, octave bouncing bass, four on the floor, funky guitar cutting, string stabs, female vocals, catchy, retro 80s dance, pachislot bonus stage, loopable
```
**入れない**
```
slow, sad, rock
```

**Lyrics**
```
[Intro]
(Dance! Dance!)

[Verse]
ミラーボールが 回りだす
SE城の 地下の ダンスホール
おにおにも ステップ ふんでるよ
ほら 一緒に 踊りましょ

[Chorus]
ダンシング ダンシング おにおに
くるっと 回って ハイ ポーズ
ダンシング ダンシング おにおに
今夜は 朝まで ノンストップ

[Instrumental Break]

[Chorus]
ダンシング ダンシング おにおに
くるっと 回って ハイ ポーズ
ダンシング ダンシング おにおに
今夜は 朝まで ノンストップ
```

---

## 7. おかランプ（オカピポ） — `okapipo.mp3`

`sound/README.md` を見る（ラップ入り）。

---

## 8. こおりファイアー — `tokka-fire.mp3`（歌あり）

**Title**：こおりファイアー

**Style**
```
hot Japanese anime rock, 165 BPM, D minor, blazing electric guitars, fast double kick drums, powerful male shout vocals, fiery and heroic, ice meets fire, pachislot bonus zone, loopable
```
**入れない**
```
slow, ballad, lo-fi, sad
```

**Lyrics**
```
[Intro]
(ファイアー！)

[Verse]
凍った 体に 火を つけろ
こおりの くせに 燃えてるぜ
溶けても いいさ この 一瞬
上乗せの 炎 天まで 届け

[Pre-Chorus]
もっと 熱く もっと 高く
燃えろ 燃えろ 虹色に

[Chorus]
こおり ファイアー！ 燃え上がれ
10ゲームの 炎の ステージ
こおり ファイアー！ 止まらない
冷たい 心が 熱く なる

[Instrumental Break]

[Chorus]
こおり ファイアー！ 燃え上がれ
10ゲームの 炎の ステージ
こおり ファイアー！ 止まらない
冷たい 心が 熱く なる
```

ねらい：こおりくんが炎をまとう、熱さ全開のゾーン。上乗せが大きいほど炎が虹色になるので、サビで一気に駆け上がる曲。

---

## 9. おにおに一撃入魂 — `tokka-ikkeki.mp3`（かけ声）

**Title**：一撃入魂

**Style**
```
Japanese wa-rock, heavy taiko drums, shamisen riffs, 150 BPM, E minor, slowly building tension, powerful male group chant, kiai shouts, dramatic and heavy, oni demon theme, pachislot bonus zone, loopable
```
**入れない**
```
pop, cute, lo-fi, female vocals
```

**Lyrics**
```
[Intro]
(ハッ！ ハッ！)

[Chant]
溜めろ 溜めろ 鬼の 気合
金棒 握って 息を 止めろ

[Instrumental Break]

[Chant]
一撃！ 入魂！ 一撃！ 入魂！
千両箱を ぶち割れ おにおに

[Instrumental Break]

[Outro]
(セイヤッ！)
```

ねらい：上乗せは最後まで「？？？枚」のまま見せず、おにおにがじっと気合を溜めるゾーン。歌は少なめにして、太鼓で「溜め」の重さを出す。

---

## 10. ASAHARA CHANCE — `tokka-asahara.mp3`（歌あり）

**Title**：ASAHARA CHANCE

**Style**
```
luxurious royal hip-hop, 100 BPM, F minor, gold and glamour, orchestral strings, brass stabs, harpsichord, deep 808 bass, confident male rap vocals, king's throne room, pachislot premium zone, loopable
```
**入れない**
```
cute, lo-fi, acoustic, sad
```

**Lyrics**
```
[Intro]
(KING！ ASAHARA！)

[Verse: Rap]
金の 玉座に 座る 男
指を 鳴らせば 世界が 動く
赤い じゅうたん 黄金の 間
今夜の 主役は キング ただ一人

[Pre-Chorus]
足音が 聞こえるか
誰かが 歩いて くる

[Chorus]
ASAHARA CHANCE！ ひれ伏せ 今夜
ASAHARA FLASH！ 光が 走る
ひとり 来たら 500
ふたり そろえば 1000 確定！

[Instrumental Break]

[Chorus]
ASAHARA CHANCE！ ひれ伏せ 今夜
ASAHARA FLASH！ 光が 走る
ひとり 来たら 500
ふたり そろえば 1000 確定！
```

ねらい：玉座の KING.ASAHARA の前に、仲間が歩いてくるのを待つゾーン。ゆったり重いテンポで、王様の余裕と金ピカ感。

---

### 決まりごと

- 歌詞はこのゲーム用に書いたオリジナル。実在の曲や歌手の名前を Style に入れない（Suno でも弾かれる）
- Suno の無料プランの曲は商用不可。お金をとって配るなら有料プランで作る
- 音量がばらばらなときは、`js/bgm.js` の `BGM_FILES` の `gain`（0〜1）で曲ごとに合わせる
