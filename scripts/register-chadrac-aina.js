#!/usr/bin/env node
/**
 * Rattrape le paiement FeexPay confirmé de CHADRAC AINA, jamais enregistré.
 *
 * Contexte : paiement MTN ref 2aa7092c-6c15-4848-810e-0d12115d00c4 abouti,
 * mais l'inscription JDJ n'a jamais été créée (le front ne soumet
 * `/registrations/public` qu'après avoir vu le statut SUCCESSFUL par polling ;
 * si la confirmation est faite après le délai / la page fermée / le poll
 * échoue, le dossier est perdu).
 *
 * Usage (depuis backend/) :
 *   node scripts/register-chadrac-aina.js
 *   node scripts/register-chadrac-aina.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const isDryRun = process.argv.includes('--dry-run');

const EVENT_ID = '6aa3c8ec22b7300f5a9e6c57'; // Jeûne des Jeunes
const REGISTRATION_YEAR = 2026;
const COUNTER_KEY = `registration:${REGISTRATION_YEAR}`;

const PAYMENT_REF = '2aa7092c-6c15-4848-810e-0d12115d00c4';
const PARTICIPANT = {
  firstName: 'CHADRAC',
  lastName: 'AINA',
  email: 'chadracaina98@gmail.com',
  phone: '+2290194606762',
  city: 'Abomey-Calavi',
  country: 'Bénin',
  church: 'LA GRÂCE PARLE',
  tshirtSize: 'L',
  pickupLocation: 'Centre La Grâce Parle Jericho',
};
const PAYMENT = {
  paymentNetwork: 'mtn',
  paymentPhone: '0146167140',
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

  const samePerson = await participants.findOne({
    $or: [{ phone: PARTICIPANT.phone }, { email: PARTICIPANT.email }],
  });
  if (samePerson) {
    console.error(
      `\n[skip] Un participant existe déjà (${samePerson.phone} / ${samePerson.email}) : ${samePerson.firstName} ${samePerson.lastName}.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const fullName = `${PARTICIPANT.firstName} ${PARTICIPANT.lastName}`.trim();
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
      ...PARTICIPANT,
      status: 'pending',
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