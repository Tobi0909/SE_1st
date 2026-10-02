import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("verify thành công với đúng mật khẩu", async () => {
    const hash = await hashPassword("Secret123!");
    await expect(verifyPassword("Secret123!", hash)).resolves.toBe(true);
  });

  it("verify thất bại với mật khẩu sai", async () => {
    const hash = await hashPassword("Secret123!");
    await expect(verifyPassword("WrongPassword", hash)).resolves.toBe(false);
  });

  it("hash không lưu plaintext", async () => {
    const hash = await hashPassword("Secret123!");
    expect(hash).not.toBe("Secret123!");
  });
});
