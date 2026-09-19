#!/usr/bin/env node
/**
 * Corrige le participant lié à l'inscription JDJ-2026-000017.
 *
 * Contexte : les tentatives de rattrapage du 12/09/2026 ont écrasé les
 * données réelles du participant avec des valeurs de test « X ».
 * Ce script restaure les valeurs exactes fournies :
 *   - prénom/nom : Berekissou / Zakari
 *   - email      : marianeaissi1993@gmail.com
 *   - téléphone  : 2290167715293
 *   - ville      : Cotonou
 *   - pays       : Bénin
 *   - église     : Centre La Grâce Parle Jéricho
 *   - prise en charge : Centre La Grâce Parle Jericho
 *   - t-shirt    : XL
 *
 * Usage (depuis le dossier backend/) :
 *   node scripts/fix-registration-000017.js
 *   node scripts/fix-registration-000017.js --dry-run   # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const isDryRun = process.argv.includes('--dry-run');

const REGISTRATION_NUMBER = 'JDJ-2026-000017';

const PATCH = {
  firstName: 'Berekissou',
  lastName: 'Zakari',
  email: 'marianeaissi1993@gmail.com',
  phone: '2290167715293',
  city: 'Cotonou',
  country: 'Bénin',
  church: 'Centre La Grâce Parle Jéricho',
  pickupLocation: 'Centre La Grâce Parle Jericho',
  tshirtSize: 'XL',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans le fichier .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log('Connecté à la base :', db.databaseName);

  const registrations = db.collection('registrations');
  const registration = await registrations.findOne({
    registrationNumber: REGISTRATION_NUMBER,
  });
  if (!registration) {
    console.error(`Inscription ${REGISTRATION_NUMBER} introuvable.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (!registration.participant) {
    console.error('Cette inscription n\u2019a pas de participant rattaché.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const participants = db.collection('participants');
  const participant = await participants.findOne({ _id: registration.participant });
  if (!participant) {
    console.error('Participant introuvable.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Inscription :', REGISTRATION_NUMBER);
  console.log('Participant _id :', registration.participant.toString());
  console.log('Avant :');
  console.log(JSON.stringify(pick(participant), null, 2));

  if (isDryRun) {
    console.log('\nMode dry-run : aucune modification.');
    await mongoose.disconnect();
    return;
  }

  const result = await participants.updateOne(
    { _id: registration.participant },
    { $set: PATCH },
  );
  console.log('\nRésultat :', `${result.matchedCount} trouvé(s), ${result.modifiedCount} modifié(s)`);

  const after = await participants.findOne({ _id: registration.participant });
  console.log('\nAprès :');
  console.log(JSON.stringify(pick(after), null, 2));

  await mongoose.disconnect();
}

function pick(participant) {
  const { _id, firstName, lastName, email, phone, whatsapp, city, country, church, tshirtSize, pickupLocation, status } = participant;
  return { _id, firstName, lastName, email, phone, whatsapp, city, country, church, tshirtSize, pickupLocation, status };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});