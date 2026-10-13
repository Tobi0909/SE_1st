import { scenario } from "./types";

export const sreScenarios = [
  scenario({
    topicSlug: "sre",
    difficulty: "EASY",
    title: "Cảnh báo cháy error budget bị bỏ qua vì không rõ runbook",
    context:
      "Dịch vụ thanh toán nhận cảnh báo 'error budget burn rate cao' kéo dài 2 giờ nhưng không ai xử lý, cho tới khi một khách hàng lớn báo cáo trực tiếp về tỉ lệ lỗi thanh toán cao.",
    symptoms: ["Cảnh báo burn rate xuất hiện trên Slack kênh #alerts từ 2 giờ trước, không ai phản hồi", "Error rate thực tế của dịch vụ thanh toán đã tăng gấp 5 lần so với SLO cho phép"],
    filesystem: [{ name: "runbooks/payment-burn-rate.md", type: "file", content: "(file runbook này KHÔNG tồn tại trong repo runbook của team)" }],
    services: [{ name: "payment-service", status: "running" }],
    logs: {},
    rootCauseSummary: "Cảnh báo burn rate được cấu hình đúng và bắn đúng lúc, nhưng không có runbook hướng dẫn xử lý cụ thể, nên đội trực không biết đây là việc cần ưu tiên xử lý ngay và đã bỏ qua.",
    rootCauseExplanation:
      "Đội SRE đã thiết lập alert rule cho error budget burn rate theo đúng best practice (dựa trên SLO đã định nghĩa), và cảnh báo đã kích hoạt chính xác khi tỉ lệ lỗi tăng cao. Tuy nhiên, khác với các loại cảnh báo khác (ví dụ service down) có runbook rõ ràng, alert burn rate này chưa từng có runbook hướng dẫn 'khi thấy cảnh báo này, cần kiểm tra gì, mức độ ưu tiên ra sao, ai cần được thông báo' — đội trực không có đủ ngữ cảnh để đánh giá mức độ nghiêm trọng thực sự và quyết định nhầm là có thể để xử lý sau, dẫn tới việc một vấn đề thực sự ảnh hưởng khách hàng kéo dài 2 giờ mà không được xử lý.",
    requiredFindings: ["cảnh báo burn rate đã xuất hiện đúng lúc nhưng không được xử lý kịp thời", "nguyên nhân là thiếu runbook hướng dẫn xử lý cho loại cảnh báo này, khiến đội trực không đánh giá đúng mức độ ưu tiên"],
    rubric: [
      { criterion: "Xác nhận đúng cảnh báo đã kích hoạt chính xác và đúng lúc (không phải lỗi hệ thống cảnh báo)", weight: 40 },
      { criterion: "Đề xuất đúng hướng khắc phục: viết runbook rõ ràng cho loại cảnh báo này, không chỉ nhắc nhở đội trực chú ý hơn", weight: 60 },
    ],
    presetCommands: [],
    hints: ["Xác nhận trước xem cảnh báo có thực sự kích hoạt đúng lúc hay không.", "Tìm xem có runbook nào hướng dẫn xử lý loại cảnh báo này không.", "Thiếu runbook là nguyên nhân gốc rất phổ biến khiến cảnh báo đúng nhưng không được xử lý kịp thời."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "EASY",
    title: "Hậu kiểm sự cố (postmortem) thiếu theo dõi hành động khắc phục",
    context:
      "Một sự cố downtime 15 phút xảy ra lần thứ hai trong 3 tháng với cùng một nguyên nhân gốc, dù lần đầu tiên đã có một buổi postmortem ghi nhận rõ ràng nguyên nhân và hướng khắc phục.",
    symptoms: ["Sự cố lần 2 có cùng nguyên nhân gốc với sự cố lần 1 cách đây 3 tháng", "Postmortem lần 1 có ghi hành động khắc phục 'thêm health check cho dependency X' nhưng action đó chưa từng được thực hiện"],
    filesystem: [{ name: "postmortems/2026-07-incident.md", type: "file", content: "## Action items\n- [ ] Thêm health check cho dependency X — Owner: @minh — (không có deadline, không ai theo dõi tiến độ)" }],
    services: [],
    logs: {},
    rootCauseSummary: "Action item quan trọng từ postmortem lần trước không có deadline, không được gán theo dõi tiến độ trong hệ thống quản lý công việc, nên bị quên lãng và không bao giờ được thực hiện.",
    rootCauseExplanation:
      "Buổi postmortem lần đầu đã xác định đúng nguyên nhân gốc và đề ra đúng hành động khắc phục (thêm health check cho dependency X để phát hiện sớm sự cố tương tự), nhưng action item này chỉ được ghi lại trong file markdown postmortem mà không được tạo thành một ticket có deadline và owner theo dõi trong hệ thống quản lý công việc (Jira/Linear...) của team. Theo thời gian, với áp lực công việc hàng ngày, action item không có deadline/theo dõi này dần bị quên lãng, dẫn tới nguyên nhân gốc chưa bao giờ thực sự được khắc phục và sự cố lặp lại đúng như vậy sau 3 tháng.",
    requiredFindings: ["sự cố lần 2 có cùng nguyên nhân gốc với lần 1, action item khắc phục từ postmortem trước chưa được thực hiện", "nguyên nhân là action item không có deadline/theo dõi tiến độ, dẫn tới bị bỏ quên"],
    rubric: [
      { criterion: "Xác nhận đúng 2 sự cố có cùng nguyên nhân gốc, liên hệ với postmortem trước đó", weight: 40 },
      { criterion: "Đề xuất đúng cải tiến quy trình: action item cần deadline + owner + theo dõi trong hệ thống quản lý công việc, không chỉ ghi trong văn bản", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat postmortems/2026-07-incident.md" }, output: "## Action items\n- [ ] Thêm health check cho dependency X — Owner: @minh — (không có deadline)" },
    ],
    hints: ["So sánh nguyên nhân gốc của 2 sự cố để xác nhận chúng có liên quan tới nhau không.", "Kiểm tra postmortem trước đó xem đã có hành động khắc phục nào được đề ra chưa.", "Một action item chỉ ghi trong văn bản mà không có deadline/theo dõi tiến độ rất dễ bị quên trong thực tế."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "EASY",
    title: "Thay đổi cấu hình không qua phê duyệt gây gián đoạn một phần dịch vụ",
    context:
      "Một kỹ sư tự ý chỉnh trực tiếp cấu hình load balancer trên production để 'thử nghiệm nhanh' một thay đổi, ngoài quy trình change management thông thường, khiến một phần traffic bị lỗi 502 trong 20 phút trước khi được rollback.",
    symptoms: ["Một phần người dùng báo lỗi 502 Bad Gateway trong khoảng 20 phút", "Không có change request/ticket nào tương ứng với thời điểm sự cố trong hệ thống quản lý thay đổi"],
    filesystem: [{ name: "change-log.md", type: "file", content: "(không có entry nào ghi nhận thay đổi cấu hình load balancer vào thời điểm sự cố)" }],
    services: [{ name: "load-balancer", status: "running" }],
    logs: {},
    rootCauseSummary: "Kỹ sư chỉnh trực tiếp cấu hình production để thử nghiệm nhanh, bỏ qua quy trình change management (review, approval, rollback plan) do nghĩ rằng đây chỉ là 'thay đổi nhỏ không đáng kể'.",
    rootCauseExplanation:
      "Quy trình change management yêu cầu mọi thay đổi cấu hình trên production phải qua review và có kế hoạch rollback trước khi áp dụng, kể cả những thay đổi tưởng chừng nhỏ — vì không phải lúc nào người thực hiện cũng lường trước hết tác động của một thay đổi cấu hình (ví dụ một rule routing mới trên load balancer có thể vô tình ảnh hưởng tới một nhóm traffic khác không liên quan trực tiếp). Việc bỏ qua quy trình này (dù với ý định tốt là 'thử nhanh rồi sửa ngay nếu có vấn đề') đã khiến thay đổi gây lỗi 502 cho một phần người dùng mà không có kế hoạch rollback chuẩn bị sẵn, kéo dài thời gian khắc phục sự cố hơn mức cần thiết.",
    requiredFindings: ["không có change request/ticket nào tương ứng với thay đổi gây ra sự cố", "nguyên nhân là thay đổi cấu hình production được thực hiện trực tiếp, bỏ qua quy trình change management"],
    rubric: [
      { criterion: "Xác nhận đúng không có change request hợp lệ cho thay đổi gây sự cố", weight: 40 },
      { criterion: "Đề xuất đúng việc củng cố quy trình change management, không chỉ nhắc nhở cá nhân", weight: 60 },
    ],
    presetCommands: [],
    hints: ["Kiểm tra hệ thống quản lý thay đổi xem có ticket/change request nào tương ứng thời điểm sự cố không.", "Mọi thay đổi cấu hình production, kể cả nhỏ, đều nên qua quy trình review trước khi áp dụng.", "Thiếu kế hoạch rollback chuẩn bị trước khiến thời gian khắc phục sự cố kéo dài hơn."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "MEDIUM",
    title: "Triển khai canary bỏ lỡ dấu hiệu cảnh báo sớm trước khi lan rộng 100%",
    context:
      "Một bản release mới được triển khai theo chiến lược canary (5% traffic trước), sau 15 phút không có cảnh báo nào kích hoạt nên được tự động nâng lên 100% traffic — ngay sau đó toàn bộ hệ thống báo lỗi tăng vọt.",
    symptoms: ["Error rate tăng vọt ngay sau khi canary release lên 100% traffic", "Xem lại dashboard giai đoạn canary 5%, error rate CÓ tăng nhẹ nhưng không đủ để vượt ngưỡng cảnh báo đã cấu hình"],
    filesystem: [],
    services: [{ name: "checkout-service-canary", status: "running" }],
    logs: { "metrics giai đoạn canary (5% traffic)": ["error_rate: 2.1% (baseline bình thường: 0.3%, ngưỡng cảnh báo cấu hình: 5%)"] },
    rootCauseSummary: "Ngưỡng cảnh báo cho giai đoạn canary được đặt quá cao (5%) so với baseline bình thường (0.3%), nên một sự gia tăng lỗi có ý nghĩa thống kê (2.1%, gấp 7 lần baseline) vẫn không đủ để kích hoạt cảnh báo và chặn việc tự động lan rộng lên 100%.",
    rootCauseExplanation:
      "Ngưỡng cảnh báo 5% có thể hợp lý cho giám sát error rate tổng thể ở quy mô 100% traffic (nơi biến động tự nhiên lớn hơn), nhưng lại quá thô với giai đoạn canary chỉ có 5% traffic, nơi mục tiêu là phát hiện SỚM một xu hướng lỗi tăng nhẹ nhưng rõ ràng so với baseline, trước khi nó ảnh hưởng tới toàn bộ người dùng. Error rate 2.1% tuy chưa chạm ngưỡng 5% nhưng đã gấp 7 lần baseline bình thường (0.3%) — một tín hiệu bất thường rõ ràng nếu so sánh tương đối thay vì chỉ dùng một ngưỡng tuyệt đối cố định. Vì hệ thống chỉ kiểm tra ngưỡng tuyệt đối, tín hiệu cảnh báo sớm này bị bỏ lỡ, canary được tự động coi là 'thành công' và lan rộng lên 100%, nơi cùng tỉ lệ lỗi tương đối đó ảnh hưởng tới toàn bộ người dùng thật.",
    requiredFindings: ["error rate trong giai đoạn canary đã tăng rõ rệt so với baseline (dù chưa chạm ngưỡng cảnh báo tuyệt đối)", "nguyên nhân là ngưỡng cảnh báo canary đặt quá cao/dùng giá trị tuyệt đối thay vì so sánh tương đối với baseline, bỏ lỡ tín hiệu cảnh báo sớm"],
    rubric: [
      { criterion: "So sánh đúng error rate giai đoạn canary với baseline bình thường để thấy mức tăng có ý nghĩa", weight: 40 },
      { criterion: "Đề xuất đúng cải tiến: dùng ngưỡng tương đối so với baseline (hoặc ngưỡng chặt hơn) cho giai đoạn canary, thay vì chỉ một ngưỡng tuyệt đối cố định", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "metrics giai đoạn canary (5% traffic)" }, output: "error_rate: 2.1% (baseline bình thường: 0.3%, ngưỡng cảnh báo cấu hình: 5%)" },
    ],
    hints: ["So sánh error rate giai đoạn canary với baseline bình thường, không chỉ nhìn vào việc có vượt ngưỡng cảnh báo tuyệt đối hay không.", "Một ngưỡng cảnh báo tuyệt đối cố định có thể quá thô để phát hiện sớm vấn đề trong giai đoạn canary traffic nhỏ.", "Cân nhắc dùng so sánh tương đối (ví dụ gấp bao nhiêu lần baseline) làm tiêu chí tự động chặn lan rộng canary."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "MEDIUM",
    title: "Capacity planning sai lệch khiến autoscaling chạm trần trong đợt cao điểm",
    context:
      "Trong một đợt khuyến mãi lớn được lên kế hoạch trước, hệ thống autoscaling cấu hình đúng theo capacity plan vẫn không đủ đáp ứng tải thực tế, dịch vụ bị quá tải và chậm nghiêm trọng trong 40 phút cao điểm nhất.",
    symptoms: ["Số lượng pod/instance chạm đúng giới hạn tối đa (maxReplicas) đã cấu hình trong autoscaling", "Traffic thực tế đỉnh điểm cao hơn khoảng 2.5 lần so với con số dự báo dùng để lập capacity plan"],
    filesystem: [{ name: "capacity-plan-promo-oct.md", type: "file", content: "Dự báo traffic đỉnh: dựa trên đợt khuyến mãi tương tự cách đây 6 tháng, nhân hệ số tăng trưởng 1.3x" }],
    services: [{ name: "checkout-service", status: "running" }],
    logs: { "kubectl get hpa checkout-service": ["REFERENCE                    TARGETS    MINPODS   MAXPODS   REPLICAS\nDeployment/checkout-service  100%/70%   5         40        40  (đã chạm trần)"] },
    rootCauseSummary: "Capacity plan dự báo traffic đỉnh dựa trên hệ số tăng trưởng tuyến tính từ đợt khuyến mãi cũ (x1.3), nhưng không tính tới việc đợt khuyến mãi lần này có quy mô marketing lớn hơn đáng kể (nhiều kênh quảng cáo mới, giảm giá sâu hơn) — traffic thực tế đỉnh điểm cao gấp 2.5 lần dự báo, vượt xa khả năng của maxReplicas đã cấu hình.",
    rootCauseExplanation:
      "Phương pháp lập capacity plan chỉ dựa trên việc ngoại suy tuyến tính từ dữ liệu lịch sử (đợt khuyến mãi 6 tháng trước x1.3) mà không tham vấn kỹ với đội marketing về QUY MÔ cụ thể của đợt khuyến mãi lần này (số kênh quảng cáo, mức độ giảm giá, đối tượng target mở rộng hơn) — những yếu tố định tính này có thể làm traffic tăng không tuyến tính so với lần trước. Vì maxReplicas của HPA được cấu hình dựa trên con số dự báo thấp hơn thực tế, khi traffic thật đạt đỉnh, autoscaling đã scale hết mức cho phép (chạm maxReplicas=40) nhưng vẫn không đủ công suất xử lý tải thực tế gấp 2.5 lần dự báo, dẫn tới dịch vụ quá tải trong giai đoạn cao điểm nhất dù về mặt kỹ thuật autoscaling hoạt động đúng như cấu hình.",
    requiredFindings: ["HPA đã chạm giới hạn maxReplicas trong giờ cao điểm", "nguyên nhân gốc là capacity plan dự báo traffic thấp hơn nhiều so với thực tế do chỉ ngoại suy tuyến tính, thiếu thông tin định tính về quy mô đợt khuyến mãi lần này"],
    rubric: [
      { criterion: "Xác định đúng autoscaling đã chạm trần cấu hình (maxReplicas), không phải lỗi kỹ thuật autoscaling", weight: 30 },
      { criterion: "Phân tích đúng sai lệch giữa capacity plan và traffic thực tế, chỉ ra hạn chế của phương pháp dự báo chỉ dựa vào ngoại suy tuyến tính", weight: 40 },
      { criterion: "Đề xuất cải tiến quy trình capacity planning (phối hợp với marketing/business, có buffer an toàn, khả năng tăng trần khẩn cấp)", weight: 30 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "kubectl get hpa checkout-service" }, output: "REFERENCE                    TARGETS    MINPODS   MAXPODS   REPLICAS\nDeployment/checkout-service  100%/70%   5         40        40" },
      { match: { type: "exact", pattern: "cat capacity-plan-promo-oct.md" }, output: "Dự báo traffic đỉnh: dựa trên đợt khuyến mãi tương tự cách đây 6 tháng, nhân hệ số tăng trưởng 1.3x" },
    ],
    hints: ["Kiểm tra xem autoscaling có đang chạm giới hạn cấu hình (maxReplicas) hay không — nếu có, vấn đề nằm ở capacity plan chứ không phải cơ chế autoscaling.", "So sánh traffic thực tế đỉnh điểm với con số dùng để lập capacity plan.", "Xem lại phương pháp dự báo traffic đã dùng — chỉ ngoại suy tuyến tính từ dữ liệu cũ có thể bỏ sót các yếu tố định tính quan trọng (quy mô marketing, kênh quảng cáo mới...)."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "MEDIUM",
    title: "Cảnh báo không tới được người trực do cấu hình escalation sai lịch",
    context:
      "Một sự cố nghiêm trọng xảy ra lúc 2 giờ sáng nhưng không có ai được gọi điện/page, dù hệ thống alerting xác nhận đã cố gắng thông báo. Sự cố chỉ được phát hiện khi người dùng ở múi giờ khác báo cáo vào buổi sáng.",
    symptoms: ["Hệ thống paging xác nhận đã cố gắng gửi thông báo lúc 2 giờ sáng", "Không kỹ sư trực nào nhận được cuộc gọi/thông báo nào"],
    filesystem: [{ name: "oncall-schedule.yaml", type: "file", content: "schedule:\n  - from: \"09:00\"\n    to: \"18:00\"\n    timezone: \"UTC\"  # lịch trực chỉ định nghĩa giờ hành chính UTC, thiếu khung giờ 18:00-09:00" }],
    services: [],
    logs: { "paging system log": ["Attempting to page on-call engineer for 'checkout-service'...", "No on-call engineer found in schedule for current time (02:00 UTC)", "Escalation failed: no fallback contact configured"] },
    rootCauseSummary: "Lịch trực (on-call schedule) chỉ được cấu hình cho khung giờ hành chính (09:00-18:00 UTC), bỏ sót hoàn toàn khung giờ còn lại trong ngày, và không có cấu hình fallback khi không tìm thấy người trực.",
    rootCauseExplanation:
      "Khi thiết lập ban đầu, lịch on-call được cấu hình dựa trên giả định (có thể đúng ở giai đoạn đầu khi team còn nhỏ, ít sự cố ngoài giờ) rằng chỉ cần có người trực trong giờ hành chính. Theo thời gian, dịch vụ đã phát triển thành hệ thống phục vụ người dùng toàn cầu 24/7, nhưng lịch on-call chưa từng được cập nhật để phủ đầy đủ cả ngày. Khi sự cố xảy ra lúc 2 giờ sáng UTC (ngoài khung giờ đã cấu hình), hệ thống paging không tìm thấy bất kỳ ai được lên lịch trực tại thời điểm đó, và vì cũng không có cấu hình fallback contact (ví dụ secondary on-call hoặc escalation tới quản lý) cho trường hợp 'không tìm thấy người trực', toàn bộ chuỗi escalation thất bại hoàn toàn mà không một ai nhận được thông báo nào.",
    requiredFindings: ["log hệ thống paging xác nhận không tìm thấy người trực tại thời điểm sự cố và escalation thất bại hoàn toàn", "nguyên nhân là lịch on-call chỉ phủ giờ hành chính, thiếu khung giờ còn lại và không có cấu hình fallback"],
    rubric: [
      { criterion: "Đọc đúng log hệ thống paging để xác nhận nguyên nhân là không tìm thấy người trực, không phải lỗi mạng/thiết bị cá nhân", weight: 40 },
      { criterion: "Xác định đúng lịch on-call thiếu phủ 24/7 và thiếu fallback contact, đề xuất khắc phục cả 2", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat oncall-schedule.yaml" }, output: "schedule:\n  - from: \"09:00\"\n    to: \"18:00\"\n    timezone: \"UTC\"" },
      { match: { type: "exact", pattern: "paging system log" }, output: "Attempting to page on-call engineer for 'checkout-service'...\nNo on-call engineer found in schedule for current time (02:00 UTC)\nEscalation failed: no fallback contact configured" },
    ],
    hints: ["Kiểm tra log hệ thống paging để xem nó có thực sự cố gắng tìm người trực không, và kết quả ra sao.", "Xem lại lịch on-call có phủ đầy đủ 24/7 hay chỉ một phần trong ngày.", "Một hệ thống alerting tốt cần có cấu hình fallback/escalation cho trường hợp không tìm thấy người trực chính."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "HARD",
    title: "Failover đa vùng không hoạt động như kỳ vọng trong sự cố thật",
    context:
      "Khi datacenter chính (region A) gặp sự cố mất điện toàn bộ, hệ thống được thiết kế với kiến trúc đa vùng (multi-region) để tự động failover sang region B, nhưng thời gian gián đoạn thực tế lại kéo dài hơn 45 phút thay vì dưới 2 phút như đã test trong các bài diễn tập (game day) trước đây.",
    symptoms: ["Failover tự động tới region B không xảy ra như kỳ vọng, phải can thiệp thủ công", "Các bài game day diễn tập failover trước đây luôn thành công trong vòng 2 phút"],
    filesystem: [],
    services: [{ name: "dns-failover-controller", status: "failed" }],
    logs: {
      "dns-failover-controller log": ["Health check endpoint for region A: timeout", "Attempting automatic failover to region B...", "ERROR: failover-controller itself is hosted in region A, lost connectivity during the outage"],
    },
    rootCauseSummary: "Chính bản thân dịch vụ điều khiển failover (failover-controller) lại được host trong region A — cùng vùng đang gặp sự cố — nên khi region A mất điện hoàn toàn, cơ chế failover tự động cũng bị mất khả năng hoạt động cùng lúc, đây là một single point of failure chưa từng bị phát hiện qua các bài game day trước đó.",
    rootCauseExplanation:
      "Các bài game day diễn tập trước đây luôn thành công vì chúng mô phỏng sự cố bằng cách tắt health check endpoint của region A một cách có kiểm soát (ví dụ chặn traffic hoặc trả về lỗi health check), trong khi toàn bộ hạ tầng khác của region A (bao gồm cả failover-controller) vẫn hoạt động bình thường — bài test chỉ thực sự kiểm tra ĐÚNG MỘT PHẦN của kịch bản failover (logic quyết định chuyển vùng), chứ không mô phỏng tình huống MẤT TOÀN BỘ hạ tầng của region A như sự cố mất điện thật. Khi sự cố thật xảy ra, chính failover-controller — thành phần chịu trách nhiệm PHÁT HIỆN sự cố và KÍCH HOẠT chuyển sang region B — lại được host ngay trong region A và mất khả năng hoạt động đồng thời với mọi thứ khác, khiến cơ chế tự động hoàn toàn tê liệt, đội vận hành phải phát hiện sự cố qua kênh khác và can thiệp thủ công, kéo dài thời gian gián đoạn gấp hơn 20 lần so với mục tiêu thiết kế.",
    requiredFindings: ["log cho thấy chính failover-controller bị mất kết nối trong sự cố, không thể tự kích hoạt failover", "nguyên nhân gốc là failover-controller được host trong chính region đang gặp sự cố (single point of failure), và các bài game day trước đây chưa từng mô phỏng đúng kịch bản mất toàn bộ hạ tầng một vùng"],
    rubric: [
      { criterion: "Phát hiện đúng failover-controller tự nó cũng bị ảnh hưởng bởi sự cố, không chỉ đơn thuần là 'cơ chế failover bị lỗi'", weight: 40 },
      { criterion: "Chỉ ra đúng khoảng cách giữa kịch bản game day trước đây và sự cố thật (test không mô phỏng đúng mức độ nghiêm trọng)", weight: 30 },
      { criterion: "Đề xuất đúng khắc phục kiến trúc: host failover-controller độc lập (region thứ 3 hoặc multi-region tự thân) và cập nhật kịch bản game day sát thực tế hơn", weight: 30 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "dns-failover-controller log" }, output: "Health check endpoint for region A: timeout\nAttempting automatic failover to region B...\nERROR: failover-controller itself is hosted in region A, lost connectivity during the outage" },
    ],
    hints: ["Kiểm tra chính bản thân dịch vụ điều khiển failover được host ở đâu — nó có thể là một single point of failure dù hệ thống chính đã có multi-region.", "So sánh kịch bản của các bài game day trước đây với mức độ nghiêm trọng thực tế của sự cố lần này (mất điện toàn bộ vùng, không chỉ mất health check).", "Một cơ chế tự động hoá cho failover cần tự nó cũng có khả năng chịu lỗi độc lập với chính vùng mà nó đang giám sát."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "HARD",
    title: "Lỗi dây chuyền do bão retry làm sập dịch vụ downstream đang phục hồi",
    context:
      "Một dịch vụ downstream (service xử lý thanh toán) bị chậm tạm thời do một vấn đề hạ tầng nhỏ (database tăng latency trong 3 phút). Thay vì chỉ ảnh hưởng nhẹ, toàn bộ hệ thống sập hoàn toàn trong 25 phút, lâu hơn nhiều so với vấn đề gốc ban đầu.",
    symptoms: ["Vấn đề gốc (database chậm) chỉ kéo dài 3 phút và tự phục hồi", "Toàn hệ thống tiếp tục bị quá tải và sập thêm 22 phút SAU KHI database đã phục hồi bình thường"],
    filesystem: [{ name: "payment-client.ts", type: "file", content: "// Retry logic: retry ngay lập tức 5 lần liên tiếp nếu timeout, không có backoff, không có circuit breaker" }],
    services: [{ name: "payment-service", status: "failed" }],
    logs: {
      "payment-service metrics": ["Request rate tăng gấp 6 lần bình thường ngay khi database bắt đầu chậm (do mỗi request gốc sinh ra tới 5 lần retry)", "Database đã phục hồi latency bình thường ở phút thứ 3, nhưng request rate vẫn cao gấp 6 lần tới phút thứ 25"],
    },
    rootCauseSummary: "Mỗi client gọi payment-service có logic retry ngay lập tức 5 lần khi gặp timeout, không có backoff tăng dần và không có circuit breaker — khi database chậm trong 3 phút ban đầu, lượng request thực tế tăng vọt gấp 6 lần do retry, tạo ra một 'bão retry' (retry storm) làm chính payment-service (vốn đã yếu sẵn) sập hoàn toàn, và duy trì tình trạng quá tải đó rất lâu sau khi nguyên nhân gốc (database chậm) đã biến mất.",
    rootCauseExplanation:
      "Khi database bắt đầu chậm, các request gọi payment-service bắt đầu timeout. Logic retry hiện tại (retry ngay lập tức 5 lần liên tiếp, không có exponential backoff, không có jitter, không có circuit breaker để tạm ngừng gọi khi phát hiện downstream đang gặp vấn đề) khiến MỖI request gốc thất bại sinh ra thêm tới 5 request retry gần như ngay lập tức — tổng lượng request thực tế gửi tới payment-service tăng vọt gấp 6 lần chỉ trong vài giây, vượt xa khả năng xử lý của chính payment-service (dù bản thân service này không hề có vấn đề gì về code). Payment-service bị quá tải bởi chính lượng retry này và bắt đầu trả lỗi/timeout nhiều hơn, kích hoạt THÊM retry từ các client khác đang gọi tới nó — tạo thành một vòng xoáy tự củng cố (self-reinforcing cascading failure). Vì database đã phục hồi ở phút thứ 3 nhưng chính payment-service vẫn đang bị chôn vùi dưới lượng retry request khổng lồ tự nó tạo ra, hệ thống tiếp tục ở trạng thái quá tải thêm 22 phút nữa cho tới khi retry traffic tự giảm dần (do client timeout/bỏ cuộc) và payment-service mới có cơ hội phục hồi.",
    requiredFindings: ["request rate tăng vọt ngay khi database bắt đầu chậm và duy trì cao bất thường rất lâu sau khi database đã phục hồi", "nguyên nhân gốc là logic retry không có backoff/circuit breaker tạo ra bão retry tự củng cố, làm quá tải chính service gọi (payment-service) lâu hơn nhiều so với vấn đề gốc ban đầu"],
    rubric: [
      { criterion: "Phát hiện đúng request rate tăng vọt và duy trì lâu hơn nhiều so với thời gian vấn đề gốc tồn tại", weight: 30 },
      { criterion: "Xác định đúng nguyên nhân là logic retry không có backoff/circuit breaker gây retry storm tự củng cố", weight: 40 },
      { criterion: "Đề xuất đúng khắc phục: thêm exponential backoff với jitter và circuit breaker cho logic gọi downstream", weight: 30 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "payment-service metrics" }, output: "Request rate tăng gấp 6 lần bình thường ngay khi database bắt đầu chậm\nDatabase phục hồi latency bình thường ở phút thứ 3, nhưng request rate vẫn cao gấp 6 lần tới phút thứ 25" },
      { match: { type: "exact", pattern: "cat payment-client.ts" }, output: "// Retry logic: retry ngay lập tức 5 lần liên tiếp nếu timeout, không có backoff, không có circuit breaker" },
    ],
    hints: ["So sánh thời điểm nguyên nhân gốc (database chậm) kết thúc với thời điểm hệ thống thực sự phục hồi — chênh lệch lớn gợi ý một hiệu ứng dây chuyền tự củng cố.", "Kiểm tra request rate thực tế so với bình thường — tăng đột biến gợi ý có cơ chế khuếch đại traffic (như retry) đang hoạt động.", "Logic retry không có backoff và không có circuit breaker là nguyên nhân kinh điển gây ra cascading failure/retry storm khi downstream gặp sự cố dù chỉ tạm thời và nhỏ."],
  }),
  scenario({
    topicSlug: "sre",
    difficulty: "HARD",
    title: "Vi phạm SLO liên tục do phụ thuộc bên thứ ba không có phương án dự phòng",
    context:
      "Dịch vụ xác thực người dùng (login) liên tục vi phạm SLO về latency trong suốt một tháng qua, dù đội phát triển đã tối ưu code nhiều lần mà không cải thiện được đáng kể. Phân tích sâu hơn cho thấy gốc rễ nằm ở một dependency bên ngoài.",
    symptoms: ["p99 latency của API login thường xuyên vượt SLO (500ms) trong các khung giờ cao điểm cụ thể", "Không có thay đổi code nào của chính dịch vụ login trong suốt giai đoạn vi phạm SLO"],
    filesystem: [],
    services: [{ name: "login-service", status: "running" }],
    logs: {
      "distributed trace (span chậm nhất)": ["login-service: 45ms", "→ call to third-party-fraud-check-api: 1850ms (chiếm hơn 95% tổng thời gian request)", "(không có cơ chế timeout/fallback khi third-party API chậm)"],
    },
    rootCauseSummary: "API login gọi đồng bộ (synchronous) tới một dịch vụ kiểm tra gian lận (fraud check) của bên thứ ba như một bước bắt buộc trong luồng đăng nhập, không có timeout hợp lý và không có phương án dự phòng (fallback) khi bên thứ ba chậm — latency của bên thứ ba trong giờ cao điểm trực tiếp cộng dồn vào latency tổng của API login.",
    rootCauseExplanation:
      "Việc tối ưu code của chính login-service không cải thiện được tình hình vì theo distributed trace, phần lớn thời gian xử lý (hơn 95%) không nằm trong logic của login-service mà nằm ở việc chờ phản hồi từ một API fraud-check của bên thứ ba được gọi đồng bộ như một bước bắt buộc trước khi hoàn tất đăng nhập. Bên thứ ba này có SLA/hiệu năng không ổn định trong giờ cao điểm (có thể do chính họ cũng đang gặp vấn đề tải cao), và vì luồng gọi không có timeout hợp lý (đang chờ tới khi bên thứ ba phản hồi, dù lâu tới đâu) cũng không có cơ chế fallback (ví dụ cho phép đăng nhập tạm thời và kiểm tra gian lận bất đồng bộ sau, hoặc dùng kết quả cache gần nhất khi bên thứ ba chậm), toàn bộ latency bất thường của bên thứ ba được truyền thẳng và cộng dồn vào trải nghiệm của người dùng cuối, vi phạm SLO của chính login-service dù bản thân service này hoàn toàn không có vấn đề gì về hiệu năng nội tại.",
    requiredFindings: ["distributed trace cho thấy phần lớn thời gian xử lý nằm ở việc gọi API bên thứ ba (fraud-check), không phải logic của login-service", "nguyên nhân gốc là luồng gọi đồng bộ không có timeout/fallback khi bên thứ ba chậm, khiến SLO của login-service phụ thuộc trực tiếp vào SLA không ổn định của bên ngoài"],
    rubric: [
      { criterion: "Dùng distributed trace để xác định đúng nguồn gốc thời gian xử lý nằm ở dependency bên ngoài, không phải code của chính service", weight: 40 },
      { criterion: "Đề xuất đúng hướng khắc phục kiến trúc: thêm timeout hợp lý và cơ chế fallback (xử lý bất đồng bộ hoặc cache) cho lệnh gọi bên thứ ba thay vì tiếp tục tối ưu code nội bộ vô ích", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "distributed trace (span chậm nhất)" }, output: "login-service: 45ms\n→ call to third-party-fraud-check-api: 1850ms (chiếm hơn 95% tổng thời gian request)\n(không có cơ chế timeout/fallback khi third-party API chậm)" },
    ],
    hints: ["Việc tối ưu code nội bộ không cải thiện được tình hình gợi ý nguyên nhân không nằm trong logic của chính service.", "Dùng distributed tracing để xem chi tiết thời gian được tiêu tốn ở đâu trong toàn bộ chuỗi xử lý một request.", "Khi một bước bắt buộc trong luồng chính gọi tới dependency bên ngoài không ổn định mà không có timeout/fallback, SLO của dịch vụ sẽ bị 'kéo theo' SLA của bên ngoài đó."],
  }),
] as const;
