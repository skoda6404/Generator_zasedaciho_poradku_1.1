
export type DeskType = string;

export type Desk = DeskType | null;

// Fix: Updated SeatingChart type to correctly represent the data structure from the Gemini API.
// A desk position can be null for an empty space, so it's an array of (desk | null),
// where a desk is an array of student seats (string | null).
export type SeatingChart = ((string | null)[] | null)[][];

export interface LayoutObject {
  id: string;
  type: string;
  x: number; // position in grid units
  y: number; // position in grid units
  width: number; // size in grid units
  height: number; // size in grid units
  rotation?: number; // 0 or 90 degrees
  students?: (string | null)[];
  userBlockedSeats?: number[];
}

export interface SavedClassroom {
    name: string;
    layout: LayoutObject[];
    arrangement?: LayoutObject[] | null;
}