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
  - ~~Sửa `pickRandomQuestions` ưu tiên ADMIN + loại câu user vừa làm gần đây~~ — **đã làm**
    (2026-10-09, không chờ phần LLM, độc lập với hybrid).
  - ~~Lưới an toàn cho lab (`LabScenarioFlag` + nút "Báo lab sai" + `/admin/flagged`)~~ —
    **đã làm** (2026-10-09). Quiz đã có sẵn từ trước, không cần sửa.
  - Lab scenario pool (hybrid tương tự quiz): để sau, cần thêm cột `source` vào `LabScenario`
    (hiện chưa có) + mở rộng `presetCommands` — lập plan riêng sau khi quiz ổn.
  - Quyết định còn treo: có giữ bước tự-kiểm-tra bằng LLM (gọi LLM lần 2 tự giải câu không xem
    đáp án, so khớp trước khi import) hay bỏ hẳn, tin hoàn toàn vào grounding + báo sai sau.
- **82 câu quiz tĩnh còn length bias chưa tự sửa được** — sau khi chạy
  `scripts/kb-debias-quiz-length.mjs` (2026-10-14, xem CLAUDE.md mục LLMProvider), 82/625 câu
  "Tự kiểm tra" vẫn có đáp án đúng dài hơn distractor dài nhất > 30% mà script không tìm được
  điểm cắt an toàn (đáp án đúng quá ngắn/không có dấu câu để cắt). Chạy lại script với
  `--dry-run` để lấy danh sách file+câu cụ thể. Cần viết lại tay hoặc bằng LLM thật (project
  hiện chưa có API key thật để tự làm).
- **Nội dung quiz/lab chưa đủ "sát thực tiễn doanh nghiệp"** — phản hồi từ chủ dự án
  (2026-10-14): nhiều câu trong `knowledge/**.md` nghiêng về tình huống đơn giản/một máy hơn
  là vận hành hạ tầng nhiều máy/nhiều service có đánh đổi thật. Đã sửa phần prompt LLM runtime
  (`prompts/quiz/generate.v3.ts` yêu cầu rõ bối cảnh doanh nghiệp) nhưng phần nội dung TĨNH
  (625 câu, phần lớn quiz thật) cần viết lại thủ công/bằng LLM thật theo từng bài — không làm
  được bằng script rule-based (cần hiểu domain, không chỉ đo độ dài chữ).
- **Vị trí đáp án đúng lệch về option b)** — đo trên 625 câu "Tự kiểm tra" tĩnh (2026-10-14,
  cùng đợt rà soát length bias ở trên): b) chiếm 37.8% (236 câu) trong khi phân phối đều phải
  là 25%/lựa chọn (a=20.2%, c=24.3%, d=17.8%). Nếu học viên đoán "b" khi không chắc sẽ đúng
  cao hơn ngẫu nhiên — cùng họ bug với length bias nhưng khó khai thác hơn (phải làm nhiều câu
  mới nhận ra pattern). Chủ dự án quyết định hoãn, ưu tiên thấp hơn length bias. Khi làm: cần
  script xáo trộn ngẫu nhiên thứ tự 4 lựa chọn mỗi câu, cập nhật đồng thời letter đáp án đúng
  VÀ dòng `**Đáp án: X** — ...` cho khớp lại — rủi ro cao hơn script length bias (sửa 2 chỗ
  liên kết với nhau thay vì 1 chỗ text thuần), nên dry-run + lấy mẫu duyệt trước khi áp dụng
  thật.
