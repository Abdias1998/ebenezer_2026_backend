#!/usr/bin/env node
/**
 * Rattrape deux paiements FeexPay confirmés jamais enregistrés (24/09/2026).
 *
 * Contexte : deux dossiers ont été soumis sur l'événement « Jeûne des Jeunes »
 * avec le MÊME email/téléphone du payeur (marianeaissi1993@gmail.com /
 * +2290167715293). Dans completeRegistration(), la recherche du participant
 * par email/phone (registrations.service.ts:193) a réutilisé le participant de
 * Casimir HOUNNOU déjà en base ; la deuxième étape findByParticipantAndEvent a
 * alors levé « Vous êtes déjà inscrit(e) » et les deux refs payées n'ont donné
 * aucune inscription.
 *
 * Ce script (sur le modèle de register-missing-payments.js) :
 *   1. crée un second billet pour CASIMIR HOUNNOU : nouveau participant dédié
 *      (l'index (participant, event) est unique) + inscription JDJ-2026-000057
 *      avec la ref ad6f0260-bfa1-4a82-9413-d8f084438a7a ;
 *   2. crée PAMELA HESSOU : participant + inscription JDJ-2026-000058 avec la
 *      ref ae3557c6-4783-45c2-871c-27e02afc532f.
 *
 * Usage (depuis backend/) :
 *   node scripts/register-casimir-pamela.js
 *   node scripts/register-casimir-pamela.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const isDryRun = process.argv.includes('--dry-run');

const EVENT_ID = '6aa3c8ec22b7300f5a9e6c57'; // Jeûne des Jeunes
const REGISTRATION_YEAR = 2026;
const COUNTER_KEY = `registration:${REGISTRATION_YEAR}`;

// Coordonnées partagées du payeur (identiques aux deux dossiers soumis).
const shared = {
  email: 'marianeaissi1993@gmail.com',
  phone: '+2290167715293',
  city: 'Cotonou',
  country: 'Bénin',
  church: 'Centre La Grâce Parle Jéricho',
  paymentNetwork: 'mtn',
  paymentPhone: '0167715293',
  paymentAmount: 7000,
};

const TICKETS = [
  {
    paymentRef: 'ad6f0260-bfa1-4a82-9413-d8f084438a7a', // 2e billet Casimir
    participant: {
      firstName: 'Casimir',
      lastName: 'HOUNNOU',
      tshirtSize: 'L',
      pickupLocation: 'Centre La Grâce Parle Jericho',
    },
  },
  {
    paymentRef: 'ae3557c6-4783-45c2-871c-27e02afc532f', // Pamela HESSOU
    participant: {
      firstName: 'Pamela',
      lastName: 'HESSOU',
      tshirtSize: 'XL',
      pickupLocation: 'Centre La Grâce Parle Jericho',
    },
  },
];

function generateCode() {
  return crypto.randomBytes(16).toString('hex');
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans le fichier .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const registrations = db.collection('registrations');
  const participants = db.collection('participants');
  const counters = db.collection('counters');

  const event = await db.collection('events').findOne({
    _id: new mongoose.Types.ObjectId(EVENT_ID),
  });
  if (!event) {
    console.error(`Événement ${EVENT_ID} introuvable.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const prefix = event.registrationPrefix || 'EBEN';
  console.log('Événement :', event.name, `(préfixe ${prefix})`);

  for (const ticket of TICKETS) {
    const { paymentRef, participant } = ticket;
    const fullName = `${participant.firstName} ${participant.lastName}`.trim();

    const already = await registrations.findOne({ paymentRef });
    if (already) {
      console.log(`\n[skip] Ref ${paymentRef} déjà utilisée par ${already.registrationNumber}.`);
      continue;
    }

    // Participant dédié : jamais réutilisé par email/phone (l'index
    // (participant, event) est unique -> un participant = un billet).
    const participantData = {
      firstName: participant.firstName,
      lastName: participant.lastName,
      phone: shared.phone,
      email: shared.email,
      city: shared.city,
      country: shared.country,
      church: shared.church,
      tshirtSize: participant.tshirtSize,
      pickupLocation: participant.pickupLocation,
      status: 'pending',
    };

    let participantDoc;
    if (isDryRun) {
      console.log(`\n(dry-run) créerait le participant ${fullName}`
        + ` (${participant.tshirtSize}, ${participant.pickupLocation})`);
    } else {
      const inserted = await participants.insertOne({
        ...participantData,
        history: [{ action: 'created', at: new Date() }],
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      participantDoc = { _id: inserted.insertedId };

      const counter = await counters.findOneAndUpdate(
        { _id: COUNTER_KEY },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
      const sequence = counter.seq;
      const registrationNumber =
        `${prefix}-${REGISTRATION_YEAR}-${String(sequence).padStart(6, '0')}`;

      const result = await registrations.insertOne({
        participant: String(participantDoc._id),
        event: EVENT_ID,
        registrationNumber,
        code: generateCode(),
        status: 'pending',
        paymentRef,
        paymentNetwork: shared.paymentNetwork,
        paymentPhone: shared.paymentPhone,
        paymentAmount: shared.paymentAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('\nCréé :', registrationNumber, '|', fullName, '| id',
        result.insertedId, '| ref', paymentRef);
    }
  }

  await mongoose.disconnect();

  if (isDryRun) {
    console.log('\nMode dry-run : aucune modification. Relancez sans --dry-run pour appliquer.');
  } else {
    console.log('\nTerminé.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});