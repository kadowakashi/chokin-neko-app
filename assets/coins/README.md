# コイン画像の差し替え

透過PNGまたはWebP相当の正方形画像を推奨します。目安は512×512pxです。

- `cat_coin.png`：ねこコイン残高、日次獲得、ガチャ
- `gold_coin.png`：貯金演出、コインシャワー
- `gold_coin_sparkle.png`：GREAT以上の発光金貨
- `premium_coin.png`：FEVER演出

画像を配置したら `assets/manifest.json` の `available` にパスを追加してください。未配置・読込失敗時は、現在の絵文字、CSS、SVG、Canvas表現へ自動的に戻ります。
