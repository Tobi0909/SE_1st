-- Thêm role OWNER (cấp cao hơn ADMIN): chỉ OWNER mới được hạ quyền/xoá một ADMIN khác, để
-- tránh trường hợp 1 admin bất kỳ tự do hạ quyền toàn bộ admin còn lại (xem
-- src/app/(app)/admin/users/actions.ts).
ALTER TYPE "Role" ADD VALUE 'OWNER' BEFORE 'ADMIN';
