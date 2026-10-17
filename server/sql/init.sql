-- OA 工单管理系统建表脚本（幂等：重复执行不会报错）
-- 约定：枚举值与前端 mock/data.js 选项完全一致

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  name          VARCHAR(50)  NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('超级管理员', '部长', '普通员工')),
  dept          VARCHAR(20)  NOT NULL CHECK (dept IN ('技术部', '市场部', '财务部', '人事部', '行政部')),
  email         VARCHAR(100),
  status        VARCHAR(10)  NOT NULL DEFAULT '启用' CHECK (status IN ('启用', '禁用')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id            VARCHAR(14)  PRIMARY KEY,            -- 随机生成：WO + yyyymmdd + 4 位
  title         VARCHAR(50)  NOT NULL,
  type          VARCHAR(20)  NOT NULL CHECK (type IN ('账号权限', '设备故障', '网络异常', '系统BUG', '其他需求')),
  dept          VARCHAR(20)  NOT NULL CHECK (dept IN ('技术部', '市场部', '财务部', '人事部', '行政部')),
  priority      VARCHAR(10)  NOT NULL CHECK (priority IN ('高', '中', '低')),
  status        VARCHAR(10)  NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已完成', '已关闭', '已退回')),
  submitter_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  handler_id    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  deadline      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  description   TEXT         NOT NULL DEFAULT '',
  extra         JSONB        NOT NULL DEFAULT '{}',  -- 类型扩展字段（账号/设备等）
  attachments   JSONB        NOT NULL DEFAULT '[]',  -- [{ name, url, size }]
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                          -- 软删除标记
);

CREATE TABLE IF NOT EXISTS order_logs (
  id         SERIAL PRIMARY KEY,
  order_id   VARCHAR(14) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,                  -- 如：提交工单 / 接单 / 完成 / 退回
  remark     TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_dept       ON orders (dept);
CREATE INDEX IF NOT EXISTS idx_orders_submitter  ON orders (submitter_id);
CREATE INDEX IF NOT EXISTS idx_orders_handler    ON orders (handler_id);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_type       ON orders (type);
CREATE INDEX IF NOT EXISTS idx_orders_priority   ON orders (priority);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_dept        ON users (dept);
CREATE INDEX IF NOT EXISTS idx_logs_order        ON order_logs (order_id);

-- ============ 增量迁移（幂等） ============
-- 系统管理员不属于任何部门：CHECK 对 NULL 天然放行，只需放开 NOT NULL
-- 效果：部长按 dept 过滤的查询天然看不到 admin（SQL 中 NULL 不参与 = 比较）
ALTER TABLE users ALTER COLUMN dept DROP NOT NULL;
UPDATE users SET dept = NULL WHERE username = 'admin';
