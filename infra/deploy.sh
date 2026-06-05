#!/bin/bash
set -e

EC2_IP="54.217.203.47"
KEY="~/.ssh/experts-su-key.pem"
REMOTE="ubuntu@$EC2_IP"
APP_DIR="/home/ubuntu/experts-su"

echo "==> Projeyi EC2'ye kopyalıyorum..."
rsync -avz --progress \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'venv' \
  --exclude 'venv_new' \
  --exclude '.git' \
  --exclude 'data_exports' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  /Users/berke/Desktop/experts-su/ \
  $REMOTE:$APP_DIR/

echo "==> .env dosyasını kopyalıyorum..."
scp -i $KEY -o StrictHostKeyChecking=no \
  /tmp/deploy.env \
  $REMOTE:$APP_DIR/infra/docker/.env

echo "==> EC2'de docker-compose başlatıyorum..."
ssh -i $KEY -o StrictHostKeyChecking=no $REMOTE << 'ENDSSH'
  cd /home/ubuntu/experts-su/infra/docker
  sudo docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
  sudo docker-compose -f docker-compose.prod.yml --env-file .env up -d --build
  sudo docker-compose -f docker-compose.prod.yml ps
ENDSSH

echo ""
echo "==> Deploy tamamlandı!"
echo "    Frontend: http://$EC2_IP:3000"
echo "    API:      http://$EC2_IP:8000"
echo "    CloudFront: https://dlaow0tl93z78.cloudfront.net"
