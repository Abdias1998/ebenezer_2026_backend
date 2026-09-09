import { ALL_PERMISSIONS, PERMISSIONS } from 'src/common/constants/permissions.constant';

export interface DefaultRoleDefinition {
  name: string;
  description: string;
  permissions: string[];
}

const READ_ONLY = [
  PERMISSIONS.EVENTS.READ,
  PERMISSIONS.PARTICIPANTS.READ,
  PERMISSIONS.REGISTRATIONS.READ,
  PERMISSIONS.ATTENDANCE.READ,
  PERMISSIONS.RECRUITMENTS.READ,
];

export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
  {
    name: 'Super Admin',
    description: 'Full, unrestricted access to every module.',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Administrateur',
    description: 'Administrative access across events, participants and registrations.',
    permissions: [
      ...Object.values(PERMISSIONS.EVENTS),
      ...Object.values(PERMISSIONS.PARTICIPANTS),
      ...Object.values(PERMISSIONS.REGISTRATIONS),
      ...Object.values(PERMISSIONS.ATTENDANCE),
      ...Object.values(PERMISSIONS.SUGGESTIONS),
      ...Object.values(PERMISSIONS.RECRUITMENTS),
      PERMISSIONS.USERS.READ,
      PERMISSIONS.ROLES.READ,
    ],
  },
  {
    name: 'Prophète',
    description: 'Read-only visibility across event operations.',
    permissions: READ_ONLY,
  },
  {
    name: 'Pasteur',
    description: 'Read-only visibility across event operations.',
    permissions: READ_ONLY,
  },
  {
    name: 'Responsable Accueil',
    description: 'Front-desk lead: manages participants and registrations.',
    permissions: [
      ...Object.values(PERMISSIONS.PARTICIPANTS),
      ...Object.values(PERMISSIONS.REGISTRATIONS),
      PERMISSIONS.EVENTS.READ,
    ],
  },
  {
    name: 'Responsable Scanner',
    description: 'Operates QR scanning and attendance check-in.',
    permissions: [
      PERMISSIONS.PARTICIPANTS.READ,
      PERMISSIONS.REGISTRATIONS.READ,
      PERMISSIONS.ATTENDANCE.CREATE,
      PERMISSIONS.ATTENDANCE.READ,
    ],
  },
  {
    name: 'Responsable Communication',
    description: 'Read-only visibility across event operations.',
    permissions: READ_ONLY,
  },
  {
    name: 'Responsable Média',
    description: 'Read-only visibility across event operations.',
    permissions: READ_ONLY,
  },
  {
    name: 'Responsable Hébergement',
    description: 'Manages accommodation-related participant data.',
    permissions: [PERMISSIONS.PARTICIPANTS.READ, PERMISSIONS.PARTICIPANTS.UPDATE, PERMISSIONS.EVENTS.READ],
  },
  {
    name: 'Bénévole',
    description: 'Volunteer with minimal read-only access.',
    permissions: [PERMISSIONS.EVENTS.READ],
  },
  {
    name: 'Participant',
    description: 'End-user attending an event; no back-office access.',
    permissions: [],
  },
];
