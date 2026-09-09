/**
 * Static, developer-controlled permission catalog. Not a database collection:
 * permissions are code, roles (which permissions map to) are data.
 * Convention: `resource:action`.
 */
export const PERMISSIONS = {
  USERS: {
    CREATE: 'users:create',
    READ: 'users:read',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
  },
  ROLES: {
    CREATE: 'roles:create',
    READ: 'roles:read',
    UPDATE: 'roles:update',
    DELETE: 'roles:delete',
  },
  EVENTS: {
    CREATE: 'events:create',
    READ: 'events:read',
    UPDATE: 'events:update',
    DELETE: 'events:delete',
  },
  PARTICIPANTS: {
    CREATE: 'participants:create',
    READ: 'participants:read',
    UPDATE: 'participants:update',
    DELETE: 'participants:delete',
  },
  REGISTRATIONS: {
    CREATE: 'registrations:create',
    READ: 'registrations:read',
    UPDATE: 'registrations:update',
    DELETE: 'registrations:delete',
  },
  ATTENDANCE: {
    CREATE: 'attendance:create',
    READ: 'attendance:read',
  },
  SUGGESTIONS: {
    READ: 'suggestions:read',
    UPDATE: 'suggestions:update',
    DELETE: 'suggestions:delete',
  },
  RECRUITMENTS: {
    CREATE: 'recruitments:create',
    READ: 'recruitments:read',
    UPDATE: 'recruitments:update',
    DELETE: 'recruitments:delete',
  },
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]];

export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS).flatMap(
  (group) => Object.values(group),
);
