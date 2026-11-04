# Font Quick Picker for Illustrator

Adobe Illustrator 用のフォントピッカーパネル（CEP 拡張）です。インストール済みフォントを和名・英名・PostScript 名で素早く検索し、プレビューを見ながら選択中のテキストに適用できます。

> この拡張は個人が作成した非公式のツールです。Adobe、モリサワ、Google、Apple ほか各社とは関係がなく、承認・保証を受けたものではありません。
> パネルは自動更新を行わず、外部ファイルのダウンロードや実行もしません。

## 主な機能

- インストール済みフォントの一覧（プレビュー表示／フォント名だけの表示）と、任意の見本文字での比較
- 選択中のテキストを見本文字に取り込み
- 和文／欧文／合成フォントの絞り込み、欧文の Serif・Sans などの分類
- フォント名検索、使用中フォントへのジャンプ、お気に入り、最近使ったフォント、新着フォント、不要なフォントの非表示
- ウエイトをアコーディオンで展開して選択
- テキスト選択中はクリックでそのまま適用
- 提供元バッジ（Adobe Fonts／モリサワ／Google Fonts など）と、用途別の権利情報のツールチップ

詳しい操作は [font-quick-picker/README.md](font-quick-picker/README.md) を、変更履歴は [CHANGELOG.md](font-quick-picker/CHANGELOG.md) を参照してください。

## 動作環境

- macOS（Windows は未対応・未検証）
- Adobe Illustrator 2021（v25）以降

## インストール

1. [Releases](https://github.com/git00152/illustrator-font-quick-picker/releases/latest) から `FontQuickPicker-vX.Y.Z.zxp` をダウンロードします。
2. （任意）リリースノートに記載の SHA-256 と一致するか確認します。
   ```sh
   shasum -a 256 ~/Downloads/FontQuickPicker-vX.Y.Z.zxp
   ```
3. 次のどちらかでインストールします。
   - Creative Cloud に含まれる Unified Plugin Installer Agent を使う
     ```sh
     "/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install ~/Downloads/FontQuickPicker-vX.Y.Z.zxp
     ```
   - ZXP インストーラーアプリ（aescripts の ZXP Installer など）に ZXP をドロップする
4. Illustrator を再起動し、「ウィンドウ > エクステンション > Font Quick Picker」を開きます。

### アンインストール

Illustrator を終了し、`Font Quick Picker` フォルダ（インストール方法によっては `com.git00152.fontquickpicker`）を削除します。フォルダは次のどちらかにあります。

- `~/Library/Application Support/Adobe/CEP/extensions/`
- `/Library/Application Support/Adobe/CEP/extensions/`

設定とキャッシュは `~/Library/Application Support/FontQuickPicker/` にあります。不要なら削除してください。

## プライバシーと動作

- フォントの一覧作成のため、フォントフォルダにあるフォントファイルのうち名前とメタデータのテーブルだけを読み取ります（フォントファイルは変更・複製しません）。
- Adobe Fonts のフォントファイルは読みません（Adobe Fonts の規約に従い、Adobe が提供する手段以外でアクセスしないため）。パネルで直接描けない書体のプレビューは、Illustrator 自身に一時的な書類で見本文字を描かせ、その画像を表示します。この描画はパネルを操作している間（パネルにフォーカスかマウスポインタがあるとき）だけ行います。作成中は一瞬ウィンドウが切り替わることがあり、一時的な書類は保存せずに閉じます。
- 設定・お気に入り・キャッシュ（プレビュー画像を含む）はこの Mac の `~/Library/Application Support/FontQuickPicker/` に保存し、外部へ送信しません。
- ネットワーク通信は行いません。ツールチップの出典リンクをクリックしたときだけ、既定のブラウザでそのページを開きます。

## 権利情報について

提供元バッジのツールチップに表示する権利情報は、各提供元の公開情報を要約したもので、確認日をツールチップに表示しています。規約は変更されることがあり、法的な助言ではありません。案件で使う前に、必ず各提供元の最新の規約を確認してください。提供元の判定も、フォントファイル内の表記と保存場所からの推定です。

## サポート

個人のプロジェクトです。Issue や Pull Request への対応、継続的なメンテナンスは保証しません。セキュリティに関する報告は [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

[MIT License](LICENSE)
