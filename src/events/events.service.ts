import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import {
  Registration,
  RegistrationDocument,
} from 'src/registrations/schemas/registration.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsRepository } from './repositories/events.repository';
import { EventDocument, EventStatus } from './schemas/event.schema';

export interface PublicEventInfo {
  id: string;
  name: string;
  theme?: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  logo?: string;
  image?: string;
  totalSlots: number;
  registeredCount: number;
  remainingSlots: number;
  status: 'active' | 'closed' | 'upcoming' | 'completed';
}

const PUBLIC_STATUS_MAP: Record<EventStatus, PublicEventInfo['status']> = {
  [EventStatus.DRAFT]: 'upcoming',
  [EventStatus.PUBLISHED]: 'active',
  [EventStatus.ONGOING]: 'active',
  [EventStatus.COMPLETED]: 'completed',
  [EventStatus.CANCELLED]: 'closed',
};

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    @InjectModel(Registration.name)
    private readonly registrationModel: Model<RegistrationDocument>,
  ) {}

  create(dto: CreateEventDto): Promise<EventDocument> {
    return this.eventsRepository.create({ ...dto });
  }

  findAll(query: PaginationQueryDto): Promise<PaginatedResult<EventDocument>> {
    return this.eventsRepository.findAll({}, query);
  }

  async findById(id: string): Promise<EventDocument> {
    const event = await this.eventsRepository.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async update(id: string, dto: UpdateEventDto): Promise<EventDocument> {
    const event = await this.eventsRepository.updateById(id, dto);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async remove(id: string): Promise<void> {
    const event = await this.eventsRepository.deleteById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
  }

  async findActive(): Promise<PublicEventInfo> {
    const event = await this.eventsRepository.findActive();
    if (!event) {
      throw new NotFoundException('No active event found');
    }
    const registeredCount = await this.registrationModel.countDocuments({
      event: event.id,
    });
    return this.toPublicEventInfo(event, registeredCount);
  }

  private toPublicEventInfo(
    event: EventDocument,
    registeredCount: number,
  ): PublicEventInfo {
    const totalSlots = event.totalSlots ?? 0;
    return {
      id: event.id,
      name: event.name,
      theme: event.theme,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      logo: event.logo,
      image: event.image,
      totalSlots,
      registeredCount,
      remainingSlots: Math.max(totalSlots - registeredCount, 0),
      status: PUBLIC_STATUS_MAP[event.status],
    };
  }
}
