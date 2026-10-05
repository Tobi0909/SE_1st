import type { Difficulty } from "@/generated/prisma/client";

export interface CurriculumArea {
  title: string;
  summary: string;
}

export type TopicCurriculum = Record<Difficulty, CurriculumArea[]>;

/**
 * Khung kiến thức chuẩn cho mỗi chủ đề mẫu (seed), viết tay để đảm bảo độ bao phủ và chính
 * xác — KHÔNG để LLM tự nghĩ ra lúc runtime (xem ADR-005 trong docs/ARCHITECTURE.md).
 * Dùng để:
 *   - Sinh roadmap xác định (buildSkillTreeFromCurriculum trong skillTree.ts) — không gọi LLM.
 *   - Grounding prompt sinh quiz/lab (pickCurriculumAreas) — LLM vẫn sinh nội dung, nhưng
 *     được giao đúng mảng kiến thức cụ thể cần bao phủ thay vì tự do hoàn toàn.
 *
 * Chủ đề admin tự tạo thêm (ngoài danh sách seed) sẽ không có trong map này — các hàm dùng
 * CURRICULUM phải tự fallback về hành vi cũ (LLM tự do) khi `getCurriculum()` trả về `null`.
 */
export const CURRICULUM: Record<string, TopicCurriculum> = {
  linux: {
    EASY: [
      { title: "Điều hướng filesystem & lệnh cơ bản", summary: "ls, cd, pwd, cp, mv, rm, cat, less, find cơ bản." },
      { title: "Quyền file và owner", summary: "chmod, chown, umask, phân biệt user/group/other." },
      { title: "Quản lý process cơ bản", summary: "ps, top, kill, jobs, chạy nền (&), nohup." },
      { title: "Quản lý gói phần mềm cơ bản", summary: "apt/yum/dnf: install, update, remove, search." },
      { title: "Biến môi trường và shell profile", summary: "PATH, export, .bashrc/.profile, alias." },
      { title: "Redirect và pipe", summary: ">, >>, <, |, kết hợp lệnh với grep/sort/wc." },
      { title: "Thông tin hệ thống cơ bản", summary: "uname, df -h, du, free -h, uptime, whoami." },
      { title: "Quản lý user/group cơ bản", summary: "useradd, passwd, usermod, groups, /etc/passwd." },
    ],
    MEDIUM: [
      { title: "systemd quản lý service", summary: "systemctl start/stop/enable/status, viết unit file cơ bản." },
      { title: "Quản lý log hệ thống", summary: "journalctl, /var/log, logrotate cơ bản." },
      { title: "Mạng cơ bản trên Linux", summary: "ip addr, ip route, ss/netstat, ping, curl, resolv.conf." },
      { title: "Lập lịch tác vụ", summary: "crontab, cron syntax, systemd timer cơ bản." },
      { title: "Quản lý disk và filesystem", summary: "fdisk/parted, mkfs, mount/umount, /etc/fstab, LVM cơ bản." },
      { title: "Shell scripting cơ bản", summary: "biến, if/for/while, exit code, tham số dòng lệnh ($1, $@)." },
      { title: "SSH và truy cập từ xa", summary: "key-based auth, ssh-copy-id, ~/.ssh/config, scp/rsync cơ bản." },
      { title: "Swap và bộ nhớ", summary: "swapon/swapoff, free, ý nghĩa buffer/cache." },
      { title: "Firewall cơ bản trên Linux", summary: "iptables/nftables/firewalld/ufw: mở/chặn port cơ bản." },
    ],
    HARD: [
      { title: "Troubleshooting hiệu năng", summary: "load average, vmstat, iostat, strace, lsof, phân tích nghẽn tài nguyên." },
      { title: "systemd nâng cao", summary: "dependency (After/Requires), target, socket activation, cấu hình journald." },
      { title: "LVM và RAID nâng cao", summary: "snapshot, resize, thin provisioning, mdadm RAID cơ bản." },
      { title: "SELinux/AppArmor", summary: "chế độ enforcing/permissive, context, troubleshooting bị chặn bởi MAC." },
      { title: "Kernel tuning", summary: "sysctl, /proc, /sys, tối ưu tham số mạng/bộ nhớ qua kernel." },
      { title: "Network troubleshooting nâng cao trên Linux", summary: "tcpdump, traceroute, MTU, bonding, DNS resolution issue." },
      { title: "Bash scripting nâng cao", summary: "awk, sed, xargs, trap, hàm, xử lý lỗi set -e/-u." },
      { title: "Backup và khôi phục", summary: "rsync nâng cao, tar, chiến lược backup incremental/full." },
      { title: "Nền tảng container trên Linux", summary: "namespaces, cgroups — cơ chế cách ly mà Docker dựa vào." },
    ],
  },
  networking: {
    EASY: [
      { title: "Mô hình OSI/TCP-IP", summary: "7 tầng OSI vs 4 tầng TCP/IP, vai trò từng tầng." },
      { title: "Địa chỉ IP và subnet mask", summary: "IPv4, phân biệt network/host part, private vs public IP." },
      { title: "DNS cơ bản", summary: "A record, CNAME, cách trình duyệt phân giải tên miền." },
      { title: "Giao thức và port phổ biến", summary: "HTTP/HTTPS, FTP, SSH, SMTP và port mặc định tương ứng." },
      { title: "Thiết bị mạng cơ bản", summary: "Phân biệt switch, router, hub, access point." },
      { title: "Công cụ kiểm tra kết nối cơ bản", summary: "ping, traceroute/tracert, ý nghĩa TTL." },
      { title: "MAC address và ARP", summary: "Vai trò MAC, ARP cache, ARP resolve trong cùng subnet." },
    ],
    MEDIUM: [
      { title: "Subnetting và CIDR", summary: "Tính subnet mask, số host khả dụng, VLSM cơ bản." },
      { title: "Routing cơ bản", summary: "Static route, default gateway, đọc routing table." },
      { title: "VLAN và trunking", summary: "802.1Q, access port vs trunk port, lợi ích phân đoạn mạng." },
      { title: "DHCP", summary: "DORA process, lease time, DHCP relay cơ bản." },
      { title: "DNS nâng cao", summary: "MX, TXT, PTR, forward/reverse lookup zone, TTL record." },
      { title: "TLS/SSL cơ bản", summary: "TLS handshake, certificate, lý do HTTPS an toàn hơn HTTP." },
      { title: "Firewall và ACL cơ bản", summary: "Stateful vs stateless, allow/deny rule, thứ tự xử lý rule." },
      { title: "NAT", summary: "SNAT/DNAT/PAT, vì sao cần NAT cho private IP ra Internet." },
    ],
    HARD: [
      { title: "Routing protocol động", summary: "Khái niệm OSPF/BGP, metric, hội tụ (convergence)." },
      { title: "Phân tích gói tin nâng cao", summary: "tcpdump/Wireshark, đọc TCP handshake, phát hiện retransmission." },
      { title: "Load balancing", summary: "L4 vs L7, thuật toán cân bằng tải, health check." },
      { title: "VPN", summary: "Site-to-site VPN, IPSec, khái niệm WireGuard." },
      { title: "QoS", summary: "Traffic shaping, prioritization, DSCP cơ bản." },
      { title: "Phân vùng mạng bảo mật", summary: "DMZ, network segmentation, zero trust network khái niệm." },
      { title: "Giám sát mạng", summary: "SNMP, NetFlow/sFlow khái niệm, dùng để phát hiện bất thường." },
      { title: "Troubleshooting độ trễ/mất gói", summary: "Phân biệt nguyên nhân latency, jitter, packet loss trong mạng thực tế." },
    ],
  },
  virtualization: {
    EASY: [
      { title: "Hypervisor Type 1 vs Type 2", summary: "Bare-metal (ESXi, Proxmox) vs hosted (VirtualBox, VMware Workstation)." },
      { title: "Tạo và quản lý VM cơ bản", summary: "Cấp CPU/RAM/disk/network adapter khi tạo VM." },
      { title: "Snapshot VM", summary: "Tạo, khôi phục, xoá snapshot; rủi ro khi giữ snapshot quá lâu." },
      { title: "Template và clone VM", summary: "Tạo template từ VM, clone full vs linked clone." },
      { title: "Quản lý ISO và cài OS", summary: "Mount ISO, cài OS cho VM mới, virtual CD/DVD." },
      { title: "Resource cấp cho VM", summary: "vCPU, RAM allocation, ý nghĩa overcommit ở mức cơ bản." },
    ],
    MEDIUM: [
      { title: "Storage cho VM", summary: "Datastore, thin vs thick provisioning, VMDK/qcow2." },
      { title: "Mạng ảo hoá", summary: "Virtual switch, port group, NAT/bridge network cho VM." },
      { title: "Resource pool và giới hạn tài nguyên", summary: "CPU/memory limit, reservation, share/priority." },
      { title: "Proxmox cluster cơ bản", summary: "Quản lý qua web UI/CLI (qm, pvesh), join node vào cluster." },
      { title: "vCenter và vMotion khái niệm", summary: "Quản lý tập trung nhiều host, di chuyển VM không downtime." },
      { title: "Backup VM", summary: "Backup snapshot-based, schedule backup, restore VM." },
    ],
    HARD: [
      { title: "High availability cluster", summary: "VMware HA, Proxmox HA: failover tự động khi host chết." },
      { title: "Live migration nâng cao", summary: "vMotion/storage vMotion, điều kiện tương thích CPU, shared storage." },
      { title: "Troubleshooting hiệu năng VM", summary: "CPU ready time, memory ballooning, swap, disk latency." },
      { title: "Software-defined storage", summary: "Ceph cơ bản tích hợp Proxmox, replication, OSD/monitor." },
      { title: "Networking ảo hoá nâng cao", summary: "SR-IOV, VLAN trunking trên vSwitch, NIC teaming." },
      { title: "Capacity planning", summary: "Tính overcommit ratio an toàn, dự báo nhu cầu tài nguyên cluster." },
    ],
  },
  container: {
    EASY: [
      { title: "Container vs VM", summary: "Khác biệt cách ly, tốc độ khởi động, chia sẻ kernel." },
      { title: "Docker cơ bản", summary: "Khái niệm image, container, Dockerfile tối giản (FROM/RUN/CMD/COPY)." },
      { title: "Lệnh Docker cơ bản", summary: "docker run/ps/stop/rm/logs/exec." },
      { title: "Docker registry cơ bản", summary: "docker pull/push, Docker Hub, image tag." },
      { title: "Vòng đời container", summary: "start/stop/restart/remove, docker stats xem resource usage." },
    ],
    MEDIUM: [
      { title: "Viết Dockerfile tối ưu", summary: "Multi-stage build, layer caching, giảm kích thước image." },
      { title: "Docker networking", summary: "bridge, host network, port mapping (-p)." },
      { title: "Docker volume", summary: "Bind mount vs named volume, data persistence." },
      { title: "Docker Compose cơ bản", summary: "Định nghĩa multi-container app bằng docker-compose.yml." },
      { title: "Kubernetes khái niệm cơ bản", summary: "Pod, Deployment, Service — vai trò từng loại object." },
      { title: "kubectl lệnh cơ bản", summary: "get, describe, logs, apply, delete." },
    ],
    HARD: [
      { title: "Kubernetes object nâng cao", summary: "ConfigMap/Secret, Ingress, PersistentVolume/PVC, Namespace." },
      { title: "Troubleshooting Pod", summary: "CrashLoopBackOff, resource limit OOMKilled, readiness/liveness probe." },
      { title: "Helm cơ bản", summary: "Chart, release, values.yaml, helm install/upgrade." },
      { title: "Bảo mật container", summary: "Image scanning, non-root user, resource quota, Pod Security Standard." },
      { title: "Networking Kubernetes nâng cao", summary: "Khái niệm CNI, NetworkPolicy giới hạn traffic giữa Pod." },
      { title: "Autoscaling và resource tuning", summary: "HPA, resource request/limit, ảnh hưởng tới scheduling." },
    ],
  },
  "monitoring-logging": {
    EASY: [
      { title: "Metric vs log vs trace", summary: "Phân biệt 3 loại observability data và mục đích dùng." },
      { title: "Zabbix cơ bản", summary: "Host, item, trigger — luồng dữ liệu cơ bản trong Zabbix." },
      { title: "Xem log cơ bản", summary: "tail -f, grep trên log file, phân biệt log level (INFO/WARN/ERROR)." },
      { title: "Giám sát resource hệ thống cơ bản", summary: "Theo dõi CPU/RAM/disk bằng công cụ hệ thống (top, df)." },
      { title: "Dashboard là gì", summary: "Đọc biểu đồ cơ bản, ý nghĩa trục thời gian và giá trị." },
    ],
    MEDIUM: [
      { title: "Prometheus cơ bản", summary: "Exporter, scrape config, PromQL truy vấn cơ bản." },
      { title: "Grafana dashboard cơ bản", summary: "Kết nối data source, tạo panel, biến dashboard cơ bản." },
      { title: "Zabbix nâng cao", summary: "Template, action, escalation, dependency giữa trigger." },
      { title: "Thiết kế alert cơ bản", summary: "Ngưỡng cảnh báo (threshold), severity, kênh thông báo." },
      { title: "Splunk cơ bản", summary: "Search cơ bản (SPL đơn giản), khái niệm index." },
      { title: "Log tập trung", summary: "syslog, rsyslog forward log về server tập trung." },
    ],
    HARD: [
      { title: "PromQL nâng cao", summary: "rate(), histogram_quantile, aggregation theo label." },
      { title: "Thiết kế alerting tránh alert fatigue", summary: "Khái niệm SLO/SLI, alert theo error budget thay vì ngưỡng cứng." },
      { title: "ELK/EFK stack", summary: "Elasticsearch, Logstash/Fluentd, Kibana — vai trò từng thành phần." },
      { title: "High availability cho hệ thống giám sát", summary: "Tránh điểm chết đơn (SPOF) cho chính hệ thống monitoring." },
      { title: "Capacity planning cho metric storage", summary: "Retention policy, cardinality cao gây tốn tài nguyên thế nào." },
      { title: "Distributed tracing cơ bản", summary: "Khái niệm trace/span, vì sao cần khi có microservices." },
    ],
  },
  "cicd-iac": {
    EASY: [
      { title: "Khái niệm CI/CD", summary: "Continuous Integration vs Continuous Deployment/Delivery." },
      { title: "Git cơ bản", summary: "commit, branch, merge, pull request, conflict cơ bản." },
      { title: "Infrastructure as Code là gì", summary: "Lợi ích so với cấu hình thủ công, khái niệm declarative." },
      { title: "Branching strategy cơ bản", summary: "Feature branch, main/master, trunk-based khái niệm." },
      { title: "Pipeline stage cơ bản", summary: "Build, test, deploy — thứ tự và mục đích từng stage." },
    ],
    MEDIUM: [
      { title: "Viết pipeline CI/CD cơ bản", summary: "GitHub Actions/GitLab CI/Jenkins: job, step, trigger." },
      { title: "Terraform cơ bản", summary: "Provider, resource, plan/apply, state file." },
      { title: "Ansible cơ bản", summary: "Playbook, inventory, module cơ bản, idempotency." },
      { title: "Build artifact và versioning", summary: "Đóng gói artifact, semantic versioning, container image trong pipeline." },
    ],
    HARD: [
      { title: "Terraform nâng cao", summary: "Module tái sử dụng, remote state, workspace, terraform import." },
      { title: "Ansible nâng cao", summary: "Role, handler, Ansible Vault quản lý secret." },
      { title: "Pipeline nâng cao", summary: "Multi-stage, approval gate thủ công, chiến lược rollback." },
      { title: "GitOps", summary: "Khái niệm ArgoCD/Flux — đồng bộ cluster theo state trong Git." },
      { title: "Secret management trong CI/CD", summary: "Khái niệm Vault, tránh hardcode secret trong pipeline/biến môi trường." },
      { title: "Chiến lược deploy an toàn", summary: "Blue-green, canary deployment, so sánh rủi ro/độ phức tạp." },
    ],
  },
  "security-hardening": {
    EASY: [
      { title: "Nguyên tắc least privilege", summary: "Chỉ cấp quyền tối thiểu cần thiết cho user/service." },
      { title: "Password policy và MFA", summary: "Độ phức tạp mật khẩu, lý do cần xác thực đa yếu tố." },
      { title: "Patch management cơ bản", summary: "Vì sao cần cập nhật bản vá định kỳ, rủi ro khi trì hoãn." },
      { title: "CVE và vulnerability là gì", summary: "Khái niệm lỗ hổng bảo mật, cách tra cứu CVE cơ bản." },
      { title: "Authentication vs Authorization", summary: "Phân biệt xác thực (ai) và phân quyền (được làm gì)." },
    ],
    MEDIUM: [
      { title: "Hardening SSH", summary: "Tắt root login, key-only auth, đổi port, fail2ban cơ bản." },
      { title: "Hardening firewall", summary: "Default deny, chỉ whitelist port cần thiết." },
      { title: "Quản lý user/quyền an toàn", summary: "sudo đúng cách, audit log hành động user." },
      { title: "Quản lý TLS/certificate", summary: "Let's Encrypt, gia hạn certificate, tránh certificate hết hạn." },
      { title: "Backup phục vụ bảo mật", summary: "Backup giúp phục hồi sau ransomware/sự cố, kiểm tra tính toàn vẹn." },
    ],
    HARD: [
      { title: "CIS Benchmark và hardening checklist", summary: "Áp dụng checklist chuẩn để hardening OS có hệ thống." },
      { title: "Audit log và phát hiện bất thường", summary: "auditd, fail2ban nâng cao, phát hiện hành vi đáng ngờ." },
      { title: "Vulnerability scanning", summary: "Khái niệm quét lỗ hổng định kỳ (Nessus/OpenVAS), xử lý kết quả quét." },
      { title: "Hardening container/Kubernetes", summary: "Pod Security Standard, image scanning, giới hạn capability." },
      { title: "Quy trình xử lý sự cố bảo mật", summary: "Các bước incident response cơ bản: phát hiện, cô lập, khắc phục, rút kinh nghiệm." },
      { title: "Zero trust cơ bản", summary: "Nguyên tắc 'không tin mặc định', xác thực lại ở mọi lớp truy cập." },
    ],
  },
};

export function getCurriculum(topicSlug: string): TopicCurriculum | null {
  return CURRICULUM[topicSlug] ?? null;
}
