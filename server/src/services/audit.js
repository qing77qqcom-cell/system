// 配置/权限变更审计（database-design.md §6.5，只追加）
export const writeAudit = (client, { actorId, targetType, targetId, action, before = null, after = null }) =>
  client.query(
    `INSERT INTO audit_logs (actor_id, target_type, target_id, action, before, after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actorId, targetType, targetId != null ? String(targetId) : null, action,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null,
    ],
  )
