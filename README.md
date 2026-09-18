# 日本ライブカメラマップ

日本全国の **YouTube ライブカメラ** を地図上にマッピングして、クリックひとつで映像を見られる静的サイトです。
サーバー不要（HTML / CSS / JS のみ）で、YouTube 埋め込みプレイヤーと地理院タイルを使っています。

## 使い方

ブラウザのセキュリティ制限により、`index.html` をダブルクリック（`file://`）で開くと YouTube の埋め込みが再生できない場合があります。
ローカルサーバー経由で開いてください。

```bash
cd japan-livecam-map
python3 -m http.server 8123
```

→ http://localhost:8123 を開く

GitHub Pages / Netlify / Cloudflare Pages などにフォルダごと置けばそのまま公開できます。

### 画面の操作

- **地図のピン**をクリック → 右パネル（スマホは下部シート）で再生
- 上部の**検索**（地名・カメラ名・配信者名）、**カテゴリ**チップ、**都道府県**セレクトで絞り込み
- 左上の ≡ で**カメラ一覧**（サムネイル付き）
- 🎲 **ランダム**で気まぐれに1台
- ⊞ **マルチビュー**で最大 4 台を同時視聴（2×2）
  - 空の枠をクリック → 左の一覧・検索からカメラを選ぶと入る／パネルの「マルチビューに追加」でも可
  - 🔊 で音声を 1 枠だけオン、⤢ で拡大（他の 3 枠は右に縦並び）、⇄ で一覧から選んで入れ替え、🎲 でその枠だけランダムに入れ替え、✕ で外す
  - ランダムで入れた枠が再生できなかった場合（配信者が埋め込みを禁止した・配信が終了した等）は、自動で別のカメラに入れ替わる。そのカメラはこの端末で 14 日間ランダムの候補から外れる
  - 自分で選んだカメラが再生できない場合は、枠の中に理由と「🎲 別のカメラにする」「⇄ 一覧から選ぶ」「▶ YouTubeで見る」を表示する
  - 🎲（上部のランダム／マルチビュー内の「4画面ランダム」）は **4枠すべてを同時に入れ替える**。現在の絞り込み（カテゴリ・都道府県・検索）の中から、配信中かつ埋め込み再生できるカメラだけを重複なしで選ぶ
  - 組み合わせはブラウザに記憶され、`#multi=id1,id2,id3,id4` の共有 URL も作れる
- パネル内「**リンクをコピー**」で `#cam=<id>` 付きの共有URL（マルチビューは `#multi=...`）
- 配信が止まっている時は「**配信が止まっている時はこちら**」でそのチャンネルの最新ライブに切り替え
- キーボード: `/` で検索へ、`Esc` でパネルを閉じる
- 右下のレイヤーボタンで 淡色地図 / 標準地図 / 航空写真 / OpenStreetMap を切り替え

## ファイル構成

```
japan-livecam-map/
├── index.html
├── assets/
│   ├── style.css
│   └── app.js            # 地図・一覧・プレイヤー（YouTube IFrame API + フォールバック）
├── data/
│   ├── cameras.json      # カメラ台帳（編集するのはこちら）
│   └── cameras.js        # cameras.json から生成される読み込み用ファイル
└── tools/
    ├── build_data.py     # cameras.json → cameras.js
    ├── update_streams.py # 配信IDの生存確認・自動更新
    └── find_cameras.py   # YouTube 検索から新しいライブカメラ候補を集める
```

### カメラデータの形式（`data/cameras.json`）

```json
{
  "id": "8H3nRCFVR6Y",            // 安定した識別子（共有URLに使用。変更しない）
  "name": "渋谷スクランブル交差点（ANN）",
  "pref": "東京都",
  "city": "渋谷区",
  "lat": 35.6595, "lng": 139.7005,
  "cat": "city",                   // city|rail|airport|traffic|sea|mountain|volcano|nature|snow|weather|animal|other
  "video": "8H3nRCFVR6Y",          // 現在のライブ配信の動画ID
  "channel": "UCGCZAYq5Xxojl_tSXcVJhiQ",
  "channelName": "ANNnewsCH",
  "title": "配信タイトル（検索対象）"
}
```

## データの更新

YouTube のライブ配信は再起動すると動画IDが変わります。定期的に次を実行してください。

```bash
python3 tools/update_streams.py
```

- 各カメラの動画がまだライブかを確認し、終了していればチャンネルの現在のライブ配信に差し替えます
- 見つからない場合は `"offline": true` を付けます（地図では半透明表示）
- 配信者が外部サイトでの再生を禁止している場合は `"noembed": true` を付けます（サイト内では再生せず YouTube へのリンクを表示し、ランダムの対象からも外れます）
- `--dry-run` で確認のみ、`--only 東京` で一部だけ

サイト側でも、動画IDが無効になった場合は自動でチャンネルのライブ埋め込みにフォールバックします。

### 新しいカメラを探す

```bash
printf 'ライブカメラ 長崎\nライブカメラ 温泉\n' > queries.txt
python3 tools/find_cameras.py queries.txt 3 candidates.jsonl
```

`candidates.jsonl` に「現在ライブ中」の検索結果（動画ID・タイトル・チャンネルID）が入るので、
気に入ったものを `cameras.json` に追記して `python3 tools/build_data.py` を実行します。

## GitHub Pages で公開する（無料）

このリポジトリは GitHub Pages でそのまま公開できます（サーバー不要・費用 0 円）。

- 公開 URL: https://kametaro7.github.io/japan-livecam-map/
- `main` ブランチに push すると 1〜2 分で自動的にサイトへ反映されます
- カメラ台帳を更新したら、次のコマンドで反映します

```bash
python3 tools/update_streams.py
git add data && git commit -m "カメラ台帳を更新" && git push
```

## Cloud Run で公開する

静的サイトを nginx コンテナで配信する構成です（`Dockerfile` / `nginx/default.conf.template`）。
ローカルに Docker は不要で、ビルドは Cloud Build 側で行われます。

```bash
# 初回のみ
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# デプロイ（2回目以降も同じ。データ更新後もこれで反映）
./deploy.sh
```

- リージョンは東京（`asia-northeast1`）、未認証アクセス許可、最小インスタンス 0（アクセスが無い時は課金なし）
- `data/cameras.json` を更新したら `python3 tools/build_data.py` のあと `./deploy.sh` を再実行
- サービスを消すときは `gcloud run services delete japan-livecam-map --region asia-northeast1`

## クレジット

- 映像は各 YouTube チャンネルの配信者に帰属します（本サイトは埋め込み表示のみ）
- 地図タイル: [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（国土地理院）、[OpenStreetMap](https://www.openstreetmap.org/copyright)
- 地図ライブラリ: [Leaflet](https://leafletjs.com/) / [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
