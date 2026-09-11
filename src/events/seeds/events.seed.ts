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
};

async function bootstrap(): Promise<void> {
  const logger = new Logger('EventsSeed');
  const app = await NestFactory.createApplicationContext(AppModule);

  const eventsRepository = app.get(EventsRepository);

  const existing = await eventsRepository.findOne({ name: JDJ_EVENT.name });
  if (existing) {
    await eventsRepository.updateById(existing.id, JDJ_EVENT);
    logger.log(`Updated event "${JDJ_EVENT.name}" (id: ${existing.id})`);
  } else {
    const created = await eventsRepository.create({ ...JDJ_EVENT });
    logger.log(`Created event "${JDJ_EVENT.name}" (id: ${created.id})`);
  }

  await app.close();
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});