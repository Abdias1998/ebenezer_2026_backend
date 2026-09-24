#!/usr/bin/env node
/**
 * Rattrape le paiement FeexPay confirmé de Ronald SEDOMON, jamais enregistré.
 *
 * Contexte : paiement MTN ref a129b60c-c00c-4c5f-9553-aea2ccd5f520 abouti,
 * mais l'inscription JDJ n'a jamais été créée (le front ne soumet
 * `/registrations/public` qu'après avoir vu le statut SUCCESSFUL par polling ;
 * si la confirmation arrive après le délai / la page fermée / le poll échoue,
 * le dossier est perdu).
 *
 * Usage (depuis backend/) :
 *   node scripts/register-sedomon-ronald.js
 *   node scripts/register-sedomon-ronald.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const crypto = require('crypto');

const isDryRun = process.argv.includes('--dry-run');

const EVENT_ID = '6aa3c8ec22b7300f5a9e6c57'; // Jeûne des Jeunes
const REGISTRATION_YEAR = 2026;
const COUNTER_KEY = `registration:${REGISTRATION_YEAR}`;

const PAYMENT_REF = 'a129b60c-c00c-4c5f-9553-aea2ccd5f520';
const PARTICIPANT = {
  firstName: 'Ronald',
  lastName: 'SEDOMON',
  email: 'sedronald@gmail.com',
  phone: '+2290152000079',
  city: 'Cotonou',
  country: 'Bénin',
  church: '',
  tshirtSize: 'XL',
  pickupLocation: 'CEG Godomey',
};
const PAYMENT = {
  paymentNetwork: 'mtn',
  paymentPhone: '0152000079',
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

  const sameName = (a, b) =>
    (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

  const byPhone = await participants.findOne({ phone: PARTICIPANT.phone });
  const byEmail = await participants.findOne({ email: PARTICIPANT.email });

  let dedicated = false;
  if (
    byPhone &&
    (!sameName(byPhone.firstName, PARTICIPANT.firstName) ||
      !sameName(byPhone.lastName, PARTICIPANT.lastName))
  ) {
    // Coordonnées partagées : le numéro appartient à un autre participant
    // (ex. Eunice KOUNOUDJI). On crée un dossier DÉDIÉ pour Ronald, sinon le
    // rattrapage écraserait le dossier existant et perdrait sa ref.
    console.log(
      `\n[info] Le téléphone ${PARTICIPANT.phone} est porté par ${byPhone.firstName} ${byPhone.lastName} (autre personne) : participant dédié créé pour ${PARTICIPANT.firstName} ${PARTICIPANT.lastName}.`,
    );
    dedicated = true;
  }
  if (!dedicated && byEmail) {
    // Même personne retrouvée par email : on réutilise son dossier.
    console.log(
      `\n[info] Participant existant retrouvé par email : ${byEmail.firstName} ${byEmail.lastName}.`,
    );
  }

  const fullName = `${PARTICIPANT.firstName} ${PARTICIPANT.lastName}`.trim();
  const participantData = {
    ...PARTICIPANT,
    status: 'confirmed',
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
    let inserted;
    if (byEmail && !dedicated) {
      inserted = { insertedId: byEmail._id };
    } else {
      const res = await participants.insertOne({
        ...participantData,
        history: [{ action: 'created', at: new Date() }],
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      inserted = { insertedId: res.insertedId };
    }

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
      status: 'confirmed',
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