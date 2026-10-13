import { scenario } from "./types";

export const dataScenarios = [
  scenario({
    topicSlug: "data",
    difficulty: "EASY",
    title: "MySQL từ chối kết nối từ xa do bind-address sai",
    context:
      "Một ứng dụng backend mới deploy trên server khác không kết nối được tới MySQL server nội bộ, dù MySQL đang chạy bình thường và mở đúng cổng theo firewall.",
    symptoms: ["Ứng dụng báo lỗi 'Connection refused' khi kết nối MySQL từ server khác", "Kết nối MySQL từ chính localhost trên server DB vẫn hoạt động bình thường"],
    filesystem: [{ name: "/etc/mysql/mysql.conf.d/mysqld.cnf", type: "file", content: "bind-address = 127.0.0.1" }],
    services: [{ name: "mysql", status: "running", port: 3306 }],
    logs: {},
    rootCauseSummary: "MySQL được cấu hình bind-address = 127.0.0.1, chỉ chấp nhận kết nối từ chính máy local, không lắng nghe trên địa chỉ mạng để nhận kết nối từ xa.",
    rootCauseExplanation:
      "Cấu hình bind-address mặc định của MySQL trên nhiều bản cài đặt là 127.0.0.1 vì lý do bảo mật (chỉ cho local truy cập). Server DB này chưa được cấu hình lại để mở cho kết nối từ các server ứng dụng khác trong mạng nội bộ, nên dù firewall đã mở đúng cổng 3306, bản thân tiến trình MySQL vẫn chỉ lắng nghe trên interface loopback và từ chối mọi kết nối tới từ địa chỉ IP mạng khác.",
    requiredFindings: ["kết nối từ localhost OK nhưng từ xa bị từ chối", "nguyên nhân là bind-address của MySQL đang giới hạn chỉ 127.0.0.1"],
    rubric: [
      { criterion: "Phân biệt đúng kết nối local OK và từ xa thất bại để khoanh vùng vấn đề bind-address", weight: 40 },
      { criterion: "Tìm đúng cấu hình bind-address trong file mysqld.cnf", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/mysql/mysql.conf.d/mysqld.cnf" }, output: "bind-address = 127.0.0.1" },
      { match: { type: "exact", pattern: "ss -tlnp | grep 3306" }, output: "LISTEN  0  151  127.0.0.1:3306  0.0.0.0:*  users:((\"mysqld\",pid=1021))" },
    ],
    hints: ["So sánh kết quả kết nối local và từ xa để khoanh vùng vấn đề.", "Kiểm tra bind-address trong cấu hình MySQL.", "ss -tlnp cho biết chính xác MySQL đang lắng nghe trên interface nào."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "EASY",
    title: "Redis báo lỗi hết bộ nhớ dù RAM server còn trống",
    context:
      "Một ứng dụng dùng Redis làm cache bắt đầu báo lỗi ghi dữ liệu thất bại, dù kiểm tra RAM tổng của server vẫn còn rất nhiều dung lượng trống.",
    symptoms: ["Ứng dụng báo lỗi 'OOM command not allowed when used memory > maxmemory'", "free -h trên server cho thấy RAM còn trống hơn 60%"],
    filesystem: [{ name: "/etc/redis/redis.conf", type: "file", content: "maxmemory 512mb\nmaxmemory-policy noeviction" }],
    services: [{ name: "redis", status: "running", port: 6379 }],
    logs: {},
    rootCauseSummary: "Redis được giới hạn maxmemory 512MB (nhỏ hơn nhiều RAM server thực tế) với chính sách noeviction, nên khi dữ liệu cache đầy 512MB, Redis từ chối mọi lệnh ghi mới thay vì tự động xoá bớt dữ liệu cũ.",
    rootCauseExplanation:
      "maxmemory của Redis là một giới hạn độc lập hoàn toàn với RAM vật lý của server — đây là ngưỡng do người cấu hình đặt ra để kiểm soát Redis không chiếm quá nhiều RAM chia sẻ với các dịch vụ khác. Vì chính sách maxmemory-policy đang là noeviction (không tự xoá dữ liệu cũ khi đầy), khi lượng dữ liệu cache vượt quá 512MB, Redis từ chối thẳng mọi lệnh ghi mới (trả lỗi OOM) để bảo vệ dữ liệu hiện có, bất kể server còn bao nhiêu RAM vật lý trống.",
    requiredFindings: ["Redis báo lỗi OOM dù RAM server còn nhiều", "nguyên nhân là maxmemory được set thấp (512MB) kèm chính sách noeviction, không tự giải phóng bộ nhớ khi đầy"],
    rubric: [
      { criterion: "Phân biệt đúng giới hạn maxmemory của Redis với RAM vật lý server", weight: 40 },
      { criterion: "Đề xuất hướng khắc phục hợp lý (tăng maxmemory hoặc đổi policy eviction phù hợp với use-case cache)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/redis/redis.conf" }, output: "maxmemory 512mb\nmaxmemory-policy noeviction" },
      { match: { type: "exact", pattern: "redis-cli info memory" }, output: "used_memory_human:512.00M\nmaxmemory_human:512.00M\nmaxmemory_policy:noeviction" },
    ],
    hints: ["maxmemory của Redis là một giới hạn cấu hình riêng, không phụ thuộc trực tiếp vào RAM vật lý server.", "Kiểm tra cấu hình maxmemory và maxmemory-policy hiện tại.", "Với use-case cache (không cần giữ dữ liệu vĩnh viễn), chính sách eviction như allkeys-lru thường phù hợp hơn noeviction."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "EASY",
    title: "PostgreSQL ngừng nhận ghi do thư mục WAL đầy",
    context:
      "Một ứng dụng ghi dữ liệu liên tục vào PostgreSQL bắt đầu báo lỗi timeout/không ghi được, dù phân vùng dữ liệu chính của database vẫn còn dung lượng trống.",
    symptoms: ["Ứng dụng báo lỗi timeout khi thực hiện INSERT/UPDATE", "Phân vùng chứa thư mục pg_wal báo gần đầy 100% dung lượng"],
    filesystem: [{ name: "/var/lib/postgresql/16/main/pg_wal", type: "dir", content: "hàng nghìn file WAL segment tích lũy, chưa được archive/dọn" }],
    services: [{ name: "postgresql", status: "running" }],
    logs: { "tail /var/log/postgresql/postgresql-16-main.log": ["PANIC: could not write to file \"pg_wal/0000...\": No space left on device"] },
    rootCauseSummary: "Quá trình archive WAL (lưu trữ log giao dịch) bị lỗi/dừng từ lâu, khiến các file WAL không được dọn dẹp sau khi archive, tích lũy tới khi đầy phân vùng.",
    rootCauseExplanation:
      "PostgreSQL dùng Write-Ahead Log (WAL) để đảm bảo tính toàn vẹn giao dịch — mỗi thay đổi dữ liệu đều được ghi vào WAL trước. Khi bật chế độ archive_mode (thường dùng cho backup/replication), các file WAL cũ chỉ được phép xoá SAU KHI đã archive thành công sang nơi lưu trữ khác. Nếu script/lệnh archive_command bị lỗi (ví dụ đích lưu trữ hết dung lượng, hoặc mất quyền ghi) và không ai phát hiện, PostgreSQL vẫn tiếp tục sinh WAL mới cho mọi giao dịch nhưng không bao giờ xoá được WAL cũ (vì archive chưa thành công), khiến thư mục pg_wal phình to không kiểm soát tới khi đầy phân vùng, lúc đó chính PostgreSQL cũng không thể ghi thêm WAL cho giao dịch mới, dẫn tới PANIC và ngừng nhận ghi.",
    requiredFindings: ["log PostgreSQL báo PANIC không ghi được WAL do hết dung lượng", "nguyên nhân là quá trình archive WAL bị lỗi, khiến WAL cũ không được dọn dẹp và tích lũy đầy phân vùng"],
    rubric: [
      { criterion: "Tìm đúng lỗi PANIC liên quan tới việc không ghi được pg_wal", weight: 40 },
      { criterion: "Liên hệ đúng với archive_command bị lỗi là nguyên nhân khiến WAL không được dọn dẹp", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "tail /var/log/postgresql/postgresql-16-main.log" }, output: "PANIC: could not write to file \"pg_wal/0000...\": No space left on device" },
      { match: { type: "exact", pattern: "du -sh /var/lib/postgresql/16/main/pg_wal" }, output: "48G\t/var/lib/postgresql/16/main/pg_wal" },
    ],
    hints: ["Kiểm tra log PostgreSQL để tìm chính xác lỗi PANIC liên quan tới file nào.", "Dung lượng pg_wal lớn bất thường thường liên quan tới việc archive WAL bị lỗi, không được dọn dẹp.", "Kiểm tra trạng thái và log của archive_command (nếu bật archive_mode) để tìm nguyên nhân gốc."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "MEDIUM",
    title: "Truy vấn chậm bất thường do thiếu index sau khi dữ liệu tăng trưởng",
    context:
      "Một API tra cứu đơn hàng theo email khách hàng từng phản hồi rất nhanh nhiều tháng trước, gần đây dần trở nên chậm, giờ đôi khi mất tới 8-10 giây cho một truy vấn tưởng chừng đơn giản.",
    symptoms: ["API tra cứu đơn hàng theo email ngày càng chậm theo thời gian", "Bảng orders hiện có hơn 20 triệu dòng, tăng đều mỗi ngày"],
    filesystem: [],
    services: [{ name: "postgresql", status: "running" }],
    logs: { "EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_email = 'a@b.com'": ["Seq Scan on orders  (cost=0.00..512340.00 rows=3 width=120) (actual time=8120.512..8120.515 rows=2 loops=1)", "Planning Time: 0.112 ms", "Execution Time: 8120.601 ms"] },
    rootCauseSummary: "Cột customer_email trong bảng orders không có index, nên PostgreSQL phải quét tuần tự (Seq Scan) toàn bộ hơn 20 triệu dòng cho mỗi truy vấn tra cứu theo email.",
    rootCauseExplanation:
      "Khi bảng orders còn nhỏ (vài nghìn dòng lúc mới launch), Seq Scan toàn bảng vẫn đủ nhanh nên không ai để ý tới việc thiếu index. Khi dữ liệu tăng trưởng đều đặn theo thời gian lên tới 20 triệu dòng, chi phí quét tuần tự tăng tuyến tính theo kích thước bảng, khiến một truy vấn tra cứu đơn giản theo customer_email (vốn chỉ trả về vài dòng kết quả) lại phải đọc qua toàn bộ bảng mỗi lần, dẫn tới thời gian phản hồi tăng dần đều và cuối cùng chạm ngưỡng gây trải nghiệm tệ cho người dùng — đây là hệ quả kinh điển của việc thiếu index trên cột thường dùng để lọc (WHERE) trong các bảng tăng trưởng lớn theo thời gian.",
    requiredFindings: ["EXPLAIN ANALYZE cho thấy truy vấn đang thực hiện Seq Scan toàn bảng thay vì dùng index", "nguyên nhân là cột customer_email chưa có index, cần tạo index cho cột này"],
    rubric: [
      { criterion: "Dùng EXPLAIN ANALYZE để xác định đúng truy vấn đang Seq Scan", weight: 40 },
      { criterion: "Đề xuất đúng giải pháp tạo index cho cột customer_email", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_email = 'a@b.com'" }, output: "Seq Scan on orders  (cost=0.00..512340.00 rows=3 width=120) (actual time=8120.512..8120.515 rows=2 loops=1)\nPlanning Time: 0.112 ms\nExecution Time: 8120.601 ms" },
      { match: { type: "exact", pattern: "\\d orders" }, output: "Indexes:\n    \"orders_pkey\" PRIMARY KEY, btree (id)\n(không có index nào trên customer_email)" },
    ],
    hints: ["Dùng EXPLAIN ANALYZE để xem PostgreSQL đang thực hiện kế hoạch truy vấn như thế nào.", "'Seq Scan' trên một bảng lớn cho một truy vấn WHERE là dấu hiệu rõ ràng của việc thiếu index phù hợp.", "Kiểm tra danh sách index hiện có của bảng (\\d tablename trong psql) để xác nhận cột nào chưa được đánh index."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "MEDIUM",
    title: "Độ trễ replication MySQL tăng dần không kiểm soát",
    context:
      "Đội vận hành nhận thấy dữ liệu đọc từ MySQL replica (dùng cho báo cáo/dashboard) ngày càng trễ nhiều so với dữ liệu thật trên primary, từ vài giây ban đầu nay đã lên tới hơn 20 phút.",
    symptoms: ["Dashboard báo cáo dựa trên replica hiển thị dữ liệu trễ hơn 20 phút so với thực tế", "Độ trễ (Seconds_Behind_Master) tăng dần đều, không có dấu hiệu bắt kịp lại"],
    filesystem: [],
    services: [{ name: "mysql-replica", status: "running" }],
    logs: { "SHOW REPLICA STATUS": ["Seconds_Behind_Master: 1247", "Slave_SQL_Running_State: Waiting to execute SQL statement, replicating a large transaction"] },
    rootCauseSummary: "Replica dùng replication đơn luồng (single-threaded) theo mặc định, không theo kịp tốc độ ghi của primary khi khối lượng giao dịch tăng cao, đặc biệt với các transaction lớn (batch update/import).",
    rootCauseExplanation:
      "Theo mặc định, MySQL replication áp dụng lại các sự kiện binlog từ primary vào replica theo đúng thứ tự, trên một luồng SQL thread duy nhất (trừ khi bật parallel replication). Khi khối lượng ghi trên primary tăng lên (ví dụ do tăng trưởng traffic, hoặc có thêm job batch update/import dữ liệu lớn chạy định kỳ), một luồng đơn trên replica không đủ nhanh để áp dụng lại toàn bộ thay đổi theo kịp tốc độ primary tạo ra, độ trễ tích luỹ dần theo thời gian thay vì ổn định ở một mức cố định — đặc biệt tệ hơn khi gặp các transaction đơn lẻ rất lớn (ví dụ UPDATE hàng triệu dòng cùng lúc) chặn luồng SQL thread trong thời gian dài.",
    requiredFindings: ["SHOW REPLICA STATUS cho thấy Seconds_Behind_Master tăng dần liên tục", "nguyên nhân là replication đơn luồng không theo kịp khối lượng ghi tăng cao, đặc biệt với transaction lớn"],
    rubric: [
      { criterion: "Đọc đúng chỉ số Seconds_Behind_Master và trạng thái SQL thread để chẩn đoán", weight: 40 },
      { criterion: "Đề xuất hướng khắc phục hợp lý (bật parallel replication, tách nhỏ batch job lớn)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "SHOW REPLICA STATUS" }, output: "Seconds_Behind_Master: 1247\nSlave_SQL_Running_State: Waiting to execute SQL statement, replicating a large transaction" },
    ],
    hints: ["Kiểm tra Seconds_Behind_Master và trạng thái SQL thread qua SHOW REPLICA STATUS.", "Replication MySQL mặc định chạy đơn luồng, có thể là nút cổ chai khi khối lượng ghi tăng cao.", "Transaction đơn lẻ rất lớn trên primary có thể chặn SQL thread của replica trong thời gian dài."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "MEDIUM",
    title: "Mất dữ liệu Redis sau restart do cấu hình persistence sai",
    context:
      "Sau một lần restart server theo kế hoạch bảo trì, team phát hiện toàn bộ dữ liệu session đang lưu trong Redis (hàng trăm nghìn session người dùng đang hoạt động) biến mất hoàn toàn, buộc toàn bộ người dùng phải đăng nhập lại.",
    symptoms: ["Sau khi Redis restart, lệnh DBSIZE trả về 0 dù trước đó có hàng trăm nghìn key", "Không có lỗi nào xuất hiện trong log khi Redis khởi động lại"],
    filesystem: [{ name: "/etc/redis/redis.conf", type: "file", content: "save \"\"\nappendonly no" }],
    services: [{ name: "redis", status: "running" }],
    logs: {},
    rootCauseSummary: "Redis được cấu hình tắt hoàn toàn cả 2 cơ chế persistence (RDB snapshot bằng save \"\" và AOF bằng appendonly no), nên toàn bộ dữ liệu chỉ tồn tại trong RAM và mất sạch khi tiến trình restart.",
    rootCauseExplanation:
      "Redis có 2 cơ chế lưu dữ liệu xuống đĩa để tồn tại qua các lần restart: RDB (chụp snapshot định kỳ) và AOF (ghi lại từng lệnh ghi vào file log). Server này được cấu hình tắt cả hai (save \"\" vô hiệu hoá RDB snapshot, appendonly no tắt AOF) — có thể từ một quyết định tối ưu hiệu năng trước đây khi Redis chỉ được dùng làm cache tạm thời không quan trọng, nhưng sau đó đội phát triển đã mở rộng dùng Redis để lưu session người dùng (dữ liệu quan trọng hơn) mà không cập nhật lại cấu hình persistence tương ứng. Vì không có bất kỳ cơ chế lưu trữ bền nào, khi tiến trình Redis dừng (dù là restart có kế hoạch, không phải crash), toàn bộ dữ liệu trong RAM biến mất hoàn toàn và không thể khôi phục.",
    requiredFindings: ["cấu hình Redis tắt cả RDB (save \"\") và AOF (appendonly no)", "nguyên nhân mất dữ liệu là do không có cơ chế persistence nào được bật cho dữ liệu quan trọng như session"],
    rubric: [
      { criterion: "Xác định đúng cả 2 cơ chế persistence của Redis đều đang bị tắt", weight: 50 },
      { criterion: "Đề xuất đúng cần bật ít nhất một cơ chế persistence phù hợp (thường AOF cho dữ liệu quan trọng như session)", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/redis/redis.conf" }, output: "save \"\"\nappendonly no" },
      { match: { type: "exact", pattern: "redis-cli DBSIZE" }, output: "(integer) 0" },
    ],
    hints: ["Kiểm tra cấu hình persistence của Redis (RDB qua 'save', AOF qua 'appendonly').", "Redis mặc định lưu dữ liệu trong RAM — nếu không bật persistence, mọi dữ liệu mất khi tiến trình dừng, kể cả restart có kế hoạch.", "Với dữ liệu quan trọng như session người dùng, nên cân nhắc bật AOF (bền hơn RDB snapshot định kỳ)."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "HARD",
    title: "PostgreSQL deadlock hàng loạt dưới tải cao do thứ tự khoá không nhất quán",
    context:
      "Một ứng dụng xử lý chuyển khoản nội bộ giữa các tài khoản bắt đầu báo lỗi giao dịch thất bại hàng loạt vào giờ cao điểm, dù logic nghiệp vụ không hề thay đổi gần đây.",
    symptoms: ["Ứng dụng báo lỗi 'deadlock detected' ngày càng nhiều vào giờ cao điểm", "Lỗi chỉ xảy ra khi có nhiều giao dịch đồng thời, không bao giờ xảy ra khi test tuần tự từng giao dịch một"],
    filesystem: [{ name: "transfer.sql (logic ứng dụng)", type: "file", content: "-- Giao dịch A->B: UPDATE accounts SET balance... WHERE id=A; rồi WHERE id=B;\n-- Giao dịch B->A: UPDATE accounts SET balance... WHERE id=B; rồi WHERE id=A;\n-- Thứ tự khoá KHÔNG nhất quán giữa 2 hướng giao dịch" }],
    services: [{ name: "postgresql", status: "running" }],
    logs: { "tail /var/log/postgresql/postgresql-16-main.log": ["ERROR: deadlock detected", "DETAIL: Process 4021 waits for ShareLock on transaction 8821; blocked by process 4055.", "Process 4055 waits for ShareLock on transaction 8810; blocked by process 4021."] },
    rootCauseSummary: "Logic ứng dụng khoá (UPDATE) 2 dòng tài khoản theo thứ tự KHÔNG nhất quán tuỳ theo hướng giao dịch (A→B khoá A trước rồi B; B→A khoá B trước rồi A), tạo điều kiện kinh điển cho deadlock khi 2 giao dịch ngược chiều chạy đồng thời.",
    rootCauseExplanation:
      "Deadlock giữa 2 transaction trong PostgreSQL xảy ra khi mỗi transaction đang giữ một khoá mà transaction kia đang chờ, và ngược lại — tạo thành một vòng chờ khép kín. Ở đây, giao dịch chuyển khoản từ A sang B khoá dòng tài khoản A trước rồi mới tới B, trong khi giao dịch ngược lại (B sang A, xảy ra gần như đồng thời vào giờ cao điểm) lại khoá B trước rồi tới A. Nếu cả 2 giao dịch này chạy đồng thời: giao dịch 1 đã khoá A và đang chờ khoá B, trong khi giao dịch 2 đã khoá B và đang chờ khoá A — tạo thành vòng chờ khép kín, PostgreSQL phát hiện deadlock và buộc phải huỷ (rollback) một trong hai giao dịch để phá vỡ vòng chờ. Cách khắc phục chuẩn là LUÔN khoá các dòng theo một thứ tự nhất quán tuyệt đối không phụ thuộc hướng giao dịch (ví dụ luôn khoá theo thứ tự ID tài khoản tăng dần, bất kể ai chuyển cho ai).",
    requiredFindings: ["log PostgreSQL xác nhận deadlock giữa 2 process đang chờ khoá lẫn nhau", "nguyên nhân gốc là logic ứng dụng khoá 2 dòng theo thứ tự không nhất quán tuỳ hướng giao dịch"],
    rubric: [
      { criterion: "Đọc đúng chi tiết deadlock trong log PostgreSQL để xác nhận có vòng chờ khoá khép kín", weight: 30 },
      { criterion: "Phân tích đúng logic ứng dụng để tìm ra thứ tự khoá không nhất quán là nguyên nhân gốc", weight: 40 },
      { criterion: "Đề xuất đúng giải pháp: luôn khoá theo thứ tự nhất quán (ví dụ theo ID tăng dần) bất kể hướng giao dịch", weight: 30 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "tail /var/log/postgresql/postgresql-16-main.log" }, output: "ERROR: deadlock detected\nDETAIL: Process 4021 waits for ShareLock on transaction 8821; blocked by process 4055.\nProcess 4055 waits for ShareLock on transaction 8810; blocked by process 4021." },
      { match: { type: "exact", pattern: "cat transfer.sql" }, output: "-- Giao dịch A->B: UPDATE accounts SET balance... WHERE id=A; rồi WHERE id=B;\n-- Giao dịch B->A: UPDATE accounts SET balance... WHERE id=B; rồi WHERE id=A;" },
    ],
    hints: ["Deadlock chỉ xảy ra khi nhiều giao dịch chạy đồng thời — kiểm tra kỹ phần DETAIL trong log lỗi để thấy vòng chờ khoá.", "Xem lại logic ứng dụng: thứ tự các dòng/tài khoản bị khoá (UPDATE theo thứ tự nào) trong mỗi giao dịch.", "Giải pháp kinh điển cho deadlock kiểu này là luôn khoá tài nguyên theo một thứ tự cố định và nhất quán, không phụ thuộc hướng nghiệp vụ."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "HARD",
    title: "Split-brain trong cụm Redis Sentinel sau sự cố mạng",
    context:
      "Cụm Redis với Sentinel (1 master, 2 replica, 3 sentinel) gặp sự cố mạng ngắn giữa các datacenter. Sau khi mạng phục hồi, ứng dụng báo lỗi dữ liệu không nhất quán — một số key ghi gần đây bị mất.",
    symptoms: ["Một số dữ liệu ghi trong khoảng thời gian sự cố mạng bị mất sau khi mọi thứ ổn định lại", "Trong lúc sự cố, log ứng dụng cho thấy có 2 địa chỉ Redis khác nhau cùng được dùng làm 'master' trong một khoảng thời gian ngắn"],
    filesystem: [],
    services: [{ name: "redis-sentinel", status: "running" }],
    logs: {
      "sentinel log": [
        "+sdown master mymaster 10.0.1.10 6379 (sentinel ở DC-B mất kết nối tới master ở DC-A)",
        "+odown master mymaster 10.0.1.10 6379 #quorum 2/3",
        "+switch-master mymaster 10.0.1.10 6379 10.0.2.11 6379 (DC-B tự bầu master mới)",
        "(90s sau) +sdown subjective (kết nối phục hồi, phát hiện 2 master cùng tồn tại)",
      ],
    },
    rootCauseSummary: "Sự cố mạng ngắn giữa 2 datacenter khiến các Sentinel ở DC-B mất kết nối tới master thật ở DC-A, đạt quorum và tự động bầu một replica ở DC-B làm master mới, trong khi master cũ ở DC-A vẫn đang chạy và vẫn nhận ghi từ các client chưa kịp chuyển hướng — tạo ra 2 master cùng tồn tại (split-brain) trong thời gian ngắn.",
    rootCauseExplanation:
      "Redis Sentinel dùng cơ chế quorum để quyết định khi nào một master được coi là thực sự down (objectively down - ODOWN) và cần failover. Sự cố mạng ngắn giữa 2 datacenter làm gián đoạn kết nối giữa các Sentinel ở DC-B và master thật ở DC-A, đủ để 2/3 Sentinel (quorum) đồng ý rằng master đã chết và kích hoạt failover, bầu một replica ở DC-B lên làm master mới. Tuy nhiên master cũ ở DC-A trên thực tế KHÔNG hề chết — nó chỉ bị cô lập mạng tạm thời — và vẫn tiếp tục chấp nhận ghi dữ liệu từ các client ở phía DC-A trong suốt thời gian đó. Kết quả là có 2 'master' cùng tồn tại và nhận ghi độc lập trong cùng một khoảng thời gian (split-brain); khi mạng phục hồi, Sentinel buộc phải demote master cũ (DC-A) thành replica của master mới, và mọi dữ liệu đã ghi vào master cũ trong thời gian split-brain mà chưa kịp đồng bộ sẽ bị mất vĩnh viễn — đây là một trade-off đã biết của cơ chế automatic failover khi đối mặt với network partition (liên quan tới định lý CAP).",
    requiredFindings: ["log Sentinel cho thấy có một giai đoạn 2 master cùng tồn tại (switch-master rồi phát hiện lại master cũ vẫn sống)", "nguyên nhân là network partition giữa 2 datacenter khiến Sentinel bầu master mới trong khi master cũ vẫn đang hoạt động độc lập, gây split-brain và mất dữ liệu ghi vào master cũ bị demote"],
    rubric: [
      { criterion: "Đọc đúng chuỗi sự kiện trong log Sentinel để nhận diện split-brain", weight: 40 },
      { criterion: "Giải thích đúng cơ chế quorum/failover của Sentinel và trade-off với network partition (liên hệ CAP theorem)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "sentinel log" }, output: "+sdown master mymaster 10.0.1.10 6379\n+odown master mymaster 10.0.1.10 6379 #quorum 2/3\n+switch-master mymaster 10.0.1.10 6379 10.0.2.11 6379\n(90s sau) +sdown subjective (phát hiện 2 master cùng tồn tại)" },
    ],
    hints: ["Đọc theo thứ tự thời gian các sự kiện trong log Sentinel để dựng lại chuỗi sự kiện failover.", "'switch-master' nghĩa là Sentinel đã thực hiện failover — kiểm tra xem master cũ có thực sự chết hay chỉ bị cô lập mạng tạm thời.", "Mất dữ liệu ghi gần đây sau một sự cố mạng + failover tự động là dấu hiệu kinh điển của split-brain trong hệ thống có automatic failover."],
  }),
  scenario({
    topicSlug: "data",
    difficulty: "HARD",
    title: "Consumer Kafka tụt hậu không kiểm soát sau một đợt rebalance",
    context:
      "Một consumer group Kafka xử lý sự kiện đơn hàng real-time bắt đầu tụt hậu (lag) ngày càng tăng sau khi team scale consumer group từ 3 lên 12 instance để xử lý tải cao hơn — trái với kỳ vọng rằng thêm consumer sẽ giúp xử lý nhanh hơn.",
    symptoms: ["Consumer lag tăng liên tục dù vừa thêm nhiều consumer instance hơn", "Log consumer cho thấy rebalance xảy ra liên tục, lặp đi lặp lại nhiều lần mỗi giờ"],
    filesystem: [],
    services: [{ name: "order-events-consumer", status: "running" }],
    logs: {
      "consumer group describe": ["GROUP: order-events  TOPIC: orders  PARTITIONS: 12  CONSUMERS: 12", "LAG tăng liên tục dù CONSUMERS = PARTITIONS"],
      "consumer log": ["[Consumer clientId=c-7] Attempt to heartbeat failed since group is rebalancing", "[Consumer clientId=c-7] Revoking previously assigned partitions"],
    },
    rootCauseSummary: "Một số consumer xử lý message quá lâu (vượt quá max.poll.interval.ms) do một thay đổi logic xử lý gần đây gọi một API bên ngoài chậm, khiến Kafka coi consumer đó đã chết và liên tục kích hoạt rebalance — mỗi lần rebalance làm dừng toàn bộ việc xử lý trong group một khoảng thời gian ('stop-the-world'), gây lag tích luỹ nhanh hơn cả tốc độ xử lý thực tế.",
    rootCauseExplanation:
      "Kafka consumer group coi một consumer là 'còn sống' dựa trên việc nó gọi poll() đủ thường xuyên (trong vòng max.poll.interval.ms). Một thay đổi logic gần đây trong consumer thêm một lệnh gọi API bên thứ 3 đồng bộ (synchronous) để enrich dữ liệu đơn hàng trước khi commit offset, và API này đôi khi chậm bất thường (vài chục giây), khiến một số consumer vượt quá max.poll.interval.ms giữa 2 lần poll — Kafka coi consumer đó đã 'chết' và trục xuất nó khỏi group, kích hoạt rebalance để phân bổ lại toàn bộ 12 partition cho các consumer còn lại. Vấn đề nghiêm trọng hơn vì rebalance kiểu 'stop-the-world' (eager rebalancing, protocol mặc định ở Kafka client cũ) tạm dừng TOÀN BỘ việc xử lý của mọi consumer trong group cho tới khi rebalance hoàn tất, không chỉ consumer bị lỗi — và vì tình trạng API chậm vẫn tiếp diễn, rebalance cứ lặp lại liên tục, mỗi lần đều làm gián đoạn xử lý của cả 12 consumer, khiến lag tăng nhanh hơn nhiều so với kỳ vọng dù đã có nhiều consumer hơn.",
    requiredFindings: ["log consumer cho thấy rebalance xảy ra liên tục kèm 'heartbeat failed'/'revoking partitions'", "nguyên nhân gốc là một số consumer vượt quá max.poll.interval.ms (do gọi API ngoài chậm), bị trục xuất và kích hoạt rebalance lặp đi lặp lại, mỗi lần làm gián đoạn toàn bộ group"],
    rubric: [
      { criterion: "Nhận diện đúng rebalance đang xảy ra liên tục bất thường từ log consumer", weight: 30 },
      { criterion: "Liên hệ đúng nguyên nhân với max.poll.interval.ms bị vượt do xử lý message quá chậm (API ngoài)", weight: 40 },
      { criterion: "Giải thích đúng vì sao thêm consumer không giúp ích (rebalance kiểu stop-the-world ảnh hưởng toàn bộ group) và đề xuất hướng khắc phục (xử lý bất đồng bộ, tăng max.poll.interval.ms, hoặc cooperative rebalancing)", weight: 30 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "consumer group describe" }, output: "GROUP: order-events  TOPIC: orders  PARTITIONS: 12  CONSUMERS: 12\nLAG tăng liên tục dù CONSUMERS = PARTITIONS" },
      { match: { type: "exact", pattern: "consumer log" }, output: "[Consumer clientId=c-7] Attempt to heartbeat failed since group is rebalancing\n[Consumer clientId=c-7] Revoking previously assigned partitions" },
    ],
    hints: ["Số consumer bằng số partition vẫn bị lag tăng gợi ý vấn đề không nằm ở thiếu công suất xử lý thô, mà ở một cơ chế khác đang gây gián đoạn.", "Rebalance liên tục trong log là dấu hiệu quan trọng — tìm hiểu vì sao Kafka liên tục nghĩ consumer đã 'chết'.", "Kiểm tra thời gian xử lý mỗi message (đặc biệt các lệnh gọi API/IO đồng bộ bên trong vòng lặp poll) so với cấu hình max.poll.interval.ms."],
  }),
] as const;
