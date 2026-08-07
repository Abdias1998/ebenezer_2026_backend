import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as crypto from 'crypto';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const PHOTO_UPLOAD_DIR = join(process.cwd(), 'uploads', 'participants');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const photoUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: PHOTO_UPLOAD_DIR,
    filename: (_req, file, callback) => {
      const uniqueName = crypto.randomBytes(16).toString('hex');
      callback(null, `${uniqueName}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new BadRequestException('Format de photo non supporté'), false);
      return;
    }
    callback(null, true);
  },
};
