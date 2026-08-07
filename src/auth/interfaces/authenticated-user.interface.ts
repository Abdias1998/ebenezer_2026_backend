export interface AuthenticatedUser {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}
