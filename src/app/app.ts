import { Component, inject } from '@angular/core';
import { CopilotAlert, FlightRecord, FlightsService } from './services/flights.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly flightsService = inject(FlightsService);

  protected readonly title = 'Disruption Copilot';
  protected flights: FlightRecord[] = [];
  protected readonly alerts = this.flightsService.getCopilotAlerts();

  protected totalFlights = 0;
  protected delayedFlights = 0;
  protected criticalFlights = 0;
  protected totalPassengers = 0;

  constructor() {
    this.flightsService.getFlights().subscribe((flights) => {
      this.flights = flights;
      this.updateMetrics();
    });
  }

  private updateMetrics(): void {
    this.totalFlights = this.flights.length;
    this.delayedFlights = this.flights.filter((flight) => flight.delayMinutes > 0).length;
    this.criticalFlights = this.flights.filter((flight) => flight.delayMinutes > 15).length;
    this.totalPassengers = this.flights.reduce((sum, flight) => sum + flight.passengerNumber, 0);
  }

  protected formatUtcLabel(isoValue: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    })
      .format(new Date(isoValue))
      .replace(',', '');
  }

  protected getStatusLabel(delayMinutes: number): string {
    if (delayMinutes === 0) {
      return 'On Time';
    }

    if (delayMinutes <= 15) {
      return `+${delayMinutes} mins`;
    }

    return `+${delayMinutes} mins delayed`;
  }

  protected getStatusClass(delayMinutes: number): string {
    if (delayMinutes === 0) {
      return 'status-pill status-pill--green';
    }

    if (delayMinutes <= 15) {
      return 'status-pill status-pill--yellow';
    }

    return 'status-pill status-pill--red';
  }

  protected getAlertCardClass(alert: CopilotAlert): string {
    return `alert-card alert-card--${alert.tone}`;
  }

  protected getAlertIconLabel(alert: CopilotAlert): string {
    if (alert.tone === 'critical') {
      return 'Critical alert';
    }

    if (alert.tone === 'warning') {
      return 'Warning alert';
    }

    return 'Information alert';
  }

  protected trackByFlightId(_: number, flight: FlightRecord): number {
    return flight.flightId;
  }

  protected trackByAlertId(_: number, alert: CopilotAlert): number {
    return alert.id;
  }
}
