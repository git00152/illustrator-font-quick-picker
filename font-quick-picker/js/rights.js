'use strict';
// Usage rights shown in the vendor badge tooltip. Licences change: each entry keeps
// its sources and the date they were checked, and the tooltip always says so.
// level: ok (○) | cond (△ allowed with conditions) | ng (×) | ask (？ not stated / check)

const CHECKED = '2026-11-02';

const RIGHTS = {
  adobe: {
    title: 'Adobe Fonts',
    summary: 'Creative Cloud 契約中は個人・商用とも利用可',
    items: [
      ['ok', '印刷物・商用', '部数・インプレッション数の制限なし'],
      ['ok', '画像・PDF・電子書籍', '画像化、アウトライン化、サブセット埋め込みは可'],
      ['cond', 'Webフォント', 'Adobe Fonts の Web プロジェクト（埋め込みコード）経由のみ。自己ホスト不可。解約すると表示されなくなる'],
      ['ok', '動画・放送・配信', '映画、テレビ、YouTube なども可'],
      ['ok', 'ロゴ・商標登録', 'ロゴの商標登録は可（書体そのものは不可）'],
      ['ng', 'アプリ・ゲームへの埋め込み', 'フォントメーカーから別ライセンスの購入が必要'],
      ['ng', '1文字単位の商品・顧客が文字を入れる商品', 'ステンシル、ジュエリー、名入れカスタマイズなど'],
      ['ng', 'フォントの受け渡し（パッケージ・印刷所）', '相手側で Adobe Fonts などのライセンスが必要'],
      ['ok', '解約後の成果物', 'PDF・画像・アウトラインは引き続き使用可。ライブテキストは編集できなくなる'],
    ],
    sources: [['Adobe Fonts ライセンスFAQ（2026-03-27更新）', 'https://helpx.adobe.com/jp/fonts/web/font-licensing/font-licensing.html']],
  },
  morisawa: {
    title: 'モリサワ（Morisawa Fonts）',
    summary: '商業利用に追加料金・別契約は不要',
    items: [
      ['ok', '印刷物・商用', '発行・頒布・販売とも可'],
      ['ok', '画像・PDF', 'Web 用の画像、フォントを埋め込んだ PDF の配布も可'],
      ['cond', 'Webフォント', 'デスクトップフォントとは別の「Webフォント」プランが必要'],
      ['ok', '動画・放送・ゲーム', 'タイトルやテロップなどの画像として使う場合は可'],
      ['cond', 'ロゴ・商標登録', 'ロゴ作成は可。商標登録は Morisawa Fonts の有償プランのみ（フリープランと MORISAWA PASSPORT は不可）'],
      ['ok', 'グッズ・商品', 'ステッカー、名入れカップなどの製造・販売も可'],
      ['ng', 'フォント代わりになるデータの提供', '文字単位のアウトラインや画像を、ライセンスのない人に使わせるのは不可'],
      ['ok', '契約終了後の成果物', 'アウトライン・画像・PDF・印刷物は使用可'],
    ],
    sources: [
      ['モリサワ「商業利用について」', 'https://www.morisawa.co.jp/products/fonts/commercial-use/'],
      ['Morisawa Fonts サポート「どんなことができますか？」', 'https://mf-migration.morisawa.co.jp/hc/ja/articles/8919109064601'],
    ],
  },
  google: {
    title: 'Google Fonts',
    summary: 'オープンソース。無料で商用利用可',
    items: [
      ['ok', '印刷物・商用', '商用製品に含めて販売することも可'],
      ['ok', 'Webフォント', 'Google Fonts の API も、自分のサーバーでの自己ホストも可'],
      ['ok', 'アプリ・電子書籍・グッズ', '用途の制限なし'],
      ['ok', 'ロゴ・商標登録', 'ロゴに使用可'],
      ['ok', '文字の加工', '画像やアウトライン上での変形は可'],
      ['ng', 'フォント単体の販売', 'フォントファイルそのものの販売は不可（SIL OFL）'],
    ],
    sources: [['Google Fonts FAQ', 'https://fonts.google.com/faq']],
  },
  ofl: {
    title: 'オープンライセンス（SIL OFL / Apache）',
    summary: '一般に無料で商用利用可。条件は各フォントのライセンス文で確認',
    items: [
      ['ok', '印刷物・商用', ''],
      ['ok', 'Webフォント・アプリへの埋め込み', 'ライセンス文と著作権表示を同梱して再配布'],
      ['ok', 'ロゴ', ''],
      ['ng', 'フォント単体の販売', 'SIL OFL の条件'],
      ['cond', '改変したフォントの配布', '「Reserved Font Name」がある場合は別名にする必要がある'],
    ],
    sources: [['SIL Open Font License 1.1', 'https://openfontlicense.org/']],
  },
  mac: {
    title: 'macOS 同梱フォント',
    summary: 'macOS の使用許諾の範囲で表示・印刷に使える',
    items: [
      ['ok', '表示・印刷', 'macOS 上で文書を表示・印刷する用途'],
      ['cond', 'PDF埋め込み', 'フォントごとの埋め込み制限に従う（Font Book の情報で確認）'],
      ['ng', 'Webフォント・フォントの配布', 'フォントファイルの再配布は不可'],
      ['ask', '商用印刷・ロゴ', '使用許諾に明記がない。案件で使う前に要確認'],
      ['ng', 'SF Pro・SF Compact・New York', 'Apple プラットフォーム向け UI のモックアップ用途に限られる'],
    ],
    sources: [['Apple ソフトウェア使用許諾契約（E. フォント）', 'https://www.apple.com/legal/sla/']],
  },
  adobeapp: {
    title: 'Adobe アプリ同梱フォント',
    summary: 'Adobe アプリの使用許諾に従う。Adobe Fonts とは条件が異なる',
    items: [
      ['ok', 'アプリ内での制作・印刷', ''],
      ['ask', 'PDF埋め込み・ロゴ・商標', 'フォントごとの埋め込み制限と使用許諾を確認'],
      ['ng', 'Webフォント・フォントの配布', 'フォントファイルの再配布は不可'],
    ],
    sources: [['Adobe 一般利用条件', 'https://www.adobe.com/jp/legal/terms.html']],
  },
};

module.exports = { RIGHTS, CHECKED };
