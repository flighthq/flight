export function countStatusEntriesSince(text: string, since: string): number;

export function getNewestStatusEntryDate(text: string): string | null;

export function getStatusDate(text: string, declaredUpdated: string | undefined): string | null;

export function getStatusEntryDates(text: string): string[];
