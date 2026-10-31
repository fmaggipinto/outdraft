import { describe, expect, it, vi } from "vitest";
import { DISPATCH_URL, triggerModel } from "./triggerModel";

const at = (iso: string) => new Date(iso);

describe("triggerModel", () => {
  it("asks GitHub to run the Model job on main with the token", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const res = await triggerModel("tok", at("2026-11-01T10:07:00Z"), fetchImpl);
    expect(res.status).toBe(204);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DISPATCH_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main", inputs: { only_near_deadline: false } });
  });

  it("only asks for the full job on the hourly run", async () => {
    for (const [time, near] of [["10:07", false], ["10:22", true], ["10:37", true], ["10:52", true], ["10:09", false]] as const) {
      const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
      await triggerModel("tok", at(`2026-11-01T${time}:00Z`), fetchImpl);
      const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(JSON.parse(init.body as string).inputs.only_near_deadline).toBe(near);
    }
  });

  it("fails loudly without a token or when GitHub refuses", async () => {
    const fetchImpl = vi.fn(async () => new Response("Bad credentials", { status: 401 }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await triggerModel(undefined, at("2026-11-01T10:07:00Z"), fetchImpl)).status).toBe(500);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await triggerModel("bad", at("2026-11-01T10:07:00Z"), fetchImpl)).status).toBe(502);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("401"));
    errors.mockRestore();
  });
});
