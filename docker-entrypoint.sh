#!/bin/sh
set -e

echo "Đang chạy migration..."
pnpm db:migrate:deploy

echo "Đang seed dữ liệu mẫu (admin + chủ đề)..."
pnpm db:seed

echo "Đang import kho tri thức..."
pnpm kb:import

echo "Khởi động server..."
exec pnpm start
