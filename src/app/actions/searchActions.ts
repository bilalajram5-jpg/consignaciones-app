'use server';

import { requireUser } from '@/auth/session';
import { globalSearch } from '@/services/searchService';

export async function globalSearchAction(query: string) {
  await requireUser();
  return globalSearch(query);
}
