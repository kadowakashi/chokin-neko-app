# 貯金アプリ v0.9.1

スマートフォン向け・静的Webアプリです。`index.html` をWebサーバー経由で開くか、GitHub Pagesで公開してください。

- 記録・設定はブラウザの localStorage に保存されます。
- PWAのオフラインキャッシュは、HTTPS または localhost で有効になります。
- 実際の銀行残高は扱いません。

## GitHub Pagesで公開する

プロジェクトサイトのサブディレクトリで動く相対パス構成です。推奨リポジトリ名は `chokin-neko-app`、公開URLは `https://＜GitHubユーザー名＞.github.io/chokin-neko-app/` です。ユーザー名をコードへ設定する必要はありません。

公開前に `check_pages_ready.bat` を実行してください。`preview_pages.bat` では `http://localhost:8001/chokin-neko-app/` を開き、GitHub Pagesと同じサブディレクトリ構成を確認できます。詳しい公開手順は `GITHUB_PAGES_DEPLOY.md` を参照してください。

## v0.1.1 実機確認チェックリスト

### PC確認

- `start_app.bat` をダブルクリックして起動できる
- ブラウザが自動で開く
- 貯金と出費を登録できる
- 効果音が鳴る
- JSONを書き出せる／読み込める
- ページ再読み込み後も記録が残る

### スマートフォン確認

- PCと同じWi-Fiに接続し、PCでコマンドプロンプトを開いて `ipconfig` を実行します。表示されたIPv4アドレスを使い、スマートフォンで `http://PCのIPアドレス:8000` を開きます。接続できない場合はWindowsファイアウォールの許可を手動で確認します。
- Android Chrome、iPhone Safariで、効果音・振動・全画面演出・画面下部ボタンの押しやすさ・横スクロールの有無を確認する
- Android ChromeとiPhone Safariで、ホーム画面への追加（PWA追加）ができるか確認する

## v0.4 演出素材の差し替え

生成した素材は `assets/cats/`（猫）、`assets/scenes/`（背景・宝箱）、`assets/fx/`（将来の光や粒子素材）へ配置します。形式はPNGまたはWebP、主役画像は透過背景を推奨します。目安は主役が1024×1024px、縦長背景が1080×1920pxです。

ファイル名の例は `cat_celebrate.png`、`cat_surprised.png`、`cat_royal.png`、`treasure_chest_open.png`、`cat_temple_bg.png`、`space_bg.png` です。猫素材は次項の登録ツールを使用してください。対応ファイルがない場合は内蔵SVGへ自動的にフォールバックするため、素材未配置でもアプリは動作します。

## 新しい猫を追加する方法

1. PNG形式の猫画像を準備します。
2. `add_cat.bat` をダブルクリックします。
3. 画面に表示される質問へ順番に回答します。

画像は自動的に `assets/cats/` へコピーされるため、手動で移動する必要はありません。元画像は削除・移動されません。

猫画像は表示時に共通のCanvas前処理を通ります。外周から推定した市松模様の背景だけを透過し、処理できない場合は元画像をそのまま表示します。今後 `add_cat.bat` で追加した猫にも同じ処理が自動適用されます。

推奨画像は、正方形・1000×1000px前後・猫全体が画像内に収まった背景透過PNGです。市松模様が画像自体に描かれている場合は、完全な透過画像ではない可能性があります。

- `sync_cats.bat`：`cat-catalog.json`からJavaScriptとmanifestを再同期します。
- `validate_cats.bat`：重複、画像不足、manifest漏れ、未登録画像などを検査します。
- 猫情報の正式な管理元は `assets/cats/cat-catalog.json` です。`cat-characters.js`は直接編集しないでください。
