import type { EventListQuery, IndexerStore } from "../db/store.js";

export async function listIndexedEvents(store: IndexerStore, query: EventListQuery) {
  return store.listEvents(query);
}
