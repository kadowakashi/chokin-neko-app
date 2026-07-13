# GitHub Pages 公開手順

このアプリは外部APIを使わない静的Webアプリです。公開するとアプリ本体は閲覧可能になりますが、ブラウザの `localStorage` にある貯金記録はリポジトリへ送信されません。

## 公開する

1. GitHubへログインし、右上の「＋」から「New repository」を選びます。
2. Repository nameへ `chokin-neko-app` と入力します。
3. このフォルダのファイルをGitHubへアップロードします。GitHub Desktopを使う場合は、このフォルダをローカルリポジトリとして追加してPublishします。
4. 作成したリポジトリの「Settings」を開きます。
5. 左側の「Pages」を開きます。
6. Sourceで「Deploy from a branch」を選びます。
7. Branchを `main`、フォルダを `/(root)` にします。
8. 「Save」を押します。
9. 数分後に表示される公開URLを確認します。
10. `https://＜GitHubユーザー名＞.github.io/chokin-neko-app/` をHTTPSで開きます。
11. PCで動作を確認してからスマートフォンへ追加します。

ユーザー名やリポジトリ名を変えた場合は、公開URLの該当部分も置き換えてください。コードへGitHubユーザー名を設定する必要はありません。

## スマートフォンへ追加する

- Android：Chromeで公開URLを開き、メニュー →「ホーム画面に追加」→「インストール」を選びます。
- iPhone：Safariで公開URLを開き、共有ボタン →「ホーム画面に追加」を選びます。

OSやブラウザのバージョンにより文言が異なる場合があります。インストール後は、一度オンラインで全画面と猫図鑑を開いてからオフライン動作を確認してください。
