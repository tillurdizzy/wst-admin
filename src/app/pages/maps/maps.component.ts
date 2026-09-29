import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';

@Component({
  selector: 'app-maps',
  standalone: true,
  imports: [CommonModule, ButtonModule, DialogModule, NgxExtendedPdfViewerModule],
  templateUrl: './maps.component.html',
  styleUrl: './maps.component.scss',
})
export class MapsComponent {
  pdfVisible = false;
  pdfTitle = '';
  pdfSrc = '';

  openPdf(kind: 'units' | 'hotwater' | 'cameras') {
    if (kind === 'units') {
      this.pdfTitle = 'Units';
      this.pdfSrc = '/maps-units.pdf';
    } else if (kind === 'hotwater') {
      this.pdfTitle = 'Hot Water';
      this.pdfSrc = '/maps-hot-water.pdf';
    } else {
      this.pdfTitle = 'Security Cameras';
      this.pdfSrc = '/maps-security-cameras.pdf';
    }
    this.pdfVisible = true;
  }
}