import { scenario } from "./types";

export const linuxScenarios = [
  scenario({
    topicSlug: "linux",
    difficulty: "EASY",
    title: "Nginx không khởi động được do lỗi cú pháp cấu hình",
    context:
      "Bạn quản lý web server nội bộ chạy Nginx trên Ubuntu 22.04. Sau khi đồng nghiệp sửa cấu hình virtual host rồi reload, trang web báo lỗi không truy cập được.",
    symptoms: ["curl http://localhost trả về Connection refused", "Người dùng báo không mở được trang nội bộ"],
    filesystem: [
      { name: "/etc/nginx/sites-enabled/default", type: "file", content: "server {\n  listen 80\n  server_name _;\n}" },
    ],
    services: [{ name: "nginx", status: "failed", port: 80, configPath: "/etc/nginx/sites-enabled/default" }],
    logs: {
      "journalctl -u nginx -n 20": [
        "nginx.service: Main process exited, code=exited, status=1/FAILURE",
        'nginx: [emerg] directive "listen" is not terminated by ";"',
      ],
    },
    rootCauseSummary: "File cấu hình virtual host thiếu dấu chấm phẩy sau directive listen 80.",
    rootCauseExplanation:
      "Đồng nghiệp sửa file site config nhưng quên dấu `;` cuối dòng `listen 80`, khiến nginx -t báo lỗi cú pháp và service không start lại được sau reload.",
    requiredFindings: ["nginx đang ở trạng thái failed", "nguyên nhân là lỗi cú pháp thiếu dấu ; trong file site config"],
    rubric: [
      { criterion: "Xác định đúng service nginx bị lỗi qua systemctl/journalctl", weight: 50 },
      { criterion: "Chỉ ra đúng dòng cấu hình sai cú pháp", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "systemctl status nginx" }, output: "● nginx.service - A high performance web server\n   Active: failed (Result: exit-code)" },
      { match: { type: "exact", pattern: "nginx -t" }, output: 'nginx: [emerg] directive "listen" is not terminated by ";" in /etc/nginx/sites-enabled/default:2\nnginx: configuration file /etc/nginx/nginx.conf test failed' },
    ],
    hints: ["Kiểm tra trạng thái service bằng systemctl status.", "Dùng journalctl -u nginx để xem log chi tiết.", "Chạy nginx -t để kiểm tra cú pháp cấu hình trước khi reload."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "EASY",
    title: "Đĩa đầy do log không được xoay vòng",
    context:
      "Server ứng dụng nội bộ báo lỗi 'No space left on device' khi ghi file. Team vận hành nghi ngờ do log tích tụ lâu ngày không được dọn.",
    symptoms: ["Ứng dụng ghi file thất bại với lỗi ENOSPC", "df -h cho thấy /var đầy 100%"],
    filesystem: [
      { name: "/var/log/app", type: "dir", children: [{ name: "app.log", type: "file", content: "... 8.2GB log tích lũy từ 6 tháng, chưa từng rotate ..." }] },
    ],
    services: [{ name: "app-worker", status: "failed" }],
    logs: {
      "df -h": ["/dev/sda1   20G   20G     0  100% /"],
      "journalctl -u app-worker -n 5": ["write(): No space left on device"],
    },
    rootCauseSummary: "Thư mục /var/log/app không có cấu hình logrotate nên log tích lũy chiếm hết dung lượng đĩa.",
    rootCauseExplanation:
      "File app.log của app-worker không nằm trong bất kỳ rule logrotate nào, tăng dần suốt 6 tháng tới khi chiếm hết 20GB đĩa gốc, khiến mọi tiến trình ghi file (kể cả log hệ thống) đều fail.",
    requiredFindings: ["phân vùng gốc đầy 100%", "nguyên nhân là app.log khổng lồ do thiếu logrotate"],
    rubric: [
      { criterion: "Xác định đúng phân vùng đầy bằng df -h", weight: 40 },
      { criterion: "Tìm ra file/thư mục chiếm dung lượng lớn nhất (du -sh)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "df -h" }, output: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        20G   20G     0 100% /" },
      { match: { type: "startsWith", pattern: "du -sh /var/log" }, output: "8.2G\t/var/log/app\n120M\t/var/log/nginx" },
    ],
    hints: ["Kiểm tra dung lượng đĩa bằng df -h trước.", "Dùng du -sh để tìm thư mục chiếm nhiều dung lượng nhất.", "Kiểm tra xem file log có nằm trong cấu hình logrotate hay không."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "EASY",
    title: "SSH bị từ chối do sai quyền file authorized_keys",
    context:
      "Một kỹ sư mới được cấp SSH key để truy cập server jump host nhưng liên tục bị từ chối đăng nhập dù key đã được thêm đúng.",
    symptoms: ["SSH báo 'Permission denied (publickey)'", "Key đã có trong ~/.ssh/authorized_keys nhưng vẫn không đăng nhập được"],
    filesystem: [
      { name: "/home/engineer/.ssh", type: "dir", children: [{ name: "authorized_keys", type: "file", content: "ssh-ed25519 AAAA... engineer@laptop" }] },
    ],
    services: [{ name: "sshd", status: "running", port: 22 }],
    logs: {
      "journalctl -u sshd -n 10": [
        "Authentication refused: bad ownership or modes for file /home/engineer/.ssh/authorized_keys",
      ],
    },
    rootCauseSummary: "Quyền thư mục ~/.ssh hoặc file authorized_keys quá lỏng (group/other có quyền ghi) nên sshd từ chối dùng.",
    rootCauseExplanation:
      "sshd mặc định từ chối dùng authorized_keys nếu thư mục .ssh hoặc chính file đó có quyền ghi cho group/other (ví dụ 777 hoặc 770), coi đây là rủi ro bảo mật — cần 700 cho thư mục và 600 cho file.",
    requiredFindings: ["sshd từ chối do bad ownership/modes của authorized_keys", "cần sửa quyền thành 700/.ssh và 600/authorized_keys"],
    rubric: [
      { criterion: "Đọc đúng log sshd để tìm nguyên nhân từ chối", weight: 50 },
      { criterion: "Nêu đúng quyền cần sửa (700/600)", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "ls -la /home/engineer/.ssh" }, output: "drwxrwxrwx 2 engineer engineer 4096 .\n-rwxrwxrwx 1 engineer engineer  412 authorized_keys" },
    ],
    hints: ["Xem log xác thực SSH phía server (journalctl -u sshd).", "SSH rất nghiêm ngặt về quyền của thư mục/file ~/.ssh.", "Quyền chuẩn là 700 cho .ssh và 600 cho authorized_keys."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "MEDIUM",
    title: "Cron job âm thầm thất bại vì thiếu PATH",
    context:
      "Một script backup chạy bằng crontab vẫn hiện trong crontab -l nhưng không tạo ra file backup nào trong 3 ngày qua, trong khi chạy tay thì luôn thành công.",
    symptoms: ["Chạy script thủ công thành công", "Không có log lỗi rõ ràng trong syslog ngoài một dòng command not found"],
    filesystem: [
      { name: "/etc/cron.d/backup", type: "file", content: "0 2 * * * root pg_dump mydb > /backup/mydb.sql" },
    ],
    services: [{ name: "cron", status: "running" }],
    logs: {
      "grep CRON /var/log/syslog": ["CRON[1122]: (root) CMD (pg_dump mydb > /backup/mydb.sql)", "/bin/sh: 1: pg_dump: not found"],
    },
    rootCauseSummary: "Crontab chạy với PATH tối giản không bao gồm thư mục chứa pg_dump (/usr/lib/postgresql/16/bin).",
    rootCauseExplanation:
      "Môi trường cron không kế thừa PATH đầy đủ như shell tương tác của user — chỉ có /usr/bin:/bin mặc định. Vì pg_dump nằm ở /usr/lib/postgresql/16/bin không có trong PATH đó nên lệnh thất bại âm thầm, output lỗi bị stderr nuốt mất vì không có MAILTO cấu hình.",
    requiredFindings: ["cron báo pg_dump: not found trong syslog", "nguyên nhân do PATH trong môi trường cron không chứa đường dẫn pg_dump"],
    rubric: [
      { criterion: "Tìm đúng dòng lỗi command not found trong syslog", weight: 40 },
      { criterion: "Giải thích đúng khác biệt PATH giữa cron và shell tương tác", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "crontab -l" }, output: "0 2 * * * root pg_dump mydb > /backup/mydb.sql" },
      { match: { type: "exact", pattern: "which pg_dump" }, output: "/usr/lib/postgresql/16/bin/pg_dump" },
    ],
    hints: ["Kiểm tra log cron trong /var/log/syslog bằng grep CRON.", "So sánh PATH khi chạy tay (echo $PATH) với PATH mặc định của cron.", "Dùng which để tìm đường dẫn đầy đủ của lệnh bị thiếu."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "MEDIUM",
    title: "Load average cao bất thường do tiến trình zombie",
    context:
      "Server báo cáo load average liên tục trên 20 dù CPU usage thực tế thấp. Một script Python chạy định kỳ bị crash nhiều lần trong ngày nhưng service giám sát vẫn 'Up'.",
    symptoms: ["uptime cho thấy load average > 20 trên máy 4 core", "top cho thấy CPU idle phần lớn thời gian"],
    filesystem: [
      { name: "/opt/worker/run.py", type: "file", content: "# script worker, fork subprocess xử lý job rồi không wait()" },
    ],
    services: [{ name: "worker-supervisor", status: "running" }],
    logs: {
      "ps aux | grep defunct": [
        "root      2201  0.0  0.0      0     0 ?        Z    09:01   0:00 [job_handler] <defunct>",
        "root      2340  0.0  0.0      0     0 ?        Z    09:03   0:00 [job_handler] <defunct>",
      ],
    },
    rootCauseSummary: "Tiến trình cha (run.py) fork subprocess xử lý job nhưng không gọi wait(), để lại hàng trăm zombie process.",
    rootCauseExplanation:
      "Mỗi job mới job_handler bị fork nhưng không được reap (waitpid) sau khi kết thúc, trở thành zombie. Zombie không tốn CPU thật nhưng vẫn được tính vào load average của Linux (đang ở trạng thái D/Z), và số lượng lớn dần làm cạn PID table theo thời gian.",
    requiredFindings: ["load average cao trong khi CPU idle", "có nhiều tiến trình defunct (zombie) do script cha không wait() subprocess"],
    rubric: [
      { criterion: "Phát hiện tiến trình zombie qua ps aux | grep defunct", weight: 50 },
      { criterion: "Giải thích đúng cơ chế zombie process không được reap", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "uptime" }, output: " 10:15:02 up 12 days,  3:42,  2 users,  load average: 23.41, 21.02, 18.77" },
      { match: { type: "exact", pattern: "ps aux | grep defunct" }, output: "root      2201  0.0  0.0      0     0 ?        Z    09:01   0:00 [job_handler] <defunct>\nroot      2340  0.0  0.0      0     0 ?        Z    09:03   0:00 [job_handler] <defunct>" },
    ],
    hints: ["Load average cao không nhất thiết do CPU bận — kiểm tra process ở trạng thái D/Z.", "Tìm tiến trình zombie bằng ps aux | grep defunct.", "Zombie sinh ra khi tiến trình cha không gọi wait() cho con đã chết."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "MEDIUM",
    title: "Service không tự khởi động lại sau khi reboot server",
    context:
      "Sau một đợt bảo trì cần reboot server, team phát hiện service API nội bộ không chạy, dù trước đó start thủ công hoạt động bình thường.",
    symptoms: ["Sau reboot, curl tới API timeout", "systemctl start api thủ công thì chạy được ngay"],
    filesystem: [{ name: "/etc/systemd/system/api.service", type: "file", content: "[Unit]\nDescription=Internal API\n[Service]\nExecStart=/opt/api/run.sh\n[Install]\nWantedBy=multi-user.target" }],
    services: [{ name: "api", status: "stopped" }],
    logs: {
      "systemctl is-enabled api": ["disabled"],
    },
    rootCauseSummary: "Service api.service chưa từng được enable nên không tự khởi động cùng hệ thống sau reboot.",
    rootCauseExplanation:
      "Người tạo service chỉ chạy `systemctl start api` để test chứ chưa chạy `systemctl enable api`, nên systemd không tạo symlink trong /etc/systemd/system/multi-user.target.wants — service không nằm trong chuỗi khởi động tự động dù file unit hợp lệ.",
    requiredFindings: ["service api đang ở trạng thái stopped sau reboot", "nguyên nhân do chưa enable service (systemctl enable)"],
    rubric: [
      { criterion: "Xác định service chưa được enable", weight: 50 },
      { criterion: "Đề xuất đúng lệnh khắc phục systemctl enable --now", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "systemctl status api" }, output: "● api.service - Internal API\n   Loaded: loaded (/etc/systemd/system/api.service; disabled; vendor preset: enabled)\n   Active: inactive (dead)" },
      { match: { type: "exact", pattern: "systemctl is-enabled api" }, output: "disabled" },
    ],
    hints: ["So sánh hành vi start thủ công và sau reboot để nghĩ tới việc service có tự khởi động hay không.", "Kiểm tra trạng thái enable bằng systemctl is-enabled.", "systemctl enable chỉ tạo symlink, không start service ngay — cần thêm --now hoặc start riêng."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "HARD",
    title: "OOM Killer âm thầm giết service do memory leak",
    context:
      "Một service Java nội bộ bị crash ngẫu nhiên vài lần mỗi tuần, luôn vào ban đêm, không có log lỗi ứng dụng nào trước thời điểm crash.",
    symptoms: ["Service dừng đột ngột không có exception trong log ứng dụng", "Thời điểm crash luôn trùng lúc traffic ban đêm thấp nhưng RAM server gần đầy"],
    filesystem: [{ name: "/var/log/app/service.log", type: "file", content: "... log dừng đột ngột không có stacktrace ..." }],
    services: [{ name: "report-service", status: "failed" }],
    logs: {
      "dmesg | grep -i 'killed process'": [
        "Out of memory: Killed process 8842 (java) total-vm:4200000kB, anon-rss:3100000kB",
      ],
      "journalctl -k -n 5": ["oom-kill:constraint=CONSTRAINT_NONE... oom_score_adj=0", "Out of memory: Killed process 8842 (java)"],
    },
    rootCauseSummary: "Service Java có memory leak (cache không giới hạn kích thước), heap tăng dần tới khi OOM Killer giết tiến trình.",
    rootCauseExplanation:
      "Một cache in-memory trong report-service không có giới hạn eviction, tích lũy object theo thời gian uptime. Vì JVM heap max được set gần bằng RAM vật lý, khi cache phình to tới một ngưỡng nhất định (thường sau nhiều giờ chạy liên tục, hay rơi vào batch report ban đêm tải nhiều dữ liệu), kernel OOM Killer chọn giết tiến trình tốn RAM nhất — không để lại log ứng dụng vì tiến trình bị SIGKILL ngay lập tức, không kịp ghi log/exception.",
    requiredFindings: ["dmesg/journalctl -k cho thấy OOM Killer giết process java", "nguyên nhân gốc là memory leak do cache không giới hạn kích thước"],
    rubric: [
      { criterion: "Tìm đúng bằng chứng OOM Killer trong dmesg/journalctl -k thay vì log ứng dụng", weight: 40 },
      { criterion: "Suy luận đúng nguyên nhân memory leak từ cache không giới hạn", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "dmesg | grep -i 'killed process'" }, output: "[123456.789] Out of memory: Killed process 8842 (java) total-vm:4200000kB, anon-rss:3100000kB, file-rss:0kB" },
      { match: { type: "exact", pattern: "free -h" }, output: "              total        used        free      shared  buff/cache   available\nMem:           3.8G        3.7G         50M         10M        80M         40M" },
    ],
    hints: ["Log ứng dụng im lặng khi tiến trình bị SIGKILL — kiểm tra dmesg/journalctl -k thay vì log app.", "Tìm dòng 'Killed process' để xác nhận OOM Killer.", "RSS tăng dần theo thời gian uptime là dấu hiệu kinh điển của memory leak."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "HARD",
    title: "Lỗi xác thực Kerberos/TLS hàng loạt do lệch giờ hệ thống",
    context:
      "Nhiều service nội bộ đồng loạt báo lỗi xác thực TLS/Kerberos sau một sự cố mất điện ngắn ở datacenter, dù chứng chỉ chưa hết hạn và cấu hình không đổi.",
    symptoms: ["Client báo lỗi 'certificate is not yet valid' dù cert còn hạn nhiều tháng", "Một vài service dùng Kerberos báo 'Clock skew too great'"],
    filesystem: [{ name: "/etc/chrony.conf", type: "file", content: "pool ntp.internal.local iburst\n# maxdistance 1.0 — dòng này đã bị comment nhầm tuần trước" }],
    services: [{ name: "chronyd", status: "failed" }],
    logs: {
      "chronyc tracking": ["506 Cannot talk to daemon"],
      "journalctl -u chronyd -n 10": ["chronyd.service: Main process exited, code=exited, status=1/FAILURE", "Fatal error: no reachable NTP servers"],
    },
    rootCauseSummary: "chronyd bị crash từ lúc mất điện, đồng hồ hệ thống trôi dần không đồng bộ NTP, gây lệch giờ đủ lớn để TLS/Kerberos từ chối xác thực.",
    rootCauseExplanation:
      "Sau sự cố mất điện, chronyd không tự phục hồi (crash loop do không resolve được NTP pool trong vài phút đầu mạng chưa ổn định, rồi service dừng hẳn thay vì retry). Đồng hồ hệ thống dựa vào RTC phần cứng dần trôi lệch hàng phút so với giờ thực. TLS kiểm tra notBefore/notAfter theo giờ hệ thống nên báo cert 'chưa hợp lệ', còn Kerberos vốn rất nhạy với lệch giờ (ngưỡng mặc định 5 phút) nên báo lỗi 'Clock skew too great'.",
    requiredFindings: ["chronyd đang ở trạng thái failed, không đồng bộ NTP", "đồng hồ hệ thống lệch đủ lớn khiến TLS và Kerberos từ chối xác thực"],
    rubric: [
      { criterion: "Liên hệ đúng lỗi TLS/Kerberos với vấn đề đồng bộ thời gian, không chỉ nhìn vào cert", weight: 40 },
      { criterion: "Xác định đúng chronyd bị crash và không tự phục hồi sau sự cố điện", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "chronyc tracking" }, output: "506 Cannot talk to daemon" },
      { match: { type: "exact", pattern: "date" }, output: "Thu Oct  9 14:52:11 +07 2026  (lệch ~6 phút so với giờ chuẩn NTP)" },
    ],
    hints: ["Lỗi TLS/Kerberos hàng loạt không liên quan nội dung cert thường gợi ý vấn đề thời gian hệ thống.", "Kiểm tra trạng thái dịch vụ đồng bộ giờ (chronyd/ntpd).", "Kerberos đặc biệt nhạy cảm với clock skew — ngưỡng mặc định chỉ vài phút."],
  }),
  scenario({
    topicSlug: "linux",
    difficulty: "HARD",
    title: "Ghi file thất bại dù còn dung lượng đĩa do cạn inode",
    context:
      "Một server lưu trữ hàng triệu file nhỏ (session cache của ứng dụng) báo lỗi 'No space left on device' khi tạo file mới, nhưng df -h cho thấy còn rất nhiều dung lượng trống.",
    symptoms: ["Ứng dụng báo lỗi ENOSPC khi tạo file mới", "df -h cho thấy phân vùng còn trống > 40%"],
    filesystem: [{ name: "/var/cache/sessions", type: "dir", children: [{ name: "README", type: "file", content: "Thư mục chứa hàng triệu file session nhỏ, mỗi file vài trăm byte, không có cơ chế dọn dẹp định kỳ" }] }],
    services: [{ name: "session-cache-writer", status: "failed" }],
    logs: {
      "journalctl -u session-cache-writer -n 5": ["open(): No space left on device"],
    },
    rootCauseSummary: "Phân vùng đã cạn kiệt inode (df -i 100%) dù dung lượng byte còn trống, do hàng triệu file session nhỏ không được dọn dẹp.",
    rootCauseExplanation:
      "Mỗi phân vùng ext4 được cấp số lượng inode cố định khi format, độc lập với dung lượng byte còn trống. Thư mục /var/cache/sessions tích lũy hàng triệu file rất nhỏ (session cache không có TTL/dọn dẹp) dần dần dùng hết toàn bộ inode của phân vùng — lúc này hệ thống vẫn còn dung lượng byte trống nhưng không thể tạo thêm bất kỳ file/inode mới nào, kể cả file 0 byte.",
    requiredFindings: ["df -h cho thấy còn dung lượng trống nhưng ghi file vẫn lỗi ENOSPC", "df -i cho thấy phân vùng đã dùng hết 100% inode"],
    rubric: [
      { criterion: "Nhận ra nghịch lý còn dung lượng byte nhưng vẫn lỗi hết chỗ, dẫn tới nghi ngờ inode", weight: 40 },
      { criterion: "Xác nhận đúng bằng df -i và chỉ ra nguyên nhân là hàng triệu file nhỏ", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "df -h" }, output: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   28G   20G  59% /" },
      { match: { type: "exact", pattern: "df -i" }, output: "Filesystem      Inodes  IUsed   IFree IUse% Mounted on\n/dev/sda1      3276800 3276800       0  100% /" },
    ],
    hints: ["df -h không phải lúc nào cũng cho bức tranh đầy đủ — thử df -i.", "ENOSPC có thể do hết dung lượng HOẶC hết inode.", "Hàng triệu file rất nhỏ là nguyên nhân kinh điển gây cạn inode dù dung lượng còn nhiều."],
  }),
] as const;
