#!/usr/bin/env node
/**
 * Rattrape le paiement FeexPay confirmé de Kiki gabine ADOUNNOU, jamais
 * enregistré (24/09/2026).
 *
 * Contexte : paiement MTN ref 064965ba-69ee-434b-ad76-60303de7ea6e abouti,
 * mais l'inscription JDJ n'a jamais été créée (le front ne soumet
 * `/registrations/public` qu'après avoir vu le statut SUCCESSFUL par polling ;
 * si la confirmation est faite après le délai / la page fermée / le poll
 * échoue, le dossier est perdu). Aucune inscription n'existe pour cette ref.
 *
 * L'email marianeaissi1993@gmail.com est déjà porté (téléphone 0167715293)
 * par le participant de JDJ-2026-000017 (Berekissou Zakari) : on ne touche
 * PAS à ce couple email/téléphone — le participant de Kiki est créé de façon
 * DÉDIÉE avec le téléphone du formulaire (0196595853), sinon le dédoublonnage
 * par email écraserait le dossier existant et perdrait la nouvelle ref.
 *
 * Usage (depuis backend/) :
 *   node scripts/register-adounnou-kiki.js
 *   node scripts/register-adounnou-kiki.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const isDryRun = process.argv.includes('--dry-run');

const EVENT_ID = '6aa3c8ec22b7300f5a9e6c57'; // Jeûne des Jeunes
const REGISTRATION_YEAR = 2026;
const COUNTER_KEY = `registration:${REGISTRATION_YEAR}`;

const PAYMENT_REF = '064965ba-69ee-434b-ad76-60303de7ea6e';
const PARTICIPANT = {
  firstName: 'Kiki gabine',
  lastName: 'ADOUNNOU',
  email: 'marianeaissi1993@gmail.com',
  phone: '+2290196595853',
  city: 'Cotonou',
  country: 'Bénin',
  church: 'Centre La Grâce Parle Jéricho',
  tshirtSize: 'XXL',
  pickupLocation: 'Centre La Grâce Parle Jericho',
};
const PAYMENT = {
  paymentNetwork: 'mtn',
  paymentPhone: '0167715293',
  paymentAmount: 7000,
};

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

  const already = await registrations.findOne({ paymentRef: PAYMENT_REF });
  if (already) {
    console.error(
      `\n[skip] Ref ${PAYMENT_REF} déjà utilisée par ${already.registrationNumber}.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  // Participant dédié (téléphone du formulaire) : on n'utilise pas l'email
  // pour le retrouver, celui-ci appartient déjà à Berekissou Zakari.
  const samePerson = await participants.findOne({
    phone: PARTICIPANT.phone,
  });
  if (samePerson) {
    console.error(
      `\n[skip] Un participant existe déjà avec le téléphone ${PARTICIPANT.phone} : ${samePerson.firstName} ${samePerson.lastName}.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const fullName = `${PARTICIPANT.firstName} ${PARTICIPANT.lastName}`.trim();
  const participantData = {
    ...PARTICIPANT,
    status: 'pending',
  };

  if (isDryRun) {
    console.log(
      `\n(dry-run) créerait le participant ${fullName} (${PARTICIPANT.email}, ${PARTICIPANT.phone})`,
    );
    const counter = await counters.findOne({ _id: COUNTER_KEY });
    console.log(
      `(dry-run) prochain n° inscription = ${prefix}-${REGISTRATION_YEAR}-${String((counter?.seq ?? 0) + 1).padStart(6, '0')}`,
    );
  } else {
    const inserted = await participants.insertOne({
      ...participantData,
      history: [{ action: 'created', at: new Date() }],
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const counter = await counters.findOneAndUpdate(
      { _id: COUNTER_KEY },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    const sequence = counter.seq;
    const registrationNumber =
      `${prefix}-${REGISTRATION_YEAR}-${String(sequence).padStart(6, '0')}`;

    const result = await registrations.insertOne({
      participant: String(inserted.insertedId),
      event: EVENT_ID,
      registrationNumber,
      code: generateCode(),
      status: 'pending',
      paymentRef: PAYMENT_REF,
      ...PAYMENT,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(
      '\nCréé :', registrationNumber, '|', fullName, '| id',
      result.insertedId, '| ref', PAYMENT_REF,
    );
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