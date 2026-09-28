import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../services/supabase.service';
import { ParkingRow } from './parking-row';
import { ParkingPanelComponent } from './parking-panel/parking-panel.component';

@Component({
  selector: 'app-parking',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    SelectModule,
    ToastModule,
    ParkingPanelComponent,
  ],
  templateUrl: './parking.component.html',
  styleUrl: './parking.component.scss',
  providers: [MessageService],
})
export class ParkingComponent implements OnInit {
  spaces: ParkingRow[] = [];
  filtered: ParkingRow[] = [];
  selected: ParkingRow | null = null;
  loading = false;
  loadError = '';
  search = '';

  presets = [
    { label: 'All spaces', value: 'all' },
    { label: 'Unit spaces', value: 'unit' },
    { label: 'Registered (600+)', value: 'registered' },
    { label: 'No vehicle', value: 'empty' },
  ];
  preset = 'all';

  constructor(
    private supabase: SupabaseService,
    private messages: MessageService
  ) {}

  async ngOnInit() {
    await this.load();
  }

  onSearch() {
    this.applyFilters();
  }

  onPreset() {
    this.applyFilters();
  }

  onRowSelect(event: { data?: ParkingRow | ParkingRow[] }) {
    const row = event?.data;
    if (!row) return;
    this.selected = Array.isArray(row) ? row[0] ?? null : row;
  }

  async load() {
    this.loading = true;
    this.loadError = '';
    const { data, error } = await this.supabase.client
      .from('parking')
      .select('space, unit, name, tag, make, model, color, data_confirmed')
      .order('space', { ascending: true });
    this.loading = false;
    if (error) {
      this.loadError = error.message;
      this.spaces = [];
      this.filtered = [];
      this.messages.add({ severity: 'error', summary: 'Parking load failed', detail: error.message });
      return;
    }
    this.spaces = (data ?? []) as ParkingRow[];
    this.applyFilters();
    if (this.selected) {
      this.selected = this.spaces.find((s) => s.space === this.selected!.space) ?? null;
    }
  }

  applyFilters() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.spaces.filter((row) => {
      if (this.preset === 'unit' && Number(row.space) >= 600) return false;
      if (this.preset === 'registered' && Number(row.space) < 600) return false;
      if (this.preset === 'empty' && (row.tag || row.make || row.model)) return false;
      if (!q) return true;
      return (
        String(row.space).includes(q) ||
        String(row.unit ?? '').includes(q) ||
        (row.name ?? '').toLowerCase().includes(q) ||
        (row.tag ?? '').toLowerCase().includes(q) ||
        (row.make ?? '').toLowerCase().includes(q) ||
        (row.model ?? '').toLowerCase().includes(q) ||
        (row.color ?? '').toLowerCase().includes(q)
      );
    });
  }
}
