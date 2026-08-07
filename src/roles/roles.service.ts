import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesRepository } from './repositories/roles.repository';
import { RoleDocument } from './schemas/role.schema';

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  async create(dto: CreateRoleDto): Promise<RoleDocument> {
    const existing = await this.rolesRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Role "${dto.name}" already exists`);
    }
    return this.rolesRepository.create({ ...dto });
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<RoleDocument>> {
    return this.rolesRepository.findAll({}, query);
  }

  async findById(id: string): Promise<RoleDocument> {
    const role = await this.rolesRepository.findById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleDocument> {
    const role = await this.rolesRepository.updateById(id, dto);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async remove(id: string): Promise<void> {
    const role = await this.rolesRepository.deleteById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
  }
}
