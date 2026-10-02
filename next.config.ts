import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Không dùng output "standalone": getLLMProvider() dùng dynamic import để chọn
   * provider theo env, file-tracing của standalone có thể bỏ sót 1 trong 2 provider.
   * Image chạy full node_modules — ổn với quy mô nội bộ 4-10 người. */
};

export default nextConfig;
