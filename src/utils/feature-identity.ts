import { randomInt } from 'node:crypto';

// Approximately 59 bits of entropy; no central counter, ambiguous digits, or execution ordering.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FEATURE_ID_SOURCE =
  '(?:F[0-9]{3,}|[1-9][0-9]*|[A-HJ-NP-Z2-9]{12})';
export const FEATURE_FOLDER_PATTERN = new RegExp(
  `^(${FEATURE_ID_SOURCE})-(.+)$`,
  'i'
);
export function isFeatureId(value: string): boolean {
  return new RegExp(`^${FEATURE_ID_SOURCE}$`).test(value);
}
export function newLocalFeatureId(): string {
  // Start with a letter to keep local identifiers distinct from issue numbers.
  return (
    ALPHABET[randomInt(23)] +
    Array.from({ length: 11 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
      ''
    )
  );
}
