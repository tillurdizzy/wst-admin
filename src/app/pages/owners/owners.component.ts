import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../services/supabase.service';

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

@Component({
  selector: 'app-owners',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    ButtonModule,
    CheckboxModule,
    SelectModule,
    DialogModule,
    ToastModule,
  ],
  templateUrl: './owners.component.html',
  styleUrl: './owners.component.scss',
  providers: [MessageService],
})
export class OwnersComponent implements OnInit {
  owners: OwnerRow[] = [];
  filtered: OwnerRow[] = [];
  selected: OwnerRow | null = null;
  loading = false;
  loadError = '';
  search = '';
  assignUnit = '';
  saving = false;

  editDialog = false;
  editKind: 'name' | 'address' | 'phone' | 'email' | null = null;
  editDraft: any = {};

  presets = [
    { label: 'All owners', value: 'all' },
    { label: 'Admins', value: 'admins' },
    { label: 'Unconfirmed', value: 'unconfirmed' },
    { label: 'No email', value: 'noemail' },
    { label: 'No Auth uuid', value: 'noauth' },
  ];
  preset = 'all';

  constructor(
    private supabase: SupabaseService,
    private messages: MessageService
  ) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.loadError = '';

    const { data: owners, error } = await this.supabase.client
      .from('owners')
      .select('owner_id, firstname, lastname, email, cell, street, csz, is_admin, data_confirmed, updated_at, updated_by, uuid')
      .order('lastname', { ascending: true });

    if (error) {
      this.loading = false;
      this.loadError = error.message;
      this.owners = [];
      this.filtered = [];
      this.messages.add({ severity: 'error', summary: 'Owners load failed', detail: error.message });
      console.error('owners select', error);
      return;
    }

    const { data: links, error: linkError } = await this.supabase.client
      .from('unit_owners')
      .select('unit, owner_id');

    if (linkError) {
      console.warn('unit_owners select', linkError);
      this.messages.add({ severity: 'warn', summary: 'Unit links failed', detail: linkError.message });
    }

    const occupied = new Map<number, boolean>();
    const { data: unitRows, error: unitError } = await this.supabase.client
      .from('units')
      .select('unit, owner_occupied');

    if (unitError) {
      console.warn('units select', unitError);
    } else {
      for (const u of unitRows ?? []) {
        occupied.set(u.unit, !!u.owner_occupied);
      }
    }

    const byOwner = new Map<number, { unit: number; owner_occupied: boolean }[]>();
    for (const row of links ?? []) {
      const list = byOwner.get(row.owner_id) ?? [];
      list.push({ unit: row.unit, owner_occupied: occupied.get(row.unit) ?? false });
      byOwner.set(row.owner_id, list);
    }

    this.owners = (owners ?? []).map((o: any) => {
      const unitList = (byOwner.get(o.owner_id) ?? []).sort((a, b) => a.unit - b.unit);
      return {
        ...o,
        unitList,
        units: unitList.map((u) => u.unit).join(', '),
      } as OwnerRow;
    });

    this.applyFilters();
    if (this.selected) {
      this.selected = this.owners.find((o) => o.owner_id === this.selected!.owner_id) ?? null;
    }
    this.loading = false;
    console.log('owners loaded', this.owners.length);
  }

  applyFilters() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.owners.filter((o) => {
      if (this.preset === 'admins' && !o.is_admin) return false;
      if (this.preset === 'unconfirmed' && o.data_confirmed) return false;
      if (this.preset === 'noemail' && o.email) return false;
      if (this.preset === 'noauth' && o.uuid) return false;
      if (!q) return true;
      const hay = [
        o.lastname,
        o.firstname,
        o.units,
        o.email,
        o.cell,
        o.street,
        o.csz,
        String(o.owner_id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  onSearch() {
    this.applyFilters();
  }

  onPreset() {
    this.applyFilters();
  }

  onRowSelect(event: { data?: OwnerRow | OwnerRow[] }) {
    const row = event?.data;
    if (!row) {
      return;
    }
    this.selected = Array.isArray(row) ? row[0] ?? null : row;
  }

  openEdit(kind: 'name' | 'address' | 'phone' | 'email') {
    if (!this.selected) return;
    this.editKind = kind;
    this.editDraft = {
      firstname: this.selected.firstname ?? '',
      lastname: this.selected.lastname ?? '',
      street: this.selected.street ?? '',
      csz: this.selected.csz ?? '',
      cell: this.selected.cell ?? '',
      email: this.selected.email ?? '',
    };
    this.editDialog = true;
  }

  async saveEdit() {
    if (!this.selected || !this.editKind) return;
    this.saving = true;
    const patch: any = {
      updated_by: this.supabase.user()?.email ?? null,
    };
    if (this.editKind === 'name') {
      patch.firstname = this.editDraft.firstname;
      patch.lastname = this.editDraft.lastname;
    } else if (this.editKind === 'address') {
      patch.street = this.editDraft.street;
      patch.csz = this.editDraft.csz;
    } else if (this.editKind === 'phone') {
      patch.cell = this.editDraft.cell;
    } else if (this.editKind === 'email') {
      patch.email = this.editDraft.email || null;
    }

    const { error } = await this.supabase.client
      .from('owners')
      .update(patch)
      .eq('owner_id', this.selected.owner_id);

    this.saving = false;
    if (error) {
      this.messages.add({ severity: 'error', summary: 'Save failed', detail: error.message });
      return;
    }
    this.editDialog = false;
    await this.load();
  }

  async toggleOccupied(unit: number, occupied: boolean) {
    if (!this.selected) return;
    const { error } = await this.supabase.client
      .from('units')
      .update({ owner_occupied: occupied })
      .eq('unit', unit);
    if (error) {
      this.messages.add({ severity: 'error', summary: 'Update failed', detail: error.message });
      await this.load();
    }
  }

  async assignAnotherUnit() {
    if (!this.selected) return;
    const unit = Number(this.assignUnit);
    if (!unit) {
      this.messages.add({ severity: 'warn', summary: 'Unit required', detail: 'Enter a unit number.' });
      return;
    }

    const { data: existing, error: findError } = await this.supabase.client
      .from('unit_owners')
      .select('unit, owner_id')
      .eq('unit', unit)
      .maybeSingle();

    if (findError) {
      this.messages.add({ severity: 'error', summary: 'Assign failed', detail: findError.message });
      return;
    }

    if (!existing) {
      this.messages.add({
        severity: 'error',
        summary: 'Unknown unit',
        detail: 'That unit is not in unit_owners. Do not insert a new link row.',
      });
      return;
    }

    const { error } = await this.supabase.client
      .from('unit_owners')
      .update({ owner_id: this.selected.owner_id })
      .eq('unit', unit);

    if (error) {
      this.messages.add({ severity: 'error', summary: 'Assign failed', detail: error.message });
      return;
    }

    this.assignUnit = '';
    await this.load();
    this.messages.add({ severity: 'success', summary: 'Assigned', detail: `Unit ${unit} now belongs to this owner.` });
  }
}