import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * TÂCHE PONCTUELLE — remet tous les inscrits du Worship & Praise à
 * « pas encore embarqué » (des billets ont été validés par erreur pendant
 * les tests du scanner).
 *
 * Elle s'exécute au démarrage du serveur, UNE SEULE FOIS : un marqueur est
 * enregistré dans la collection `maintenance_tasks`, donc un redémarrage
 * pendant l'événement n'efface pas les vrais embarquements. Par sécurité,
 * elle ne s'exécute plus après RUN_BEFORE (veille de l'embarquement).
 *
 * À supprimer du code une fois déployée.
 */
const TASK_ID = 'reset-worship-boarding-2026-11-26';
const WORSHIP_PREFIX = 'WPN';
const RUN_BEFORE = new Date('2026-11-27T12:00:00Z');

@Injectable()
export class ResetWorshipBoardingTask implements OnApplicationBootstrap {
  private readonly logger = new Logger('ResetWorshipBoarding');

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Échec de la remise à zéro : ${String(error)}`);
    }
  }

  private async run(): Promise<void> {
    if (new Date() >= RUN_BEFORE) return;

    const db = this.connection.db!;
    const tasks = db.collection<{ _id: string; ranAt: Date }>('maintenance_tasks');

    // Réserve la tâche de façon atomique : si le marqueur existe déjà
    // (exécution précédente ou autre instance), on ne fait rien.
    try {
      await tasks.insertOne({ _id: TASK_ID, ranAt: new Date() });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return;
      throw error;
    }

    const event = await db
      .collection('events')
      .findOne({ registrationPrefix: WORSHIP_PREFIX });
    if (!event) {
      this.logger.warn('Événement Worship & Praise introuvable : rien à faire.');
      return;
    }

    const registrations = await db.collection('registrations').updateMany(
      { event: event._id, status: 'checked-in' },
      {
        $set: { status: 'confirmed', updatedAt: new Date() },
        $unset: { checkedInAt: '' },
      },
    );
    // Billets validés puis annulés, etc. : on retire aussi l'heure d'embarquement.
    await db
      .collection('registrations')
      .updateMany(
        { event: event._id, checkedInAt: { $exists: true } },
        { $unset: { checkedInAt: '' } },
      );
    const attendances = await db
      .collection('attendances')
      .deleteMany({ event: event._id });

    this.logger.log(
      `Worship & Praise remis à « pas encore embarqué » : ${registrations.modifiedCount} inscription(s), ${attendances.deletedCount} pointage(s) supprimé(s).`,
    );
  }
}
