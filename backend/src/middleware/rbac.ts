import { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db.js";

export type Role = "admin" | "legal_counsel" | "member" | "viewer";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 40,
  legal_counsel: 30,
  member: 20,
  viewer: 10,
};

declare module "fastify" {
  interface FastifyRequest {
    tenant?: {
      organizationId: string;
      role: Role;
    };
  }
}

export function requireRole(minimumRole: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply
        .status(401)
        .send({ error: "Unauthorized: User not authenticated" });
    }

    // Determine target org from headers, route params, or user's active membership
    const orgId =
      (request.headers["x-organization-id"] as string) ||
      (request.query as { organizationId?: string })?.organizationId;

    let query = `
      SELECT organization_id, role 
      FROM organization_members 
      WHERE user_id = $1
    `;
    const params: (string | number)[] = [userId];

    if (orgId) {
      query += ` AND organization_id = $2`;
      params.push(orgId);
    } else {
      query += ` ORDER BY created_at ASC LIMIT 1`;
    }

    const memberRes = await pool.query(query, params);
    if (memberRes.rowCount === 0) {
      return reply
        .status(403)
        .send({ error: "Access denied: Not a member of any organization" });
    }

    const userMembership = memberRes.rows[0];
    const userRole = userMembership.role as Role;

    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minimumRole]) {
      return reply.status(403).send({
        error: `Forbidden: Requires minimum '${minimumRole}' privileges. Your role is '${userRole}'.`,
      });
    }

    request.tenant = {
      organizationId: userMembership.organization_id,
      role: userRole,
    };
  };
}
