import { scenario } from "./types";

export const containerScenarios = [
  scenario({
    topicSlug: "container",
    difficulty: "EASY",
    title: "Container khởi động lại liên tục do thiếu biến môi trường bắt buộc",
    context:
      "Một container ứng dụng mới deploy bằng docker run cứ restart liên tục ngay sau khi start, không ổn định.",
    symptoms: ["docker ps cho thấy container restart liên tục (Restarting)", "Ứng dụng không bao giờ phục vụ được request nào"],
    filesystem: [],
    services: [{ name: "payment-api", status: "failed" }],
    logs: { "docker logs payment-api": ["Error: Missing required environment variable DATABASE_URL", "process exited with code 1"] },
    rootCauseSummary: "Container thiếu biến môi trường bắt buộc DATABASE_URL nên ứng dụng crash ngay khi khởi động.",
    rootCauseExplanation:
      "Lệnh docker run được chạy thiếu cờ -e DATABASE_URL=... (hoặc thiếu file .env khi dùng docker compose). Ứng dụng validate biến môi trường bắt buộc lúc khởi động, không tìm thấy DATABASE_URL nên throw lỗi và thoát ngay với exit code 1 — Docker restart policy (always/on-failure) liên tục khởi động lại container, lặp lại đúng lỗi đó mỗi lần.",
    requiredFindings: ["container liên tục restart (Restarting) trong docker ps", "log container báo thiếu biến môi trường DATABASE_URL"],
    rubric: [
      { criterion: "Kiểm tra trạng thái container qua docker ps", weight: 30 },
      { criterion: "Đọc log container để tìm đúng biến môi trường bị thiếu", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "docker ps" }, output: "CONTAINER ID   IMAGE         STATUS\nabc123         payment-api   Restarting (1) 5 seconds ago" },
      { match: { type: "exact", pattern: "docker logs payment-api" }, output: "Error: Missing required environment variable DATABASE_URL\nprocess exited with code 1" },
    ],
    hints: ["Kiểm tra trạng thái container bằng docker ps trước.", "Xem log container để tìm lý do crash cụ thể.", "Container restart liên tục thường do lỗi khởi động ứng dụng, kiểm tra biến môi trường trước tiên."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "EASY",
    title: "Container không start được do xung đột cổng đã được sử dụng",
    context:
      "Kỹ sư cố gắng chạy một container web mới ánh xạ cổng 8080 nhưng lệnh docker run báo lỗi ngay lập tức.",
    symptoms: ["docker run báo lỗi 'port is already allocated'", "Container không xuất hiện trong docker ps (kể cả ở trạng thái Exited mới)"],
    filesystem: [],
    services: [],
    logs: { "docker run -p 8080:80 webapp": ["docker: Error response from daemon: driver failed programming external connectivity on endpoint webapp: Bind for 0.0.0.0:8080 failed: port is already allocated."] },
    rootCauseSummary: "Cổng 8080 trên host đã bị một container khác (hoặc tiến trình khác) chiếm dụng từ trước.",
    rootCauseExplanation:
      "Một container cũ (ví dụ một bản demo chạy thử trước đó) vẫn đang chạy và đã ánh xạ cổng 8080 của host, nên Docker daemon từ chối bind thêm lần nữa cho container mới — đây là giới hạn của việc ánh xạ cổng host: mỗi cổng host chỉ gán được cho một container tại một thời điểm.",
    requiredFindings: ["lỗi 'port is already allocated' khi chạy container mới", "nguyên nhân là cổng 8080 đã bị chiếm bởi container/tiến trình khác đang chạy"],
    rubric: [
      { criterion: "Đọc đúng thông báo lỗi liên quan cổng đã bị chiếm", weight: 40 },
      { criterion: "Tìm ra container/tiến trình đang chiếm cổng 8080", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "docker ps" }, output: "CONTAINER ID   IMAGE        STATUS         PORTS\ndef456         demo-app     Up 2 hours     0.0.0.0:8080->80/tcp" },
    ],
    hints: ["Đọc kỹ thông báo lỗi từ Docker daemon.", "Kiểm tra docker ps để tìm container nào đang dùng cổng 8080.", "Có thể đổi cổng host cho container mới hoặc dừng container cũ đang chiếm cổng."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "EASY",
    title: "Build image thất bại do sai tag base image",
    context:
      "Pipeline build Docker image cho một service nội bộ đột ngột fail sau khi một đồng nghiệp sửa Dockerfile để cập nhật phiên bản base image.",
    symptoms: ["docker build báo lỗi ngay từ bước đầu tiên (FROM)", "Build từng chạy thành công nhiều lần trước đó với cùng Dockerfile (trừ dòng FROM)"],
    filesystem: [{ name: "Dockerfile", type: "file", content: "FROM node:22-alpin\nWORKDIR /app" }],
    services: [],
    logs: { "docker build -t myapp .": ["failed to solve: node:22-alpin: not found"] },
    rootCauseSummary: "Dòng FROM trong Dockerfile ghi sai tên tag base image (node:22-alpin thay vì node:22-alpine).",
    rootCauseExplanation:
      "Đồng nghiệp gõ nhầm tag khi cập nhật phiên bản Node.js trong Dockerfile, thiếu chữ 'e' cuối (alpin thay vì alpine). Docker Hub không tìm thấy image với tag này nên bước build đầu tiên (pull base image) thất bại ngay lập tức, không build được bất kỳ layer nào tiếp theo.",
    requiredFindings: ["lỗi 'not found' khi build ở bước FROM", "nguyên nhân là gõ sai tag base image (alpin thay vì alpine)"],
    rubric: [
      { criterion: "Đọc đúng lỗi build liên quan tới image không tìm thấy", weight: 40 },
      { criterion: "Soát lại Dockerfile và phát hiện đúng lỗi gõ sai tag", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "docker build -t myapp ." }, output: "[+] Building 0.4s\nfailed to solve: node:22-alpin: not found" },
      { match: { type: "exact", pattern: "cat Dockerfile" }, output: "FROM node:22-alpin\nWORKDIR /app" },
    ],
    hints: ["Đọc kỹ thông báo lỗi — 'not found' thường liên quan tới tên/tag image sai.", "So sánh dòng FROM với danh sách tag chính thức trên Docker Hub.", "Lỗi gõ nhầm chính tả trong tag image là nguyên nhân rất phổ biến."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "MEDIUM",
    title: "Service không gọi được nhau qua tên dịch vụ trong Docker Compose",
    context:
      "Một ứng dụng multi-container (web API và PostgreSQL) chạy qua Docker Compose, web liên tục crash vì không kết nối được tới database dù cả 2 container đều đang 'Up'.",
    symptoms: ["Log container web báo lỗi 'getaddrinfo ENOTFOUND db'", "Container db vẫn ở trạng thái Up bình thường"],
    filesystem: [{ name: "docker-compose.yml", type: "file", content: "services:\n  web:\n    build: .\n    networks: [frontend]\n  db:\n    image: postgres:16\n    networks: [backend]\nnetworks:\n  frontend:\n  backend:" }],
    services: [{ name: "web", status: "failed" }, { name: "db", status: "running" }],
    logs: { "docker compose logs web --tail 5": ["Error: getaddrinfo ENOTFOUND db"] },
    rootCauseSummary: "Hai service được đặt ở 2 network Docker Compose riêng biệt (frontend và backend) không giao nhau, nên container web không resolve được tên 'db' qua DNS nội bộ của Compose.",
    rootCauseExplanation:
      "Docker Compose tự tạo DNS nội bộ cho phép các container trong CÙNG MỘT network gọi nhau qua tên service. Ở đây file compose định nghĩa web chỉ thuộc network 'frontend' còn db chỉ thuộc network 'backend' — 2 network tách biệt hoàn toàn, nên container web không hề nằm chung network với db, dẫn tới DNS nội bộ không có record nào cho 'db' khi web cố gắng resolve.",
    requiredFindings: ["container web báo lỗi getaddrinfo ENOTFOUND db dù db đang Up", "nguyên nhân là 2 service nằm ở 2 network Compose khác nhau không giao nhau"],
    rubric: [
      { criterion: "Xác định đúng cả 2 container đều đang chạy (loại trừ nguyên nhân do db down)", weight: 30 },
      { criterion: "Phát hiện đúng 2 service bị tách network, không gọi được qua tên service", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "docker compose ps" }, output: "NAME   STATUS\nweb    Restarting\ndb     Up 10 minutes" },
      { match: { type: "exact", pattern: "cat docker-compose.yml" }, output: "services:\n  web:\n    build: .\n    networks: [frontend]\n  db:\n    image: postgres:16\n    networks: [backend]\nnetworks:\n  frontend:\n  backend:" },
    ],
    hints: ["Container db đang Up — loại trừ khả năng database tự nó bị lỗi.", "Container trong Docker Compose chỉ gọi được nhau qua tên service nếu cùng chung một network.", "Kiểm tra file docker-compose.yml xem web và db có khai báo chung network nào không."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "MEDIUM",
    title: "Container không ghi được vào volume do lệch UID giữa image và host",
    context:
      "Một container xử lý file chạy với user không phải root (theo khuyến nghị bảo mật) liên tục báo lỗi permission denied khi ghi vào thư mục mounted volume từ host.",
    symptoms: ["Log ứng dụng báo lỗi 'EACCES: permission denied' khi ghi file vào /data", "Container chạy được bình thường nếu tạm thời chạy bằng user root (không khuyến nghị)"],
    filesystem: [{ name: "/data (trên host, bind mount)", type: "dir", content: "drwxr-xr-x  2 1000 1000  4096 . (owner uid 1000)" }],
    services: [{ name: "file-processor", status: "failed" }],
    logs: { "docker logs file-processor": ["Error: EACCES: permission denied, open '/data/output.csv'"] },
    rootCauseSummary: "Container chạy với user UID 1001 (định nghĩa trong image) nhưng thư mục host được mount vào lại thuộc sở hữu UID 1000, gây lệch quyền ghi.",
    rootCauseExplanation:
      "Khi dùng bind mount, Docker không ánh xạ lại UID/GID — container 'nhìn thấy' và chịu ràng buộc permission y hệt như trên host theo đúng UID số (không phải theo tên user, vì user namespace độc lập giữa host và container). Image được build với user ứng dụng có UID 1001, nhưng thư mục /data trên host lại thuộc sở hữu UID 1000 (user khác tạo trước đó), nên tiến trình trong container (chạy với UID 1001) không có quyền ghi vào thư mục thuộc UID 1000.",
    requiredFindings: ["lỗi EACCES khi container ghi vào volume mounted từ host", "nguyên nhân là UID của user trong container không khớp UID sở hữu thư mục trên host"],
    rubric: [
      { criterion: "Xác định đúng vấn đề là về quyền (permission), không phải lỗi logic ứng dụng", weight: 30 },
      { criterion: "Giải thích đúng cơ chế lệch UID giữa container và host bind mount", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "docker logs file-processor" }, output: "Error: EACCES: permission denied, open '/data/output.csv'" },
      { match: { type: "exact", pattern: "docker inspect file-processor --format '{{.Config.User}}'" }, output: "1001" },
      { match: { type: "exact", pattern: "ls -la /data (trên host)" }, output: "drwxr-xr-x  2 1000 1000  4096 ." },
    ],
    hints: ["Lỗi chỉ biến mất khi chạy bằng root — gợi ý đây là vấn đề quyền truy cập, không phải bug logic.", "Kiểm tra UID mà container đang chạy (docker inspect) và so sánh với UID sở hữu thư mục host.", "Bind mount không ánh xạ UID — quyền được kiểm tra theo đúng số UID, không theo tên user."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "MEDIUM",
    title: "Hết dung lượng đĩa do image và container cũ không được dọn dẹp",
    context:
      "Một server CI/CD build Docker image nhiều lần mỗi ngày đột ngột báo lỗi hết dung lượng đĩa khi build job mới nhất chạy.",
    symptoms: ["Build job báo lỗi 'no space left on device' khi build image", "Server chưa từng dọn dẹp image/container cũ trong nhiều tháng"],
    filesystem: [],
    services: [{ name: "docker", status: "running" }],
    logs: { "df -h /var/lib/docker": ["/dev/sda1   100G   99G    0G 100% /var/lib/docker"] },
    rootCauseSummary: "Hàng trăm image cũ, container đã dừng và build cache tích lũy nhiều tháng chiếm gần hết dung lượng đĩa dành cho Docker.",
    rootCauseExplanation:
      "Mỗi lần CI build image mới đều tạo ra các layer mới, nhưng image cũ (dangling hoặc gắn tag cũ), container đã exited, và build cache không được dọn dẹp định kỳ (thiếu lịch `docker system prune` hoặc chính sách retention image). Qua nhiều tháng, dung lượng tích lũy này lớn dần tới khi chiếm gần hết phân vùng /var/lib/docker, khiến build mới không còn chỗ để ghi layer.",
    requiredFindings: ["phân vùng chứa Docker data (/var/lib/docker) báo gần đầy 100%", "nguyên nhân là image/container/build cache cũ tích lũy không được dọn dẹp định kỳ"],
    rubric: [
      { criterion: "Xác định đúng phân vùng đầy là nguyên nhân build thất bại", weight: 30 },
      { criterion: "Tìm ra đúng loại dữ liệu Docker chiếm dung lượng lớn và đề xuất dọn dẹp hợp lý", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "df -h /var/lib/docker" }, output: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       100G   99G    0G 100% /var/lib/docker" },
      { match: { type: "exact", pattern: "docker system df" }, output: "TYPE            TOTAL     SIZE      RECLAIMABLE\nImages          340       68GB      61GB (90%)\nContainers      210       4GB       4GB (100%)\nBuild Cache     -         27GB      27GB" },
    ],
    hints: ["Kiểm tra dung lượng phân vùng chứa dữ liệu Docker (/var/lib/docker).", "docker system df cho biết chi tiết image/container/cache đang chiếm bao nhiêu dung lượng.", "Cân nhắc thiết lập dọn dẹp định kỳ (docker system prune, retention policy) để tránh lặp lại sự cố."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "HARD",
    title: "Pod Kubernetes vào CrashLoopBackOff do liveness probe cấu hình sai",
    context:
      "Sau khi deploy một bản cập nhật nhỏ (chỉ thêm biến môi trường) cho một Deployment trên Kubernetes, pod liên tục restart dù log ứng dụng cho thấy service đã khởi động thành công.",
    symptoms: ["kubectl get pods cho thấy pod ở trạng thái CrashLoopBackOff", "Log ứng dụng (kubectl logs) không có lỗi, thể hiện service start thành công và sẵn sàng nhận request"],
    filesystem: [{ name: "deployment.yaml", type: "file", content: "livenessProbe:\n  httpGet:\n    path: /healthz\n    port: 8080\n  initialDelaySeconds: 2\n  periodSeconds: 5" }],
    services: [{ name: "order-service", status: "failed" }],
    logs: { "kubectl describe pod order-service-7f9c": ["Liveness probe failed: Get \"http://10.1.2.3:8080/healthz\": dial tcp 10.1.2.3:8080: connect: connection refused", "Back-off restarting failed container"] },
    rootCauseSummary: "initialDelaySeconds của liveness probe (2 giây) quá ngắn so với thời gian ứng dụng thực sự cần để sẵn sàng (khoảng 8-10 giây), khiến Kubernetes giết pod trước khi app kịp bind cổng.",
    rootCauseExplanation:
      "Ứng dụng cần khoảng 8-10 giây để khởi tạo (kết nối DB pool, load cấu hình) trước khi thực sự lắng nghe ở cổng 8080, nhưng liveness probe được cấu hình initialDelaySeconds chỉ 2 giây — probe đầu tiên chạy khi ứng dụng CHƯA kịp bind cổng, nhận 'connection refused', Kubernetes coi container không khoẻ mạnh và kill nó theo đúng cơ chế liveness probe, container restart lại, lặp lại đúng chu trình đó vô hạn (CrashLoopBackOff) dù bản thân ứng dụng không hề có lỗi logic.",
    requiredFindings: ["kubectl describe pod cho thấy liveness probe failed với 'connection refused'", "nguyên nhân là initialDelaySeconds của liveness probe quá ngắn so với thời gian khởi động thực tế của ứng dụng"],
    rubric: [
      { criterion: "Phân biệt đúng giữa lỗi do probe và lỗi do bản thân ứng dụng (log app không có lỗi)", weight: 40 },
      { criterion: "Xác định đúng initialDelaySeconds quá ngắn là nguyên nhân gốc và đề xuất tăng giá trị phù hợp", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "kubectl get pods" }, output: "NAME                     READY   STATUS             RESTARTS   AGE\norder-service-7f9c       0/1     CrashLoopBackOff   8          6m" },
      { match: { type: "startsWith", pattern: "kubectl describe pod order-service" }, output: "Liveness probe failed: Get \"http://10.1.2.3:8080/healthz\": dial tcp 10.1.2.3:8080: connect: connection refused\nBack-off restarting failed container" },
      { match: { type: "exact", pattern: "kubectl logs order-service-7f9c --previous" }, output: "[INFO] Connecting to database pool...\n[INFO] Server listening on port 8080" },
    ],
    hints: ["Log ứng dụng không có lỗi gợi ý vấn đề không nằm ở code mà ở cấu hình xung quanh (probe, resource).", "kubectl describe pod cho thấy chi tiết lý do liveness probe fail.", "So sánh initialDelaySeconds của probe với thời gian thực tế ứng dụng cần để sẵn sàng."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "HARD",
    title: "Pod kẹt ở trạng thái Pending do vượt resource quota của namespace",
    context:
      "Một team cố gắng scale Deployment của mình lên 10 replicas để chuẩn bị cho một đợt tải cao, nhưng chỉ có 4 pod chạy được, các pod còn lại kẹt ở trạng thái Pending không rõ lý do ngay trên dashboard.",
    symptoms: ["kubectl get pods cho thấy 6/10 pod ở trạng thái Pending kéo dài", "Node trong cluster vẫn còn tài nguyên CPU/RAM trống đáng kể"],
    filesystem: [],
    services: [],
    logs: { "kubectl describe pod checkout-7xk2 -n team-checkout": ["Warning  FailedScheduling  default-scheduler  0/5 nodes are available: 6 Insufficient cpu.", "exceeded quota: team-checkout-quota, requested: requests.cpu=500m, used: requests.cpu=4000m, limited: requests.cpu=4000m"] },
    rootCauseSummary: "Namespace team-checkout có ResourceQuota giới hạn tổng CPU request là 4000m, đã dùng hết bởi 4 pod đang chạy, nên 6 pod còn lại không được admission controller cho phép tạo dù node vẫn còn tài nguyên vật lý.",
    rootCauseExplanation:
      "Cluster-wide thì node vẫn còn nhiều CPU trống, nhưng Kubernetes ResourceQuota hoạt động ở cấp namespace, độc lập với tài nguyên vật lý còn trống của node. Namespace team-checkout được admin cluster giới hạn tổng requests.cpu tối đa 4000m để đảm bảo công bằng tài nguyên giữa các team — 4 pod đầu tiên (mỗi pod request 500m x 8 = sai, thực tế theo log là đã dùng hết 4000m) đã chiếm trọn quota, nên 6 pod còn lại bị admission controller từ chối tạo ngay từ bước scheduling với lý do 'exceeded quota', không liên quan gì tới tài nguyên vật lý thực tế của cluster.",
    requiredFindings: ["kubectl describe pod cho thấy lỗi 'exceeded quota' ở namespace", "nguyên nhân là ResourceQuota của namespace đã bị dùng hết, không phải do cluster thiếu tài nguyên vật lý"],
    rubric: [
      { criterion: "Loại trừ đúng nguyên nhân thiếu tài nguyên vật lý cluster (vì node vẫn còn trống)", weight: 30 },
      { criterion: "Xác định đúng ResourceQuota cấp namespace là nguyên nhân chặn pod mới", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "kubectl get pods -n team-checkout" }, output: "NAME              READY   STATUS    RESTARTS   AGE\ncheckout-7xk2     0/1     Pending   0          4m\ncheckout-9ab1     0/1     Pending   0          4m" },
      { match: { type: "startsWith", pattern: "kubectl describe pod checkout-7xk2" }, output: "Warning  FailedScheduling  default-scheduler  exceeded quota: team-checkout-quota, requested: requests.cpu=500m, used: requests.cpu=4000m, limited: requests.cpu=4000m" },
      { match: { type: "exact", pattern: "kubectl describe resourcequota -n team-checkout" }, output: "Name: team-checkout-quota\nResource          Used   Hard\nrequests.cpu      4000m  4000m" },
    ],
    hints: ["Pod Pending không phải lúc nào cũng do cluster hết tài nguyên vật lý — kiểm tra cả cấp namespace.", "kubectl describe pod cho biết lý do chính xác scheduler từ chối pod.", "Kiểm tra ResourceQuota của namespace bằng kubectl describe resourcequota."],
  }),
  scenario({
    topicSlug: "container",
    difficulty: "HARD",
    title: "Ứng dụng phục vụ cấu hình cũ dù ConfigMap đã được cập nhật",
    context:
      "Team vận hành cập nhật một ConfigMap chứa feature flag mới cho một Deployment đang chạy, nhưng sau nhiều giờ ứng dụng vẫn hành xử theo cấu hình cũ dù kubectl xác nhận ConfigMap đã đổi.",
    symptoms: ["kubectl get configmap cho thấy nội dung mới đã được áp dụng", "Ứng dụng trong pod vẫn trả về hành vi theo feature flag cũ khi kiểm tra qua API"],
    filesystem: [{ name: "/etc/config/features.yaml (trong pod)", type: "file", content: "feature_new_checkout: false  # giá trị CŨ, dù ConfigMap trên cluster đã là true" }],
    services: [{ name: "checkout-service", status: "running" }],
    logs: { "kubectl get pod checkout-abc -o yaml | grep -A2 volumeMounts": ["volumeMounts:\n- mountPath: /etc/config\n  name: config-volume\n  subPath: features.yaml"] },
    rootCauseSummary: "ConfigMap được mount vào pod bằng subPath, cơ chế này không nhận cập nhật tự động từ kubelet như mount thư mục thông thường — pod cần được restart thủ công để nhận cấu hình mới.",
    rootCauseExplanation:
      "Khi mount toàn bộ ConfigMap vào một thư mục (không dùng subPath), kubelet định kỳ đồng bộ và cập nhật nội dung file trong pod khi ConfigMap đổi (thường trong vòng ~1 phút, qua cơ chế symlink). Tuy nhiên khi dùng subPath để chỉ mount MỘT key cụ thể vào một đường dẫn file cụ thể (như ở đây: features.yaml), Kubernetes dùng cơ chế copy file trực tiếp thay vì symlink, và đây là giới hạn đã biết của Kubernetes — file mount qua subPath KHÔNG được tự động cập nhật khi ConfigMap nguồn thay đổi. Pod cần được restart (rollout restart) để pod mới mount lại file với nội dung mới nhất.",
    requiredFindings: ["ConfigMap trên cluster đã có giá trị mới nhưng file trong pod vẫn là giá trị cũ", "nguyên nhân là volume mount dùng subPath, không tự động cập nhật khi ConfigMap đổi"],
    rubric: [
      { criterion: "Xác nhận đúng ConfigMap trên cluster đã cập nhật (loại trừ lỗi thao tác cập nhật sai)", weight: 30 },
      { criterion: "Phát hiện đúng việc dùng subPath là nguyên nhân khiến file trong pod không tự cập nhật, và đề xuất rollout restart", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "kubectl get configmap app-config -o yaml" }, output: "data:\n  features.yaml: |\n    feature_new_checkout: true" },
      { match: { type: "exact", pattern: "kubectl exec checkout-abc -- cat /etc/config/features.yaml" }, output: "feature_new_checkout: false" },
    ],
    hints: ["Xác nhận ConfigMap trên cluster đã thực sự cập nhật trước khi nghi ngờ nguyên nhân khác.", "Kiểm tra cách ConfigMap được mount vào pod (volumeMounts, chú ý có subPath hay không).", "Mount ConfigMap qua subPath là một giới hạn đã biết của Kubernetes — không tự động cập nhật, cần restart pod thủ công."],
  }),
] as const;
