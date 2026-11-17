const { HttpError } = require('./helpers');

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

/**
 * Validates proposal line items and computes the total server-side in integer cents.
 * Client-supplied totals are never trusted. Returns { items, totalCents }.
 */
function parseLineItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100)
    throw new HttpError(400, 'Provide between 1 and 100 line items');
  let totalCents = 0;
  const items = raw.map((li, i) => {
    const name = typeof li?.name === 'string' ? li.name.trim() : '';
    const qty = Number(li?.qty);
    const price = Number(li?.price);
    if (!name || name.length > 255) throw new HttpError(400, `Line item ${i + 1}: name is required`);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e6) throw new HttpError(400, `Line item ${i + 1}: invalid qty`);
    if (!Number.isFinite(price) || price < 0 || price > 1e9) throw new HttpError(400, `Line item ${i + 1}: invalid price`);
    totalCents += Math.round(qty * price * 100);
    return { name, qty, price };
  });
  if (totalCents <= 0) throw new HttpError(400, 'Proposal total must be greater than zero');
  if (totalCents > 1e12) throw new HttpError(400, 'Proposal total is too large');
  return { items, totalCents };
}

const centsToAmount = (c) => (c / 100).toFixed(2);

module.exports = { parseLineItems, centsToAmount, CURRENCIES };
