# 2択比較ランキング

CSVに含まれる10個のテキストを2つずつ提示し、全45通りの比較結果からランキングを作成するWebアプリです。

## 機能

- CSVファイルをブラウザ上で読み込み
- 10件のテキストから全45ペアをランダム順に提示
- 左右の表示順をランダム化
- 選択結果、表示順、反応時間、選択時刻を記録
- 最終ランキングを表示
- 結果CSVを自動保存または手動ダウンロード

## 入力CSV

次の3列を持つCSVをアップロードします。

```csv
sample_id,item_id,text
1,5,サンプルテキストA
2,16,サンプルテキストB
```

条件:

- ヘッダー行が必要です
- データ行は10件ちょうどにしてください
- `sample_id` は数値として扱われます
- `text` が比較画面に表示されます

## ローカル起動

Node.jsが入っていれば、追加パッケージなしで起動できます。

```bash
node server.js
```

起動後、ブラウザで次を開きます。

```text
http://localhost:8000/
```

ポートを変える場合:

```bash
PORT=3000 node server.js
```

## 結果保存

`server.js` で起動した場合、比較完了時に `/save-result` へ結果CSVを送信し、`result/` に保存します。自動保存に失敗した場合でも、画面上のボタンから同じCSVをダウンロードできます。

結果CSVには主に次の情報が含まれます。

- `judgment_id`
- `pair_id`
- `direction`
- `pair_shown_at`
- `selected_at`
- `response_time_ms`
- `text_a`
- `text_b`
- `selected_text`

## サーバー設定

`server.js` は、必要な静的ファイルだけを配信し、結果保存APIには基本的な検証と制限をかけています。

配信対象:

- `/`
- `/index.html`
- `/style.css`
- `/main.js`

主な環境変数:

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `8000` | 起動ポート |
| `HOST` | `127.0.0.1` | listenするホスト。本番環境では必要に応じて `0.0.0.0` を指定 |
| `RESULT_DIR` | `./result` | 結果CSVの保存先 |
| `ALLOWED_ORIGINS` | 空 | 許可するOrigin。カンマ区切りで指定 |
| `MAX_BODY_BYTES` | `262144` | `/save-result` の最大リクエストサイズ |
| `RATE_LIMIT_WINDOW_MS` | `600000` | レート制限の時間枠 |
| `RATE_LIMIT_MAX` | `60` | 時間枠内で許可する保存リクエスト数 |
| `FRAME_ANCESTORS` | `'none'` | CSPの `frame-ancestors` 値 |
| `ENABLE_HSTS` | 未設定 | `true` の場合、HSTSヘッダーを送信 |

例:

```bash
ALLOWED_ORIGINS=https://example.com RESULT_DIR=/var/app/results node server.js
```

## ディレクトリ構成

```text
.
├── index.html
├── main.js
├── style.css
├── server.js
├── data/
│   └── generated_phrases/
└── result/
    └── .gitkeep
```

## 公開時の注意

このアプリを外部公開する場合は、結果CSVを公開URLから直接読めない場所に保存してください。

本番公開前には少なくとも次を確認してください。

- `RESULT_DIR` をWeb公開ディレクトリの外に設定する
- `ALLOWED_ORIGINS` に公開URLを設定する
- HTTPSをホスティング環境またはリバースプロキシで有効化する
- 管理者向けの結果ダウンロード機能を追加する場合は認証を必須にする
- 収集するデータ、保存期間、削除方法を明示する
- 個人情報や不要な識別情報を保存しない

## Git管理

`.gitignore` では、ローカルの結果CSVや分析用CSVをコミットしないようにしています。

- `data/**`
- `result/*.csv`
- `all_pair_*.csv`
- `sampled_10.csv`
- `.DS_Store`
