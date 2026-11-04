# Font Quick Picker (Illustrator CEP panel)

バージョン 0.2.0（変更履歴は [CHANGELOG.md](CHANGELOG.md)。パネルメニューの先頭にも表示）

Illustrator 用の高速フォントピッカー。和名・英名・PostScript名を横断してインクリメンタル検索し、仮想スクロールで表示中の行だけフォントを読み込みます。

## インストール

通常は GitHub Releases の署名済み ZXP からインストールします（リポジトリ直下の README を参照）。

動作確認は macOS 版 Illustrator（2021 / 25.0 以降）で行っています。Windows でも動く作りにはしていますが、未検証です（提供元バッジの「OS 同梱」判定は macOS のみ）。

### ソースから動かす（開発用・macOS）

1. 署名なし拡張を許可する（CEP 11 / 12 の両方）
   ```sh
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   defaults write com.adobe.CSXS.12 PlayerDebugMode 1
   ```
2. 拡張フォルダへリンクする（このフォルダの親で実行）
   ```sh
   mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
   ln -s "$PWD/font-quick-picker" ~/Library/Application\ Support/Adobe/CEP/extensions/font-quick-picker
   ```
   ZXP 版と同じ拡張IDなので、ZXP 版を入れている場合は先にアンインストールする。
3. Illustrator を再起動し、「ウィンドウ > エクステンション > Font Quick Picker」を開く
4. デバッグする場合は Chrome で `http://localhost:8088` を開く（DevTools。`.debug` は ZXP には含まれない）

## 操作

| キー | 動作 |
|---|---|
| 文字入力 | 検索（空白区切りで AND。全角/半角・ひらがな/カタカナは同一視） |
| ↑ ↓ / PageUp PageDown | 選択移動（ウエイト一覧を開いている書体では、先にウエイトを移動） |
| Alt+→ / Alt+← （リスト内では → ←） | ウエイト一覧を開く／閉じる |
| Enter / ダブルクリック | 選択中のテキストに適用 |
| Esc | 検索クリア |
| Alt+F（リスト内では f も） | お気に入り切替 |
| Alt+H（リスト内では h も） | フォントを非表示 |
| ⌘1〜⌘7（Windows は Ctrl） | タブ切替（すべて／和文／欧文／合成／★／最近／新着） |

| クリック | 選択し、複数ウエイトの書体はウエイト一覧を展開（開いている書体名をもう一度クリックすると閉じる。閉じるときは適用しない）。テキスト選択中ならそのまま適用（⚙でオフにするとダブルクリック適用） |
| ウエイト一覧の行をクリック | そのウエイトを選択（・適用） |
| 行右の「n ▸」 | ウエイト一覧の開閉だけ（適用しない） |
| 行の ⊘ | フォントを非表示 |

タブ：すべて／和文（JISコードページ or 日本語名あり）／欧文／合成／★／最近使用／新着（パネルが Illustrator のフォント一覧で初めて見た日時が新しい順に最新50ファミリー。Adobe Fonts も対象。この版より前から入っていたフォントはファイルの ctime で代用。ウエイト数は数えない）。
欧文タブでは Serif・Sans・Slab・Script・Mono・Display・Symbol・未分類 で絞り込める（OS/2 の sFamilyClass → PANOSE → 名前の順に判定）。

- **Aa / あ** ボタン：プレビュー表示／フォント名だけのコンパクト表示を切り替え
- **T** ボタン：選択中のテキストを見本文字に取り込む
- ⚙：見本文字（「既定に戻す」ボタンつき）・サイズ・クリックで適用
- パネルメニュー（右上 ≡）：見本文字に取り込む／表示切替／非表示にしたフォント…／追加スキャンフォルダ…／フォントを再スキャン／プレビュー画像のキャッシュを削除／パネルを再読み込み（開発用）

## 開発時の反映

`js/`・`css/`・`index.html`・`jsx/host.jsx` の変更は、パネルメニューの「パネルを再読み込み（開発用）」で反映される（host.jsx も読み直す）。`CSXS/manifest.xml` の変更だけは Illustrator の再起動が必要。

ファミリー名の横のバッジは提供元（ライセンス判断の目安）。マウスを載せると製造元とライセンスURLを表示。検索欄で「モリサワ」「google」などでも引ける。

| バッジ | 判定根拠 |
|---|---|
| Adobe | Illustrator の一覧にあるのにフォントファイルが見つからない書体（推定。Adobe Fonts のフォルダは読まない）、またはライセンスURLが typekit.com / fonts.adobe.com |
| モリサワ | ライセンス欄（name ID 13）が `MPCD:`、または `MorisawaFonts` フォルダ |
| Google | SIL OFL / Apache で、著作権表記が Google Fonts の形式、または FontBase のフォルダ |
| OFL | SIL OFL / Apache（Google 以外） |
| Ai同梱 | Illustrator 本体・Adobe アプリ同梱 |
| macOS | `/System/Library` または著作権表記が Apple |
| 他 | 上記以外（製造元を確認） |
| ? | フォントファイルが見つからない |

バッジにマウスを載せると、印刷・Webフォント・PDF・動画・ロゴ／商標・アプリ埋め込み・解約後の扱いなどを ○△×？ で示すツールチップが出る（出典リンクと確認日つき）。内容は `js/rights.js` にまとめてあり、規約が変わったらここを更新する（`CHECKED` の日付も）。

同じ PostScript 名が複数の提供元から入っている書体は、バッジに黄色の点線枠が付く（Illustrator がどちらを使っているかは判別できない）。判定はファイル内の表記と保存場所による推定で、ライセンスの最終確認は各提供元の規約で行うこと。

合成フォントは、フォントファイルがなく、Illustrator の `Composite Fonts` フォルダにある名前と一致するか、PostScript名に非ASCII文字を含むものとして判定する。プレビューは表示できない。

## 仕組み

- `jsx/host.jsx`：`app.textFonts` を 500 件ずつ取得（件数と先頭・末尾の名前が変わったときだけ再取得）、選択テキストへ適用
- `js/cep.js`：CEP と Illustrator（evalScript）への呼び出しをここに集約。リンクは http/https だけ開く
- `js/store.js`：設定ファイルの読み書き（一時ファイル→rename、前回分を `.bak` に保持し、壊れていたら `.bak` から読む）
- `js/indexer.js`：フォントファイルの `name` / `OS/2` テーブルだけを読み、PostScript名→和名・英名・ウエイトを対応付け。サイズ＋更新日時で差分更新
- `js/model.js`：ファミリー化と検索（DOM非依存）
- `js/preview.js`：プレビューの遅延読み込み（`local()` 優先。読めないフォントは索引にあるファイルから読み込み、合計 160MB を超えたら古いものから破棄。それでも描けない Adobe Fonts・合成フォントは Illustrator に描かせた画像を表示し、`pv/` にキャッシュ。Illustrator での描画はパネルにフォーカスかポインタがあるときだけ）
- `js/main.js`：仮想リスト（行の要素は変わったときだけ差し替え）、操作、Illustrator の一覧取得と走査の直列化（フォーカス時に一覧が変わっていればファイルも差分走査）

設定ファイルは `~/Library/Application Support/FontQuickPicker/`（Windows は `%APPDATA%\FontQuickPicker\`）：`settings.json`（お気に入り・非表示・最近使ったフォントなど）、`seen.json`（新着用の初回観測日時）、`hostfonts.json`・`index.json`（起動を速くするキャッシュ）、`pv/`（プレビュー画像）。

UXP へ移す場合に書き換えが必要なのは、CEP 依存の `cep.js`、ファイル I/O の `store.js`・`indexer.js`・`preview.js`、それと `host.jsx` です。`model.js`・`rights.js` は環境に依存しません。

キャッシュ・設定：`~/Library/Application Support/FontQuickPicker/`

## 実機で最初に確認すること

1. パネルが開き、ステータスバーにファミリー数が出るか（出ない→PlayerDebugModeとリンク先を確認）
2. 日本語名で検索できるか（例：「ヒラギノ」）
3. Adobe Fonts の書体がプレビュー表示されるか（Illustrator が一時的な書類で描いた画像。作成中は一瞬ウィンドウが切り替わる）
4. モリサワ等の書体が和名で引けるか（引けない→設定の「追加スキャンフォルダ」に格納先を追加）
5. テキスト選択／文字単位選択／グループ内テキストへの適用
