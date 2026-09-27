export type OwnerPanelMode = 'edit' | 'new';

export interface OwnerRow {
  owner_id: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  cell: string | null;
  street: string | null;
  csz: string | null;
  is_admin: boolean;
  data_confirmed: boolean;
  updated_at: string | null;
  updated_by: string | null;
  uuid: string | null;
  units: string;
  unitList: { unit: number; owner_occupied: boolean }[];
}