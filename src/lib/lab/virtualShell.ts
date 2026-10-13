import type { ServiceStatus, SessionState } from "@/lib/lab/sessionState";

/**
 * Diễn giải một tập lệnh chẩn đoán Linux phổ biến trực tiếp từ SessionState (services/files/
 * logs), không gọi LLM — dùng làm fallback khi lệnh người dùng gõ không khớp preset nào của
 * scenario (xem matchPresetCommand trong terminalEngine.ts, luôn được thử trước). Chỉ hỗ trợ
 * một tập lệnh cố định; lệnh ngoài danh sách trả về thông báo hướng dẫn thay vì bịa output.
 */
export function resolveVirtualShellCommand(rawCommand: string, state: SessionState): string {
  const stages = splitPipes(rawCommand);
  if (stages.length === 0) return "";

  const first = evalStage(stages[0], state);
  if (first === null) return unsupportedMessage(rawCommand);

  let output = first;
  for (let i = 1; i < stages.length; i++) {
    output = applyGrepFilter(stages[i], output);
  }
  return output;
}

function unsupportedMessage(command: string): string {
  return (
    `bash: lệnh "${command}" không được mô phỏng trong môi trường lab này.\n` +
    "Hãy thử các lệnh gợi ý trong phần Gợi ý, hoặc các lệnh chẩn đoán cơ bản như: " +
    "cat <file>, ls <dir>, head/tail <file>, grep <pattern> <file>, " +
    "systemctl status <service>, journalctl -u <service>, ss -tlnp."
  );
}

// ---- tokenize / pipe splitting ----

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function splitPipes(command: string): string[] {
  const stages: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of command) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "|") {
      stages.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) stages.push(current.trim());
  return stages;
}

// ---- stage evaluation ----

function evalStage(stage: string, state: SessionState): string | null {
  const tokens = tokenize(stage);
  const [cmd, ...args] = tokens;
  if (!cmd) return null;

  switch (cmd) {
    case "cat":
      return handleCat(args, state);
    case "ls":
      return handleLs(args, state);
    case "head":
      return handleHeadTail(args, state, "head");
    case "tail":
      return handleHeadTail(args, state, "tail");
    case "grep":
      return handleGrepDirect(args, state);
    case "systemctl":
      return handleSystemctl(args, state);
    case "service":
      return handleServiceAlias(args, state);
    case "journalctl":
      return handleJournalctl(args, state, stage);
    case "dmesg":
      return handleDmesg(state, stage);
    case "ss":
    case "netstat":
      return handleSocketList(state);
    case "echo":
      return args.join(" ");
    default:
      return null;
  }
}

function firstPositional(args: string[]): string | undefined {
  return args.find((a) => !a.startsWith("-"));
}

// ---- file commands ----

function handleCat(args: string[], state: SessionState): string | null {
  const path = firstPositional(args);
  if (!path) return null;
  const content = state.files[path];
  if (content === undefined) return `cat: ${path}: No such file or directory`;
  return content;
}

function handleLs(args: string[], state: SessionState): string | null {
  const path = firstPositional(args) ?? "/";

  if (state.files[path] !== undefined) return path;

  const prefix = path.endsWith("/") ? path : `${path}/`;
  const entries = new Set<string>();
  for (const filePath of Object.keys(state.files)) {
    if (!filePath.startsWith(prefix)) continue;
    const rest = filePath.slice(prefix.length);
    if (!rest) continue;
    const segment = rest.split("/")[0];
    entries.add(rest.includes("/") ? `${segment}/` : segment);
  }
  if (entries.size === 0) return `ls: cannot access '${path}': No such file or directory`;
  return [...entries].sort().join("\n");
}

function handleHeadTail(args: string[], state: SessionState, mode: "head" | "tail"): string | null {
  let n = 10;
  let path: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && args[i + 1]) {
      n = Number.parseInt(args[i + 1], 10) || n;
      i++;
    } else if (/^-n\d+$/.test(args[i])) {
      n = Number.parseInt(args[i].slice(2), 10) || n;
    } else if (!args[i].startsWith("-")) {
      path = args[i];
    }
  }
  if (!path) return null;
  const content = state.files[path];
  if (content === undefined) return `${mode}: cannot open '${path}' for reading: No such file or directory`;
  const lines = content.split("\n");
  return (mode === "head" ? lines.slice(0, n) : lines.slice(-n)).join("\n");
}

function handleGrepDirect(args: string[], state: SessionState): string | null {
  const ignoreCase = args.includes("-i");
  const positional = args.filter((a) => !a.startsWith("-"));
  const [pattern, path] = positional;
  if (!pattern || !path) return null;
  const content = state.files[path];
  if (content === undefined) return `grep: ${path}: No such file or directory`;
  const lines = content.split("\n").filter((l) => matchPattern(l, pattern, ignoreCase));
  return lines.join("\n");
}

// ---- service commands ----

function handleSystemctl(args: string[], state: SessionState): string | null {
  const [sub, name] = args;
  if (!sub || !name) return null;
  if (sub === "status") return formatServiceStatus(name, state.services[name]);
  if (sub === "is-active") return formatIsActive(state.services[name]);
  return null;
}

function handleServiceAlias(args: string[], state: SessionState): string | null {
  const [name, sub] = args;
  if (!name || sub !== "status") return null;
  return formatServiceStatus(name, state.services[name]);
}

function formatServiceStatus(name: string, svc: SessionState["services"][string] | undefined): string {
  if (!svc) return `Unit ${name}.service could not be found.`;
  const lines = [`● ${name}.service`, "   Loaded: loaded", `   Active: ${formatActiveLine(svc.status)}`];
  if (svc.port) lines.push(`   (lắng nghe cổng ${svc.port})`);
  if (svc.configPath) lines.push(`   (config: ${svc.configPath})`);
  return lines.join("\n");
}

function formatActiveLine(status: ServiceStatus): string {
  if (status === "running") return "active (running)";
  if (status === "stopped") return "inactive (dead)";
  return "failed (Result: exit-code)";
}

function formatIsActive(svc: SessionState["services"][string] | undefined): string {
  if (!svc) return "unknown";
  if (svc.status === "running") return "active";
  if (svc.status === "failed") return "failed";
  return "inactive";
}

// ---- log commands ----

function handleJournalctl(args: string[], state: SessionState, rawStage: string): string | null {
  const uIdx = args.indexOf("-u");
  const service = uIdx !== -1 ? args[uIdx + 1] : undefined;
  const nIdx = args.indexOf("-n");
  const n = nIdx !== -1 && args[nIdx + 1] ? Number.parseInt(args[nIdx + 1], 10) : undefined;

  const matchedKey = findBestLogKey(state.logs, rawStage, service ? `-u ${service}` : undefined);
  if (matchedKey) {
    const lines = state.logs[matchedKey];
    return (n ? lines.slice(-n) : lines).join("\n");
  }

  if (service && state.services[service]) {
    const svc = state.services[service];
    if (svc.status === "failed") {
      return `-- No entries matching exactly, showing summary --\n${service}.service: Main process exited, code=exited, status=1/FAILURE`;
    }
    return "-- No entries --";
  }
  return null;
}

function handleDmesg(state: SessionState, rawStage: string): string | null {
  const matchedKey = findBestLogKey(state.logs, rawStage, "dmesg");
  if (!matchedKey) return null;
  return state.logs[matchedKey].join("\n");
}

function findBestLogKey(logs: Record<string, string[]>, rawStage: string, hint?: string): string | undefined {
  if (logs[rawStage]) return rawStage;
  const keys = Object.keys(logs);
  // Có hint (ví dụ "-u <service>") thì CHỈ khớp theo hint, không fallback lỏng theo tên lệnh
  // gốc — nếu không sẽ trả nhầm log của service khác chỉ vì cùng bắt đầu bằng "journalctl".
  if (hint) {
    const hintLower = hint.toLowerCase();
    return keys.find((k) => k.toLowerCase().includes(hintLower));
  }
  const baseCmd = rawStage.split(" ")[0];
  return keys.find((k) => k.startsWith(baseCmd));
}

// ---- network commands ----

function handleSocketList(state: SessionState): string {
  const entries = Object.entries(state.services).filter(([, s]) => s.port);
  const header = "State   Local Address:Port   Process";
  if (entries.length === 0) return `${header}\n(không có service nào đang lắng nghe cổng được ghi nhận)`;
  const rows = entries.map(([name, s]) => `LISTEN  0.0.0.0:${s.port}        ${name}`);
  return [header, ...rows].join("\n");
}

// ---- pipe filters ----

function applyGrepFilter(stage: string, input: string): string {
  const tokens = tokenize(stage);
  if (tokens[0] !== "grep") return input;
  const ignoreCase = tokens.includes("-i");
  const pattern = tokens.slice(1).filter((t) => !t.startsWith("-")).join(" ");
  if (!pattern) return input;
  return input
    .split("\n")
    .filter((l) => matchPattern(l, pattern, ignoreCase))
    .join("\n");
}

function matchPattern(line: string, pattern: string, ignoreCase: boolean): boolean {
  try {
    return new RegExp(pattern, ignoreCase ? "i" : "").test(line);
  } catch {
    return ignoreCase ? line.toLowerCase().includes(pattern.toLowerCase()) : line.includes(pattern);
  }
}
