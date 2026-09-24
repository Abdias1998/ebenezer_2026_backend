#!/usr/bin/env node
/**
 * Rattrape les inscriptions JDJ « payées mais absentes de la liste ».
 *
 * Contexte (23/09/2026) : 4 inscriptions ont été payées via FeexPay avec le
 * même email (fangbedjide@gmail.com). Le dédoublonnage du participant par
 * email dans completeRegistration() a réutilisé/écrasé le MÊME participant
 * pour les 4 dossiers -> une seule inscription (JDJ-2026-000042) a abouti et
 * son participant a fini avec les données du dernier dossier tenté
 * (ANDERICHE DJITRINOU), tandis que les 3 autres paiements confirmés
 * n'ont jamais créé d'inscription.
 *
 * Ce script :
 *   1. corrige le participant lié à JDJ-2026-000042 (ref d8448a80...) pour
 *      FANGBEDJI DIEU-MERCI BENJAMIN ;
 *   2. crée les participants + inscriptions manquants pour SALOMON, BERGER
 *      et SIMEON avec leurs références de paiement FeexPay.
 *
 * Les numéros d'inscription sont alloués via le compteur `registration:2026`
 * comme le fait le backend (JDJ-2026-000044, 000045, 000046).
 *
 * Usage (depuis le dossier backend/) :
 *   node scripts/register-missing-payments.js
 *   node scripts/register-missing-payments.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const isDryRun = process.argv.includes('--dry-run');

const EVENT_ID = '6aa3c8ec22b7300f5a9e6c57'; // Jeûne des Jeunes
const REGISTRATION_YEAR = 2026;
const COUNTER_KEY = `registration:${REGISTRATION_YEAR}`;

const shared = {
  email: 'fangbedjide@gmail.com',
  city: 'Abomey-calavi',
  country: 'Bénin',
  church: "ARCHE D'ALLIANCE MINISTRY",
  paymentNetwork: 'mtn',
  paymentPhone: '0161343244',
  paymentAmount: 7000,
};

// Inscription déjà présente en base mais avec un participant écrasé.
const FIX_REGISTRATION = {
  registrationNumber: 'JDJ-2026-000042',
  paymentRef: 'd8448a80-7443-419f-900e-030a884d4755',
  participantPatch: {
    firstName: 'DIEU-MERCI BENJAMIN',
    lastName: 'FANGBEDJI',
    phone: '+2290161343244',
    tshirtSize: 'M',
    pickupLocation: 'CEG Godomey',
    email: shared.email,
    city: shared.city,
    country: shared.country,
    church: shared.church,
  },
};

// Inscriptions à créer (références FeexPay payées, jamais enregistrées).
const MISSING_REGISTRATIONS = [
  {
    paymentRef: 'a76e0ee3-45b2-4cd3-aec9-9d093464a1a7',
    participant: {
      firstName: 'ANDERICHE',
      lastName: 'DJITRINOU',
      phone: '+2290162115737',
      tshirtSize: 'XL',
      pickupLocation: 'CEG Godomey',
    },
    createdAt: new Date('2026-09-23T15:56:00.000Z'),
  },
  {
    paymentRef: 'd385c62b-9861-4721-95c1-4e960a060bf8',
    participant: {
      firstName: 'SALOMON SAMSON',
      lastName: 'FANGBEDJI',
      phone: '+2290167585604',
      tshirtSize: 'XL',
      pickupLocation: 'CEG Godomey',
    },
    createdAt: new Date('2026-09-23T15:40:00.000Z'),
  },
  {
    paymentRef: 'c90216e5-c5df-403e-a2ec-a08a7f66adf8',
    participant: {
      firstName: 'BERGER',
      lastName: 'GBAHOUNGBA',
      phone: '+2290163076969',
      tshirtSize: 'XL',
      pickupLocation: 'Carrefour Cococodji',
    },
    createdAt: new Date('2026-09-23T15:45:00.000Z'),
  },
  {
    paymentRef: '31cf5899-88f2-4b4b-a1b1-1dce56a7112e',
    participant: {
      firstName: 'SIMEON CALEB',
      lastName: 'AZONGLATO',
      phone: '+2290194976626',
      tshirtSize: 'XL',
      pickupLocation: 'CEG Godomey',
    },
    createdAt: new Date('2026-09-23T15:52:00.000Z'),
  },
];

function generateCode() {
  return crypto.randomBytes(16).toString('hex');
}

function pickParticipant(p) {
  const {
    _id, firstName, lastName, phone, email, city, country,
    church, tshirtSize, pickupLocation, status,
  } = p;
  return {
    _id, firstName, lastName, phone, email, city, country,
    church, tshirtSize, pickupLocation, status,
  };
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

  /* ---------- 1. Corriger le participant de l'inscription existante ---------- */
  const existing = await registrations.findOne({
    paymentRef: FIX_REGISTRATION.paymentRef,
  });
  if (!existing) {
    console.error(
      `Aucune inscription avec la ref ${FIX_REGISTRATION.paymentRef} (attendue ${FIX_REGISTRATION.registrationNumber}).`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }
  const existingParticipant = await participants.findOne({
    _id: new mongoose.Types.ObjectId(String(existing.participant)),
  });
  if (!existingParticipant) {
    console.error('Participant lié intangible, abandon.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('\n[1] Corrige le participant de', existing.registrationNumber,
    '(ref', FIX_REGISTRATION.paymentRef + ')');
  console.log('Avant :', JSON.stringify(pickParticipant(existingParticipant)));
  if (!isDryRun) {
    await participants.updateOne(
      { _id: existingParticipant._id },
      { $set: FIX_REGISTRATION.participantPatch },
    );
  }
  console.log('Après :', JSON.stringify(pickParticipant({
    ...existingParticipant,
    ...FIX_REGISTRATION.participantPatch,
  })));

  /* ---------- 2. Créer les inscriptions manquantes ---------- */
  for (const item of MISSING_REGISTRATIONS) {
    const { paymentRef, participant, createdAt } = item;

    const already = await registrations.findOne({ paymentRef });
    if (already) {
      console.log(`\n[skip] Ref ${paymentRef} déjà utilisée par ${already.registrationNumber}.`);
      continue;
    }

    // Participant : un par numéro (téléphone dédié), évite la réutilisation
    // par email d'un dossier existant.
    let participantDoc = await participants.findOne({
      phone: participant.phone,
    });
    const participantData = {
      firstName: participant.firstName,
      lastName: participant.lastName,
      phone: participant.phone,
      email: shared.email,
      city: shared.city,
      country: shared.country,
      church: shared.church,
      tshirtSize: participant.tshirtSize,
      pickupLocation: participant.pickupLocation,
      status: 'pending',
    };

    if (!participantDoc) {
      if (isDryRun) {
        console.log(`\n[2] (dry-run) créerait le participant`, participant.firstName,
          participant.lastName, `(${participant.phone})`);
      } else {
        const inserted = await participants.insertOne({
          ...participantData,
          history: [{ action: 'created', at: new Date() }],
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        participantDoc = { _id: inserted.insertedId };
      }
    } else {
      console.log(`\n[2] Participant ${participant.firstName} ${participant.lastName}`
        + ' déjà présent, on le réutilise.');
    }

    if (!isDryRun) {
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
        createdAt: createdAt ?? new Date(),
        updatedAt: createdAt ?? new Date(),
      });
      console.log('Créé :', registrationNumber, '|', participant.firstName,
        participant.lastName, '| id', result.insertedId, '| ref', paymentRef);
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