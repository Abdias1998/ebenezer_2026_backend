import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PipelineStage, Types } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { PaginationOptions } from 'src/common/repositories/base.repository';
import { PaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { Registration, RegistrationDocument } from '../schemas/registration.schema';

@Injectable()
export class RegistrationsRepository extends BaseRepository<RegistrationDocument> {
  constructor(
    @InjectModel(Registration.name) model: Model<RegistrationDocument>,
  ) {
    super(model);
  }

  async findByParticipantAndEvent(
    participantId: string,
    eventId: string,
  ): Promise<RegistrationDocument | null> {
    return this.findOne({ participant: participantId, event: eventId });
  }

  async findByCode(code: string): Promise<RegistrationDocument | null> {
    return this.findOne({ code });
  }

  async findByPaymentRef(
    paymentRef: string,
  ): Promise<RegistrationDocument | null> {
    return this.findOne({ paymentRef });
  }

  async findByPaymentRefCaseInsensitive(
    paymentRef: string,
  ): Promise<RegistrationDocument | null> {
    const escaped = paymentRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.findOne({
      paymentRef: { $regex: new RegExp(`^${escaped}$`, 'i') },
    });
  }

  /**
   * Liste paginée des inscriptions, en joignant les participants et les
   * événements. Permet de filtrer sur les champs du participant (taille de
   * t-shirt, lieu de prise en charge, ville, église, recherche...) qui ne
   * sont pas des colonnes de la collection `registrations`.
   */
  async findFiltered(
    registrationFilter: FilterQuery<Registration>,
    participantFilter: FilterQuery<Record<string, unknown>>,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const sortBy = options.sortBy ?? 'createdAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

    const match: PipelineStage.Match['$match'] = {
      ...(registrationFilter as FilterQuery<Registration>),
    };
    if (match.event && typeof match.event === 'string') {
      match.event = new Types.ObjectId(match.event);
    }

    const participantMatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(participantFilter ?? {})) {
      if (key === '$or' && Array.isArray(value)) {
        participantMatch.$or = value.map((cond: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(cond).map(([k, v]) => [`participantDoc.${k}`, v]),
          ),
        );
      } else {
        participantMatch[`participantDoc.${key}`] = value;
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'participants',
          localField: 'participant',
          foreignField: '_id',
          as: '__p',
        },
      },
      { $set: { participantDoc: { $arrayElemAt: ['$__p', 0] } } },
      { $unset: '__p' },
      {
        $lookup: {
          from: 'events',
          localField: 'event',
          foreignField: '_id',
          as: '__e',
        },
      },
      { $set: { eventDoc: { $arrayElemAt: ['$__e', 0] } } },
      { $unset: '__e' },
    ];
    if (Object.keys(participantMatch).length > 0) {
      pipeline.push({
        $match: participantMatch as PipelineStage.Match['$match'],
      });
    }
    pipeline.push(
      { $sort: { [sortBy]: sortOrder } } as PipelineStage,
      { $skip: (page - 1) * limit },
      { $limit: limit },
    );

    const items = await this.model.aggregate(pipeline).exec();
    const [countRow] = await this.model
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'participants',
            localField: 'participant',
            foreignField: '_id',
            as: '__p',
          },
        },
        { $set: { participantDoc: { $arrayElemAt: ['$__p', 0] } } },
        { $unset: '__p' },
        ...(Object.keys(participantMatch).length
          ? [{ $match: participantMatch as PipelineStage.Match['$match'] }]
          : []),
        { $count: 'total' },
      ])
      .exec();
    const total = countRow?.[0]?.total ?? 0;

    return {
      items,
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
    };
  }

  /**
   * Compteurs par dimension (taille de t-shirt, lieu de prise en charge,
   * ville, église, réseau de paiement, statut) pour l'affichage admin.
   */
  async aggregateStats(
    registrationFilter: FilterQuery<Registration>,
  ): Promise<{
    total: number;
    byTshirtSize: { value: string; count: number }[];
    byPickupLocation: { value: string; count: number }[];
    byCity: { value: string; count: number }[];
    byChurch: { value: string; count: number }[];
    byPaymentNetwork: { value: string; count: number }[];
    byStatus: { value: string; count: number }[];
  }> {
    const match: PipelineStage.Match['$match'] = {
      ...(registrationFilter as FilterQuery<Registration>),
    };
    if (match.event && typeof match.event === 'string') {
      match.event = new Types.ObjectId(match.event);
    }

    const [result] = await this.model
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'participants',
            localField: 'participant',
            foreignField: '_id',
            as: '__p',
          },
        },
        { $set: { participantDoc: { $arrayElemAt: ['$__p', 0] } } },
        { $unset: '__p' },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byTshirtSize: [
              { $group: { _id: '$participantDoc.tshirtSize', count: { $sum: 1 } } },
            ],
            byPickupLocation: [
              {
                $group: {
                  _id: '$participantDoc.pickupLocation',
                  count: { $sum: 1 },
                },
              },
            ],
            byCity: [
              { $group: { _id: '$participantDoc.city', count: { $sum: 1 } } },
            ],
            byChurch: [
              { $group: { _id: '$participantDoc.church', count: { $sum: 1 } } },
            ],
            byPaymentNetwork: [
              { $group: { _id: '$paymentNetwork', count: { $sum: 1 } } },
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
          },
        },
      ])
      .exec();

    const toMap = (rows: { _id: unknown; count: number }[]) =>
      rows
        .filter((r) => r._id != null)
        .map((r) => ({ value: String(r._id), count: r.count }))
        .sort((a, b) => b.count - a.count);

    return {
      total: result?.total?.[0]?.count ?? 0,
      byTshirtSize: toMap(result?.byTshirtSize ?? []),
      byPickupLocation: toMap(result?.byPickupLocation ?? []),
      byCity: toMap(result?.byCity ?? []),
      byChurch: toMap(result?.byChurch ?? []),
      byPaymentNetwork: toMap(result?.byPaymentNetwork ?? []),
      byStatus: toMap(result?.byStatus ?? []),
    };
  }
}
