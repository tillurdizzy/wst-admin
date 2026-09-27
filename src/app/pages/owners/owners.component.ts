import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../services/supabase.service';
import { OwnerRow, OwnerPanelMode } from './owner-row';
import { OwnerPanelComponent } from './owner-panel/owner-panel.component';


@Component({
  selector: 'app-owners',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    ButtonModule,
    SelectModule,
    ToastModule,
    OwnerPanelComponent,
  ],
  templateUrl: './owners.component.html',
  styleUrl: './owners.component.scss',
  providers: [MessageService],
})
export class OwnersComponent implements OnInit {
  owners: OwnerRow[] = [];
  filtered: OwnerRow[] = [];
  selected: OwnerRow | null = null;
  panelMode: OwnerPanelMode = 'edit';
  loading = false;
  loadError = '';
  search = '';

  presets = [
    { label: 'All owners', value: 'all' },
    { label: 'Admins', value: 'admins' },
    { label: 'Unconfirmed', value: 'unconfirmed' },
    { label: 'No email', value: 'noemail' },
    { label: 'No Auth uuid', value: 'noauth' },
    { label: 'No unit linked', value: 'nounit' },
  ];
  preset = 'all';

  constructor(
    private supabase: SupabaseService,
    private messages: MessageService
  ) {}

  async ngOnInit() {
    await this.load();
  }

  async onPanelDeleted() {
    this.selected = null;
    this.panelMode = 'edit';
    await this.load();
  }

  startNewOwner() {
    this.selected = null;
    this.panelMode = 'new';
  }

  async onPanelSaved(ownerId: number | null) {
    await this.load();
    if (ownerId) {
      this.selected = this.owners.find((o) => o.owner_id === ownerId) ?? null;
      this.panelMode = 'edit';
    }
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
      return;
    }

    const { data: links, error: linkError } = await this.supabase.client
      .from('unit_owners')
      .select('unit, owner_id');

    if (linkError) {
      this.messages.add({ severity: 'warn', summary: 'Unit links failed', detail: linkError.message });
    }

    const occupied = new Map<number, boolean>();
    const { data: unitRows } = await this.supabase.client
      .from('units')
      .select('unit, owner_occupied');
    for (const u of unitRows ?? []) {
      occupied.set(u.unit, !!u.owner_occupied);
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
  }

  applyFilters() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.owners.filter((o) => {
      if (this.preset === 'admins' && !o.is_admin) return false;
      if (this.preset === 'unconfirmed' && o.data_confirmed) return false;
      if (this.preset === 'noemail' && o.email) return false;
      if (this.preset === 'noauth' && o.uuid) return false;
      if (this.preset === 'nounit' && o.unitList.length > 0) return false;
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
    this.panelMode = 'edit';
    this.selected = Array.isArray(row) ? row[0] ?? null : row;
  }
}