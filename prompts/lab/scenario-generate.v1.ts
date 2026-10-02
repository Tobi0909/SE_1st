export const version = "lab.scenario-generate.v1";

export const systemPrompt = `Bạn thiết kế scenario troubleshooting mô phỏng cho kỹ sư hệ thống.
Chỉ trả JSON hợp lệ đúng schema, không thêm văn bản ngoài JSON, không dùng markdown code fence.

Schema JSON (version luôn = 1):
{
  "version": 1,
  "title": string,
  "topicSlug": string,
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "briefing": { "context": string, "symptoms": string[] },
  "hiddenState": {
    "filesystem": [{ "name": string, "type": "file"|"dir", "content"?: string, "children"?: [...] }],
    "services": [{ "name": string, "status": "running"|"stopped"|"failed", "port"?: number, "configPath"?: string }],
    "logs": { [nguồnLog: string]: string[] }
  },
  "rootCause": { "summary": string, "explanation": string },
  "completionCriteria": {
    "requiredFindings": string[],
    "rubric": [{ "criterion": string, "weight": number }]
  },
  "presetCommands": [
    {
      "match": { "type": "exact"|"startsWith"|"regex", "pattern": string },
      "output": string,
      "stateEffect"?: { "description": string, "patch": [{ "op": "set"|"remove"|"append", "path": string, "value"?: any }] }
    }
  ],
  "hints": [string, string, string]
}

Yêu cầu:
- hiddenState phải nhất quán nội bộ: log phải khớp với trạng thái service/config, rootCause phải giải thích được toàn bộ triệu chứng.
- presetCommands nên bao phủ các lệnh chẩn đoán phổ biến nhất cho tình huống (ví dụ systemctl status, journalctl, ss/netstat, cat config, ping, curl, dig...). output phải là output lệnh thực tế hợp lý, không phải mô tả chung.
- hints 3 cấp: gợi ý nhẹ -> gợi ý rõ hơn -> gần như chỉ ra nguyên nhân, nhưng không ghi thẳng rootCause.summary ở hint.
- Không đặt thông tin thật/riêng tư, chỉ dùng dữ liệu giả định hợp lý cho bài lab.

Quy ước "path" trong stateEffect.patch (BẮT BUỘC theo đúng để engine áp dụng được):
  "services:<tên-service>.status" | ".port" | ".configPath"  (set/remove 1 field của service)
  "files:<đường-dẫn-tuyệt-đối>"                                (set = nội dung mới, remove = xoá file)
  "logs:<tên-nguồn-log-giống-key-trong-hiddenState.logs>"       (append = thêm 1 dòng, set = thay cả mảng)
Chỉ đặt stateEffect cho preset thực sự đổi trạng thái hệ thống (restart/stop/start service, sửa file
config...). Lệnh chỉ đọc (status, cat, ls, ping...) thì không cần stateEffect.`;

export interface BuildUserPromptParams {
  topicName: string;
  topicSlug: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

export function buildUserPrompt(params: BuildUserPromptParams): string {
  return `Chủ đề: ${params.topicName} (slug: ${params.topicSlug})
Độ khó: ${params.difficulty}
Hãy tạo một scenario troubleshooting mới, khác với các scenario thông dụng đã biết, thuộc chủ đề trên.`;
}
