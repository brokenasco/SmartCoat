import { describe, expect, it } from "vitest";
import { calculateCompletion } from "./progress-editor";

describe("approved room completion", () => {
  it.each([
    [0,0],[1,25],[2,50],[3,75],[4,100],
  ])("derives %i completed rooms as %i percent", (completed, expected) => {
    const rooms=Array.from({length:4},(_,index)=>({isCompleted:index<completed}));
    expect(calculateCompletion(rooms).completionPercentage).toBe(expected);
  });
  it("returns zero for an approved estimate with no rooms", () => {
    expect(calculateCompletion([])).toEqual({completedRooms:0,totalRooms:0,completionPercentage:0});
  });
  it("decreases after a completed room is unchecked", () => {
    expect(calculateCompletion([
      {isCompleted:true},{isCompleted:true},{isCompleted:false},{isCompleted:false},
    ]).completionPercentage).toBe(50);
  });
});
