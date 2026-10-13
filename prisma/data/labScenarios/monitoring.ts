import { scenario } from "./types";

export const monitoringScenarios = [
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "EASY",
    title: "Zabbix agent không báo cáo về server giám sát",
    context:
      "Một server mới được cài Zabbix agent nhưng không hề xuất hiện dữ liệu nào trên dashboard Zabbix sau nhiều giờ, dù agent báo đang chạy.",
    symptoms: ["Dashboard Zabbix hiển thị host 'No data' cho mọi item", "systemctl status zabbix-agent trên server đó báo running bình thường"],
    filesystem: [{ name: "/etc/zabbix/zabbix_agentd.conf", type: "file", content: "Server=10.0.0.50\nServerActive=10.0.0.50\nHostname=app-server-03" }],
    services: [{ name: "zabbix-agent", status: "running" }],
    logs: { "tail /var/log/zabbix/zabbix_agentd.log": ["cannot send data to [10.0.0.50]:10051: connection refused"] },
    rootCauseSummary: "Agent cấu hình sai địa chỉ IP của Zabbix server (10.0.0.50) trong khi server thật đang chạy ở 10.0.0.15.",
    rootCauseExplanation:
      "Kỹ sư copy file cấu hình từ một template cũ có sẵn IP Zabbix server của môi trường khác, quên sửa lại đúng IP của Zabbix server hiện tại (10.0.0.15). Agent vẫn chạy bình thường ở local và cố gắng gửi dữ liệu nhưng kết nối bị từ chối vì không có Zabbix server nào lắng nghe ở địa chỉ 10.0.0.50, nên server giám sát không bao giờ nhận được dữ liệu từ host này.",
    requiredFindings: ["log agent báo connection refused khi gửi dữ liệu", "nguyên nhân là cấu hình sai địa chỉ IP Zabbix server trong file config"],
    rubric: [
      { criterion: "Kiểm tra log agent để tìm lỗi kết nối", weight: 40 },
      { criterion: "Phát hiện đúng IP server trong cấu hình bị sai", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/zabbix/zabbix_agentd.conf" }, output: "Server=10.0.0.50\nServerActive=10.0.0.50\nHostname=app-server-03" },
      { match: { type: "exact", pattern: "tail /var/log/zabbix/zabbix_agentd.log" }, output: "cannot send data to [10.0.0.50]:10051: connection refused" },
    ],
    hints: ["Agent chạy bình thường không có nghĩa là nó gửi dữ liệu thành công — kiểm tra log.", "Xem file cấu hình agent, chú ý địa chỉ IP của Zabbix server.", "Xác nhận với team IP thật của Zabbix server trong môi trường hiện tại."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "EASY",
    title: "Đĩa đầy do thiếu cấu hình xoay vòng log",
    context:
      "Một server chạy ứng dụng ghi log rất nhiều (debug mode bật nhầm trong production) báo cảnh báo dung lượng đĩa gần đầy liên tục qua hệ thống monitoring.",
    symptoms: ["Cảnh báo disk usage > 90% xuất hiện liên tục trên dashboard", "Thư mục log ứng dụng có một file log duy nhất rất lớn, không có file .1, .gz nào khác"],
    filesystem: [{ name: "/var/log/myapp/app.log", type: "file", content: "... file log 15GB, không thấy có app.log.1.gz hay cấu hình logrotate nào ..." }],
    services: [],
    logs: { "ls /etc/logrotate.d/": ["nginx", "(không có file cấu hình cho myapp)"] },
    rootCauseSummary: "Ứng dụng myapp chưa được thêm vào logrotate, cộng với debug mode vô tình bật khiến log sinh ra rất nhanh.",
    rootCauseExplanation:
      "Khi deploy ứng dụng mới, team quên thêm file cấu hình logrotate cho /var/log/myapp/app.log (chỉ có sẵn cấu hình cho nginx). Đồng thời một biến môi trường LOG_LEVEL=debug bị để sót từ môi trường test, khiến ứng dụng ghi log với tốc độ rất nhanh. Kết hợp 2 yếu tố này, file log phình to không kiểm soát, gây cảnh báo dung lượng đĩa liên tục.",
    requiredFindings: ["file log ứng dụng rất lớn và không có cấu hình logrotate tương ứng", "nguyên nhân kết hợp từ thiếu logrotate và debug mode bị bật nhầm"],
    rubric: [
      { criterion: "Tìm ra file log lớn gây đầy đĩa", weight: 40 },
      { criterion: "Xác định đúng cả 2 yếu tố: thiếu logrotate và log level sai", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "du -sh /var/log/myapp" }, output: "15G\t/var/log/myapp" },
      { match: { type: "exact", pattern: "ls /etc/logrotate.d/" }, output: "nginx" },
    ],
    hints: ["Tìm thư mục/file log nào đang chiếm nhiều dung lượng nhất.", "Kiểm tra xem ứng dụng đã có cấu hình logrotate chưa.", "Kiểm tra biến môi trường LOG_LEVEL của ứng dụng, có thể đang ở mức debug không phù hợp production."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "EASY",
    title: "Prometheus không scrape được target do sai cổng expose metrics",
    context:
      "Một service mới được thêm vào danh sách scrape của Prometheus nhưng dashboard Grafana tương ứng không hiển thị dữ liệu nào, mục tiêu báo DOWN.",
    symptoms: ["Trang Prometheus Targets hiển thị target của service này ở trạng thái DOWN", "Service vẫn hoạt động bình thường, phục vụ traffic thật tốt"],
    filesystem: [{ name: "prometheus.yml", type: "file", content: "- job_name: 'order-service'\n  static_configs:\n    - targets: ['order-service:9090']" }],
    services: [{ name: "order-service", status: "running", port: 8081 }],
    logs: { "Prometheus target error": ["Get \"http://order-service:9090/metrics\": dial tcp: connect: connection refused"] },
    rootCauseSummary: "Cấu hình scrape Prometheus trỏ sai cổng (9090) trong khi service thực tế expose endpoint /metrics ở cổng 8081.",
    rootCauseExplanation:
      "Kỹ sư cấu hình job scrape dùng cổng mặc định hay thấy trong tài liệu Prometheus (9090 — vốn là cổng mặc định CỦA Prometheus server, không phải của service được scrape), nhưng order-service thực tế expose metrics endpoint ở cổng ứng dụng 8081 theo cấu hình riêng của team. Prometheus cố gắng kết nối tới cổng 9090 của service không hề lắng nghe ở đó nên bị từ chối kết nối, target báo DOWN dù bản thân service hoàn toàn khoẻ mạnh.",
    requiredFindings: ["Prometheus target báo DOWN với lỗi connection refused", "nguyên nhân là cấu hình scrape dùng sai cổng so với cổng thật service expose metrics"],
    rubric: [
      { criterion: "Xác định đúng service vẫn hoạt động bình thường (loại trừ lỗi từ service)", weight: 30 },
      { criterion: "Phát hiện đúng cổng scrape trong cấu hình Prometheus sai so với cổng thật", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat prometheus.yml" }, output: "- job_name: 'order-service'\n  static_configs:\n    - targets: ['order-service:9090']" },
      { match: { type: "exact", pattern: "curl order-service:8081/metrics" }, output: "# HELP http_requests_total Total HTTP requests\nhttp_requests_total 1024" },
    ],
    hints: ["Service hoạt động bình thường với traffic thật không có nghĩa là metrics endpoint đúng cổng.", "So sánh cổng trong cấu hình scrape Prometheus với cổng thật service đang lắng nghe.", "Thử curl trực tiếp tới endpoint /metrics ở các cổng khác nhau để xác nhận."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "MEDIUM",
    title: "Quá tải cảnh báo do thiếu gom nhóm, đội trực bỏ sót sự cố thật",
    context:
      "Trong một đợt sự cố downstream kéo dài 30 phút, đội trực nhận được hơn 200 thông báo cảnh báo dồn dập qua Slack/điện thoại, khiến họ tắt thông báo tạm thời và bỏ lỡ một cảnh báo quan trọng khác không liên quan.",
    symptoms: ["Hơn 200 alert bắn ra trong 10 phút đầu sự cố, từ nhiều service khác nhau", "Đội trực báo cáo 'alert fatigue', không phân biệt được cảnh báo nào quan trọng"],
    filesystem: [{ name: "alertmanager.yml", type: "file", content: "route:\n  receiver: slack-oncall\n  group_by: []\n  group_wait: 0s" }],
    services: [{ name: "alertmanager", status: "running" }],
    logs: {},
    rootCauseSummary: "Alertmanager không được cấu hình gom nhóm (group_by rỗng) và group_wait bằng 0, nên mỗi alert riêng lẻ từ hàng chục service bị ảnh hưởng dây chuyền đều bắn thông báo ngay lập tức, không gộp lại theo nguyên nhân gốc.",
    rootCauseExplanation:
      "Khi một dependency downstream (ví dụ database) gặp sự cố, hàng chục service phụ thuộc vào nó đồng loạt kích hoạt alert riêng của từng service (timeout, error rate cao...). Về bản chất đây chỉ là MỘT sự cố gốc, nhưng vì Alertmanager cấu hình group_by rỗng (không gom theo nhãn chung như cluster/alertname) và group_wait=0s (gửi ngay không đợi gom), mỗi alert bắn ra thành một thông báo riêng biệt ngay lập tức, tạo ra 'cơn bão' thông báo khiến đội trực quá tải và mất khả năng phân biệt cái gì thực sự cần xử lý ngay.",
    requiredFindings: ["cấu hình Alertmanager có group_by rỗng và group_wait=0s", "nguyên nhân là thiếu cơ chế gom nhóm cảnh báo khiến một sự cố gốc tạo ra hàng trăm thông báo riêng lẻ"],
    rubric: [
      { criterion: "Nhận diện đúng vấn đề là thiếu gom nhóm (grouping), không phải do có quá nhiều sự cố thật", weight: 40 },
      { criterion: "Đề xuất hướng khắc phục hợp lý (group_by theo nguyên nhân gốc, group_wait phù hợp)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat alertmanager.yml" }, output: "route:\n  receiver: slack-oncall\n  group_by: []\n  group_wait: 0s" },
    ],
    hints: ["Hơn 200 alert trong 10 phút từ nhiều service khác nhau có thể cùng xuất phát từ MỘT nguyên nhân gốc.", "Kiểm tra cấu hình group_by và group_wait của Alertmanager.", "Cơ chế gom nhóm cảnh báo giúp đội trực nhìn thấy 1 sự cố thay vì hàng trăm thông báo rời rạc."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "MEDIUM",
    title: "Pipeline thu thập log bị tồn đọng ngày càng tăng",
    context:
      "Team phát hiện log trên dashboard Kibana bị trễ ngày càng nhiều so với thời gian thực — ban đầu chỉ vài phút, nay đã lên tới hơn 2 giờ, dù các service nguồn vẫn ghi log bình thường.",
    symptoms: ["Log mới nhất trên Kibana luôn trễ hơn 2 giờ so với giờ thực", "Độ trễ tăng dần đều theo thời gian, không đứt quãng"],
    filesystem: [],
    services: [{ name: "logstash", status: "running" }],
    logs: { "logstash queue stats": ["queue.type: persisted", "queue.events: 2847193", "queue.capacity.max_events: 3000000 (gần đầy)"] },
    rootCauseSummary: "Pipeline Logstash xử lý chậm hơn tốc độ log được sinh ra (một filter grok phức tạp mới thêm gần đây tốn nhiều CPU), khiến hàng đợi (queue) ngày càng phình to và độ trễ tích luỹ tăng dần.",
    rootCauseExplanation:
      "Một filter grok pattern phức tạp mới được thêm vào pipeline Logstash để parse thêm một định dạng log mới, nhưng pattern này có độ phức tạp tính toán cao (catastrophic backtracking trên một số input), làm giảm throughput xử lý của Logstash xuống thấp hơn tốc độ log đổ vào từ các service nguồn. Vì chênh lệch throughput này diễn ra liên tục, hàng đợi persisted queue ngày càng đầy dần (gần chạm max_events), và độ trễ giữa 'log được tạo ra' và 'log xuất hiện trên Kibana' tích luỹ tăng dần theo thời gian thay vì ổn định.",
    requiredFindings: ["hàng đợi Logstash gần đầy và độ trễ xử lý tăng dần liên tục", "nguyên nhân là throughput pipeline giảm (do filter grok mới tốn CPU) thấp hơn tốc độ log sinh ra"],
    rubric: [
      { criterion: "Kiểm tra trạng thái hàng đợi Logstash để xác nhận tồn đọng", weight: 40 },
      { criterion: "Liên hệ đúng với thay đổi gần đây trong pipeline (filter mới) làm giảm throughput", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "logstash queue stats" }, output: "queue.type: persisted\nqueue.events: 2847193\nqueue.capacity.max_events: 3000000" },
      { match: { type: "exact", pattern: "top -p $(pgrep -f logstash)" }, output: "%CPU 98.0  (gần full 1 core, liên tục)" },
    ],
    hints: ["Độ trễ tăng dần đều (không đứt quãng) gợi ý throughput xử lý thấp hơn tốc độ dữ liệu vào, không phải lỗi gián đoạn.", "Kiểm tra trạng thái hàng đợi (queue) của pipeline xử lý log.", "Xem lại các thay đổi gần đây trong pipeline (filter/grok pattern mới) có thể ảnh hưởng hiệu năng xử lý."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "MEDIUM",
    title: "Dashboard Grafana hiển thị 'No data' dù hệ thống vẫn hoạt động bình thường",
    context:
      "Một dashboard Grafana quan trọng theo dõi error rate của hệ thống thanh toán đột nhiên hiển thị 'No data' cho mọi panel, trong khi team xác nhận hệ thống thanh toán vẫn chạy bình thường.",
    symptoms: ["Mọi panel trên dashboard đều hiển thị 'No data'", "Prometheus Targets page cho thấy các target liên quan vẫn UP bình thường"],
    filesystem: [],
    services: [{ name: "grafana", status: "running" }],
    logs: { "Grafana datasource test": ["HTTP Error Bad Gateway", "data source URL: http://prometheus-old.internal:9090 (đã bị decommission tuần trước)"] },
    rootCauseSummary: "Datasource Prometheus được cấu hình trong Grafana trỏ tới một địa chỉ Prometheus cũ đã bị gỡ bỏ, trong khi hệ thống thật đã chuyển sang Prometheus mới ở địa chỉ khác.",
    rootCauseExplanation:
      "Tuần trước team hạ tầng đã migrate Prometheus sang một cụm mới (địa chỉ prometheus-new.internal) và decommission cụm cũ, nhưng quên cập nhật lại cấu hình datasource trong Grafana — dashboard vẫn đang trỏ tới địa chỉ Prometheus cũ không còn tồn tại. Vì Prometheus Targets page mà kỹ sư kiểm tra lại là của cụm MỚI (đang hoạt động đúng), dễ gây nhầm lẫn ban đầu rằng mọi thứ ổn trong khi vấn đề thực sự nằm ở chỗ Grafana đang hỏi sai địa chỉ datasource.",
    requiredFindings: ["test datasource trong Grafana báo lỗi Bad Gateway tới một địa chỉ Prometheus cũ", "nguyên nhân là datasource Grafana chưa được cập nhật sau khi migrate Prometheus sang cụm mới"],
    rubric: [
      { criterion: "Không dừng lại ở việc Prometheus Targets 'UP' mà kiểm tra tiếp cấu hình datasource của Grafana", weight: 50 },
      { criterion: "Xác định đúng datasource trỏ sai địa chỉ Prometheus đã decommission", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "Grafana datasource test" }, output: "HTTP Error Bad Gateway\ndata source URL: http://prometheus-old.internal:9090 (đã bị decommission tuần trước)" },
    ],
    hints: ["Prometheus Targets 'UP' chỉ xác nhận Prometheus đang scrape được target, không đảm bảo Grafana đang hỏi đúng Prometheus đó.", "Kiểm tra cấu hình datasource trong Grafana và test kết nối trực tiếp.", "Xem lại các thay đổi hạ tầng gần đây (ví dụ migrate Prometheus) có thể ảnh hưởng tới cấu hình datasource cũ."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "HARD",
    title: "Prometheus hết bộ nhớ do bùng nổ cardinality nhãn",
    context:
      "Prometheus server trung tâm của công ty bắt đầu bị OOM-killed định kỳ vài lần mỗi ngày sau khi một team thêm một metric mới có gắn nhãn chứa user_id.",
    symptoms: ["Tiến trình Prometheus bị kernel OOM Killer giết định kỳ, tự restart", "Sau mỗi lần restart, Prometheus mất một khoảng thời gian dài để load lại WAL trước khi scrape bình thường"],
    filesystem: [],
    services: [{ name: "prometheus", status: "failed" }],
    logs: {
      "dmesg | grep -i oom": ["Out of memory: Killed process (prometheus) total-vm:28000000kB"],
      "prometheus tsdb status": ["Head series: 18,420,311", "(bình thường trước đây chỉ khoảng 400,000 series)"],
    },
    rootCauseSummary: "Một metric mới gắn nhãn user_id (hàng trăm nghìn giá trị khác nhau) làm số lượng time series (cardinality) tăng vọt từ 400 nghìn lên hơn 18 triệu, vượt xa khả năng bộ nhớ của Prometheus server.",
    rootCauseExplanation:
      "Prometheus lưu mỗi tổ hợp duy nhất của (tên metric + giá trị tất cả nhãn) thành một time series riêng, mỗi series tốn một lượng bộ nhớ cố định để giữ trong head block (đang ghi, chưa flush xuống đĩa). Việc thêm nhãn user_id vào một metric (counter đếm request theo từng user) là một lỗi thiết kế kinh điển về cardinality — vì user_id có hàng trăm nghìn giá trị khác nhau, số lượng time series tăng theo cấp số nhân (tích của tất cả tổ hợp nhãn), từ 400 nghìn series bình thường vọt lên hơn 18 triệu, vượt xa RAM mà Prometheus server được cấp phát, dẫn tới bị OOM Killer giết định kỳ.",
    requiredFindings: ["số lượng head series của Prometheus tăng đột biến bất thường (từ ~400 nghìn lên 18 triệu)", "nguyên nhân là một metric mới gắn nhãn có cardinality rất cao (user_id)"],
    rubric: [
      { criterion: "Phát hiện đúng số lượng time series tăng đột biến qua tsdb status", weight: 40 },
      { criterion: "Liên hệ đúng với metric mới có nhãn cardinality cao là nguyên nhân gốc, không phải do Prometheus cần nâng cấp RAM đơn thuần", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "dmesg | grep -i oom" }, output: "Out of memory: Killed process 4021 (prometheus) total-vm:28000000kB, anon-rss:26000000kB" },
      { match: { type: "exact", pattern: "prometheus tsdb status" }, output: "Head series: 18,420,311\nTop 10 label pairs with highest cardinality:\n  user_id=... (812,004 giá trị khác nhau)" },
    ],
    hints: ["Mỗi tổ hợp giá trị nhãn tạo ra một time series riêng trong Prometheus — nhãn có nhiều giá trị khác nhau (cardinality cao) rất tốn bộ nhớ.", "Kiểm tra số lượng head series hiện tại và xem nhãn nào đang đóng góp nhiều series nhất.", "Không nên gắn các giá trị gần như duy nhất (user_id, request_id, email...) làm nhãn metric trong Prometheus."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "HARD",
    title: "Cụm Elasticsearch chuyển sang trạng thái Red do shard không phân bổ được",
    context:
      "Cụm logging ELK gồm 3 node bất ngờ chuyển trạng thái cluster health từ Green sang Red sau khi một node bị crash và được thay thế bằng node mới, dashboard Kibana báo lỗi khi tìm kiếm một số index.",
    symptoms: ["GET _cluster/health trả về status: red", "Một số truy vấn Kibana báo lỗi 'no such index' dù index đó vẫn hiển thị trong danh sách"],
    filesystem: [],
    services: [{ name: "elasticsearch-node3 (mới thay)", status: "running" }],
    logs: {
      "GET _cluster/allocation/explain": ["\"unassigned_info\": {\"reason\": \"NODE_LEFT\"}", "\"allocate_explanation\": \"cannot allocate because allocation is not permitted to any of the nodes\"", "node has fewer than the required [1] shard copies (disk watermark exceeded on node3)"],
    },
    rootCauseSummary: "Node mới thay thế có dung lượng đĩa trống thấp hơn ngưỡng watermark cấu hình, khiến Elasticsearch từ chối phân bổ lại các shard chính (primary) bị mất từ node cũ sang node mới, dẫn tới cluster health RED.",
    rootCauseExplanation:
      "Khi node cũ bị crash, các shard primary mà nó đang giữ trở thành 'unassigned', cluster cần phân bổ lại (re-allocate) các shard này sang node còn lại/node mới để khôi phục dữ liệu. Tuy nhiên node mới được cấp đĩa nhỏ hơn dự kiến, dung lượng trống hiện tại đã vượt ngưỡng 'disk watermark' cấu hình (ví dụ cluster.routing.allocation.disk.watermark.low), nên Elasticsearch chủ động từ chối phân bổ thêm shard mới vào node này để tránh làm đầy đĩa — kết quả là một số shard primary vẫn mãi ở trạng thái unassigned, khiến toàn bộ cluster health chuyển RED (vì thiếu primary shard, không chỉ là vấn đề replica).",
    requiredFindings: ["_cluster/allocation/explain cho thấy shard không phân bổ được do vượt ngưỡng disk watermark trên node mới", "nguyên nhân là node thay thế không đủ dung lượng đĩa trống theo ngưỡng cấu hình của cluster"],
    rubric: [
      { criterion: "Dùng đúng API _cluster/allocation/explain để tìm nguyên nhân shard unassigned", weight: 40 },
      { criterion: "Xác định đúng nguyên nhân gốc là disk watermark trên node mới, không chỉ dừng ở 'node left'", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "GET _cluster/health" }, output: "{\"status\": \"red\", \"unassigned_shards\": 4}" },
      { match: { type: "exact", pattern: "GET _cluster/allocation/explain" }, output: "{\"unassigned_info\": {\"reason\": \"NODE_LEFT\"}, \"allocate_explanation\": \"cannot allocate because allocation is not permitted to any of the nodes — disk watermark exceeded on node3\"}" },
    ],
    hints: ["_cluster/health status red nghĩa là có ít nhất một shard primary bị mất/không phân bổ được, nghiêm trọng hơn yellow.", "Dùng _cluster/allocation/explain để Elasticsearch tự giải thích vì sao một shard cụ thể không được phân bổ.", "Kiểm tra dung lượng đĩa trống của node mới so với ngưỡng disk watermark cấu hình cluster."],
  }),
  scenario({
    topicSlug: "monitoring-logging",
    difficulty: "HARD",
    title: "Hệ thống cảnh báo im lặng hoàn toàn dù sự cố thật đang xảy ra",
    context:
      "Một sự cố downtime kéo dài 40 phút xảy ra ngoài giờ hành chính nhưng không một cảnh báo nào được gửi tới đội trực qua PagerDuty, dù team xác nhận rule cảnh báo cho tình huống này đã tồn tại và từng hoạt động đúng trước đây.",
    symptoms: ["Không nhận được bất kỳ page/cảnh báo nào trong suốt 40 phút downtime", "Khi kiểm tra lại Alertmanager UI sau sự cố, thấy alert ĐÃ được kích hoạt đúng lúc"],
    filesystem: [],
    services: [{ name: "alertmanager", status: "running" }],
    logs: {
      "alertmanager logs": ["level=error msg=\"Notify for alerts failed\" integration=pagerduty err=\"unexpected status code 401: Invalid routing key\""],
    },
    rootCauseSummary: "Khoá routing key tích hợp PagerDuty của Alertmanager đã bị xoay vòng (rotate) phía PagerDuty do chính sách bảo mật định kỳ, nhưng cấu hình Alertmanager chưa được cập nhật khoá mới, khiến mọi request gửi cảnh báo bị từ chối với lỗi xác thực.",
    rootCauseExplanation:
      "Alert được Alertmanager kích hoạt đúng thời điểm và đúng logic (điều này xác nhận qua UI Alertmanager), nhưng bước cuối cùng — gửi notification qua tích hợp PagerDuty — thất bại âm thầm vì integration key đã bị PagerDuty tự động xoay vòng theo chính sách bảo mật định kỳ 90 ngày mà không có quy trình đồng bộ lại key mới vào cấu hình Alertmanager. Vì lỗi 401 này chỉ xuất hiện trong log nội bộ của Alertmanager (không có kênh nào khác để 'báo lỗi của việc báo lỗi'), không ai phát hiện ra cho tới khi có sự cố thật xảy ra và không ai được page.",
    requiredFindings: ["Alertmanager UI xác nhận alert đã được kích hoạt đúng lúc (loại trừ lỗi logic rule)", "log Alertmanager cho thấy gửi notification tới PagerDuty thất bại với lỗi 401 do routing key không hợp lệ"],
    rubric: [
      { criterion: "Xác nhận đúng alert đã được kích hoạt (vấn đề nằm ở khâu gửi thông báo, không phải khâu phát hiện)", weight: 30 },
      { criterion: "Tìm ra đúng nguyên nhân lỗi xác thực routing key PagerDuty và đề xuất cần có cơ chế giám sát 'cảnh báo cho hệ thống cảnh báo'", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "alertmanager logs" }, output: "level=error msg=\"Notify for alerts failed\" integration=pagerduty err=\"unexpected status code 401: Invalid routing key\"" },
    ],
    hints: ["Kiểm tra trước xem alert có thực sự được kích hoạt đúng lúc hay không (Alertmanager UI/API).", "Nếu alert được kích hoạt nhưng không ai nhận được, vấn đề nằm ở bước gửi thông báo (integration) — kiểm tra log Alertmanager.", "Các khoá tích hợp (API key, routing key) có thể bị xoay vòng định kỳ bởi bên thứ 3 mà không có cảnh báo chủ động — đây là một điểm mù phổ biến."],
  }),
] as const;
