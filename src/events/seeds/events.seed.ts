import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { EventsRepository } from '../repositories/events.repository';
import { EventStatus } from '../schemas/event.schema';

export const JDJ_EVENT = {
  name: 'Jeûne des Jeunes',
  theme: 'Réquisitionnés pour Sa Gloire',
  description:
    "Une journée entière de jeûne, de prière et d'adoration pour la jeunesse : cinq voix, un même appel. Édition de Lomé.",
  startDate: new Date('2026-09-26T08:00:00Z'),
  endDate: new Date('2026-09-26T18:30:00Z'),
  location: 'CETEF Togo 2000, Palais des Expositions et des Foires, Lomé, Togo',
  totalSlots: 1000,
  status: EventStatus.PUBLISHED,
  registrationPrefix: 'JDJ',
};

// TODO dates / lieux à confirmer par les organisateurs.
export const SEMINAIRE_EVENT = {
  name: 'Séminaire des Pasteurs',
  theme: 'Marcher dans les réalités du Royaume (Marc 4:11)',
  description:
    'Mission au Bénin avec le Prophète Samuel Dalum : intercession prophétique (17-18 nov.), séminaires sur le leadership (19-20 nov.) et conférences de réveil chaque soir. Orateurs : Pr Paddy Blessed Musoke, Pr Dieudonné Nduwimana, Ev. Danny Kadigiri. Coordinateur : Papa John Migan.',
  // Heure du Bénin (UTC+1) : du 17 nov. 09h00 au 20 nov. ~21h00.
  startDate: new Date('2026-11-17T08:00:00Z'),
  endDate: new Date('2026-11-20T20:00:00Z'),
  location: 'Centre La Grâce Parle, Jéricho',
  totalSlots: 1000,
  status: EventStatus.PUBLISHED,
  registrationPrefix: 'SEM',
  isFree: true,
};

export const CONFERENCE_EVENT = {
  name: 'Conférence des Professionnels',
  theme: 'Les 7 étapes pour transformer votre rêve en fortune (2 Rois 4:1-7)',
  description:
    "Conférence des professionnels et hommes/femmes d'affaires organisée par Trinity Tabernacle Ministries (Burundi/Rwanda) en collaboration avec le Corps de Christ au Bénin. Invité : Pr Musoke Paddy Blessed. Contacts : MOG Isaac 01 98 17 29 33, Pastor Espoir 01 67 92 15 26.",
  // Samedi 21 nov. 09h00, heure du Bénin (UTC+1). Heure de fin non communiquée.
  startDate: new Date('2026-11-21T08:00:00Z'),
  endDate: new Date('2026-11-21T14:00:00Z'),
  location: 'Salle des fêtes Le Majestic, Cadjehoun, Cotonou',
  totalSlots: 1000,
  status: EventStatus.PUBLISHED,
  registrationPrefix: 'PRO',
  isFree: true,
  singleCheckIn: true,
};

export const CAMP_EVENT = {
  name: 'Camp La Sagesse de Bâtir',
  theme: 'Chaque vendredi dans Sa présence',
  description:
    "Chaque vendredi, une nuit de prière, d'adoration et de communion pour la jeunesse.",
  // Tous les vendredis ; dates = première séance, vendredi 30 oct. 19h00 → samedi 06h00 (UTC+1).
  startDate: new Date('2026-10-30T18:00:00Z'),
  endDate: new Date('2026-10-31T05:00:00Z'),
  scheduleLabel: 'Tous les vendredis, de 19h00 à 06h00',
  location: 'Centre La Grâce Parle, Jéricho',
  totalSlots: 1000,
  status: EventStatus.PUBLISHED,
  registrationPrefix: 'CAMP',
  isFree: true,
  // Plusieurs séances : un pointage par jour, pour savoir qui était là à chacune.
  singleCheckIn: false,
};

const EVENTS = [JDJ_EVENT, SEMINAIRE_EVENT, CONFERENCE_EVENT, CAMP_EVENT];

async function bootstrap(): Promise<void> {
  const logger = new Logger('EventsSeed');
  const app = await NestFactory.createApplicationContext(AppModule);

  const eventsRepository = app.get(EventsRepository);

  for (const event of EVENTS) {
    // Le préfixe permet de retrouver un événement renommé.
    const existing = await eventsRepository.findOne({
      $or: [
        { name: event.name },
        { registrationPrefix: event.registrationPrefix },
      ],
    });
    if (existing) {
      await eventsRepository.updateById(existing.id, event);
      logger.log(`Updated event "${event.name}" (id: ${existing.id})`);
    } else {
      const created = await eventsRepository.create({ ...event });
      logger.log(`Created event "${event.name}" (id: ${created.id})`);
    }
  }

  await app.close();
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});
