import { scenario } from "./types";

export const networkingScenarios = [
  scenario({
    topicSlug: "networking",
    difficulty: "EASY",
    title: "Không truy cập được internet do sai DNS resolver",
    context:
      "Một máy chủ mới được cấp phát trong mạng nội bộ không thể cập nhật package hay truy cập các dịch vụ ra ngoài bằng tên miền, dù ping theo IP vẫn thành công.",
    symptoms: ["ping 8.8.8.8 thành công nhưng ping google.com báo 'Name or service not known'", "apt update báo lỗi 'Temporary failure resolving'"],
    filesystem: [{ name: "/etc/resolv.conf", type: "file", content: "nameserver 10.99.99.99" }],
    services: [],
    logs: { "cat /etc/resolv.conf": ["nameserver 10.99.99.99"] },
    rootCauseSummary: "File /etc/resolv.conf trỏ tới một DNS server sai (10.99.99.99) không tồn tại trong mạng.",
    rootCauseExplanation:
      "Máy được cấp phát từ template cũ có nameserver cứng sai, không khớp với DNS nội bộ thật (10.0.0.53). Vì resolver sai không phản hồi, mọi truy vấn phân giải tên miền đều timeout trong khi kết nối theo IP (ping 8.8.8.8) vẫn hoạt động bình thường vì không cần DNS.",
    requiredFindings: ["ping theo IP thành công nhưng phân giải tên miền thất bại", "/etc/resolv.conf trỏ sai tới DNS server không tồn tại"],
    rubric: [
      { criterion: "Phân biệt được lỗi kết nối IP và lỗi phân giải DNS", weight: 40 },
      { criterion: "Xác định đúng nameserver sai trong resolv.conf", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "cat /etc/resolv.conf" }, output: "nameserver 10.99.99.99" },
      { match: { type: "exact", pattern: "ping -c 1 8.8.8.8" }, output: "64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=12.3 ms" },
    ],
    hints: ["Thử phân biệt lỗi theo IP và theo tên miền để khoanh vùng DNS.", "Kiểm tra nameserver cấu hình trong /etc/resolv.conf.", "So sánh với DNS nội bộ đúng mà các máy khác đang dùng."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "EASY",
    title: "Firewall chặn cổng 80 khiến web service không truy cập được",
    context:
      "Một web service mới deploy chạy đúng trên server (curl localhost:80 thành công) nhưng không ai từ mạng LAN truy cập được.",
    symptoms: ["curl http://localhost trên chính server thành công", "Từ máy khác trong LAN, curl tới IP server bị timeout"],
    filesystem: [],
    services: [{ name: "nginx", status: "running", port: 80 }],
    logs: { "ufw status": ["Status: active", "22/tcp    ALLOW   Anywhere"] },
    rootCauseSummary: "Firewall (ufw) đang active nhưng chưa có rule cho phép cổng 80, chỉ mở sẵn cổng 22.",
    rootCauseExplanation:
      "Server được hardening theo checklist bảo mật mặc định chỉ mở cổng SSH (22), còn cổng 80 của web service mới chưa được thêm vào allowlist của ufw, nên mọi kết nối từ bên ngoài tới cổng 80 bị firewall drop ở tầng hệ điều hành — service vẫn chạy bình thường nên truy cập local qua localhost không bị ảnh hưởng.",
    requiredFindings: ["service nginx đang chạy bình thường trên cổng 80", "firewall (ufw) chưa có rule cho phép cổng 80"],
    rubric: [
      { criterion: "Loại trừ được nguyên nhân từ service (vì local truy cập được)", weight: 30 },
      { criterion: "Xác định đúng firewall thiếu rule cho cổng 80", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "ufw status" }, output: "Status: active\n\nTo                         Action      From\n--                         ------      ----\n22/tcp                     ALLOW       Anywhere" },
      { match: { type: "exact", pattern: "curl -I http://localhost" }, output: "HTTP/1.1 200 OK" },
    ],
    hints: ["Kiểm tra truy cập local trước để loại trừ lỗi ở service.", "Xem danh sách rule firewall đang áp dụng (ufw status).", "So sánh cổng service đang chạy với danh sách cổng được firewall cho phép."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "EASY",
    title: "Mất internet do default gateway cấu hình sai",
    context:
      "Một máy chủ mới cấu hình IP tĩnh có thể giao tiếp với các máy trong cùng subnet nhưng không ra được internet.",
    symptoms: ["ping tới máy khác cùng dải mạng LAN thành công", "ping ra ngoài internet (8.8.8.8) báo 'Network is unreachable'"],
    filesystem: [{ name: "/etc/netplan/01-netcfg.yaml", type: "file", content: "addresses: [10.0.5.20/24]\ngateway4: 10.0.5.1  # sai, gateway thật là 10.0.5.254" }],
    services: [],
    logs: { "ip route": ["10.0.5.0/24 dev eth0 proto kernel scope link src 10.0.5.20", "default via 10.0.5.1 dev eth0"] },
    rootCauseSummary: "Default gateway được cấu hình sai (10.0.5.1 thay vì 10.0.5.254 là gateway thật của subnet).",
    rootCauseExplanation:
      "Kỹ sư gõ nhầm địa chỉ gateway khi cấu hình IP tĩnh. Vì 10.0.5.1 không tồn tại/không phải router thật, mọi gói tin đi ra ngoài subnet (tới internet) bị drop ngay tại bước định tuyến, trong khi giao tiếp nội bộ cùng subnet không cần qua gateway nên vẫn hoạt động bình thường.",
    requiredFindings: ["giao tiếp cùng subnet hoạt động nhưng ra internet thất bại", "default gateway trong ip route trỏ sai địa chỉ"],
    rubric: [
      { criterion: "Dùng ip route để kiểm tra gateway đang cấu hình", weight: 50 },
      { criterion: "Xác định đúng gateway sai so với gateway thật của subnet", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "ip route" }, output: "10.0.5.0/24 dev eth0 proto kernel scope link src 10.0.5.20\ndefault via 10.0.5.1 dev eth0" },
      { match: { type: "exact", pattern: "ping -c 1 8.8.8.8" }, output: "connect: Network is unreachable" },
    ],
    hints: ["Kiểm tra bảng định tuyến bằng ip route.", "So sánh giao tiếp cùng subnet và ra ngoài subnet để khoanh vùng gateway.", "Hỏi admin mạng địa chỉ gateway chính xác của dải 10.0.5.0/24."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "MEDIUM",
    title: "Mất gói tin định kỳ qua VPN site-to-site do lệch MTU",
    context:
      "Kết nối VPN site-to-site giữa văn phòng và datacenter hoạt động tốt với các request nhỏ (ping, SSH) nhưng truyền file lớn hoặc tải trang nặng bị treo/đứt giữa chừng.",
    symptoms: ["ping qua VPN bình thường, SSH gõ lệnh ngắn OK", "Truyền file lớn hoặc load trang có ảnh nặng bị treo giữa chừng"],
    filesystem: [{ name: "/etc/ipsec.conf", type: "file", content: "conn site-to-site\n  mtu=1500 # không tính overhead encapsulation IPsec" }],
    services: [{ name: "strongswan", status: "running" }],
    logs: { "ping -M do -s 1472 remote-gateway": ["Frag needed and DF set (mtu = 1436)"] },
    rootCauseSummary: "MTU đường hầm VPN set cố định 1500 không trừ overhead đóng gói IPsec, gây fragment/black-hole với gói lớn.",
    rootCauseExplanation:
      "IPsec thêm overhead header (ESP/AH) vào mỗi gói tin, nên MTU thực tế qua tunnel thường chỉ còn khoảng 1436-1460 byte dù interface khai 1500. Gói nhỏ (ping, lệnh SSH ngắn) không chạm ngưỡng nên vẫn đi qua bình thường; gói lớn (file, hình ảnh) bị phân mảnh hoặc bị drop nếu router trung gian chặn ICMP 'fragmentation needed' (PMTUD black hole), gây treo kết nối giữa chừng mà không có lỗi rõ ràng.",
    requiredFindings: ["gói tin nhỏ qua VPN bình thường nhưng gói lớn bị treo/drop", "nguyên nhân là MTU tunnel không tính overhead IPsec, cần giảm MTU hoặc bật MSS clamping"],
    rubric: [
      { criterion: "Dùng ping với cờ -M do -s để xác định ngưỡng MTU thực tế gây lỗi", weight: 50 },
      { criterion: "Giải thích đúng cơ chế overhead IPsec làm giảm MTU hiệu dụng", weight: 50 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "ping -M do -s 1472 remote-gateway" }, output: "From 10.0.5.1 icmp_seq=1 Frag needed and DF set (mtu = 1436)" },
      { match: { type: "exact", pattern: "ipsec statusall" }, output: "site-to-site: ESTABLISHED, IKEv2, ESP in UDP" },
    ],
    hints: ["Gói nhỏ chạy tốt nhưng gói lớn treo là dấu hiệu kinh điển của vấn đề MTU/PMTUD.", "Thử ping với cờ -M do -s để dò đúng MTU tối đa không bị fragment.", "IPsec luôn có overhead encapsulation, MTU hiệu dụng phải nhỏ hơn 1500."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "MEDIUM",
    title: "Thiết bị mới không lấy được IP do cạn pool DHCP",
    context:
      "Phòng IT vừa cấp thêm 30 laptop mới cho nhân viên, nhưng một số thiết bị báo lỗi không kết nối được mạng Wi-Fi dù nhập đúng mật khẩu.",
    symptoms: ["Một số laptop mới không nhận được địa chỉ IP (self-assigned 169.254.x.x)", "Thiết bị cũ kết nối vẫn bình thường"],
    filesystem: [],
    services: [{ name: "isc-dhcp-server", status: "running" }],
    logs: {
      "journalctl -u isc-dhcp-server -n 5": ["DHCPDISCOVER from 3c:22:fb:aa:bb:cc via eth0: network 10.0.20.0/24: no free leases"],
    },
    rootCauseSummary: "Dải địa chỉ DHCP pool (10.0.20.100-10.0.20.200, 100 địa chỉ) đã cấp hết, không còn lease trống cho thiết bị mới.",
    rootCauseExplanation:
      "Văn phòng tăng trưởng nhân sự nhanh nhưng dải DHCP pool chưa được mở rộng tương ứng, lại cộng thêm lease time dài (24h) khiến các IP của thiết bị cũ không hoạt động (laptop tắt, không renew) vẫn bị giữ cho tới khi hết hạn. Khi pool cạn, DHCPDISCOVER của thiết bị mới không được phản hồi OFFER, client tự gán IP APIPA (169.254.x.x) và không có kết nối mạng thật.",
    requiredFindings: ["log DHCP server báo 'no free leases'", "nguyên nhân là pool DHCP không đủ địa chỉ, cần mở rộng dải hoặc giảm lease time"],
    rubric: [
      { criterion: "Nhận diện đúng dấu hiệu self-assigned IP (169.254.x.x) liên quan tới DHCP", weight: 30 },
      { criterion: "Tìm đúng log 'no free leases' và đề xuất hướng khắc phục hợp lý", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "journalctl -u isc-dhcp-server -n 5" }, output: "DHCPDISCOVER from 3c:22:fb:aa:bb:cc via eth0: network 10.0.20.0/24: no free leases" },
      { match: { type: "exact", pattern: "cat /etc/dhcp/dhcpd.conf" }, output: "subnet 10.0.20.0 netmask 255.255.255.0 {\n  range 10.0.20.100 10.0.20.200;\n  default-lease-time 86400;\n}" },
    ],
    hints: ["Địa chỉ dạng 169.254.x.x là dấu hiệu thiết bị không xin được DHCP.", "Kiểm tra log DHCP server để xem lý do request bị từ chối.", "Tính xem dải pool hiện tại có đủ địa chỉ cho tổng số thiết bị không."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "MEDIUM",
    title: "Kết nối bị reset do định tuyến bất đối xứng qua firewall stateful",
    context:
      "Sau khi thêm một tuyến mạng dự phòng (ISP thứ 2) cho outbound traffic, một số session TCP tới dịch vụ bên ngoài bị reset ngẫu nhiên dù băng thông vẫn ổn định.",
    symptoms: ["Kết nối TCP tới API bên ngoài thỉnh thoảng bị RST giữa chừng", "Traceroute cho thấy đường đi và đường về khác nhau qua 2 ISP"],
    filesystem: [],
    services: [{ name: "firewall-fw1", status: "running" }],
    logs: { "fw1 log drop": ["DROP: TCP state INVALID, ACK received for connection not in state table (asymmetric path)"] },
    rootCauseSummary: "Traffic đi ra qua ISP A nhưng traffic về lại đi qua ISP B (do routing không đối xứng), khiến firewall stateful không nhận diện được session nên drop gói ACK hợp lệ.",
    rootCauseExplanation:
      "Firewall stateful theo dõi session dựa trên luồng gói đi và về cùng một thiết bị. Khi thêm ISP thứ 2 mà không cấu hình policy-based routing nhất quán, một số session có gói đi (SYN) qua ISP A nhưng gói về (SYN-ACK/ACK) lại được route qua ISP B do load-balancing theo route mặc định — firewall ở nhánh B không có state cho session đó nên coi là gói không hợp lệ và drop, khiến client nhận timeout hoặc RST.",
    requiredFindings: ["log firewall cho thấy gói bị drop do 'state not in table' liên quan asymmetric routing", "nguyên nhân là đường đi và đường về traffic đi qua 2 ISP khác nhau"],
    rubric: [
      { criterion: "Phát hiện đường đi/về không đối xứng qua traceroute hai chiều", weight: 40 },
      { criterion: "Liên hệ đúng với cơ chế firewall stateful từ chối gói không có state", weight: 60 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "fw1 log drop" }, output: "DROP: TCP state INVALID, ACK received for connection not in state table (asymmetric path)" },
    ],
    hints: ["Kiểm tra xem đường đi và đường về của traffic có đi qua cùng một gateway/ISP không.", "Firewall stateful chỉ chấp nhận gói thuộc session đã có state — asymmetric routing phá vỡ điều đó.", "Cân nhắc policy-based routing để đảm bảo traffic cùng session đi/về cùng một ISP."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "HARD",
    title: "Route leak BGP gây gián đoạn mạng từng đợt",
    context:
      "Doanh nghiệp có 2 uplink BGP tới 2 ISP khác nhau cho mục đích dự phòng. Gần đây xảy ra tình trạng mất kết nối internet từng đợt 5-10 phút, lặp lại vài lần mỗi ngày không theo quy luật rõ ràng.",
    symptoms: ["Mất kết nối internet từng đợt ngắn, tự phục hồi sau vài phút", "Trong lúc sự cố, một số traffic đi vòng qua đường không tối ưu (độ trễ tăng vọt)"],
    filesystem: [],
    services: [{ name: "bgpd", status: "running" }],
    logs: {
      "show bgp neighbor summary": ["ISP-A  AS65001   Established   143021 prefixes", "ISP-B  AS65002   Flapping      resets 12 trong 1h qua"],
    },
    rootCauseSummary: "Router phía ISP-B bị flap (reset session BGP liên tục) do một router downstream của khách hàng khác vô tình re-advertise toàn bộ bảng định tuyến internet (route leak), gây quá tải bộ nhớ router biên.",
    rootCauseExplanation:
      "Một khách hàng khác của ISP-B cấu hình sai router CPE, vô tình học và quảng bá lại (re-advertise) một phần lớn bảng BGP internet ra ngoài thay vì chỉ các prefix của chính họ (thiếu route-map/prefix-list lọc outbound). Khi route leak này lan tới router biên của ISP-B, bảng định tuyến phình to đột ngột vượt khả năng xử lý, khiến BGP session với doanh nghiệp bị reset (flap) từng đợt cho tới khi ISP phát hiện và chặn route leak ở phía họ.",
    requiredFindings: ["BGP session với ISP-B liên tục flap/reset trong log", "nguyên nhân là route leak từ một khách hàng khác của ISP gây quá tải router biên"],
    rubric: [
      { criterion: "Xác định đúng BGP session nào đang flap qua show bgp neighbor summary", weight: 30 },
      { criterion: "Suy luận hợp lý về route leak là nguyên nhân gốc (không chỉ dừng ở 'ISP lỗi')", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "show bgp neighbor summary" }, output: "Neighbor       AS       State          Prefixes\nISP-A      65001   Established    143021\nISP-B      65002   Flapping       resets 12 in 1h" },
    ],
    hints: ["Đợt mất kết nối ngắn, tự phục hồi gợi ý một session động (như BGP) đang bị flap chứ không phải đứt cáp vật lý.", "Kiểm tra trạng thái từng BGP neighbor riêng biệt để khoanh vùng ISP nào gây vấn đề.", "Route leak (quảng bá nhầm toàn bộ bảng định tuyến) là nguyên nhân phổ biến gây quá tải và flap session BGP diện rộng."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "HARD",
    title: "Bão broadcast do vòng lặp VLAN sau khi đấu nhầm cáp",
    context:
      "Toàn bộ mạng LAN một tầng văn phòng đột ngột chậm nghiêm trọng, nhiều máy mất kết nối hoàn toàn ngay sau khi đội facility lắp thêm một switch nhỏ để mở rộng cổng mạng.",
    symptoms: ["CPU các switch trong VLAN tăng vọt gần 100%", "Đèn link trên switch nhấp nháy liên tục dù không có traffic thực sự lớn"],
    filesystem: [],
    services: [],
    logs: {
      "show spanning-tree summary": ["VLAN0010  Spanning tree disabled!", "Port Gi0/5 and Gi0/7 both connected to new unmanaged switch"],
    },
    rootCauseSummary: "Switch không quản lý (unmanaged) mới lắp bị đấu cả 2 đầu cáp vào cùng VLAN trên switch chính, tạo vòng lặp Layer 2 trong khi STP đang bị tắt trên VLAN đó.",
    rootCauseExplanation:
      "Đội facility vô tình cắm cả 2 cổng của switch unmanaged mới vào 2 cổng khác nhau trên cùng switch chính (để 'cho chắc' có backup), tạo thành một vòng lặp vật lý. Bình thường Spanning Tree Protocol (STP) sẽ tự động block 1 trong 2 đường để phá vòng lặp, nhưng VLAN0010 đã bị tắt STP từ trước (do một thay đổi cấu hình cũ không ai nhớ lý do), nên khung broadcast/ARP cứ lặp vô hạn qua vòng lặp này, nhân bản theo cấp số nhân và làm nghẽn hoàn toàn băng thông VLAN (broadcast storm).",
    requiredFindings: ["STP đang bị tắt trên VLAN liên quan", "nguyên nhân là vòng lặp vật lý từ switch mới lắp kết hợp với STP bị tắt gây broadcast storm"],
    rubric: [
      { criterion: "Liên hệ đúng CPU switch tăng vọt + link nhấp nháy với broadcast storm", weight: 30 },
      { criterion: "Xác định đúng nguyên nhân gốc: vòng lặp vật lý + STP bị tắt trên VLAN", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "show spanning-tree summary" }, output: "VLAN0010  Spanning tree disabled!\nPort Gi0/5 and Gi0/7 both connected to new unmanaged switch" },
    ],
    hints: ["CPU switch tăng vọt bất thường kèm link nhấp nháy liên tục là dấu hiệu kinh điển của broadcast storm.", "Kiểm tra trạng thái Spanning Tree trên VLAN bị ảnh hưởng.", "Thiết bị mới lắp gần đây luôn là nghi phạm đầu tiên — kiểm tra sơ đồ đấu nối vật lý của nó."],
  }),
  scenario({
    topicSlug: "networking",
    difficulty: "HARD",
    title: "Bắt tay TLS thất bại do thiếu chứng chỉ trung gian",
    context:
      "Sau khi gia hạn chứng chỉ SSL cho một API nội bộ, trình duyệt desktop truy cập bình thường, nhưng nhiều ứng dụng mobile và một số thư viện HTTP client server-to-server lại báo lỗi không xác thực được chứng chỉ.",
    symptoms: ["Trình duyệt Chrome/Firefox truy cập API bình thường, khóa xanh hợp lệ", "curl từ server khác báo 'unable to get local issuer certificate'"],
    filesystem: [{ name: "/etc/nginx/ssl/api.crt", type: "file", content: "-----BEGIN CERTIFICATE-----\n(chỉ chứa leaf certificate, thiếu intermediate CA)\n-----END CERTIFICATE-----" }],
    services: [{ name: "nginx", status: "running", port: 443 }],
    logs: { "openssl s_client -connect api.internal:443 -showcerts": ["Certificate chain", " 0 s:CN = api.internal", "   (chỉ có 1 certificate trong chain, thiếu CA trung gian)"] },
    rootCauseSummary: "File chứng chỉ mới deploy chỉ chứa leaf certificate, thiếu chứng chỉ CA trung gian (intermediate) trong chain.",
    rootCauseExplanation:
      "Khi gia hạn, kỹ sư chỉ copy file .crt gốc mà quên nối (cat) thêm intermediate CA certificate vào cùng file như lần cấu hình trước. Trình duyệt hiện đại thường có sẵn cache/khả năng tự tải intermediate certificate còn thiếu (AIA fetching) nên vẫn hiển thị hợp lệ, nhưng các HTTP client nghiêm ngặt hơn (curl, nhiều SDK mobile, thư viện server-to-server) không tự bù đắp được chain thiếu này, nên từ chối xác thực với lỗi 'unable to get local issuer certificate'.",
    requiredFindings: ["openssl s_client cho thấy chain chỉ có 1 certificate (thiếu intermediate)", "nguyên nhân là file cert deploy thiếu chứng chỉ CA trung gian, cần nối đầy đủ full chain"],
    rubric: [
      { criterion: "Lý giải đúng vì sao trình duyệt OK nhưng client khác lỗi (khác biệt AIA fetching)", weight: 30 },
      { criterion: "Dùng openssl s_client -showcerts để xác nhận chain thiếu intermediate", weight: 70 },
    ],
    presetCommands: [
      { match: { type: "exact", pattern: "openssl s_client -connect api.internal:443 -showcerts" }, output: "Certificate chain\n 0 s:CN = api.internal\n   i:CN = Internal Issuing CA\n(chỉ 1 certificate, không có CA trung gian trong chain)" },
    ],
    hints: ["Trình duyệt có thể tự bù chain thiếu (AIA fetching) nên không phải nguồn tin cậy duy nhất để kiểm tra TLS.", "Dùng openssl s_client -showcerts để xem đầy đủ chain certificate server trả về.", "File certificate deploy production nên là full chain (leaf + intermediate), không chỉ leaf certificate."],
  }),
] as const;
