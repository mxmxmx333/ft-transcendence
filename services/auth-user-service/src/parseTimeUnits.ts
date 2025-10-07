const UNIT: Record<string, number> = {
  '': 1,
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

export function parseDurationToSec(input: string): number {
  if (typeof input !== 'string') throw new Error('duration must be a string');
  const s = input.trim();
  if (s === '') throw new Error('duration is empty');

  const last = s[s.length - 1]!.toLowerCase();
  const hasUnit = last >= 'a' && last <= 'z';

  const unit = hasUnit ? last : '';
  const numberPart = hasUnit ? s.slice(0, -1).trim() : s;

  //   only digits in number part
  if (!/^\d+$/.test(numberPart)) {
    throw new Error(`invalid duration number part: "${numberPart}"`);
  }

  const n = Number(numberPart);
  if (!Number.isFinite(n)) throw new Error('invalid duration number');

  const mult = UNIT[unit as keyof typeof UNIT];
  if (mult === undefined) {
    throw new Error(`unknown duration unit "${unit}" (use s|m|h|d${UNIT[''] ? ' or omit' : ''})`);
  }

  const seconds = n * mult;
  if (!Number.isSafeInteger(seconds)) {
    throw new Error('duration seconds overflow');
  }
  return seconds;
}
