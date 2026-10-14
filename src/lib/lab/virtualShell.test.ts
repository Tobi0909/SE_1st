import { describe, expect, it } from "vitest";

import { resolveVirtualShellCommand } from "@/lib/lab/virtualShell";
import type { SessionState } from "@/lib/lab/sessionState";

const state: SessionState = {
  services: {
    nginx: { status: "failed", port: 80, configPath: "/etc/nginx/nginx.conf" },
    sshd: { status: "running", port: 22 },
    cron: { status: "stopped" },
    redis: { status: "failed" },
  },
  files: {
    "/etc/nginx/nginx.conf": "server {\n  listen 80\n}",
    "/etc/nginx/sites-enabled/default": "server_name _;",
    "/var/log/app/app.log": "line1\nERROR boom\nline3\nline4\nline5",
  },
  logs: {
    "journalctl -u nginx -n 20": ["nginx.service: Main process exited", "Failed with result 'exit-code'"],
    "dmesg | grep -i 'killed process'": ["Out of memory: Killed process 8842 (java)"],
    dmesg: [
      "java invoked oom-killer: gfp_mask=0x140cca, order=0, oom_score_adj=0",
      "Out of memory: Killed process 8842 (java) total-vm:4200000kB",
    ],
    "journalctl -k -n 5": ["oom-kill:constraint=CONSTRAINT_NONE", "Out of memory: Killed process 8842 (java)"],
  },
};

describe("resolveVirtualShellCommand — file commands", () => {
  it("cat trả đúng nội dung file", () => {
    expect(resolveVirtualShellCommand("cat /etc/nginx/nginx.conf", state)).toBe(
      "server {\n  listen 80\n}",
    );
  });

  it("cat file không tồn tại báo lỗi kiểu bash", () => {
    expect(resolveVirtualShellCommand("cat /no/such/file", state)).toBe(
      "cat: /no/such/file: No such file or directory",
    );
  });

  it("ls liệt kê đúng entry trong thư mục (suy ra từ danh sách file path)", () => {
    const out = resolveVirtualShellCommand("ls /etc/nginx", state);
    expect(out.split("\n").sort()).toEqual(["nginx.conf", "sites-enabled/"]);
  });

  it("ls -la hoạt động như ls thường (bỏ qua flag)", () => {
    const out = resolveVirtualShellCommand("ls -la /etc/nginx", state);
    expect(out).toContain("nginx.conf");
  });

  it("ls thư mục rỗng/không tồn tại báo lỗi", () => {
    expect(resolveVirtualShellCommand("ls /khong/ton/tai", state)).toContain("cannot access");
  });

  it("head trả N dòng đầu", () => {
    expect(resolveVirtualShellCommand("head -n 2 /var/log/app/app.log", state)).toBe(
      "line1\nERROR boom",
    );
  });

  it("tail trả N dòng cuối", () => {
    expect(resolveVirtualShellCommand("tail -n 2 /var/log/app/app.log", state)).toBe(
      "line4\nline5",
    );
  });

  it("grep trực tiếp lọc đúng dòng khớp pattern", () => {
    expect(resolveVirtualShellCommand("grep ERROR /var/log/app/app.log", state)).toBe(
      "ERROR boom",
    );
  });
});

describe("resolveVirtualShellCommand — service commands", () => {
  it("systemctl status cho service failed", () => {
    const out = resolveVirtualShellCommand("systemctl status nginx", state);
    expect(out).toContain("● nginx.service");
    expect(out).toContain("failed (Result: exit-code)");
  });

  it("systemctl status cho service running", () => {
    const out = resolveVirtualShellCommand("systemctl status sshd", state);
    expect(out).toContain("active (running)");
  });

  it("systemctl status service không tồn tại", () => {
    expect(resolveVirtualShellCommand("systemctl status unknown-svc", state)).toContain(
      "could not be found",
    );
  });

  it("systemctl is-active trả đúng trạng thái", () => {
    expect(resolveVirtualShellCommand("systemctl is-active nginx", state)).toBe("failed");
    expect(resolveVirtualShellCommand("systemctl is-active sshd", state)).toBe("active");
    expect(resolveVirtualShellCommand("systemctl is-active cron", state)).toBe("inactive");
  });

  it("service <name> status alias hoạt động như systemctl status", () => {
    expect(resolveVirtualShellCommand("service nginx status", state)).toContain(
      "● nginx.service",
    );
  });
});

describe("resolveVirtualShellCommand — log commands", () => {
  it("journalctl -u <service> lấy đúng log đã ghi trong state", () => {
    const out = resolveVirtualShellCommand("journalctl -u nginx", state);
    expect(out).toContain("Main process exited");
  });

  it("journalctl -n giới hạn số dòng cuối", () => {
    const out = resolveVirtualShellCommand("journalctl -u nginx -n 1", state);
    expect(out).toBe("Failed with result 'exit-code'");
  });

  it("journalctl cho service không có log ghi sẵn nhưng status failed vẫn trả tóm tắt hợp lý", () => {
    const out = resolveVirtualShellCommand("journalctl -u redis", state);
    expect(out).toContain("redis.service");
  });

  it("journalctl cho service stopped và không có log ghi sẵn trả '-- No entries --'", () => {
    expect(resolveVirtualShellCommand("journalctl -u cron", state)).toBe("-- No entries --");
  });

  it("journalctl -u <service> không trả nhầm log của service khác", () => {
    const out = resolveVirtualShellCommand("journalctl -u cron", state);
    expect(out).not.toContain("nginx");
  });

  it("dmesg trả đúng log khi khớp key có sẵn", () => {
    const out = resolveVirtualShellCommand("dmesg", state);
    expect(out).toContain("Killed process 8842");
  });
});

describe("resolveVirtualShellCommand — network commands", () => {
  it("ss -tlnp liệt kê các service có port", () => {
    const out = resolveVirtualShellCommand("ss -tlnp", state);
    expect(out).toContain("0.0.0.0:80");
    expect(out).toContain("0.0.0.0:22");
    expect(out).toContain("nginx");
  });

  it("netstat hoạt động tương đương ss", () => {
    const out = resolveVirtualShellCommand("netstat -tlnp", state);
    expect(out).toContain("0.0.0.0:22");
  });
});

describe("resolveVirtualShellCommand — pipe với grep", () => {
  it("lọc output của cat qua grep", () => {
    const out = resolveVirtualShellCommand("cat /var/log/app/app.log | grep ERROR", state);
    expect(out).toBe("ERROR boom");
  });

  it("lọc output của journalctl qua grep -i", () => {
    const out = resolveVirtualShellCommand(
      "journalctl -u nginx | grep -i 'failed'",
      state,
    );
    expect(out).toBe("Failed with result 'exit-code'");
  });
});

describe("resolveVirtualShellCommand — sudo prefix", () => {
  it("bỏ qua 'sudo' và chạy lệnh như bình thường", () => {
    expect(resolveVirtualShellCommand("sudo cat /etc/nginx/nginx.conf", state)).toBe(
      "server {\n  listen 80\n}",
    );
  });

  it("bỏ qua 'sudo' kể cả khi có pipe grep theo sau", () => {
    const out = resolveVirtualShellCommand("sudo dmesg | grep -i oom", state);
    expect(out).toContain("oom-killer");
  });
});

describe("resolveVirtualShellCommand — journalctl -k / --grep", () => {
  it("journalctl -k đọc kernel ring buffer (cùng nguồn với dmesg)", () => {
    const out = resolveVirtualShellCommand("journalctl -k -n 5", state);
    expect(out).toContain("oom-kill:constraint");
  });

  it("journalctl --grep=PATTERN lọc inline không cần pipe", () => {
    const out = resolveVirtualShellCommand('journalctl -u nginx --grep="exit-code"', state);
    expect(out).toBe("Failed with result 'exit-code'");
  });

  it("dmesg --grep=PATTERN lọc inline không cần pipe", () => {
    const out = resolveVirtualShellCommand("dmesg --grep=oom-killer", state);
    expect(out).toContain("oom-killer");
    expect(out).not.toContain("Killed process");
  });
});

describe("resolveVirtualShellCommand — clear", () => {
  it("clear trả về rỗng (không throw, không báo unsupported)", () => {
    expect(resolveVirtualShellCommand("clear", state)).toBe("");
  });
});

describe("resolveVirtualShellCommand — echo & fallback", () => {
  it("echo trả lại đúng text", () => {
    expect(resolveVirtualShellCommand("echo hello world", state)).toBe("hello world");
  });

  it("lệnh không được hỗ trợ trả về thông báo hướng dẫn, không throw", () => {
    const out = resolveVirtualShellCommand("docker inspect some-container", state);
    expect(out).toContain("không được mô phỏng");
  });

  it("không bao giờ throw với input bất kỳ", () => {
    expect(() => resolveVirtualShellCommand("", state)).not.toThrow();
    expect(() => resolveVirtualShellCommand("   ", state)).not.toThrow();
    expect(() => resolveVirtualShellCommand("grep [invalid(regex", state)).not.toThrow();
  });
});
