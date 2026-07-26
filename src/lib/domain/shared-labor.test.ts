import { describe, expect, it } from "vitest";
import { sharedLaborFromFirstRoom, synchronizeRoomLabor, updateSharedLabor } from "./shared-labor";

const rooms = [
  { id: "one", workers: "3", wageDollars: "24.00", prepHours: "2.5" },
  { id: "two", workers: "1", wageDollars: "18.00", prepHours: "0" },
];

describe("estimate-wide labor setup", () => {
  it("normalizes an inconsistent draft from Room 1", () => {
    expect(synchronizeRoomLabor(rooms)[1]).toMatchObject({ workers: "3", wageDollars: "24.00", prepHours: "2.5" });
  });

  it("synchronizes Room 1 labor changes to every room", () => {
    expect(updateSharedLabor(rooms, { wageDollars: "26.00" }).map(room => room.wageDollars)).toEqual(["26.00", "26.00"]);
  });

  it("preserves shared labor after Room 1 is removed", () => {
    const synchronized = synchronizeRoomLabor(rooms);
    const remaining = synchronized.slice(1);
    expect(sharedLaborFromFirstRoom(remaining)).toEqual({ workers: "3", wageDollars: "24.00", prepHours: "2.5" });
  });

  it("provides the shared setup for a newly added room", () => {
    expect(sharedLaborFromFirstRoom(synchronizeRoomLabor(rooms))).toEqual({ workers: "3", wageDollars: "24.00", prepHours: "2.5" });
  });
});
