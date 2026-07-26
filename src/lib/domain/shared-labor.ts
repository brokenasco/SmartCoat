export type SharedLaborFields = {
  workers: string;
  wageDollars: string;
  prepHours: string;
};

export function synchronizeRoomLabor<T extends SharedLaborFields>(rooms: T[]): T[] {
  if (!rooms.length) return rooms;
  const { workers, wageDollars, prepHours } = rooms[0];
  return rooms.map(room => ({ ...room, workers, wageDollars, prepHours }));
}

export function updateSharedLabor<T extends SharedLaborFields>(
  rooms: T[],
  patch: Partial<SharedLaborFields>,
): T[] {
  return rooms.map(room => ({ ...room, ...patch }));
}

export function sharedLaborFromFirstRoom<T extends SharedLaborFields>(rooms: T[]): SharedLaborFields {
  return rooms.length
    ? { workers: rooms[0].workers, wageDollars: rooms[0].wageDollars, prepHours: rooms[0].prepHours }
    : { workers: "2", wageDollars: "25.00", prepHours: "2" };
}
