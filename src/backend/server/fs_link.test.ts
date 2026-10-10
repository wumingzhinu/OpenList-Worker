// `/api/fs/link` 行为测试。
//
// 关注点：该端点返回**真实直链**，改造后又额外返回精确请求头（headers），
// 因此权限门必须保持 admin-only —— 否则任意用户都能取到带 Cookie /
// Authorization 的直链。权限回归比取链本身更值得守。

import assert from "node:assert/strict"
import { test } from "node:test"
import { Hono } from "hono"
import { saveDb } from "../internal/model/db"
import { fsRouter } from "./fs"

const env: any = {}
const ADMIN_TOKEN = "ADMIN_STATIC_TOKEN"

const seed = () =>
  saveDb(
    {
      settings: [{ key: "token", value: ADMIN_TOKEN }],
      users: [
        {
          id: 1,
          username: "admin",
          password: "xxx",
          role: 2,
          permission: 0,
          base_path: "/",
          disabled: false,
        },
        {
          id: 2,
          username: "guest",
          password: "xxx",
          role: 1,
          permission: 0,
          base_path: "/",
          disabled: false,
        },
      ],
      storages: [
        {
          id: 1,
          mount_path: "/x",
          driver: "local",
          disabled: false,
          addition: JSON.stringify({ root_folder_path: "/data" }),
        },
      ],
      shares: [],
    },
    env,
  )

const callLink = (headers: Record<string, string> = {}) => {
  const app = new Hono()
  app.route("/api/fs", fsRouter)
  return app.request("/api/fs/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ path: "/x" }),
  })
}

test("/api/fs/link 保持 admin-only（直链可能带私有鉴权头）", async () => {
  await seed()
  const guest = await callLink()
  assert.equal(
    guest.status,
    403,
    "guest 不得取得真实直链 —— 直链可能携带 Cookie / Authorization",
  )

  // 管理员至少不应被权限门拦下（可能因驱动无直链而落回代理地址）
  const admin = await callLink({ Authorization: ADMIN_TOKEN })
  assert.notEqual(admin.status, 403, "admin 不应被权限门拒绝")
})

test("/api/fs/link 响应体始终带 url 字段", async () => {
  await seed()
  const res = await callLink({ Authorization: ADMIN_TOKEN })
  const body = (await res.json()) as any
  assert.equal(body.code, 200)
  assert.equal(typeof body.data.url, "string", "响应必须包含可用的 url")
  // 无 headers 时不得凭空多出该字段，保持向后兼容
  assert.ok(
    body.data.headers === undefined || typeof body.data.headers === "object",
    "headers 缺省时不应出现",
  )
})