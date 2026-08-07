import { Injectable, NotFoundException } from '@nestjs/common';
import { FilterQuery } from 'mongoose';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { QueryParticipantDto } from './dto/query-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { ParticipantsRepository } from './repositories/participants.repository';
import { ParticipantDocument } from './schemas/participant.schema';

@Injectable()
export class ParticipantsService {
  constructor(private readonly participantsRepository: ParticipantsRepository) {}

  async create(
    dto: CreateParticipantDto,
    actingUserId?: string,
  ): Promise<ParticipantDocument> {
    const participant = await this.participantsRepository.create({
      ...dto,
      history: [{ action: 'created', by: actingUserId, at: new Date() }],
    });
    return participant;
  }

  findAll(
    query: QueryParticipantDto,
  ): Promise<PaginatedResult<ParticipantDocument>> {
    const filter: FilterQuery<ParticipantDocument> = {};

    if (query.search) {
      const regex = new RegExp(query.search, 'i');
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
      ];
    }
    if (query.gender) filter.gender = query.gender;
    if (query.status) filter.status = query.status;

    return this.participantsRepository.findAll(filter, query);
  }

  async findByEmailOrPhone(
    email?: string,
    phone?: string,
  ): Promise<ParticipantDocument | null> {
    if (!email && !phone) {
      return null;
    }
    const conditions: FilterQuery<ParticipantDocument>[] = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });

    return this.participantsRepository.findOne({ $or: conditions });
  }

  async findById(id: string): Promise<ParticipantDocument> {
    const participant = await this.participantsRepository.findById(id);
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  async update(
    id: string,
    dto: UpdateParticipantDto,
    actingUserId?: string,
  ): Promise<ParticipantDocument> {
    const participant = await this.participantsRepository.updateById(id, dto);
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    await this.participantsRepository.pushHistoryEntry(id, {
      action: 'updated',
      by: actingUserId,
    });
    return participant;
  }

  async remove(id: string, actingUserId?: string): Promise<void> {
    const participant = await this.participantsRepository.softDeleteById(id);
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    await this.participantsRepository.pushHistoryEntry(id, {
      action: 'deleted',
      by: actingUserId,
    });
  }
}
