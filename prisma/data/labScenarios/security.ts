import { scenario } from "./types";

export const securityScenarios = [
  scenario({
    topicSlug: "security-hardening",
    difficulty: "EASY",
    title: "SSH cho phép đăng nhập root trực tiếp bằng mật khẩu",
    context:
      "Trong một đợt audit bảo mật định kỳ cho các server nội bộ, kỹ sư phát hiện một server vẫn cho phép đăng nhập SSH trực tiếp bằng tài khoản root và mật khẩu, trái với checklist hardening chuẩn của công ty.",
    symptoms: ["SSH tới server bằng root + mật khẩu thành công", "Checklist hardening yêu cầu tắt PermitRootLogin và PasswordAuthentication"],
    filesystem: [{ name: "/etc/ssh/sshd_config", type: "file", content: "PermitRootLogin yes\nPasswordAuthentication yes" }],
    services: [{ name: "sshd", status: "running", port: 22 }],
    logs: {},
    rootCauseSummary: "File cấu hình sshd_config vẫn giữ giá trị mặc định cho phép root login và xác thực bằng mật khẩu, chưa được áp dụng theo checklist hardening.",
    rootCauseExplanation:
      "Server này được dựng từ một image cũ trước khi quy trình hardening tự động (qua Ansible/script) được áp dụng bắt buộc cho mọi server mới, nên vẫn giữ cấu hình sshd mặc định của hệ điều hành — vốn cho phép cả đăng nhập root trực tiếp lẫn xác thực bằng mật khẩu, 2 điều này kết hợp lại tạo ra bề mặt tấn công brute-force rất lớn vì root là tài khoản có quyền cao nhất và ai cũng biết tên.",
    requiredFindings: ["sshd_config có PermitRootLogin yes và PasswordAuthentication yes", "đây là vi phạm checklist hardening, cần sửa thành no và chuyển sang xác thực bằng SSH key"],
    rubric: [
      { criterion: "Đọc đúng cấu hình sshd_config để phát hiện 2 thiết lập không an toàn", weight: 50 },
      { criterion: "Đề xuất đúng hướng khắc phục (tắt root login, chuyển sang SSH key)", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/ssh/sshd_config" }, output: "PermitRootLogin yes\nPasswordAuthentication yes\nPort 22" },
    ],
    hints: ["Kiểm tra file cấu hình sshd_config, so sánh với checklist hardening chuẩn.", "Cho phép root đăng nhập trực tiếp qua SSH là một rủi ro bảo mật kinh điển.", "Xác thực bằng mật khẩu dễ bị brute-force hơn nhiều so với SSH key."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "EASY",
    title: "Cổng Telnet không cần thiết đang mở ra ngoài",
    context:
      "Một đợt quét cổng (port scan) định kỳ nội bộ phát hiện một server quản trị mạng cũ vẫn mở cổng 23 (Telnet) có thể truy cập từ mạng văn phòng, dù đội vận hành khẳng định chỉ dùng SSH.",
    symptoms: ["nmap scan server này cho thấy cổng 23/tcp đang open", "Không ai trong team nhớ từng cấu hình mở Telnet gần đây"],
    filesystem: [],
    services: [{ name: "telnetd", status: "running", port: 23 }, { name: "sshd", status: "running", port: 22 }],
    logs: {},
    rootCauseSummary: "Dịch vụ telnetd là một phần của image/cấu hình legacy từ nhiều năm trước, chưa từng được gỡ bỏ dù không còn ai chủ động dùng tới.",
    rootCauseExplanation:
      "Server này được dựng từ rất lâu trước khi có chính sách hardening hiện tại, từ thời còn dùng Telnet để quản trị từ xa trước khi chuyển hẳn sang SSH. Gói telnetd chưa bao giờ được gỡ cài đặt khi ngừng sử dụng, dịch vụ vẫn tự khởi động cùng hệ thống và lắng nghe ở cổng 23 — vì Telnet truyền dữ liệu (kể cả mật khẩu) dưới dạng plaintext không mã hoá, đây là một rủi ro bảo mật nghiêm trọng nếu ai đó trong mạng nội bộ có thể nghe lén (sniff) traffic.",
    requiredFindings: ["cổng 23 (Telnet) đang mở và service telnetd đang chạy", "cần gỡ bỏ/tắt hẳn dịch vụ Telnet vì truyền dữ liệu không mã hoá, không còn nhu cầu sử dụng"],
    rubric: [
      { criterion: "Xác định đúng dịch vụ và cổng không cần thiết đang mở", weight: 50 },
      { criterion: "Giải thích đúng rủi ro bảo mật của Telnet (truyền plaintext) và đề xuất gỡ bỏ", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "ss -tlnp" }, output: "State   Local Address:Port   Process\nLISTEN  0.0.0.0:22            sshd\nLISTEN  0.0.0.0:23            telnetd" },
    ],
    hints: ["Liệt kê các cổng đang mở trên server (ss -tlnp hoặc netstat).", "Telnet là giao thức cũ truyền dữ liệu không mã hoá, không nên còn tồn tại trong môi trường production hiện đại.", "Nếu không ai chủ động dùng dịch vụ này, cân nhắc gỡ bỏ hẳn thay vì chỉ tắt tạm thời."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "EASY",
    title: "Tài khoản mặc định của thiết bị vẫn dùng mật khẩu gốc",
    context:
      "Trong lúc kiểm kê thiết bị mạng, kỹ sư phát hiện một switch quản lý mới lắp vẫn còn đăng nhập được bằng tài khoản và mật khẩu mặc định của nhà sản xuất.",
    symptoms: ["Đăng nhập web quản trị switch bằng admin/admin thành công", "Thiết bị đã được đưa vào vận hành thực tế gần 2 tuần"],
    filesystem: [],
    services: [{ name: "switch-mgmt-web", status: "running", port: 443 }],
    logs: {},
    rootCauseSummary: "Bước đổi mật khẩu mặc định trong quy trình lắp đặt thiết bị mới đã bị bỏ sót.",
    rootCauseExplanation:
      "Checklist lắp đặt thiết bị mạng mới có bước bắt buộc đổi tài khoản/mật khẩu mặc định trước khi đưa vào vận hành, nhưng do áp lực thời gian triển khai gấp, kỹ sư phụ trách đã bỏ sót bước này. Tài khoản mặc định (admin/admin) của nhà sản xuất là thông tin công khai, rất dễ bị kẻ tấn công trong cùng mạng (hoặc quét Internet nếu vô tình lộ ra ngoài) khai thác để chiếm quyền quản trị toàn bộ switch.",
    requiredFindings: ["đăng nhập được vào thiết bị bằng tài khoản/mật khẩu mặc định của nhà sản xuất", "cần đổi ngay mật khẩu mặc định và rà soát lại checklist lắp đặt thiết bị"],
    rubric: [
      { criterion: "Xác nhận đăng nhập được bằng thông tin mặc định", weight: 50 },
      { criterion: "Đề xuất đúng hướng khắc phục khẩn cấp (đổi mật khẩu ngay) và phòng ngừa (rà soát checklist)", weight: 50 },
    ],
    presetCommands: [],
    hints: ["Thử các thông tin đăng nhập mặc định phổ biến của nhà sản xuất thiết bị khi audit.", "Tài khoản/mật khẩu mặc định là một trong những lỗ hổng bảo mật phổ biến và nghiêm trọng nhất với thiết bị mạng.", "Nên có checklist bắt buộc đổi mật khẩu mặc định ngay khi lắp đặt bất kỳ thiết bị mới nào."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "MEDIUM",
    title: "Fail2ban không chặn được brute-force do sai đường dẫn log giám sát",
    context:
      "Server web nội bộ bị brute-force SSH liên tục trong vài ngày qua (hàng nghìn lần thử đăng nhập sai từ cùng một dải IP), nhưng Fail2ban đã cài đặt và đang chạy lại không hề chặn IP nào.",
    symptoms: ["auth.log cho thấy hàng nghìn lần đăng nhập sai liên tục từ cùng dải IP", "fail2ban-client status sshd cho thấy 0 IP bị ban"],
    filesystem: [{ name: "/etc/fail2ban/jail.local", type: "file", content: "[sshd]\nenabled = true\nlogpath = /var/log/secure  # sai đường dẫn, distro này dùng /var/log/auth.log" }],
    services: [{ name: "fail2ban", status: "running" }],
    logs: { "fail2ban-client status sshd": ["Currently banned: 0", "Total banned: 0"] },
    rootCauseSummary: "Jail Fail2ban cho sshd được cấu hình trỏ tới /var/log/secure (đường dẫn log của CentOS/RHEL) trong khi server này là Ubuntu, nơi log xác thực thực tế nằm ở /var/log/auth.log.",
    rootCauseExplanation:
      "Cấu hình jail.local được copy từ một tài liệu hướng dẫn hoặc server khác dùng distro CentOS/RHEL (nơi log xác thực mặc định là /var/log/secure), nhưng áp dụng trực tiếp cho server Ubuntu mà không điều chỉnh lại logpath (Ubuntu dùng /var/log/auth.log). Vì file /var/log/secure không tồn tại hoặc rỗng trên server này, Fail2ban không bao giờ đọc được bất kỳ dòng log đăng nhập thất bại nào, nên không bao giờ kích hoạt ban dù cuộc tấn công brute-force đang diễn ra thật và rất rõ ràng trong log thật (auth.log).",
    requiredFindings: ["Fail2ban đang chạy nhưng không ban được IP nào dù có brute-force rõ ràng trong auth.log", "nguyên nhân là logpath trong cấu hình jail trỏ sai file (không khớp với distro đang dùng)"],
    rubric: [
      { criterion: "Xác nhận có tấn công brute-force thật qua log xác thực của hệ thống", weight: 30 },
      { criterion: "Phát hiện đúng logpath trong cấu hình Fail2ban sai so với distro thực tế", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/fail2ban/jail.local" }, output: "[sshd]\nenabled = true\nlogpath = /var/log/secure" },
      { match: { type: "exact", pattern: "fail2ban-client status sshd" }, output: "Currently banned: 0\nTotal banned: 0" },
      { match: { type: "exact", pattern: "ls -la /var/log/secure /var/log/auth.log" }, output: "ls: cannot access '/var/log/secure': No such file or directory\n-rw-r----- 1 syslog adm  2.1M /var/log/auth.log" },
    ],
    hints: ["Xác nhận trước có đang bị brute-force thật không qua log xác thực hệ thống.", "Kiểm tra cấu hình jail Fail2ban, đặc biệt là đường dẫn logpath.", "Đường dẫn file log xác thực mặc định khác nhau giữa các distro Linux (Debian/Ubuntu vs RHEL/CentOS)."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "MEDIUM",
    title: "Chứng chỉ TLS hết hạn khiến dịch vụ nội bộ cảnh báo bảo mật",
    context:
      "Một dịch vụ nội bộ quan trọng đột ngột hiển thị cảnh báo 'Your connection is not private' trên mọi trình duyệt truy cập, dù trước đó vẫn hoạt động bình thường nhiều tháng.",
    symptoms: ["Mọi trình duyệt báo lỗi NET::ERR_CERT_DATE_INVALID khi truy cập", "Không có thay đổi cấu hình nào được thực hiện gần đây"],
    filesystem: [],
    services: [{ name: "nginx", status: "running", port: 443 }],
    logs: { "openssl x509 -enddate -noout -in /etc/nginx/ssl/service.crt": ["notAfter=Oct 10 00:00:00 2026 GMT  (đã qua 3 ngày)"] },
    rootCauseSummary: "Chứng chỉ TLS của dịch vụ đã hết hạn 3 ngày trước, và quy trình gia hạn tự động (nếu có) đã thất bại âm thầm mà không ai nhận được cảnh báo.",
    rootCauseExplanation:
      "Chứng chỉ TLS có thời hạn cố định và cần được gia hạn định kỳ trước khi hết hạn. Trường hợp này cho thấy không có cơ chế giám sát chủ động (ví dụ cảnh báo trước 14-30 ngày khi cert sắp hết hạn) hoặc cơ chế tự động gia hạn (như certbot cho Let's Encrypt với cron renew) không hoạt động đúng — có thể do một thay đổi hạ tầng trước đó (đổi DNS, firewall) đã âm thầm phá vỡ bước xác thực domain (ACME challenge) mà không ai để ý cho tới khi chứng chỉ thực sự hết hạn và gây lỗi rõ ràng cho người dùng cuối.",
    requiredFindings: ["chứng chỉ TLS đã hết hạn (notAfter đã qua)", "nguyên nhân là thiếu giám sát/gia hạn chủ động chứng chỉ trước khi hết hạn"],
    rubric: [
      { criterion: "Kiểm tra đúng ngày hết hạn chứng chỉ bằng openssl", weight: 40 },
      { criterion: "Đề xuất hướng khắc phục khẩn cấp (gia hạn ngay) và phòng ngừa (giám sát/tự động hoá gia hạn)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "openssl x509 -enddate -noout -in /etc/nginx/ssl/service.crt" }, output: "notAfter=Oct 10 00:00:00 2026 GMT" },
      { match: { type: "exact", pattern: "certbot certificates" }, output: "Certificate Name: service.internal\n  Expiry Date: 2026-10-10 (EXPIRED)\n  (auto-renewal gần nhất thất bại: DNS challenge timeout)" },
    ],
    hints: ["Kiểm tra ngày hết hạn chứng chỉ bằng openssl x509 -enddate.", "Nếu dùng chứng chỉ tự động gia hạn (certbot...), kiểm tra lịch sử các lần renew gần nhất có thành công không.", "Cân nhắc thêm cảnh báo chủ động (monitoring) khi chứng chỉ sắp hết hạn, không đợi tới khi nó thực sự hết hạn."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "MEDIUM",
    title: "Cấu hình sudo cấp quyền quá rộng cho tài khoản ứng dụng",
    context:
      "Trong một đợt audit quyền hạn, kỹ sư bảo mật phát hiện tài khoản service account dùng để chạy một ứng dụng web có quyền sudo chạy MỌI lệnh mà không cần mật khẩu, vượt xa nhu cầu thực tế của ứng dụng.",
    symptoms: ["Tài khoản app-user có thể chạy sudo bất kỳ lệnh nào không cần nhập mật khẩu", "Ứng dụng thực tế chỉ cần quyền restart chính service của nó"],
    filesystem: [{ name: "/etc/sudoers.d/app-user", type: "file", content: "app-user ALL=(ALL) NOPASSWD: ALL" }],
    services: [],
    logs: {},
    rootCauseSummary: "Rule sudoers cấp quyền cho app-user chạy MỌI lệnh với quyền root không cần mật khẩu, thay vì chỉ giới hạn đúng 1-2 lệnh cần thiết (ví dụ systemctl restart app).",
    rootCauseExplanation:
      "Khi thiết lập service account ban đầu, kỹ sư muốn ứng dụng có thể tự restart chính nó khi cần (ví dụ qua một cơ chế healing tự động) nên thêm quyền sudo, nhưng vì tiện và để 'chắc chắn không thiếu quyền gì', đã cấp rule ALL=(ALL) NOPASSWD: ALL thay vì giới hạn đúng lệnh cần thiết. Đây là vi phạm nguyên tắc đặc quyền tối thiểu (principle of least privilege) nghiêm trọng: nếu ứng dụng web này bị khai thác lỗ hổng (ví dụ RCE), kẻ tấn công có thể dùng chính quyền sudo không giới hạn này để leo thang chiếm toàn quyền root trên server ngay lập tức.",
    requiredFindings: ["sudoers cấp quyền ALL=(ALL) NOPASSWD: ALL cho tài khoản ứng dụng", "đây là vi phạm nguyên tắc đặc quyền tối thiểu, cần giới hạn chỉ đúng lệnh ứng dụng thực sự cần"],
    rubric: [
      { criterion: "Đọc đúng rule sudoers và nhận diện mức độ rủi ro của NOPASSWD: ALL", weight: 40 },
      { criterion: "Đề xuất đúng cách giới hạn quyền chỉ còn đúng lệnh cần thiết (nguyên tắc đặc quyền tối thiểu)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/sudoers.d/app-user" }, output: "app-user ALL=(ALL) NOPASSWD: ALL" },
    ],
    hints: ["Kiểm tra các rule trong /etc/sudoers.d/ cho tài khoản ứng dụng.", "So sánh quyền được cấp với nhu cầu thực tế của ứng dụng — nguyên tắc đặc quyền tối thiểu.", "Nếu ứng dụng web này có lỗ hổng, quyền sudo ALL không giới hạn sẽ biến lỗ hổng đó thành chiếm quyền root toàn bộ server."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "HARD",
    title: "Phát hiện tiến trình đào tiền ảo trái phép giả danh tiến trình hệ thống",
    context:
      "Đội vận hành nhận cảnh báo CPU usage của một server luôn ở mức 100% liên tục nhiều ngày qua dù không có workload tương ứng nào được biết tới, tiến trình chiếm CPU có tên giống tiến trình hệ thống bình thường.",
    symptoms: ["top cho thấy một tiến trình tên 'kworker/0:2-events' chiếm gần 100% CPU liên tục (bất thường vì kworker thật thường rất ít tải)", "Traffic mạng ra ngoài tăng bất thường tới một địa chỉ IP lạ trên cổng không chuẩn"],
    filesystem: [{ name: "/tmp/.X11-unix/.cache/kworker", type: "file", content: "(binary thực thi lạ, giả danh tên tiến trình kernel thật nhưng chạy từ /tmp)" }],
    services: [],
    logs: {
      "ps aux | grep kworker": ["user1234   8821 99.8  2.1  /tmp/.X11-unix/.cache/kworker --config=xmr.pool.example.com:4444"],
      "netstat -antp | grep 8821": ["tcp  0  0  10.0.5.20:51230  203.0.113.45:4444  ESTABLISHED  8821/kworker"],
    },
    rootCauseSummary: "Server đã bị xâm nhập và cài một tiến trình đào tiền ảo (cryptominer) giả danh tên tiến trình kernel hợp pháp (kworker) để tránh bị phát hiện bằng mắt thường, kết nối ra ngoài tới một mining pool.",
    rootCauseExplanation:
      "Tiến trình kworker thật của kernel Linux chạy với quyền root, không có tham số dòng lệnh dạng --config trỏ tới pool đào coin, và không bao giờ chạy từ đường dẫn /tmp. Ở đây kẻ tấn công (có thể đã khai thác một lỗ hổng ứng dụng web trên server này trước đó để có chỗ đứng chân ban đầu) đã tải về một binary cryptominer, đặt tên giả là 'kworker' để đánh lừa khi admin lướt qua danh sách tiến trình bằng top/ps, rồi chạy nó dưới quyền user thường (user1234, có thể là tài khoản service bị chiếm) kết nối liên tục ra một mining pool bên ngoài để đào tiền ảo, chiếm gần hết CPU server.",
    requiredFindings: ["tiến trình giả danh kworker nhưng chạy từ /tmp với tham số kết nối mining pool", "cần cô lập server ngay, thu thập bằng chứng, kill tiến trình, và điều tra đường xâm nhập ban đầu (không chỉ xoá tiến trình là xong)"],
    rubric: [
      { criterion: "Phân biệt đúng tiến trình giả danh với tiến trình kernel thật (đường dẫn, tham số, quyền chạy)", weight: 30 },
      { criterion: "Xác nhận hành vi kết nối ra ngoài tới mining pool qua netstat", weight: 30 },
      { criterion: "Đề xuất quy trình xử lý sự cố bảo mật đúng đắn: cô lập, thu thập bằng chứng, điều tra nguyên nhân gốc — không chỉ xoá tiến trình", weight: 40 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "ps aux | grep kworker" }, output: "user1234   8821 99.8  2.1  /tmp/.X11-unix/.cache/kworker --config=xmr.pool.example.com:4444" },
      { match: { type: "exact", pattern: "netstat -antp | grep 8821" }, output: "tcp  0  0  10.0.5.20:51230  203.0.113.45:4444  ESTABLISHED  8821/kworker" },
    ],
    hints: ["Tiến trình kernel thật (kworker) không bao giờ chạy từ /tmp hoặc có tham số dòng lệnh dạng --config.", "Kiểm tra kết nối mạng của tiến trình nghi ngờ bằng netstat/ss — kết nối ra ngoài tới địa chỉ/cổng lạ là dấu hiệu rõ ràng.", "Khi xác nhận có xâm nhập, không chỉ kill tiến trình — cần cô lập máy và điều tra đường xâm nhập ban đầu để tránh bị tái nhiễm."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "HARD",
    title: "Leo thang đặc quyền qua binary SUID bị cấu hình sai",
    context:
      "Trong một bài kiểm tra bảo mật nội bộ (pentest nội bộ được phê duyệt), kỹ sư phát hiện một user thường (không có quyền sudo) có thể đọc được nội dung file /etc/shadow — điều lẽ ra chỉ root mới làm được.",
    symptoms: ["User thường chạy được lệnh đọc /etc/shadow và thấy nội dung hash mật khẩu", "User này không có trong nhóm sudo, không có quyền root theo cách thông thường"],
    filesystem: [{ name: "/usr/local/bin/backup-helper", type: "file", content: "-rwsr-xr-x 1 root root  backup-helper  (bit SUID được bật, owner root)" }],
    services: [],
    logs: { "find / -perm -4000 -type f 2>/dev/null": ["/usr/bin/passwd", "/usr/bin/sudo", "/usr/local/bin/backup-helper  (bất thường, không phải binary hệ thống chuẩn)"] },
    rootCauseSummary: "Một binary nội bộ tự viết (backup-helper) được gán bit SUID với owner root nhưng không giới hạn chức năng chặt chẽ — cho phép người dùng lợi dụng nó để đọc bất kỳ file nào trên hệ thống với quyền root.",
    rootCauseExplanation:
      "Bit SUID (Set User ID) khi gán cho một binary khiến nó LUÔN chạy với quyền của OWNER file (ở đây là root) bất kể ai thực thi nó. Kỹ sư viết script backup-helper để tự động hoá việc sao lưu, cần quyền root để đọc một số file hệ thống, nên đã gán SUID thay vì dùng cách an toàn hơn (ví dụ sudo với rule giới hạn đúng 1 lệnh cụ thể, hoặc capabilities thay vì full SUID). Vì backup-helper nhận tham số đường dẫn file tự do từ người dùng mà không validate/giới hạn, bất kỳ user thường nào cũng có thể gọi nó với tham số trỏ tới /etc/shadow (hoặc bất kỳ file nhạy cảm nào khác) và nhận được nội dung dưới quyền root — đây là một lỗ hổng leo thang đặc quyền (privilege escalation) kinh điển.",
    requiredFindings: ["tìm thấy binary tự viết có bit SUID bất thường (không phải binary hệ thống chuẩn)", "nguyên nhân là binary SUID không giới hạn/validate đúng tham số đầu vào, cho phép đọc file tuỳ ý với quyền root"],
    rubric: [
      { criterion: "Dùng find -perm -4000 để rà soát các binary có bit SUID bất thường trên hệ thống", weight: 40 },
      { criterion: "Giải thích đúng cơ chế SUID bị lợi dụng và đề xuất khắc phục (gỡ SUID, dùng sudo rule giới hạn hoặc capabilities thay thế)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "find / -perm -4000 -type f 2>/dev/null" }, output: "/usr/bin/passwd\n/usr/bin/sudo\n/usr/local/bin/backup-helper" },
      { match: { type: "exact", pattern: "ls -la /usr/local/bin/backup-helper" }, output: "-rwsr-xr-x 1 root root 15234 Sep 10 backup-helper" },
    ],
    hints: ["Rà soát các binary có bit SUID trên hệ thống bằng find -perm -4000 — một số binary hệ thống chuẩn cần SUID (passwd, sudo), nhưng binary tự viết có SUID luôn đáng nghi.", "Bit SUID khiến chương trình luôn chạy với quyền của chủ sở hữu file (thường là root) bất kể ai thực thi nó.", "Nếu một binary SUID nhận tham số từ người dùng mà không kiểm soát chặt chẽ, đó là lỗ hổng leo thang đặc quyền kinh điển."],
  }),
  scenario({
    topicSlug: "security-hardening",
    difficulty: "HARD",
    title: "Phát hiện dấu hiệu di chuyển ngang qua SSH key lạ được thêm vào authorized_keys",
    context:
      "Trong lúc rà soát định kỳ sau khi phát hiện một server biên (DMZ) bị xâm nhập, đội bảo mật cần kiểm tra xem kẻ tấn công có di chuyển ngang (lateral movement) sang các server nội bộ khác hay không.",
    symptoms: ["Server nội bộ (không trực tiếp expose ra internet) có một dòng public key lạ trong authorized_keys của tài khoản service, không ai trong team nhận ra", "Thời điểm khóa lạ xuất hiện trùng khớp vài giờ sau thời điểm server biên bị xâm nhập"],
    filesystem: [{ name: "/home/svc-deploy/.ssh/authorized_keys", type: "file", content: "ssh-ed25519 AAAA...team-key team@company.com\nssh-rsa AAAA...xyz unknown-added-key  (dòng lạ, thêm lúc 03:14 sáng)" }],
    services: [],
    logs: {
      "last -a | head -5": ["svc-deploy  pts/2   10.0.5.20   Thu Oct  9 03:15 - 03:22  (login từ server biên vừa bị xâm nhập)"],
      "journalctl -u sshd --since '03:00'": ["Accepted publickey for svc-deploy from 10.0.5.20 port 51230 ssh2: ED25519 SHA256:unknown-fingerprint"],
    },
    rootCauseSummary: "Kẻ tấn công sau khi chiếm được server biên (DMZ) đã dùng chính server đó làm bàn đạp, SSH sang server nội bộ này bằng tài khoản svc-deploy (có thể lộ key/credential từ server biên) rồi tự thêm public key của mình vào authorized_keys để duy trì quyền truy cập lâu dài (persistence).",
    rootCauseExplanation:
      "Thời điểm xuất hiện key lạ trong authorized_keys trùng khớp chính xác vài giờ sau khi server biên bị xâm nhập, và log SSH xác nhận có một phiên đăng nhập thành công vào tài khoản svc-deploy xuất phát TỪ chính địa chỉ IP của server biên đó — đây là bằng chứng rõ ràng của lateral movement: kẻ tấn công đã lợi dụng việc server biên và server nội bộ này tin tưởng lẫn nhau qua tài khoản service (có thể do key SSH của svc-deploy được lưu sẵn trên server biên để phục vụ deploy tự động, và key đó đã bị đánh cắp khi server biên bị xâm nhập), sau đó tự thêm key của riêng mình vào authorized_keys để có thể quay lại truy cập bất cứ lúc nào mà không cần phụ thuộc vào việc chiếm lại server biên lần nữa.",
    requiredFindings: ["có một public key lạ được thêm vào authorized_keys của tài khoản service, thời điểm trùng khớp sau sự cố server biên", "log SSH xác nhận có đăng nhập thành công vào tài khoản này xuất phát từ chính IP server biên đã bị xâm nhập — bằng chứng lateral movement"],
    rubric: [
      { criterion: "Phát hiện đúng public key lạ trong authorized_keys và thời điểm bất thường", weight: 30 },
      { criterion: "Liên hệ đúng với log đăng nhập SSH để xác nhận nguồn gốc và đường di chuyển của kẻ tấn công", weight: 40 },
      { criterion: "Đề xuất đúng hành động tiếp theo: xoá key lạ, xoay vòng toàn bộ credential liên quan, mở rộng điều tra sang các server khác mà svc-deploy có quyền truy cập", weight: 30 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /home/svc-deploy/.ssh/authorized_keys" }, output: "ssh-ed25519 AAAA...team-key team@company.com\nssh-rsa AAAA...xyz unknown-added-key" },
      { match: { type: "exact", pattern: "last -a | head -5" }, output: "svc-deploy  pts/2   10.0.5.20   Thu Oct  9 03:15 - 03:22" },
    ],
    hints: ["So sánh thời điểm xuất hiện key lạ với timeline của sự cố server biên đã biết.", "Kiểm tra log đăng nhập SSH (last, journalctl -u sshd) để tìm nguồn gốc (IP) của phiên đăng nhập thêm key.", "Nếu xác nhận lateral movement, cần mở rộng điều tra sang mọi hệ thống mà tài khoản bị xâm phạm có quyền truy cập, không chỉ dừng ở việc xoá 1 key lạ."],
  }),
] as const;
