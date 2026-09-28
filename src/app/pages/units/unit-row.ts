export type DotStatus = 'green' | 'red' | 'yellow';

export interface UnitOwnerInfo {
  owner_id: number;
  firstname: string | null;
  lastname: string | null;
  street: string | null;
  csz: string | null;
  cell: string | null;
  email: string | null;
  data_confirmed: boolean;
  uuid: string | null;
}

export interface UnitResident {
  id: number;
  firstname: string | null;
  lastname: string | null;
  cell: string | null;
  email: string | null;
  data_confirmed: boolean;
}

export interface UnitVehicle {
  id: number;
  make: string | null;
  model: string | null;
  color: string | null;
  tag: string | null;
  data_confirmed: boolean;
}

export interface UnitRow {
  unit: number;
  street: string | null;
  bdrms: number | null;
  sqft: number | null;
  num: string | number | null;
  owner_occupied: boolean;
  owner: UnitOwnerInfo | null;
  ownerName: string;
}