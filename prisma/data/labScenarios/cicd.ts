import { scenario } from "./types";

export const cicdScenarios = [
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "EASY",
    title: "Pipeline CI fail do thiếu cache dependency",
    context:
      "Pipeline build của một service Node.js đột nhiên fail ở bước cài đặt dependency sau khi đồng nghiệp xoá một dòng cấu hình cache trong file CI tưởng rằng không cần thiết.",
    symptoms: ["Bước 'Install dependencies' trong pipeline timeout sau 10 phút", "Build chạy local trên máy dev hoàn toàn bình thường, nhanh"],
    filesystem: [{ name: ".github/workflows/ci.yml", type: "file", content: "steps:\n  - run: npm ci\n    # dòng cache: actions/cache@v4 đã bị xoá nhầm" }],
    services: [],
    logs: { "CI log step install": ["npm ci", "npm warn Downloading registry.npmjs.org... (rất chậm, nhiều timeout retry)"] },
    rootCauseSummary: "Bước cache node_modules/npm bị xoá nhầm khỏi pipeline, khiến mỗi lần build phải tải lại toàn bộ dependency từ registry, dễ bị timeout khi registry chậm.",
    rootCauseExplanation:
      "Trước đây pipeline dùng action cache để lưu lại node_modules giữa các lần chạy dựa trên hash của package-lock.json, giúp bước install chỉ mất vài giây khi không có gì thay đổi. Đồng nghiệp xoá nhầm bước cache này khi dọn dẹp file CI, khiến mỗi lần chạy phải tải lại từ đầu hàng trăm package qua network CI (vốn chậm hơn mạng văn phòng dev), dẫn tới timeout khi registry phản hồi chậm.",
    requiredFindings: ["bước install dependency bị timeout trên CI dù local chạy nhanh", "nguyên nhân là bước cache dependency đã bị xoá khỏi file cấu hình pipeline"],
    rubric: [
      { criterion: "So sánh hành vi giữa CI và local để khoanh vùng vấn đề về tốc độ mạng/cache", weight: 40 },
      { criterion: "Xác định đúng bước cache bị thiếu trong file cấu hình CI", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat .github/workflows/ci.yml" }, output: "steps:\n  - run: npm ci" },
      { match: { type: "exact", pattern: "CI log step install" }, output: "npm ci\nnpm warn Downloading registry.npmjs.org... (rất chậm, nhiều timeout retry)" },
    ],
    hints: ["So sánh tốc độ build giữa máy local và CI để khoanh vùng nguyên nhân mạng/cache.", "Kiểm tra file cấu hình pipeline xem có bước cache dependency nào không.", "git log/blame file CI để tìm thay đổi gần đây có thể liên quan."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "EASY",
    title: "Terraform apply báo tài nguyên đã tồn tại do state bị lệch",
    context:
      "Kỹ sư chạy terraform apply để tạo một security group mới nhưng Terraform báo lỗi tài nguyên đã tồn tại, dù theo state hiện tại chưa có resource này.",
    symptoms: ["terraform plan cho thấy sẽ tạo mới security group 'web-sg'", "terraform apply báo lỗi 'security group already exists' từ phía cloud provider"],
    filesystem: [{ name: "main.tf", type: "file", content: "resource \"aws_security_group\" \"web\" {\n  name = \"web-sg\"\n}" }],
    services: [],
    logs: { "terraform apply": ["Error: creating Security Group (web-sg): InvalidGroup.Duplicate: The security group 'web-sg' already exists"] },
    rootCauseSummary: "Security group 'web-sg' đã được tạo thủ công trực tiếp qua AWS Console trước đó, không nằm trong Terraform state, gây xung đột khi Terraform cố tạo mới.",
    rootCauseExplanation:
      "Một kỹ sư khác từng tạo tạm security group này qua AWS Console để test nhanh, không thông qua Terraform. Vì Terraform chỉ biết về các tài nguyên có trong state file của nó, nó không hề biết security group 'web-sg' đã tồn tại trên AWS và cố gắng tạo mới theo đúng kế hoạch trong main.tf — AWS từ chối vì tên đã bị trùng, gây ra tình huống 'resource đã tồn tại nhưng Terraform không biết'.",
    requiredFindings: ["AWS báo lỗi security group đã tồn tại khi Terraform cố tạo mới", "nguyên nhân là tài nguyên được tạo thủ công ngoài Terraform (ngoài state), gây xung đột tên"],
    rubric: [
      { criterion: "Nhận diện đúng đây là xung đột giữa state Terraform và thực tế trên cloud", weight: 50 },
      { criterion: "Đề xuất hướng xử lý hợp lý (import resource vào state hoặc đổi tên)", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "terraform apply" }, output: "Error: creating Security Group (web-sg): InvalidGroup.Duplicate: The security group 'web-sg' already exists" },
      { match: { type: "exact", pattern: "terraform state list" }, output: "(trống — chưa có resource nào trong state)" },
    ],
    hints: ["Kiểm tra xem tài nguyên này có đang nằm trong Terraform state hay không.", "Tài nguyên có thể đã được tạo thủ công ngoài Terraform (qua console) trước đó.", "Cân nhắc dùng terraform import để đưa tài nguyên có sẵn vào quản lý bởi state thay vì tạo trùng."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "EASY",
    title: "Pipeline bị chặn push do vi phạm quy tắc nhánh được bảo vệ",
    context:
      "Một kỹ sư cố gắng push trực tiếp một bản sửa lỗi khẩn cấp lên nhánh main nhưng bị từ chối, dù trước đây vẫn thường push trực tiếp được.",
    symptoms: ["git push báo lỗi bị từ chối bởi remote", "Không có thay đổi gì trong quyền tài khoản Git của kỹ sư đó gần đây"],
    filesystem: [],
    services: [],
    logs: { "git push origin main": ["remote: error: GH006: Protected branch update failed for refs/heads/main.", "remote: error: Required status check \"ci/build\" is expected."] },
    rootCauseSummary: "Nhánh main vừa được admin bật branch protection rule yêu cầu pull request và status check CI phải pass trước khi merge, không còn cho phép push trực tiếp.",
    rootCauseExplanation:
      "Quản trị viên repository mới thêm quy tắc bảo vệ nhánh main theo best practice (yêu cầu PR review + CI pass trước khi merge) để giảm rủi ro đẩy code lỗi thẳng lên production. Thay đổi này áp dụng ngay cho mọi thành viên kể cả trường hợp khẩn cấp, nên lệnh git push trực tiếp vào main bị từ chối — quy trình đúng bây giờ là tạo pull request, đợi CI chạy xong rồi mới merge, kể cả với hotfix khẩn cấp (có thể dùng merge khẩn cấp có phê duyệt nhanh thay vì bypass hoàn toàn).",
    requiredFindings: ["git push vào main bị từ chối với lỗi protected branch", "nguyên nhân là nhánh main vừa được bật quy tắc bảo vệ yêu cầu PR + CI pass"],
    rubric: [
      { criterion: "Đọc đúng thông báo lỗi liên quan tới protected branch", weight: 50 },
      { criterion: "Đề xuất đúng quy trình thay thế (tạo PR, đợi CI pass) thay vì cố gắng bypass", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "git push origin main" }, output: "remote: error: GH006: Protected branch update failed for refs/heads/main.\nremote: error: Required status check \"ci/build\" is expected." },
    ],
    hints: ["Đọc kỹ thông báo lỗi từ Git remote — thường ghi rõ lý do bị từ chối.", "Kiểm tra xem repository có quy tắc bảo vệ nhánh (branch protection) mới không.", "Với nhánh được bảo vệ, quy trình đúng thường là tạo pull request thay vì push trực tiếp."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "MEDIUM",
    title: "Terraform apply bị khoá state do lần chạy trước crash giữa chừng",
    context:
      "Một kỹ sư chạy terraform apply nhưng pipeline CI bị huỷ giữa chừng do runner hết thời gian chờ (timeout). Từ đó, mọi lần chạy terraform apply/plan sau đều báo lỗi state bị khoá.",
    symptoms: ["terraform plan báo lỗi 'Error acquiring the state lock'", "Không ai khác đang chạy Terraform ở thời điểm hiện tại"],
    filesystem: [],
    services: [],
    logs: { "terraform plan": ["Error: Error acquiring the state lock", "Lock Info:", "  ID:        8f3a1c20-...", "  Created:   2026-10-12 03:14:10 UTC"] },
    rootCauseSummary: "Lần chạy terraform apply trước đó bị kill giữa chừng (CI timeout) nên không kịp giải phóng lock trên state backend (DynamoDB/Consul), để lại một lock 'mồ côi'.",
    rootCauseExplanation:
      "Terraform dùng cơ chế distributed lock trên state backend (ví dụ bảng DynamoDB khi dùng S3 backend) để đảm bảo không có 2 lần apply nào chạy đồng thời gây ghi đè state. Khi tiến trình terraform apply bị kill đột ngột (do CI runner timeout) thay vì kết thúc tự nhiên, nó không kịp chạy bước release lock cuối cùng, để lại một bản ghi lock tồn tại mãi trên DynamoDB dù không có tiến trình nào thực sự đang giữ nó — mọi lệnh plan/apply sau đó đều bị chặn vì nghĩ rằng vẫn còn người khác đang chạy.",
    requiredFindings: ["terraform báo lỗi state bị khoá dù không có ai đang chạy Terraform", "nguyên nhân là lock mồ côi để lại từ lần chạy trước bị kill giữa chừng do CI timeout"],
    rubric: [
      { criterion: "Xác nhận đúng không có tiến trình Terraform nào khác đang thực sự chạy", weight: 30 },
      { criterion: "Đề xuất đúng cách xử lý (terraform force-unlock với đúng Lock ID, sau khi xác nhận an toàn)", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "terraform plan" }, output: "Error: Error acquiring the state lock\nLock Info:\n  ID:        8f3a1c20-...\n  Created:   2026-10-12 03:14:10 UTC\n  Who:       ci-runner-42" },
    ],
    hints: ["Xác nhận chắc chắn không có ai/pipeline nào khác đang thực sự chạy Terraform trước khi xử lý lock.", "Kiểm tra thời gian lock được tạo (Created) — nếu đã lâu và tiến trình đó không còn tồn tại, nhiều khả năng là lock mồ côi.", "terraform force-unlock có thể giải phóng lock thủ công, nhưng cần hết sức cẩn trọng vì đây là thao tác rủi ro nếu dùng sai."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "MEDIUM",
    title: "Rollback deployment thất bại vì không còn artifact phiên bản trước",
    context:
      "Sau khi phát hiện bản release mới nhất gây lỗi nghiêm trọng, team cố gắng rollback về phiên bản trước nhưng pipeline rollback báo lỗi không tìm thấy artifact tương ứng.",
    symptoms: ["Chạy pipeline rollback báo lỗi '404: artifact not found' cho phiên bản trước", "Phiên bản hiện tại (đang lỗi) vẫn deploy được bình thường"],
    filesystem: [],
    services: [],
    logs: { "rollback pipeline log": ["Fetching artifact v2.41.0 from registry...", "Error: 404 artifact v2.41.0 not found (retention policy: giữ 5 bản mới nhất)"] },
    rootCauseSummary: "Chính sách retention của artifact registry chỉ giữ lại 5 phiên bản mới nhất, và phiên bản cần rollback về (v2.41.0) đã bị registry tự động xoá do có nhiều release dồn dập gần đây.",
    rootCauseExplanation:
      "Artifact registry được cấu hình chính sách dọn dẹp tự động chỉ giữ lại 5 phiên bản gần nhất để tiết kiệm dung lượng lưu trữ. Vì gần đây team release khá dồn dập (nhiều hotfix nhỏ liên tiếp), phiên bản ổn định trước đó (v2.41.0) đã bị đẩy ra khỏi danh sách 5 bản giữ lại và bị xoá tự động, nên khi cần rollback về đúng phiên bản này thì registry không còn artifact để trả về.",
    requiredFindings: ["registry báo không tìm thấy artifact của phiên bản cần rollback", "nguyên nhân là chính sách retention tự động đã xoá phiên bản đó do giới hạn số lượng bản giữ lại"],
    rubric: [
      { criterion: "Đọc đúng lỗi 404 not found liên quan artifact registry", weight: 30 },
      { criterion: "Liên hệ đúng với chính sách retention registry là nguyên nhân gốc, không phải lỗi pipeline rollback", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "rollback pipeline log" }, output: "Fetching artifact v2.41.0 from registry...\nError: 404 artifact v2.41.0 not found (retention policy: giữ 5 bản mới nhất)" },
      { match: { type: "exact", pattern: "registry list tags" }, output: "v2.45.0, v2.44.0, v2.43.0, v2.42.1, v2.42.0  (5 bản gần nhất, không có v2.41.0)" },
    ],
    hints: ["Kiểm tra kỹ thông báo lỗi của pipeline rollback — có thể không phải lỗi logic pipeline mà là thiếu artifact.", "Liệt kê các tag/phiên bản hiện có trong artifact registry.", "Xem lại chính sách retention của registry — số lượng release dồn dập gần đây có thể đã đẩy phiên bản cũ ra khỏi danh sách giữ lại."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "MEDIUM",
    title: "Secret bị lộ ra log CI do thiếu cấu hình masking",
    context:
      "Một kỹ sư phát hiện API key của một dịch vụ bên thứ ba xuất hiện dạng plaintext trong log của một pipeline CI công khai nội bộ, dù biến môi trường đó được đánh dấu là 'secret' trong hệ thống CI.",
    symptoms: ["Log pipeline hiển thị rõ giá trị API key trong một bước debug echo", "Biến môi trường được khai báo đúng loại 'secret' trong cấu hình CI/CD"],
    filesystem: [{ name: ".gitlab-ci.yml", type: "file", content: "script:\n  - echo \"Using API key: $THIRD_PARTY_API_KEY\"  # dòng debug quên xoá trước khi merge" }],
    services: [],
    logs: { "CI job log": ["Using API key: sk_live_7h2j9...  (giá trị thật xuất hiện rõ ràng)"] },
    rootCauseSummary: "Một dòng lệnh debug echo in trực tiếp giá trị secret ra log bị quên xoá trước khi merge, và cơ chế masking secret của CI không hoạt động với cách giá trị được in ra theo kiểu này.",
    rootCauseExplanation:
      "Cơ chế masking secret mặc định của hầu hết hệ thống CI hoạt động bằng cách tìm-và-thay-thế chuỗi giá trị secret chính xác trong output log. Tuy nhiên nếu secret được echo trực tiếp vào một chuỗi lớn hơn hoặc qua một số cách xử lý trung gian (ví dụ nối chuỗi, encode, hoặc do thứ tự job chạy khiến giá trị secret chưa kịp được đăng ký vào bộ lọc masking tại thời điểm log được ghi), cơ chế masking có thể không nhận diện và che được giá trị đó — đây là lý do phải tuyệt đối tránh echo trực tiếp giá trị secret ra log, dù có bật masking, thay vì chỉ dựa hoàn toàn vào tính năng tự động của CI.",
    requiredFindings: ["log CI chứa giá trị API key dạng plaintext, không bị che (mask)", "nguyên nhân là dòng lệnh debug echo in secret ra log, việc masking không đáng tin cậy 100% cho mọi cách in log"],
    rubric: [
      { criterion: "Tìm đúng dòng lệnh gây lộ secret trong file cấu hình CI", weight: 40 },
      { criterion: "Đề xuất đúng hướng khắc phục: xoá dòng debug và xoay vòng (rotate) secret đã lộ ngay lập tức", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat .gitlab-ci.yml" }, output: "script:\n  - echo \"Using API key: $THIRD_PARTY_API_KEY\"" },
      { match: { type: "exact", pattern: "CI job log" }, output: "Using API key: sk_live_7h2j9...  (giá trị thật xuất hiện rõ ràng)" },
    ],
    hints: ["Tìm dòng lệnh nào trong pipeline có khả năng in trực tiếp giá trị biến môi trường secret.", "Masking tự động của CI không phải lúc nào cũng bắt được mọi cách giá trị secret bị in ra log.", "Khi phát hiện secret bị lộ, bước đầu tiên và quan trọng nhất là xoay vòng (rotate/thu hồi) secret đó ngay, không chỉ xoá dòng log."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "HARD",
    title: "ArgoCD kẹt vòng lặp đồng bộ do xung đột giữa GitOps và chỉnh sửa thủ công",
    context:
      "Một Application trên ArgoCD liên tục hiển thị trạng thái 'OutOfSync' rồi 'Syncing' lặp đi lặp lại không bao giờ ổn định ở 'Synced', dù không có commit mới nào vào Git repository đang theo dõi.",
    symptoms: ["Trạng thái Application trên ArgoCD UI nhấp nháy liên tục giữa OutOfSync và Syncing", "Không có commit mới nào trong repository GitOps liên quan tới Application này"],
    filesystem: [],
    services: [{ name: "argocd-application-controller", status: "running" }],
    logs: {
      "argocd app diff checkout-service": ["=== resource Deployment/checkout-service ===", "- replicas: 3  (trong Git)", "+ replicas: 8  (trên cluster, do HPA tự scale)"],
    },
    rootCauseSummary: "Horizontal Pod Autoscaler (HPA) liên tục thay đổi số replicas trên cluster, xung đột trực tiếp với giá trị replicas cố định được khai báo trong manifest Git mà ArgoCD đang cố gắng ép buộc đồng bộ lại.",
    rootCauseExplanation:
      "Manifest trong Git khai báo cứng replicas: 3 cho Deployment, nhưng HPA đang hoạt động và liên tục điều chỉnh replicas theo tải thực tế (ví dụ lên 8 khi tải cao). Mỗi khi HPA scale, ArgoCD coi đây là 'drift' so với Git (OutOfSync) và nếu bật auto-sync, nó sẽ tự động ghi đè replicas về lại giá trị 3 trong Git — ngay sau đó HPA lại phát hiện tải cao và scale lên lại, tạo thành một vòng lặp giằng co vô tận giữa 2 cơ chế kiểm soát cùng một trường dữ liệu. Cách khắc phục đúng là loại trừ trường spec.replicas khỏi phạm vi đồng bộ của ArgoCD khi Deployment đã có HPA quản lý (dùng ignoreDifferences trong cấu hình Application).",
    requiredFindings: ["argocd app diff cho thấy chênh lệch replicas giữa Git và cluster", "nguyên nhân là xung đột giữa HPA (tự động scale) và ArgoCD (cố ép về giá trị cố định trong Git)"],
    rubric: [
      { criterion: "Dùng argocd app diff để xác định chính xác trường dữ liệu nào đang gây drift liên tục", weight: 40 },
      { criterion: "Giải thích đúng cơ chế xung đột HPA vs GitOps và đề xuất dùng ignoreDifferences", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "argocd app diff checkout-service" }, output: "=== resource Deployment/checkout-service ===\n- replicas: 3  (trong Git)\n+ replicas: 8  (trên cluster, do HPA tự scale)" },
      { match: { type: "exact", pattern: "kubectl get hpa checkout-service" }, output: "NAME               REFERENCE                    TARGETS   MINPODS   MAXPODS   REPLICAS\ncheckout-service   Deployment/checkout-service   78%/70%   3         10        8" },
    ],
    hints: ["Trạng thái nhấp nháy liên tục giữa OutOfSync/Syncing mà không có commit mới gợi ý một hệ thống KHÁC đang liên tục thay đổi tài nguyên trên cluster.", "Dùng argocd app diff để xem chính xác trường nào đang bị lệch giữa Git và cluster.", "Khi Deployment có HPA quản lý, trường replicas không nên bị GitOps ép buộc theo giá trị tĩnh — cân nhắc ignoreDifferences."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "HARD",
    title: "State Terraform bị hỏng do 2 người cùng apply đồng thời không qua remote backend khoá",
    context:
      "Sau khi 2 kỹ sư vô tình cùng chạy terraform apply gần như đồng thời (dự án đang dùng local state file thay vì remote backend), state file bị lỗi không nhất quán, nhiều tài nguyên trong thực tế không còn khớp với state.",
    symptoms: ["terraform plan cho ra kết quả rất bất thường, đề xuất xoá/tạo lại nhiều tài nguyên vốn không hề thay đổi", "Lệnh terraform state list thiếu một số tài nguyên chắc chắn vẫn đang tồn tại trên cloud"],
    filesystem: [{ name: "terraform.tfstate", type: "file", content: "{ ... state bị ghi đè một phần bởi 2 lần apply gần như đồng thời, mất resource 'aws_db_instance.main' khỏi state ... }" }],
    services: [],
    logs: {},
    rootCauseSummary: "Dự án dùng local state file (lưu trên máy mỗi kỹ sư/ổ đĩa chia sẻ) thay vì remote backend có cơ chế khoá, nên 2 lần terraform apply chạy gần như đồng thời đã ghi đè chồng lên nhau, làm mất một phần thông tin state.",
    rootCauseExplanation:
      "Khi dùng local backend, Terraform không có cơ chế khoá (locking) đáng tin cậy giữa các máy khác nhau để ngăn 2 tiến trình apply cùng đọc-sửa-ghi state file đồng thời. Khi 2 kỹ sư cùng chạy apply gần như cùng lúc, mỗi người đọc một bản snapshot state tại thời điểm bắt đầu, thực hiện thay đổi độc lập, rồi người chạy xong sau cùng ghi đè toàn bộ file state của mình lên, vô tình xoá mất các thay đổi mà người kia đã ghi vào state trước đó (ví dụ resource aws_db_instance.main đã được tạo thật trên AWS nhưng biến mất khỏi state) — đây chính là lý do tại sao remote backend có locking (S3+DynamoDB, Terraform Cloud...) luôn được khuyến nghị bắt buộc cho mọi dự án có nhiều hơn 1 người làm việc.",
    requiredFindings: ["state hiện tại thiếu một tài nguyên chắc chắn vẫn tồn tại thật trên cloud", "nguyên nhân là dùng local state không có cơ chế khoá, 2 lần apply gần như đồng thời ghi đè lẫn nhau"],
    rubric: [
      { criterion: "Phát hiện đúng sự không nhất quán giữa state và thực tế tài nguyên trên cloud", weight: 30 },
      { criterion: "Xác định đúng nguyên nhân gốc là thiếu remote backend có locking, và đề xuất khắc phục (terraform import lại resource bị mất + chuyển sang remote backend)", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "terraform state list" }, output: "aws_vpc.main\naws_subnet.public\n(không có aws_db_instance.main dù chắc chắn vẫn tồn tại trên AWS)" },
      { match: { type: "exact", pattern: "terraform plan" }, output: "Plan: 1 to add, 0 to change, 0 to destroy.\n  + aws_db_instance.main  (Terraform tưởng chưa tồn tại, định tạo MỚI — rất nguy hiểm nếu apply)" },
    ],
    hints: ["So sánh terraform state list với danh sách tài nguyên thực tế trên cloud console để tìm chênh lệch.", "Terraform plan đề xuất tạo mới một tài nguyên vốn đã tồn tại là dấu hiệu rõ ràng của state bị thiếu thông tin — tuyệt đối không apply ngay.", "Kiểm tra xem dự án đang dùng loại backend nào (local hay remote có locking) — đây thường là nguyên nhân gốc của xung đột ghi state đồng thời."],
  }),
  scenario({
    topicSlug: "cicd-iac",
    difficulty: "HARD",
    title: "Triển khai blue-green gây dữ liệu không nhất quán giữa 2 phiên bản",
    context:
      "Sau một đợt triển khai blue-green cho service đặt hàng, một số khách hàng báo cáo đơn hàng của họ 'biến mất' tạm thời rồi lại xuất hiện, dù cả 2 phiên bản blue và green đều báo trạng thái khoẻ mạnh trong suốt quá trình chuyển đổi.",
    symptoms: ["Một số đơn hàng tạo ra trong khoảng 5 phút chuyển đổi không hiển thị ngay khi khách hàng F5 lại trang", "Cả phiên bản blue (cũ) và green (mới) đều pass health check trong suốt quá trình"],
    filesystem: [{ name: "migration/0089_add_order_index.sql", type: "file", content: "-- Migration mới thêm trong bản green, có thay đổi schema tương thích ngược nhưng cache tầng application chưa biết" }],
    services: [{ name: "order-service-blue", status: "running" }, { name: "order-service-green", status: "running" }],
    logs: {
      "load balancer access log (giai đoạn chuyển đổi)": [
        "Request A → routed to blue (ghi đơn hàng #1001 vào DB qua kết nối connection pool CŨ)",
        "Request B (đọc lại #1001) → routed to green (đọc qua cache riêng của green, chưa invalidate, trả về rỗng)",
      ],
    },
    rootCauseSummary: "Trong giai đoạn chuyển đổi, cả 2 phiên bản blue và green cùng nhận traffic song song nhưng mỗi phiên bản có một lớp cache ứng dụng riêng biệt không đồng bộ với nhau, khiến request ghi vào blue không được green nhìn thấy ngay.",
    rootCauseExplanation:
      "Chiến lược blue-green cho service này chuyển traffic dần dần (không phải cắt ngay lập tức 100%) để giảm rủi ro, nghĩa là trong vài phút có cả blue và green cùng phục vụ request song song, cùng ghi/đọc chung một database. Tuy nhiên mỗi phiên bản lại có một tầng cache ứng dụng riêng (in-memory cache, không chia sẻ) để tăng tốc độ đọc. Khi một request ghi đơn hàng được route tới blue, dữ liệu được ghi đúng vào database nhưng cache của GREEN (đang phục vụ request đọc tiếp theo từ chính khách hàng đó) chưa hề biết về thay đổi này, nên trả về kết quả cũ (rỗng) cho tới khi cache của green tự hết hạn (TTL) và đọc lại từ database — gây cảm giác 'đơn hàng biến mất tạm thời' với khách hàng.",
    requiredFindings: ["log cho thấy request ghi và request đọc tiếp theo của cùng một hành động bị route tới 2 phiên bản khác nhau (blue/green)", "nguyên nhân là mỗi phiên bản có cache ứng dụng riêng không đồng bộ, gây đọc dữ liệu cũ tạm thời trong giai đoạn chuyển đổi song song"],
    rubric: [
      { criterion: "Phát hiện đúng request ghi và đọc bị route tới 2 phiên bản khác nhau trong giai đoạn chuyển đổi", weight: 40 },
      { criterion: "Giải thích đúng nguyên nhân gốc là cache tầng ứng dụng không chia sẻ/đồng bộ giữa 2 phiên bản", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "load balancer access log (giai đoạn chuyển đổi)" }, output: "Request A → routed to blue (ghi đơn hàng #1001)\nRequest B (đọc lại #1001) → routed to green (cache riêng, chưa invalidate, trả về rỗng)" },
    ],
    hints: ["Cả 2 phiên bản healthy không có nghĩa là chúng nhất quán dữ liệu với nhau trong giai đoạn chuyển đổi song song.", "Kiểm tra xem request ghi và request đọc tiếp theo của cùng khách hàng có bị route tới 2 phiên bản khác nhau không.", "Tầng cache ứng dụng không chia sẻ giữa 2 phiên bản là nguyên nhân phổ biến gây dữ liệu không nhất quán tạm thời trong blue-green/canary deployment."],
  }),
] as const;
