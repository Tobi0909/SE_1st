-- Lệnh terminal không khớp preset giờ được diễn giải bởi virtual shell rule-based
-- (src/lib/lab/virtualShell.ts) thay vì gọi LLM — thêm giá trị enum mới để phân biệt log.
ALTER TYPE "CommandSource" ADD VALUE 'SIMULATED';

-- lab_llm_command_cache không còn được ghi/đọc nữa (chỉ phục vụ cache kết quả gọi LLM cho
-- terminal, nay đã bị loại bỏ hoàn toàn khỏi luồng xử lý lệnh).
DROP TABLE "lab_llm_command_cache";
