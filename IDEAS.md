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
- **Quiz/lab "ground" vào kho tri thức + seed kho câu hỏi ADMIN (hybrid, giảm phụ thuộc LLM
  runtime)** — tạm hoãn, chờ đánh giá hiệu quả LLM thật trước. Bối cảnh: hiện quiz/lab sinh câu
  hỏi hoàn toàn từ kiến thức huấn luyện sẵn của LLM, kho tri thức (146 bài) chỉ hiện như link
  "đọc thêm", không được nhét vào prompt sinh câu hỏi. Plan đã thống nhất (chưa code):
  - Thêm field cho `Question`: `sourceArticleId`, `sourceArticleHash` (so sánh contentHash để
    đánh dấu `isStale` khi bài gốc đổi), `promptVersion`, `model`.
  - Script offline sinh batch câu hỏi grounding vào nội dung bài viết liên quan (domain+level
    khớp `topic.slug`+`difficulty`, tái dùng mapping trong `knowledge/queries.ts`), import
    thẳng `source: "ADMIN"` — KHÔNG qua bước duyệt thủ công (146 bài kho tri thức coi như đã
    được duyệt sẵn, tin tưởng nội dung gốc, không duyệt lại từng câu hỏi sinh ra).
  - Sửa `pickRandomQuestions` (`src/lib/quiz/questionPool.ts`): hiện ưu tiên NGẪU NHIÊN giữa
    nguồn ADMIN/LLM (không ưu tiên ADMIN dù đã seed), và KHÔNG loại trừ câu user vừa làm gần
    đây (`QuizAttempt` đã có index `[userId, createdAt]`, query loại trừ làm được ngay không
    cần migration) — 2 bug/thiếu sót này cần sửa bất kể có làm hybrid hay không.
  - Lưới an toàn khi dùng thật: quiz ĐÃ có sẵn "báo sai" → tự ẩn khỏi pool ngay
    (`flagQuestionAction` set `status: FLAGGED`), không cần xây thêm. **Lab thì CHƯA có** — cần
    thêm `LabScenarioFlag` (mirror `QuestionFlag`) + nút "Báo lab sai" trong `lab-workspace.tsx`
    + mở rộng `/admin/flagged` cho cả lab (LabScenario đã dùng chung enum `QuestionStatus` nên
    không cần đổi enum).
  - Lab scenario pool (hybrid tương tự quiz): để sau, cần thêm cột `source` vào `LabScenario`
    (hiện chưa có) + mở rộng `presetCommands` — lập plan riêng sau khi quiz ổn.
  - Quyết định còn treo: có giữ bước tự-kiểm-tra bằng LLM (gọi LLM lần 2 tự giải câu không xem
    đáp án, so khớp trước khi import) hay bỏ hẳn, tin hoàn toàn vào grounding + báo sai sau.
