import { describe, expect, it, vi } from "vitest";
import { FeishuClient } from "./index.js";

const config = {
  appId: "cli_test",
  appSecret: "secret",
  redirectUri: "https://example.com/callback",
  baseUrl: "https://open.feishu.test",
  accountsUrl: "https://accounts.feishu.test",
};

describe("FeishuClient", () => {
  it("builds the official OAuth authorization URL", () => {
    const url = new URL(
      new FeishuClient(config).authorizationUrl("signed-state"),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.feishu.test/open-apis/authen/v1/authorize",
    );
    expect(url.searchParams.get("app_id")).toBe("cli_test");
    expect(url.searchParams.get("state")).toBe("signed-state");
  });
  it("caches tenant token and sends an interactive card", async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            tenant_access_token: "t-token",
            expire: 7200,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 0, data: { message_id: "om_1" } }),
          { status: 200 },
        ),
      );
    const client = new FeishuClient(config, mock);
    expect(
      (await client.sendInteractiveCard("ou_1", { schema: "2.0" })).messageId,
    ).toBe("om_1");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[1]?.[0])).toContain(
      "receive_id_type=open_id",
    );
  });

  it("walks the department tree and de-duplicates people in multiple departments", async () => {
    const ok = (data: object) =>
      new Response(JSON.stringify({ code: 0, data }), { status: 200 });
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            tenant_access_token: "t-token",
            expire: 7200,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        ok({ items: [{ open_id: "ou_1", name: "员工一" }], has_more: false }),
      )
      .mockResolvedValueOnce(
        ok({
          items: [{ open_department_id: "od_child", name: "子部门" }],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        ok({
          items: [
            {
              open_id: "ou_1",
              name: "员工一",
              department_ids: ["od_child"],
            },
            { open_id: "ou_2", name: "员工二" },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(ok({ items: [], has_more: false }));
    const directory = await new FeishuClient(config, mock).listDirectoryTree(
      "0",
    );
    expect(directory.users.map((user) => user.openId).sort()).toEqual([
      "ou_1",
      "ou_2",
    ]);
    expect(directory.departments).toEqual([
      {
        openDepartmentId: "od_child",
        name: "子部门",
        parentDepartmentId: undefined,
      },
    ]);
    expect(mock).toHaveBeenCalledTimes(5);
    expect(String(mock.mock.calls[4]?.[0])).toContain(
      "/departments/od_child/children",
    );
  });
});
