import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RoleDocument } from 'src/roles/schemas/role.schema';
import { RolesRepository } from 'src/roles/repositories/roles.repository';
import { UserDocument } from 'src/users/schemas/user.schema';
import { UsersRepository } from 'src/users/repositories/users.repository';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

const DEFAULT_SELF_REGISTER_ROLE = 'Participant';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const role = await this.rolesRepository.findByName(
      DEFAULT_SELF_REGISTER_ROLE,
    );
    if (!role) {
      throw new NotFoundException(
        `Default "${DEFAULT_SELF_REGISTER_ROLE}" role not found - run "npm run seed:roles" first`,
      );
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: role.id,
    });

    return this.buildAuthResult(user, role);
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findByEmailWithPassword(
      dto.email,
    );
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersRepository.updateById(user.id, { lastLoginAt: new Date() });

    return this.buildAuthResult(user, user.role as unknown as RoleDocument);
  }

  async validateUserById(userId: string): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findByIdWithRole(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return this.toAuthenticatedUser(user, user.role as unknown as RoleDocument);
  }

  private buildAuthResult(user: UserDocument, role: RoleDocument) {
    const authenticatedUser = this.toAuthenticatedUser(user, role);
    const accessToken = this.jwtService.sign({
      sub: authenticatedUser.userId,
      email: authenticatedUser.email,
    });
    return { accessToken, user: authenticatedUser };
  }

  private toAuthenticatedUser(
    user: UserDocument,
    role: RoleDocument,
  ): AuthenticatedUser {
    return {
      userId: user.id,
      email: user.email,
      roleId: role.id,
      roleName: role.name,
      permissions: role.permissions,
    };
  }
}
