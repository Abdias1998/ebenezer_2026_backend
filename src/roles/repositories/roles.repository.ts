import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Role, RoleDocument } from '../schemas/role.schema';

@Injectable()
export class RolesRepository extends BaseRepository<RoleDocument> {
  constructor(@InjectModel(Role.name) model: Model<RoleDocument>) {
    super(model);
  }

  async findByName(name: string): Promise<RoleDocument | null> {
    return this.findOne({ name });
  }
}
