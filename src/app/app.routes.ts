import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AdminShellComponent } from './layout/admin-shell/admin-shell.component';
import { OwnersComponent } from './pages/owners/owners.component';
import { UnitsComponent } from './pages/units/units.component';
import { ParkingComponent } from './pages/parking/parking.component';
import { ElectionsComponent } from './pages/elections/elections.component';
import { MapsComponent } from './pages/maps/maps.component';
import { HelpComponent } from './pages/help/help.component';
import { authGuard } from './auth.guard';
import { adminGuard } from './admin.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: AdminShellComponent,
    canActivate: [authGuard, adminGuard],
    children: [
      { path: 'owners', component: OwnersComponent },
      { path: 'units', component: UnitsComponent },
      { path: 'parking', component: ParkingComponent },
      { path: 'maps', component: MapsComponent },
      { path: 'elections', component: ElectionsComponent },
      { path: 'help', component: HelpComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];