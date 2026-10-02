"use client";

import type { Terminal as XTerm } from "@xterm/xterm";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface LabTerminalHandle {
  writeLine: (text: string) => void;
}

interface LabTerminalProps {
  prompt?: string;
  initialLines?: string[];
  disabled?: boolean;
  onCommand: (command: string) => Promise<string>;
}

/**
 * Terminal mô phỏng dựng trên xterm.js — KHÔNG có PTY thật phía sau, chỉ tự đọc từng ký tự
 * tới Enter rồi gọi `onCommand`. Không hỗ trợ điều hướng lịch sử bằng phím mũi tên hay các
 * escape sequence phức tạp — đủ cho một dòng lệnh đơn giản của bài lab.
 */
export const LabTerminal = forwardRef<LabTerminalHandle, LabTerminalProps>(function LabTerminal(
  { prompt = "$ ", initialLines = [], disabled = false, onCommand },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const bufferRef = useRef("");
  const busyRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useImperativeHandle(ref, () => ({
    writeLine(text: string) {
      termRef.current?.writeln(text);
    },
  }));

  useEffect(() => {
    let disposed = false;
    let term: XTerm | undefined;
    let resizeObserver: ResizeObserver | undefined;

    function appendPrintable(t: XTerm, chunk: string) {
      const printable = [...chunk].filter((ch) => ch >= " " && ch <= "~").join("");
      if (printable) {
        bufferRef.current += printable;
        t.write(printable);
      }
    }

    function submitCommand(t: XTerm) {
      const command = bufferRef.current;
      bufferRef.current = "";
      t.write("\r\n");

      if (command.trim().length === 0) {
        t.write(prompt);
        return;
      }

      busyRef.current = true;
      onCommandRef
        .current(command)
        .then((output) => {
          if (output) t.writeln(output);
        })
        .catch((err: unknown) => {
          t.writeln(`[lỗi] ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          t.write(prompt);
          busyRef.current = false;
        });
    }

    function handleData(t: XTerm, data: string) {
      if (busyRef.current || disabledRef.current) return;

      if (data.includes("\r")) {
        const [before] = data.split("\r");
        appendPrintable(t, before);
        submitCommand(t);
        return;
      }
      if (data === "\x7f") {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          t.write("\b \b");
        }
        return;
      }
      if (data === "\x03") {
        bufferRef.current = "";
        t.write(`^C\r\n${prompt}`);
        return;
      }
      appendPrintable(t, data);
    }

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !containerRef.current) return;

      term = new Terminal({
        convertEol: true,
        fontSize: 13,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        cursorBlink: true,
        theme: { background: "#0a0a0a" },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term;

      resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(containerRef.current);

      for (const line of initialLines) term.writeln(line);
      term.write(prompt);

      term.onData((data) => handleData(term!, data));
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      term?.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khởi tạo terminal 1 lần khi mount
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[28rem] w-full overflow-hidden rounded-md border bg-[#0a0a0a] p-2"
    />
  );
});
