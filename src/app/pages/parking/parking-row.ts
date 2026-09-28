export interface ParkingRow {
  space: number;
  unit: number | null;
  name: string | null;
  tag: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  data_confirmed: boolean;
}