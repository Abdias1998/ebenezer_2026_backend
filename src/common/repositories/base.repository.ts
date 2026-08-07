import { Document, FilterQuery, Model, UpdateQuery } from 'mongoose';
import { PaginatedResult } from '../interfaces/paginated-result.interface';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Generic Mongoose repository. Extend this per module instead of injecting
 * the Model directly into services - keeps pagination/filtering/soft-delete
 * logic in one place for every module that follows this convention.
 */
export abstract class BaseRepository<T extends Document> {
  protected constructor(protected readonly model: Model<T>) {}

  /**
   * Accepts plain DTO-shaped data (e.g. string ids/dates) - Mongoose casts
   * them against the schema on save, so callers don't need to pre-cast.
   */
  async create(data: Record<string, unknown>): Promise<T> {
    const created = new this.model(data);
    return created.save();
  }

  async findById(id: string): Promise<T | null> {
    return this.model
      .findOne({ _id: id, ...this.notDeletedFilter() } as FilterQuery<T>)
      .exec();
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model
      .findOne({ ...filter, ...this.notDeletedFilter() } as FilterQuery<T>)
      .exec();
  }

  async findAll(
    filter: FilterQuery<T> = {},
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<T>> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

    const combinedFilter = {
      ...filter,
      ...this.notDeletedFilter(),
    } as FilterQuery<T>;

    const [items, total] = await Promise.all([
      this.model
        .find(combinedFilter)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(combinedFilter).exec(),
    ]);

    return {
      items,
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
    };
  }

  async updateById(id: string, update: UpdateQuery<T>): Promise<T | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...this.notDeletedFilter() } as FilterQuery<T>,
        update,
        { new: true },
      )
      .exec();
  }

  async deleteById(id: string): Promise<T | null> {
    return this.model.findOneAndDelete({ _id: id } as FilterQuery<T>).exec();
  }

  /**
   * Override in repositories whose schema has a `deletedAt` field to enable
   * soft delete (excluded from findById/findAll/updateById by default).
   * Disabled by default so schemas without `deletedAt` aren't affected.
   */
  protected notDeletedFilter(): FilterQuery<T> {
    return {} as FilterQuery<T>;
  }
}
