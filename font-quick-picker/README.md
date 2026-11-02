# Font Quick Picker (Illustrator CEP panel)

バージョン 0.1.0（変更履歴は [CHANGELOG.md](CHANGELOG.md)。パネルメニューの先頭にも表示）

Illustrator 用の高速フォントピッカー。和名・英名・PostScript名を横断してインクリメンタル検索し、仮想スクロールで表示中の行だけフォントを読み込みます。

## インストール

通常は GitHub Releases の署名済み ZXP からインストールします（リポジトリ直下の README を参照）。

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
| f（リスト内） | お気に入り切替 |

| クリック | 選択し、複数ウエイトの書体はウエイト一覧を展開（開いている書体名をもう一度クリックすると閉じる。閉じるときは適用しない）。テキスト選択中ならそのまま適用（⚙でオフにするとダブルクリック適用） |
| ウエイト一覧の行をクリック | そのウエイトを選択（・適用） |
| 行右の「n ▸」 | ウエイト一覧の開閉だけ（適用しない） |
| h（リスト内）／行の ⊘ | フォントを非表示 |

タブ：すべて／和文（JISコードページ or 日本語名あり）／欧文／合成／★／最近使用／新着（インストール日時＝ctime が新しい順に最新50ファミリー。ウエイト数は数えない）。
欧文タブでは Serif・Sans・Slab・Script・Mono・Display・Symbol・未分類 で絞り込める（OS/2 の sFamilyClass → PANOSE → 名前の順に判定）。

- **Aa / あ** ボタン：プレビュー表示／フォント名だけのコンパクト表示を切り替え
- **T** ボタン：選択中のテキストを見本文字に取り込む
- ⚙：見本文字（「既定に戻す」ボタンつき）・サイズ・クリックで適用
- パネルメニュー（右上 ≡）：見本文字に取り込む／表示切替／非表示にしたフォント…／追加スキャンフォルダ…／フォントを再スキャン／パネルを再読み込み（開発用）

## 開発時の反映

`js/`・`css/`・`index.html`・`jsx/host.jsx` の変更は、パネルメニューの「パネルを再読み込み（開発用）」で反映される（host.jsx も読み直す）。`CSXS/manifest.xml` の変更だけは Illustrator の再起動が必要。

ファミリー名の横のバッジは提供元（ライセンス判断の目安）。マウスを載せると製造元とライセンスURLを表示。検索欄で「モリサワ」「google」などでも引ける。

| バッジ | 判定根拠 |
|---|---|
| Adobe | Adobe Fonts の `livetype` フォルダ、またはライセンスURLが typekit.com / fonts.adobe.com |
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

- `jsx/host.jsx`：`app.textFonts` を一括取得（件数が変わったときだけ再取得）、選択テキストへ適用
- `js/indexer.js`：フォントファイルの `name` / `OS/2` テーブルだけを読み、PostScript名→和名・英名・ウエイトを対応付け。サイズ＋更新日時で差分更新
- `js/model.js`：ファミリー化と検索（DOM非依存）
- `js/main.js`：仮想リスト、遅延読み込み（`local()` 優先。`local()` で読めないフォントはファイルから読み込み、上限40件でLRU破棄。Adobe Fonts のファイルは丸ごと読まず `local()` のみ）

キャッシュ・設定：`~/Library/Application Support/FontQuickPicker/`

## 実機で最初に確認すること

1. パネルが開き、ステータスバーにファミリー数が出るか（出ない→PlayerDebugModeとリンク先を確認）
2. 日本語名で検索できるか（例：「ヒラギノ」）
3. Adobe Fonts の書体がプレビュー表示されるか（OS に登録されたフォントとしてのみ表示するため、表示されない場合は薄い表示のままになる）
4. モリサワ等の書体が和名で引けるか（引けない→設定の「追加スキャンフォルダ」に格納先を追加）
5. テキスト選択／文字単位選択／グループ内テキストへの適用
