#!/bin/sh
# Cloud Run へデプロイする（2回目以降もこれを実行するだけ）
# 事前に: gcloud auth login / gcloud config set project <PROJECT_ID> を済ませておく
set -eu
SERVICE="${SERVICE:-japan-livecam-map}"
REGION="${REGION:-asia-northeast1}"   # 東京
REPO="cloud-run-source-deploy"        # ビルドしたコンテナの保管先

# 必要な API を有効化（すでに有効なら何も起きない）
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com compute.googleapis.com >/dev/null

# コンテナ保管庫が無ければ作る（消してしまった場合の復旧用）
if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
  echo "Artifact Registry リポジトリ [$REPO] を作成します..."
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location "$REGION" \
    --description="Cloud Run source deployments" >/dev/null
fi

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 128Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --quiet

echo
echo "URL:"
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
