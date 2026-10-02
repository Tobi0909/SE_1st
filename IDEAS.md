# Ý tưởng ngoài phạm vi

Ghi lại đây các ý tưởng hay nảy ra trong quá trình làm, không tự thêm vào code khi chưa được duyệt.

- **Admin sửa trực tiếp nội dung quiz/lab/roadmap do LLM sinh** (hiện tại chỉ ẩn/khôi phục câu
  bị báo sai, chưa sửa trực tiếp text câu hỏi/scenario/skill node).
- **Admin xoá chủ đề** — hiện tại cố ý không cho xoá (cascade sẽ xoá toàn bộ câu hỏi/lab/roadmap
  của chủ đề đó, rủi ro mất dữ liệu cao cho một thao tác 1-click trong UI nội bộ nhỏ).
- **Tự phục vụ đổi mật khẩu / quên mật khẩu** — hiện tại chỉ admin tạo/biết mật khẩu ban đầu,
  phù hợp team 4-10 người nhưng sẽ cần nếu team lớn hơn.
- **SSE có event-type riêng** (progress/error/done) cho tutor chat thay vì stream text thuần —
  hiện đủ dùng vì chỉ có 1 luồng nội dung, nhưng nếu cần hiển thị trạng thái "đang nghĩ" tách
  biệt với nội dung thì nên chuyển sang SSE chuẩn.
- **Tutor nhìn thấy lịch sử lệnh terminal của lab đang mở** — hiện tutor cho ngữ cảnh LAB chỉ
  có briefing, không có lịch sử lệnh đã chạy, nên không đưa ra gợi ý dựa trên output cụ thể
  người dùng đã thấy. Có thể hữu ích nhưng tăng rủi ro rò rỉ rootCause nên để sau cân nhắc kỹ.
- **Xoá thẻ flashcard thủ công** — hiện tại thẻ tự tạo khi làm quiz lần đầu, không có cách ẩn
  thẻ không muốn ôn nữa.
- **Export/backup roadmap hoặc câu hỏi ra file** — hữu ích khi muốn tái sử dụng nội dung giữa
  các môi trường/instance SE Dojo khác nhau thay vì để LLM sinh lại từ đầu.
