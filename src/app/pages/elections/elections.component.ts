import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../services/supabase.service';

export interface ElectionRow {
  ownerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  unit: number | null;
  units: string;
  electionId: number | null;
  created_at: string | null;
  notes: string | null;
  vote: string | null;
  proxy: string | null;
}

@Component({
  selector: 'app-elections',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    InputTextModule,
    SelectModule,
    ButtonModule,
    TextareaModule,
    ToastModule,
  ],
  templateUrl: './elections.component.html',
  styleUrl: './elections.component.scss',
  providers: [MessageService],
})
export class ElectionsComponent implements OnInit {
  rows: ElectionRow[] = [];
  filtered: ElectionRow[] = [];
  selected: ElectionRow | null = null;
  loading = false;
  saving = false;
  loadError = '';
  message = '';
  error = '';
  search = '';

  vote = '';
  proxy = '';
  notes = '';

  choices = [
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' },
    { label: 'Maybe', value: 'Maybe' },
  ];

  presets = [
    { label: 'All owners', value: 'all' },
    { label: 'No ballot yet', value: 'none' },
    { label: 'Sort by vote', value: 'sortvote' },
    { label: 'Sort by proxy', value: 'sortproxy' },
    { label: 'Sort by unit', value: 'sortunit' },
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

  onRowSelect(event: { data?: ElectionRow | ElectionRow[] }) {
    const row = event?.data;
    if (!row) return;
    this.selected = Array.isArray(row) ? row[0] ?? null : row;
    this.hydrate();
  }

  private hydrate() {
    this.vote = this.selected?.vote ?? '';
    this.proxy = this.selected?.proxy ?? '';
    this.notes = this.selected?.notes ?? '';
    this.message = '';
    this.error = '';
  }

  async load() {
    this.loading = true;
    this.loadError = '';
    const [ownersRes, linksRes, ballotsRes] = await Promise.all([
      this.supabase.client.from('owners').select('owner_id, firstname, lastname, email, cell'),
      this.supabase.client.from('unit_owners').select('unit, owner_id'),
      this.supabase.client.from('election').select('id, created_at, name, unit, notes, vote, proxy, owner_id'),
    ]);
    this.loading = false;
    if (ownersRes.error) {
      this.loadError = ownersRes.error.message;
      this.rows = [];
      this.filtered = [];
      return;
    }

    const unitsByOwner = new Map<string, number[]>();
    for (const link of linksRes.data ?? []) {
      const list = unitsByOwner.get(link.owner_id) ?? [];
      list.push(link.unit);
      unitsByOwner.set(link.owner_id, list);
    }

    const byOwner = new Map<string, any>();
    const byUnit = new Map<number, any>();
    for (const ballot of ballotsRes.data ?? []) {
      if (ballot.owner_id && !byOwner.has(ballot.owner_id)) byOwner.set(ballot.owner_id, ballot);
      if (ballot.unit != null && !byUnit.has(ballot.unit)) byUnit.set(ballot.unit, ballot);
    }

    this.rows = (ownersRes.data ?? []).map((owner: any) => {
      const units = (unitsByOwner.get(owner.owner_id) ?? []).sort((a: number, b: number) => a - b);
      const ballot = byOwner.get(owner.owner_id) ?? (units.length ? byUnit.get(units[0]) : undefined);
      return {
        ownerId: owner.owner_id,
        name: [owner.firstname, owner.lastname].filter(Boolean).join(' ').trim(),
        email: owner.email ?? null,
        phone: owner.cell ?? null,
        unit: units[0] ?? ballot?.unit ?? null,
        units: units.join(', '),
        electionId: ballot?.id ?? null,
        created_at: ballot?.created_at ?? null,
        notes: ballot?.notes ?? null,
        vote: ballot?.vote ?? null,
        proxy: ballot?.proxy ?? null,
      } as ElectionRow;
    });

    this.applyFilters();
    if (this.selected) {
      this.selected = this.rows.find((r) => r.ownerId === this.selected!.ownerId) ?? null;
      if (this.selected) this.hydrate();
    }
  }

  applyFilters() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.rows.filter((row) => {
      if (this.preset === 'none' && row.electionId) return false;
      if (!q) return true;
      return (
        row.units.includes(q) ||
        row.name.toLowerCase().includes(q) ||
        (row.vote ?? '').toLowerCase().includes(q) ||
        (row.proxy ?? '').toLowerCase().includes(q) ||
        (row.notes ?? '').toLowerCase().includes(q)
      );
    });
    const rank = (value: string | null) => {
      const v = (value ?? '').toLowerCase();
      if (v === 'yes') return 0;
      if (v === 'maybe') return 1;
      if (v === 'no') return 2;
      return 3;
    };
    if (this.preset === 'sortvote') {
      this.filtered.sort((a, b) => rank(a.vote) - rank(b.vote) || (a.unit ?? 9999) - (b.unit ?? 9999));
    } else if (this.preset === 'sortproxy') {
      this.filtered.sort((a, b) => rank(a.proxy) - rank(b.proxy) || (a.unit ?? 9999) - (b.unit ?? 9999));
    } else if (this.preset === 'sortunit') {
      this.filtered.sort((a, b) => (a.unit ?? 9999) - (b.unit ?? 9999));
    } else {
      this.filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
  }

  async save() {
    if (!this.selected?.electionId) {
      this.error = 'No ballot row for this owner. Run the seed script.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.message = '';
    const { error } = await this.supabase.client
      .from('election')
      .update({
        vote: this.vote || null,
        proxy: this.proxy || null,
        notes: this.notes.trim() || null,
        owner_id: this.selected.ownerId,
        unit: this.selected.unit,
      })
      .eq('id', this.selected.electionId);
    this.saving = false;
    if (error) {
      this.error = error.message;
      return;
    }
    this.message = 'Saved.';
    await this.load();
  }
}