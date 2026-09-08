// Header value matching formatNetFormBody's UTF-8 application/x-www-form-urlencoded output.
export const NetFormContentType = 'application/x-www-form-urlencoded;charset=UTF-8';

// Serializes a string record with the HTML form URL-encoding rules: insertion order is preserved,
// spaces become '+', and all other non-form-safe code points are percent encoded.
export function formatNetFormBody(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeFormComponent(key)}=${encodeFormComponent(value)}`)
    .join('&');
}

function encodeFormComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}
