import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';

export interface FlightRecord {
  flightId: number;
  flightNumber: string;
  aircraft: string;
  origin: string;
  destination: string;
  scheduledDeparture: string;
  actualDeparture: string | null;
  scheduledArrival: string;
  actualArrival: string | null;
  gate: string;
  runway: string;
  passengerNumber: number;
  delayMinutes: number;
  crewPilots: number;
  crewFlightAttendants: number;
  baggageConveyorBelt: string;
  baggageTotalChecked: number;
}

export interface CopilotAlert {
  id: number;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  actionLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class FlightsService {
  private readonly http = inject(HttpClient);
  private readonly flightsApiUrl = 'http://localhost:5167/flights';
  private readonly flightsHubUrl = 'http://localhost:5167/hubs/flights';
  private readonly flightsUpdatesSubject = new Subject<FlightRecord[]>();

  private hubConnection: signalR.HubConnection | null = null;

  private readonly copilotAlerts: CopilotAlert[] = [
    {
      id: 1,
      tone: 'critical',
      title: 'Cascading Turnaround Delay',
      message:
        'Aircraft EI-EBA arriving as RYR441 is 150 mins delayed. Departure RYR442 cannot depart at 17:30Z.',
      actionLabel: 'Auto-Reschedule RYR442'
    },
    {
      id: 2,
      tone: 'warning',
      title: 'Baggage System Conflict',
      message:
        'LH1654 and BA882 are both arriving delayed between 12:20Z and 12:30Z and are both assigned to Carousel 1. Total bags: 215.',
      actionLabel: 'Reassign BA882 to Carousel 2'
    },
    {
      id: 3,
      tone: 'info',
      title: 'Crew Requirement met',
      message: 'Standby crew for LH1655 verified and ready at Gate 2.'
    }
  ];

  getFlights(): Observable<FlightRecord[]> {
    return this.http.get<FlightRecord[]>(this.flightsApiUrl);
  }

  getFlightsUpdates(): Observable<FlightRecord[]> {
    return this.flightsUpdatesSubject.asObservable();
  }

  startFlightsUpdates(): void {
    if (this.hubConnection) {
      return;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.flightsHubUrl, { withCredentials: true })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('FlightsUpdated', (flights: FlightRecord[]) => {
      this.flightsUpdatesSubject.next(flights);
    });

    void this.hubConnection.start().catch((error: unknown) => {
      console.error('SignalR flights hub connection failed', error);
      this.hubConnection = null;
    });
  }

  stopFlightsUpdates(): void {
    if (!this.hubConnection) {
      return;
    }

    const connection = this.hubConnection;
    this.hubConnection = null;
    void connection.stop();
  }

  getCopilotAlerts(): CopilotAlert[] {
    return this.copilotAlerts;
  }
}