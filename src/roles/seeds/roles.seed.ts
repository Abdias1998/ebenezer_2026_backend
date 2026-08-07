import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { RolesService } from '../roles.service';
import { RolesRepository } from '../repositories/roles.repository';
import { UsersService } from 'src/users/users.service';
import { UsersRepository } from 'src/users/repositories/users.repository';
import { DEFAULT_ROLES } from './default-roles.data';

async function bootstrap(): Promise<void> {
  const logger = new Logger('RolesSeed');
  const app = await NestFactory.createApplicationContext(AppModule);

  const rolesRepository = app.get(RolesRepository);
  const rolesService = app.get(RolesService);
  const usersService = app.get(UsersService);
  const usersRepository = app.get(UsersRepository);
  const configService = app.get(ConfigService);

  for (const definition of DEFAULT_ROLES) {
    const existing = await rolesRepository.findByName(definition.name);
    if (existing) {
      await rolesRepository.updateById(existing.id, {
        description: definition.description,
        permissions: definition.permissions,
      });
      logger.log(`Updated role "${definition.name}"`);
    } else {
      await rolesRepository.create({ ...definition });
      logger.log(`Created role "${definition.name}"`);
    }
  }

  const superAdminEmail = configService.get<string>('seed.superAdminEmail');
  const superAdminPassword = configService.get<string>('seed.superAdminPassword');

  if (superAdminEmail && superAdminPassword) {
    const superAdminRole = await rolesRepository.findByName('Super Admin');
    if (!superAdminRole) {
      throw new Error('Super Admin role missing after seed - this should not happen');
    }

    const existingUser = await usersRepository.findByEmail(superAdminEmail);

    if (!existingUser) {
      await usersService.create({
        email: superAdminEmail,
        password: superAdminPassword,
        firstName: 'Super',
        lastName: 'Admin',
        role: superAdminRole.id,
      });
      logger.log(`Created Super Admin user "${superAdminEmail}"`);
    } else {
      logger.log(`Super Admin user "${superAdminEmail}" already exists`);
    }
  } else {
    logger.warn(
      'SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set - skipping Super Admin user creation',
    );
  }

  await app.close();
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});
