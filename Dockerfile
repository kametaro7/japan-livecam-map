# 静的サイトを nginx で配信する最小構成（Cloud Run 用）
FROM nginx:1.27-alpine

# Cloud Run は環境変数 PORT で待ち受けポートを指定してくる（既定 8080）
ENV PORT=8080

# nginx 公式イメージは /etc/nginx/templates/*.template を起動時に envsubst で展開してくれる
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# サイト本体だけをコピー（tools/ や README は不要）
COPY index.html /usr/share/nginx/html/
COPY assets     /usr/share/nginx/html/assets
COPY data       /usr/share/nginx/html/data

EXPOSE 8080
