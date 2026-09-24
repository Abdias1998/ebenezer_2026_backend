#!/usr/bin/env node
/**
 * Rattrape le paiement FeexPay confirmé de Marie-Ange GBONI, jamais enregistré
 * (24/09/2026).
 *
 * Contexte : paiement Moov ref 8833CC82-8744-471C-9D27-2451C6826E92 abouti,
 * mais l'inscription JDJ n'a jamais été créée (le front ne soumet
 * `/registrations/public` qu'après avoir vu le statut SUCCESSFUL par polling ;
 * si la confirmation est faite après le délai / la page fermée / le poll
 * échoue, le dossier est perdu). Aucun participant ni inscription n'existe en
 * base pour cet email/téléphone.
 *
 * Ce script (sur le modèle de register-missing-payments.js) crée :
 *   participant Marie-Ange GBONI + inscription JDJ-2026-0000XX
 *   avec la ref 8833CC82-8744-471C-9D27-2451C6826E92.
 *
 * Usage (depuis backend/) :
 *   node scripts/register-gboni-marie-ange.js
 *   node scripts/register-gboni-marie-ange.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const isDryRun = process.argv.includes('--dry-run');

const EVENT_ID = '6aa3c8ec22b7300f5a9e6c57'; // Jeûne des Jeunes
const REGISTRATION_YEAR = 2026;
const COUNTER_KEY = `registration:${REGISTRATION_YEAR}`;

const PAYMENT_REF = '8833CC82-8744-471C-9D27-2451C6826E92';
const PARTICIPANT = {
  firstName: 'Marie-Ange',
  lastName: 'GBONI',
  email: 'marieangegboni@gmail.com',
  phone: '002290194559393',
  city: 'Cotonou',
  country: 'Bénin',
  church: 'CENTRE LA GRÂCE PARLE',
  tshirtSize: 'M',
  pickupLocation: 'Centre La Grâce Parle Jericho',
};
const PAYMENT = {
  paymentNetwork: 'moov',
  paymentPhone: '0194559393',
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
    console.error(`\n[skip] Ref ${PAYMENT_REF} déjà utilisée par ${already.registrationNumber}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const samePerson = await participants.findOne({
    $or: [{ email: PARTICIPANT.email }, { phone: PARTICIPANT.phone }],
  });
  if (samePerson) {
    console.error(
      `\n[skip] Un participant existe déjà avec cet email/téléphone : ${samePerson.firstName} ${samePerson.lastName} (${samePerson.phone}).`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const fullName = `${PARTICIPANT.firstName} ${PARTICIPANT.lastName}`.trim();
  const participantData = {
    firstName: PARTICIPANT.firstName,
    lastName: PARTICIPANT.lastName,
    phone: PARTICIPANT.phone,
    email: PARTICIPANT.email,
    city: PARTICIPANT.city,
    country: PARTICIPANT.country,
    church: PARTICIPANT.church,
    tshirtSize: PARTICIPANT.tshirtSize,
    pickupLocation: PARTICIPANT.pickupLocation,
    status: 'pending',
  };

  if (isDryRun) {
    console.log(`\n(dry-run) créerait le participant ${fullName}` +
      ` (${PARTICIPANT.email}, ${PARTICIPANT.phone})`);
    const counter = await counters.findOne({ _id: COUNTER_KEY });
    console.log(`(dry-run) prochain n° inscription = ${prefix}-${REGISTRATION_YEAR}-${String((counter?.seq ?? 0) + 1).padStart(6, '0')}`);
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
    console.log('\nCréé :', registrationNumber, '|', fullName, '| id',
      result.insertedId, '| ref', PAYMENT_REF);
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