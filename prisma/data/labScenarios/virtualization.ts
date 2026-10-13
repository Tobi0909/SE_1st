import { scenario } from "./types";

export const virtualizationScenarios = [
  scenario({
    topicSlug: "virtualization",
    difficulty: "EASY",
    title: "VM không khởi động được do vượt quá RAM khả dụng của host",
    context:
      "Kỹ sư tạo một VM mới trên Proxmox với cấu hình 32GB RAM trên một host chỉ còn 16GB khả dụng, VM báo lỗi không start được.",
    symptoms: ["Start VM báo lỗi 'memory allocation failed'", "Các VM khác trên host vẫn chạy bình thường"],
    filesystem: [],
    services: [{ name: "pve-vm-105", status: "stopped" }],
    logs: { "qm start 105": ["kvm: failed to allocate 32768 MiB: Cannot allocate memory"] },
    rootCauseSummary: "VM được cấp 32GB RAM nhưng host chỉ còn 16GB khả dụng do các VM khác đang chiếm dụng.",
    rootCauseExplanation:
      "Host vật lý có tổng 64GB RAM nhưng các VM khác đang chạy đã chiếm khoảng 48GB, chỉ còn 16GB trống. VM mới cấu hình cố định 32GB (không bật ballooning) nên hypervisor từ chối start vì không đủ RAM vật lý để cấp phát ngay từ đầu.",
    requiredFindings: ["lệnh start VM báo lỗi memory allocation failed", "nguyên nhân là host không còn đủ RAM trống cho cấu hình VM yêu cầu"],
    rubric: [
      { criterion: "Đọc đúng lỗi memory allocation failed khi start VM", weight: 40 },
      { criterion: "Kiểm tra và xác nhận RAM host không đủ so với cấu hình VM", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "qm start 105" }, output: "kvm: failed to allocate 32768 MiB: Cannot allocate memory\nstart failed: QEMU exited with code 1" },
      { match: { type: "exact", pattern: "free -h" }, output: "              total        used        free\nMem:            62Gi        46Gi        16Gi" },
    ],
    hints: ["Đọc kỹ thông báo lỗi khi start VM thất bại.", "Kiểm tra RAM khả dụng thực tế trên host bằng free -h.", "So sánh RAM VM yêu cầu với RAM host còn trống."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "EASY",
    title: "VM không boot được do đĩa snapshot đầy",
    context:
      "Một VM đang chạy đột ngột đóng băng rồi không thể khởi động lại, kỹ sư phát hiện VM này có nhiều snapshot cũ chưa từng được dọn.",
    symptoms: ["VM bị treo rồi tự tắt khi đang chạy", "Thử start lại VM báo lỗi không thể ghi vào disk"],
    filesystem: [],
    services: [{ name: "pve-vm-112", status: "stopped" }],
    logs: { "qm start 112": ["TASK ERROR: could not open disk image: No space left on device"] },
    rootCauseSummary: "Thư mục lưu trữ snapshot của VM đã đầy do tích lũy nhiều snapshot cũ không được xoá.",
    rootCauseExplanation:
      "VM có 6 snapshot được tạo trong nhiều tháng qua trước mỗi lần update, không có snapshot nào bị xoá sau khi xác nhận update thành công. Mỗi snapshot giữ lại các block thay đổi (copy-on-write), khiến dung lượng thực tế sử dụng tăng dần vượt xa kích thước đĩa khai báo, tới khi storage backend báo hết dung lượng và VM không thể ghi thêm dữ liệu để boot.",
    requiredFindings: ["storage lưu VM báo hết dung lượng khi start", "nguyên nhân là tích lũy nhiều snapshot cũ chưa dọn chiếm hết dung lượng"],
    rubric: [
      { criterion: "Xác định đúng lỗi liên quan tới dung lượng storage", weight: 40 },
      { criterion: "Liên hệ đúng với việc tích lũy snapshot cũ là nguyên nhân", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "qm listsnapshot 112" }, output: "snap1 2026-04-01\nsnap2 2026-05-01\nsnap3 2026-06-01\nsnap4 2026-07-01\nsnap5 2026-08-01\nsnap6 2026-09-01" },
      { match: { type: "exact", pattern: "pvesm status" }, output: "local-lvm    lvmthin   active  500G  499.8G  0.2G" },
    ],
    hints: ["Kiểm tra dung lượng trống của storage chứa VM.", "Liệt kê snapshot hiện có của VM — snapshot lâu ngày không dọn là nguyên nhân phổ biến gây đầy đĩa.", "Snapshot copy-on-write chiếm dung lượng tăng dần theo thời gian, không phải dung lượng cố định."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "EASY",
    title: "VM mất kết nối mạng do chưa gắn bridge network",
    context:
      "Một VM mới tạo khởi động thành công, đăng nhập console được nhưng không có kết nối mạng ra ngoài, không xin được IP.",
    symptoms: ["Console VM truy cập được bình thường", "ip addr trong VM không nhận được địa chỉ IP nào ngoài loopback"],
    filesystem: [],
    services: [{ name: "pve-vm-120", status: "running" }],
    logs: { "qm config 120": ["net0: virtio=XX:XX:XX:XX:XX:XX (chưa gán bridge, trống)"] },
    rootCauseSummary: "Network interface của VM chưa được gắn vào bridge nào trên host (net0 thiếu tham số bridge).",
    rootCauseExplanation:
      "Khi tạo VM, kỹ sư bỏ qua bước chọn bridge network (vmbr0) ở phần cấu hình network, để mặc định trống. VM vẫn khởi động và có network interface ảo (virtio) nhưng interface đó không được kết nối vào bất kỳ bridge vật lý nào trên host, nên không có đường ra ngoài để xin DHCP hay giao tiếp mạng.",
    requiredFindings: ["cấu hình VM cho thấy net0 chưa gán bridge", "nguyên nhân là thiếu bước gắn network interface vào bridge vmbr0 khi tạo VM"],
    rubric: [
      { criterion: "Kiểm tra cấu hình network của VM qua qm config", weight: 50 },
      { criterion: "Xác định đúng thiếu bridge là nguyên nhân mất kết nối mạng", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "qm config 120" }, output: "net0: virtio=AA:BB:CC:DD:EE:FF\nmemory: 4096\ncores: 2" },
    ],
    hints: ["Kiểm tra cấu hình chi tiết của VM, chú ý phần network (net0).", "VM có thể chạy bình thường nhưng vẫn mất mạng nếu NIC ảo không gắn bridge.", "Trên Proxmox, NIC của VM cần được gán vào một bridge (thường là vmbr0) để có đường ra host network."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "MEDIUM",
    title: "Hiệu năng VM giảm mạnh do overcommit CPU quá mức",
    context:
      "Nhiều VM trên cùng một host vật lý đột ngột chạy chậm hẳn vào giờ cao điểm, dù CPU usage trong từng VM báo không cao.",
    symptoms: ["Ứng dụng trong VM phản hồi chậm bất thường giờ cao điểm", "top trong VM cho thấy %CPU không cao nhưng %steal time tăng cao"],
    filesystem: [],
    services: [],
    logs: { "top (trong VM)": ["%Cpu(s): 12.0 us, 3.1 sy, 0.0 ni, 60.2 id, 0.0 wa, 0.0 hi, 0.0 si, 24.7 st"] },
    rootCauseSummary: "Host bị overcommit vCPU quá mức (tổng vCPU các VM lớn hơn nhiều lần số core vật lý), gây CPU steal time cao.",
    rootCauseExplanation:
      "Host có 16 core vật lý nhưng tổng vCPU được cấp cho tất cả các VM cộng lại lên tới 64 vCPU (tỷ lệ overcommit 4:1), vượt xa mức khuyến nghị an toàn (thường 2:1 đến 3:1 tuỳ workload). Vào giờ cao điểm khi nhiều VM cùng cần CPU, hypervisor phải chia sẻ (schedule) thời gian CPU vật lý giữa các VM, khiến mỗi VM phải 'chờ' tới lượt — thể hiện qua %steal time cao trong chính VM đó, dù bản thân tiến trình trong VM không hề bận.",
    requiredFindings: ["%steal time trong VM tăng cao vào giờ cao điểm", "nguyên nhân là host bị overcommit vCPU quá mức so với số core vật lý"],
    rubric: [
      { criterion: "Nhận diện đúng %steal time là chỉ số then chốt để chẩn đoán", weight: 50 },
      { criterion: "Tính toán và kết luận đúng tỷ lệ overcommit vượt ngưỡng an toàn", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "top (trong VM)" }, output: "%Cpu(s): 12.0 us, 3.1 sy, 0.0 ni, 60.2 id, 0.0 wa, 0.0 hi, 0.0 si, 24.7 st" },
      { match: { type: "exact", pattern: "qm list" }, output: "VMID  vCPU   Status\n101   8      running\n102   16     running\n103   16     running\n104   24     running\n(host có 16 core vật lý, tổng 64 vCPU)" },
    ],
    hints: ["Chỉ số %steal (st) trong top của VM thể hiện thời gian VM phải chờ CPU vật lý.", "Tính tổng vCPU đã cấp cho tất cả VM trên host, so với số core vật lý thực tế.", "Tỷ lệ overcommit vCPU:pCPU quá cao (ví dụ trên 4:1) dễ gây tranh chấp CPU giờ cao điểm."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "MEDIUM",
    title: "Cụm Proxmox mất quorum sau khi một node reboot",
    context:
      "Cụm Proxmox gồm 3 node, sau khi một node được bảo trì và reboot, toàn bộ cụm báo lỗi không quản lý được VM dù 2 node còn lại vẫn online.",
    symptoms: ["Web UI Proxmox báo lỗi 'no quorum' trên cả 2 node còn lại", "Không thể migrate hay start/stop VM qua giao diện cluster"],
    filesystem: [],
    services: [{ name: "pve-cluster", status: "failed" }],
    logs: { "pvecm status": ["Quorum information", "------------------", "Expected votes: 3", "Highest expected: 3", "Total votes: 2", "Quorum: 2  Activity blocked"] },
    rootCauseSummary: "Cụm tạm thời mất quorum vì chỉ còn 2/3 vote trong lúc node thứ 3 đang reboot — đúng theo cơ chế an toàn của Proxmox cluster.",
    rootCauseExplanation:
      "Proxmox cluster dùng cơ chế quorum (quá bán số vote) để tránh split-brain: với 3 node, cần tối thiểu 2 vote để cụm hoạt động bình thường. Về lý thuyết 2/3 vẫn đủ quorum (2 >= ceil(3/2)+... thực tế ngưỡng là 2), nhưng log ở đây cho thấy 'Activity blocked' nghĩa là trong khoảng thời gian node thứ 3 restart, kết nối corosync giữa 2 node còn lại cũng chập chờn (do cùng switch với node đang reboot), khiến cụm dao động quorum liên tục — cách xử lý đúng là đợi node thứ 3 lên lại hoàn toàn và kiểm tra ổn định mạng corosync, không phải can thiệp ép buộc quorum khi chưa rõ nguyên nhân mất kết nối tạm thời.",
    requiredFindings: ["pvecm status cho thấy cụm chỉ còn 2/3 vote và bị block", "nguyên nhân là node thứ 3 đang reboot/mất kết nối tạm thời, cần đợi phục hồi thay vì ép quorum"],
    rubric: [
      { criterion: "Đọc đúng thông tin quorum qua pvecm status", weight: 40 },
      { criterion: "Đưa ra hướng xử lý an toàn (đợi node phục hồi) thay vì ép buộc quorum liều lĩnh", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "pvecm status" }, output: "Quorum information\n------------------\nExpected votes: 3\nHighest expected: 3\nTotal votes: 2\nQuorum: 2  Activity blocked" },
      { match: { type: "exact", pattern: "pvecm nodes" }, output: "Nodeid Votes Name\n1 1 pve-node1 (local)\n2 1 pve-node2\n3 1 pve-node3 (offline)" },
    ],
    hints: ["Kiểm tra trạng thái quorum của cluster bằng pvecm status.", "Xác nhận node nào đang offline/vừa reboot bằng pvecm nodes.", "Việc ép buộc quorum (expected votes) khi chưa rõ nguyên nhân mất node có thể gây split-brain — cân nhắc kỹ trước khi làm."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "MEDIUM",
    title: "Di chuyển đĩa VM thất bại do định dạng storage không tương thích",
    context:
      "Kỹ sư cố gắng di chuyển (storage migration) một VM từ storage local-lvm sang storage NFS mới để chuẩn bị decommission node cũ, nhưng thao tác báo lỗi giữa chừng.",
    symptoms: ["Thao tác move disk báo lỗi và dừng giữa chừng", "VM vẫn chạy bình thường trên storage cũ, chưa bị ảnh hưởng"],
    filesystem: [],
    services: [],
    logs: { "qm move_disk 150 scsi0 nfs-storage": ["create full clone of drive scsi0 (local-lvm:vm-150-disk-0)", "TASK ERROR: unsupported format 'raw' for storage type 'nfs' with qcow2 preallocation requested"] },
    rootCauseSummary: "Storage NFS đích được cấu hình chỉ hỗ trợ định dạng qcow2 trong khi disk nguồn là raw (LVM thin), gây xung đột định dạng khi convert.",
    rootCauseExplanation:
      "local-lvm lưu disk VM ở định dạng raw (thin-provisioned qua LVM), còn storage NFS mới được cấu hình với content type giới hạn chỉ chấp nhận qcow2 cho một số tùy chọn preallocation cụ thể không khớp với cách Proxmox thực hiện full clone mặc định từ raw. Cần kiểm tra lại cấu hình storage NFS (mục Content/Format cho phép) hoặc chỉ định rõ --format khi move_disk để Proxmox convert đúng cách thay vì để mặc định.",
    requiredFindings: ["log báo lỗi 'unsupported format' khi move disk sang NFS", "nguyên nhân là xung đột định dạng disk raw nguồn với cấu hình storage NFS đích"],
    rubric: [
      { criterion: "Đọc đúng thông báo lỗi để xác định vấn đề liên quan định dạng disk", weight: 40 },
      { criterion: "Đề xuất hướng xử lý hợp lý (kiểm tra cấu hình storage/chỉ định format)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "qm move_disk 150 scsi0 nfs-storage" }, output: "create full clone of drive scsi0 (local-lvm:vm-150-disk-0)\nTASK ERROR: unsupported format 'raw' for storage type 'nfs' with qcow2 preallocation requested" },
      { match: { type: "exact", pattern: "pvesm status" }, output: "local-lvm    lvmthin   active\nnfs-storage  nfs       active (content: images, format: qcow2 only)" },
    ],
    hints: ["Đọc kỹ thông báo lỗi để xác định đây là vấn đề về định dạng (format), không phải dung lượng hay mạng.", "So sánh định dạng disk nguồn (local-lvm thường là raw) với định dạng storage đích hỗ trợ.", "Có thể cần chỉ định rõ --format khi move_disk hoặc điều chỉnh cấu hình content của storage NFS."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "HARD",
    title: "Lỗi xác thực AD hàng loạt từ các VM do lệch giờ sau sự cố cluster",
    context:
      "Sau một sự cố mất điện ảnh hưởng toàn bộ cụm ảo hoá, nhiều VM domain-joined báo lỗi xác thực Active Directory hàng loạt dù mật khẩu và cấu hình domain không đổi.",
    symptoms: ["Người dùng không đăng nhập được vào nhiều máy VM domain-joined", "Event log Windows báo lỗi Kerberos liên quan clock skew"],
    filesystem: [],
    services: [{ name: "w32time (trong VM)", status: "stopped" }],
    logs: { "w32tm /query /status (trong VM)": ["The service has not been started."] },
    rootCauseSummary: "Sau sự cố mất điện, các VM được khôi phục từ live migration/HA failover nhưng đồng hồ VM bị lệch do nguồn tham chiếu thời gian (host NTP) chưa ổn định, kết hợp dịch vụ w32time trong VM bị dừng không tự khởi động lại.",
    rootCauseExplanation:
      "Trong môi trường ảo hoá, VM thường đồng bộ giờ qua 2 kênh: tool đồng bộ của hypervisor (ví dụ qemu-guest-agent) và dịch vụ w32time nội bộ Windows đồng bộ với domain controller. Sau sự cố mất điện, cụm HA tự động khởi động lại hàng loạt VM gần như đồng thời khiến w32time service bị timeout khi cố gắng đồng bộ với domain controller (do chính DC cũng đang khởi động lại) và dừng hẳn thay vì retry. VM sau đó chạy với đồng hồ RTC ảo lệch dần, vượt ngưỡng chấp nhận của Kerberos (mặc định 5 phút) khiến xác thực domain thất bại hàng loạt dù mật khẩu hoàn toàn đúng.",
    requiredFindings: ["dịch vụ w32time trong các VM bị ảnh hưởng đang ở trạng thái dừng", "nguyên nhân gốc là đồng hồ VM lệch do w32time không tự phục hồi sau sự cố mất điện/HA failover hàng loạt"],
    rubric: [
      { criterion: "Liên hệ đúng lỗi Kerberos với vấn đề đồng bộ thời gian thay vì nghi ngờ sai mật khẩu/domain config", weight: 40 },
      { criterion: "Xác định đúng w32time bị dừng và giải thích hợp lý chuỗi sự kiện dẫn tới điều đó", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "w32tm /query /status (trong VM)" }, output: "The service has not been started." },
    ],
    hints: ["Lỗi Kerberos clock skew gợi ý vấn đề đồng bộ thời gian, không phải sai mật khẩu.", "Kiểm tra trạng thái dịch vụ đồng bộ giờ trong chính VM bị ảnh hưởng.", "Sự kiện nhiều VM khởi động lại gần như đồng thời sau sự cố điện/HA failover có thể làm gián đoạn chuỗi đồng bộ thời gian bình thường."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "HARD",
    title: "Live migration thất bại do không tương thích tập lệnh CPU giữa các host",
    context:
      "Cụm ảo hoá gồm nhiều host được mua ở các thời điểm khác nhau với CPU đời khác nhau. Live migration một VM từ host cũ sang host mới (được kỳ vọng mạnh hơn) liên tục thất bại giữa chừng, VM bị treo tạm thời rồi rollback về host cũ.",
    symptoms: ["Live migration báo lỗi và tự động rollback VM về host nguồn", "Chỉ xảy ra khi migrate sang một số host cụ thể, không phải tất cả"],
    filesystem: [],
    services: [],
    logs: { "qm migrate 130 pve-node5 --online": ["kvm: Features 0xbfebfbff vs 0x1fcbfbff: 'pdcm' not supported by target CPU", "TASK ERROR: migration failed"] },
    rootCauseSummary: "CPU của host đích thiếu một tập lệnh (CPU flag) mà VM đang dùng ở chế độ 'host passthrough', nên không thể tiếp tục thực thi sau khi chuyển trạng thái CPU sang host mới.",
    rootCauseExplanation:
      "VM được cấu hình CPU type là 'host' (passthrough toàn bộ tập lệnh CPU vật lý của host nguồn) để tối ưu hiệu năng, thay vì một CPU type chuẩn hoá (ví dụ qemu64, hoặc x86-64-v2-AES) tương thích giữa nhiều đời CPU khác nhau. Khi host nguồn và host đích dùng CPU đời khác nhau (thiếu một số flag như 'pdcm'), live migration không thể đảm bảo tính nhất quán trạng thái thực thi CPU giữa 2 máy vật lý khác tập lệnh, nên hypervisor từ chối hoàn tất migration để tránh crash VM giữa chừng.",
    requiredFindings: ["log migration báo lỗi liên quan tới CPU feature không được hỗ trợ ở host đích", "nguyên nhân là VM dùng CPU type 'host passthrough' không tương thích giữa các đời CPU khác nhau trong cụm"],
    rubric: [
      { criterion: "Đọc đúng log lỗi để xác định vấn đề nằm ở tập lệnh CPU, không phải mạng/storage", weight: 40 },
      { criterion: "Giải thích đúng nguyên nhân gốc liên quan cấu hình CPU type 'host' và đề xuất hướng khắc phục (CPU type chuẩn hoá)", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "qm migrate 130 pve-node5 --online" }, output: "kvm: Features 0xbfebfbff vs 0x1fcbfbff: 'pdcm' not supported by target CPU\nTASK ERROR: migration failed" },
      { match: { type: "exact", pattern: "qm config 130" }, output: "cpu: host\nmemory: 8192\ncores: 4" },
    ],
    hints: ["Lỗi chỉ xảy ra với một số host cụ thể gợi ý sự khác biệt phần cứng (CPU) giữa các host, không phải lỗi cấu hình chung.", "Kiểm tra cpu type của VM trong cấu hình — 'host' nghĩa là passthrough toàn bộ tập lệnh CPU vật lý.", "Để live migration an toàn giữa các host CPU khác đời, nên dùng một CPU type chuẩn hoá tương thích chung thay vì 'host'."],
  }),
  scenario({
    topicSlug: "virtualization",
    difficulty: "HARD",
    title: "Split-brain storage dùng chung khi failover NFS không hoàn tất",
    context:
      "Cụm ảo hoá dùng NFS storage dùng chung với cơ chế HA tự động chuyển NFS server sang node dự phòng khi node chính lỗi. Sau một sự cố mạng ngắn, một số VM báo lỗi disk corruption dù trước đó chưa từng xảy ra.",
    symptoms: ["Một vài VM báo lỗi filesystem corruption sau sự cố mạng ngắn", "Cả 2 node NFS (chính và dự phòng) đều tự nhận mình đang active cùng lúc trong khoảng 90 giây"],
    filesystem: [],
    services: [{ name: "nfs-ha-manager", status: "running" }],
    logs: { "nfs-ha-manager log": ["Node-A: promoted to ACTIVE (lost heartbeat to Node-B)", "Node-B: promoted to ACTIVE (lost heartbeat to Node-A)", "90s later: STONITH fencing Node-A triggered"] },
    rootCauseSummary: "Sự cố mạng ngắn khiến cả 2 node NFS mất heartbeat với nhau cùng lúc và đều tự promote lên ACTIVE (split-brain) trước khi cơ chế fencing (STONITH) kịp cô lập một bên, gây cả 2 node cùng ghi vào storage dùng chung.",
    rootCauseExplanation:
      "Cụm HA cho NFS storage dùng cơ chế heartbeat qua một đường mạng riêng để xác định node nào đang active. Sự cố mạng ngắn (90 giây) làm gián đoạn chính đường heartbeat đó (không phải đường network traffic chính của VM), khiến cả 2 node đồng thời cho rằng bên kia đã chết và tự promote lên ACTIVE — đây chính là tình huống split-brain kinh điển. Trong 90 giây đó, cả 2 node cùng có quyền ghi vào cùng một volume storage dùng chung, dẫn tới xung đột ghi dữ liệu và làm hỏng filesystem của các VM đang hoạt động I/O tại thời điểm đó. Cơ chế fencing (STONITH — Shoot The Other Node In The Head) cuối cùng cũng kích hoạt và cô lập Node-A, nhưng đã chậm hơn thời gian split-brain xảy ra.",
    requiredFindings: ["log HA manager cho thấy cả 2 node cùng tự promote ACTIVE trong cùng khoảng thời gian (split-brain)", "nguyên nhân là đường mạng heartbeat bị gián đoạn khiến cơ chế fencing không kịp ngăn cả 2 node cùng ghi storage"],
    rubric: [
      { criterion: "Nhận diện đúng hiện tượng split-brain từ log (cả 2 node cùng ACTIVE)", weight: 40 },
      { criterion: "Giải thích đúng chuỗi nguyên nhân: gián đoạn heartbeat → split-brain → fencing chậm → corruption", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "nfs-ha-manager log" }, output: "Node-A: promoted to ACTIVE (lost heartbeat to Node-B)\nNode-B: promoted to ACTIVE (lost heartbeat to Node-A)\n90s later: STONITH fencing Node-A triggered" },
    ],
    hints: ["Tìm trong log HA manager xem có thời điểm nào cả 2 node cùng tự nhận ACTIVE không.", "'Split-brain' xảy ra khi cơ chế heartbeat/fencing không đủ nhanh để ngăn 2 node cùng ghi dữ liệu.", "Phân biệt đường mạng heartbeat của cụm HA với đường mạng traffic chính — chúng có thể bị ảnh hưởng độc lập nhau."],
  }),
] as const;
