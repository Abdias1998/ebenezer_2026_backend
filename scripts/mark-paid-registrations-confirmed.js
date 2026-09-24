#!/usr/bin/env node
/**
 * Passe toutes les inscriptions « payées » (paymentRef présent) de `pending`
 * à `confirmed`.
 *
 * Contexte : les billets sont créés en statut `pending` même après paiement
 * confirmé. Ce script synchronise le statut en fonction de la présence d'une
 * référence de paiement FeexPay.
 *
 * Usage (depuis backend/) :
 *   node scripts/mark-paid-registrations-confirmed.js
 *   node scripts/mark-paid-registrations-confirmed.js --dry-run # sans modifier
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant dans le fichier .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const registrations = db.collection('registrations');

  const candidates = await registrations
    .find({
      paymentRef: { $exists: true, $ne: null },
      status: 'pending',
    })
    .toArray();

  console.log(`Inscriptions payées en attente : ${candidates.length}`);

  for (const reg of candidates) {
    console.log(
      `  - ${reg.registrationNumber} | ref ${reg.paymentRef}`,
    );
  }

  if (isDryRun) {
    console.log('\nMode dry-run : aucune modification. Relancez sans --dry-run pour appliquer.');
    await mongoose.disconnect();
    return;
  }

  if (candidates.length > 0) {
    const result = await registrations.updateMany(
      {
        paymentRef: { $exists: true, $ne: null },
        status: 'pending',
      },
      { $set: { status: 'confirmed', updatedAt: new Date() } },
    );
    console.log(
      `\nPassées à "confirmed" : ${result.modifiedCount} inscription(s).`,
    );
  } else {
    console.log('\nRien à modifier.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});