import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../services/supabase.service';
import { UnitRow, UnitOwnerInfo } from './unit-row';
import { UnitPanelComponent } from './unit-panel/unit-panel.component';

@Component({
  selector: 'app-units',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    SelectModule,
    ToastModule,
    UnitPanelComponent,
  ],
  templateUrl: './units.component.html',
  styleUrl: './units.component.scss',
  providers: [MessageService],
})
export class UnitsComponent implements OnInit {
  units: UnitRow[] = [];
  filtered: UnitRow[] = [];
  selected: UnitRow | null = null;
  loading = false;
  loadError = '';
  search = '';

  presets = [
    { label: 'All units', value: 'all' },
    { label: 'Owner occupied', value: 'owner' },
    { label: 'Tenant occupied', value: 'tenant' },
  ];
  preset = 'all';

  constructor(
    private supabase: SupabaseService,
    private messages: MessageService
  ) {}

  async ngOnInit() {
    await this.load();
  }

  onSearchInput(value: string) {
    this.search = (value || '').replace(/\D/g, '');
    this.applyFilters();
  }

  onPreset() {
    this.applyFilters();
  }

  onRowSelect(event: { data?: UnitRow | UnitRow[] }) {
    const row = event?.data;
    if (!row) return;
    this.selected = Array.isArray(row) ? row[0] ?? null : row;
  }

  async load() {
    this.loading = true;
    this.loadError = '';

        const { data: unitRows, error } = await this.supabase.client
      .from('units')
      .select('unit, owner_occupied, bdrms, num, sqft, street')
      .lt('unit', 600)
      .order('unit', { ascending: true });

    if (error) {
      this.loading = false;
      this.loadError = error.message;
      this.units = [];
      this.filtered = [];
      this.messages.add({ severity: 'error', summary: 'Units load failed', detail: error.message });
      return;
    }

    const { data: links } = await this.supabase.client
      .from('unit_owners')
      .select('unit, owner_id');

    const { data: owners } = await this.supabase.client
      .from('owners')
      .select('owner_id, firstname, lastname, cell, email, street, csz, data_confirmed, uuid');

    const ownerById = new Map<number, UnitOwnerInfo>();
    for (const o of owners ?? []) {
      ownerById.set(o.owner_id, o as UnitOwnerInfo);
    }
    const ownerByUnit = new Map<number, UnitOwnerInfo>();
    for (const link of links ?? []) {
      const owner = ownerById.get(link.owner_id);
      if (owner) ownerByUnit.set(link.unit, owner);
    }

    this.units = (unitRows ?? []).map((u: any) => {
      const owner = ownerByUnit.get(u.unit) ?? null;
      return {
        unit: u.unit,
        street: u.street ?? null,
        bdrms: u.bdrms ?? null,
        sqft: u.sqft ?? null,
        num: u.num ?? null,
        owner_occupied: !!u.owner_occupied,
        owner,
        ownerName: owner ? `${owner.firstname ?? ''} ${owner.lastname ?? ''}`.trim() : '',
      } as UnitRow;
    });

    this.applyFilters();
    if (this.selected) {
      this.selected = this.units.find((u) => u.unit === this.selected!.unit) ?? null;
    }
    this.loading = false;
  }

  applyFilters() {
    const q = this.search.trim();
    this.filtered = this.units.filter((u) => {
      if (this.preset === 'owner' && !u.owner_occupied) return false;
      if (this.preset === 'tenant' && u.owner_occupied) return false;
      if (!q) return true;
      return String(u.unit).includes(q);
    });
  }
}